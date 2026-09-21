import type {
  CreateReviewLinkCommand,
  GuestReviewApprovalCommand,
  GuestReviewCommentCommand,
  ReviewLinkRepository,
  ReviewSessionContext,
  ScriptRepository,
  StoredReviewLink,
} from "@shadowproducer/application"
import { AppError, ReviewLinkService, ScriptService } from "@shadowproducer/application"
import type { PublicReviewFile, ReviewComment } from "@shadowproducer/contracts"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"

const reviewFile: PublicReviewFile = {
  id: "review-file-1",
  name: "冬夜咖啡_主片",
  version: "v12",
  status: "审阅中",
  duration: "00:30",
  comments: 0,
  approvedBy: null,
  approvedAt: null,
  revision: 1,
}

class MemoryReviewLinkRepository implements ReviewLinkRepository {
  link: StoredReviewLink | null = null
  linkTokenHash = ""
  session: (ReviewSessionContext & { tokenHash: string }) | null = null
  challenge: {
    id: string
    linkId: string
    displayName: string
    email: string
    codeHash: string
    expiresAt: string
    attemptCount: number
    consumedAt: string | null
    createdAt: string
  } | null = null
  comments: ReviewComment[] = []
  file = structuredClone(reviewFile)
  playbackKey = "reviews/main-v12.mp4"
  audits: Parameters<ReviewLinkRepository["auditGuest"]>[0][] = []

  async getProjectAccess(actorId: string, projectId: string) {
    return actorId === "account-fanxing" && projectId === "winter-coffee"
      ? { canRead: true, canWrite: true }
      : null
  }

  async createLink(command: CreateReviewLinkCommand) {
    this.linkTokenHash = command.tokenHash
    this.link = {
      id: command.linkId,
      projectId: command.projectId,
      fileIds: command.fileIds,
      scope: command.scope,
      expiresAt: command.expiresAt,
      revokedAt: null,
      createdAt: new Date().toISOString(),
      passwordSalt: command.passwordSalt,
      passwordHash: command.passwordHash,
      requestHash: command.requestHash,
    }
    return { item: this.link, replayed: false }
  }

  async listLinks() {
    return this.link ? [this.link] : []
  }

  async revokeLink() {
    if (!this.link) return null
    this.link = { ...this.link, revokedAt: new Date().toISOString() }
    return this.link
  }

  async findLinkByTokenHash(tokenHash: string) {
    return this.link && this.linkTokenHash === tokenHash ? this.link : null
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
    if (
      this.challenge &&
      this.challenge.linkId === input.linkId &&
      this.challenge.email === input.email &&
      this.challenge.createdAt > input.createdAfter &&
      !this.challenge.consumedAt
    ) {
      return "rate_limited" as const
    }
    this.challenge = {
      id: input.id,
      linkId: input.linkId,
      displayName: input.displayName,
      email: input.email,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attemptCount: 0,
      consumedAt: null,
      createdAt: new Date().toISOString(),
    }
    return "created" as const
  }

  async deleteIdentityChallenge(id: string) {
    if (this.challenge?.id === id && !this.challenge.consumedAt) this.challenge = null
  }

  async verifyIdentityAndCreateSession(input: {
    challengeId: string
    linkId: string
    codeHash: string
    sessionId: string
    sessionTokenHash: string
    sessionExpiresAt: string
  }) {
    const challenge = this.challenge
    if (
      !challenge ||
      challenge.id !== input.challengeId ||
      challenge.linkId !== input.linkId
    ) {
      return { kind: "invalid" } as const
    }
    if (challenge.consumedAt) return { kind: "consumed" } as const
    if (new Date(challenge.expiresAt) <= new Date()) return { kind: "expired" } as const
    if (challenge.attemptCount >= 5) return { kind: "attempts_exhausted" } as const
    if (challenge.codeHash !== input.codeHash) {
      challenge.attemptCount += 1
      return {
        kind: challenge.attemptCount >= 5 ? "attempts_exhausted" : "invalid",
      } as const
    }
    if (!this.link) throw new Error("link missing")
    challenge.consumedAt = new Date().toISOString()
    this.session = {
      sessionId: input.sessionId,
      linkId: input.linkId,
      projectId: this.link.projectId,
      projectName: "冬夜咖啡",
      displayName: challenge.displayName,
      verifiedIdentity: {
        emailMasked: "c*****@example.com",
        verifiedAt: challenge.consumedAt,
      },
      scope: this.link.scope,
      expiresAt: input.sessionExpiresAt,
      files: [structuredClone(this.file)],
      tokenHash: input.sessionTokenHash,
    }
    return { kind: "verified", workspace: this.session } as const
  }

  async getSession(linkId: string, tokenHash: string) {
    if (
      !this.session ||
      !this.link ||
      this.link.revokedAt ||
      this.session.linkId !== linkId ||
      this.session.tokenHash !== tokenHash
    ) {
      return null
    }
    return { ...this.session, files: [structuredClone(this.file)] }
  }

  async listComments(_sessionId: string, linkId: string, fileId: string) {
    return this.link?.id === linkId && fileId === this.file.id
      ? structuredClone(this.comments)
      : null
  }

  async createComment(command: GuestReviewCommentCommand) {
    if (command.fileId !== this.file.id) return null
    const parentCommentId = command.parentCommentId ?? null
    if (parentCommentId) {
      const parent = this.comments.find((comment) => comment.id === parentCommentId)
      if (!parent) {
        throw new AppError(
          "REVIEW_COMMENT_PARENT_NOT_FOUND",
          "要回复的审片意见不存在",
          404,
        )
      }
      if (parent.parentCommentId) {
        throw new AppError(
          "REVIEW_COMMENT_REPLY_DEPTH_EXCEEDED",
          "审片意见只支持一级回复",
          400,
        )
      }
    }
    const item: ReviewComment = {
      id: `comment-${this.comments.length + 1}`,
      fileId: command.fileId,
      parentCommentId,
      version: this.file.version,
      author: command.displayName,
      authorId: `guest:${command.sessionId}`,
      initials: command.displayName.slice(0, 2),
      timecode: command.timecode,
      text: command.text,
      state: "open",
      revision: 1,
      createdAt: new Date().toISOString(),
    }
    this.comments.push(item)
    return { item, replayed: false }
  }

  async approveFile(command: GuestReviewApprovalCommand) {
    if (
      command.fileId !== this.file.id ||
      command.expectedRevision !== this.file.revision
    ) {
      return null
    }
    this.file = {
      ...this.file,
      status: "已通过",
      approvedBy: command.displayName,
      approvedAt: new Date().toISOString(),
      revision: this.file.revision + 1,
    }
    return structuredClone(this.file)
  }

  async getContentSource(_sessionId: string, linkId: string, fileId: string) {
    return this.link?.id === linkId && fileId === this.file.id
      ? { objectKey: this.playbackKey }
      : null
  }

  async auditGuest(input: Parameters<ReviewLinkRepository["auditGuest"]>[0]) {
    this.audits.push(input)
  }
}

const unusedScriptRepository: ScriptRepository = {
  async getProjectAccess() {
    return null
  },
  async listDocuments() {
    return []
  },
  async createDocument() {
    throw new Error("unused")
  },
  async getWorkspace() {
    return null
  },
  async updateVersion() {
    return null
  },
  async createVersion() {
    return null
  },
  async createComment() {
    return null
  },
  async updateComment() {
    return null
  },
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

async function createTestApp(
  deliverIdentityCode = async (input: { code: string }) => ({
    developmentCode: input.code,
  }),
) {
  const repository = new MemoryReviewLinkRepository()
  const downloadCalls: Array<{
    objectKey: string
    options?: { attachment?: boolean }
  }> = []
  const service = new ReviewLinkService(
    repository,
    {
      async readTextObject() {
        return '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=70400,CODECS="mp4a.40.2"\nv0.m3u8\n'
      },
      async ensureReady() {},
      async createMultipartUpload() {
        throw new Error("unused")
      },
      async listMultipartParts() {
        return []
      },
      async createMultipartPartUploads() {
        return []
      },
      async completeMultipartUpload() {
        throw new Error("unused")
      },
      async abortMultipartUpload() {},
      async createDownloadUrl(objectKey, options) {
        downloadCalls.push({ objectKey, options })
        return "https://media.test/reviews/main-v12.mp4"
      },
    },
    "test-review-secret",
    "http://127.0.0.1:3211",
    deliverIdentityCode,
  )
  const app = await buildApp({
    scriptService: new ScriptService(unusedScriptRepository),
    reviewLinkService: service,
    logger: false,
  })
  apps.push(app)
  return { app, repository, downloadCalls }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("external review link API", () => {
  it("keeps review access scoped to a password session and invalidates it on revoke", async () => {
    const { app, repository, downloadCalls } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-links",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        fileIds: [reviewFile.id],
        scope: {
          canComment: true,
          canCompare: true,
          canDownload: false,
          canApprove: true,
        },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        password: "client-secret",
        idempotencyKey: "create-review-link-1",
      },
    })
    expect(created.statusCode).toBe(201)
    const link = created.json().item as { id: string; url: string }
    const token = link.url.split("/").at(-1)
    expect(token).toBeTruthy()

    const denied = await app.inject({
      method: "POST",
      url: `/review/${token}/identity-challenges`,
      payload: {
        displayName: "客户验收",
        email: "client@example.com",
        password: "wrong-secret",
      },
    })
    expect(denied.statusCode).toBe(401)

    const challenge = await app.inject({
      method: "POST",
      url: `/review/${token}/identity-challenges`,
      payload: {
        displayName: "客户验收",
        email: "client@example.com",
        password: "client-secret",
      },
    })
    expect(challenge.statusCode).toBe(201)
    expect(challenge.json().emailMasked).toBe("c*****@example.com")
    const developmentCode = challenge.json().developmentCode as string
    const incorrectCode = developmentCode === "000000" ? "111111" : "000000"

    const wrongCode = await app.inject({
      method: "POST",
      url: `/review/${token}/session`,
      payload: { challengeId: challenge.json().challengeId, code: incorrectCode },
    })
    expect(wrongCode.statusCode).toBe(401)

    const opened = await app.inject({
      method: "POST",
      url: `/review/${token}/session`,
      payload: { challengeId: challenge.json().challengeId, code: developmentCode },
    })
    expect(opened.statusCode).toBe(201)
    expect(opened.json().verifiedIdentity.emailMasked).toBe("c*****@example.com")
    const setCookie = opened.headers["set-cookie"]
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0]
    expect(cookie).toContain("shadow_review_session=")

    const reusedCode = await app.inject({
      method: "POST",
      url: `/review/${token}/session`,
      payload: { challengeId: challenge.json().challengeId, code: developmentCode },
    })
    expect(reusedCode.statusCode).toBe(409)

    const comment = await app.inject({
      method: "POST",
      url: `/review/${link.id}/files/${reviewFile.id}/comments`,
      headers: { cookie: cookie ?? "" },
      payload: {
        version: "v12",
        timecode: "00:07.120",
        text: "站台环境声可以再收一点。",
        parentCommentId: null,
        idempotencyKey: "guest-comment-1",
      },
    })
    expect(comment.statusCode).toBe(201)
    expect(comment.json().item.author).toBe("客户验收")
    expect(comment.json().item.parentCommentId).toBeNull()

    const reply = await app.inject({
      method: "POST",
      url: `/review/${link.id}/files/${reviewFile.id}/comments`,
      headers: { cookie: cookie ?? "" },
      payload: {
        version: "v12",
        timecode: "00:07.120",
        text: "补充：环境声也可以保留一版。",
        parentCommentId: comment.json().item.id,
        idempotencyKey: "guest-comment-reply-1",
      },
    })
    const nestedReply = await app.inject({
      method: "POST",
      url: `/review/${link.id}/files/${reviewFile.id}/comments`,
      headers: { cookie: cookie ?? "" },
      payload: {
        version: "v12",
        timecode: "00:07.120",
        text: "不应创建二级回复。",
        parentCommentId: reply.json().item.id,
        idempotencyKey: "guest-comment-reply-2",
      },
    })
    const comments = await app.inject({
      method: "GET",
      url: `/review/${link.id}/files/${reviewFile.id}/comments`,
      headers: { cookie: cookie ?? "" },
    })
    expect(reply.statusCode).toBe(201)
    expect(reply.json().item.parentCommentId).toBe(comment.json().item.id)
    expect(nestedReply.statusCode).toBe(400)
    expect(comments.json().items).toHaveLength(2)

    const content = await app.inject({
      method: "GET",
      url: `/review/${link.id}/files/${reviewFile.id}/content-url`,
      headers: { cookie: cookie ?? "" },
    })
    expect(content.statusCode).toBe(200)
    expect(content.json().url).toContain("media.test")
    expect(downloadCalls).toEqual([
      { objectKey: "reviews/main-v12.mp4", options: undefined },
    ])

    const downloadDenied = await app.inject({
      method: "GET",
      url: `/review/${link.id}/files/${reviewFile.id}/content-url?download=1`,
      headers: { cookie: cookie ?? "" },
    })
    expect(downloadDenied.statusCode).toBe(403)
    expect(downloadDenied.json().code).toBe("REVIEW_SCOPE_DENIED")
    expect(downloadCalls).toHaveLength(1)
    expect(repository.audits).toContainEqual(
      expect.objectContaining({
        action: "review-file.download-url",
        outcome: "denied",
        metadata: { fileId: reviewFile.id, reason: "scope" },
      }),
    )

    if (!repository.session) throw new Error("review session missing")
    repository.session.scope = { ...repository.session.scope, canDownload: true }
    const downloadAllowed = await app.inject({
      method: "GET",
      url: `/review/${link.id}/files/${reviewFile.id}/content-url?download=1`,
      headers: { cookie: cookie ?? "" },
    })
    expect(downloadAllowed.statusCode).toBe(200)
    expect(downloadCalls.at(-1)).toEqual({
      objectKey: "reviews/main-v12.mp4",
      options: { attachment: true },
    })
    expect(repository.audits).toContainEqual(
      expect.objectContaining({
        action: "review-file.download-url",
        outcome: "success",
        metadata: { fileId: reviewFile.id },
      }),
    )

    repository.playbackKey =
      "reviews/preview-v2.hls/11111111-1111-1111-1111-111111111111/master.m3u8"
    const playback = `/review/${link.id}/files/${reviewFile.id}/playback`
    const manifest = await app.inject({
      method: "GET",
      url: playback,
      headers: { cookie: cookie ?? "" },
    })
    expect(manifest.statusCode).toBe(200)
    expect(manifest.body).toContain("?file=v0.m3u8")
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${playback}?file=v0_000000.m4s`,
          headers: { cookie: cookie ?? "" },
        })
      ).statusCode,
    ).toBe(302)
    expect((await app.inject({ method: "GET", url: playback })).statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${playback}?file=../secret`,
          headers: { cookie: cookie ?? "" },
        })
      ).statusCode,
    ).toBe(400)

    const approval = await app.inject({
      method: "POST",
      url: `/review/${link.id}/files/${reviewFile.id}/approve`,
      headers: { cookie: cookie ?? "" },
      payload: { expectedRevision: 1, idempotencyKey: "guest-approve-1" },
    })
    expect(approval.statusCode).toBe(200)
    expect(approval.json().approvedBy).toBe("客户验收")

    const revoked = await app.inject({
      method: "POST",
      url: `/v1/projects/winter-coffee/review-links/${link.id}/revoke`,
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { idempotencyKey: "revoke-review-link-1" },
    })
    expect(revoked.statusCode).toBe(200)

    const afterRevoke = await app.inject({
      method: "GET",
      url: `/review/${link.id}`,
      headers: { cookie: cookie ?? "" },
    })
    expect(afterRevoke.statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${playback}?file=v0_000000.m4s`,
          headers: { cookie: cookie ?? "" },
        })
      ).statusCode,
    ).toBe(401)
  })

  it("rate limits challenges, locks repeated guesses, and removes failed deliveries", async () => {
    const { app, repository } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-links",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        fileIds: [reviewFile.id],
        scope: {
          canComment: true,
          canCompare: false,
          canDownload: false,
          canApprove: false,
        },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        idempotencyKey: "create-review-link-identity-errors",
      },
    })
    const token = (created.json().item.url as string).split("/").at(-1)
    const payload = { displayName: "客户验收", email: "client@example.com" }
    const challenge = await app.inject({
      method: "POST",
      url: `/review/${token}/identity-challenges`,
      payload,
    })
    expect(challenge.statusCode).toBe(201)
    const incorrectCode =
      challenge.json().developmentCode === "000000" ? "111111" : "000000"

    const repeated = await app.inject({
      method: "POST",
      url: `/review/${token}/identity-challenges`,
      payload,
    })
    expect(repeated.statusCode).toBe(429)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const rejected = await app.inject({
        method: "POST",
        url: `/review/${token}/session`,
        payload: { challengeId: challenge.json().challengeId, code: incorrectCode },
      })
      expect(rejected.statusCode).toBe(attempt === 5 ? 429 : 401)
    }
    const locked = await app.inject({
      method: "POST",
      url: `/review/${token}/session`,
      payload: {
        challengeId: challenge.json().challengeId,
        code: challenge.json().developmentCode,
      },
    })
    expect(locked.statusCode).toBe(429)

    const { app: failingApp, repository: failingRepository } = await createTestApp(
      async () => {
        throw new Error("delivery unavailable")
      },
    )
    const failingLink = await failingApp.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-links",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        fileIds: [reviewFile.id],
        scope: {
          canComment: true,
          canCompare: false,
          canDownload: false,
          canApprove: false,
        },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        idempotencyKey: "create-review-link-delivery-error",
      },
    })
    const failingToken = (failingLink.json().item.url as string).split("/").at(-1)
    const deliveryFailure = await failingApp.inject({
      method: "POST",
      url: `/review/${failingToken}/identity-challenges`,
      payload,
    })
    expect(deliveryFailure.statusCode).toBe(503)
    expect(failingRepository.challenge).toBeNull()
    expect(repository.challenge?.attemptCount).toBe(5)
  })
})
