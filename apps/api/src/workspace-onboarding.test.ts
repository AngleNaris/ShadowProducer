import { createHash } from "node:crypto"
import type {
  AcceptInvitationCommand,
  CreateInvitationCommand,
  CreateProjectCommand,
  CreateResult,
  CreateTeamCommand,
  PermissionAccess,
  RevokeInvitationCommand,
  WorkspaceRepository,
} from "@shadowproducer/application"
import { WorkspaceService } from "@shadowproducer/application"
import type {
  InvitationAcceptance,
  InvitationSummary,
  OnboardingTeam,
} from "@shadowproducer/contracts"
import { describe, expect, it } from "vitest"

const now = "2026-09-04T08:00:00.000Z"
const futureExpiry = "2026-09-11T08:00:00.000Z"
const pastExpiry = "2026-08-28T08:00:00.000Z"
const validToken = "valid-invitation-token-abc123"

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function invitationSummary(
  overrides: Partial<InvitationSummary> = {},
): InvitationSummary {
  return {
    id: "invitation-1",
    teamId: "north",
    teamName: "北岸影像",
    projectId: null,
    projectName: null,
    scope: "team",
    email: "linqiao@shadowproducer.local",
    role: "member",
    permissionTemplateId: "north:team-member",
    permissionTemplateName: "团队成员",
    status: "pending",
    invitedByAccountId: "account-fanxing",
    invitedByName: "繁星",
    acceptedAccountId: null,
    expiresAt: futureExpiry,
    acceptedAt: null,
    revokedAt: null,
    revision: 1,
    createdAt: now,
    ...overrides,
  }
}

class MemoryOnboardingRepository implements WorkspaceRepository {
  readonly teamCreations: CreateTeamCommand[] = []
  readonly projectCreations: CreateProjectCommand[] = []
  readonly invitationCreations: CreateInvitationCommand[] = []
  readonly acceptances: AcceptInvitationCommand[] = []
  readonly listedTeamIds: string[] = []
  teamReceipts = new Map<string, OnboardingTeam>()
  teamReplayCounts = new Map<string, number>()
  invitations: InvitationSummary[] = []
  acceptanceResult: CreateResult<InvitationAcceptance> | null = null
  revokeResult:
    | { kind: "ok"; item: { id: string } }
    | { kind: "not_found" }
    | {
        kind: "conflict"
      } = { kind: "ok", item: { id: "invitation-1" } }

  constructor(private readonly access: PermissionAccess | null) {}

  async getTeamAccess(): Promise<PermissionAccess | null> {
    return this.access
  }

  async createTeam(command: CreateTeamCommand) {
    this.teamCreations.push(command)
    const count = (this.teamReplayCounts.get(command.idempotencyKey) ?? 0) + 1
    this.teamReplayCounts.set(command.idempotencyKey, count)
    const item: OnboardingTeam = this.teamReceipts.get(command.idempotencyKey) ?? {
      id: "team-created",
      name: command.name,
      role: "owner",
      permissionTemplateId: "team-created:team-admin",
      createdAt: now,
    }
    this.teamReceipts.set(command.idempotencyKey, item)
    return { item, replayed: count > 1 }
  }

  async createProject(command: CreateProjectCommand) {
    this.projectCreations.push(command)
    return {
      item: {
        id: "project-created",
        teamId: command.teamId,
        name: command.name,
        role: "owner",
        status: "筹备中",
        permissionTemplateId: `${command.teamId}:project-manager`,
        createdAt: now,
      },
      replayed: false,
    }
  }

  async createInvitation(command: CreateInvitationCommand) {
    this.invitationCreations.push(command)
    return {
      item: {
        ...invitationSummary({ email: command.email.toLowerCase() }),
        token: "issued-invitation-token",
      },
      replayed: false,
    }
  }

  async listInvitations(teamId: string) {
    this.listedTeamIds.push(teamId)
    return this.invitations.filter((item) => item.teamId === teamId)
  }

  async findInvitationByTokenHash(tokenHash: string) {
    return tokenHash === sha256(validToken) ? (this.invitations[0] ?? null) : null
  }

  async acceptInvitation(command: AcceptInvitationCommand) {
    this.acceptances.push(command)
    if (!this.acceptanceResult) {
      return {
        item: {
          invitationId: "invitation-1",
          scope: "team",
          teamId: "north",
          teamName: "北岸影像",
          projectId: null,
          projectName: null,
          role: "member",
          permissionTemplateId: "north:team-member",
          permissionTemplateName: "团队成员",
        },
        replayed: false,
      } satisfies CreateResult<InvitationAcceptance>
    }
    return this.acceptanceResult
  }

  async revokeInvitation() {
    return this.revokeResult
  }

  async getContext() {
    return null
  }

  async getProjectAccess() {
    return null
  }

  async listAuditLogs(
    ..._args: Parameters<WorkspaceRepository["listAuditLogs"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["listAuditLogs"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async listNotifications(
    ..._args: Parameters<WorkspaceRepository["listNotifications"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["listNotifications"]>>> {
    return { items: [], unreadCount: 0 }
  }

  async updateNotification(
    ..._args: Parameters<WorkspaceRepository["updateNotification"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["updateNotification"]>>> {
    return null
  }

  async markAllNotificationsRead(
    ..._args: Parameters<WorkspaceRepository["markAllNotificationsRead"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["markAllNotificationsRead"]>>> {
    return 0
  }

  async getNotificationPreferences(
    ..._args: Parameters<WorkspaceRepository["getNotificationPreferences"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["getNotificationPreferences"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async updateNotificationPreferences(
    ..._args: Parameters<WorkspaceRepository["updateNotificationPreferences"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["updateNotificationPreferences"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async listPermissionWorkspace(
    ..._args: Parameters<WorkspaceRepository["listPermissionWorkspace"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["listPermissionWorkspace"]>>> {
    return { templates: [], members: [] }
  }

  async createPermissionTemplate(
    ..._args: Parameters<WorkspaceRepository["createPermissionTemplate"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["createPermissionTemplate"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async updatePermissionTemplate(
    ..._args: Parameters<WorkspaceRepository["updatePermissionTemplate"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["updatePermissionTemplate"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async assignTeamPermissionTemplate(
    ..._args: Parameters<WorkspaceRepository["assignTeamPermissionTemplate"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["assignTeamPermissionTemplate"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async assignProjectPermissionTemplate(
    ..._args: Parameters<WorkspaceRepository["assignProjectPermissionTemplate"]>
  ): Promise<
    Awaited<ReturnType<WorkspaceRepository["assignProjectPermissionTemplate"]>>
  > {
    throw new Error("not used by onboarding tests")
  }

  async listTasks(
    ..._args: Parameters<WorkspaceRepository["listTasks"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["listTasks"]>>> {
    return []
  }

  async createTask(
    ..._args: Parameters<WorkspaceRepository["createTask"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["createTask"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async updateTask(
    ..._args: Parameters<WorkspaceRepository["updateTask"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["updateTask"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async deleteTask(
    ..._args: Parameters<WorkspaceRepository["deleteTask"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["deleteTask"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async listCalendarEvents(
    ..._args: Parameters<WorkspaceRepository["listCalendarEvents"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["listCalendarEvents"]>>> {
    return []
  }

  async createCalendarEvent(
    ..._args: Parameters<WorkspaceRepository["createCalendarEvent"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["createCalendarEvent"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async updateCalendarEvent(
    ..._args: Parameters<WorkspaceRepository["updateCalendarEvent"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["updateCalendarEvent"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async deleteCalendarEvent(
    ..._args: Parameters<WorkspaceRepository["deleteCalendarEvent"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["deleteCalendarEvent"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async listNotes(
    ..._args: Parameters<WorkspaceRepository["listNotes"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["listNotes"]>>> {
    return []
  }

  async createNote(
    ..._args: Parameters<WorkspaceRepository["createNote"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["createNote"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async updateNote(
    ..._args: Parameters<WorkspaceRepository["updateNote"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["updateNote"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async deleteNote(
    ..._args: Parameters<WorkspaceRepository["deleteNote"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["deleteNote"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async listDeletedItems(
    ..._args: Parameters<WorkspaceRepository["listDeletedItems"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["listDeletedItems"]>>> {
    return []
  }

  async restoreDeletedItem(
    ..._args: Parameters<WorkspaceRepository["restoreDeletedItem"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["restoreDeletedItem"]>>> {
    throw new Error("not used by onboarding tests")
  }

  async permanentlyDeleteDeletedItem(
    ..._args: Parameters<WorkspaceRepository["permanentlyDeleteDeletedItem"]>
  ): Promise<Awaited<ReturnType<WorkspaceRepository["permanentlyDeleteDeletedItem"]>>> {
    throw new Error("not used by onboarding tests")
  }
}

function readAccess(): PermissionAccess {
  return {
    canRead: true,
    canWrite: true,
    capabilities: ["team.read", "team.write", "team.permissions.manage"],
  }
}

function writeOnlyAccess(): PermissionAccess {
  return { canRead: true, canWrite: true, capabilities: ["team.read", "team.write"] }
}

describe("workspace onboarding service", () => {
  it("creates teams without team-level prechecks and replays idempotent commands", async () => {
    const repository = new MemoryOnboardingRepository(null)
    const service = new WorkspaceService(repository)
    const command = {
      actorId: "account-fanxing",
      name: "北岸影像",
      idempotencyKey: "team-create-1",
    }

    const created = await service.createTeam(command)
    expect(created).toMatchObject({
      item: { name: "北岸影像", role: "owner" },
      replayed: false,
    })

    const replay = await service.createTeam(command)
    expect(replay).toMatchObject({
      item: created.item,
      replayed: true,
    })
    expect(repository.teamCreations).toHaveLength(2)
  })

  it("requires team write capability to create a project", async () => {
    const denied = new WorkspaceService(new MemoryOnboardingRepository(null))
    await expect(
      denied.createProject({
        actorId: "account-fanxing",
        teamId: "north",
        name: "冬夜咖啡",
        idempotencyKey: "project-create-1",
      }),
    ).rejects.toMatchObject({ code: "TEAM_ACCESS_DENIED", statusCode: 403 })

    const repository = new MemoryOnboardingRepository(writeOnlyAccess())
    const service = new WorkspaceService(repository)
    const created = await service.createProject({
      actorId: "account-fanxing",
      teamId: "north",
      name: "冬夜咖啡",
      idempotencyKey: "project-create-2",
    })
    expect(created.item).toMatchObject({
      teamId: "north",
      role: "owner",
      permissionTemplateId: "north:project-manager",
    })
    expect(repository.projectCreations[0].actorId).toBe("account-fanxing")

    const manageOnly = new WorkspaceService(
      new MemoryOnboardingRepository({
        canRead: true,
        canWrite: false,
        capabilities: ["team.read"],
      }),
    )
    await expect(
      manageOnly.createProject({
        actorId: "account-fanxing",
        teamId: "north",
        name: "冬夜咖啡",
        idempotencyKey: "project-create-3",
      }),
    ).rejects.toMatchObject({ code: "TEAM_PERMISSION_DENIED", statusCode: 403 })
  })

  it("validates invitation scope and requires manage capability to create invitations", async () => {
    const repository = new MemoryOnboardingRepository(writeOnlyAccess())
    const service = new WorkspaceService(repository)

    await expect(
      service.createInvitation({
        actorId: "account-fanxing",
        teamId: "north",
        scope: "team",
        email: "linqiao@shadowproducer.local",
        idempotencyKey: "invite-create-1",
      }),
    ).rejects.toMatchObject({ code: "TEAM_PERMISSION_DENIED", statusCode: 403 })
    expect(repository.invitationCreations).toHaveLength(0)

    const repository2 = new MemoryOnboardingRepository(readAccess())
    const service2 = new WorkspaceService(repository2)
    await expect(
      service2.createInvitation({
        actorId: "account-fanxing",
        teamId: "north",
        scope: "project",
        email: "linqiao@shadowproducer.local",
        idempotencyKey: "invite-create-2",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_REQUIRED", statusCode: 400 })
    await expect(
      service2.createInvitation({
        actorId: "account-fanxing",
        teamId: "north",
        scope: "team",
        projectId: "winter-coffee",
        email: "linqiao@shadowproducer.local",
        idempotencyKey: "invite-create-3",
      }),
    ).rejects.toMatchObject({ code: "INVITATION_SCOPE_INVALID", statusCode: 400 })
    expect(repository2.invitationCreations).toHaveLength(0)

    const created = await service2.createInvitation({
      actorId: "account-fanxing",
      teamId: "north",
      scope: "team",
      email: "Linqiao@Shadowproducer.Local",
      idempotencyKey: "invite-create-4",
    })
    expect(created.item).toMatchObject({
      teamId: "north",
      scope: "team",
      status: "pending",
    })
    expect(repository2.invitationCreations[0].scope).toBe("team")
  })

  it("lists invitations only for managers", async () => {
    const repository = new MemoryOnboardingRepository(writeOnlyAccess())
    repository.invitations = [invitationSummary()]
    const service = new WorkspaceService(repository)

    await expect(
      service.listInvitations("account-fanxing", "north"),
    ).rejects.toMatchObject({ code: "TEAM_PERMISSION_DENIED", statusCode: 403 })

    const repository2 = new MemoryOnboardingRepository(readAccess())
    repository2.invitations = [invitationSummary()]
    const items = await new WorkspaceService(repository2).listInvitations(
      "account-fanxing",
      "north",
    )
    expect(items.items).toEqual([invitationSummary()])
    expect(repository2.listedTeamIds).toEqual(["north"])
  })

  it("resolves the invitation summary by token and rejects unavailable invitations", async () => {
    const repository = new MemoryOnboardingRepository(readAccess())
    repository.invitations = [invitationSummary({ id: "invitation-pending" })]
    const service = new WorkspaceService(repository)

    const summary = await service.getInvitationSummary(validToken)
    expect(summary.item).toMatchObject({
      teamName: "北岸影像",
      email: "linqiao@shadowproducer.local",
      status: "pending",
    })

    await expect(service.getInvitationSummary("unknown-token")).rejects.toMatchObject({
      code: "INVITATION_NOT_FOUND",
      statusCode: 404,
    })

    repository.invitations = [invitationSummary({ status: "revoked" })]
    await expect(service.getInvitationSummary(validToken)).rejects.toMatchObject({
      code: "INVITATION_REVOKED",
      statusCode: 410,
    })
    repository.invitations = [invitationSummary({ status: "accepted" })]
    await expect(service.getInvitationSummary(validToken)).rejects.toMatchObject({
      code: "INVITATION_ALREADY_ACCEPTED",
      statusCode: 410,
    })
    repository.invitations = [invitationSummary({ expiresAt: pastExpiry })]
    await expect(service.getInvitationSummary(validToken)).rejects.toMatchObject({
      code: "INVITATION_EXPIRED",
      statusCode: 410,
    })
  })

  it("delegates acceptance to the repository", async () => {
    const repository = new MemoryOnboardingRepository(readAccess())
    const service = new WorkspaceService(repository)
    const command = {
      actorId: "account-linqiao",
      token: validToken,
      idempotencyKey: "invite-accept-1",
    }

    const accepted = await service.acceptInvitation(command)
    expect(accepted.item).toMatchObject({
      invitationId: "invitation-1",
      scope: "team",
      role: "member",
      permissionTemplateName: "团队成员",
    })
    expect(repository.acceptances).toEqual([command])
  })

  it("revokes invitations with manage capability and maps repository results", async () => {
    const repository = new MemoryOnboardingRepository(writeOnlyAccess())
    const service = new WorkspaceService(repository)
    const command = {
      actorId: "account-fanxing",
      teamId: "north",
      itemId: "invitation-1",
      expectedRevision: 1,
    } satisfies RevokeInvitationCommand

    await expect(service.revokeInvitation(command)).rejects.toMatchObject({
      code: "TEAM_PERMISSION_DENIED",
      statusCode: 403,
    })

    const repository2 = new MemoryOnboardingRepository(readAccess())
    repository2.revokeResult = { kind: "not_found" }
    await expect(
      new WorkspaceService(repository2).revokeInvitation(command),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", statusCode: 404 })

    const repository3 = new MemoryOnboardingRepository(readAccess())
    repository3.revokeResult = { kind: "conflict" }
    await expect(
      new WorkspaceService(repository3).revokeInvitation(command),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })

    const repository4 = new MemoryOnboardingRepository(readAccess())
    repository4.revokeResult = { kind: "ok", item: { id: "invitation-1" } }
    const revoked = await new WorkspaceService(repository4).revokeInvitation(command)
    expect(revoked).toEqual({ id: "invitation-1" })
  })
})
