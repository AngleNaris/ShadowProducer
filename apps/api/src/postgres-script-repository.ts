import { createHash, randomUUID } from "node:crypto"

import type {
  CreateCommentCommand,
  CreateDocumentCommand,
  CreateVersionCommand,
  ScriptRepository,
  ScriptWorkspaceData,
  UpdateCommentCommand,
  UpdateVersionCommand,
} from "@shadowproducer/application"
import { AppError } from "@shadowproducer/application"
import type {
  CreateScriptCommentResponse,
  CreateScriptDocumentResponse,
  CreateScriptVersionResponse,
  ScriptComment,
  ScriptDocument,
  ScriptVersion,
  UpdateScriptCommentResponse,
  UpdateScriptVersionResponse,
} from "@shadowproducer/contracts"
import type { Kysely, Transaction } from "kysely"

import type { Database } from "./database"
import { resolveProjectAccess } from "./postgres-access"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>

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

function mapVersion(row: {
  id: string
  meta: string
  badge: "当前" | "历史"
  content: string
  revision: number
  is_current: boolean
  updated_at: Date | string
}): ScriptVersion {
  return {
    id: row.id,
    meta: row.meta,
    badge: row.badge,
    content: row.content,
    revision: row.revision,
    isCurrent: row.is_current,
    updatedAt: toIso(row.updated_at),
  }
}

function mapDocument(row: {
  id: string
  title: string
  document_type: "script" | "storyboard"
  current_version_id: string
  is_default: boolean
  created_at: Date | string
}): ScriptDocument {
  return {
    id: row.id,
    title: row.title,
    type: row.document_type,
    currentVersionId: row.current_version_id,
    isDefault: row.is_default,
    createdAt: toIso(row.created_at),
  }
}

function nextVersionId(ids: string[]) {
  const greatest = Math.max(
    0,
    ...ids.map((id) => Number.parseInt(/^v(\d+)$/.exec(id)?.[1] ?? "0", 10)),
  )
  return `v${greatest + 1}`
}

export class PostgresScriptRepository implements ScriptRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getProjectAccess(actorId: string, projectId: string) {
    return resolveProjectAccess(this.database, actorId, projectId)
  }

  async listDocuments(projectId: string) {
    const rows = await this.database
      .selectFrom("script_documents")
      .select([
        "id",
        "title",
        "document_type",
        "current_version_id",
        "is_default",
        "created_at",
      ])
      .where("project_id", "=", projectId)
      .orderBy("is_default", "desc")
      .orderBy("created_at", "asc")
      .execute()
    return rows.map(mapDocument)
  }

  async createDocument(
    command: CreateDocumentCommand,
  ): Promise<CreateScriptDocumentResponse> {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `script-document.create:${command.projectId}`
      const replay = await this.findDocumentReceipt(transaction, command, domain, hash)
      if (replay) return replay

      const project = await transaction
        .selectFrom("projects")
        .select("id")
        .where("id", "=", command.projectId)
        .forUpdate()
        .executeTakeFirst()
      if (!project) throw new AppError("PROJECT_NOT_FOUND", "项目不存在", 404)

      const replayAfterLock = await this.findDocumentReceipt(
        transaction,
        command,
        domain,
        hash,
      )
      if (replayAfterLock) return replayAfterLock

      const versionRows = await transaction
        .selectFrom("script_versions")
        .select("id")
        .where("project_id", "=", command.projectId)
        .execute()
      const documentId = randomUUID()
      const versionId = nextVersionId(versionRows.map((item) => item.id))
      const row = await transaction
        .insertInto("script_documents")
        .values({
          id: documentId,
          project_id: command.projectId,
          title: command.title,
          document_type: command.type ?? "script",
          current_version_id: versionId,
          is_default: false,
          created_at: new Date(),
        })
        .returning([
          "id",
          "title",
          "document_type",
          "current_version_id",
          "is_default",
          "created_at",
        ])
        .executeTakeFirstOrThrow()
      await transaction
        .insertInto("script_versions")
        .values({
          project_id: command.projectId,
          id: versionId,
          document_id: documentId,
          meta: "初始版本",
          badge: "当前",
          content:
            (command.type ?? "script") === "storyboard"
              ? '{"schemaVersion":1,"shots":[]}'
              : "",
          revision: 1,
          is_current: true,
          updated_at: new Date(),
        })
        .execute()

      const document = mapDocument(row)
      await transaction
        .insertInto("command_receipts")
        .values({
          actor_account_id: command.actorId,
          domain,
          idempotency_key: command.idempotencyKey,
          request_hash: hash,
          response: JSON.stringify(document),
        })
        .execute()
      await this.writeAudit(
        transaction,
        command.actorId,
        command.projectId,
        "script.document.created",
        document.id,
        { documentType: document.type, initialVersionId: versionId },
      )
      return { document, replayed: false }
    })
  }

  async getWorkspace(
    projectId: string,
    documentId?: string,
  ): Promise<ScriptWorkspaceData | null> {
    return this.database
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (transaction) => {
        const documents = await transaction
          .selectFrom("script_documents")
          .select([
            "id",
            "project_id",
            "title",
            "document_type",
            "current_version_id",
            "is_default",
            "created_at",
          ])
          .where("project_id", "=", projectId)
          .orderBy("is_default", "desc")
          .orderBy("created_at", "asc")
          .execute()
        const document = documentId
          ? documents.find((item) => item.id === documentId)
          : documents[0]
        if (!document) return null

        const versionRows = await transaction
          .selectFrom("script_versions")
          .select([
            "id",
            "meta",
            "badge",
            "content",
            "revision",
            "is_current",
            "updated_at",
          ])
          .where("project_id", "=", projectId)
          .where("document_id", "=", document.id)
          .orderBy("is_current", "desc")
          .orderBy("updated_at", "desc")
          .execute()
        const commentRows = await transaction
          .selectFrom("script_comments as comment")
          .innerJoin("accounts as author", "author.id", "comment.author_account_id")
          .select([
            "comment.id",
            "comment.version_id",
            "comment.parent_comment_id",
            "comment.author_account_id",
            "comment.text",
            "comment.excerpt",
            "comment.created_at",
            "comment.updated_at",
            "comment.revision",
            "comment.resolved_at",
            "author.display_name",
          ])
          .where("comment.project_id", "=", projectId)
          .where(
            "comment.version_id",
            "in",
            versionRows.map((item) => item.id),
          )
          .orderBy("comment.created_at", "asc")
          .execute()
        const collaboratorRows = await transaction
          .selectFrom("project_memberships as membership")
          .innerJoin("accounts as account", "account.id", "membership.account_id")
          .select(["account.id", "account.display_name", "membership.role"])
          .where("membership.project_id", "=", projectId)
          .orderBy("account.display_name", "asc")
          .execute()

        return {
          projectId,
          document: mapDocument(document),
          versions: versionRows.map(mapVersion),
          comments: commentRows.map((comment) => ({
            id: comment.id,
            versionId: comment.version_id,
            parentId: comment.parent_comment_id,
            authorId: comment.author_account_id,
            authorName: comment.display_name,
            title: `${comment.display_name} · 评论`,
            text: comment.text,
            excerpt: comment.excerpt,
            createdAt: toIso(comment.created_at),
            updatedAt: toIso(comment.updated_at),
            revision: comment.revision,
            resolved: comment.resolved_at !== null,
          })),
          collaborators: collaboratorRows.map((collaborator) => ({
            id: collaborator.id,
            displayName: collaborator.display_name,
            initials: collaborator.display_name.slice(0, 1),
            role: collaborator.role,
          })),
        }
      })
  }

  async updateVersion(
    command: UpdateVersionCommand,
  ): Promise<UpdateScriptVersionResponse | null> {
    const documentId = command.documentId
    if (!documentId) return null
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const replay = await this.findWriteReceipt(transaction, command, hash)
      if (replay) return replay

      const row = await transaction
        .updateTable("script_versions")
        .set((expression) => ({
          content: command.content,
          revision: expression("revision", "+", 1),
          updated_at: new Date(),
        }))
        .where("project_id", "=", command.projectId)
        .where("id", "=", command.versionId)
        .where("document_id", "=", documentId)
        .where("is_current", "=", true)
        .where("revision", "=", command.expectedRevision)
        .returning([
          "id",
          "meta",
          "badge",
          "content",
          "revision",
          "is_current",
          "updated_at",
        ])
        .executeTakeFirst()
      if (!row) return this.findWriteReceipt(transaction, command, hash)

      const version = mapVersion(row)
      await transaction
        .insertInto("script_write_receipts")
        .values({
          project_id: command.projectId,
          version_id: command.versionId,
          actor_account_id: command.actorId,
          idempotency_key: command.idempotencyKey,
          request_hash: hash,
          response: JSON.stringify(version),
        })
        .execute()
      await this.writeAudit(
        transaction,
        command.actorId,
        command.projectId,
        "script.updated",
        command.versionId,
        {
          documentId,
          revision: version.revision,
        },
      )
      await this.enqueueAutoAnalysisJob(transaction, command, documentId, version)

      return { documentId, version, replayed: false }
    })
  }

  async createVersion(
    command: CreateVersionCommand,
  ): Promise<CreateScriptVersionResponse | null> {
    const documentId = command.documentId
    if (!documentId) return null
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const replay = await this.findWriteReceipt(transaction, command, hash)
      if (replay) return replay

      // ponytail: vN IDs are project-wide; replace them if this row lock becomes hot.
      const project = await transaction
        .selectFrom("projects")
        .select("id")
        .where("id", "=", command.projectId)
        .forUpdate()
        .executeTakeFirst()
      if (!project) return null

      const document = await transaction
        .selectFrom("script_documents")
        .select(["id", "current_version_id"])
        .where("project_id", "=", command.projectId)
        .where("id", "=", documentId)
        .forUpdate()
        .executeTakeFirst()
      const replayAfterLock = await this.findWriteReceipt(transaction, command, hash)
      if (replayAfterLock) return replayAfterLock
      if (!document || document.current_version_id !== command.expectedVersionId) {
        return null
      }

      const source = await transaction
        .selectFrom("script_versions")
        .select(["id", "revision"])
        .where("project_id", "=", command.projectId)
        .where("id", "=", command.expectedVersionId)
        .where("document_id", "=", document.id)
        .where("revision", "=", command.expectedRevision)
        .where("is_current", "=", true)
        .executeTakeFirst()
      if (!source) return null

      const versionIds = await transaction
        .selectFrom("script_versions")
        .select("id")
        .where("project_id", "=", command.projectId)
        .execute()
      const versionId = nextVersionId(versionIds.map((item) => item.id))

      const archived = await transaction
        .updateTable("script_versions")
        .set({ badge: "历史", is_current: false })
        .where("project_id", "=", command.projectId)
        .where("id", "=", source.id)
        .where("document_id", "=", document.id)
        .where("revision", "=", source.revision)
        .where("is_current", "=", true)
        .executeTakeFirst()
      if (Number(archived.numUpdatedRows) !== 1) return null

      const row = await transaction
        .insertInto("script_versions")
        .values({
          project_id: command.projectId,
          id: versionId,
          document_id: document.id,
          meta: command.meta.trim(),
          badge: "当前",
          content: command.content,
          revision: 1,
          is_current: true,
          updated_at: new Date(),
        })
        .returning([
          "id",
          "meta",
          "badge",
          "content",
          "revision",
          "is_current",
          "updated_at",
        ])
        .executeTakeFirstOrThrow()

      await transaction
        .updateTable("script_documents")
        .set({ current_version_id: versionId })
        .where("id", "=", document.id)
        .execute()

      const version = mapVersion(row)
      await transaction
        .insertInto("script_write_receipts")
        .values({
          project_id: command.projectId,
          version_id: versionId,
          actor_account_id: command.actorId,
          idempotency_key: command.idempotencyKey,
          request_hash: hash,
          response: JSON.stringify(version),
        })
        .execute()
      await this.writeAudit(
        transaction,
        command.actorId,
        command.projectId,
        "script.version.created",
        versionId,
        {
          documentId: document.id,
          sourceVersionId: source.id,
          sourceRevision: source.revision,
          revision: version.revision,
        },
      )

      return { documentId: document.id, version, replayed: false }
    })
  }

  private async enqueueAutoAnalysisJob(
    transaction: Transaction<Database>,
    command: UpdateVersionCommand,
    documentId: string,
    version: ScriptVersion,
  ) {
    if (!version.content.trim()) return
    const workflow = await transaction
      .selectFrom("analysis_workflows as workflow")
      .innerJoin(
        "script_documents as document",
        "document.project_id",
        "workflow.project_id",
      )
      .select([
        "workflow.revision as workflow_revision",
        "workflow.approval_policy",
        "workflow.approval_threshold",
        "document.title",
      ])
      .where("workflow.project_id", "=", command.projectId)
      .where("workflow.enabled", "=", true)
      .where("document.id", "=", documentId)
      .where("document.document_type", "=", "script")
      .where((expression) =>
        expression.or([
          expression("workflow.source_document_id", "is", null),
          expression("workflow.source_document_id", "=", documentId),
        ]),
      )
      .executeTakeFirst()
    if (!workflow) return

    const jobId = randomUUID()
    const inserted = await transaction
      .insertInto("analysis_jobs")
      .values({
        id: jobId,
        project_id: command.projectId,
        kind: "script_breakdown",
        tool: "deterministic_rules_v1",
        trigger_kind: "script_version_updated",
        approval_policy: workflow.approval_policy,
        approval_threshold: workflow.approval_threshold,
        status: "queued",
        triggered_by_account_id: command.actorId,
        source_document_id: documentId,
        source_document_title: workflow.title,
        source_version_id: version.id,
        source_version_meta: version.meta,
        source_revision: version.revision,
        source_content: version.content,
        available_at: new Date(),
        locked_by: null,
        lease_expires_at: null,
        failure_stage: null,
        last_error: null,
        processed_at: null,
        completed_at: null,
        cancelled_at: null,
      })
      .onConflict((conflict) => conflict.doNothing())
      .returning("id")
      .executeTakeFirst()
    if (!inserted) return

    await this.writeAudit(
      transaction,
      command.actorId,
      command.projectId,
      "analysis.job.created",
      jobId,
      {
        kind: "script_breakdown",
        tool: "deterministic_rules_v1",
        triggerKind: "script_version_updated",
        approvalPolicy: workflow.approval_policy,
        approvalThreshold: workflow.approval_threshold,
        sourceDocumentId: documentId,
        sourceVersionId: version.id,
        sourceRevision: version.revision,
        workflowRevision: workflow.workflow_revision,
      },
    )
  }

  private async findWriteReceipt(
    database: DatabaseExecutor,
    command: UpdateVersionCommand | CreateVersionCommand,
    hash: string,
  ) {
    const receipt = await database
      .selectFrom("script_write_receipts")
      .select(["response", "request_hash"])
      .where("project_id", "=", command.projectId)
      .where("actor_account_id", "=", command.actorId)
      .where("idempotency_key", "=", command.idempotencyKey)
      .executeTakeFirst()
    if (receipt?.request_hash && receipt.request_hash !== hash) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        "幂等键已用于不同请求，请重新提交",
        409,
      )
    }
    return receipt && command.documentId
      ? { documentId: command.documentId, version: receipt.response, replayed: true }
      : null
  }

  private async findDocumentReceipt(
    database: DatabaseExecutor,
    command: CreateDocumentCommand,
    domain: string,
    hash: string,
  ) {
    const receipt = await database
      .selectFrom("command_receipts")
      .select(["response", "request_hash"])
      .where("actor_account_id", "=", command.actorId)
      .where("domain", "=", domain)
      .where("idempotency_key", "=", command.idempotencyKey)
      .executeTakeFirst()
    if (receipt?.request_hash && receipt.request_hash !== hash) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        "幂等键已用于不同请求，请重新提交",
        409,
      )
    }
    return receipt
      ? {
          document: receipt.response as unknown as ScriptDocument,
          replayed: true,
        }
      : null
  }

  async createComment(
    command: CreateCommentCommand,
  ): Promise<CreateScriptCommentResponse | null> {
    const documentId = command.documentId
    if (!documentId) return null
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const version = await transaction
        .selectFrom("script_versions")
        .select("id")
        .where("project_id", "=", command.projectId)
        .where("id", "=", command.versionId)
        .where("document_id", "=", documentId)
        .executeTakeFirst()
      if (!version) return null

      if (command.parentId) {
        const parent = await transaction
          .selectFrom("script_comments")
          .select(["id", "parent_comment_id"])
          .where("id", "=", command.parentId)
          .where("project_id", "=", command.projectId)
          .where("version_id", "=", command.versionId)
          .executeTakeFirst()
        if (!parent) {
          throw new AppError("COMMENT_PARENT_NOT_FOUND", "要回复的评论不存在", 404)
        }
        if (parent.parent_comment_id) {
          throw new AppError("COMMENT_REPLY_DEPTH_EXCEEDED", "评论只支持一级回复", 400)
        }
      }

      const existing = await this.findCommentByIdempotencyKey(transaction, command)
      if (existing) return this.replayComment(existing, hash, documentId)

      const id = randomUUID()
      const inserted = await transaction
        .insertInto("script_comments")
        .values({
          id,
          project_id: command.projectId,
          version_id: command.versionId,
          parent_comment_id: command.parentId ?? null,
          author_account_id: command.actorId,
          text: command.text,
          excerpt: command.excerpt ?? "",
          idempotency_key: command.idempotencyKey,
          request_hash: hash,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["project_id", "author_account_id", "idempotency_key"])
            .doNothing(),
        )
        .returning("id")
        .executeTakeFirst()

      if (!inserted) {
        const replay = await this.findCommentByIdempotencyKey(transaction, command)
        return replay ? this.replayComment(replay, hash, documentId) : null
      }

      const comment = await this.findCommentById(
        transaction,
        id,
        command.projectId,
        documentId,
      )
      if (!comment) return null
      await this.writeAudit(
        transaction,
        command.actorId,
        command.projectId,
        "script.comment.created",
        id,
        {
          documentId,
          versionId: command.versionId,
          parentId: command.parentId ?? null,
        },
      )
      return { documentId, comment, replayed: false }
    })
  }

  async updateComment(
    command: UpdateCommentCommand,
  ): Promise<UpdateScriptCommentResponse | null> {
    const documentId = command.documentId
    if (!documentId) return null
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `script-comment:${command.projectId}:${documentId}:${command.commentId}`
      const replay = await this.findCommentStateReceipt(
        transaction,
        command,
        domain,
        hash,
      )
      if (replay) return replay

      const target = await transaction
        .selectFrom("script_comments as comment")
        .innerJoin("script_versions as version", (join) =>
          join
            .onRef("version.project_id", "=", "comment.project_id")
            .onRef("version.id", "=", "comment.version_id"),
        )
        .select(["comment.id", "comment.parent_comment_id"])
        .where("comment.project_id", "=", command.projectId)
        .where("comment.id", "=", command.commentId)
        .where("version.document_id", "=", documentId)
        .executeTakeFirst()
      if (!target) {
        throw new AppError("SCRIPT_COMMENT_NOT_FOUND", "评论不存在", 404)
      }
      if (target.parent_comment_id) {
        throw new AppError("COMMENT_THREAD_ROOT_REQUIRED", "请在主评论上更新状态", 400)
      }

      const row = await transaction
        .updateTable("script_comments")
        .set((expression) => ({
          resolved_at: command.resolved ? new Date() : null,
          revision: expression("revision", "+", 1),
          updated_at: new Date(),
        }))
        .where("project_id", "=", command.projectId)
        .where("id", "=", command.commentId)
        .where("revision", "=", command.expectedRevision)
        .returning("id")
        .executeTakeFirst()
      if (!row) {
        return this.findCommentStateReceipt(transaction, command, domain, hash)
      }

      const comment = await this.findCommentById(
        transaction,
        command.commentId,
        command.projectId,
        documentId,
      )
      if (!comment) return null
      await transaction
        .insertInto("command_receipts")
        .values({
          actor_account_id: command.actorId,
          domain,
          idempotency_key: command.idempotencyKey,
          request_hash: hash,
          response: JSON.stringify(comment),
        })
        .execute()
      await this.writeAudit(
        transaction,
        command.actorId,
        command.projectId,
        command.resolved ? "script.comment.resolved" : "script.comment.reopened",
        command.commentId,
        {
          documentId,
          versionId: comment.versionId,
          revision: comment.revision,
        },
      )
      return { documentId, comment, replayed: false }
    })
  }

  private async findCommentByIdempotencyKey(
    database: DatabaseExecutor,
    command: CreateCommentCommand,
  ) {
    const row = await database
      .selectFrom("script_comments as comment")
      .innerJoin("accounts as author", "author.id", "comment.author_account_id")
      .innerJoin("script_versions as version", (join) =>
        join
          .onRef("version.project_id", "=", "comment.project_id")
          .onRef("version.id", "=", "comment.version_id"),
      )
      .select([
        "comment.id",
        "comment.version_id",
        "comment.parent_comment_id",
        "comment.author_account_id",
        "comment.text",
        "comment.excerpt",
        "comment.created_at",
        "comment.updated_at",
        "comment.revision",
        "comment.resolved_at",
        "comment.request_hash",
        "author.display_name",
      ])
      .where("comment.project_id", "=", command.projectId)
      .where("version.document_id", "=", command.documentId ?? "")
      .where("comment.author_account_id", "=", command.actorId)
      .where("comment.idempotency_key", "=", command.idempotencyKey)
      .executeTakeFirst()
    return row ? { comment: this.mapComment(row), requestHash: row.request_hash } : null
  }

  private async findCommentById(
    database: DatabaseExecutor,
    id: string,
    projectId: string,
    documentId: string,
  ) {
    const row = await database
      .selectFrom("script_comments as comment")
      .innerJoin("accounts as author", "author.id", "comment.author_account_id")
      .innerJoin("script_versions as version", (join) =>
        join
          .onRef("version.project_id", "=", "comment.project_id")
          .onRef("version.id", "=", "comment.version_id"),
      )
      .select([
        "comment.id",
        "comment.version_id",
        "comment.parent_comment_id",
        "comment.author_account_id",
        "comment.text",
        "comment.excerpt",
        "comment.created_at",
        "comment.updated_at",
        "comment.revision",
        "comment.resolved_at",
        "author.display_name",
      ])
      .where("comment.id", "=", id)
      .where("comment.project_id", "=", projectId)
      .where("version.document_id", "=", documentId)
      .executeTakeFirst()
    return row ? this.mapComment(row) : null
  }

  private mapComment(row: {
    id: string
    version_id: string
    parent_comment_id: string | null
    author_account_id: string
    text: string
    excerpt: string
    created_at: Date | string
    updated_at: Date | string
    revision: number
    resolved_at: Date | string | null
    display_name: string
  }): ScriptComment {
    return {
      id: row.id,
      versionId: row.version_id,
      parentId: row.parent_comment_id,
      authorId: row.author_account_id,
      authorName: row.display_name,
      title: `${row.display_name} · 评论`,
      text: row.text,
      excerpt: row.excerpt,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
      revision: row.revision,
      resolved: row.resolved_at !== null,
    }
  }

  private replayComment(
    receipt: { comment: ScriptComment; requestHash: string | null },
    hash: string,
    documentId: string,
  ) {
    if (receipt.requestHash && receipt.requestHash !== hash) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        "幂等键已用于不同请求，请重新提交",
        409,
      )
    }
    return { documentId, comment: receipt.comment, replayed: true }
  }

  private async findCommentStateReceipt(
    database: DatabaseExecutor,
    command: UpdateCommentCommand,
    domain: string,
    hash: string,
  ) {
    const receipt = await database
      .selectFrom("command_receipts")
      .select(["response", "request_hash"])
      .where("actor_account_id", "=", command.actorId)
      .where("domain", "=", domain)
      .where("idempotency_key", "=", command.idempotencyKey)
      .executeTakeFirst()
    if (receipt?.request_hash && receipt.request_hash !== hash) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        "幂等键已用于不同请求，请重新提交",
        409,
      )
    }
    return receipt && command.documentId
      ? {
          documentId: command.documentId,
          comment: receipt.response as unknown as ScriptComment,
          replayed: true,
        }
      : null
  }

  private async writeAudit(
    database: DatabaseExecutor,
    actorId: string,
    projectId: string,
    action: string,
    subjectId: string,
    metadata: Record<string, unknown>,
  ) {
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: actorId,
        project_id: projectId,
        action,
        subject_id: subjectId,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }
}
