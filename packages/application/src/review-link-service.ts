import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto"

import type {
  CreateReviewCommentBody,
  CreateReviewLinkBody,
  PublicReviewApprovalBody,
  PublicReviewFile,
  PublicReviewWorkspace,
  RequestReviewIdentityBody,
  ReviewComment,
  ReviewIdentityChallenge,
  ReviewLink,
} from "@shadowproducer/contracts"
import { accessAllows } from "./access"
import type { AssetStorage } from "./asset-service"
import { AppError } from "./script-service"
import type { CreateResult, TeamAccess } from "./workspace-service"

export type StoredReviewLink = Omit<ReviewLink, "url"> & {
  passwordSalt: string | null
  passwordHash: string | null
  requestHash: string
}

export type ReviewSessionContext = PublicReviewWorkspace & {
  sessionId: string
  projectId: string
}

export type ReviewIdentityDelivery = (input: {
  email: string
  displayName: string
  code: string
  expiresAt: string
}) => Promise<{ developmentCode?: string }>

export type VerifyReviewIdentityResult =
  | { kind: "verified"; workspace: ReviewSessionContext }
  | { kind: "invalid" | "expired" | "consumed" | "attempts_exhausted" }

export type CreateReviewLinkCommand = CreateReviewLinkBody & {
  actorId: string
  projectId: string
  linkId: string
  tokenHash: string
  passwordSalt: string | null
  passwordHash: string | null
  requestHash: string
}

export type GuestReviewCommentCommand = CreateReviewCommentBody & {
  sessionId: string
  linkId: string
  projectId: string
  fileId: string
  displayName: string
}

export type GuestReviewApprovalCommand = PublicReviewApprovalBody & {
  sessionId: string
  linkId: string
  projectId: string
  fileId: string
  displayName: string
}

export interface ReviewLinkRepository {
  getProjectAccess(actorId: string, projectId: string): Promise<TeamAccess | null>
  createLink(
    command: CreateReviewLinkCommand,
  ): Promise<CreateResult<StoredReviewLink> | { kind: "invalid_files" }>
  listLinks(projectId: string): Promise<StoredReviewLink[]>
  revokeLink(
    actorId: string,
    projectId: string,
    linkId: string,
    idempotencyKey: string,
  ): Promise<StoredReviewLink | null>
  findLinkByTokenHash(tokenHash: string): Promise<StoredReviewLink | null>
  createIdentityChallenge(input: {
    id: string
    linkId: string
    displayName: string
    email: string
    codeHash: string
    expiresAt: string
    createdAfter: string
  }): Promise<"created" | "rate_limited">
  deleteIdentityChallenge(id: string): Promise<void>
  verifyIdentityAndCreateSession(input: {
    challengeId: string
    linkId: string
    codeHash: string
    sessionId: string
    sessionTokenHash: string
    sessionExpiresAt: string
  }): Promise<VerifyReviewIdentityResult>
  getSession(linkId: string, tokenHash: string): Promise<ReviewSessionContext | null>
  listComments(
    sessionId: string,
    linkId: string,
    fileId: string,
  ): Promise<ReviewComment[] | null>
  createComment(
    command: GuestReviewCommentCommand,
  ): Promise<CreateResult<ReviewComment> | null>
  approveFile(command: GuestReviewApprovalCommand): Promise<PublicReviewFile | null>
  getContentSource(
    sessionId: string,
    linkId: string,
    fileId: string,
  ): Promise<{ objectKey: string } | null>
  auditGuest(input: {
    projectId: string | null
    linkId: string | null
    sessionId: string | null
    action: string
    outcome: "success" | "denied"
    metadata?: Record<string, unknown>
  }): Promise<void>
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function derivePassword(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "base64url"), 64, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

async function passwordDigest(password: string) {
  const salt = randomBytes(16).toString("base64url")
  const hash = await derivePassword(password, salt)
  return { salt, hash: hash.toString("base64url") }
}

async function passwordMatches(password: string, salt: string, expected: string) {
  const actual = await derivePassword(password, salt)
  const expectedBuffer = Buffer.from(expected, "base64url")
  return (
    expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer)
  )
}

export class ReviewLinkService {
  constructor(
    private readonly repository: ReviewLinkRepository,
    private readonly storage: AssetStorage,
    private readonly tokenSecret: string,
    private readonly publicBaseURL: string,
    private readonly deliverIdentityCode: ReviewIdentityDelivery,
  ) {}

  async createLink(
    command: {
      actorId: string
      projectId: string
    } & CreateReviewLinkBody,
  ) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    const expiresAt = new Date(command.expiresAt)
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new AppError("REVIEW_LINK_EXPIRY_INVALID", "有效期必须晚于当前时间", 400)
    }
    const fileIds = [...new Set(command.fileIds)]
    if (fileIds.length !== command.fileIds.length) {
      throw new AppError("REVIEW_LINK_FILES_INVALID", "审片版本不能重复", 400)
    }
    const linkId = randomUUID()
    const token = this.linkToken(linkId)
    const password = command.password
      ? await passwordDigest(command.password)
      : { salt: null, hash: null }
    const requestHash = sha256(
      JSON.stringify({
        expiresAt: expiresAt.toISOString(),
        fileIds,
        password: command.password ? sha256(command.password) : null,
        scope: command.scope,
      }),
    )
    const result = await this.repository.createLink({
      ...command,
      fileIds,
      expiresAt: expiresAt.toISOString(),
      linkId,
      tokenHash: sha256(token),
      passwordSalt: password.salt,
      passwordHash: password.hash,
      requestHash,
    })
    if ("kind" in result) {
      throw new AppError(
        "REVIEW_LINK_FILES_INVALID",
        "只能分享当前项目中的视频审片版本",
        409,
      )
    }
    return { item: this.publicLink(result.item), replayed: result.replayed }
  }

  async listLinks(actorId: string, projectId: string) {
    await this.assertProjectAccess(actorId, projectId, "read")
    return {
      items: (await this.repository.listLinks(projectId)).map((link) =>
        this.publicLink(link),
      ),
    }
  }

  async revokeLink(
    actorId: string,
    projectId: string,
    linkId: string,
    idempotencyKey: string,
  ) {
    await this.assertProjectAccess(actorId, projectId, "write")
    const link = await this.repository.revokeLink(
      actorId,
      projectId,
      linkId,
      idempotencyKey,
    )
    if (!link) throw new AppError("RESOURCE_NOT_FOUND", "客户审片链接不存在", 404)
    return this.publicLink(link)
  }

  async requestIdentity(token: string, body: RequestReviewIdentityBody) {
    const normalizedDisplayName = body.displayName.trim()
    if (!normalizedDisplayName) {
      throw new AppError("REVIEW_DISPLAY_NAME_INVALID", "请输入访客显示名", 400)
    }
    const email = body.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError("REVIEW_IDENTITY_EMAIL_INVALID", "请输入有效的邮箱地址", 400)
    }
    const tokenHash = sha256(token)
    const link = await this.repository.findLinkByTokenHash(tokenHash)
    if (!link) {
      await this.repository.auditGuest({
        projectId: null,
        linkId: null,
        sessionId: null,
        action: "review-link.access",
        outcome: "denied",
        metadata: { reason: "invalid-token", tokenPrefix: tokenHash.slice(0, 12) },
      })
      throw new AppError("REVIEW_LINK_UNAVAILABLE", "审片链接无效或已失效", 404)
    }
    await this.assertLinkActive(link)
    if (
      link.passwordHash &&
      (!body.password ||
        !link.passwordSalt ||
        !(await passwordMatches(body.password, link.passwordSalt, link.passwordHash)))
    ) {
      await this.repository.auditGuest({
        projectId: link.projectId,
        linkId: link.id,
        sessionId: null,
        action: "review-link.access",
        outcome: "denied",
        metadata: { reason: "password" },
      })
      throw new AppError("REVIEW_LINK_PASSWORD_INVALID", "审片密码不正确", 401)
    }
    const challengeId = randomUUID()
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const created = await this.repository.createIdentityChallenge({
      id: challengeId,
      linkId: link.id,
      displayName: normalizedDisplayName,
      email,
      codeHash: this.identityCodeHash(challengeId, code),
      expiresAt,
      createdAfter: new Date(Date.now() - 60 * 1000).toISOString(),
    })
    if (created === "rate_limited") {
      throw new AppError(
        "REVIEW_IDENTITY_RATE_LIMITED",
        "验证码发送过于频繁，请稍后重试",
        429,
      )
    }
    let delivery: Awaited<ReturnType<ReviewIdentityDelivery>>
    try {
      delivery = await this.deliverIdentityCode({
        email,
        displayName: normalizedDisplayName,
        code,
        expiresAt,
      })
    } catch (error) {
      await this.repository.deleteIdentityChallenge(challengeId)
      if (error instanceof AppError) throw error
      throw new AppError("REVIEW_IDENTITY_DELIVERY_FAILED", "验证码发送失败", 503)
    }
    await this.repository.auditGuest({
      projectId: link.projectId,
      linkId: link.id,
      sessionId: null,
      action: "review-identity.challenge.requested",
      outcome: "success",
      metadata: { emailMasked: maskReviewIdentityEmail(email) },
    })
    return {
      challengeId,
      emailMasked: maskReviewIdentityEmail(email),
      expiresAt,
      ...delivery,
    } satisfies ReviewIdentityChallenge
  }

  async openSession(token: string, challengeId: string, code: string) {
    const link = await this.repository.findLinkByTokenHash(sha256(token))
    if (!link) {
      throw new AppError("REVIEW_LINK_UNAVAILABLE", "审片链接无效或已失效", 404)
    }
    await this.assertLinkActive(link)
    const rawSessionToken = randomBytes(32).toString("base64url")
    const sessionExpiresAt = new Date(
      Math.min(new Date(link.expiresAt).getTime(), Date.now() + 12 * 60 * 60 * 1000),
    ).toISOString()
    const result = await this.repository.verifyIdentityAndCreateSession({
      challengeId,
      linkId: link.id,
      codeHash: this.identityCodeHash(challengeId, code),
      sessionId: randomUUID(),
      sessionTokenHash: sha256(rawSessionToken),
      sessionExpiresAt,
    })
    if (result.kind !== "verified") {
      await this.repository.auditGuest({
        projectId: link.projectId,
        linkId: link.id,
        sessionId: null,
        action: "review-identity.verification",
        outcome: "denied",
        metadata: { challengeId, reason: result.kind },
      })
      const errors = {
        invalid: ["REVIEW_IDENTITY_CODE_INVALID", "验证码不正确", 401],
        expired: ["REVIEW_IDENTITY_CHALLENGE_EXPIRED", "验证码已过期", 400],
        consumed: ["REVIEW_IDENTITY_CHALLENGE_CONSUMED", "验证码已使用", 409],
        attempts_exhausted: [
          "REVIEW_IDENTITY_ATTEMPTS_EXHAUSTED",
          "验证码错误次数过多，请重新获取",
          429,
        ],
      } as const
      const [errorCode, message, status] = errors[result.kind]
      throw new AppError(errorCode, message, status)
    }
    const workspace = result.workspace
    await this.repository.auditGuest({
      projectId: link.projectId,
      linkId: link.id,
      sessionId: workspace.sessionId,
      action: "review-identity.verified",
      outcome: "success",
      metadata: { emailMasked: workspace.verifiedIdentity.emailMasked },
    })
    await this.repository.auditGuest({
      projectId: link.projectId,
      linkId: link.id,
      sessionId: workspace.sessionId,
      action: "review-link.access",
      outcome: "success",
    })
    return { workspace, rawSessionToken }
  }

  async getWorkspace(linkId: string, sessionToken: string) {
    return this.requireSession(linkId, sessionToken)
  }

  async listComments(linkId: string, sessionToken: string, fileId: string) {
    const session = await this.requireSession(linkId, sessionToken)
    const items = await this.repository.listComments(session.sessionId, linkId, fileId)
    if (!items) throw new AppError("RESOURCE_NOT_FOUND", "审片版本不存在", 404)
    return { items }
  }

  async createComment(
    linkId: string,
    sessionToken: string,
    fileId: string,
    body: CreateReviewCommentBody,
  ) {
    const session = await this.requireSession(linkId, sessionToken)
    if (!session.scope.canComment) {
      throw new AppError("REVIEW_SCOPE_DENIED", "此链接不允许评论", 403)
    }
    const result = await this.repository.createComment({
      ...body,
      sessionId: session.sessionId,
      linkId,
      projectId: session.projectId,
      fileId,
      displayName: session.displayName,
    })
    if (!result) throw new AppError("RESOURCE_NOT_FOUND", "审片版本不存在", 404)
    return result
  }

  async approveFile(
    linkId: string,
    sessionToken: string,
    fileId: string,
    body: PublicReviewApprovalBody,
  ) {
    const session = await this.requireSession(linkId, sessionToken)
    if (!session.scope.canApprove) {
      throw new AppError("REVIEW_SCOPE_DENIED", "此链接不允许确认成片", 403)
    }
    const item = await this.repository.approveFile({
      ...body,
      sessionId: session.sessionId,
      linkId,
      projectId: session.projectId,
      fileId,
      displayName: session.displayName,
    })
    if (!item) throw new AppError("RESOURCE_CONFLICT", "版本已变化，请重新载入", 409)
    return item
  }

  async getContentUrl(
    linkId: string,
    sessionToken: string,
    fileId: string,
    download = false,
  ) {
    const session = await this.requireSession(linkId, sessionToken)
    if (download && !session.scope.canDownload) {
      await this.repository.auditGuest({
        projectId: session.projectId,
        linkId,
        sessionId: session.sessionId,
        action: "review-file.download-url",
        outcome: "denied",
        metadata: { fileId, reason: "scope" },
      })
      throw new AppError("REVIEW_SCOPE_DENIED", "此链接不允许下载", 403)
    }
    const source = await this.repository.getContentSource(
      session.sessionId,
      linkId,
      fileId,
    )
    if (!source) throw new AppError("RESOURCE_NOT_FOUND", "审片媒体尚不可用", 404)
    const url = await this.storage.createDownloadUrl(
      source.objectKey,
      download ? { attachment: true } : undefined,
    )
    await this.repository.auditGuest({
      projectId: session.projectId,
      linkId,
      sessionId: session.sessionId,
      action: download ? "review-file.download-url" : "review-file.content-url",
      outcome: "success",
      metadata: { fileId },
    })
    return { url, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }
  }

  private async requireSession(linkId: string, sessionToken: string) {
    const session = await this.repository.getSession(linkId, sha256(sessionToken))
    if (!session || new Date(session.expiresAt) <= new Date()) {
      throw new AppError("REVIEW_SESSION_REQUIRED", "审片会话已失效", 401)
    }
    return session
  }

  private async assertLinkActive(link: StoredReviewLink) {
    if (link.revokedAt || new Date(link.expiresAt) <= new Date()) {
      await this.repository.auditGuest({
        projectId: link.projectId,
        linkId: link.id,
        sessionId: null,
        action: "review-link.access",
        outcome: "denied",
        metadata: { reason: link.revokedAt ? "revoked" : "expired" },
      })
      throw new AppError("REVIEW_LINK_UNAVAILABLE", "审片链接无效或已失效", 404)
    }
  }

  private async assertProjectAccess(
    actorId: string,
    projectId: string,
    operation: "read" | "write",
  ) {
    const access = await this.repository.getProjectAccess(actorId, projectId)
    const allowed = accessAllows(
      access,
      operation === "read" ? "project.read" : "review.manage",
      operation,
    )
    if (!allowed) {
      throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
    }
  }

  private linkToken(linkId: string) {
    return createHmac("sha256", this.tokenSecret).update(linkId).digest("base64url")
  }

  private identityCodeHash(challengeId: string, code: string) {
    return createHmac("sha256", this.tokenSecret)
      .update(`${challengeId}:${code}`)
      .digest("hex")
  }

  private publicLink(link: StoredReviewLink): ReviewLink {
    const {
      passwordHash: _hash,
      passwordSalt: _salt,
      requestHash: _request,
      ...item
    } = link
    return {
      ...item,
      url: `${this.publicBaseURL.replace(/\/$/, "")}/#/review/${this.linkToken(link.id)}`,
    }
  }
}

export function maskReviewIdentityEmail(email: string) {
  const [local, domain] = email.split("@")
  return `${local.slice(0, 1)}${"*".repeat(Math.min(Math.max(local.length - 1, 2), 6))}@${domain}`
}
