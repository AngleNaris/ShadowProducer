import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

import { extractScriptBreakdown } from "@shadowproducer/application"
import { type Kysely, sql } from "kysely"

import { createDatabase, type Database, defaultDatabaseUrl } from "./database"

const pollIntervalMs = 1_000
const leaseMinutes = 15

type ClaimedAnalysisJob = {
  id: string
  projectId: string
  teamId: string
  actorId: string
  documentTitle: string
  versionId: string
  content: string
  approvalPolicy: "manual_confirmation" | "confidence_threshold"
  approvalThreshold: number
  attempts: number
  maxAttempts: number
  workerId: string
}

export async function claimAnalysisJob(
  database: Kysely<Database>,
  workerId: string,
  onlyJobId?: string,
) {
  return database.transaction().execute(async (transaction) => {
    let query = transaction
      .selectFrom("analysis_jobs")
      .select("id")
      .where((expression) =>
        expression.or([
          expression("status", "=", "queued"),
          expression.and([
            expression("status", "=", "processing"),
            expression("lease_expires_at", "<", sql<Date>`now()`),
          ]),
        ]),
      )
      .where("available_at", "<=", sql<Date>`now()`)
    if (onlyJobId) query = query.where("id", "=", onlyJobId)
    const candidate = await query
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .executeTakeFirst()
    if (!candidate) return null

    const job = await transaction
      .updateTable("analysis_jobs")
      .set({
        status: "processing",
        attempts: sql<number>`attempts + 1`,
        locked_by: workerId,
        lease_expires_at: sql<Date>`now() + (${leaseMinutes} * interval '1 minute')`,
        failure_stage: null,
        last_error: null,
        revision: sql<number>`revision + 1`,
        updated_at: sql<Date>`now()`,
      })
      .where("id", "=", candidate.id)
      .returning([
        "id",
        "project_id",
        "triggered_by_account_id",
        "source_document_title",
        "source_version_id",
        "source_content",
        "approval_policy",
        "approval_threshold",
        "attempts",
        "max_attempts",
      ])
      .executeTakeFirstOrThrow()
    const project = await transaction
      .selectFrom("projects")
      .select("team_id")
      .where("id", "=", job.project_id)
      .executeTakeFirstOrThrow()
    return {
      id: job.id,
      projectId: job.project_id,
      teamId: project.team_id,
      actorId: job.triggered_by_account_id,
      documentTitle: job.source_document_title,
      versionId: job.source_version_id,
      content: job.source_content,
      approvalPolicy: job.approval_policy,
      approvalThreshold: job.approval_threshold,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      workerId,
    } satisfies ClaimedAnalysisJob
  })
}

export async function processAnalysisJob(
  database: Kysely<Database>,
  job: ClaimedAnalysisJob,
  signal: AbortSignal,
) {
  let failureStage: "extract" | "persist" = "extract"
  try {
    const candidates = extractScriptBreakdown({
      content: job.content,
      documentTitle: job.documentTitle,
      versionId: job.versionId,
    })
    if (signal.aborted) throw new Error("分析任务已中断")

    failureStage = "persist"
    await database.transaction().execute(async (transaction) => {
      const current = await transaction
        .selectFrom("analysis_jobs")
        .select(["status", "locked_by"])
        .where("id", "=", job.id)
        .forUpdate()
        .executeTakeFirst()
      if (current?.status !== "processing" || current.locked_by !== job.workerId) return

      if (candidates.length) {
        await transaction
          .insertInto("breakdown_items")
          .values(
            candidates.map((candidate) => ({
              id: randomUUID(),
              project_id: job.projectId,
              analysis_job_id: job.id,
              category: candidate.category,
              item: candidate.item,
              requirement_type: candidate.requirementType,
              specification: candidate.specification,
              quantity: candidate.quantity,
              preparation: candidate.preparation,
              department: candidate.department,
              agent_assessment: candidate.agentAssessment,
              source_document: candidate.sourceDocument,
              source_version: candidate.sourceVersion,
              source_location: candidate.sourceLocation,
              source: candidate.source,
              excerpt: candidate.excerpt,
              confidence: candidate.confidence,
              state:
                job.approvalPolicy === "confidence_threshold" &&
                candidate.confidence >= job.approvalThreshold
                  ? ("已确认" as const)
                  : ("待确认" as const),
              parent_item_id: null,
              merged_into_item_id: null,
              responsible_account_id: null,
            })),
          )
          .onConflict((conflict) =>
            conflict
              .columns(["analysis_job_id", "category", "item", "source_location"])
              .doNothing(),
          )
          .execute()
      }
      const count = await transaction
        .selectFrom("breakdown_items")
        .select(sql<number>`count(*)::int`.as("value"))
        .where("analysis_job_id", "=", job.id)
        .executeTakeFirstOrThrow()
      const pending = await transaction
        .selectFrom("breakdown_items")
        .select(sql<number>`count(*)::int`.as("value"))
        .where("analysis_job_id", "=", job.id)
        .where("state", "=", "待确认")
        .executeTakeFirstOrThrow()
      const status = pending.value > 0 ? "awaiting_confirmation" : "completed"
      await transaction
        .updateTable("analysis_jobs")
        .set({
          status,
          candidate_count: count.value,
          locked_by: null,
          lease_expires_at: null,
          failure_stage: null,
          last_error: null,
          processed_at: sql<Date>`now()`,
          completed_at: status === "completed" ? sql<Date>`now()` : null,
          revision: sql<number>`revision + 1`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", job.id)
        .execute()
      await transaction
        .insertInto("audit_logs")
        .values({
          actor_account_id: job.actorId,
          team_id: job.teamId,
          project_id: job.projectId,
          action:
            status === "completed"
              ? "analysis.job.completed"
              : "analysis.job.awaiting_confirmation",
          subject_id: job.id,
          metadata: JSON.stringify({
            actorKind: "worker",
            tool: "deterministic_rules_v1",
            candidateCount: count.value,
            autoConfirmedCount: count.value - pending.value,
            pendingCount: pending.value,
            approvalPolicy: job.approvalPolicy,
            approvalThreshold: job.approvalThreshold,
            attempt: job.attempts,
          }),
        })
        .execute()
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : "分析失败"
    const retry = job.attempts < job.maxAttempts && !signal.aborted
    await database.transaction().execute(async (transaction) => {
      const current = await transaction
        .selectFrom("analysis_jobs")
        .select(["status", "locked_by"])
        .where("id", "=", job.id)
        .forUpdate()
        .executeTakeFirst()
      if (current?.status !== "processing" || current.locked_by !== job.workerId) return
      await transaction
        .updateTable("analysis_jobs")
        .set({
          status: retry ? "queued" : "failed",
          available_at: retry
            ? sql<Date>`now() + (${job.attempts * 5} * interval '1 second')`
            : sql<Date>`now()`,
          locked_by: null,
          lease_expires_at: null,
          failure_stage: failureStage,
          last_error: message,
          revision: sql<number>`revision + 1`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", job.id)
        .execute()
      await transaction
        .insertInto("audit_logs")
        .values({
          actor_account_id: job.actorId,
          team_id: job.teamId,
          project_id: job.projectId,
          action: retry ? "analysis.job.retry_scheduled" : "analysis.job.failed",
          subject_id: job.id,
          metadata: JSON.stringify({
            actorKind: "worker",
            failureStage,
            attempt: job.attempts,
            error: message,
          }),
        })
        .execute()
    })
    if (!retry) throw error
  }
}

export async function runAnalysisWorker(database: Kysely<Database>, signal: AbortSignal) {
  const workerId = `analysis-${process.pid}`
  while (!signal.aborted) {
    const job = await claimAnalysisJob(database, workerId)
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      continue
    }
    try {
      await processAnalysisJob(database, job, signal)
      console.info(`[analysis-worker] processed ${job.id}`)
    } catch (error) {
      console.error(`[analysis-worker] failed ${job.id}`, error)
    }
  }
}

async function main() {
  const controller = new AbortController()
  process.once("SIGINT", () => controller.abort())
  process.once("SIGTERM", () => controller.abort())
  const database = createDatabase(process.env.DATABASE_URL ?? defaultDatabaseUrl)
  try {
    console.info(`[analysis-worker] started pid=${process.pid}`)
    await runAnalysisWorker(database, controller.signal)
  } finally {
    await database.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
