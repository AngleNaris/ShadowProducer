import { AnalysisService, AppError, ScriptService } from "@shadowproducer/application"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { claimAnalysisJob, processAnalysisJob } from "./analysis-worker"
import { createDatabase, defaultDatabaseUrl } from "./database"
import { PostgresAnalysisJobRepository } from "./postgres-analysis-job-repository"
import { PostgresScriptRepository } from "./postgres-script-repository"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 4 })
const database = createDatabase(databaseUrl, pool)
const repository = new PostgresAnalysisJobRepository(database)
const service = new AnalysisService(
  repository,
  new ScriptService(new PostgresScriptRepository(database)),
)
const runId = `pg-analysis-${process.pid}-${Date.now().toString(36)}`
const teamId = `${runId}-team`
const projectId = `${runId}-project`
const documentId = `${runId}-document`
const writerId = `${runId}-writer`
const viewerId = `${runId}-viewer`
const sourceContent = `12. 外景 · 旧站台 · 夜

顾遥拖着深红色硬壳行李箱，从站台尽头走出。

顾遥
（低声）
这次，不会再错过了。

行李箱轮子碾过积水。`

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values([
      { id: writerId, display_name: "Analysis Writer", email: null },
      { id: viewerId, display_name: "Analysis Viewer", email: null },
    ])
    .execute()
  await database.insertInto("teams").values({ id: teamId, name: runId }).execute()
  await database
    .insertInto("team_memberships")
    .values([
      { team_id: teamId, account_id: writerId, role: "owner" },
      { team_id: teamId, account_id: viewerId, role: "member" },
    ])
    .execute()
  await database
    .insertInto("projects")
    .values({ id: projectId, team_id: teamId, name: "Analysis project" })
    .execute()
  await database
    .insertInto("project_memberships")
    .values([
      { project_id: projectId, account_id: writerId, role: "producer" },
      { project_id: projectId, account_id: viewerId, role: "viewer" },
    ])
    .execute()
  await database
    .insertInto("script_documents")
    .values({
      id: documentId,
      project_id: projectId,
      title: "Analysis script",
      document_type: "script",
      current_version_id: "v1",
      is_default: true,
    })
    .execute()
  await database
    .insertInto("script_versions")
    .values({
      project_id: projectId,
      id: "v1",
      document_id: documentId,
      meta: "frozen source",
      badge: "当前",
      content: sourceContent,
      revision: 1,
      is_current: true,
    })
    .execute()
})

afterAll(async () => {
  await database.deleteFrom("teams").where("id", "=", teamId).execute()
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "in", [writerId, viewerId])
    .where("domain", "like", "analysis.%")
    .execute()
  await database.deleteFrom("accounts").where("id", "in", [writerId, viewerId]).execute()
  await database.destroy()
})

describe("Postgres analysis jobs", () => {
  it("persists project workflow settings with CAS and read-only access", async () => {
    expect(await service.getWorkflow(writerId, projectId)).toMatchObject({
      projectId,
      enabled: false,
      sourceDocumentId: null,
      revision: 0,
    })
    const body = {
      enabled: true,
      sourceDocumentId: documentId,
      approvalPolicy: "manual_confirmation" as const,
      approvalThreshold: 90,
      expectedRevision: 0,
      idempotencyKey: `${runId}-workflow-create`,
    }
    const created = await service.updateWorkflow(writerId, projectId, body)
    const replay = await service.updateWorkflow(writerId, projectId, body)
    expect(created).toMatchObject({
      workflow: {
        enabled: true,
        sourceDocumentId: documentId,
        triggerKind: "script_version_updated",
        approvalPolicy: "manual_confirmation",
        approvalThreshold: 90,
        revision: 1,
      },
      replayed: false,
    })
    expect(replay).toEqual({ workflow: created.workflow, replayed: true })
    expect(await service.getWorkflow(viewerId, projectId)).toEqual(created.workflow)

    await expect(
      service.updateWorkflow(writerId, projectId, {
        ...body,
        enabled: false,
        idempotencyKey: `${runId}-workflow-stale`,
      }),
    ).rejects.toMatchObject({
      code: "ANALYSIS_WORKFLOW_CONFLICT",
      statusCode: 409,
    })
    await expect(
      service.updateWorkflow(viewerId, projectId, {
        ...body,
        expectedRevision: 1,
        idempotencyKey: `${runId}-workflow-viewer`,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED", statusCode: 403 })

    const disabled = await service.updateWorkflow(writerId, projectId, {
      enabled: false,
      sourceDocumentId: null,
      approvalPolicy: "manual_confirmation",
      approvalThreshold: 90,
      expectedRevision: 1,
      idempotencyKey: `${runId}-workflow-disable`,
    })
    expect(disabled.workflow).toMatchObject({
      enabled: false,
      sourceDocumentId: null,
      revision: 2,
    })
  })

  it("freezes input, processes once, and completes after candidate review", async () => {
    const body = {
      documentId,
      versionId: "v1",
      sourceRevision: 1,
      idempotencyKey: `${runId}-create-main`,
    }
    const created = await service.createScriptBreakdown(writerId, projectId, body)
    const replay = await service.createScriptBreakdown(writerId, projectId, body)
    expect(replay).toEqual({ job: created.job, replayed: true })

    await database
      .updateTable("script_versions")
      .set({ content: "已修改且不含任何候选", revision: 2 })
      .where("project_id", "=", projectId)
      .where("id", "=", "v1")
      .execute()
    const claimed = await claimAnalysisJob(database, `${runId}-worker`, created.job.id)
    expect(claimed).not.toBeNull()
    if (!claimed) throw new Error("analysis job was not claimed")
    await processAnalysisJob(database, claimed, new AbortController().signal)

    const [job, candidates] = await Promise.all([
      database
        .selectFrom("analysis_jobs")
        .selectAll()
        .where("id", "=", created.job.id)
        .executeTakeFirstOrThrow(),
      database
        .selectFrom("breakdown_items")
        .select(["id", "item", "excerpt"])
        .where("analysis_job_id", "=", created.job.id)
        .orderBy("source_location", "asc")
        .execute(),
    ])
    expect(job).toMatchObject({
      status: "awaiting_confirmation",
      candidate_count: 5,
      attempts: 1,
    })
    expect(candidates.map(({ item }) => item)).toEqual(
      expect.arrayContaining(["旧站台", "深红色硬壳行李箱", "顾遥", "行李箱", "积水"]),
    )
    expect(candidates.some(({ excerpt }) => excerpt.includes("深红色硬壳行李箱"))).toBe(
      true,
    )

    await database
      .updateTable("breakdown_items")
      .set({ state: "已确认" })
      .where("analysis_job_id", "=", created.job.id)
      .execute()
    const completed = await service.listJobs(writerId, projectId)
    expect(completed.items.find(({ id }) => id === created.job.id)?.status).toBe(
      "completed",
    )
  })

  it("auto confirms candidates at the frozen confidence threshold", async () => {
    const created = await repository.createJob({
      actorId: writerId,
      projectId,
      documentId,
      versionId: "v1",
      sourceRevision: 2,
      sourceDocumentTitle: "Analysis script",
      sourceVersionMeta: "frozen source",
      sourceContent,
      idempotencyKey: `${runId}-threshold-create`,
    })
    await database
      .updateTable("analysis_jobs")
      .set({
        trigger_kind: "script_version_updated",
        approval_policy: "confidence_threshold",
        approval_threshold: 96,
      })
      .where("id", "=", created.job.id)
      .execute()

    const claimed = await claimAnalysisJob(
      database,
      `${runId}-threshold-worker`,
      created.job.id,
    )
    if (!claimed) throw new Error("threshold job was not claimed")
    await processAnalysisJob(database, claimed, new AbortController().signal)

    const [job, candidates] = await Promise.all([
      database
        .selectFrom("analysis_jobs")
        .select(["status", "approval_policy", "approval_threshold", "candidate_count"])
        .where("id", "=", created.job.id)
        .executeTakeFirstOrThrow(),
      database
        .selectFrom("breakdown_items")
        .select(["confidence", "state"])
        .where("analysis_job_id", "=", created.job.id)
        .orderBy("confidence", "desc")
        .execute(),
    ])
    expect(job).toEqual({
      status: "awaiting_confirmation",
      approval_policy: "confidence_threshold",
      approval_threshold: 96,
      candidate_count: 5,
    })
    expect(candidates.some(({ state }) => state === "已确认")).toBe(true)
    expect(candidates.some(({ state }) => state === "待确认")).toBe(true)
    expect(
      candidates.every(({ confidence, state }) =>
        confidence >= 96 ? state === "已确认" : state === "待确认",
      ),
    ).toBe(true)
  })

  it("rejects stale sources and viewer writes", async () => {
    await expect(
      service.createScriptBreakdown(writerId, projectId, {
        documentId,
        versionId: "v1",
        sourceRevision: 1,
        idempotencyKey: `${runId}-stale`,
      }),
    ).rejects.toMatchObject({ code: "ANALYSIS_SOURCE_CONFLICT", statusCode: 409 })
    await expect(
      service.createScriptBreakdown(viewerId, projectId, {
        documentId,
        versionId: "v1",
        sourceRevision: 2,
        idempotencyKey: `${runId}-viewer`,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED", statusCode: 403 })
  })

  it("cancels queued work and keeps retry output unique", async () => {
    const frozen = {
      actorId: writerId,
      projectId,
      documentId,
      versionId: "v1",
      sourceRevision: 2,
      sourceDocumentTitle: "Analysis script",
      sourceVersionMeta: "frozen source",
      sourceContent,
    }
    const cancellable = await repository.createJob({
      ...frozen,
      idempotencyKey: `${runId}-cancel-create`,
    })
    const cancelled = await service.cancelJob({
      actorId: writerId,
      projectId,
      jobId: cancellable.job.id,
      expectedRevision: cancellable.job.revision,
      idempotencyKey: `${runId}-cancel`,
    })
    expect(cancelled.job.status).toBe("cancelled")
    expect(
      await claimAnalysisJob(database, `${runId}-cancel-worker`, cancellable.job.id),
    ).toBeNull()

    const retryable = await repository.createJob({
      ...frozen,
      idempotencyKey: `${runId}-retry-create`,
    })
    await database
      .updateTable("analysis_jobs")
      .set({ status: "failed", attempts: 1, max_attempts: 1, revision: 2 })
      .where("id", "=", retryable.job.id)
      .execute()
    const retried = await service.retryJob({
      actorId: writerId,
      projectId,
      jobId: retryable.job.id,
      expectedRevision: 2,
      idempotencyKey: `${runId}-retry-1`,
    })
    const firstClaim = await claimAnalysisJob(
      database,
      `${runId}-retry-worker-1`,
      retried.job.id,
    )
    if (!firstClaim) throw new Error("retry job was not claimed")
    await processAnalysisJob(database, firstClaim, new AbortController().signal)
    const firstResult = await repository.listJobs(projectId)
    const firstProcessed = firstResult.find(({ id }) => id === retried.job.id)
    if (!firstProcessed) throw new Error("retry job disappeared")

    await database
      .updateTable("analysis_jobs")
      .set({ status: "failed", revision: firstProcessed.revision + 1 })
      .where("id", "=", retried.job.id)
      .execute()
    const secondRetry = await service.retryJob({
      actorId: writerId,
      projectId,
      jobId: retried.job.id,
      expectedRevision: firstProcessed.revision + 1,
      idempotencyKey: `${runId}-retry-2`,
    })
    const secondClaim = await claimAnalysisJob(
      database,
      `${runId}-retry-worker-2`,
      secondRetry.job.id,
    )
    if (!secondClaim) throw new Error("second retry job was not claimed")
    await processAnalysisJob(database, secondClaim, new AbortController().signal)
    const count = await database
      .selectFrom("breakdown_items")
      .select((expression) => expression.fn.countAll<number>().as("value"))
      .where("analysis_job_id", "=", retried.job.id)
      .executeTakeFirstOrThrow()
    expect(Number(count.value)).toBe(5)
  })

  it("rejects an idempotency key reused with another frozen payload", async () => {
    const command = {
      actorId: writerId,
      projectId,
      documentId,
      versionId: "v1",
      sourceRevision: 2,
      sourceDocumentTitle: "Analysis script",
      sourceVersionMeta: "frozen source",
      sourceContent,
      idempotencyKey: `${runId}-key-reuse`,
    }
    await repository.createJob(command)
    await expect(
      repository.createJob({ ...command, sourceContent: `${sourceContent}\n另一份正文` }),
    ).rejects.toBeInstanceOf(AppError)
  })
})
