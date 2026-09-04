import { AppError, ScriptService } from "@shadowproducer/application"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { PostgresScriptRealtimeStore } from "./postgres-script-realtime-store"
import { PostgresScriptRepository } from "./postgres-script-repository"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 8 })
const database = createDatabase(databaseUrl, pool)
const service = new ScriptService(new PostgresScriptRepository(database))
const runId = `pg-script-${process.pid}-${Date.now().toString(36)}`
const teamId = `${runId}-team`
const writerId = `${runId}-writer`
const viewerId = `${runId}-viewer`

async function seedProject(label: string) {
  const projectId = `${runId}-${label}`
  const documentId = `${projectId}-document`
  await database
    .insertInto("projects")
    .values({ id: projectId, team_id: teamId, name: label })
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
      title: `${label} script`,
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
      meta: "initial",
      badge: "当前",
      content: "initial content",
      revision: 1,
      is_current: true,
    })
    .execute()
  return projectId
}

async function counts(projectId: string) {
  const [versions, receipts, audits] = await Promise.all([
    database
      .selectFrom("script_versions")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("project_id", "=", projectId)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("script_write_receipts")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("project_id", "=", projectId)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("audit_logs")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("project_id", "=", projectId)
      .executeTakeFirstOrThrow(),
  ])
  return {
    versions: Number(versions.count),
    receipts: Number(receipts.count),
    audits: Number(audits.count),
  }
}

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values([
      { id: writerId, display_name: "Postgres Writer", email: null },
      { id: viewerId, display_name: "Postgres Viewer", email: null },
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
})

afterAll(async () => {
  await database.deleteFrom("teams").where("id", "=", teamId).execute()
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "in", [writerId, viewerId])
    .where("domain", "like", "script-%")
    .execute()
  await database.deleteFrom("accounts").where("id", "in", [writerId, viewerId]).execute()
  await database.destroy()
})

describe("Postgres script collaboration", () => {
  it("shares durable collaboration events and expires stale presence", async () => {
    const projectId = await seedProject("realtime")
    const documentId = `${projectId}-document`
    await service.updateVersion({
      actorId: writerId,
      projectId,
      documentId,
      versionId: "v1",
      content: "updated across replicas",
      expectedRevision: 1,
      idempotencyKey: `${projectId}-update`,
    })
    const created = await service.createComment({
      actorId: writerId,
      projectId,
      documentId,
      versionId: "v1",
      parentId: null,
      text: "replicated comment",
      idempotencyKey: `${projectId}-comment`,
    })
    await service.updateComment({
      actorId: writerId,
      projectId,
      documentId,
      commentId: created.comment.id,
      resolved: true,
      expectedRevision: 1,
      idempotencyKey: `${projectId}-resolve`,
    })

    const replicaA = new PostgresScriptRealtimeStore(database)
    const replicaB = new PostgresScriptRealtimeStore(database)
    const events = await replicaA.listEvents(projectId, documentId, 0)
    expect(events.map(({ event, data }) => ({ event, data }))).toEqual([
      {
        event: "script.version.updated",
        data: { versionId: "v1", revision: 2 },
      },
      {
        event: "script.comment.updated",
        data: {
          commentId: created.comment.id,
          versionId: "v1",
          action: "created",
        },
      },
      {
        event: "script.comment.updated",
        data: {
          commentId: created.comment.id,
          versionId: "v1",
          action: "resolved",
        },
      },
    ])
    expect(await replicaB.latestEventId(projectId, documentId)).toBe(events.at(-1)?.id)

    const activeAfter = new Date(Date.now() - 45_000)
    const connectionA = {
      connectionId: `${projectId}-connection-a`,
      projectId,
      documentId,
      accountId: writerId,
      instanceId: "replica-a",
      leaseExpiresAt: new Date(Date.now() + 45_000),
    }
    const connectionB = {
      ...connectionA,
      connectionId: `${projectId}-connection-b`,
      instanceId: "replica-b",
    }
    await replicaA.connectPresence(connectionA)
    await replicaB.connectPresence(connectionB)
    expect(
      await replicaA.updatePresence(
        projectId,
        documentId,
        {
          collaboratorId: writerId,
          versionId: "v1",
          cursorStart: 2,
          cursorEnd: 5,
          editing: true,
          updatedAt: new Date().toISOString(),
        },
        activeAfter,
      ),
    ).toBe(true)
    expect(await replicaB.listPresence(projectId, documentId, activeAfter)).toMatchObject(
      [{ collaboratorId: writerId, cursorStart: 2, cursorEnd: 5, editing: true }],
    )

    await replicaA.disconnectPresence(connectionA, activeAfter)
    expect(await replicaB.listPresence(projectId, documentId, activeAfter)).toMatchObject(
      [{ collaboratorId: writerId, cursorStart: 2, cursorEnd: 5, editing: true }],
    )

    await replicaB.disconnectPresence(connectionB, activeAfter)
    expect(await replicaA.listPresence(projectId, documentId, activeAfter)).toEqual([])

    const expiredConnection = {
      ...connectionA,
      connectionId: `${projectId}-connection-expired`,
    }
    await replicaA.connectPresence(expiredConnection)

    await database
      .updateTable("script_presence_connections")
      .set({ lease_expires_at: new Date(Date.now() - 60_000) })
      .where("connection_id", "=", expiredConnection.connectionId)
      .execute()
    expect(await replicaB.listPresence(projectId, documentId, activeAfter)).toEqual([])
    expect(
      await replicaB.updatePresence(
        projectId,
        documentId,
        {
          collaboratorId: writerId,
          versionId: "v1",
          cursorStart: 5,
          cursorEnd: 5,
          editing: false,
          updatedAt: new Date().toISOString(),
        },
        activeAfter,
      ),
    ).toBe(false)
    await replicaA.disconnectPresence(expiredConnection, activeAfter)
  })

  it("creates and replays one additional document", async () => {
    const projectId = await seedProject("document-create")
    const command = {
      actorId: writerId,
      projectId,
      title: "Second shooting script",
      type: "script" as const,
      idempotencyKey: `${projectId}-document`,
    }

    const first = await service.createDocument(command)
    const replay = await service.createDocument(command)
    const documents = await service.listDocuments(writerId, projectId)
    const workspace = await service.getWorkspace(writerId, projectId, first.document.id)
    const [receiptCount, auditCount] = await Promise.all([
      database
        .selectFrom("command_receipts")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("actor_account_id", "=", writerId)
        .where("domain", "=", `script-document.create:${projectId}`)
        .executeTakeFirstOrThrow(),
      database
        .selectFrom("audit_logs")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("project_id", "=", projectId)
        .where("action", "=", "script.document.created")
        .executeTakeFirstOrThrow(),
    ])

    expect(first.replayed).toBe(false)
    expect(replay).toMatchObject({
      document: { id: first.document.id },
      replayed: true,
    })
    expect(documents.documents).toHaveLength(2)
    expect(documents.documents[0]?.isDefault).toBe(true)
    expect(workspace).toMatchObject({
      document: {
        id: first.document.id,
        currentVersionId: first.document.currentVersionId,
        isDefault: false,
      },
      versions: [{ id: first.document.currentVersionId, isCurrent: true }],
      comments: [],
    })
    expect(Number(receiptCount.count)).toBe(1)
    expect(Number(auditCount.count)).toBe(1)
  })

  it("rejects invalid storyboard content before writing", async () => {
    const projectId = await seedProject("storyboard-content")
    const created = await service.createDocument({
      actorId: writerId,
      projectId,
      title: "Storyboard",
      type: "storyboard",
      idempotencyKey: `${projectId}-document`,
    })
    const before = await counts(projectId)

    await expect(
      service.updateVersion({
        actorId: writerId,
        projectId,
        documentId: created.document.id,
        versionId: created.document.currentVersionId,
        content: "not storyboard json",
        expectedRevision: 1,
        idempotencyKey: `${projectId}-invalid-update`,
      }),
    ).rejects.toMatchObject({ code: "STORYBOARD_CONTENT_INVALID", statusCode: 400 })

    expect(await counts(projectId)).toEqual(before)
    await expect(
      service.getWorkspace(writerId, projectId, created.document.id),
    ).resolves.toMatchObject({
      versions: [{ content: '{"schemaVersion":1,"shots":[]}', revision: 1 }],
    })
  })

  it("isolates versions and comments between documents in one project", async () => {
    const projectId = await seedProject("document-isolation")
    const created = await service.createDocument({
      actorId: writerId,
      projectId,
      title: "Alternate script",
      idempotencyKey: `${projectId}-document`,
    })
    const documentId = created.document.id
    const versionId = created.document.currentVersionId

    await service.updateVersion({
      actorId: writerId,
      projectId,
      documentId,
      versionId,
      content: "alternate content",
      expectedRevision: 1,
      idempotencyKey: `${projectId}-alternate-update`,
    })
    await service.updateVersion({
      actorId: writerId,
      projectId,
      documentId: `${projectId}-document`,
      versionId: "v1",
      content: "default content",
      expectedRevision: 1,
      idempotencyKey: `${projectId}-default-update`,
    })
    await service.createComment({
      actorId: writerId,
      projectId,
      documentId,
      versionId,
      text: "alternate comment",
      idempotencyKey: `${projectId}-alternate-comment`,
    })
    await service.createComment({
      actorId: writerId,
      projectId,
      documentId: `${projectId}-document`,
      versionId: "v1",
      text: "default comment",
      idempotencyKey: `${projectId}-default-comment`,
    })

    const alternate = await service.getWorkspace(writerId, projectId, documentId)
    const fallback = await service.getWorkspace(writerId, projectId)
    expect(alternate.versions).toHaveLength(1)
    expect(alternate.versions[0]).toMatchObject({
      id: versionId,
      content: "alternate content",
      revision: 2,
    })
    expect(alternate.comments.map((comment) => comment.text)).toEqual([
      "alternate comment",
    ])
    expect(fallback.document.id).toBe(`${projectId}-document`)
    expect(fallback.versions).toHaveLength(1)
    expect(fallback.versions[0]).toMatchObject({
      id: "v1",
      content: "default content",
      revision: 2,
    })
    expect(fallback.comments.map((comment) => comment.text)).toEqual(["default comment"])

    await expect(
      service.createComment({
        actorId: writerId,
        projectId,
        documentId,
        versionId: "v1",
        text: "cross-document comment",
        idempotencyKey: `${projectId}-cross-comment`,
      }),
    ).rejects.toMatchObject({ code: "SCRIPT_VERSION_NOT_FOUND", statusCode: 404 })
  })

  it("allows only one concurrent update at the same revision", async () => {
    const projectId = await seedProject("revision-race")
    const results = await Promise.allSettled([
      service.updateVersion({
        actorId: writerId,
        projectId,
        versionId: "v1",
        content: "first edit",
        expectedRevision: 1,
        idempotencyKey: `${projectId}-first`,
      }),
      service.updateVersion({
        actorId: writerId,
        projectId,
        versionId: "v1",
        content: "second edit",
        expectedRevision: 1,
        idempotencyKey: `${projectId}-second`,
      }),
    ])

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1)
    const rejected = results.find(({ status }) => status === "rejected")
    expect(rejected).toMatchObject({
      reason: { code: "VERSION_CONFLICT", statusCode: 409 },
    })
    expect(await counts(projectId)).toEqual({ versions: 1, receipts: 1, audits: 1 })
  })

  it("replays one concurrent update with the same idempotency key", async () => {
    const projectId = await seedProject("update-replay")
    const command = {
      actorId: writerId,
      projectId,
      versionId: "v1",
      content: "one durable edit",
      expectedRevision: 1,
      idempotencyKey: `${projectId}-same`,
    }
    const results = await Promise.all([
      service.updateVersion(command),
      service.updateVersion(command),
    ])

    expect(results.map(({ replayed }) => replayed).sort()).toEqual([false, true])
    expect(results[0].version).toEqual(results[1].version)
    expect(await counts(projectId)).toEqual({ versions: 1, receipts: 1, audits: 1 })
  })

  it("creates one frozen analysis job in the script update transaction", async () => {
    const projectId = await seedProject("auto-analysis")
    const documentId = `${projectId}-document`
    await database
      .insertInto("analysis_workflows")
      .values({
        project_id: projectId,
        enabled: true,
        source_document_id: null,
        trigger_kind: "script_version_updated",
        approval_policy: "confidence_threshold",
        approval_threshold: 96,
        configured_by_account_id: writerId,
      })
      .execute()
    const command = {
      actorId: writerId,
      projectId,
      versionId: "v1",
      content: "INT. STATION - NIGHT\nA red suitcase crosses wet tracks.",
      expectedRevision: 1,
      idempotencyKey: `${projectId}-save`,
    }

    const saved = await service.updateVersion(command)
    const replay = await service.updateVersion(command)
    const jobs = await database
      .selectFrom("analysis_jobs")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute()
    expect(replay.replayed).toBe(true)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      trigger_kind: "script_version_updated",
      source_document_id: documentId,
      approval_policy: "confidence_threshold",
      approval_threshold: 96,
      source_version_id: "v1",
      source_revision: saved.version.revision,
      source_content: command.content,
    })
    expect(["queued", "processing", "awaiting_confirmation"]).toContain(jobs[0]?.status)

    await database
      .updateTable("analysis_workflows")
      .set({ enabled: false })
      .where("project_id", "=", projectId)
      .execute()
    await service.updateVersion({
      ...command,
      content: `${command.content}\nDisabled workflow save.`,
      expectedRevision: saved.version.revision,
      idempotencyKey: `${projectId}-save-disabled`,
    })
    const jobCount = await database
      .selectFrom("analysis_jobs")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("project_id", "=", projectId)
      .executeTakeFirstOrThrow()
    expect(Number(jobCount.count)).toBe(1)
  })

  it("limits automatic analysis to the configured script document", async () => {
    const projectId = await seedProject("auto-analysis-scope")
    const defaultDocumentId = `${projectId}-document`
    const otherDocumentId = `${projectId}-other-document`
    await database
      .insertInto("script_documents")
      .values({
        id: otherDocumentId,
        project_id: projectId,
        title: "Other script",
        document_type: "script",
        current_version_id: "other-v1",
        is_default: false,
      })
      .execute()
    await database
      .insertInto("script_versions")
      .values({
        project_id: projectId,
        id: "other-v1",
        document_id: otherDocumentId,
        meta: "initial",
        badge: "当前",
        content: "other initial content",
        revision: 1,
        is_current: true,
      })
      .execute()
    await database
      .insertInto("analysis_workflows")
      .values({
        project_id: projectId,
        enabled: true,
        source_document_id: defaultDocumentId,
        trigger_kind: "script_version_updated",
        approval_policy: "manual_confirmation",
        approval_threshold: 90,
        configured_by_account_id: writerId,
      })
      .execute()

    await service.updateVersion({
      actorId: writerId,
      projectId,
      documentId: otherDocumentId,
      versionId: "other-v1",
      content: "other document edit",
      expectedRevision: 1,
      idempotencyKey: `${projectId}-other-save`,
    })
    await service.updateVersion({
      actorId: writerId,
      projectId,
      documentId: defaultDocumentId,
      versionId: "v1",
      content: "configured document edit",
      expectedRevision: 1,
      idempotencyKey: `${projectId}-default-save`,
    })
    const jobs = await database
      .selectFrom("analysis_jobs")
      .select(["source_document_id", "source_version_id"])
      .where("project_id", "=", projectId)
      .execute()
    expect(jobs).toEqual([
      { source_document_id: defaultDocumentId, source_version_id: "v1" },
    ])
  })

  it("rejects a workflow source document from another project", async () => {
    const projectId = await seedProject("workflow-project")
    const otherProjectId = await seedProject("workflow-other-project")
    await expect(
      database
        .insertInto("analysis_workflows")
        .values({
          project_id: projectId,
          enabled: true,
          source_document_id: `${otherProjectId}-document`,
          trigger_kind: "script_version_updated",
          approval_policy: "manual_confirmation",
          approval_threshold: 90,
          configured_by_account_id: writerId,
        })
        .execute(),
    ).rejects.toThrow()
  })

  it("creates one immutable version for concurrent retries", async () => {
    const projectId = await seedProject("version-replay")
    const command = {
      actorId: writerId,
      projectId,
      content: "new immutable version",
      meta: "concurrent save",
      expectedVersionId: "v1",
      expectedRevision: 1,
      idempotencyKey: `${projectId}-same`,
    }
    const results = await Promise.all([
      service.createVersion(command),
      service.createVersion(command),
    ])

    expect(results.map(({ replayed }) => replayed).sort()).toEqual([false, true])
    expect(results[0].version).toEqual(results[1].version)
    expect(results[0].version.id).toBe("v2")
    expect(await counts(projectId)).toEqual({ versions: 2, receipts: 1, audits: 1 })
  })

  it("allocates unique project-wide version ids across documents", async () => {
    const projectId = await seedProject("document-version-race")
    const created = await service.createDocument({
      actorId: writerId,
      projectId,
      title: "Alternate script",
      idempotencyKey: `${projectId}-document`,
    })

    const versions = await Promise.all([
      service.createVersion({
        actorId: writerId,
        projectId,
        documentId: `${projectId}-document`,
        content: "default document v2",
        meta: "default save",
        expectedVersionId: "v1",
        expectedRevision: 1,
        idempotencyKey: `${projectId}-default-version`,
      }),
      service.createVersion({
        actorId: writerId,
        projectId,
        documentId: created.document.id,
        content: "alternate document v2",
        meta: "alternate save",
        expectedVersionId: created.document.currentVersionId,
        expectedRevision: 1,
        idempotencyKey: `${projectId}-alternate-version`,
      }),
    ])

    expect(versions.map(({ version }) => version.id).sort()).toEqual(["v3", "v4"])
    expect(new Set(versions.map(({ version }) => version.id)).size).toBe(2)
    expect(await counts(projectId)).toEqual({ versions: 4, receipts: 2, audits: 3 })
  })

  it("returns self-consistent workspace snapshots while versions change", async () => {
    const projectId = await seedProject("workspace-snapshot")

    for (let index = 0; index < 6; index += 1) {
      const current = await service.getWorkspace(writerId, projectId)
      const currentVersion = current.versions.find((version) => version.isCurrent)
      assertWorkspaceSnapshot(current)
      expect(currentVersion).toBeDefined()

      const [created, ...snapshots] = await Promise.all([
        service.createVersion({
          actorId: writerId,
          projectId,
          content: `snapshot version ${index + 2}`,
          meta: `snapshot ${index + 2}`,
          expectedVersionId: current.document.currentVersionId,
          expectedRevision: currentVersion?.revision ?? 0,
          idempotencyKey: `${projectId}-version-${index + 2}`,
        }),
        ...Array.from({ length: 24 }, () => service.getWorkspace(writerId, projectId)),
      ])

      expect(created.version.id).toBe(`v${index + 2}`)
      for (const snapshot of snapshots) assertWorkspaceSnapshot(snapshot)
    }
  })

  it("deduplicates comment creation and state changes under concurrency", async () => {
    const projectId = await seedProject("comment-replay")
    const createCommand = {
      actorId: writerId,
      projectId,
      versionId: "v1",
      text: "one durable comment",
      excerpt: "initial",
      idempotencyKey: `${projectId}-create`,
    }
    const created = await Promise.all([
      service.createComment(createCommand),
      service.createComment(createCommand),
    ])
    expect(created.map(({ replayed }) => replayed).sort()).toEqual([false, true])
    expect(created[0].comment).toEqual(created[1].comment)

    await expect(
      service.createComment({ ...createCommand, text: "another comment" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 })

    const updateCommand = {
      actorId: writerId,
      projectId,
      commentId: created[0].comment.id,
      resolved: true,
      expectedRevision: 1,
      idempotencyKey: `${projectId}-resolve`,
    }
    const updated = await Promise.all([
      service.updateComment(updateCommand),
      service.updateComment(updateCommand),
    ])
    expect(updated.map(({ replayed }) => replayed).sort()).toEqual([false, true])
    expect(updated[0].comment).toEqual(updated[1].comment)
    expect(updated[0].comment).toMatchObject({ resolved: true, revision: 2 })

    const [commentCount, stateReceiptCount] = await Promise.all([
      database
        .selectFrom("script_comments")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("project_id", "=", projectId)
        .executeTakeFirstOrThrow(),
      database
        .selectFrom("command_receipts")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("actor_account_id", "=", writerId)
        .where(
          "domain",
          "=",
          `script-comment:${projectId}:${projectId}-document:${created[0].comment.id}`,
        )
        .executeTakeFirstOrThrow(),
    ])
    expect(Number(commentCount.count)).toBe(1)
    expect(Number(stateReceiptCount.count)).toBe(1)
    expect(await counts(projectId)).toEqual({ versions: 1, receipts: 0, audits: 2 })
  })

  it("rejects a concurrent reuse of an idempotency key with another payload", async () => {
    const projectId = await seedProject("key-reuse")
    const results = await Promise.allSettled(
      ["left edit", "right edit"].map((content) =>
        service.updateVersion({
          actorId: writerId,
          projectId,
          versionId: "v1",
          content,
          expectedRevision: 1,
          idempotencyKey: `${projectId}-same`,
        }),
      ),
    )

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1)
    const rejected = results.find(({ status }) => status === "rejected")
    expect(rejected).toMatchObject({
      reason: { code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 },
    })
    expect(await counts(projectId)).toEqual({ versions: 1, receipts: 1, audits: 1 })
  })

  it("keeps viewer writes out of PostgreSQL", async () => {
    const projectId = await seedProject("viewer")
    const results = await Promise.allSettled([
      service.updateVersion({
        actorId: viewerId,
        projectId,
        versionId: "v1",
        content: "forbidden edit",
        expectedRevision: 1,
        idempotencyKey: `${projectId}-update`,
      }),
      service.createVersion({
        actorId: viewerId,
        projectId,
        content: "forbidden version",
        meta: "forbidden",
        expectedVersionId: "v1",
        expectedRevision: 1,
        idempotencyKey: `${projectId}-version`,
      }),
      service.createComment({
        actorId: viewerId,
        projectId,
        versionId: "v1",
        text: "forbidden comment",
        idempotencyKey: `${projectId}-comment`,
      }),
      service.createDocument({
        actorId: viewerId,
        projectId,
        title: "forbidden document",
        idempotencyKey: `${projectId}-document`,
      }),
    ])

    expect(results).toHaveLength(4)
    for (const result of results) {
      expect(result.status).toBe("rejected")
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(AppError)
        expect(result.reason).toMatchObject({
          code: "PROJECT_ACCESS_DENIED",
          statusCode: 403,
        })
      }
    }
    expect(await counts(projectId)).toEqual({ versions: 1, receipts: 0, audits: 0 })
  })
})

function assertWorkspaceSnapshot(
  workspace: Awaited<ReturnType<ScriptService["getWorkspace"]>>,
) {
  const currentVersions = workspace.versions.filter((version) => version.isCurrent)
  expect(currentVersions).toHaveLength(1)
  expect(currentVersions[0]?.id).toBe(workspace.document.currentVersionId)
  expect(currentVersions[0]?.badge).toBe("当前")
  expect(workspace.versions.filter((version) => version.badge === "当前")).toHaveLength(1)
}
