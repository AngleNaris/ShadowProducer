import type {
  AssignProjectPermissionTemplateCommand,
  AssignTeamPermissionTemplateCommand,
  CreateCalendarEventCommand,
  CreateNoteCommand,
  CreatePermissionTemplateCommand,
  CreateTaskCommand,
  DeleteItemCommand,
  ListAuditLogsQuery,
  PermanentlyDeleteRecycleItemCommand,
  RestoreRecycleItemCommand,
  ScriptRepository,
  UpdateCalendarEventCommand,
  UpdateNoteCommand,
  UpdateNotificationCommand,
  UpdateNotificationPreferencesCommand,
  UpdatePermissionTemplateCommand,
  UpdateResult,
  UpdateTaskCommand,
  WorkspaceRepository,
} from "@shadowproducer/application"
import { ScriptService, WorkspaceService } from "@shadowproducer/application"
import type {
  AuditLog,
  AuditLogList,
  CalendarEvent,
  NotificationPreferences,
  PermissionTemplate,
  PermissionWorkspace,
  WorkspaceContext,
  WorkspaceNote,
  WorkspaceNotification,
  WorkspaceRecycleItem,
  WorkspaceTask,
} from "@shadowproducer/contracts"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"

const now = "2026-08-28T08:00:00.000Z"

class MemoryWorkspaceRepository implements WorkspaceRepository {
  readonly audits: AuditLog[] = [
    {
      id: "3",
      actorAccountId: "account-fanxing",
      actorName: "繁星",
      actorType: "account",
      teamId: "north",
      projectId: "winter-coffee",
      projectName: "冬夜咖啡",
      action: "script-version.updated",
      subjectId: "v7",
      metadata: { revision: 5 },
      createdAt: "2026-08-28T10:00:00.000Z",
    },
    {
      id: "2",
      actorAccountId: "account-fanxing",
      actorName: "繁星",
      actorType: "account",
      teamId: "north",
      projectId: null,
      projectName: null,
      action: "team-contact.created",
      subjectId: "contact-1",
      metadata: { name: "林霜" },
      createdAt: "2026-08-28T09:00:00.000Z",
    },
  ]
  readonly notifications: WorkspaceNotification[] = [
    {
      id: "notification-1",
      teamId: "north",
      projectId: "winter-coffee",
      projectName: "冬夜咖啡",
      kind: "call_sheet_published",
      subjectId: "call-sheet-1",
      sourceActorName: "林乔",
      title: "通告已发布：车站夜戏",
      body: "8 月 14 日 · 16:30 集合 · v1",
      metadata: { publicationVersion: 1 },
      readAt: null,
      acknowledgedAt: null,
      createdAt: now,
    },
  ]
  preferences: NotificationPreferences = {
    publishedCallSheets: true,
    importantCallSheetChanges: true,
    permissionAssignments: true,
    portfolioPublications: true,
    reviewActivity: true,
    contactSharing: true,
  }
  readonly tasks: WorkspaceTask[] = []
  readonly events: CalendarEvent[] = []
  readonly notes: WorkspaceNote[] = []
  private readonly deletedItems = new Map<
    string,
    {
      kind: WorkspaceRecycleItem["kind"]
      item: WorkspaceTask | CalendarEvent | WorkspaceNote
      deletedAt: string
    }
  >()
  readonly permissionTemplates: PermissionTemplate[] = [
    {
      id: "team-producer",
      teamId: "north",
      scope: "team",
      key: "producer",
      name: "制片负责人",
      permissions: [
        "team.read",
        "team.write",
        "team.permissions.manage",
        "asset.write",
        "portfolio.write",
        "portfolio.publish",
      ],
      isSystem: true,
      assignedCount: 1,
      revision: 1,
      updatedAt: now,
    },
    {
      id: "team-collaborator",
      teamId: "north",
      scope: "team",
      key: "collaborator",
      name: "团队协作者",
      permissions: ["team.read", "team.write", "asset.write", "portfolio.write"],
      isSystem: true,
      assignedCount: 1,
      revision: 1,
      updatedAt: now,
    },
    {
      id: "project-editor",
      teamId: "north",
      scope: "project",
      key: "editor",
      name: "项目编辑",
      permissions: [
        "project.read",
        "project.write",
        "script.write",
        "production.write",
        "review.write",
      ],
      isSystem: true,
      assignedCount: 1,
      revision: 1,
      updatedAt: now,
    },
    {
      id: "project-reviewer",
      teamId: "north",
      scope: "project",
      key: "reviewer",
      name: "审片负责人",
      permissions: ["project.read", "review.write", "review.manage"],
      isSystem: true,
      assignedCount: 1,
      revision: 1,
      updatedAt: now,
    },
  ]
  readonly permissionMembers: PermissionWorkspace["members"] = [
    {
      accountId: "account-fanxing",
      displayName: "繁星",
      role: "producer",
      permissionTemplateId: "team-producer",
      permissionTemplateName: "制片负责人",
      permissionRevision: 1,
      projects: [
        {
          projectId: "winter-coffee",
          projectName: "冬夜咖啡",
          role: "editor",
          permissionTemplateId: "project-editor",
          permissionTemplateName: "项目编辑",
          permissionRevision: 1,
        },
      ],
    },
    {
      accountId: "account-linqiao",
      displayName: "林乔",
      role: "member",
      permissionTemplateId: "team-collaborator",
      permissionTemplateName: "团队协作者",
      permissionRevision: 1,
      projects: [
        {
          projectId: "winter-coffee",
          projectName: "冬夜咖啡",
          role: "reviewer",
          permissionTemplateId: "project-reviewer",
          permissionTemplateName: "审片负责人",
          permissionRevision: 1,
        },
      ],
    },
  ]
  private readonly receipts = new Map<
    string,
    WorkspaceTask | CalendarEvent | WorkspaceNote
  >()
  private readonly permissionReceipts = new Map<string, PermissionTemplate>()

  async getContext(actorId: string): Promise<WorkspaceContext | null> {
    if (actorId !== "account-fanxing") return null
    return {
      actor: { id: actorId, displayName: "繁星" },
      teams: [
        {
          id: "north",
          name: "北岸影像",
          role: "producer",
          memberCount: 3,
          projects: [
            {
              id: "winter-coffee",
              name: "冬夜咖啡",
              role: "editor",
              status: "拍摄中",
              updatedAt: now,
            },
          ],
        },
      ],
    }
  }

  async getTeamAccess(actorId: string, teamId: string) {
    return actorId === "account-fanxing" && teamId === "north"
      ? { canRead: true, canWrite: true }
      : null
  }

  async getProjectAccess(actorId: string, teamId: string, projectId: string) {
    return actorId === "account-fanxing" &&
      teamId === "north" &&
      projectId === "winter-coffee"
      ? { canRead: true, canWrite: true }
      : null
  }

  async listAuditLogs(
    _actorId: string,
    _teamId: string,
    query: ListAuditLogsQuery,
  ): Promise<AuditLogList> {
    const items = this.audits.filter(
      (item) =>
        (!query.projectId || item.projectId === query.projectId) &&
        (query.scope !== "team" || item.projectId === null) &&
        (!query.action || item.action.includes(query.action)) &&
        (!query.actor ||
          item.actorName.includes(query.actor) ||
          item.actorAccountId?.includes(query.actor)),
    )
    const offset = (query.page - 1) * query.pageSize
    return {
      items: items.slice(offset, offset + query.pageSize),
      total: items.length,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async listNotifications(actorId: string, teamId: string) {
    const items =
      actorId === "account-fanxing"
        ? this.notifications.filter((item) => item.teamId === teamId)
        : []
    return {
      items: structuredClone(items),
      unreadCount: items.filter((item) => !item.readAt).length,
    }
  }

  async updateNotification(command: UpdateNotificationCommand) {
    if (command.actorId !== "account-fanxing") return null
    const item = this.notifications.find(
      (candidate) =>
        candidate.id === command.itemId && candidate.teamId === command.teamId,
    )
    if (!item) return null
    item.readAt = now
    if (command.action === "acknowledge") item.acknowledgedAt = now
    return structuredClone(item)
  }

  async markAllNotificationsRead(actorId: string, teamId: string) {
    if (actorId !== "account-fanxing") return 0
    let updated = 0
    for (const item of this.notifications) {
      if (item.teamId !== teamId || item.readAt) continue
      item.readAt = now
      updated += 1
    }
    return updated
  }

  async getNotificationPreferences() {
    return structuredClone(this.preferences)
  }

  async updateNotificationPreferences(command: UpdateNotificationPreferencesCommand) {
    this.preferences = {
      publishedCallSheets: command.publishedCallSheets,
      importantCallSheetChanges: command.importantCallSheetChanges,
      permissionAssignments: command.permissionAssignments,
      portfolioPublications: command.portfolioPublications,
      reviewActivity: command.reviewActivity,
      contactSharing: command.contactSharing,
    }
    return structuredClone(this.preferences)
  }

  async listPermissionWorkspace(teamId: string) {
    if (teamId !== "north") return { templates: [], members: [] }
    return {
      templates: structuredClone(this.permissionTemplates),
      members: structuredClone(this.permissionMembers),
    }
  }

  async createPermissionTemplate(command: CreatePermissionTemplateCommand) {
    const receipt = this.permissionReceipts.get(command.idempotencyKey)
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const item: PermissionTemplate = {
      id: `permission-template-${this.permissionTemplates.length + 1}`,
      teamId: command.teamId,
      scope: command.scope,
      key: `custom-${this.permissionTemplates.length + 1}`,
      name: command.name,
      permissions: [...command.permissions],
      isSystem: false,
      assignedCount: 0,
      revision: 1,
      updatedAt: now,
    }
    this.permissionTemplates.push(item)
    this.permissionReceipts.set(command.idempotencyKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async updatePermissionTemplate(command: UpdatePermissionTemplateCommand) {
    const item = this.permissionTemplates.find(
      (candidate) =>
        candidate.id === command.itemId && candidate.teamId === command.teamId,
    )
    if (!item) return { kind: "not_found" } as const
    if (item.isSystem) return { kind: "system_template" } as const
    if (item.revision !== command.expectedRevision) return { kind: "conflict" } as const
    if (command.name !== undefined) item.name = command.name
    if (command.permissions !== undefined) item.permissions = [...command.permissions]
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) } as const
  }

  async assignTeamPermissionTemplate(command: AssignTeamPermissionTemplateCommand) {
    const template = this.permissionTemplates.find(
      (candidate) =>
        candidate.id === command.templateId &&
        candidate.teamId === command.teamId &&
        candidate.scope === "team",
    )
    if (!template) return { kind: "invalid_template" } as const
    const member = this.permissionMembers.find(
      (candidate) => candidate.accountId === command.accountId,
    )
    if (!member) return { kind: "not_found" } as const
    if (member.permissionRevision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    member.permissionTemplateId = template.id
    member.permissionTemplateName = template.name
    member.permissionRevision += 1
    return {
      kind: "ok",
      item: {
        accountId: member.accountId,
        permissionTemplateId: template.id,
        permissionRevision: member.permissionRevision,
      },
    } as const
  }

  async assignProjectPermissionTemplate(command: AssignProjectPermissionTemplateCommand) {
    const template = this.permissionTemplates.find(
      (candidate) =>
        candidate.id === command.templateId &&
        candidate.teamId === command.teamId &&
        candidate.scope === "project",
    )
    if (!template) return { kind: "invalid_template" } as const
    const project = this.permissionMembers
      .find((candidate) => candidate.accountId === command.accountId)
      ?.projects.find((candidate) => candidate.projectId === command.projectId)
    if (!project) return { kind: "not_found" } as const
    if (project.permissionRevision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    project.permissionTemplateId = template.id
    project.permissionTemplateName = template.name
    project.permissionRevision += 1
    return {
      kind: "ok",
      item: {
        accountId: command.accountId,
        permissionTemplateId: template.id,
        permissionRevision: project.permissionRevision,
      },
    } as const
  }

  // Onboarding repository surface is exercised by workspace-onboarding tests.
  async createTeam(): Promise<never> {
    throw new Error("not used by workspace API tests")
  }

  async createProject(): Promise<never> {
    throw new Error("not used by workspace API tests")
  }

  async createInvitation(): Promise<never> {
    throw new Error("not used by workspace API tests")
  }

  async listInvitations(): Promise<never> {
    throw new Error("not used by workspace API tests")
  }

  async findInvitationByTokenHash(): Promise<never> {
    throw new Error("not used by workspace API tests")
  }

  async acceptInvitation(): Promise<never> {
    throw new Error("not used by workspace API tests")
  }

  async revokeInvitation(): Promise<never> {
    throw new Error("not used by workspace API tests")
  }

  async listTasks(actorId: string, teamId: string) {
    return this.tasks.filter(
      (item) => item.teamId === teamId && actorId === "account-fanxing",
    )
  }

  async createTask(command: CreateTaskCommand) {
    const receiptKey = `task:${command.idempotencyKey}`
    const receipt = this.receipts.get(receiptKey) as WorkspaceTask | undefined
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const item: WorkspaceTask = {
      id: `task-${this.tasks.length + 1}`,
      teamId: command.teamId,
      projectId: command.projectId ?? null,
      projectName: command.projectId ? "冬夜咖啡" : null,
      title: command.title,
      dueDate: command.dueDate ?? null,
      assigneeName: "繁星",
      status: command.status ?? "待开始",
      target: command.target ?? "project",
      revision: 1,
      updatedAt: now,
    }
    this.tasks.push(item)
    this.receipts.set(receiptKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async updateTask(command: UpdateTaskCommand): Promise<UpdateResult<WorkspaceTask>> {
    const item = this.tasks.find((candidate) => candidate.id === command.itemId)
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (command.title !== undefined) item.title = command.title
    if (command.dueDate !== undefined) item.dueDate = command.dueDate
    if (command.status !== undefined) item.status = command.status
    if (command.target !== undefined) item.target = command.target
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async deleteTask(command: DeleteItemCommand) {
    return this.deleteFrom(this.tasks, command, "task")
  }

  async listCalendarEvents(_actorId: string, teamId: string) {
    return this.events.filter((item) => item.teamId === teamId)
  }

  async createCalendarEvent(command: CreateCalendarEventCommand) {
    const receiptKey = `event:${command.idempotencyKey}`
    const receipt = this.receipts.get(receiptKey) as CalendarEvent | undefined
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const item: CalendarEvent = {
      id: `event-${this.events.length + 1}`,
      teamId: command.teamId,
      projectId: command.projectId ?? null,
      projectName: command.projectId ? "冬夜咖啡" : null,
      title: command.title,
      startsAt: command.startsAt,
      endsAt: command.endsAt ?? null,
      timezone: command.timezone,
      allDay: command.allDay ?? false,
      visibility: command.visibility ?? "private",
      target: command.target ?? "calendar",
      revision: 1,
      updatedAt: now,
    }
    this.events.push(item)
    this.receipts.set(receiptKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async updateCalendarEvent(
    command: UpdateCalendarEventCommand,
  ): Promise<UpdateResult<CalendarEvent>> {
    const item = this.events.find((candidate) => candidate.id === command.itemId)
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (command.title !== undefined) item.title = command.title
    if (command.startsAt !== undefined) item.startsAt = command.startsAt
    if (command.endsAt !== undefined) item.endsAt = command.endsAt
    if (command.timezone !== undefined) item.timezone = command.timezone
    if (command.allDay !== undefined) item.allDay = command.allDay
    if (command.visibility !== undefined) item.visibility = command.visibility
    if (command.target !== undefined) item.target = command.target
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async deleteCalendarEvent(command: DeleteItemCommand) {
    return this.deleteFrom(this.events, command, "calendar-event")
  }

  async listNotes(_actorId: string, teamId: string) {
    return this.notes.filter((item) => item.teamId === teamId)
  }

  async createNote(command: CreateNoteCommand) {
    const receiptKey = `note:${command.idempotencyKey}`
    const receipt = this.receipts.get(receiptKey) as WorkspaceNote | undefined
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const item: WorkspaceNote = {
      id: `note-${this.notes.length + 1}`,
      teamId: command.teamId,
      projectId: command.projectId ?? null,
      projectName: command.projectId ? "冬夜咖啡" : null,
      title: command.title,
      body: command.body ?? "",
      kind: command.kind,
      pinned: command.pinned ?? false,
      revision: 1,
      updatedAt: now,
    }
    this.notes.push(item)
    this.receipts.set(receiptKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async updateNote(command: UpdateNoteCommand): Promise<UpdateResult<WorkspaceNote>> {
    const item = this.notes.find((candidate) => candidate.id === command.itemId)
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (command.title !== undefined) item.title = command.title
    if (command.body !== undefined) item.body = command.body
    if (command.pinned !== undefined) item.pinned = command.pinned
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async deleteNote(command: DeleteItemCommand) {
    return this.deleteFrom(this.notes, command, "note")
  }

  async listDeletedItems(_actorId: string, teamId: string) {
    return [...this.deletedItems.values()]
      .filter(({ item }) => item.teamId === teamId)
      .map(({ kind, item, deletedAt }) => ({
        id: item.id,
        kind,
        title: item.title,
        projectId: item.projectId,
        projectName: item.projectName,
        deletedAt,
        revision: item.revision,
      }))
  }

  async restoreDeletedItem(command: RestoreRecycleItemCommand) {
    const key = `${command.kind}:${command.itemId}`
    const deleted = this.deletedItems.get(key)
    if (!deleted || deleted.item.teamId !== command.teamId) {
      return { kind: "not_found" } as const
    }
    if (deleted.item.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    deleted.item.revision += 1
    this.deletedItems.delete(key)
    if (deleted.kind === "task") this.tasks.push(deleted.item as WorkspaceTask)
    if (deleted.kind === "calendar-event") {
      this.events.push(deleted.item as CalendarEvent)
    }
    if (deleted.kind === "note") this.notes.push(deleted.item as WorkspaceNote)
    return { kind: "ok", item: { id: deleted.item.id } } as const
  }

  async permanentlyDeleteDeletedItem(command: PermanentlyDeleteRecycleItemCommand) {
    const key = `${command.kind}:${command.itemId}`
    const deleted = this.deletedItems.get(key)
    if (!deleted || deleted.item.teamId !== command.teamId) {
      return { kind: "not_found" } as const
    }
    if (deleted.item.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    this.deletedItems.delete(key)
    return { kind: "ok", item: { id: deleted.item.id } } as const
  }

  private async deleteFrom<T extends WorkspaceTask | CalendarEvent | WorkspaceNote>(
    items: T[],
    command: DeleteItemCommand,
    kind: WorkspaceRecycleItem["kind"],
  ): Promise<UpdateResult<{ id: string }>> {
    const index = items.findIndex((item) => item.id === command.itemId)
    if (index < 0) return { kind: "not_found" }
    if (items[index].revision !== command.expectedRevision) return { kind: "conflict" }
    const [deleted] = items.splice(index, 1)
    this.deletedItems.set(`${kind}:${deleted.id}`, {
      kind,
      item: deleted,
      deletedAt: now,
    })
    return { kind: "ok", item: { id: deleted.id } }
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

async function createTestApp() {
  const repository = new MemoryWorkspaceRepository()
  const app = await buildApp({
    scriptService: new ScriptService(unusedScriptRepository),
    workspaceService: new WorkspaceService(repository),
    logger: false,
  })
  apps.push(app)
  return { app, repository }
}

const authHeaders = { "x-shadow-account-id": "account-fanxing" }

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("workspace productivity API", () => {
  it("returns the actor's authorized teams and projects", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspace-context",
      headers: authHeaders,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().teams[0].projects[0].id).toBe("winter-coffee")
  })

  it("isolates task lists by team membership", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "GET",
      url: "/v1/teams/midnight/tasks",
      headers: authHeaders,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe("TEAM_ACCESS_DENIED")
  })

  it("queries team audit logs with stable filters and project access", async () => {
    const { app } = await createTestApp()
    const firstPage = await app.inject({
      method: "GET",
      url: "/v1/teams/north/audit-logs?pageSize=1&action=script-version",
      headers: authHeaders,
    })
    expect(firstPage.statusCode).toBe(200)
    expect(firstPage.json()).toMatchObject({ total: 1, page: 1, pageSize: 1 })
    expect(firstPage.json().items[0].subjectId).toBe("v7")

    const teamOnly = await app.inject({
      method: "GET",
      url: "/v1/teams/north/audit-logs?scope=team",
      headers: authHeaders,
    })
    expect(teamOnly.statusCode).toBe(200)
    expect(teamOnly.json().items.map((item: AuditLog) => item.projectId)).toEqual([null])

    const forbiddenProject = await app.inject({
      method: "GET",
      url: "/v1/teams/north/audit-logs?projectId=city-walk",
      headers: authHeaders,
    })
    expect(forbiddenProject.statusCode).toBe(403)
    expect(forbiddenProject.json().code).toBe("PROJECT_ACCESS_DENIED")
  })

  it("manages in-app notification state and preferences", async () => {
    const { app } = await createTestApp()
    const listed = await app.inject({
      method: "GET",
      url: "/v1/teams/north/notifications",
      headers: authHeaders,
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toMatchObject({ unreadCount: 1 })

    const acknowledged = await app.inject({
      method: "PATCH",
      url: "/v1/teams/north/notifications/notification-1",
      headers: authHeaders,
      payload: { action: "acknowledge" },
    })
    expect(acknowledged.statusCode).toBe(200)
    expect(acknowledged.json().item).toMatchObject({
      readAt: now,
      acknowledgedAt: now,
    })

    const readAll = await app.inject({
      method: "POST",
      url: "/v1/teams/north/notifications/read-all",
      headers: authHeaders,
    })
    expect(readAll.statusCode).toBe(200)
    expect(readAll.json()).toEqual({ updated: 0 })

    const preferences = await app.inject({
      method: "PUT",
      url: "/v1/teams/north/notification-preferences",
      headers: authHeaders,
      payload: {
        publishedCallSheets: false,
        importantCallSheetChanges: true,
        permissionAssignments: false,
        portfolioPublications: false,
        reviewActivity: false,
        contactSharing: false,
      },
    })
    expect(preferences.statusCode).toBe(200)
    expect(preferences.json()).toEqual({
      publishedCallSheets: false,
      importantCallSheetChanges: true,
      permissionAssignments: false,
      portfolioPublications: false,
      reviewActivity: false,
      contactSharing: false,
    })
  })

  it("lists permission members and creates a template idempotently", async () => {
    const { app, repository } = await createTestApp()
    const workspace = await app.inject({
      method: "GET",
      url: "/v1/teams/north/permissions",
      headers: authHeaders,
    })
    expect(workspace.statusCode).toBe(200)
    expect(workspace.json()).toMatchObject({
      currentAccountId: "account-fanxing",
      canManage: true,
    })
    expect(workspace.json().members).toHaveLength(2)

    const request = {
      method: "POST" as const,
      url: "/v1/teams/north/permission-templates",
      headers: authHeaders,
      payload: {
        scope: "project",
        name: "现场统筹",
        permissions: ["project.read", "production.write"],
        idempotencyKey: "permission-template-command-1",
      },
    }
    const created = await app.inject(request)
    const replay = await app.inject(request)

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      replayed: false,
      item: { name: "现场统筹", revision: 1 },
    })
    expect(replay.statusCode).toBe(201)
    expect(replay.json()).toMatchObject({ replayed: true, item: created.json().item })
    expect(repository.permissionTemplates).toHaveLength(5)
  })

  it("protects system templates, scope and newer template revisions", async () => {
    const { app } = await createTestApp()
    const immutable = await app.inject({
      method: "PATCH",
      url: "/v1/teams/north/permission-templates/team-producer",
      headers: authHeaders,
      payload: { name: "改名", expectedRevision: 1 },
    })
    expect(immutable.statusCode).toBe(409)
    expect(immutable.json().code).toBe("SYSTEM_TEMPLATE_IMMUTABLE")

    const invalidScope = await app.inject({
      method: "POST",
      url: "/v1/teams/north/permission-templates",
      headers: authHeaders,
      payload: {
        scope: "team",
        name: "错误作用域",
        permissions: ["project.read"],
        idempotencyKey: "permission-template-command-2",
      },
    })
    expect(invalidScope.statusCode).toBe(400)
    expect(invalidScope.json().code).toBe("PERMISSION_SCOPE_INVALID")

    const missingRead = await app.inject({
      method: "POST",
      url: "/v1/teams/north/permission-templates",
      headers: authHeaders,
      payload: {
        scope: "team",
        name: "缺少查看权限",
        permissions: ["asset.write"],
        idempotencyKey: "permission-template-command-4",
      },
    })
    expect(missingRead.statusCode).toBe(400)
    expect(missingRead.json().code).toBe("PERMISSION_READ_REQUIRED")

    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/permission-templates",
      headers: authHeaders,
      payload: {
        scope: "team",
        name: "素材协作者",
        permissions: ["team.read", "asset.write"],
        idempotencyKey: "permission-template-command-3",
      },
    })
    const conflict = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/permission-templates/${created.json().item.id}`,
      headers: authHeaders,
      payload: { name: "过期修改", expectedRevision: 8 },
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().code).toBe("RESOURCE_CONFLICT")
  })

  it("assigns scoped templates while rejecting self-assignment", async () => {
    const { app } = await createTestApp()
    const selfAssignment = await app.inject({
      method: "PATCH",
      url: "/v1/teams/north/members/account-fanxing/permission-template",
      headers: authHeaders,
      payload: { templateId: "team-collaborator", expectedRevision: 1 },
    })
    expect(selfAssignment.statusCode).toBe(409)
    expect(selfAssignment.json().code).toBe("PERMISSION_SELF_ASSIGNMENT_FORBIDDEN")

    const wrongScope = await app.inject({
      method: "PATCH",
      url: "/v1/teams/north/members/account-linqiao/permission-template",
      headers: authHeaders,
      payload: { templateId: "project-editor", expectedRevision: 1 },
    })
    expect(wrongScope.statusCode).toBe(400)
    expect(wrongScope.json().code).toBe("PERMISSION_TEMPLATE_INVALID")

    const teamAssignment = await app.inject({
      method: "PATCH",
      url: "/v1/teams/north/members/account-linqiao/permission-template",
      headers: authHeaders,
      payload: { templateId: "team-producer", expectedRevision: 1 },
    })
    expect(teamAssignment.statusCode).toBe(200)
    expect(teamAssignment.json()).toEqual({
      accountId: "account-linqiao",
      permissionTemplateId: "team-producer",
      permissionRevision: 2,
    })

    const projectAssignment = await app.inject({
      method: "PATCH",
      url: "/v1/teams/north/projects/winter-coffee/members/account-linqiao/permission-template",
      headers: authHeaders,
      payload: { templateId: "project-editor", expectedRevision: 1 },
    })
    expect(projectAssignment.statusCode).toBe(200)
    expect(projectAssignment.json()).toMatchObject({
      permissionTemplateId: "project-editor",
      permissionRevision: 2,
    })
  })

  it("creates a task idempotently and protects newer revisions", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/teams/north/tasks",
      headers: authHeaders,
      payload: {
        title: "确认通告名单",
        projectId: "winter-coffee",
        dueDate: "2026-08-29",
        idempotencyKey: "task-command-1",
      },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)

    expect(first.statusCode).toBe(201)
    expect(replay.statusCode).toBe(201)
    expect(replay.json().replayed).toBe(true)
    expect(repository.tasks).toHaveLength(1)

    const conflict = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/tasks/${first.json().item.id}`,
      headers: authHeaders,
      payload: { status: "已完成", expectedRevision: 9 },
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().code).toBe("RESOURCE_CONFLICT")
  })

  it("creates, updates and deletes a calendar event", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/calendar-events",
      headers: authHeaders,
      payload: {
        title: "夜戏集合",
        projectId: "winter-coffee",
        startsAt: "2026-08-29T08:30:00.000Z",
        timezone: "Asia/Shanghai",
        idempotencyKey: "event-command-1",
      },
    })
    expect(created.statusCode).toBe(201)

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/calendar-events/${created.json().item.id}`,
      headers: authHeaders,
      payload: { title: "夜戏集合与妆发", expectedRevision: 1 },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().revision).toBe(2)

    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/calendar-events/${created.json().item.id}`,
      headers: authHeaders,
      payload: { expectedRevision: 2 },
    })
    expect(deleted.statusCode).toBe(200)

    const recycled = await app.inject({
      method: "GET",
      url: "/v1/teams/north/recycle-bin",
      headers: authHeaders,
    })
    expect(recycled.statusCode).toBe(200)
    expect(recycled.json().items).toMatchObject([
      {
        id: created.json().item.id,
        kind: "calendar-event",
        title: "夜戏集合与妆发",
        revision: 2,
      },
    ])

    const staleRestore = await app.inject({
      method: "POST",
      url: `/v1/teams/north/recycle-bin/calendar-event/${created.json().item.id}/restore`,
      headers: authHeaders,
      payload: { expectedRevision: 1 },
    })
    expect(staleRestore.statusCode).toBe(409)

    const restored = await app.inject({
      method: "POST",
      url: `/v1/teams/north/recycle-bin/calendar-event/${created.json().item.id}/restore`,
      headers: authHeaders,
      payload: { expectedRevision: 2 },
    })
    expect(restored.statusCode).toBe(200)
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/teams/north/recycle-bin",
          headers: authHeaders,
        })
      ).json().items,
    ).toEqual([])
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/teams/north/calendar-events",
          headers: authHeaders,
        })
      ).json().items[0],
    ).toMatchObject({
      id: created.json().item.id,
      revision: 3,
    })

    const deletedAgain = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/calendar-events/${created.json().item.id}`,
      headers: authHeaders,
      payload: { expectedRevision: 3 },
    })
    expect(deletedAgain.statusCode).toBe(200)

    const missingConfirmation = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/recycle-bin/calendar-event/${created.json().item.id}`,
      headers: authHeaders,
      payload: { expectedRevision: 3 },
    })
    expect(missingConfirmation.statusCode).toBe(400)

    const stalePermanentDelete = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/recycle-bin/calendar-event/${created.json().item.id}`,
      headers: authHeaders,
      payload: { expectedRevision: 2, confirmation: "permanent-delete" },
    })
    expect(stalePermanentDelete.statusCode).toBe(409)

    const permanentlyDeleted = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/recycle-bin/calendar-event/${created.json().item.id}`,
      headers: authHeaders,
      payload: { expectedRevision: 3, confirmation: "permanent-delete" },
    })
    expect(permanentlyDeleted.statusCode).toBe(200)
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/teams/north/recycle-bin",
          headers: authHeaders,
        })
      ).json().items,
    ).toEqual([])
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/teams/north/recycle-bin/calendar-event/${created.json().item.id}/restore`,
          headers: authHeaders,
          payload: { expectedRevision: 3 },
        })
      ).statusCode,
    ).toBe(404)
  })

  it("accepts every team-resource recycle kind and rejects unknown kinds", async () => {
    const { app } = await createTestApp()
    for (const kind of ["team-contact", "supplier"]) {
      const accepted = await app.inject({
        method: "POST",
        url: `/v1/teams/north/recycle-bin/${kind}/missing/restore`,
        headers: authHeaders,
        payload: { expectedRevision: 1 },
      })
      expect(accepted.statusCode).toBe(404)

      const permanentDeleteAccepted = await app.inject({
        method: "DELETE",
        url: `/v1/teams/north/recycle-bin/${kind}/missing`,
        headers: authHeaders,
        payload: { expectedRevision: 1, confirmation: "permanent-delete" },
      })
      expect(permanentDeleteAccepted.statusCode).toBe(404)
    }

    const rejected = await app.inject({
      method: "POST",
      url: "/v1/teams/north/recycle-bin/unknown/missing/restore",
      headers: authHeaders,
      payload: { expectedRevision: 1 },
    })
    expect(rejected.statusCode).toBe(400)

    const permanentDeleteRejected = await app.inject({
      method: "DELETE",
      url: "/v1/teams/north/recycle-bin/unknown/missing",
      headers: authHeaders,
      payload: { expectedRevision: 1, confirmation: "permanent-delete" },
    })
    expect(permanentDeleteRejected.statusCode).toBe(400)
  })

  it("requires project notes to reference an authorized project", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "POST",
      url: "/v1/teams/north/notes",
      headers: authHeaders,
      payload: {
        title: "无归属笔记",
        kind: "note",
        idempotencyKey: "note-command-1",
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe("PROJECT_REQUIRED")
  })
})
