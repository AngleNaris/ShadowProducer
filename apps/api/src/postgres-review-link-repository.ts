import { createHash, randomUUID, timingSafeEqual } from "node:crypto"

import {
  AppError,
  type CreateReviewLinkCommand,
  type GuestReviewApprovalCommand,
  type GuestReviewCommentCommand,
  maskReviewIdentityEmail,
  type ReviewLinkRepository,
  type ReviewSessionContext,
  type StoredReviewLink,
} from "@shadowproducer/application"
import type { PublicReviewFile, ReviewComment } from "@shadowproducer/contracts"
import type { Kysely, Selectable, Transaction } from "kysely"

import type { Database } from "./database"
import { resolveProjectAccess } from "./postgres-access"
import { writeReviewActivityNotifications } from "./postgres-review-notifications"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function requestHash(value: object) {
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "idempotencyKey")
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

export class PostgresReviewLinkRepository implements ReviewLinkRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getProjectAccess(actorId: string, projectId: string) {
    return resolveProjectAccess(this.database, actorId, projectId)
  }

  async createLink(command: CreateReviewLinkCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom("review_links")
        .select(["id", "request_hash"])
        .where("created_by_account_id", "=", command.actorId)
        .where("project_id", "=", command.projectId)
        .where("idempotency_key", "=", command.idempotencyKey)
        .executeTakeFirst()
      if (existing) {
        if (existing.request_hash !== command.requestHash) {
          throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
        }
        const item = await this.findLink(transaction, existing.id)
        if (!item) throw new AppError("RESOURCE_NOT_FOUND", "客户审片链接不存在", 404)
        return { item, replayed: true }
      }

      const files = await transaction
        .selectFrom("review_files as file")
        .innerJoin("team_assets as asset", "asset.id", "file.asset_id")
        .select("file.id")
        .where("file.project_id", "=", command.projectId)
        .where("file.type", "=", "video")
        .where("file.archived_at", "is", null)
        .where("file.id", "in", command.fileIds)
        .where("asset.status", "=", "ready")
        .where("asset.object_key", "is not", null)
        .where("asset.archived_at", "is", null)
        .execute()
      if (files.length !== command.fileIds.length)
        return { kind: "invalid_files" } as const

      await transaction
        .insertInto("review_links")
        .values({
          id: command.linkId,
          token_hash: command.tokenHash,
          project_id: command.projectId,
          can_comment: command.scope.canComment,
          can_compare: command.scope.canCompare,
          can_download: command.scope.canDownload,
          can_approve: command.scope.canApprove,
          password_salt: command.passwordSalt,
          password_hash: command.passwordHash,
          expires_at: command.expiresAt,
          revoked_at: null,
          created_by_account_id: command.actorId,
          idempotency_key: command.idempotencyKey,
          request_hash: command.requestHash,
        })
        .execute()
      await transaction
        .insertInto("review_link_files")
        .values(
          command.fileIds.map((fileId, sortOrder) => ({
            link_id: command.linkId,
            file_id: fileId,
            sort_order: sortOrder,
          })),
        )
        .execute()
      await this.writeMemberAudit(
        transaction,
        command.actorId,
        command.projectId,
        "review-link.created",
        command.linkId,
        { fileIds: command.fileIds, scope: command.scope, expiresAt: command.expiresAt },
      )
      const item = await this.findLink(transaction, command.linkId)
      if (!item) throw new AppError("RESOURCE_NOT_FOUND", "客户审片链接不存在", 404)
      return { item, replayed: false }
    })
  }

  async listLinks(projectId: string) {
    const rows = await this.database
      .selectFrom("review_links")
      .select("id")
      .where("project_id", "=", projectId)
      .orderBy("created_at", "desc")
      .execute()
    return Promise.all(
      rows.map(async (row) => {
        const link = await this.findLink(this.database, row.id)
        if (!link) throw new Error(`Review link ${row.id} disappeared during read`)
        return link
      }),
    )
  }

  async revokeLink(
    actorId: string,
    projectId: string,
    linkId: string,
    idempotencyKey: string,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const current = await transaction
        .selectFrom("review_links")
        .select(["id", "revoked_at"])
        .where("id", "=", linkId)
        .where("project_id", "=", projectId)
        .executeTakeFirst()
      if (!current) return null
      if (!current.revoked_at) {
        const revokedAt = new Date()
        await transaction
          .updateTable("review_links")
          .set({ revoked_at: revokedAt, updated_at: revokedAt })
          .where("id", "=", linkId)
          .execute()
        await transaction
          .updateTable("review_sessions")
          .set({ revoked_at: revokedAt })
          .where("link_id", "=", linkId)
          .where("revoked_at", "is", null)
          .execute()
        await this.writeMemberAudit(
          transaction,
          actorId,
          projectId,
          "review-link.revoked",
          linkId,
          { idempotencyKey },
        )
      }
      return this.findLink(transaction, linkId)
    })
  }

  async findLinkByTokenHash(tokenHash: string) {
    const row = await this.database
      .selectFrom("review_links")
      .select("id")
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst()
    return row ? this.findLink(this.database, row.id) : null
  }

  async createIdentityChallenge(input: {
    id: string
    linkId: string
    displayName: string
    email: string
    codeHash: string
    expiresAt: string
    createdAfter: string
  }) {
    return this.database.transaction().execute(async (transaction) => {
      const recent = await transaction
        .selectFrom("review_identity_challenges")
        .select("id")
        .where("link_id", "=", input.linkId)
        .where("email", "=", input.email)
        .where("created_at", ">", new Date(input.createdAfter))
        .where("consumed_at", "is", null)
        .executeTakeFirst()
      if (recent) return "rate_limited" as const
      await transaction
        .insertInto("review_identity_challenges")
        .values({
          id: input.id,
          link_id: input.linkId,
          display_name: input.displayName,
          email: input.email,
          code_hash: input.codeHash,
          expires_at: input.expiresAt,
        })
        .execute()
      return "created" as const
    })
  }

  async deleteIdentityChallenge(id: string) {
    await this.database
      .deleteFrom("review_identity_challenges")
      .where("id", "=", id)
      .where("consumed_at", "is", null)
      .execute()
  }

  async verifyIdentityAndCreateSession(input: {
    challengeId: string
    linkId: string
    codeHash: string
    sessionId: string
    sessionTokenHash: string
    sessionExpiresAt: string
  }) {
    return this.database.transaction().execute(async (transaction) => {
      const challenge = await transaction
        .selectFrom("review_identity_challenges")
        .selectAll()
        .where("id", "=", input.challengeId)
        .where("link_id", "=", input.linkId)
        .forUpdate()
        .executeTakeFirst()
      if (!challenge) return { kind: "invalid" } as const
      if (challenge.consumed_at) return { kind: "consumed" } as const
      if (new Date(challenge.expires_at) <= new Date())
        return { kind: "expired" } as const
      if (challenge.attempt_count >= 5) return { kind: "attempts_exhausted" } as const
      if (!hashMatches(input.codeHash, challenge.code_hash)) {
        const attemptCount = challenge.attempt_count + 1
        await transaction
          .updateTable("review_identity_challenges")
          .set({ attempt_count: attemptCount })
          .where("id", "=", challenge.id)
          .execute()
        return {
          kind: attemptCount >= 5 ? "attempts_exhausted" : "invalid",
        } as const
      }
      const verifiedAt = new Date()
      await transaction
        .updateTable("review_identity_challenges")
        .set({ consumed_at: verifiedAt })
        .where("id", "=", challenge.id)
        .execute()
      await transaction
        .insertInto("review_sessions")
        .values({
          id: input.sessionId,
          link_id: input.linkId,
          token_hash: input.sessionTokenHash,
          display_name: challenge.display_name,
          verified_email: challenge.email,
          identity_verified_at: verifiedAt,
          expires_at: input.sessionExpiresAt,
          revoked_at: null,
        })
        .execute()
      const workspace = await this.sessionContext(
        transaction,
        input.sessionId,
        input.linkId,
      )
      if (!workspace) {
        throw new AppError("REVIEW_LINK_UNAVAILABLE", "审片链接已失效", 404)
      }
      return { kind: "verified", workspace } as const
    })
  }

  async getSession(linkId: string, tokenHash: string) {
    const session = await this.database
      .selectFrom("review_sessions as session")
      .innerJoin("review_links as link", "link.id", "session.link_id")
      .select("session.id")
      .where("session.link_id", "=", linkId)
      .where("session.token_hash", "=", tokenHash)
      .where("session.revoked_at", "is", null)
      .where("session.identity_verified_at", "is not", null)
      .where("session.expires_at", ">", new Date())
      .where("link.revoked_at", "is", null)
      .where("link.expires_at", ">", new Date())
      .executeTakeFirst()
    if (!session) return null
    await this.database
      .updateTable("review_sessions")
      .set({ last_seen_at: new Date() })
      .where("id", "=", session.id)
      .execute()
    return this.sessionContext(this.database, session.id, linkId)
  }

  async listComments(sessionId: string, linkId: string, fileId: string) {
    const allowed = await this.allowedFile(this.database, sessionId, linkId, fileId)
    if (!allowed) return null
    const rows = await this.commentQuery(this.database)
      .innerJoin(
        "review_sessions as comment_session",
        "comment_session.id",
        "comment.review_session_id",
      )
      .where("comment.file_id", "=", fileId)
      .where("comment_session.link_id", "=", linkId)
      .orderBy("comment.created_at", "asc")
      .execute()
    return rows.map((row) => this.mapComment(row))
  }

  async createComment(command: GuestReviewCommentCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const file = await this.allowedFile(
        transaction,
        command.sessionId,
        command.linkId,
        command.fileId,
        "comment",
      )
      if (!file) return null
      const parentCommentId = command.parentCommentId?.trim() || null
      const hash = requestHash({ ...command, parentCommentId })
      if (parentCommentId) {
        const parent = await transaction
          .selectFrom("review_comments as parent")
          .innerJoin(
            "review_sessions as parent_session",
            "parent_session.id",
            "parent.review_session_id",
          )
          .select(["parent.id", "parent.parent_comment_id"])
          .where("parent.id", "=", parentCommentId)
          .where("parent.project_id", "=", command.projectId)
          .where("parent.file_id", "=", command.fileId)
          .where("parent.version", "=", file.version)
          .where("parent_session.link_id", "=", command.linkId)
          .executeTakeFirst()
        if (!parent) {
          throw new AppError(
            "REVIEW_COMMENT_PARENT_NOT_FOUND",
            "要回复的审片意见不存在",
            404,
          )
        }
        if (parent.parent_comment_id) {
          throw new AppError(
            "REVIEW_COMMENT_REPLY_DEPTH_EXCEEDED",
            "审片意见只支持一级回复",
            400,
          )
        }
      }
      const existing = await this.commentQuery(transaction)
        .where("comment.file_id", "=", command.fileId)
        .where("comment.review_session_id", "=", command.sessionId)
        .where("comment.idempotency_key", "=", command.idempotencyKey)
        .executeTakeFirst()
      if (existing) {
        if (existing.request_hash && existing.request_hash !== hash) {
          throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
        }
        return { item: this.mapComment(existing), replayed: true }
      }
      const id = randomUUID()
      await transaction
        .insertInto("review_comments")
        .values({
          id,
          project_id: command.projectId,
          file_id: command.fileId,
          parent_comment_id: parentCommentId,
          version: file.version,
          author_account_id: null,
          review_session_id: command.sessionId,
          guest_display_name: command.displayName,
          timecode: command.timecode.trim(),
          text: command.text.trim(),
          state: "open",
          idempotency_key: command.idempotencyKey,
          request_hash: hash,
        })
        .execute()
      const created = await this.commentQuery(transaction)
        .where("comment.id", "=", id)
        .executeTakeFirstOrThrow()
      await this.writeGuestAudit(transaction, {
        projectId: command.projectId,
        linkId: command.linkId,
        sessionId: command.sessionId,
        action: parentCommentId ? "review-comment.replied" : "review-comment.created",
        outcome: "success",
        metadata: { fileId: command.fileId, commentId: id, parentCommentId },
      })
      await writeReviewActivityNotifications(transaction, {
        projectId: command.projectId,
        sourceActorAccountId: null,
        sourceActorName: command.displayName,
        kind: parentCommentId ? "review_comment_replied" : "review_comment_created",
        subjectId: id,
        dedupKey: `review-comment-${parentCommentId ? "replied" : "created"}:${id}`,
        title: parentCommentId ? "新增审片回复" : "新增审片意见",
        body: `${file.name} · ${file.version} · ${command.timecode.trim()}`,
        metadata: {
          commentId: id,
          fileId: command.fileId,
          version: file.version,
          timecode: command.timecode.trim(),
          parentCommentId,
        },
      })
      return { item: this.mapComment(created), replayed: false }
    })
  }

  async approveFile(command: GuestReviewApprovalCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `review-file.approve:${command.linkId}:${command.fileId}`
      const hash = requestHash(command)
      const receipt = await transaction
        .selectFrom("review_session_receipts")
        .select(["request_hash", "response"])
        .where("review_session_id", "=", command.sessionId)
        .where("domain", "=", domain)
        .where("idempotency_key", "=", command.idempotencyKey)
        .executeTakeFirst()
      if (receipt) {
        if (receipt.request_hash !== hash) {
          throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
        }
        return receipt.response as unknown as PublicReviewFile
      }
      const file = await this.allowedFile(
        transaction,
        command.sessionId,
        command.linkId,
        command.fileId,
        "approve",
      )
      if (
        !file ||
        file.revision !== command.expectedRevision ||
        file.status === "处理中"
      ) {
        return null
      }
      const updated = await transaction
        .updateTable("review_files")
        .set({
          status: "已通过",
          approved_by_account_id: null,
          approved_by_review_session_id: command.sessionId,
          approved_at: new Date(),
          updated_at: new Date(),
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.fileId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", "is", null)
        .returningAll()
        .executeTakeFirst()
      if (!updated) return null
      const comments = await this.commentCount(transaction, command.fileId)
      const item = this.mapPublicFile(updated, comments, command.displayName)
      await transaction
        .insertInto("review_session_receipts")
        .values({
          review_session_id: command.sessionId,
          domain,
          idempotency_key: command.idempotencyKey,
          request_hash: hash,
          response: JSON.stringify(item),
        })
        .execute()
      await this.writeGuestAudit(transaction, {
        projectId: command.projectId,
        linkId: command.linkId,
        sessionId: command.sessionId,
        action: "review-file.approved",
        outcome: "success",
        metadata: { fileId: command.fileId, revision: item.revision },
      })
      await writeReviewActivityNotifications(transaction, {
        projectId: command.projectId,
        sourceActorAccountId: null,
        sourceActorName: command.displayName,
        kind: "review_file_approved",
        subjectId: item.id,
        dedupKey: `review-file-approved:${item.id}:${item.revision}`,
        title: "审片版本已批准",
        body: `${item.name} · ${item.version}`,
        metadata: { fileId: item.id, version: item.version, revision: item.revision },
      })
      return item
    })
  }

  async getContentSource(sessionId: string, linkId: string, fileId: string) {
    const row = await this.database
      .selectFrom("review_sessions as session")
      .innerJoin("review_links as link", "link.id", "session.link_id")
      .innerJoin("review_link_files as allowed", "allowed.link_id", "link.id")
      .innerJoin("review_files as file", "file.id", "allowed.file_id")
      .innerJoin("team_assets as asset", "asset.id", "file.asset_id")
      .leftJoin("asset_media as media", "media.asset_id", "asset.id")
      .select(["asset.object_key", "media.review_proxy_object_key"])
      .where("session.id", "=", sessionId)
      .where("link.id", "=", linkId)
      .where("file.id", "=", fileId)
      .where("file.archived_at", "is", null)
      .where("session.revoked_at", "is", null)
      .where("session.expires_at", ">", new Date())
      .where("link.revoked_at", "is", null)
      .where("link.expires_at", ">", new Date())
      .where("asset.status", "=", "ready")
      .where("asset.archived_at", "is", null)
      .executeTakeFirst()
    const objectKey = row?.review_proxy_object_key ?? row?.object_key
    return objectKey ? { objectKey } : null
  }

  auditGuest(input: {
    projectId: string | null
    linkId: string | null
    sessionId: string | null
    action: string
    outcome: "success" | "denied"
    metadata?: Record<string, unknown>
  }) {
    return this.writeGuestAudit(this.database, input)
  }

  private async findLink(database: DatabaseExecutor, id: string) {
    const [row, files] = await Promise.all([
      database
        .selectFrom("review_links")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst(),
      database
        .selectFrom("review_link_files")
        .select("file_id")
        .where("link_id", "=", id)
        .orderBy("sort_order", "asc")
        .execute(),
    ])
    if (!row) return null
    return this.mapLink(
      row,
      files.map((file) => file.file_id),
    )
  }

  private mapLink(
    row: Selectable<Database["review_links"]>,
    fileIds: string[],
  ): StoredReviewLink {
    return {
      id: row.id,
      projectId: row.project_id,
      fileIds,
      scope: {
        canComment: row.can_comment,
        canCompare: row.can_compare,
        canDownload: row.can_download,
        canApprove: row.can_approve,
      },
      expiresAt: toIso(row.expires_at),
      revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
      createdAt: toIso(row.created_at),
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
      requestHash: row.request_hash,
    }
  }

  private async sessionContext(
    database: DatabaseExecutor,
    sessionId: string,
    linkId: string,
  ): Promise<ReviewSessionContext | null> {
    const row = await database
      .selectFrom("review_sessions as session")
      .innerJoin("review_links as link", "link.id", "session.link_id")
      .innerJoin("projects as project", "project.id", "link.project_id")
      .select([
        "session.id",
        "session.display_name",
        "session.verified_email",
        "session.identity_verified_at",
        "session.expires_at as session_expires_at",
        "link.project_id",
        "link.can_comment",
        "link.can_compare",
        "link.can_download",
        "link.can_approve",
        "project.name as project_name",
      ])
      .where("session.id", "=", sessionId)
      .where("link.id", "=", linkId)
      .where("session.revoked_at", "is", null)
      .where("session.identity_verified_at", "is not", null)
      .where("session.expires_at", ">", new Date())
      .where("link.revoked_at", "is", null)
      .where("link.expires_at", ">", new Date())
      .executeTakeFirst()
    if (!row) return null
    if (!row.verified_email || !row.identity_verified_at) return null
    const fileRows = await database
      .selectFrom("review_link_files as allowed")
      .innerJoin("review_files as file", "file.id", "allowed.file_id")
      .leftJoin(
        "accounts as member_approver",
        "member_approver.id",
        "file.approved_by_account_id",
      )
      .leftJoin(
        "review_sessions as guest_approver",
        "guest_approver.id",
        "file.approved_by_review_session_id",
      )
      .selectAll("file")
      .select([
        "member_approver.display_name as member_approver_name",
        "guest_approver.display_name as guest_approver_name",
      ])
      .where("allowed.link_id", "=", linkId)
      .where("file.archived_at", "is", null)
      .orderBy("allowed.sort_order", "asc")
      .execute()
    const files = await Promise.all(
      fileRows.map(async (file) =>
        this.mapPublicFile(
          file,
          await this.commentCountForLink(database, file.id, linkId),
          file.member_approver_name ?? file.guest_approver_name,
        ),
      ),
    )
    return {
      sessionId: row.id,
      linkId,
      projectId: row.project_id,
      projectName: row.project_name,
      displayName: row.display_name,
      verifiedIdentity: {
        emailMasked: maskReviewIdentityEmail(row.verified_email),
        verifiedAt: toIso(row.identity_verified_at),
      },
      expiresAt: toIso(row.session_expires_at),
      scope: {
        canComment: row.can_comment,
        canCompare: row.can_compare,
        canDownload: row.can_download,
        canApprove: row.can_approve,
      },
      files,
    }
  }

  private async allowedFile(
    database: DatabaseExecutor,
    sessionId: string,
    linkId: string,
    fileId: string,
    scope?: "comment" | "approve",
  ) {
    let query = database
      .selectFrom("review_sessions as session")
      .innerJoin("review_links as link", "link.id", "session.link_id")
      .innerJoin("review_link_files as allowed", "allowed.link_id", "link.id")
      .innerJoin("review_files as file", "file.id", "allowed.file_id")
      .select(["file.id", "file.name", "file.version", "file.revision", "file.status"])
      .where("session.id", "=", sessionId)
      .where("link.id", "=", linkId)
      .where("file.id", "=", fileId)
      .where("file.archived_at", "is", null)
      .where("session.revoked_at", "is", null)
      .where("session.expires_at", ">", new Date())
      .where("link.revoked_at", "is", null)
      .where("link.expires_at", ">", new Date())
    if (scope === "comment") query = query.where("link.can_comment", "=", true)
    if (scope === "approve") query = query.where("link.can_approve", "=", true)
    return query.executeTakeFirst()
  }

  private commentQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("review_comments as comment")
      .leftJoin("accounts as author", "author.id", "comment.author_account_id")
      .select([
        "comment.id",
        "comment.file_id",
        "comment.parent_comment_id",
        "comment.version",
        "comment.author_account_id",
        "comment.review_session_id",
        "comment.guest_display_name",
        "author.display_name as author_name",
        "comment.timecode",
        "comment.text",
        "comment.state",
        "comment.idempotency_key",
        "comment.request_hash",
        "comment.revision",
        "comment.created_at",
      ])
  }

  private mapComment(row: {
    id: string
    file_id: string
    parent_comment_id: string | null
    version: string
    author_account_id: string | null
    review_session_id: string | null
    guest_display_name: string | null
    author_name: string | null
    timecode: string
    text: string
    state: "open" | "resolved"
    revision: number
    created_at: Date | string
  }): ReviewComment {
    const author = row.author_name ?? row.guest_display_name ?? "访客"
    return {
      id: row.id,
      fileId: row.file_id,
      parentCommentId: row.parent_comment_id,
      version: row.version,
      author,
      authorId: row.author_account_id ?? `guest:${row.review_session_id}`,
      initials: author.slice(0, 2).toUpperCase(),
      timecode: row.timecode,
      text: row.text,
      state: row.state,
      revision: row.revision,
      createdAt: toIso(row.created_at),
    }
  }

  private mapPublicFile(
    row: Selectable<Database["review_files"]>,
    comments: number,
    approvedBy: string | null,
  ): PublicReviewFile {
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      status: row.status,
      duration: row.duration,
      comments,
      approvedBy,
      approvedAt: row.approved_at ? toIso(row.approved_at) : null,
      revision: row.revision,
    }
  }

  private async commentCount(database: DatabaseExecutor, fileId: string) {
    const row = await database
      .selectFrom("review_comments")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("file_id", "=", fileId)
      .executeTakeFirst()
    return Number(row?.count ?? 0)
  }

  private async commentCountForLink(
    database: DatabaseExecutor,
    fileId: string,
    linkId: string,
  ) {
    const row = await database
      .selectFrom("review_comments as comment")
      .innerJoin("review_sessions as session", "session.id", "comment.review_session_id")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("comment.file_id", "=", fileId)
      .where("session.link_id", "=", linkId)
      .executeTakeFirst()
    return Number(row?.count ?? 0)
  }

  private async writeMemberAudit(
    database: DatabaseExecutor,
    actorId: string,
    projectId: string,
    action: string,
    subjectId: string,
    metadata: Record<string, unknown>,
  ) {
    const project = await database
      .selectFrom("projects")
      .select("team_id")
      .where("id", "=", projectId)
      .executeTakeFirstOrThrow()
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: actorId,
        actor_type: "member",
        review_session_id: null,
        team_id: project.team_id,
        project_id: projectId,
        action,
        subject_id: subjectId,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }

  private async writeGuestAudit(
    database: DatabaseExecutor,
    input: {
      projectId: string | null
      linkId: string | null
      sessionId: string | null
      action: string
      outcome: "success" | "denied"
      metadata?: Record<string, unknown>
    },
  ) {
    const project = input.projectId
      ? await database
          .selectFrom("projects")
          .select("team_id")
          .where("id", "=", input.projectId)
          .executeTakeFirst()
      : null
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: null,
        actor_type: "guest",
        review_session_id: input.sessionId,
        team_id: project?.team_id ?? null,
        project_id: input.projectId,
        action: input.action,
        subject_id: input.linkId ?? "unknown-review-link",
        metadata: JSON.stringify({ outcome: input.outcome, ...input.metadata }),
      })
      .execute()
  }
}

function hashMatches(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "hex")
  const expectedBuffer = Buffer.from(expected, "hex")
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}
