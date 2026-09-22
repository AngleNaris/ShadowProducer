import { createHash } from "node:crypto"
import { WorkspaceService } from "@shadowproducer/application"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { listProjectMemberAccesses } from "./postgres-access"
import { PostgresWorkspaceRepository } from "./postgres-workspace-repository"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 4 })
const database = createDatabase(databaseUrl, pool)
const repository = new PostgresWorkspaceRepository(database)
const service = new WorkspaceService(repository)

const runId = `pg-onboarding-${process.pid}-${Date.now().toString(36)}`
const ownerId = `${runId}-owner`
const inviteeId = `${runId}-invitee`
const matchingInviteeId = `${runId}-matching-invitee`
const concurrentAccepteeId = `${runId}-concurrent-acceptee`
const outsiderId = `${runId}-outsider`
const viewerId = `${runId}-viewer`
const ownerEmail = `${runId}-owner@shadowproducer.local`
const inviteeEmail = `${runId}-invitee@shadowproducer.local`
const matchingInviteeEmail = `${runId}-matching@shadowproducer.local`
const concurrentAccepteeEmail = `${runId}-concurrent-acceptee@shadowproducer.local`
const outsiderEmail = `${runId}-outsider@shadowproducer.local`

let teamId: string
let projectId: string
let teamInvitationToken: string
let projectInvitationToken: string

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values([
      { id: ownerId, display_name: "Onboarding Owner", email: ownerEmail },
      { id: inviteeId, display_name: "受邀成员", email: inviteeEmail },
      {
        id: matchingInviteeId,
        display_name: "林乔",
        email: matchingInviteeEmail,
      },
      {
        id: concurrentAccepteeId,
        display_name: "并发受邀成员",
        email: concurrentAccepteeEmail,
      },
      { id: outsiderId, display_name: "外部协作者", email: outsiderEmail },
      { id: viewerId, display_name: "只读成员", email: null },
    ])
    .execute()
})

afterAll(async () => {
  await database
    .deleteFrom("audit_logs")
    .where((expression) =>
      expression.or([
        expression("actor_account_id", "in", [
          ownerId,
          inviteeId,
          matchingInviteeId,
          concurrentAccepteeId,
          outsiderId,
          viewerId,
        ]),
        teamId ? expression("team_id", "=", teamId) : expression("team_id", "is", null),
        projectId
          ? expression("project_id", "=", projectId)
          : expression("project_id", "is", null),
      ]),
    )
    .execute()
  if (teamId) {
    await database.deleteFrom("teams").where("id", "=", teamId).execute()
  }
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "in", [
      ownerId,
      inviteeId,
      matchingInviteeId,
      concurrentAccepteeId,
      outsiderId,
      viewerId,
    ])
    .execute()
  await database
    .deleteFrom("accounts")
    .where("id", "in", [
      ownerId,
      inviteeId,
      matchingInviteeId,
      concurrentAccepteeId,
      outsiderId,
      viewerId,
    ])
    .execute()
  await database.destroy()
})

describe("Postgres workspace onboarding", () => {
  it("creates a team with owner membership, system templates and idempotent replay", async () => {
    const created = await service.createTeam({
      actorId: ownerId,
      name: "北岸影像二部",
      idempotencyKey: `${runId}-team-1`,
    })
    teamId = created.item.id
    expect(created.replayed).toBe(false)
    expect(created.item).toMatchObject({
      name: "北岸影像二部",
      role: "owner",
      permissionTemplateId: `${teamId}:team-admin`,
    })

    const templates = await database
      .selectFrom("permission_templates")
      .select(["key", "is_system"])
      .where("team_id", "=", teamId)
      .orderBy("key", "asc")
      .execute()
    expect(templates.map((template) => template.key)).toEqual([
      "project-contributor",
      "project-manager",
      "project-viewer",
      "team-admin",
      "team-member",
      "team-viewer",
    ])
    expect(templates.every((template) => template.is_system)).toBe(true)

    const membership = await database
      .selectFrom("team_memberships")
      .select(["role", "permission_template_id", "permission_revision"])
      .where("team_id", "=", teamId)
      .where("account_id", "=", ownerId)
      .executeTakeFirstOrThrow()
    expect(membership).toEqual({
      role: "owner",
      permission_template_id: `${teamId}:team-admin`,
      permission_revision: 1,
    })
    const context = await service.getContext(ownerId)
    expect(context.teams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: teamId,
          role: "owner",
          memberCount: 1,
        }),
      ]),
    )

    const replay = await service.createTeam({
      actorId: ownerId,
      name: "北岸影像二部",
      idempotencyKey: `${runId}-team-1`,
    })
    expect(replay).toMatchObject({ replayed: true, item: created.item })
    expect(
      await database
        .selectFrom("teams")
        .select("id")
        .where("name", "=", "北岸影像二部")
        .where("id", "=", teamId)
        .execute(),
    ).toEqual([{ id: teamId }])
    expect(
      await database
        .selectFrom("audit_logs")
        .select("action")
        .where("subject_id", "=", teamId)
        .orderBy("id", "asc")
        .execute(),
    ).toEqual([{ action: "team.created" }])
  })

  it("creates projects with owner membership and enforces team write capability", async () => {
    const created = await service.createProject({
      actorId: ownerId,
      teamId,
      name: "霓虹旅馆",
      idempotencyKey: `${runId}-project-1`,
    })
    projectId = created.item.id
    expect(created.replayed).toBe(false)
    expect(created.item).toMatchObject({
      teamId,
      name: "霓虹旅馆",
      role: "owner",
      status: "筹备中",
      permissionTemplateId: `${teamId}:project-manager`,
    })

    const membership = await database
      .selectFrom("project_memberships")
      .select(["role", "permission_template_id"])
      .where("project_id", "=", projectId)
      .where("account_id", "=", ownerId)
      .executeTakeFirstOrThrow()
    expect(membership).toEqual({
      role: "owner",
      permission_template_id: `${teamId}:project-manager`,
    })

    const replay = await service.createProject({
      actorId: ownerId,
      teamId,
      name: "霓虹旅馆",
      idempotencyKey: `${runId}-project-1`,
    })
    expect(replay).toMatchObject({ replayed: true, item: created.item })

    await database
      .insertInto("team_memberships")
      .values({
        team_id: teamId,
        account_id: viewerId,
        role: "viewer",
        permission_template_id: `${teamId}:team-viewer`,
      })
      .execute()
    await expect(
      service.createProject({
        actorId: viewerId,
        teamId,
        name: "无权项目",
        idempotencyKey: `${runId}-project-denied`,
      }),
    ).rejects.toMatchObject({ code: "TEAM_PERMISSION_DENIED", statusCode: 403 })
    await expect(
      service.createProject({
        actorId: outsiderId,
        teamId,
        name: "外部项目",
        idempotencyKey: `${runId}-project-foreign`,
      }),
    ).rejects.toMatchObject({ code: "TEAM_ACCESS_DENIED", statusCode: 403 })
    expect(
      await database
        .selectFrom("audit_logs")
        .select("action")
        .where("subject_id", "=", projectId)
        .orderBy("id", "asc")
        .execute(),
    ).toEqual([{ action: "project.created" }])
  })

  it("creates team invitations with hashed one-time tokens and 7-day expiry", async () => {
    const created = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "team",
      email: `${runId.toUpperCase()}-MATCHING@SHADOWPRODUCER.LOCAL`,
      idempotencyKey: `${runId}-invite-team-1`,
    })
    expect(created.replayed).toBe(false)
    expect(created.item).toMatchObject({
      teamId,
      teamName: "北岸影像二部",
      scope: "team",
      projectId: null,
      email: matchingInviteeEmail,
      role: "member",
      permissionTemplateId: `${teamId}:team-member`,
      permissionTemplateName: "团队成员",
      status: "pending",
      invitedByName: "Onboarding Owner",
    })
    expect(created.item.token).toEqual(expect.any(String))
    const token = created.item.token as string
    teamInvitationToken = token
    expect(new Date(created.item.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + 6.9 * 24 * 60 * 60 * 1000,
    )

    const row = await database
      .selectFrom("onboarding_invitations")
      .selectAll()
      .where("id", "=", created.item.id)
      .executeTakeFirstOrThrow()
    expect(row.token_hash).toBe(sha256(token))
    expect(row.status).toBe("pending")
    expect(JSON.stringify(row)).not.toContain(token)
    expect(
      await database
        .selectFrom("command_receipts")
        .select("response")
        .where("actor_account_id", "=", ownerId)
        .where("domain", "=", `invitation.create:${teamId}`)
        .where("idempotency_key", "=", `${runId}-invite-team-1`)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ response: { id: created.item.id } })
    const receipt = await database
      .selectFrom("command_receipts")
      .select("response")
      .where("actor_account_id", "=", ownerId)
      .where("domain", "=", `invitation.create:${teamId}`)
      .where("idempotency_key", "=", `${runId}-invite-team-1`)
      .executeTakeFirstOrThrow()
    expect(JSON.stringify(receipt.response)).not.toContain(token)

    await expect(
      service.createInvitation({
        actorId: ownerId,
        teamId,
        scope: "team",
        email: `${runId.toUpperCase()}-MATCHING@SHADOWPRODUCER.LOCAL`,
        idempotencyKey: `${runId}-invite-team-duplicate`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_PENDING_EXISTS", statusCode: 409 })

    const concurrentEmail = `${runId}-concurrent@shadowproducer.local`
    const concurrent = await Promise.allSettled([
      service.createInvitation({
        actorId: ownerId,
        teamId,
        scope: "team",
        email: concurrentEmail,
        idempotencyKey: `${runId}-invite-concurrent-a`,
      }),
      service.createInvitation({
        actorId: ownerId,
        teamId,
        scope: "team",
        email: concurrentEmail,
        idempotencyKey: `${runId}-invite-concurrent-b`,
      }),
    ])
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(1)
    expect(concurrent.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: { code: "INVITATION_PENDING_EXISTS", statusCode: 409 },
    })
    await expect(
      service.createInvitation({
        actorId: ownerId,
        teamId,
        scope: "team",
        email: ownerEmail,
        idempotencyKey: `${runId}-invite-self`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_SELF_FORBIDDEN", statusCode: 409 })
    await expect(
      service.createInvitation({
        actorId: ownerId,
        teamId,
        scope: "team",
        email: outsiderEmail,
        permissionTemplateId: `${teamId}:project-manager`,
        idempotencyKey: `${runId}-invite-template-mismatch`,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_TEMPLATE_INVALID", statusCode: 400 })
    await expect(
      service.createInvitation({
        actorId: ownerId,
        teamId,
        scope: "team",
        email: outsiderEmail,
        projectId,
        idempotencyKey: `${runId}-invite-team-with-project`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_SCOPE_INVALID", statusCode: 400 })

    const replay = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "team",
      email: `${runId.toUpperCase()}-MATCHING@SHADOWPRODUCER.LOCAL`,
      idempotencyKey: `${runId}-invite-team-1`,
    })
    expect(replay.replayed).toBe(true)
    expect(replay.item.id).toBe(created.item.id)
    expect(replay.item.token).toBeUndefined()

    expect((await service.listInvitations(ownerId, teamId)).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.item.id,
          email: matchingInviteeEmail,
        }),
      ]),
    )

    const summary = await service.getInvitationSummary(token)
    expect(summary.item).toMatchObject({
      id: created.item.id,
      teamName: "北岸影像二部",
      scope: "team",
      status: "pending",
    })
    const rotated = await service.rotateInvitationToken({
      actorId: ownerId,
      teamId,
      itemId: created.item.id,
      expectedRevision: 1,
      idempotencyKey: `${runId}-invite-rotate-1`,
    })
    expect(rotated.replayed).toBe(false)
    expect(rotated.item).toMatchObject({
      id: created.item.id,
      revision: 2,
      status: "pending",
    })
    expect(rotated.item.token).toEqual(expect.any(String))
    const rotatedToken = rotated.item.token as string
    expect(rotatedToken).not.toBe(token)
    teamInvitationToken = rotatedToken
    await expect(service.getInvitationSummary(token)).rejects.toMatchObject({
      code: "INVITATION_NOT_FOUND",
      statusCode: 404,
    })
    await expect(
      service.acceptInvitation({
        actorId: matchingInviteeId,
        token,
        idempotencyKey: `${runId}-accept-old-rotated-token`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND", statusCode: 404 })
    await expect(service.getInvitationSummary(rotatedToken)).resolves.toMatchObject({
      item: { id: created.item.id, status: "pending", revision: 2 },
    })
    const rotatedRow = await database
      .selectFrom("onboarding_invitations")
      .selectAll()
      .where("id", "=", created.item.id)
      .executeTakeFirstOrThrow()
    expect(rotatedRow.token_hash).toBe(sha256(rotatedToken))
    expect(JSON.stringify(rotatedRow)).not.toContain(rotatedToken)
    const rotatedReceipt = await database
      .selectFrom("command_receipts")
      .select("response")
      .where("actor_account_id", "=", ownerId)
      .where("domain", "=", `invitation.rotate-token:${teamId}`)
      .where("idempotency_key", "=", `${runId}-invite-rotate-1`)
      .executeTakeFirstOrThrow()
    expect(JSON.stringify(rotatedReceipt.response)).not.toContain(rotatedToken)
    const rotatedReplay = await service.rotateInvitationToken({
      actorId: ownerId,
      teamId,
      itemId: created.item.id,
      expectedRevision: 1,
      idempotencyKey: `${runId}-invite-rotate-1`,
    })
    expect(rotatedReplay).toMatchObject({
      replayed: true,
      item: { id: created.item.id, revision: 2 },
    })
    expect(rotatedReplay.item.token).toBeUndefined()
    await expect(
      service.rotateInvitationToken({
        actorId: ownerId,
        teamId,
        itemId: created.item.id,
        expectedRevision: 1,
        idempotencyKey: `${runId}-invite-rotate-stale`,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
  })

  it("replays one concurrent invitation creation with the same idempotency key", async () => {
    const email = `${runId}-same-key-create@shadowproducer.local`
    const idempotencyKey = `${runId}-invite-same-key`
    const command = {
      actorId: ownerId,
      teamId,
      scope: "team" as const,
      email,
      idempotencyKey,
    }
    const results = await Promise.all([
      service.createInvitation(command),
      service.createInvitation(command),
    ])

    expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
    expect(results[0].item.id).toBe(results[1].item.id)
    expect(results.filter((result) => result.item.token).length).toBe(1)

    const invitations = await database
      .selectFrom("onboarding_invitations")
      .select(["id", "email"])
      .where("team_id", "=", teamId)
      .where("email", "=", email)
      .execute()
    expect(invitations).toHaveLength(1)
    expect(invitations[0]?.id).toBe(results[0].item.id)

    const receipts = await database
      .selectFrom("command_receipts")
      .select(["idempotency_key"])
      .where("actor_account_id", "=", ownerId)
      .where("domain", "=", `invitation.create:${teamId}`)
      .where("idempotency_key", "=", idempotencyKey)
      .execute()
    expect(receipts).toHaveLength(1)

    const audits = await database
      .selectFrom("audit_logs")
      .select(["action", "subject_id"])
      .where("team_id", "=", teamId)
      .where("action", "=", "invitation.created")
      .where("subject_id", "=", results[0].item.id)
      .execute()
    expect(audits).toEqual([
      { action: "invitation.created", subject_id: results[0].item.id },
    ])

    await expect(
      service.createInvitation({
        ...command,
        email: `${runId}-different-request@shadowproducer.local`,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 })
  })

  it("replays one concurrent invitation acceptance with the same idempotency key", async () => {
    const created = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "team",
      email: concurrentAccepteeEmail,
      idempotencyKey: `${runId}-invite-concurrent-acceptance`,
    })
    const token = created.item.token as string
    const idempotencyKey = `${runId}-accept-same-key`
    const command = {
      actorId: concurrentAccepteeId,
      token,
      idempotencyKey,
    }
    const results = await Promise.all([
      service.acceptInvitation(command),
      service.acceptInvitation(command),
    ])

    expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
    expect(results[0].item).toEqual(results[1].item)

    const invitation = await database
      .selectFrom("onboarding_invitations")
      .select(["status", "accepted_account_id", "revision"])
      .where("id", "=", created.item.id)
      .executeTakeFirstOrThrow()
    expect(invitation).toMatchObject({
      status: "accepted",
      accepted_account_id: concurrentAccepteeId,
      revision: 2,
    })

    expect(
      await database
        .selectFrom("team_memberships")
        .select("account_id")
        .where("team_id", "=", teamId)
        .where("account_id", "=", concurrentAccepteeId)
        .execute(),
    ).toEqual([{ account_id: concurrentAccepteeId }])

    expect(
      await database
        .selectFrom("notifications")
        .select(["subject_id", "dedup_key"])
        .where("recipient_account_id", "=", ownerId)
        .where("subject_id", "=", created.item.id)
        .execute(),
    ).toEqual([
      {
        subject_id: created.item.id,
        dedup_key: `invitation-accepted:${created.item.id}`,
      },
    ])

    expect(
      await database
        .selectFrom("audit_logs")
        .select(["action", "subject_id"])
        .where("actor_account_id", "=", concurrentAccepteeId)
        .where("action", "=", "invitation.accepted")
        .where("subject_id", "=", created.item.id)
        .execute(),
    ).toEqual([{ action: "invitation.accepted", subject_id: created.item.id }])

    expect(
      await database
        .selectFrom("command_receipts")
        .select(["idempotency_key"])
        .where("actor_account_id", "=", concurrentAccepteeId)
        .where("domain", "=", "invitation.accept")
        .where("idempotency_key", "=", idempotencyKey)
        .execute(),
    ).toHaveLength(1)

    await expect(
      service.acceptInvitation({
        ...command,
        token: `${token}different`,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 })
  })

  it("accepts team invitations only for matching emails and notifies the inviter", async () => {
    await expect(
      service.acceptInvitation({
        actorId: outsiderId,
        token: teamInvitationToken,
        idempotencyKey: `${runId}-accept-mismatch`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_EMAIL_MISMATCH", statusCode: 403 })

    const accepted = await service.acceptInvitation({
      actorId: matchingInviteeId,
      token: teamInvitationToken,
      idempotencyKey: `${runId}-accept-matching`,
    })
    expect(accepted).toMatchObject({
      replayed: false,
      item: {
        invitationId: expect.any(String),
        scope: "team",
        teamId,
        teamName: "北岸影像二部",
        projectId: null,
        projectName: null,
        role: "member",
        permissionTemplateId: `${teamId}:team-member`,
        permissionTemplateName: "团队成员",
      },
    })

    const invitationId = accepted.item.invitationId
    const membership = await database
      .selectFrom("team_memberships")
      .select(["role", "permission_template_id", "permission_revision"])
      .where("team_id", "=", teamId)
      .where("account_id", "=", matchingInviteeId)
      .executeTakeFirstOrThrow()
    expect(membership).toEqual({
      role: "member",
      permission_template_id: `${teamId}:team-member`,
      permission_revision: 1,
    })

    const invitation = await database
      .selectFrom("onboarding_invitations")
      .select(["status", "accepted_account_id", "accepted_at", "revision"])
      .where("id", "=", invitationId)
      .executeTakeFirstOrThrow()
    expect(invitation).toMatchObject({
      status: "accepted",
      accepted_account_id: matchingInviteeId,
      revision: 3,
    })
    expect(invitation.accepted_at).toBeInstanceOf(Date)

    const notification = await database
      .selectFrom("notifications")
      .select([
        "recipient_account_id",
        "source_actor_account_id",
        "team_id",
        "project_id",
        "kind",
        "subject_id",
        "dedup_key",
      ])
      .where("recipient_account_id", "=", ownerId)
      .where("subject_id", "=", invitationId)
      .executeTakeFirstOrThrow()
    expect(notification).toEqual({
      recipient_account_id: ownerId,
      source_actor_account_id: matchingInviteeId,
      team_id: teamId,
      project_id: null,
      kind: "team_invitation_accepted",
      subject_id: invitationId,
      dedup_key: `invitation-accepted:${invitationId}`,
    })

    const audit = await database
      .selectFrom("audit_logs")
      .select(["actor_account_id", "team_id", "project_id", "action", "subject_id"])
      .where("action", "=", "invitation.accepted")
      .where("subject_id", "=", invitationId)
      .executeTakeFirstOrThrow()
    expect(audit).toEqual({
      actor_account_id: matchingInviteeId,
      team_id: teamId,
      project_id: null,
      action: "invitation.accepted",
      subject_id: invitationId,
    })

    const receipt = await database
      .selectFrom("command_receipts")
      .select(["request_hash", "response"])
      .where("actor_account_id", "=", matchingInviteeId)
      .where("domain", "=", "invitation.accept")
      .where("idempotency_key", "=", `${runId}-accept-matching`)
      .executeTakeFirstOrThrow()
    expect(receipt.request_hash).toEqual(expect.any(String))
    expect(receipt.response).toEqual(accepted.item)

    const replay = await service.acceptInvitation({
      actorId: matchingInviteeId,
      token: teamInvitationToken,
      idempotencyKey: `${runId}-accept-matching`,
    })
    expect(replay).toEqual({ item: accepted.item, replayed: true })
    await expect(
      service.acceptInvitation({
        actorId: matchingInviteeId,
        token: teamInvitationToken,
        idempotencyKey: `${runId}-accept-matching-again`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_ALREADY_ACCEPTED", statusCode: 410 })
  })

  it("accepts project invitations without creating team membership and keeps project-only data isolated", async () => {
    const created = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "project",
      projectId,
      email: outsiderEmail,
      idempotencyKey: `${runId}-invite-project-1`,
    })
    projectInvitationToken = created.item.token as string
    expect(created.item).toMatchObject({
      scope: "project",
      teamId,
      projectId,
      projectName: "霓虹旅馆",
      email: outsiderEmail,
      permissionTemplateId: `${teamId}:project-contributor`,
    })

    const accepted = await service.acceptInvitation({
      actorId: outsiderId,
      token: projectInvitationToken,
      idempotencyKey: `${runId}-accept-project-1`,
    })
    expect(accepted.item).toMatchObject({
      scope: "project",
      teamId,
      projectId,
      projectName: "霓虹旅馆",
      permissionTemplateId: `${teamId}:project-contributor`,
    })

    expect(
      await database
        .selectFrom("team_memberships")
        .select("account_id")
        .where("team_id", "=", teamId)
        .where("account_id", "=", outsiderId)
        .execute(),
    ).toEqual([])
    expect(
      await database
        .selectFrom("project_memberships")
        .select(["role", "permission_template_id", "permission_revision"])
        .where("project_id", "=", projectId)
        .where("account_id", "=", outsiderId)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      role: "member",
      permission_template_id: `${teamId}:project-contributor`,
      permission_revision: 1,
    })

    await expect(repository.getTeamAccess(outsiderId, teamId)).resolves.toBeNull()
    await expect(
      repository.getProjectAccess(outsiderId, teamId, projectId),
    ).resolves.toMatchObject({
      canRead: true,
      canWrite: true,
      capabilities: expect.arrayContaining(["project.read", "project.write"]),
    })
    await expect(service.listTasks(outsiderId, teamId)).rejects.toMatchObject({
      code: "TEAM_ACCESS_DENIED",
      statusCode: 403,
    })

    const context = await service.getContext(outsiderId)
    expect(context.teams).toEqual([
      expect.objectContaining({
        id: teamId,
        name: "北岸影像二部",
        role: null,
        memberCount: 0,
        projects: [expect.objectContaining({ id: projectId, name: "霓虹旅馆" })],
      }),
    ])

    await database
      .insertInto("notifications")
      .values([
        {
          id: `${runId}-project-only-notification`,
          recipient_account_id: outsiderId,
          source_actor_account_id: ownerId,
          team_id: teamId,
          project_id: projectId,
          kind: "project_invitation_accepted",
          subject_id: `${runId}-project-only-subject`,
          dedup_key: `${runId}-project-only-notification`,
          title: "项目邀请已接受",
          body: "项目通知",
          metadata: JSON.stringify({ scope: "project" }),
          read_at: null,
          acknowledged_at: null,
        },
        {
          id: `${runId}-team-only-notification`,
          recipient_account_id: outsiderId,
          source_actor_account_id: ownerId,
          team_id: teamId,
          project_id: null,
          kind: "team_invitation_accepted",
          subject_id: `${runId}-team-only-subject`,
          dedup_key: `${runId}-team-only-notification`,
          title: "团队通知不应可见",
          body: "团队级通知",
          metadata: JSON.stringify({ scope: "team" }),
          read_at: null,
          acknowledged_at: null,
        },
      ])
      .execute()
    const notifications = await service.listNotifications(outsiderId, teamId)
    expect(notifications.items).toEqual([
      expect.objectContaining({
        id: `${runId}-project-only-notification`,
        projectId,
      }),
    ])
    await expect(
      service.listAuditLogs(outsiderId, teamId, {
        scope: "team",
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toMatchObject({ items: [], total: 0 })
    await expect(
      service.listAuditLogs(outsiderId, teamId, {
        projectId,
        page: 1,
        pageSize: 25,
      }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          projectId,
          action: "invitation.accepted",
        }),
      ]),
    })

    const permissionWorkspace = await service.listPermissionWorkspace(ownerId, teamId)
    expect(permissionWorkspace.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: outsiderId,
          role: null,
          permissionTemplateId: null,
          permissionRevision: null,
          projects: [
            expect.objectContaining({
              projectId,
              permissionTemplateId: `${teamId}:project-contributor`,
            }),
          ],
        }),
      ]),
    )
    await expect(
      service.assignTeamPermissionTemplate({
        actorId: ownerId,
        teamId,
        accountId: outsiderId,
        templateId: `${teamId}:team-viewer`,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", statusCode: 404 })

    const projectMembers = await listProjectMemberAccesses(database, projectId)
    expect(projectMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: outsiderId,
          access: expect.objectContaining({
            canRead: true,
            capabilities: expect.arrayContaining(["project.read"]),
          }),
        }),
      ]),
    )
  })

  it("rejects existing members, revoked invitations, expired invitations and stale revocations", async () => {
    const memberInvitation = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "team",
      email: inviteeEmail,
      idempotencyKey: `${runId}-invite-member-exists`,
    })
    await database
      .insertInto("team_memberships")
      .values({
        team_id: teamId,
        account_id: inviteeId,
        role: "member",
        permission_template_id: `${teamId}:team-member`,
      })
      .execute()
    await expect(
      service.acceptInvitation({
        actorId: inviteeId,
        token: memberInvitation.item.token as string,
        idempotencyKey: `${runId}-accept-member-exists`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_MEMBER_EXISTS", statusCode: 409 })
    expect(
      await database
        .selectFrom("onboarding_invitations")
        .select(["status", "accepted_account_id", "revision"])
        .where("id", "=", memberInvitation.item.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "pending", accepted_account_id: null, revision: 1 })

    const revokedInvitation = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "team",
      email: outsiderEmail,
      idempotencyKey: `${runId}-invite-revoked`,
    })
    await expect(
      service.revokeInvitation({
        actorId: ownerId,
        teamId,
        itemId: revokedInvitation.item.id,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    const revoked = await service.revokeInvitation({
      actorId: ownerId,
      teamId,
      itemId: revokedInvitation.item.id,
      expectedRevision: 1,
    })
    expect(revoked).toMatchObject({ id: revokedInvitation.item.id })
    expect(
      await database
        .selectFrom("onboarding_invitations")
        .select(["status", "revoked_at", "revision"])
        .where("id", "=", revokedInvitation.item.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ status: "revoked", revision: 2 })
    await expect(
      service.acceptInvitation({
        actorId: outsiderId,
        token: revokedInvitation.item.token as string,
        idempotencyKey: `${runId}-accept-revoked`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_REVOKED", statusCode: 410 })
    await expect(
      service.revokeInvitation({
        actorId: ownerId,
        teamId,
        itemId: revokedInvitation.item.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_REVOKED", statusCode: 410 })

    const expiredInvitation = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "team",
      email: outsiderEmail,
      idempotencyKey: `${runId}-invite-expired`,
    })
    await database
      .updateTable("onboarding_invitations")
      .set({
        expires_at: new Date(Date.now() - 60_000),
        updated_at: new Date(Date.now() - 60_000),
      })
      .where("id", "=", expiredInvitation.item.id)
      .execute()
    await expect(
      service.acceptInvitation({
        actorId: outsiderId,
        token: expiredInvitation.item.token as string,
        idempotencyKey: `${runId}-accept-expired`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED", statusCode: 410 })
    await expect(
      service.getInvitationSummary(expiredInvitation.item.token as string),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED", statusCode: 410 })
  })
  it("allows re-inviting an email after its invitation naturally expires", async () => {
    const stale = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "team",
      email: outsiderEmail,
      idempotencyKey: `${runId}-invite-reexpire`,
    })
    await database
      .updateTable("onboarding_invitations")
      .set({ expires_at: new Date(Date.now() - 60_000) })
      .where("id", "=", stale.item.id)
      .execute()

    // 过期 pending 曾经永久占用唯一槽位导致同邮箱 409；现在应原子翻转并允许重建。
    const recreated = await service.createInvitation({
      actorId: ownerId,
      teamId,
      scope: "team",
      email: outsiderEmail,
      idempotencyKey: `${runId}-invite-after-expiry`,
    })
    expect(recreated.replayed).toBe(false)
    expect(recreated.item.id).not.toBe(stale.item.id)
    expect(recreated.item.token).toEqual(expect.any(String))

    // 旧行进入 expired 终态：accept/rotate/revoke 一律 410 INVITATION_EXPIRED。
    await expect(
      service.getInvitationSummary(stale.item.token as string),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED", statusCode: 410 })
    await expect(
      service.acceptInvitation({
        actorId: outsiderId,
        token: stale.item.token as string,
        idempotencyKey: `${runId}-accept-after-expiry`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED", statusCode: 410 })
    await expect(
      service.rotateInvitationToken({
        actorId: ownerId,
        teamId,
        itemId: stale.item.id,
        expectedRevision: stale.item.revision,
        idempotencyKey: `${runId}-rotate-after-expiry`,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED", statusCode: 410 })
    await expect(
      service.revokeInvitation({
        actorId: ownerId,
        teamId,
        itemId: stale.item.id,
        expectedRevision: stale.item.revision,
      }),
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED", statusCode: 410 })

    // 新邀请保持 pending 且可正常预览。
    await expect(
      service.getInvitationSummary(recreated.item.token as string),
    ).resolves.toMatchObject({ item: { id: recreated.item.id, status: "pending" } })

    await service.revokeInvitation({
      actorId: ownerId,
      teamId,
      itemId: recreated.item.id,
      expectedRevision: recreated.item.revision,
    })
  })
})
