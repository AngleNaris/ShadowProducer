import { createHash } from "node:crypto"
import type { ScriptRepository, WorkspaceRepository } from "@shadowproducer/application"
import {
  AppError,
  type CreateInvitationCommand,
  ScriptService,
  WorkspaceService,
} from "@shadowproducer/application"
import type {
  InvitationSummary,
  OnboardingProject,
  OnboardingTeam,
} from "@shadowproducer/contracts"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"
import type { AuthGateway } from "./auth"

const token = "valid-invitation-token-abc123"
const tokenHash = createHash("sha256").update(token).digest("hex")
const projectToken = "project-invitation-token-abc123"
const projectTokenHash = createHash("sha256").update(projectToken).digest("hex")
const now = "2026-09-04T08:00:00.000Z"
// 邀请有效期以真实系统时钟校验，测试到期时间必须相对当前时间推导，避免硬编码日期随时间失效。
const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

function summary(status: InvitationSummary["status"] = "pending"): InvitationSummary {
  return {
    id: "invitation-1",
    teamId: "north",
    teamName: "北岸影像",
    projectId: null,
    projectName: null,
    scope: "team",
    email: "invitee@shadowproducer.local",
    role: "member",
    permissionTemplateId: "north:team-member",
    permissionTemplateName: "团队成员",
    status,
    invitedByAccountId: "account-fanxing",
    invitedByName: "繁星",
    acceptedAccountId: status === "accepted" ? "account-invitee" : null,
    expiresAt: futureExpiry,
    acceptedAt: status === "accepted" ? now : null,
    revokedAt: status === "revoked" ? now : null,
    revision: 1,
    createdAt: now,
  }
}

function projectSummary(): InvitationSummary {
  return {
    ...summary(),
    id: "project-invitation-1",
    projectId: "winter-coffee",
    projectName: "冬夜咖啡",
    scope: "project",
    email: "invitee@shadowproducer.local",
    permissionTemplateId: "north:project-contributor",
    permissionTemplateName: "项目协作者",
  }
}

function createRepository() {
  let invitation = summary()
  let createInvitationError: Error | null = null
  let rotateResult: Awaited<ReturnType<WorkspaceRepository["rotateInvitationToken"]>> = {
    item: { ...summary(), token },
    replayed: false,
  }
  const acceptedActors: string[] = []
  const repository = {
    getTeamAccess: async () => ({
      canRead: true,
      canWrite: true,
      capabilities: ["team.read", "team.write", "team.permissions.manage"],
    }),
    createTeam: async (): Promise<{ item: OnboardingTeam; replayed: boolean }> => ({
      item: {
        id: "team-created",
        name: "新团队",
        role: "owner",
        permissionTemplateId: "team-created:team-admin",
        createdAt: now,
      },
      replayed: false,
    }),
    createProject: async (): Promise<{ item: OnboardingProject; replayed: boolean }> => ({
      item: {
        id: "project-created",
        teamId: "north",
        name: "新项目",
        role: "owner",
        status: "筹备中",
        permissionTemplateId: "north:project-manager",
        createdAt: now,
      },
      replayed: false,
    }),
    createInvitation: async (command: CreateInvitationCommand) => {
      if (createInvitationError) throw createInvitationError
      const item = command.scope === "project" ? projectSummary() : invitation
      return {
        item: { ...item, token: command.scope === "project" ? projectToken : token },
        replayed: false,
      }
    },
    listInvitations: async () => [invitation],
    findInvitationByTokenHash: async (hash: string) => {
      if (hash === projectTokenHash) return projectSummary()
      return hash === tokenHash ? invitation : null
    },
    acceptInvitation: async (command: { actorId: string; token?: string }) => {
      acceptedActors.push(command.actorId)
      const project = command.token === projectToken
      const acceptedInvitation = project ? projectSummary() : invitation
      return {
        item: {
          invitationId: acceptedInvitation.id,
          scope: acceptedInvitation.scope,
          teamId: acceptedInvitation.teamId,
          teamName: acceptedInvitation.teamName,
          projectId: acceptedInvitation.projectId,
          projectName: acceptedInvitation.projectName,
          role: acceptedInvitation.role,
          permissionTemplateId: acceptedInvitation.permissionTemplateId,
          permissionTemplateName: acceptedInvitation.permissionTemplateName,
        },
        replayed: false,
      }
    },
    revokeInvitation: async () => ({ kind: "conflict" as const }),
    rotateInvitationToken: async () => rotateResult,
    acceptedActors,
    setInvitationStatus(status: InvitationSummary["status"]) {
      invitation = summary(status)
    },
    setCreateInvitationError(error: Error | null) {
      createInvitationError = error
    },
    setRotateResult(
      result: Awaited<ReturnType<WorkspaceRepository["rotateInvitationToken"]>>,
    ) {
      rotateResult = result
    },
  }
  return repository
}

const authGateway: AuthGateway = {
  handle: async () => new Response(),
  resolveActorId: async (headers) => {
    if (headers.cookie !== "shadow-session=valid") {
      throw new AppError("AUTH_REQUIRED", "请先登录", 401)
    }
    return "account-fanxing"
  },
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

async function createTestApp() {
  const repository = createRepository()
  const workspaceService = new WorkspaceService(
    repository as unknown as WorkspaceRepository,
  )
  const app = await buildApp({
    scriptService: new ScriptService({} as ScriptRepository),
    workspaceService,
    authGateway,
    logger: false,
  })
  apps.push(app)
  return { app, repository }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("workspace onboarding HTTP routes", () => {
  it("requires authentication for v1 onboarding and accept routes", async () => {
    const { app } = await createTestApp()
    const team = await app.inject({
      method: "POST",
      url: "/v1/teams",
      payload: { name: "新团队", idempotencyKey: "team-http-1" },
    })
    const accept = await app.inject({
      method: "POST",
      url: `/invitations/${token}/accept`,
      payload: { idempotencyKey: "accept-http-1" },
    })

    expect(team.statusCode).toBe(401)
    expect(team.json().code).toBe("AUTH_REQUIRED")
    expect(accept.statusCode).toBe(401)
    expect(accept.json().code).toBe("AUTH_REQUIRED")
  })

  it("keeps public preview unauthenticated and never trusts a spoofed header", async () => {
    const { app, repository } = await createTestApp()
    const preview = await app.inject({ method: "GET", url: `/invitations/${token}` })
    const spoofed = await app.inject({
      method: "POST",
      url: `/invitations/${token}/accept`,
      headers: {
        cookie: "shadow-session=valid",
        "x-shadow-account-id": "account-outsider",
      },
      payload: { idempotencyKey: "accept-http-2" },
    })

    expect(preview.statusCode).toBe(200)
    expect(preview.headers["cache-control"]).toBe("no-store")
    expect(preview.json().item.email).toBe("invitee@shadowproducer.local")
    expect(spoofed.statusCode).toBe(201)
    expect(repository.acceptedActors).toEqual(["account-fanxing"])
  })

  it("maps accept, validation, expired preview, and revoke conflicts", async () => {
    const { app, repository } = await createTestApp()
    const headers = { cookie: "shadow-session=valid" }
    const accepted = await app.inject({
      method: "POST",
      url: `/invitations/${token}/accept`,
      headers,
      payload: { idempotencyKey: "accept-http-3" },
    })
    const invalid = await app.inject({
      method: "POST",
      url: `/invitations/${token}/accept`,
      headers,
      payload: {},
    })
    repository.setInvitationStatus("accepted")
    const expired = await app.inject({
      method: "GET",
      url: `/invitations/${token}`,
    })
    const revoked = await app.inject({
      method: "POST",
      url: "/v1/teams/north/invitations/invitation-1/revoke",
      headers,
      payload: { expectedRevision: 1 },
    })

    expect(accepted.statusCode).toBe(201)
    expect(accepted.json()).toMatchObject({
      replayed: false,
      item: { invitationId: "invitation-1" },
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().code).toBe("VALIDATION_FAILED")
    expect(expired.statusCode).toBe(410)
    expect(expired.json().code).toBe("INVITATION_ALREADY_ACCEPTED")
    expect(revoked.statusCode).toBe(409)
    expect(revoked.json().code).toBe("RESOURCE_CONFLICT")
  })

  it("validates invitation email at the route boundary and maps pending conflicts", async () => {
    const { app, repository } = await createTestApp()
    const headers = { cookie: "shadow-session=valid" }
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/teams/north/invitations",
      headers,
      payload: {
        scope: "team",
        email: "not-an-email",
        idempotencyKey: "invite-http-invalid",
      },
    })
    repository.setCreateInvitationError(
      new AppError("INVITATION_PENDING_EXISTS", "该邮箱已有待处理的同类邀请", 409),
    )
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/teams/north/invitations",
      headers,
      payload: {
        scope: "team",
        email: "invitee@shadowproducer.local",
        idempotencyKey: "invite-http-duplicate",
      },
    })

    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().code).toBe("VALIDATION_FAILED")
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().code).toBe("INVITATION_PENDING_EXISTS")
  })

  it("returns a one-time rotate token, omits it on replay, and maps stale revisions", async () => {
    const { app, repository } = await createTestApp()
    const headers = { cookie: "shadow-session=valid" }
    const first = await app.inject({
      method: "POST",
      url: "/v1/teams/north/invitations/invitation-1/rotate-token",
      headers,
      payload: { expectedRevision: 1, idempotencyKey: "rotate-http-1" },
    })
    repository.setRotateResult({
      item: summary(),
      replayed: true,
    })
    const replay = await app.inject({
      method: "POST",
      url: "/v1/teams/north/invitations/invitation-1/rotate-token",
      headers,
      payload: { expectedRevision: 1, idempotencyKey: "rotate-http-1" },
    })
    repository.setRotateResult({ kind: "conflict" })
    const stale = await app.inject({
      method: "POST",
      url: "/v1/teams/north/invitations/invitation-1/rotate-token",
      headers,
      payload: { expectedRevision: 1, idempotencyKey: "rotate-http-stale" },
    })

    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({
      replayed: false,
      item: { id: "invitation-1", token },
    })
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toMatchObject({
      replayed: true,
      item: { id: "invitation-1" },
    })
    expect(replay.json().item.token).toBeUndefined()
    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
  })
  it("returns project scope and project identity when accepting a project invitation", async () => {
    const { app, repository } = await createTestApp()
    const headers = { cookie: "shadow-session=valid" }
    const preview = await app.inject({
      method: "GET",
      url: `/invitations/${projectToken}`,
    })
    const accepted = await app.inject({
      method: "POST",
      url: `/invitations/${projectToken}/accept`,
      headers,
      payload: { idempotencyKey: "accept-project-http-1" },
    })

    expect(preview.statusCode).toBe(200)
    expect(preview.json()).toMatchObject({
      item: { scope: "project", projectId: "winter-coffee", projectName: "冬夜咖啡" },
    })
    expect(accepted.statusCode).toBe(201)
    expect(accepted.json()).toMatchObject({
      replayed: false,
      item: {
        scope: "project",
        projectId: "winter-coffee",
        projectName: "冬夜咖啡",
      },
    })
    expect(repository.acceptedActors).toEqual(["account-fanxing"])
  })
})
