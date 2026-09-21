import { createHash } from "node:crypto"
import type {
  AcceptInvitationBody,
  AssignPermissionTemplateBody,
  AuditLogList,
  AuditLogQuery,
  CalendarEvent,
  CreateCalendarEventBody,
  CreatedInvitation,
  CreateInvitationBody,
  CreatePermissionTemplateBody,
  CreateProjectBody,
  CreateTeamBody,
  CreateWorkspaceNoteBody,
  CreateWorkspaceTaskBody,
  InvitationAcceptance,
  InvitationSummary,
  NotificationPreferences,
  OnboardingProject,
  OnboardingTeam,
  PermissionCapability,
  PermissionTemplate,
  PermissionTemplateScope,
  PermissionWorkspace,
  RotateInvitationTokenBody,
  UpdateCalendarEventBody,
  UpdateNotificationStateBody,
  UpdatePermissionTemplateBody,
  UpdateWorkspaceNoteBody,
  UpdateWorkspaceTaskBody,
  WorkspaceContext,
  WorkspaceNote,
  WorkspaceNotification,
  WorkspaceRecycleItem,
  WorkspaceRecycleItemKind,
  WorkspaceTask,
} from "@shadowproducer/contracts"
import { accessAllows, type PermissionAccess } from "./access"
import { isValidIsoCalendarDate } from "./date-validation"
import { AppError } from "./script-service"

export type TeamAccess = PermissionAccess
export type WorkspaceProjectAccess = PermissionAccess
export type CreateResult<T> = { item: T; replayed: boolean }
export type UpdateResult<T> =
  | { kind: "ok"; item: T }
  | { kind: "not_found" }
  | { kind: "conflict" }

type TeamCommand = { actorId: string; teamId: string }
type ItemCommand = TeamCommand & { itemId: string }

export type CreateTaskCommand = TeamCommand & CreateWorkspaceTaskBody
export type UpdateTaskCommand = ItemCommand & UpdateWorkspaceTaskBody
export type DeleteItemCommand = ItemCommand & { expectedRevision: number }
export type RestoreRecycleItemCommand = DeleteItemCommand & {
  kind: WorkspaceRecycleItemKind
}
export type PermanentlyDeleteRecycleItemCommand = RestoreRecycleItemCommand
export type CreateCalendarEventCommand = TeamCommand & CreateCalendarEventBody
export type UpdateCalendarEventCommand = ItemCommand & UpdateCalendarEventBody
export type CreateNoteCommand = TeamCommand & CreateWorkspaceNoteBody
export type UpdateNoteCommand = ItemCommand & UpdateWorkspaceNoteBody
export type ListAuditLogsQuery = AuditLogQuery & { page: number; pageSize: number }
export type UpdateNotificationCommand = ItemCommand & UpdateNotificationStateBody
export type UpdateNotificationPreferencesCommand = TeamCommand & NotificationPreferences
export type CreatePermissionTemplateCommand = TeamCommand & CreatePermissionTemplateBody
export type UpdatePermissionTemplateCommand = ItemCommand & UpdatePermissionTemplateBody
export type AssignTeamPermissionTemplateCommand = TeamCommand &
  AssignPermissionTemplateBody & { accountId: string }
export type AssignProjectPermissionTemplateCommand = TeamCommand &
  AssignPermissionTemplateBody & { accountId: string; projectId: string }
export type PermissionAssignmentResult =
  | {
      kind: "ok"
      item: {
        accountId: string
        permissionTemplateId: string
        permissionRevision: number
      }
    }
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "invalid_template" }
export type PermissionTemplateUpdateResult =
  | UpdateResult<PermissionTemplate>
  | { kind: "system_template" }
export type CreateTeamCommand = { actorId: string } & CreateTeamBody
export type CreateProjectCommand = TeamCommand & CreateProjectBody
export type CreateInvitationCommand = TeamCommand & CreateInvitationBody
export type AcceptInvitationCommand = {
  actorId: string
  token: string
  idempotencyKey: AcceptInvitationBody["idempotencyKey"]
}
export type RevokeInvitationCommand = ItemCommand & { expectedRevision: number }
export type RotateInvitationTokenCommand = ItemCommand & RotateInvitationTokenBody
export type RevokeInvitationResult =
  | UpdateResult<{ id: string }>
  | { kind: "accepted" }
  | { kind: "revoked" }
  | { kind: "expired" }
export type RotateInvitationResult =
  | CreateResult<CreatedInvitation>
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "accepted" }
  | { kind: "revoked" }
  | { kind: "expired" }
export type NotificationListQuery = {
  page?: number
  pageSize?: number
}

export interface WorkspaceRepository {
  getContext(actorId: string): Promise<WorkspaceContext | null>
  getTeamAccess(actorId: string, teamId: string): Promise<TeamAccess | null>
  getProjectAccess(
    actorId: string,
    teamId: string,
    projectId: string,
  ): Promise<WorkspaceProjectAccess | null>
  createTeam(command: CreateTeamCommand): Promise<CreateResult<OnboardingTeam>>
  createProject(command: CreateProjectCommand): Promise<CreateResult<OnboardingProject>>
  createInvitation(
    command: CreateInvitationCommand,
  ): Promise<CreateResult<CreatedInvitation>>
  listInvitations(teamId: string): Promise<InvitationSummary[]>
  findInvitationByTokenHash(tokenHash: string): Promise<InvitationSummary | null>
  acceptInvitation(
    command: AcceptInvitationCommand,
  ): Promise<CreateResult<InvitationAcceptance>>
  revokeInvitation(command: RevokeInvitationCommand): Promise<RevokeInvitationResult>
  rotateInvitationToken(
    command: RotateInvitationTokenCommand,
  ): Promise<RotateInvitationResult>
  listAuditLogs(
    actorId: string,
    teamId: string,
    query: ListAuditLogsQuery,
  ): Promise<AuditLogList>
  listNotifications(
    actorId: string,
    teamId: string,
    query: { page: number; pageSize: number },
  ): Promise<{
    items: WorkspaceNotification[]
    unreadCount: number
    total: number
    page: number
    pageSize: number
  }>
  updateNotification(
    command: UpdateNotificationCommand,
  ): Promise<WorkspaceNotification | null>
  markAllNotificationsRead(actorId: string, teamId: string): Promise<number>
  getNotificationPreferences(
    actorId: string,
    teamId: string,
  ): Promise<NotificationPreferences>
  updateNotificationPreferences(
    command: UpdateNotificationPreferencesCommand,
  ): Promise<NotificationPreferences>
  listPermissionWorkspace(
    teamId: string,
  ): Promise<Omit<PermissionWorkspace, "canManage" | "currentAccountId">>
  createPermissionTemplate(
    command: CreatePermissionTemplateCommand,
  ): Promise<CreateResult<PermissionTemplate>>
  updatePermissionTemplate(
    command: UpdatePermissionTemplateCommand,
  ): Promise<PermissionTemplateUpdateResult>
  assignTeamPermissionTemplate(
    command: AssignTeamPermissionTemplateCommand,
  ): Promise<PermissionAssignmentResult>
  assignProjectPermissionTemplate(
    command: AssignProjectPermissionTemplateCommand,
  ): Promise<PermissionAssignmentResult>
  listTasks(actorId: string, teamId: string): Promise<WorkspaceTask[]>
  createTask(command: CreateTaskCommand): Promise<CreateResult<WorkspaceTask>>
  updateTask(command: UpdateTaskCommand): Promise<UpdateResult<WorkspaceTask>>
  deleteTask(command: DeleteItemCommand): Promise<UpdateResult<{ id: string }>>
  listCalendarEvents(actorId: string, teamId: string): Promise<CalendarEvent[]>
  createCalendarEvent(
    command: CreateCalendarEventCommand,
  ): Promise<CreateResult<CalendarEvent>>
  updateCalendarEvent(
    command: UpdateCalendarEventCommand,
  ): Promise<UpdateResult<CalendarEvent>>
  deleteCalendarEvent(command: DeleteItemCommand): Promise<UpdateResult<{ id: string }>>
  listNotes(actorId: string, teamId: string): Promise<WorkspaceNote[]>
  createNote(command: CreateNoteCommand): Promise<CreateResult<WorkspaceNote>>
  updateNote(command: UpdateNoteCommand): Promise<UpdateResult<WorkspaceNote>>
  deleteNote(command: DeleteItemCommand): Promise<UpdateResult<{ id: string }>>
  listDeletedItems(actorId: string, teamId: string): Promise<WorkspaceRecycleItem[]>
  restoreDeletedItem(
    command: RestoreRecycleItemCommand,
  ): Promise<UpdateResult<{ id: string }>>
  permanentlyDeleteDeletedItem(
    command: PermanentlyDeleteRecycleItemCommand,
  ): Promise<UpdateResult<{ id: string }>>
}

export class WorkspaceService {
  constructor(private readonly repository: WorkspaceRepository) {}

  async getContext(actorId: string) {
    const context = await this.repository.getContext(actorId)
    if (!context) throw new AppError("ACCOUNT_NOT_FOUND", "当前账号不存在", 404)
    return context
  }

  async listAuditLogs(actorId: string, teamId: string, query: AuditLogQuery) {
    await this.assertAuditAccess(actorId, teamId)
    if (query.projectId && query.scope === "team") {
      throw new AppError("AUDIT_FILTER_INVALID", "团队范围与项目筛选不能同时使用", 400)
    }
    await this.assertOptionalProject({ actorId, teamId }, query.projectId)
    this.assertOptionalIsoDateTime(query.from)
    this.assertOptionalIsoDateTime(query.to)
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new AppError("AUDIT_DATE_RANGE_INVALID", "审计结束时间不能早于开始时间", 400)
    }
    return this.repository.listAuditLogs(actorId, teamId, {
      ...query,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    })
  }

  async listNotifications(
    actorId: string,
    teamId: string,
    query: NotificationListQuery = {},
  ) {
    await this.assertNotificationAccess(actorId, teamId)
    return this.repository.listNotifications(actorId, teamId, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 50,
    })
  }

  async updateNotification(command: UpdateNotificationCommand) {
    await this.assertNotificationAccess(command.actorId, command.teamId)
    const item = await this.repository.updateNotification(command)
    if (!item) {
      throw new AppError("RESOURCE_NOT_FOUND", "通知不存在或已不可见", 404)
    }
    return { item }
  }

  async markAllNotificationsRead(actorId: string, teamId: string) {
    await this.assertNotificationAccess(actorId, teamId)
    return { updated: await this.repository.markAllNotificationsRead(actorId, teamId) }
  }

  async getNotificationPreferences(actorId: string, teamId: string) {
    await this.assertNotificationAccess(actorId, teamId)
    return this.repository.getNotificationPreferences(actorId, teamId)
  }

  async updateNotificationPreferences(command: UpdateNotificationPreferencesCommand) {
    await this.assertNotificationAccess(command.actorId, command.teamId)
    return this.repository.updateNotificationPreferences(command)
  }

  async listPermissionWorkspace(actorId: string, teamId: string) {
    const access = await this.assertTeamAccess(actorId, teamId, "read")
    return {
      ...(await this.repository.listPermissionWorkspace(teamId)),
      currentAccountId: actorId,
      canManage: accessAllows(access, "team.permissions.manage", "write"),
    }
  }

  async createPermissionTemplate(command: CreatePermissionTemplateCommand) {
    await this.assertTeamCapability(
      command.actorId,
      command.teamId,
      "team.permissions.manage",
    )
    this.assertTemplatePermissions(command.scope, command.permissions)
    return this.repository.createPermissionTemplate({
      ...command,
      name: command.name.trim(),
      permissions: [...command.permissions].sort(),
    })
  }

  async updatePermissionTemplate(command: UpdatePermissionTemplateCommand) {
    await this.assertTeamCapability(
      command.actorId,
      command.teamId,
      "team.permissions.manage",
    )
    if (command.permissions) {
      const workspace = await this.repository.listPermissionWorkspace(command.teamId)
      const template = workspace.templates.find((item) => item.id === command.itemId)
      if (!template) throw new AppError("RESOURCE_NOT_FOUND", "权限模板不存在", 404)
      this.assertTemplatePermissions(template.scope, command.permissions)
    }
    const result = await this.repository.updatePermissionTemplate({
      ...command,
      name: command.name?.trim(),
      permissions: command.permissions ? [...command.permissions].sort() : undefined,
    })
    if (result.kind === "system_template") {
      throw new AppError("SYSTEM_TEMPLATE_IMMUTABLE", "系统权限模板不能修改", 409)
    }
    return this.unwrapMutation(result, "权限模板")
  }

  async assignTeamPermissionTemplate(command: AssignTeamPermissionTemplateCommand) {
    await this.assertTeamCapability(
      command.actorId,
      command.teamId,
      "team.permissions.manage",
    )
    this.assertNotSelfAssignment(command.actorId, command.accountId)
    return this.unwrapPermissionAssignment(
      await this.repository.assignTeamPermissionTemplate(command),
    )
  }

  async assignProjectPermissionTemplate(command: AssignProjectPermissionTemplateCommand) {
    await this.assertTeamCapability(
      command.actorId,
      command.teamId,
      "team.permissions.manage",
    )
    this.assertNotSelfAssignment(command.actorId, command.accountId)
    return this.unwrapPermissionAssignment(
      await this.repository.assignProjectPermissionTemplate(command),
    )
  }

  async createTeam(command: CreateTeamCommand) {
    return this.repository.createTeam(command)
  }

  async createProject(command: CreateProjectCommand) {
    await this.assertTeamCapability(command.actorId, command.teamId, "team.write")
    return this.repository.createProject(command)
  }

  async createInvitation(command: CreateInvitationCommand) {
    await this.assertTeamCapability(
      command.actorId,
      command.teamId,
      "team.permissions.manage",
    )
    if (command.scope === "project" && !command.projectId) {
      throw new AppError("PROJECT_REQUIRED", "项目邀请必须指定项目", 400)
    }
    if (command.scope === "team" && command.projectId) {
      throw new AppError("INVITATION_SCOPE_INVALID", "团队邀请不能关联项目", 400)
    }
    return this.repository.createInvitation(command)
  }

  async listInvitations(actorId: string, teamId: string) {
    await this.assertTeamCapability(actorId, teamId, "team.permissions.manage")
    return { items: await this.repository.listInvitations(teamId) }
  }

  async getInvitationSummary(token: string) {
    const summary = await this.repository.findInvitationByTokenHash(sha256Hex(token))
    if (!summary) {
      throw new AppError("INVITATION_NOT_FOUND", "邀请不存在或已失效", 404)
    }
    if (summary.status === "revoked") {
      throw new AppError("INVITATION_REVOKED", "邀请已被撤销", 410)
    }
    if (summary.status === "accepted") {
      throw new AppError("INVITATION_ALREADY_ACCEPTED", "邀请已被接受", 410)
    }
    if (new Date(summary.expiresAt).getTime() <= Date.now()) {
      throw new AppError("INVITATION_EXPIRED", "邀请已过期", 410)
    }
    return { item: summary }
  }

  async acceptInvitation(command: AcceptInvitationCommand) {
    return this.repository.acceptInvitation(command)
  }

  async revokeInvitation(command: RevokeInvitationCommand) {
    await this.assertTeamCapability(
      command.actorId,
      command.teamId,
      "team.permissions.manage",
    )
    const result = await this.repository.revokeInvitation(command)
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "邀请不存在", 404)
    }
    if (result.kind === "accepted") {
      throw new AppError("INVITATION_ALREADY_ACCEPTED", "邀请已被接受", 410)
    }
    if (result.kind === "revoked") {
      throw new AppError("INVITATION_REVOKED", "邀请已被撤销", 410)
    }
    if (result.kind === "expired") {
      throw new AppError("INVITATION_EXPIRED", "邀请已过期", 410)
    }
    return this.unwrapMutation(result, "邀请")
  }

  async rotateInvitationToken(command: RotateInvitationTokenCommand) {
    await this.assertTeamCapability(
      command.actorId,
      command.teamId,
      "team.permissions.manage",
    )
    const result = await this.repository.rotateInvitationToken(command)
    if ("kind" in result && result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "邀请不存在", 404)
    }
    if ("kind" in result && result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "邀请已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    if ("kind" in result && result.kind === "accepted") {
      throw new AppError("INVITATION_ALREADY_ACCEPTED", "邀请已被接受", 410)
    }
    if ("kind" in result && result.kind === "revoked") {
      throw new AppError("INVITATION_REVOKED", "邀请已被撤销", 410)
    }
    if ("kind" in result && result.kind === "expired") {
      throw new AppError("INVITATION_EXPIRED", "邀请已过期", 410)
    }
    return result
  }

  async listTasks(actorId: string, teamId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    return { items: await this.repository.listTasks(actorId, teamId) }
  }

  async createTask(command: CreateTaskCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    this.assertOptionalIsoDate(command.dueDate)
    await this.assertOptionalProject(command, command.projectId)
    return this.repository.createTask(command)
  }

  async updateTask(command: UpdateTaskCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    this.assertOptionalIsoDate(command.dueDate)
    return this.unwrapMutation(await this.repository.updateTask(command), "任务")
  }

  async deleteTask(command: DeleteItemCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.unwrapMutation(await this.repository.deleteTask(command), "任务")
  }

  async listCalendarEvents(actorId: string, teamId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    return { items: await this.repository.listCalendarEvents(actorId, teamId) }
  }

  async createCalendarEvent(command: CreateCalendarEventCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    await this.assertOptionalProject(command, command.projectId)
    this.assertIsoDateTime(command.startsAt)
    this.assertOptionalIsoDateTime(command.endsAt)
    this.assertCalendarRange(command.startsAt, command.endsAt)
    return this.repository.createCalendarEvent(command)
  }

  async updateCalendarEvent(command: UpdateCalendarEventCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    this.assertOptionalIsoDateTime(command.startsAt)
    this.assertOptionalIsoDateTime(command.endsAt)
    if (command.startsAt && command.endsAt) {
      this.assertCalendarRange(command.startsAt, command.endsAt)
    }
    return this.unwrapMutation(await this.repository.updateCalendarEvent(command), "日程")
  }

  async deleteCalendarEvent(command: DeleteItemCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.unwrapMutation(await this.repository.deleteCalendarEvent(command), "日程")
  }

  async listNotes(actorId: string, teamId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    return { items: await this.repository.listNotes(actorId, teamId) }
  }

  async createNote(command: CreateNoteCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    if (command.kind === "note" && !command.projectId) {
      throw new AppError("PROJECT_REQUIRED", "项目笔记必须关联项目", 400)
    }
    await this.assertOptionalProject(command, command.projectId)
    return this.repository.createNote(command)
  }

  async updateNote(command: UpdateNoteCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.unwrapMutation(await this.repository.updateNote(command), "笔记")
  }

  async deleteNote(command: DeleteItemCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.unwrapMutation(await this.repository.deleteNote(command), "笔记")
  }

  async listDeletedItems(actorId: string, teamId: string) {
    const access = await this.assertTeamAccess(actorId, teamId, "read")
    return {
      items: await this.repository.listDeletedItems(actorId, teamId),
      canManageShared: accessAllows(access, "team.recycle.manage", "write"),
    }
  }

  async restoreDeletedItem(command: RestoreRecycleItemCommand) {
    if (command.kind === "team-contact" || command.kind === "supplier") {
      await this.assertTeamCapability(
        command.actorId,
        command.teamId,
        "team.recycle.manage",
      )
    } else {
      await this.assertTeamAccess(command.actorId, command.teamId, "write")
    }
    return this.unwrapMutation(
      await this.repository.restoreDeletedItem(command),
      "回收站项目",
    )
  }

  async permanentlyDeleteDeletedItem(command: PermanentlyDeleteRecycleItemCommand) {
    if (command.kind === "team-contact" || command.kind === "supplier") {
      await this.assertTeamCapability(
        command.actorId,
        command.teamId,
        "team.recycle.manage",
      )
    } else {
      await this.assertTeamAccess(command.actorId, command.teamId, "write")
    }
    return this.unwrapMutation(
      await this.repository.permanentlyDeleteDeletedItem(command),
      "回收站项目",
    )
  }

  private async assertAuditAccess(actorId: string, teamId: string) {
    const teamAccess = await this.repository.getTeamAccess(actorId, teamId)
    if (teamAccess?.canRead) return teamAccess
    const context = await this.repository.getContext(actorId)
    const projectOnly = context?.teams.some(
      (team) => team.id === teamId && team.role === null && team.projects.length > 0,
    )
    if (!projectOnly) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队", 403)
    }
    return null
  }

  private async assertNotificationAccess(actorId: string, teamId: string) {
    const teamAccess = await this.repository.getTeamAccess(actorId, teamId)
    if (teamAccess?.canRead) return teamAccess
    const context = await this.repository.getContext(actorId)
    const projectOnly = context?.teams.some(
      (team) => team.id === teamId && team.role === null && team.projects.length > 0,
    )
    if (!projectOnly) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队", 403)
    }
    return null
  }

  private async assertTeamAccess(
    actorId: string,
    teamId: string,
    operation: "read" | "write",
  ) {
    const access = await this.repository.getTeamAccess(actorId, teamId)
    const allowed = accessAllows(
      access,
      operation === "read" ? "team.read" : "team.write",
      operation,
    )
    if (!access || !allowed) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队", 403)
    }
    return access
  }

  private async assertTeamCapability(
    actorId: string,
    teamId: string,
    capability: PermissionCapability,
  ) {
    const access = await this.repository.getTeamAccess(actorId, teamId)
    if (!access) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队", 403)
    }
    if (!accessAllows(access, capability, "write")) {
      throw new AppError("TEAM_PERMISSION_DENIED", "当前角色没有管理权限", 403)
    }
    return access
  }

  private assertTemplatePermissions(
    scope: PermissionTemplateScope,
    permissions: PermissionCapability[],
  ) {
    const allowed =
      scope === "team"
        ? new Set<PermissionCapability>([
            "team.read",
            "team.write",
            "team.permissions.manage",
            "team.recycle.manage",
            "asset.write",
            "portfolio.write",
            "portfolio.publish",
          ])
        : new Set<PermissionCapability>([
            "project.read",
            "project.write",
            "script.write",
            "production.write",
            "call_sheet.publish",
            "review.write",
            "review.manage",
          ])
    if (!permissions.every((permission) => allowed.has(permission))) {
      throw new AppError("PERMISSION_SCOPE_INVALID", "权限项与模板作用域不匹配", 400)
    }
    const readCapability = scope === "team" ? "team.read" : "project.read"
    if (!permissions.includes(readCapability)) {
      throw new AppError(
        "PERMISSION_READ_REQUIRED",
        "权限模板必须保留对应范围的查看权限",
        400,
      )
    }
  }

  private assertNotSelfAssignment(actorId: string, accountId: string) {
    if (actorId === accountId) {
      throw new AppError(
        "PERMISSION_SELF_ASSIGNMENT_FORBIDDEN",
        "不能修改自己的权限模板",
        409,
      )
    }
  }

  private unwrapPermissionAssignment(result: PermissionAssignmentResult) {
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "成员或权限模板不存在", 404)
    }
    if (result.kind === "invalid_template") {
      throw new AppError("PERMISSION_TEMPLATE_INVALID", "权限模板不属于当前作用域", 400)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "成员权限已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    return result.item
  }

  private async assertOptionalProject(
    command: TeamCommand,
    projectId: string | undefined,
  ) {
    if (!projectId) return
    const access = await this.repository.getProjectAccess(
      command.actorId,
      command.teamId,
      projectId,
    )
    if (!access?.canRead) {
      throw new AppError("PROJECT_ACCESS_DENIED", "无权访问所选项目", 403)
    }
  }

  private unwrapMutation<T>(result: UpdateResult<T>, label: string) {
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", `${label}不存在或已被删除`, 404)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        `${label}已在其他位置更新，请重新载入后再试`,
        409,
      )
    }
    return result.item
  }

  private assertOptionalIsoDate(value: string | null | undefined) {
    if (value === undefined || value === null) return
    if (!isValidIsoCalendarDate(value)) {
      throw new AppError("INVALID_DATE", "日期无效", 400)
    }
  }

  private assertIsoDateTime(value: string) {
    if (!isValidIsoCalendarDate(value) || !Number.isFinite(new Date(value).getTime())) {
      throw new AppError("INVALID_DATE", "日期时间无效", 400)
    }
  }

  private assertOptionalIsoDateTime(value: string | null | undefined) {
    if (value === undefined || value === null) return
    this.assertIsoDateTime(value)
  }

  private assertCalendarRange(startsAt: string, endsAt?: string | null) {
    this.assertIsoDateTime(startsAt)
    this.assertOptionalIsoDateTime(endsAt)
    if (endsAt && new Date(endsAt) < new Date(startsAt)) {
      throw new AppError("INVALID_CALENDAR_RANGE", "日程结束时间不能早于开始时间", 400)
    }
  }
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex")
}
