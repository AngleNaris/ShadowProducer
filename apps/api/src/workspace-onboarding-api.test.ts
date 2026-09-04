import { createHash } from "node:crypto"
import type { ScriptRepository, WorkspaceRepository } from "@shadowproducer/application"
import { AppError, ScriptService, WorkspaceService } from "@shadowproducer/application"
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
const now = "2026-09-04T08:00:00.000Z"

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
    expiresAt: "2026-09-11T08:00:00.000Z",
    acceptedAt: status === "accepted" ? now : null,
    revokedAt: status === "revoked" ? now : null,
    revision: 1,
    createdAt: now,
  }
}

function createRepository() {
  let invitation = summary()
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
    createInvitation: async () => ({
      item: { ...invitation, token },
      replayed: false,
    }),
    listInvitations: async () => [invitation],
    findInvitationByTokenHash: async (hash: string) =>
      hash === tokenHash ? invitation : null,
    acceptInvitation: async (command: { actorId: string }) => {
      acceptedActors.push(command.actorId)
      return {
        item: {
          invitationId: invitation.id,
          scope: "team",
          teamId: invitation.teamId,
          teamName: invitation.teamName,
          projectId: null,
          projectName: null,
          role: "member",
          permissionTemplateId: invitation.permissionTemplateId,
          permissionTemplateName: invitation.permissionTemplateName,
        },
        replayed: false,
      }
    },
    revokeInvitation: async () => ({ kind: "conflict" as const }),
    acceptedActors,
    setInvitationStatus(status: InvitationSummary["status"]) {
      invitation = summary(status)
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
})
