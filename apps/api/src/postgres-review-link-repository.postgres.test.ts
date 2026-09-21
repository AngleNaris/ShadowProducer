import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { PostgresReviewLinkRepository } from "./postgres-review-link-repository"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 2 })
const database = createDatabase(databaseUrl, pool)
const repository = new PostgresReviewLinkRepository(database)
const runId = `pg-review-identity-${process.pid}-${Date.now().toString(36)}`
const accountId = `${runId}-account`
const recipientId = `${runId}-recipient`
const viewerId = `${runId}-viewer`
const teamId = `${runId}-team`
const projectId = `${runId}-project`
const fileId = `${runId}-file`
const assetId = `${runId}-asset`
const linkId = randomUUID()
const archiveSessionId = randomUUID()
const archiveSessionToken = `${runId}-archive-session-token`

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values([
      { id: accountId, display_name: "Review Owner", email: null },
      { id: recipientId, display_name: "Review Recipient", email: null },
      { id: viewerId, display_name: "Review Viewer", email: null },
    ])
    .execute()
  await database.insertInto("teams").values({ id: teamId, name: runId }).execute()
  await database
    .insertInto("projects")
    .values({ id: projectId, team_id: teamId, name: "Identity Review" })
    .execute()
  await database
    .insertInto("team_memberships")
    .values([
      { team_id: teamId, account_id: accountId, role: "producer" },
      { team_id: teamId, account_id: recipientId, role: "member" },
      { team_id: teamId, account_id: viewerId, role: "viewer" },
    ])
    .execute()
  await database
    .insertInto("project_memberships")
    .values([
      { project_id: projectId, account_id: accountId, role: "producer" },
      { project_id: projectId, account_id: recipientId, role: "producer" },
      { project_id: projectId, account_id: viewerId, role: "viewer" },
    ])
    .execute()
  await database
    .insertInto("team_assets")
    .values({
      id: assetId,
      team_id: teamId,
      project_id: projectId,
      folder_id: null,
      name: "Review v1.mp4",
      kind: "视频",
      mime_type: "video/mp4",
      size_bytes: 1024,
      object_key: `${runId}/review-v1.mp4`,
      checksum_sha256: "a".repeat(64),
      status: "ready",
      favorite: false,
      rating: 0,
      tags: [],
      note: "",
      thumbnail_url: null,
      created_by_account_id: accountId,
      revision: 1,
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
    })
    .execute()
  await database
    .insertInto("review_files")
    .values({
      id: fileId,
      project_id: projectId,
      name: "Review v1",
      version: "v1",
      type: "video",
      status: "审阅中",
      duration: "00:30",
      asset_id: assetId,
    })
    .execute()
  await database
    .insertInto("review_links")
    .values({
      id: linkId,
      token_hash: `${runId}-token`,
      project_id: projectId,
      can_comment: true,
      can_compare: false,
      can_download: true,
      can_approve: true,
      expires_at: new Date(Date.now() + 60_000),
      created_by_account_id: accountId,
      idempotency_key: `${runId}-link`,
      request_hash: `${runId}-request`,
    })
    .execute()
  await database
    .insertInto("review_link_files")
    .values({ link_id: linkId, file_id: fileId, sort_order: 0 })
    .execute()
  await database
    .insertInto("review_sessions")
    .values({
      id: archiveSessionId,
      link_id: linkId,
      token_hash: archiveSessionToken,
      display_name: "Archive Reviewer",
      verified_email: "archive@example.com",
      identity_verified_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
    })
    .execute()
})

afterAll(async () => {
  await database.deleteFrom("teams").where("id", "=", teamId).execute()
  await database
    .deleteFrom("accounts")
    .where("id", "in", [accountId, recipientId, viewerId])
    .execute()
  await database.destroy()
})

describe("Postgres review identity verification", () => {
  it("atomically consumes a challenge into a verified session", async () => {
    const challengeId = randomUUID()
    const codeHash = "a".repeat(64)
    const created = await repository.createIdentityChallenge({
      id: challengeId,
      linkId,
      displayName: "Client Reviewer",
      email: "client@example.com",
      codeHash,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAfter: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(created).toBe("created")
    expect(
      await repository.createIdentityChallenge({
        id: randomUUID(),
        linkId,
        displayName: "Client Reviewer",
        email: "client@example.com",
        codeHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAfter: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe("rate_limited")

    const wrong = await repository.verifyIdentityAndCreateSession({
      challengeId,
      linkId,
      codeHash: "b".repeat(64),
      sessionId: randomUUID(),
      sessionTokenHash: `${runId}-unused-session-token`,
      sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(wrong.kind).toBe("invalid")

    const sessionId = randomUUID()
    const sessionTokenHash = `${runId}-session-token`
    const verified = await repository.verifyIdentityAndCreateSession({
      challengeId,
      linkId,
      codeHash,
      sessionId,
      sessionTokenHash,
      sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(verified).toMatchObject({
      kind: "verified",
      workspace: {
        displayName: "Client Reviewer",
        verifiedIdentity: { emailMasked: "c*****@example.com" },
      },
    })
    expect(await repository.getSession(linkId, sessionTokenHash)).toMatchObject({
      sessionId,
      verifiedIdentity: { emailMasked: "c*****@example.com" },
    })
    expect(
      await repository.verifyIdentityAndCreateSession({
        challengeId,
        linkId,
        codeHash,
        sessionId: randomUUID(),
        sessionTokenHash: `${runId}-reused-session-token`,
        sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toEqual({ kind: "consumed" })
  })

  it("hides archived review files without breaking the existing link", async () => {
    await expect(
      repository.getSession(linkId, archiveSessionToken),
    ).resolves.toMatchObject({
      files: [expect.objectContaining({ id: fileId, revision: 1 })],
    })
    await expect(
      repository.getContentSource(archiveSessionId, linkId, fileId),
    ).resolves.toBeNull()
    await expect(
      repository.getContentSource(archiveSessionId, linkId, fileId, true),
    ).resolves.toEqual({ objectKey: `${runId}/review-v1.mp4` })
    await database
      .insertInto("asset_media")
      .values({
        asset_id: assetId,
        status: "ready",
        review_proxy_object_key: `${runId}/preview.mp4`,
      })
      .execute()
    await expect(
      repository.getContentSource(archiveSessionId, linkId, fileId),
    ).resolves.toEqual({ objectKey: `${runId}/preview.mp4` })

    await database
      .updateTable("review_files")
      .set({ archived_at: new Date(), revision: 2 })
      .where("id", "=", fileId)
      .execute()

    await expect(
      repository.getSession(linkId, archiveSessionToken),
    ).resolves.toMatchObject({ files: [] })
    await expect(
      repository.listComments(archiveSessionId, linkId, fileId),
    ).resolves.toBeNull()
    await expect(
      repository.createComment({
        sessionId: archiveSessionId,
        linkId,
        projectId,
        fileId,
        displayName: "Archive Reviewer",
        version: "v1",
        timecode: "00:01.000",
        text: "This must not be written",
        idempotencyKey: `${runId}-archived-comment`,
      }),
    ).resolves.toBeNull()
    await expect(
      repository.approveFile({
        sessionId: archiveSessionId,
        linkId,
        projectId,
        fileId,
        displayName: "Archive Reviewer",
        expectedRevision: 2,
        idempotencyKey: `${runId}-archived-approval`,
      }),
    ).resolves.toBeNull()
    await expect(
      repository.getContentSource(archiveSessionId, linkId, fileId),
    ).resolves.toBeNull()
    await expect(
      database
        .selectFrom("review_link_files")
        .select("file_id")
        .where("link_id", "=", linkId)
        .execute(),
    ).resolves.toEqual([{ file_id: fileId }])

    await database
      .updateTable("review_files")
      .set({ archived_at: null, revision: 3 })
      .where("id", "=", fileId)
      .execute()
    await expect(
      repository.getSession(linkId, archiveSessionToken),
    ).resolves.toMatchObject({
      files: [expect.objectContaining({ id: fileId, revision: 3 })],
    })
  })

  it("notifies eligible project members once for guest review activity", async () => {
    const commentCommand = {
      sessionId: archiveSessionId,
      linkId,
      projectId,
      fileId,
      displayName: "Archive Reviewer",
      version: "forged-version",
      timecode: "00:02.000",
      text: "Please hold this frame longer",
      idempotencyKey: `${runId}-guest-comment-notification`,
    }
    const created = await repository.createComment(commentCommand)
    const replay = await repository.createComment(commentCommand)
    if (!created || !replay) throw new Error("Guest comment failed")
    expect(replay).toMatchObject({ replayed: true, item: created.item })
    expect(created.item.parentCommentId).toBeNull()
    const replyCommand = {
      ...commentCommand,
      text: "Confirmed; we will hold the frame",
      parentCommentId: created.item.id,
      idempotencyKey: `${runId}-guest-comment-reply-notification`,
    }
    const reply = await repository.createComment(replyCommand)
    const replyReplay = await repository.createComment(replyCommand)
    if (!reply || !replyReplay) throw new Error("Guest reply failed")
    expect(reply).toMatchObject({
      replayed: false,
      item: { parentCommentId: created.item.id },
    })
    expect(replyReplay).toMatchObject({ replayed: true, item: reply.item })
    await expect(
      repository.createComment({
        ...commentCommand,
        parentCommentId: reply.item.id,
        idempotencyKey: `${runId}-guest-nested-comment-reply`,
      }),
    ).rejects.toMatchObject({
      code: "REVIEW_COMMENT_REPLY_DEPTH_EXCEEDED",
      statusCode: 400,
    })
    await expect(
      repository.listComments(archiveSessionId, linkId, fileId),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.item.id, parentCommentId: null }),
        expect.objectContaining({
          id: reply.item.id,
          parentCommentId: created.item.id,
        }),
      ]),
    )

    await database
      .insertInto("notification_preferences")
      .values({
        account_id: recipientId,
        team_id: teamId,
        published_call_sheets: true,
        important_call_sheet_changes: true,
        permission_assignments: true,
        portfolio_publications: true,
        review_activity: false,
      })
      .onConflict((conflict) =>
        conflict
          .columns(["account_id", "team_id"])
          .doUpdateSet({ review_activity: false }),
      )
      .execute()

    const approvalCommand = {
      sessionId: archiveSessionId,
      linkId,
      projectId,
      fileId,
      displayName: "Archive Reviewer",
      expectedRevision: 3,
      idempotencyKey: `${runId}-guest-approval-notification`,
    }
    const approved = await repository.approveFile(approvalCommand)
    const approvalReplay = await repository.approveFile(approvalCommand)
    expect(approvalReplay).toEqual(approved)

    const notifications = await database
      .selectFrom("notifications")
      .select([
        "recipient_account_id",
        "source_actor_account_id",
        "kind",
        "subject_id",
        "metadata",
      ])
      .where("subject_id", "in", [created.item.id, reply.item.id, fileId])
      .orderBy("kind", "asc")
      .orderBy("recipient_account_id", "asc")
      .execute()
    expect(notifications).toEqual([
      expect.objectContaining({
        recipient_account_id: accountId,
        source_actor_account_id: null,
        kind: "review_comment_created",
        subject_id: created.item.id,
        metadata: expect.objectContaining({ sourceActorName: "Archive Reviewer" }),
      }),
      expect.objectContaining({
        recipient_account_id: recipientId,
        source_actor_account_id: null,
        kind: "review_comment_created",
        subject_id: created.item.id,
      }),
      expect.objectContaining({
        recipient_account_id: accountId,
        source_actor_account_id: null,
        kind: "review_comment_replied",
        subject_id: reply.item.id,
        metadata: expect.objectContaining({
          sourceActorName: "Archive Reviewer",
          parentCommentId: created.item.id,
        }),
      }),
      expect.objectContaining({
        recipient_account_id: recipientId,
        source_actor_account_id: null,
        kind: "review_comment_replied",
        subject_id: reply.item.id,
      }),
      expect.objectContaining({
        recipient_account_id: accountId,
        source_actor_account_id: null,
        kind: "review_file_approved",
        subject_id: fileId,
      }),
    ])
    expect(notifications.some((item) => item.recipient_account_id === viewerId)).toBe(
      false,
    )
  })
})
