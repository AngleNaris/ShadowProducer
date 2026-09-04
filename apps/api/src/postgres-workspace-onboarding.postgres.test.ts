import { createHash } from "node:crypto"
import { WorkspaceService } from "@shadowproducer/application"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
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
const outsiderId = `${runId}-outsider`
const viewerId = `${runId}-viewer`
const ownerEmail = `${runId}-owner@shadowproducer.local`
const inviteeEmail = `${runId}-invitee@shadowproducer.local`
const matchingInviteeEmail = `${runId}-matching@shadowproducer.local`
const outsiderEmail = `${runId}-outsider@shadowproducer.local`

let teamId: string
let projectId: string
let teamInvitationToken: string

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
      outsiderId,
      viewerId,
    ])
    .execute()
  await database
    .deleteFrom("accounts")
    .where("id", "in", [ownerId, inviteeId, outsiderId, viewerId])
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
    await expect(service.getInvitationSummary(`unknown-${token}`)).rejects.toMatchObject({
      code: "INVITATION_NOT_FOUND",
      statusCode: 404,
    })
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
      revision: 2,
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
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })

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
})
