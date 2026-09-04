import { createHash, randomUUID } from "node:crypto"

import {
  type AnalysisJobRepository,
  AppError,
  type CreateAnalysisJobCommand,
  type UpdateAnalysisJobCommand,
  type UpdateAnalysisWorkflowCommand,
} from "@shadowproducer/application"
import type { AnalysisJob, AnalysisWorkflow } from "@shadowproducer/contracts"
import { type Kysely, type Selectable, sql, type Transaction } from "kysely"

import type { Database } from "./database"
import { resolveProjectAccess } from "./postgres-access"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>
type AnalysisJobRow = Selectable<Database["analysis_jobs"]>
type AnalysisWorkflowRow = Selectable<Database["analysis_workflows"]>

function requestHash(value: object) {
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "idempotencyKey")
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toNullableIso(value: Date | string | null) {
  return value ? toIso(value) : null
}

function mapJob(row: AnalysisJobRow): AnalysisJob {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    tool: row.tool,
    triggerKind: row.trigger_kind,
    approvalPolicy: row.approval_policy,
    approvalThreshold: row.approval_threshold,
    status: row.status,
    triggeredByAccountId: row.triggered_by_account_id,
    sourceDocumentId: row.source_document_id,
    sourceDocumentTitle: row.source_document_title,
    sourceVersionId: row.source_version_id,
    sourceVersionMeta: row.source_version_meta,
    sourceRevision: row.source_revision,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    candidateCount: row.candidate_count,
    failureStage: row.failure_stage,
    lastError: row.last_error,
    revision: row.revision,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    processedAt: toNullableIso(row.processed_at),
    completedAt: toNullableIso(row.completed_at),
    cancelledAt: toNullableIso(row.cancelled_at),
  }
}

function mapWorkflow(row: AnalysisWorkflowRow): AnalysisWorkflow {
  return {
    projectId: row.project_id,
    enabled: row.enabled,
    sourceDocumentId: row.source_document_id,
    triggerKind: row.trigger_kind,
    approvalPolicy: row.approval_policy,
    approvalThreshold: row.approval_threshold,
    configuredByAccountId: row.configured_by_account_id,
    revision: row.revision,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export class PostgresAnalysisJobRepository implements AnalysisJobRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getProjectAccess(actorId: string, projectId: string) {
    return resolveProjectAccess(this.database, actorId, projectId)
  }

  async listJobs(projectId: string) {
    const rows = await this.database
      .selectFrom("analysis_jobs")
      .selectAll()
      .where("project_id", "=", projectId)
      .orderBy("created_at", "desc")
      .execute()
    return rows.map(mapJob)
  }

  async getWorkflow(projectId: string) {
    const row = await this.database
      .selectFrom("analysis_workflows")
      .selectAll()
      .where("project_id", "=", projectId)
      .executeTakeFirst()
    return row ? mapWorkflow(row) : null
  }

  async updateWorkflow(command: UpdateAnalysisWorkflowCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `analysis.workflow.update:${command.projectId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<AnalysisWorkflow>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { workflow: replay, replayed: true }

      const row =
        command.expectedRevision === 0
          ? await transaction
              .insertInto("analysis_workflows")
              .values({
                project_id: command.projectId,
                enabled: command.enabled,
                source_document_id: command.sourceDocumentId,
                trigger_kind: "script_version_updated",
                approval_policy: command.approvalPolicy,
                approval_threshold: command.approvalThreshold,
                configured_by_account_id: command.actorId,
              })
              .onConflict((conflict) => conflict.column("project_id").doNothing())
              .returningAll()
              .executeTakeFirst()
          : await transaction
              .updateTable("analysis_workflows")
              .set((expression) => ({
                enabled: command.enabled,
                source_document_id: command.sourceDocumentId,
                approval_policy: command.approvalPolicy,
                approval_threshold: command.approvalThreshold,
                configured_by_account_id: command.actorId,
                revision: expression("revision", "+", 1),
                updated_at: new Date(),
              }))
              .where("project_id", "=", command.projectId)
              .where("revision", "=", command.expectedRevision)
              .returningAll()
              .executeTakeFirst()
      if (!row) return { kind: "conflict" as const }

      const workflow = mapWorkflow(row)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        workflow,
      )
      await this.writeAudit(
        transaction,
        command,
        "analysis.workflow.updated",
        command.projectId,
        {
          enabled: workflow.enabled,
          sourceDocumentId: workflow.sourceDocumentId,
          triggerKind: workflow.triggerKind,
          approvalPolicy: workflow.approvalPolicy,
          revision: workflow.revision,
        },
      )
      return { workflow, replayed: false }
    })
  }

  async createJob(command: CreateAnalysisJobCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `analysis.script_breakdown.create:${command.projectId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<AnalysisJob>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { job: replay, replayed: true }

      const row = await transaction
        .insertInto("analysis_jobs")
        .values({
          id: randomUUID(),
          project_id: command.projectId,
          kind: "script_breakdown",
          tool: "deterministic_rules_v1",
          trigger_kind: "manual",
          approval_policy: "manual_confirmation",
          approval_threshold: 90,
          status: "queued",
          triggered_by_account_id: command.actorId,
          source_document_id: command.documentId,
          source_document_title: command.sourceDocumentTitle,
          source_version_id: command.versionId,
          source_version_meta: command.sourceVersionMeta,
          source_revision: command.sourceRevision,
          source_content: command.sourceContent,
          available_at: new Date(),
          locked_by: null,
          lease_expires_at: null,
          failure_stage: null,
          last_error: null,
          processed_at: null,
          completed_at: null,
          cancelled_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const job = mapJob(row)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        job,
      )
      await this.writeAudit(transaction, command, "analysis.job.created", job.id, {
        kind: job.kind,
        tool: job.tool,
        sourceDocumentId: job.sourceDocumentId,
        sourceVersionId: job.sourceVersionId,
        sourceRevision: job.sourceRevision,
      })
      return { job, replayed: false }
    })
  }

  async retryJob(command: UpdateAnalysisJobCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `analysis.job.retry:${command.jobId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<AnalysisJob>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { job: replay, replayed: true }

      const row = await transaction
        .updateTable("analysis_jobs")
        .set({
          status: "queued",
          max_attempts: sql<number>`attempts + 1`,
          available_at: sql<Date>`now()`,
          locked_by: null,
          lease_expires_at: null,
          failure_stage: null,
          last_error: null,
          candidate_count: 0,
          processed_at: null,
          completed_at: null,
          cancelled_at: null,
          revision: sql<number>`revision + 1`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", command.jobId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .where("status", "=", "failed")
        .returningAll()
        .executeTakeFirst()
      if (!row) return this.mutationFailure(transaction, command)

      const job = mapJob(row)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        job,
      )
      await this.writeAudit(transaction, command, "analysis.job.retried", job.id, {
        expectedRevision: command.expectedRevision,
      })
      return { job, replayed: false }
    })
  }

  async cancelJob(command: UpdateAnalysisJobCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `analysis.job.cancel:${command.jobId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<AnalysisJob>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { job: replay, replayed: true }

      const row = await transaction
        .updateTable("analysis_jobs")
        .set({
          status: "cancelled",
          locked_by: null,
          lease_expires_at: null,
          cancelled_at: sql<Date>`now()`,
          revision: sql<number>`revision + 1`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", command.jobId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .where("status", "in", ["queued", "processing"])
        .returningAll()
        .executeTakeFirst()
      if (!row) return this.mutationFailure(transaction, command)

      const job = mapJob(row)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        job,
      )
      await this.writeAudit(transaction, command, "analysis.job.cancelled", job.id, {
        expectedRevision: command.expectedRevision,
      })
      return { job, replayed: false }
    })
  }

  private async mutationFailure(
    database: DatabaseExecutor,
    command: UpdateAnalysisJobCommand,
  ) {
    const row = await database
      .selectFrom("analysis_jobs")
      .select(["revision", "status"])
      .where("id", "=", command.jobId)
      .where("project_id", "=", command.projectId)
      .executeTakeFirst()
    if (!row) return { kind: "not_found" as const }
    return row.revision === command.expectedRevision
      ? { kind: "invalid_state" as const }
      : { kind: "conflict" as const }
  }

  private async getReceipt<T>(
    database: Transaction<Database>,
    actorId: string,
    domain: string,
    key: string,
    hash: string,
  ) {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${actorId}:${domain}:${key}`}, 0))`.execute(
      database,
    )
    const row = await database
      .selectFrom("command_receipts")
      .select(["response", "request_hash"])
      .where("actor_account_id", "=", actorId)
      .where("domain", "=", domain)
      .where("idempotency_key", "=", key)
      .executeTakeFirst()
    if (row?.request_hash && row.request_hash !== hash) {
      throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
    }
    return (row?.response as T | undefined) ?? null
  }

  private async writeReceipt(
    database: DatabaseExecutor,
    actorId: string,
    domain: string,
    key: string,
    hash: string,
    response: AnalysisJob | AnalysisWorkflow,
  ) {
    await database
      .insertInto("command_receipts")
      .values({
        actor_account_id: actorId,
        domain,
        idempotency_key: key,
        request_hash: hash,
        response: JSON.stringify(response),
      })
      .execute()
  }

  private async writeAudit(
    database: DatabaseExecutor,
    command: { actorId: string; projectId: string },
    action: string,
    subjectId: string,
    metadata: Record<string, unknown>,
  ) {
    const project = await database
      .selectFrom("projects")
      .select("team_id")
      .where("id", "=", command.projectId)
      .executeTakeFirstOrThrow()
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: command.actorId,
        team_id: project.team_id,
        project_id: command.projectId,
        action,
        subject_id: subjectId,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }
}
