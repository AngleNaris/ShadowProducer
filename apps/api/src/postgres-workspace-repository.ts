import { createHash, randomBytes, randomUUID } from "node:crypto"

import type {
  AcceptInvitationCommand,
  AssignProjectPermissionTemplateCommand,
  AssignTeamPermissionTemplateCommand,
  CreateCalendarEventCommand,
  CreateInvitationCommand,
  CreateNoteCommand,
  CreatePermissionTemplateCommand,
  CreateProjectCommand,
  CreateTaskCommand,
  CreateTeamCommand,
  DeleteItemCommand,
  ListAuditLogsQuery,
  PermanentlyDeleteRecycleItemCommand,
  RestoreRecycleItemCommand,
  RevokeInvitationCommand,
  RotateInvitationTokenCommand,
  UpdateCalendarEventCommand,
  UpdateNoteCommand,
  UpdateNotificationCommand,
  UpdateNotificationPreferencesCommand,
  UpdatePermissionTemplateCommand,
  UpdateResult,
  UpdateTaskCommand,
  WorkspaceRepository,
} from "@shadowproducer/application"
import { AppError } from "@shadowproducer/application"
import type {
  AuditLogList,
  CalendarEvent,
  CreatedInvitation,
  InvitationAcceptance,
  InvitationSummary,
  NoteKind,
  NotificationPreferences,
  OnboardingProject,
  OnboardingTeam,
  PermissionCapability,
  PermissionTemplate,
  PermissionWorkspace,
  TaskStatus,
  WorkspaceContext,
  WorkspaceNote,
  WorkspaceNotification,
  WorkspaceRecycleItem,
  WorkspaceTask,
} from "@shadowproducer/contracts"
import type { Kysely, Transaction } from "kysely"
import { sql } from "kysely"

import type { Database } from "./database"
import { resolveProjectAccess, resolveTeamAccess } from "./postgres-access"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>
type ReceiptItem =
  | WorkspaceTask
  | CalendarEvent
  | WorkspaceNote
  | PermissionTemplate
  | OnboardingTeam
  | OnboardingProject
  | CreatedInvitation
  | InvitationAcceptance

function requestHash(value: Record<string, unknown>) {
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "idempotencyKey")
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

const defaultInvitationExpiryDays = 7
const invitationEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isInvitationEmail(value: string) {
  return value.length >= 3 && value.length <= 200 && invitationEmailPattern.test(value)
}

const systemPermissionTemplates = [
  {
    scope: "team" as const,
    key: "team-admin",
    name: "团队管理员",
    permissions: [
      "team.read",
      "team.write",
      "team.permissions.manage",
      "team.recycle.manage",
      "asset.write",
      "portfolio.write",
      "portfolio.publish",
    ],
  },
  {
    scope: "team" as const,
    key: "team-member",
    name: "团队成员",
    permissions: [
      "team.read",
      "team.write",
      "asset.write",
      "portfolio.write",
      "portfolio.publish",
    ],
  },
  {
    scope: "team" as const,
    key: "team-viewer",
    name: "团队访客",
    permissions: ["team.read"],
  },
  {
    scope: "project" as const,
    key: "project-manager",
    name: "项目负责人",
    permissions: [
      "project.read",
      "project.write",
      "script.write",
      "production.write",
      "call_sheet.publish",
      "review.write",
      "review.manage",
    ],
  },
  {
    scope: "project" as const,
    key: "project-contributor",
    name: "项目协作者",
    permissions: [
      "project.read",
      "project.write",
      "script.write",
      "production.write",
      "review.write",
    ],
  },
  {
    scope: "project" as const,
    key: "project-viewer",
    name: "项目查看者",
    permissions: ["project.read"],
  },
]

function toDate(value: Date | string | null) {
  if (value === null) return null
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-")
  }
  return String(value).slice(0, 10)
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getContext(actorId: string): Promise<WorkspaceContext | null> {
    const actor = await this.database
      .selectFrom("accounts")
      .select(["id", "display_name"])
      .where("id", "=", actorId)
      .executeTakeFirst()
    if (!actor) return null

    const memberships = await this.database
      .selectFrom("team_memberships as membership")
      .innerJoin("teams as team", "team.id", "membership.team_id")
      .select(["team.id", "team.name", "membership.role"])
      .where("membership.account_id", "=", actorId)
      .orderBy("team.name", "asc")
      .execute()

    const projectMemberships = await this.database
      .selectFrom("project_memberships as membership")
      .innerJoin("projects as project", "project.id", "membership.project_id")
      .innerJoin("teams as team", "team.id", "project.team_id")
      .select([
        "team.id as team_id",
        "team.name as team_name",
        "project.id as project_id",
        "project.name as project_name",
        "project.status as project_status",
        "project.updated_at as project_updated_at",
        "membership.role as project_role",
      ])
      .where("membership.account_id", "=", actorId)
      .orderBy("team.name", "asc")
      .orderBy("project.updated_at", "desc")
      .execute()

    const projectsByTeam = new Map<string, (typeof projectMemberships)[number][]>()
    for (const project of projectMemberships) {
      const projects = projectsByTeam.get(project.team_id) ?? []
      projects.push(project)
      projectsByTeam.set(project.team_id, projects)
    }
    const teamMembershipIds = new Set(memberships.map((membership) => membership.id))
    const memberCountByTeam = new Map<string, number>()
    if (memberships.length > 0) {
      const memberCounts = await this.database
        .selectFrom("team_memberships")
        .select((expression) => ["team_id", expression.fn.countAll<number>().as("count")])
        .where(
          "team_id",
          "in",
          memberships.map((membership) => membership.id),
        )
        .groupBy("team_id")
        .execute()
      for (const row of memberCounts) {
        memberCountByTeam.set(row.team_id, Number(row.count))
      }
    }

    const projectOnlyTeams = projectMemberships
      .filter((project) => !teamMembershipIds.has(project.team_id))
      .reduce<(typeof projectMemberships)[number]["team_id"][]>((ids, project) => {
        if (!ids.includes(project.team_id)) ids.push(project.team_id)
        return ids
      }, [])
      .map((teamId) => {
        const first = projectsByTeam.get(teamId)?.[0]
        return {
          id: teamId,
          name: first?.team_name ?? teamId,
          role: null,
          memberCount: 0,
          projects: (projectsByTeam.get(teamId) ?? []).map((project) => ({
            id: project.project_id,
            name: project.project_name,
            role: project.project_role,
            status: project.project_status,
            updatedAt: toIso(project.project_updated_at),
          })),
        }
      })

    const teams = memberships.map((membership) => ({
      id: membership.id,
      name: membership.name,
      role: membership.role,
      memberCount: memberCountByTeam.get(membership.id) ?? 0,
      projects: (projectsByTeam.get(membership.id) ?? []).map((project) => ({
        id: project.project_id,
        name: project.project_name,
        role: project.project_role,
        status: project.project_status,
        updatedAt: toIso(project.project_updated_at),
      })),
    }))

    return {
      actor: { id: actor.id, displayName: actor.display_name },
      teams: [...teams, ...projectOnlyTeams].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    }
  }

  async getTeamAccess(actorId: string, teamId: string) {
    return resolveTeamAccess(this.database, actorId, teamId)
  }

  async getProjectAccess(actorId: string, teamId: string, projectId: string) {
    return resolveProjectAccess(this.database, actorId, projectId, teamId)
  }

  async listAuditLogs(
    actorId: string,
    teamId: string,
    query: ListAuditLogsQuery,
  ): Promise<AuditLogList> {
    const projectRows = await this.database
      .selectFrom("project_memberships as membership")
      .innerJoin("projects as project", "project.id", "membership.project_id")
      .select("project.id")
      .where("membership.account_id", "=", actorId)
      .where("project.team_id", "=", teamId)
      .execute()
    const projectIds = projectRows.map((project) => project.id)
    const hasTeamMembership = Boolean(
      await resolveTeamAccess(this.database, actorId, teamId),
    )
    if (!hasTeamMembership && query.scope === "team" && !query.projectId) {
      return {
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
      }
    }
    const buildQuery = () => {
      let databaseQuery = this.database
        .selectFrom("audit_logs as audit")
        .leftJoin("accounts as actor", "actor.id", "audit.actor_account_id")
        .leftJoin("projects as project", "project.id", "audit.project_id")
        .where("audit.team_id", "=", teamId)

      if (query.projectId) {
        databaseQuery = databaseQuery.where("audit.project_id", "=", query.projectId)
      } else if (!hasTeamMembership) {
        databaseQuery = projectIds.length
          ? databaseQuery.where("audit.project_id", "in", projectIds)
          : databaseQuery.where("audit.project_id", "is", null)
      } else if (query.scope === "team" || projectIds.length === 0) {
        databaseQuery = databaseQuery.where("audit.project_id", "is", null)
      } else {
        databaseQuery = databaseQuery.where((expression) =>
          expression.or([
            expression("audit.project_id", "is", null),
            expression("audit.project_id", "in", projectIds),
          ]),
        )
      }
      if (query.action) {
        databaseQuery = databaseQuery.where("audit.action", "ilike", `%${query.action}%`)
      }
      if (query.actor) {
        databaseQuery = databaseQuery.where((expression) =>
          expression.or([
            expression("audit.actor_account_id", "ilike", `%${query.actor}%`),
            expression("actor.display_name", "ilike", `%${query.actor}%`),
          ]),
        )
      }
      if (query.from) {
        databaseQuery = databaseQuery.where(
          "audit.created_at",
          ">=",
          new Date(query.from),
        )
      }
      if (query.to) {
        databaseQuery = databaseQuery.where("audit.created_at", "<=", new Date(query.to))
      }
      return databaseQuery
    }

    const [rows, countRow] = await Promise.all([
      buildQuery()
        .select([
          "audit.id",
          "audit.actor_account_id",
          "audit.actor_type",
          "audit.team_id",
          "audit.project_id",
          "audit.action",
          "audit.subject_id",
          "audit.metadata",
          "audit.created_at",
          "actor.display_name as actor_name",
          "project.name as project_name",
        ])
        .orderBy("audit.created_at", "desc")
        .orderBy("audit.id", "desc")
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      buildQuery()
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .executeTakeFirstOrThrow(),
    ])

    return {
      items: rows.map((row) => ({
        id: String(row.id),
        actorAccountId: row.actor_account_id,
        actorName:
          row.actor_name ?? (row.actor_type === "guest" ? "外部审阅者" : "系统操作"),
        actorType: row.actor_type,
        teamId: row.team_id ?? teamId,
        projectId: row.project_id,
        projectName: row.project_name,
        action: row.action,
        subjectId: row.subject_id,
        metadata: row.metadata,
        createdAt: toIso(row.created_at),
      })),
      total: Number(countRow.count),
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async listNotifications(
    actorId: string,
    teamId: string,
    query: { page: number; pageSize: number },
  ) {
    const [rows, unreadRow, totalRow] = await Promise.all([
      this.notificationBase(this.database, actorId, teamId)
        .select([
          "notification.id",
          "notification.team_id",
          "notification.project_id",
          "project.name as project_name",
          "notification.kind",
          "notification.subject_id",
          "source_actor.display_name as source_actor_name",
          "notification.title",
          "notification.body",
          "notification.metadata",
          "notification.read_at",
          "notification.acknowledged_at",
          "notification.created_at",
        ])
        .orderBy("notification.created_at", "desc")
        .orderBy("notification.id", "desc")
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      this.notificationBase(this.database, actorId, teamId)
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("notification.read_at", "is", null)
        .executeTakeFirstOrThrow(),
      this.notificationBase(this.database, actorId, teamId)
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .executeTakeFirstOrThrow(),
    ])
    return {
      items: rows.map((row) => this.mapNotification(row)),
      unreadCount: Number(unreadRow.count),
      total: Number(totalRow.count),
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async updateNotification(command: UpdateNotificationCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const current = await this.findNotification(
        transaction,
        command.actorId,
        command.teamId,
        command.itemId,
      )
      if (!current) return null
      const now = new Date()
      if (command.action === "read" && !current.readAt) {
        await transaction
          .updateTable("notifications")
          .set({ read_at: now })
          .where("id", "=", command.itemId)
          .where("recipient_account_id", "=", command.actorId)
          .execute()
      }
      if (command.action === "acknowledge" && !current.acknowledgedAt) {
        await transaction
          .updateTable("notifications")
          .set({ read_at: now, acknowledged_at: now })
          .where("id", "=", command.itemId)
          .where("recipient_account_id", "=", command.actorId)
          .execute()
        await this.writeAudit(
          transaction,
          {
            actorId: command.actorId,
            teamId: command.teamId,
            projectId: current.projectId,
          },
          "notification.acknowledged",
          current.id,
          { kind: current.kind, subjectId: current.subjectId },
        )
      }
      return this.findNotification(
        transaction,
        command.actorId,
        command.teamId,
        command.itemId,
      )
    })
  }

  async markAllNotificationsRead(actorId: string, teamId: string) {
    const rows = await this.notificationBase(this.database, actorId, teamId)
      .select("notification.id")
      .where("notification.read_at", "is", null)
      .execute()
    if (!rows.length) return 0
    const result = await this.database
      .updateTable("notifications")
      .set({ read_at: new Date() })
      .where(
        "id",
        "in",
        rows.map((row) => row.id),
      )
      .where("recipient_account_id", "=", actorId)
      .executeTakeFirst()
    return Number(result.numUpdatedRows)
  }

  async getNotificationPreferences(
    actorId: string,
    teamId: string,
  ): Promise<NotificationPreferences> {
    const row = await this.database
      .selectFrom("notification_preferences")
      .select([
        "published_call_sheets",
        "important_call_sheet_changes",
        "permission_assignments",
        "portfolio_publications",
        "review_activity",
        "contact_sharing",
      ])
      .where("account_id", "=", actorId)
      .where("team_id", "=", teamId)
      .executeTakeFirst()
    return {
      publishedCallSheets: row?.published_call_sheets ?? true,
      importantCallSheetChanges: row?.important_call_sheet_changes ?? true,
      permissionAssignments: row?.permission_assignments ?? true,
      portfolioPublications: row?.portfolio_publications ?? true,
      reviewActivity: row?.review_activity ?? true,
      contactSharing: row?.contact_sharing ?? true,
    }
  }

  async updateNotificationPreferences(command: UpdateNotificationPreferencesCommand) {
    await this.database
      .insertInto("notification_preferences")
      .values({
        account_id: command.actorId,
        team_id: command.teamId,
        published_call_sheets: command.publishedCallSheets,
        important_call_sheet_changes: command.importantCallSheetChanges,
        permission_assignments: command.permissionAssignments,
        portfolio_publications: command.portfolioPublications,
        review_activity: command.reviewActivity,
        contact_sharing: command.contactSharing,
      })
      .onConflict((conflict) =>
        conflict.columns(["account_id", "team_id"]).doUpdateSet({
          published_call_sheets: command.publishedCallSheets,
          important_call_sheet_changes: command.importantCallSheetChanges,
          permission_assignments: command.permissionAssignments,
          portfolio_publications: command.portfolioPublications,
          review_activity: command.reviewActivity,
          contact_sharing: command.contactSharing,
        }),
      )
      .execute()
    return {
      publishedCallSheets: command.publishedCallSheets,
      importantCallSheetChanges: command.importantCallSheetChanges,
      permissionAssignments: command.permissionAssignments,
      portfolioPublications: command.portfolioPublications,
      reviewActivity: command.reviewActivity,
      contactSharing: command.contactSharing,
    }
  }

  async listPermissionWorkspace(
    teamId: string,
  ): Promise<Omit<PermissionWorkspace, "canManage" | "currentAccountId">> {
    const [templateRows, teamMembershipRows, projectMembershipRows] = await Promise.all([
      this.database
        .selectFrom("permission_templates")
        .selectAll()
        .where("team_id", "=", teamId)
        .orderBy("scope", "asc")
        .orderBy("is_system", "desc")
        .orderBy("name", "asc")
        .execute(),
      this.database
        .selectFrom("team_memberships as membership")
        .innerJoin("accounts as account", "account.id", "membership.account_id")
        .leftJoin(
          "permission_templates as template",
          "template.id",
          "membership.permission_template_id",
        )
        .select([
          "membership.account_id",
          "membership.role",
          "membership.permission_template_id",
          "membership.permission_revision",
          "account.display_name",
          "template.name as template_name",
        ])
        .where("membership.team_id", "=", teamId)
        .orderBy("account.display_name", "asc")
        .execute(),
      this.database
        .selectFrom("project_memberships as membership")
        .innerJoin("projects as project", "project.id", "membership.project_id")
        .innerJoin("accounts as account", "account.id", "membership.account_id")
        .leftJoin(
          "permission_templates as template",
          "template.id",
          "membership.permission_template_id",
        )
        .select([
          "membership.account_id",
          "membership.role",
          "membership.permission_template_id",
          "membership.permission_revision",
          "account.display_name",
          "project.id as project_id",
          "project.name as project_name",
          "template.name as template_name",
        ])
        .where("project.team_id", "=", teamId)
        .orderBy("project.name", "asc")
        .execute(),
    ])

    const assignedCount = new Map<string, number>()
    for (const row of [...teamMembershipRows, ...projectMembershipRows]) {
      if (!row.permission_template_id) continue
      assignedCount.set(
        row.permission_template_id,
        (assignedCount.get(row.permission_template_id) ?? 0) + 1,
      )
    }
    const projectsByAccount = new Map<
      string,
      PermissionWorkspace["members"][number]["projects"]
    >()
    for (const row of projectMembershipRows) {
      const projects = projectsByAccount.get(row.account_id) ?? []
      projects.push({
        projectId: row.project_id,
        projectName: row.project_name,
        role: row.role,
        permissionTemplateId: row.permission_template_id,
        permissionTemplateName: row.template_name,
        permissionRevision: row.permission_revision,
      })
      projectsByAccount.set(row.account_id, projects)
    }

    const teamMemberIds = new Set(teamMembershipRows.map((row) => row.account_id))
    const projectOnlyMembers = projectMembershipRows
      .filter((row) => !teamMemberIds.has(row.account_id))
      .reduce<typeof projectMembershipRows>((members, row) => {
        if (!members.some((member) => member.account_id === row.account_id)) {
          members.push(row)
        }
        return members
      }, [])
      .map((row) => ({
        accountId: row.account_id,
        displayName: row.display_name,
        role: null,
        permissionTemplateId: null,
        permissionTemplateName: null,
        permissionRevision: null,
        projects: projectsByAccount.get(row.account_id) ?? [],
      }))

    return {
      templates: templateRows.map((row) =>
        this.mapPermissionTemplate(row, assignedCount.get(row.id) ?? 0),
      ),
      members: [
        ...teamMembershipRows.map((row) => ({
          accountId: row.account_id,
          displayName: row.display_name,
          role: row.role,
          permissionTemplateId: row.permission_template_id,
          permissionTemplateName: row.template_name,
          permissionRevision: row.permission_revision,
          projects: projectsByAccount.get(row.account_id) ?? [],
        })),
        ...projectOnlyMembers,
      ].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    }
  }

  async createPermissionTemplate(command: CreatePermissionTemplateCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `permission-template.create:${command.teamId}`
      const replay = await this.getReceipt<PermissionTemplate>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const id = randomUUID()
      const row = await transaction
        .insertInto("permission_templates")
        .values({
          id,
          team_id: command.teamId,
          scope: command.scope,
          key: `custom-${id}`,
          name: command.name,
          permissions: JSON.stringify(command.permissions),
          is_system: false,
          created_by_account_id: command.actorId,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const item = this.mapPermissionTemplate(row, 0)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(transaction, command, "permission-template.created", id, {
        scope: command.scope,
        permissions: command.permissions,
      })
      return { item, replayed: false }
    })
  }

  async updatePermissionTemplate(command: UpdatePermissionTemplateCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const current = await transaction
        .selectFrom("permission_templates")
        .select(["revision", "is_system"])
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .executeTakeFirst()
      if (!current) return { kind: "not_found" } as const
      if (current.is_system) return { kind: "system_template" } as const
      if (current.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      const values: {
        name?: string
        permissions?: string
        updated_at: Date
      } = { updated_at: new Date() }
      if (command.name !== undefined) values.name = command.name
      if (command.permissions !== undefined) {
        values.permissions = JSON.stringify(command.permissions)
      }
      const row = await transaction
        .updateTable("permission_templates")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .returningAll()
        .executeTakeFirst()
      if (!row) return { kind: "conflict" } as const
      const count = await this.permissionTemplateAssignmentCount(transaction, row.id)
      const item = this.mapPermissionTemplate(row, count)
      await this.writeAudit(
        transaction,
        command,
        "permission-template.updated",
        item.id,
        { revision: item.revision, permissions: item.permissions },
      )
      return { kind: "ok", item } as const
    })
  }

  async assignTeamPermissionTemplate(command: AssignTeamPermissionTemplateCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const template = await transaction
        .selectFrom("permission_templates")
        .select(["id", "name"])
        .where("id", "=", command.templateId)
        .where("team_id", "=", command.teamId)
        .where("scope", "=", "team")
        .executeTakeFirst()
      if (!template) return { kind: "invalid_template" } as const
      const current = await transaction
        .selectFrom("team_memberships")
        .select(["permission_template_id", "permission_revision"])
        .where("team_id", "=", command.teamId)
        .where("account_id", "=", command.accountId)
        .executeTakeFirst()
      if (!current) return { kind: "not_found" } as const
      if (current.permission_revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      const updated = await transaction
        .updateTable("team_memberships")
        .set({ permission_template_id: template.id })
        .set((expression) => ({
          permission_revision: expression("permission_revision", "+", 1),
        }))
        .where("team_id", "=", command.teamId)
        .where("account_id", "=", command.accountId)
        .where("permission_revision", "=", command.expectedRevision)
        .returning("permission_revision")
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" } as const
      await this.writeAudit(
        transaction,
        command,
        "team-membership.permission-assigned",
        command.accountId,
        {
          beforeTemplateId: current.permission_template_id,
          permissionTemplateId: template.id,
          permissionRevision: updated.permission_revision,
        },
      )
      await this.writePermissionNotification(transaction, {
        recipientAccountId: command.accountId,
        sourceActorAccountId: command.actorId,
        teamId: command.teamId,
        projectId: null,
        kind: "team_permission_assigned",
        subjectId: template.id,
        dedupKey: `team-permission:${command.teamId}:${command.accountId}:${updated.permission_revision}`,
        title: `团队权限已更新：${template.name}`,
        body: `你在当前团队的权限已更新为“${template.name}”`,
        metadata: {
          permissionTemplateId: template.id,
          permissionRevision: updated.permission_revision,
          scope: "team",
        },
      })
      return {
        kind: "ok",
        item: {
          accountId: command.accountId,
          permissionTemplateId: template.id,
          permissionRevision: updated.permission_revision,
        },
      } as const
    })
  }

  async assignProjectPermissionTemplate(command: AssignProjectPermissionTemplateCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const template = await transaction
        .selectFrom("permission_templates")
        .select(["id", "name"])
        .where("id", "=", command.templateId)
        .where("team_id", "=", command.teamId)
        .where("scope", "=", "project")
        .executeTakeFirst()
      if (!template) return { kind: "invalid_template" } as const
      const current = await transaction
        .selectFrom("project_memberships as membership")
        .innerJoin("projects as project", "project.id", "membership.project_id")
        .select([
          "membership.permission_template_id",
          "membership.permission_revision",
          "project.name as project_name",
        ])
        .where("membership.project_id", "=", command.projectId)
        .where("membership.account_id", "=", command.accountId)
        .where("project.team_id", "=", command.teamId)
        .executeTakeFirst()
      if (!current) return { kind: "not_found" } as const
      if (current.permission_revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      const updated = await transaction
        .updateTable("project_memberships")
        .set({ permission_template_id: template.id })
        .set((expression) => ({
          permission_revision: expression("permission_revision", "+", 1),
        }))
        .where("project_id", "=", command.projectId)
        .where("account_id", "=", command.accountId)
        .where("permission_revision", "=", command.expectedRevision)
        .returning("permission_revision")
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" } as const
      await this.writeAudit(
        transaction,
        { ...command, projectId: command.projectId },
        "project-membership.permission-assigned",
        command.accountId,
        {
          beforeTemplateId: current.permission_template_id,
          permissionTemplateId: template.id,
          permissionRevision: updated.permission_revision,
        },
      )
      await this.writePermissionNotification(transaction, {
        recipientAccountId: command.accountId,
        sourceActorAccountId: command.actorId,
        teamId: command.teamId,
        projectId: command.projectId,
        kind: "project_permission_assigned",
        subjectId: template.id,
        dedupKey: `project-permission:${command.projectId}:${command.accountId}:${updated.permission_revision}`,
        title: `项目权限已更新：${current.project_name}`,
        body: `你在“${current.project_name}”的权限已更新为“${template.name}”`,
        metadata: {
          permissionTemplateId: template.id,
          permissionRevision: updated.permission_revision,
          scope: "project",
        },
      })
      return {
        kind: "ok",
        item: {
          accountId: command.accountId,
          permissionTemplateId: template.id,
          permissionRevision: updated.permission_revision,
        },
      } as const
    })
  }

  async createTeam(command: CreateTeamCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const replay = await this.getReceipt<OnboardingTeam>(
        transaction,
        command.actorId,
        "team.create",
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const account = await transaction
        .selectFrom("accounts")
        .select("id")
        .where("id", "=", command.actorId)
        .executeTakeFirst()
      if (!account) {
        throw new AppError("ACCOUNT_NOT_FOUND", "当前账号不存在", 404)
      }
      const teamId = randomUUID()
      const name = command.name.trim()
      await transaction.insertInto("teams").values({ id: teamId, name }).execute()
      const templates = await this.ensureSystemPermissionTemplates(transaction, teamId)
      await transaction
        .insertInto("team_memberships")
        .values({
          team_id: teamId,
          account_id: command.actorId,
          role: "owner",
          permission_template_id: templates.teamAdminId,
        })
        .execute()
      const item: OnboardingTeam = {
        id: teamId,
        name,
        role: "owner",
        permissionTemplateId: templates.teamAdminId,
        createdAt: new Date().toISOString(),
      }
      await this.writeReceipt(
        transaction,
        command.actorId,
        "team.create",
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        { actorId: command.actorId, teamId },
        "team.created",
        teamId,
        { name },
      )
      return { item, replayed: false }
    })
  }

  async createProject(command: CreateProjectCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `project.create:${command.teamId}`
      const replay = await this.getReceipt<OnboardingProject>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const template = await transaction
        .selectFrom("permission_templates")
        .select("id")
        .where("team_id", "=", command.teamId)
        .where("scope", "=", "project")
        .where("key", "=", "project-manager")
        .executeTakeFirst()
      if (!template) {
        throw new AppError("SYSTEM_TEMPLATE_MISSING", "系统权限模板缺失", 500)
      }
      const projectId = randomUUID()
      const name = command.name.trim()
      const project = await transaction
        .insertInto("projects")
        .values({ id: projectId, team_id: command.teamId, name })
        .returning(["id", "name", "status", "updated_at"])
        .executeTakeFirstOrThrow()
      await transaction
        .insertInto("project_memberships")
        .values({
          project_id: projectId,
          account_id: command.actorId,
          role: "owner",
          permission_template_id: template.id,
        })
        .execute()
      const item: OnboardingProject = {
        id: project.id,
        teamId: command.teamId,
        name: project.name,
        role: "owner",
        status: project.status,
        permissionTemplateId: template.id,
        createdAt: toIso(project.updated_at),
      }
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        { actorId: command.actorId, teamId: command.teamId, projectId },
        "project.created",
        projectId,
        { name },
      )
      return { item, replayed: false }
    })
  }

  private isPendingInvitationUniqueViolation(error: unknown) {
    if (!error || typeof error !== "object") return false
    const value = error as { code?: string; constraint?: string }
    return (
      value.code === "23505" &&
      (value.constraint === "onboarding_invitations_team_pending_uidx" ||
        value.constraint === "onboarding_invitations_project_pending_uidx")
    )
  }

  async createInvitation(command: CreateInvitationCommand) {
    try {
      return await this.database.transaction().execute(async (transaction) => {
        const email = command.email.trim().toLowerCase()
        if (!isInvitationEmail(email)) {
          throw new AppError("INVITATION_EMAIL_INVALID", "请输入有效的邀请邮箱", 400)
        }
        const hash = requestHash({ ...command, email })
        const domain = `invitation.create:${command.teamId}`
        const replay = await this.getReceipt<CreatedInvitation>(
          transaction,
          command.actorId,
          domain,
          command.idempotencyKey,
          hash,
        )
        if (replay) return { item: replay, replayed: true }

        const selfAccount = await transaction
          .selectFrom("accounts")
          .select("email")
          .where("id", "=", command.actorId)
          .executeTakeFirst()
        if (selfAccount?.email && selfAccount.email.toLowerCase() === email) {
          throw new AppError("INVITATION_SELF_FORBIDDEN", "不能邀请自己的账号邮箱", 409)
        }

        let projectId: string | null = null
        if (command.scope === "project") {
          const project = await transaction
            .selectFrom("projects")
            .select("id")
            .where("id", "=", command.projectId ?? "")
            .where("team_id", "=", command.teamId)
            .executeTakeFirst()
          if (!project) {
            throw new AppError(
              "INVITATION_PROJECT_INVALID",
              "邀请的项目不存在或不在当前团队",
              404,
            )
          }
          projectId = project.id
        }

        const existingMembership =
          command.scope === "team"
            ? await transaction
                .selectFrom("team_memberships")
                .select("account_id")
                .where("team_id", "=", command.teamId)
                .where(
                  "account_id",
                  "in",
                  transaction
                    .selectFrom("accounts")
                    .select("id")
                    .where("email", "=", email),
                )
                .executeTakeFirst()
            : await transaction
                .selectFrom("project_memberships as membership")
                .innerJoin("accounts as account", "account.id", "membership.account_id")
                .select("membership.account_id")
                .where("membership.project_id", "=", projectId ?? "")
                .where("account.email", "=", email)
                .executeTakeFirst()
        if (existingMembership) {
          throw new AppError(
            "INVITATION_MEMBER_EXISTS",
            command.scope === "team" ? "该邮箱已是团队成员" : "该邮箱已是项目成员",
            409,
          )
        }

        let templateId = command.permissionTemplateId ?? null
        if (templateId) {
          const template = await transaction
            .selectFrom("permission_templates")
            .select("id")
            .where("id", "=", templateId)
            .where("team_id", "=", command.teamId)
            .where("scope", "=", command.scope)
            .executeTakeFirst()
          if (!template) {
            throw new AppError(
              "PERMISSION_TEMPLATE_INVALID",
              "权限模板不属于当前作用域",
              400,
            )
          }
        } else {
          const defaultKey =
            command.scope === "team" ? "team-member" : "project-contributor"
          const template = await transaction
            .selectFrom("permission_templates")
            .select("id")
            .where("team_id", "=", command.teamId)
            .where("scope", "=", command.scope)
            .where("key", "=", defaultKey)
            .executeTakeFirst()
          if (!template) {
            throw new AppError("SYSTEM_TEMPLATE_MISSING", "系统权限模板缺失", 500)
          }
          templateId = template.id
        }

        const pendingQuery = transaction
          .selectFrom("onboarding_invitations")
          .select("id")
          .where("team_id", "=", command.teamId)
          .where("email", "=", email)
          .where("status", "=", "pending")
        const pending = await (command.scope === "project"
          ? pendingQuery.where("project_id", "=", projectId ?? "")
          : pendingQuery.where("project_id", "is", null)
        ).executeTakeFirst()
        if (pending) {
          throw new AppError(
            "INVITATION_PENDING_EXISTS",
            "该邮箱已有待处理的同类邀请",
            409,
          )
        }

        const expiryDays = command.expiresInDays ?? defaultInvitationExpiryDays
        const token = randomBytes(32).toString("base64url")
        const id = randomUUID()
        await transaction
          .insertInto("onboarding_invitations")
          .values({
            id,
            team_id: command.teamId,
            project_id: projectId,
            scope: command.scope,
            email,
            token_hash: createHash("sha256").update(token).digest("hex"),
            permission_template_id: templateId,
            role: "member",
            invited_by_account_id: command.actorId,
            expires_at: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
          })
          .execute()
        const summary = await this.findInvitationById(transaction, id)
        if (!summary) throw new Error("Created invitation could not be read")
        const item: CreatedInvitation = { ...summary, token }
        await this.writeReceipt(
          transaction,
          command.actorId,
          domain,
          command.idempotencyKey,
          hash,
          // The one-time token is returned once and never persisted, including receipts.
          { ...summary },
        )
        await this.writeAudit(
          transaction,
          { actorId: command.actorId, teamId: command.teamId, projectId },
          "invitation.created",
          id,
          { email, scope: command.scope },
        )
        return { item, replayed: false }
      })
    } catch (error) {
      if (this.isPendingInvitationUniqueViolation(error)) {
        throw new AppError("INVITATION_PENDING_EXISTS", "该邮箱已有待处理的同类邀请", 409)
      }
      throw error
    }
  }

  async listInvitations(teamId: string) {
    const rows = await this.invitationQuery(this.database)
      .where("invitation.team_id", "=", teamId)
      .orderBy("invitation.created_at", "desc")
      .orderBy("invitation.id", "desc")
      .execute()
    return rows.map((row) => this.mapInvitation(row))
  }

  async findInvitationByTokenHash(tokenHash: string) {
    const row = await this.invitationQuery(this.database)
      .where("invitation.token_hash", "=", tokenHash)
      .executeTakeFirst()
    return row ? this.mapInvitation(row) : null
  }

  async acceptInvitation(command: AcceptInvitationCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash({ actorId: command.actorId, token: command.token })
      const replay = await this.getReceipt<InvitationAcceptance>(
        transaction,
        command.actorId,
        "invitation.accept",
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const tokenHash = createHash("sha256").update(command.token).digest("hex")
      const invitation = await transaction
        .selectFrom("onboarding_invitations")
        .selectAll()
        .where("token_hash", "=", tokenHash)
        .forUpdate()
        .executeTakeFirst()
      if (!invitation) {
        throw new AppError("INVITATION_NOT_FOUND", "邀请不存在或已失效", 404)
      }
      const now = new Date()
      if (invitation.status === "revoked") {
        throw new AppError("INVITATION_REVOKED", "邀请已被撤销", 410)
      }
      if (invitation.status === "accepted") {
        throw new AppError("INVITATION_ALREADY_ACCEPTED", "邀请已被接受", 410)
      }
      if (invitation.expires_at.getTime() <= now.getTime()) {
        throw new AppError("INVITATION_EXPIRED", "邀请已过期", 410)
      }

      const account = await transaction
        .selectFrom("accounts")
        .select(["id", "email", "display_name"])
        .where("id", "=", command.actorId)
        .executeTakeFirst()
      if (!account) {
        throw new AppError("ACCOUNT_NOT_FOUND", "当前账号不存在", 404)
      }
      if (
        !account.email ||
        account.email.toLowerCase() !== invitation.email.toLowerCase()
      ) {
        throw new AppError(
          "INVITATION_EMAIL_MISMATCH",
          "当前账号邮箱与邀请邮箱不一致",
          403,
        )
      }

      const template = await transaction
        .selectFrom("permission_templates")
        .select(["id", "name"])
        .where("id", "=", invitation.permission_template_id)
        .executeTakeFirst()
      if (!template) {
        throw new AppError("SYSTEM_TEMPLATE_MISSING", "邀请的权限模板不存在", 404)
      }

      const team = await transaction
        .selectFrom("teams")
        .select("name")
        .where("id", "=", invitation.team_id)
        .executeTakeFirst()
      if (!team) {
        throw new AppError("RESOURCE_NOT_FOUND", "邀请的团队不存在", 404)
      }
      let projectName: string | null = null
      if (invitation.scope === "project") {
        const project = await transaction
          .selectFrom("projects")
          .select("name")
          .where("id", "=", invitation.project_id ?? "")
          .where("team_id", "=", invitation.team_id)
          .executeTakeFirst()
        if (!project) {
          throw new AppError("RESOURCE_NOT_FOUND", "邀请的项目不存在", 404)
        }
        projectName = project.name
      }

      if (invitation.scope === "team") {
        const existing = await transaction
          .selectFrom("team_memberships")
          .select("account_id")
          .where("team_id", "=", invitation.team_id)
          .where("account_id", "=", command.actorId)
          .executeTakeFirst()
        if (existing) {
          throw new AppError("INVITATION_MEMBER_EXISTS", "该账号已是团队成员", 409)
        }
        await transaction
          .insertInto("team_memberships")
          .values({
            team_id: invitation.team_id,
            account_id: command.actorId,
            role: invitation.role,
            permission_template_id: template.id,
          })
          .execute()
      } else {
        const existing = await transaction
          .selectFrom("project_memberships")
          .select("account_id")
          .where("project_id", "=", invitation.project_id ?? "")
          .where("account_id", "=", command.actorId)
          .executeTakeFirst()
        if (existing) {
          throw new AppError("INVITATION_MEMBER_EXISTS", "该账号已是项目成员", 409)
        }
        await transaction
          .insertInto("project_memberships")
          .values({
            project_id: invitation.project_id ?? "",
            account_id: command.actorId,
            role: invitation.role,
            permission_template_id: template.id,
          })
          .execute()
      }

      const accepted = await transaction
        .updateTable("onboarding_invitations")
        .set({
          status: "accepted",
          accepted_account_id: command.actorId,
          accepted_at: now,
          updated_at: now,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", invitation.id)
        .where("status", "=", "pending")
        .where("revision", "=", invitation.revision)
        .returning("id")
        .executeTakeFirst()
      if (!accepted) {
        throw new AppError("INVITATION_ALREADY_ACCEPTED", "邀请已被接受", 409)
      }

      const item: InvitationAcceptance = {
        invitationId: invitation.id,
        scope: invitation.scope,
        teamId: invitation.team_id,
        teamName: team.name,
        projectId: invitation.project_id,
        projectName,
        role: invitation.role,
        permissionTemplateId: template.id,
        permissionTemplateName: template.name,
      }

      await transaction
        .insertInto("notifications")
        .values({
          id: randomUUID(),
          recipient_account_id: invitation.invited_by_account_id,
          source_actor_account_id: command.actorId,
          team_id: invitation.team_id,
          project_id: invitation.project_id,
          kind:
            invitation.scope === "team"
              ? "team_invitation_accepted"
              : "project_invitation_accepted",
          subject_id: invitation.id,
          dedup_key: `invitation-accepted:${invitation.id}`,
          title:
            invitation.scope === "team"
              ? `新成员已加入${team.name}`
              : `新成员已加入项目“${projectName}”`,
          body: `${account.display_name} 已接受邮箱 ${invitation.email} 的邀请并加入当前${
            invitation.scope === "team" ? "团队" : "项目"
          }`,
          metadata: JSON.stringify({
            invitationId: invitation.id,
            scope: invitation.scope,
            email: invitation.email,
            accountId: command.actorId,
            permissionTemplateId: template.id,
          }),
        })
        .onConflict((conflict) =>
          conflict.columns(["recipient_account_id", "dedup_key"]).doNothing(),
        )
        .execute()

      await this.writeAudit(
        transaction,
        {
          actorId: command.actorId,
          teamId: invitation.team_id,
          projectId: invitation.project_id,
        },
        "invitation.accepted",
        invitation.id,
        {
          scope: invitation.scope,
          email: invitation.email,
          role: invitation.role,
          permissionTemplateId: template.id,
          acceptedAccountId: command.actorId,
        },
      )
      await this.writeReceipt(
        transaction,
        command.actorId,
        "invitation.accept",
        command.idempotencyKey,
        hash,
        item,
      )
      return { item, replayed: false }
    })
  }

  async revokeInvitation(command: RevokeInvitationCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom("onboarding_invitations")
        .select(["revision", "status", "expires_at"])
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .forUpdate()
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" } as const
      if (existing.status === "accepted") return { kind: "accepted" } as const
      if (existing.status === "revoked") return { kind: "revoked" } as const
      if (existing.expires_at.getTime() <= Date.now()) return { kind: "expired" } as const
      if (existing.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      const revoked = await transaction
        .updateTable("onboarding_invitations")
        .set({ status: "revoked", revoked_at: new Date(), updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where("status", "=", "pending")
        .where("revision", "=", command.expectedRevision)
        .returning("id")
        .executeTakeFirst()
      if (!revoked) return { kind: "conflict" } as const
      await this.writeAudit(
        transaction,
        command,
        "invitation.revoked",
        command.itemId,
        {},
      )
      return { kind: "ok", item: { id: revoked.id } } as const
    })
  }

  async rotateInvitationToken(command: RotateInvitationTokenCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `invitation.rotate-token:${command.teamId}`
      const replay = await this.getReceipt<CreatedInvitation>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true } as const

      const invitation = await transaction
        .selectFrom("onboarding_invitations")
        .select(["id", "revision", "status", "expires_at"])
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .forUpdate()
        .executeTakeFirst()
      if (!invitation) return { kind: "not_found" } as const
      if (invitation.status === "accepted") return { kind: "accepted" } as const
      if (invitation.status === "revoked") return { kind: "revoked" } as const
      if (invitation.expires_at.getTime() <= Date.now())
        return { kind: "expired" } as const
      if (invitation.revision !== command.expectedRevision)
        return { kind: "conflict" } as const

      const token = randomBytes(32).toString("base64url")
      const updated = await transaction
        .updateTable("onboarding_invitations")
        .set({
          token_hash: createHash("sha256").update(token).digest("hex"),
          updated_at: new Date(),
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where("status", "=", "pending")
        .where("revision", "=", command.expectedRevision)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" } as const
      const summary = await this.findInvitationById(transaction, updated.id)
      if (!summary) throw new Error("Rotated invitation could not be read")
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        summary,
      )
      await this.writeAudit(
        transaction,
        command,
        "invitation.token_rotated",
        updated.id,
        {
          revision: summary.revision,
        },
      )
      return { item: { ...summary, token }, replayed: false } as const
    })
  }

  async listTasks(actorId: string, teamId: string) {
    const rows = await this.taskQuery(this.database)
      .where("task.assignee_account_id", "=", actorId)
      .where("task.team_id", "=", teamId)
      .where("task.deleted_at", "is", null)
      .orderBy("task.status", "asc")
      .orderBy("task.due_date", "asc")
      .orderBy("task.updated_at", "desc")
      .execute()
    return rows.map((row) => this.mapTask(row))
  }

  async createTask(command: CreateTaskCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const replay = await this.getReceipt<WorkspaceTask>(
        transaction,
        command.actorId,
        "task.create",
        command.idempotencyKey,
        requestHash(command),
      )
      if (replay) return { item: replay, replayed: true }

      const id = randomUUID()
      await transaction
        .insertInto("workspace_tasks")
        .values({
          id,
          team_id: command.teamId,
          project_id: command.projectId ?? null,
          assignee_account_id: command.actorId,
          created_by_account_id: command.actorId,
          title: command.title.trim(),
          due_date: command.dueDate ?? null,
          status: command.status ?? "待开始",
          target_view: command.target ?? "project",
        })
        .execute()
      const item = await this.findTask(transaction, id)
      if (!item) throw new Error("Created task could not be read")
      await this.writeReceipt(
        transaction,
        command.actorId,
        "task.create",
        command.idempotencyKey,
        requestHash(command),
        item,
      )
      await this.writeAudit(transaction, command, "task.created", id, {
        status: item.status,
      })
      return { item, replayed: false }
    })
  }

  async updateTask(command: UpdateTaskCommand): Promise<UpdateResult<WorkspaceTask>> {
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom("workspace_tasks")
        .select("revision")
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where("assignee_account_id", "=", command.actorId)
        .where("deleted_at", "is", null)
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" }
      if (existing.revision !== command.expectedRevision) return { kind: "conflict" }

      const values: {
        title?: string
        due_date?: string | null
        status?: TaskStatus
        target_view?: string
        updated_at: Date
      } = { updated_at: new Date() }
      if (command.title !== undefined) values.title = command.title.trim()
      if (command.dueDate !== undefined) values.due_date = command.dueDate
      if (command.status !== undefined) values.status = command.status
      if (command.target !== undefined) values.target_view = command.target

      const updated = await transaction
        .updateTable("workspace_tasks")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("revision", "=", command.expectedRevision)
        .where("team_id", "=", command.teamId)
        .where("assignee_account_id", "=", command.actorId)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" }
      const item = await this.findTask(transaction, updated.id)
      if (!item) return { kind: "not_found" }
      await this.writeAudit(transaction, command, "task.updated", item.id, {
        revision: item.revision,
      })
      return { kind: "ok", item }
    })
  }

  async deleteTask(command: DeleteItemCommand) {
    return this.softDelete("workspace_tasks", command, "task.deleted")
  }

  async listCalendarEvents(actorId: string, teamId: string) {
    const rows = await this.calendarQuery(this.database)
      .where("event.owner_account_id", "=", actorId)
      .where("event.team_id", "=", teamId)
      .where("event.deleted_at", "is", null)
      .orderBy("event.starts_at", "asc")
      .execute()
    return rows.map((row) => this.mapCalendarEvent(row))
  }

  async createCalendarEvent(command: CreateCalendarEventCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const replay = await this.getReceipt<CalendarEvent>(
        transaction,
        command.actorId,
        "calendar-event.create",
        command.idempotencyKey,
        requestHash(command),
      )
      if (replay) return { item: replay, replayed: true }

      const id = randomUUID()
      await transaction
        .insertInto("calendar_events")
        .values({
          id,
          team_id: command.teamId,
          project_id: command.projectId ?? null,
          owner_account_id: command.actorId,
          title: command.title.trim(),
          starts_at: new Date(command.startsAt),
          ends_at: command.endsAt ? new Date(command.endsAt) : null,
          original_timezone: command.timezone,
          all_day: command.allDay ?? false,
          visibility: command.visibility ?? "private",
          target_view: command.target ?? "calendar",
        })
        .execute()
      const item = await this.findCalendarEvent(transaction, id)
      if (!item) throw new Error("Created calendar event could not be read")
      await this.writeReceipt(
        transaction,
        command.actorId,
        "calendar-event.create",
        command.idempotencyKey,
        requestHash(command),
        item,
      )
      await this.writeAudit(transaction, command, "calendar-event.created", id, {
        startsAt: item.startsAt,
      })
      return { item, replayed: false }
    })
  }

  async updateCalendarEvent(command: UpdateCalendarEventCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom("calendar_events")
        .select(["revision", "starts_at", "ends_at"])
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where("owner_account_id", "=", command.actorId)
        .where("deleted_at", "is", null)
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" } as const
      if (existing.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }

      const nextStartsAt = command.startsAt
        ? new Date(command.startsAt)
        : new Date(existing.starts_at)
      const nextEndsAt =
        command.endsAt === undefined
          ? existing.ends_at
            ? new Date(existing.ends_at)
            : null
          : command.endsAt
            ? new Date(command.endsAt)
            : null
      if (nextEndsAt && nextEndsAt < nextStartsAt) {
        throw new AppError("INVALID_CALENDAR_RANGE", "日程结束时间不能早于开始时间", 400)
      }

      const values: {
        title?: string
        starts_at?: Date
        ends_at?: Date | null
        original_timezone?: string
        all_day?: boolean
        visibility?: "private" | "team" | "project"
        target_view?: string
        updated_at: Date
      } = { updated_at: new Date() }
      if (command.title !== undefined) values.title = command.title.trim()
      if (command.startsAt !== undefined) values.starts_at = new Date(command.startsAt)
      if (command.endsAt !== undefined) {
        values.ends_at = command.endsAt ? new Date(command.endsAt) : null
      }
      if (command.timezone !== undefined) values.original_timezone = command.timezone
      if (command.allDay !== undefined) values.all_day = command.allDay
      if (command.visibility !== undefined) values.visibility = command.visibility
      if (command.target !== undefined) values.target_view = command.target

      const updated = await transaction
        .updateTable("calendar_events")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("revision", "=", command.expectedRevision)
        .where("team_id", "=", command.teamId)
        .where("owner_account_id", "=", command.actorId)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" } as const
      const item = await this.findCalendarEvent(transaction, updated.id)
      if (!item) return { kind: "not_found" } as const
      await this.writeAudit(transaction, command, "calendar-event.updated", item.id, {
        revision: item.revision,
      })
      return { kind: "ok", item } as const
    })
  }

  async deleteCalendarEvent(command: DeleteItemCommand) {
    return this.softDelete("calendar_events", command, "calendar-event.deleted")
  }

  async listNotes(actorId: string, teamId: string) {
    const rows = await this.noteQuery(this.database)
      .where("note.owner_account_id", "=", actorId)
      .where("note.team_id", "=", teamId)
      .where("note.deleted_at", "is", null)
      .orderBy("note.pinned", "desc")
      .orderBy("note.updated_at", "desc")
      .execute()
    return rows.map((row) => this.mapNote(row))
  }

  async createNote(command: CreateNoteCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const replay = await this.getReceipt<WorkspaceNote>(
        transaction,
        command.actorId,
        "note.create",
        command.idempotencyKey,
        requestHash(command),
      )
      if (replay) return { item: replay, replayed: true }

      const id = randomUUID()
      await transaction
        .insertInto("workspace_notes")
        .values({
          id,
          team_id: command.teamId,
          project_id: command.projectId ?? null,
          owner_account_id: command.actorId,
          title: command.title.trim(),
          body: command.body ?? "",
          kind: command.kind,
          pinned: command.pinned ?? false,
        })
        .execute()
      const item = await this.findNote(transaction, id)
      if (!item) throw new Error("Created note could not be read")
      await this.writeReceipt(
        transaction,
        command.actorId,
        "note.create",
        command.idempotencyKey,
        requestHash(command),
        item,
      )
      await this.writeAudit(transaction, command, "note.created", id, {
        kind: item.kind,
      })
      return { item, replayed: false }
    })
  }

  async updateNote(command: UpdateNoteCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom("workspace_notes")
        .select("revision")
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where("owner_account_id", "=", command.actorId)
        .where("deleted_at", "is", null)
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" } as const
      if (existing.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }

      const values: {
        title?: string
        body?: string
        pinned?: boolean
        updated_at: Date
      } = { updated_at: new Date() }
      if (command.title !== undefined) values.title = command.title.trim()
      if (command.body !== undefined) values.body = command.body
      if (command.pinned !== undefined) values.pinned = command.pinned

      const updated = await transaction
        .updateTable("workspace_notes")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("revision", "=", command.expectedRevision)
        .where("team_id", "=", command.teamId)
        .where("owner_account_id", "=", command.actorId)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" } as const
      const item = await this.findNote(transaction, updated.id)
      if (!item) return { kind: "not_found" } as const
      await this.writeAudit(transaction, command, "note.updated", item.id, {
        revision: item.revision,
      })
      return { kind: "ok", item } as const
    })
  }

  async deleteNote(command: DeleteItemCommand) {
    return this.softDelete("workspace_notes", command, "note.deleted")
  }

  async listDeletedItems(
    actorId: string,
    teamId: string,
  ): Promise<WorkspaceRecycleItem[]> {
    const [tasks, events, notes, teamContacts, suppliers] = await Promise.all([
      this.database
        .selectFrom("workspace_tasks as item")
        .leftJoin("projects as project", "project.id", "item.project_id")
        .select([
          "item.id",
          "item.title",
          "item.project_id",
          "project.name as project_name",
          "item.deleted_at",
          "item.revision",
        ])
        .where("item.assignee_account_id", "=", actorId)
        .where("item.team_id", "=", teamId)
        .where("item.deleted_at", "is not", null)
        .execute(),
      this.database
        .selectFrom("calendar_events as item")
        .leftJoin("projects as project", "project.id", "item.project_id")
        .select([
          "item.id",
          "item.title",
          "item.project_id",
          "project.name as project_name",
          "item.deleted_at",
          "item.revision",
        ])
        .where("item.owner_account_id", "=", actorId)
        .where("item.team_id", "=", teamId)
        .where("item.deleted_at", "is not", null)
        .execute(),
      this.database
        .selectFrom("workspace_notes as item")
        .leftJoin("projects as project", "project.id", "item.project_id")
        .select([
          "item.id",
          "item.title",
          "item.project_id",
          "project.name as project_name",
          "item.deleted_at",
          "item.revision",
        ])
        .where("item.owner_account_id", "=", actorId)
        .where("item.team_id", "=", teamId)
        .where("item.deleted_at", "is not", null)
        .execute(),
      this.database
        .selectFrom("team_contacts")
        .select(["id", "name", "deleted_at", "revision"])
        .where("team_id", "=", teamId)
        .where("deleted_at", "is not", null)
        .execute(),
      this.database
        .selectFrom("suppliers")
        .select(["id", "name", "deleted_at", "revision"])
        .where("team_id", "=", teamId)
        .where("deleted_at", "is not", null)
        .execute(),
    ])
    const mapRows = (
      kind: WorkspaceRecycleItem["kind"],
      rows: typeof tasks,
    ): WorkspaceRecycleItem[] =>
      rows.map((row) => ({
        id: row.id,
        kind,
        title: row.title,
        projectId: row.project_id,
        projectName: row.project_name,
        deletedAt: toIso(row.deleted_at as Date | string),
        revision: row.revision,
      }))
    return [
      ...mapRows("task", tasks),
      ...mapRows("calendar-event", events),
      ...mapRows("note", notes),
      ...teamContacts.map((row) => ({
        id: row.id,
        kind: "team-contact" as const,
        title: row.name,
        projectId: null,
        projectName: null,
        deletedAt: toIso(row.deleted_at as Date | string),
        revision: row.revision,
      })),
      ...suppliers.map((row) => ({
        id: row.id,
        kind: "supplier" as const,
        title: row.name,
        projectId: null,
        projectName: null,
        deletedAt: toIso(row.deleted_at as Date | string),
        revision: row.revision,
      })),
    ].sort((left, right) => right.deletedAt.localeCompare(left.deletedAt))
  }

  async restoreDeletedItem(command: RestoreRecycleItemCommand) {
    if (command.kind === "team-contact" || command.kind === "supplier") {
      return this.restoreDeletedTeamResource(
        command.kind === "team-contact" ? "team_contacts" : "suppliers",
        command,
        command.kind === "team-contact"
          ? "team-contact.restored"
          : "team-supplier.restored",
      )
    }
    const config =
      command.kind === "task"
        ? {
            table: "workspace_tasks" as const,
            ownerColumn: "assignee_account_id" as const,
            action: "task.restored",
          }
        : command.kind === "calendar-event"
          ? {
              table: "calendar_events" as const,
              ownerColumn: "owner_account_id" as const,
              action: "calendar-event.restored",
            }
          : {
              table: "workspace_notes" as const,
              ownerColumn: "owner_account_id" as const,
              action: "note.restored",
            }
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom(config.table)
        .select("revision")
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where(config.ownerColumn, "=", command.actorId)
        .where("deleted_at", "is not", null)
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" } as const
      if (existing.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      const restored = await transaction
        .updateTable(config.table)
        .set({ deleted_at: null, updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("revision", "=", command.expectedRevision)
        .where("team_id", "=", command.teamId)
        .where(config.ownerColumn, "=", command.actorId)
        .where("deleted_at", "is not", null)
        .returning("id")
        .executeTakeFirst()
      if (!restored) return { kind: "conflict" } as const
      await this.writeAudit(transaction, command, config.action, restored.id, {
        revision: command.expectedRevision + 1,
      })
      return { kind: "ok", item: { id: restored.id } } as const
    })
  }

  async permanentlyDeleteDeletedItem(command: PermanentlyDeleteRecycleItemCommand) {
    if (command.kind === "team-contact" || command.kind === "supplier") {
      const table = command.kind === "team-contact" ? "team_contacts" : "suppliers"
      const action =
        command.kind === "team-contact"
          ? "team-contact.permanently-deleted"
          : "team-supplier.permanently-deleted"
      return this.database.transaction().execute(async (transaction) => {
        const existing = await transaction
          .selectFrom(table)
          .select("revision")
          .where("id", "=", command.itemId)
          .where("team_id", "=", command.teamId)
          .where("deleted_at", "is not", null)
          .executeTakeFirst()
        if (!existing) return { kind: "not_found" } as const
        if (existing.revision !== command.expectedRevision) {
          return { kind: "conflict" } as const
        }
        if (command.kind === "team-contact") {
          await transaction
            .deleteFrom("breakdown_item_contacts")
            .where("contact_source", "=", "team")
            .where("contact_id", "=", command.itemId)
            .execute()
          await transaction
            .deleteFrom("supplier_contacts")
            .where("contact_source", "=", "team")
            .where("contact_id", "=", command.itemId)
            .execute()
        } else {
          await transaction
            .deleteFrom("breakdown_item_suppliers")
            .where("supplier_id", "=", command.itemId)
            .execute()
        }
        const deleted = await transaction
          .deleteFrom(table)
          .where("id", "=", command.itemId)
          .where("team_id", "=", command.teamId)
          .where("revision", "=", command.expectedRevision)
          .where("deleted_at", "is not", null)
          .returning("id")
          .executeTakeFirst()
        if (!deleted) return { kind: "conflict" } as const
        await this.writeAudit(transaction, command, action, deleted.id, {
          revision: command.expectedRevision,
        })
        return { kind: "ok", item: { id: deleted.id } } as const
      })
    }

    const config =
      command.kind === "task"
        ? {
            table: "workspace_tasks" as const,
            ownerColumn: "assignee_account_id" as const,
            action: "task.permanently-deleted",
          }
        : command.kind === "calendar-event"
          ? {
              table: "calendar_events" as const,
              ownerColumn: "owner_account_id" as const,
              action: "calendar-event.permanently-deleted",
            }
          : {
              table: "workspace_notes" as const,
              ownerColumn: "owner_account_id" as const,
              action: "note.permanently-deleted",
            }
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom(config.table)
        .select(["revision", "project_id"])
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where(config.ownerColumn, "=", command.actorId)
        .where("deleted_at", "is not", null)
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" } as const
      if (existing.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      const deleted = await transaction
        .deleteFrom(config.table)
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where(config.ownerColumn, "=", command.actorId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is not", null)
        .returning("id")
        .executeTakeFirst()
      if (!deleted) return { kind: "conflict" } as const
      await this.writeAudit(
        transaction,
        { ...command, projectId: existing.project_id },
        config.action,
        deleted.id,
        { revision: command.expectedRevision },
      )
      return { kind: "ok", item: { id: deleted.id } } as const
    })
  }

  private async restoreDeletedTeamResource(
    table: "team_contacts" | "suppliers",
    command: RestoreRecycleItemCommand,
    action: string,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom(table)
        .select("revision")
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where("deleted_at", "is not", null)
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" } as const
      if (existing.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      const restored = await transaction
        .updateTable(table)
        .set({ deleted_at: null, updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("revision", "=", command.expectedRevision)
        .where("team_id", "=", command.teamId)
        .where("deleted_at", "is not", null)
        .returning("id")
        .executeTakeFirst()
      if (!restored) return { kind: "conflict" } as const
      await this.writeAudit(transaction, command, action, restored.id, {
        revision: command.expectedRevision + 1,
      })
      return { kind: "ok", item: { id: restored.id } } as const
    })
  }

  private taskQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("workspace_tasks as task")
      .innerJoin("accounts as assignee", "assignee.id", "task.assignee_account_id")
      .leftJoin("projects as project", "project.id", "task.project_id")
      .select([
        "task.id",
        "task.team_id",
        "task.project_id",
        "project.name as project_name",
        "task.title",
        "task.due_date",
        "assignee.display_name as assignee_name",
        "task.status",
        "task.target_view",
        "task.revision",
        "task.updated_at",
      ])
  }

  private async findTask(database: DatabaseExecutor, id: string) {
    const row = await this.taskQuery(database)
      .where("task.id", "=", id)
      .executeTakeFirst()
    return row ? this.mapTask(row) : null
  }

  private mapTask(row: {
    id: string
    team_id: string
    project_id: string | null
    project_name: string | null
    title: string
    due_date: Date | string | null
    assignee_name: string
    status: TaskStatus
    target_view: string
    revision: number
    updated_at: Date | string
  }): WorkspaceTask {
    return {
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      projectName: row.project_name,
      title: row.title,
      dueDate: toDate(row.due_date),
      assigneeName: row.assignee_name,
      status: row.status,
      target: row.target_view,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private calendarQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("calendar_events as event")
      .leftJoin("projects as project", "project.id", "event.project_id")
      .select([
        "event.id",
        "event.team_id",
        "event.project_id",
        "project.name as project_name",
        "event.title",
        "event.starts_at",
        "event.ends_at",
        "event.original_timezone",
        "event.all_day",
        "event.visibility",
        "event.target_view",
        "event.revision",
        "event.updated_at",
      ])
  }

  private async findCalendarEvent(database: DatabaseExecutor, id: string) {
    const row = await this.calendarQuery(database)
      .where("event.id", "=", id)
      .executeTakeFirst()
    return row ? this.mapCalendarEvent(row) : null
  }

  private mapCalendarEvent(row: {
    id: string
    team_id: string
    project_id: string | null
    project_name: string | null
    title: string
    starts_at: Date | string
    ends_at: Date | string | null
    original_timezone: string
    all_day: boolean
    visibility: "private" | "team" | "project"
    target_view: string
    revision: number
    updated_at: Date | string
  }): CalendarEvent {
    return {
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      projectName: row.project_name,
      title: row.title,
      startsAt: toIso(row.starts_at),
      endsAt: row.ends_at ? toIso(row.ends_at) : null,
      timezone: row.original_timezone,
      allDay: row.all_day,
      visibility: row.visibility,
      target: row.target_view,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private noteQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("workspace_notes as note")
      .leftJoin("projects as project", "project.id", "note.project_id")
      .select([
        "note.id",
        "note.team_id",
        "note.project_id",
        "project.name as project_name",
        "note.title",
        "note.body",
        "note.kind",
        "note.pinned",
        "note.revision",
        "note.updated_at",
      ])
  }

  private notificationBase(database: DatabaseExecutor, actorId: string, teamId: string) {
    return database
      .selectFrom("notifications as notification")
      .leftJoin("team_memberships as team_membership", (join) =>
        join
          .onRef("team_membership.team_id", "=", "notification.team_id")
          .on("team_membership.account_id", "=", actorId),
      )
      .leftJoin("projects as project", "project.id", "notification.project_id")
      .leftJoin("project_memberships as project_membership", (join) =>
        join
          .onRef("project_membership.project_id", "=", "notification.project_id")
          .on("project_membership.account_id", "=", actorId),
      )
      .leftJoin(
        "accounts as source_actor",
        "source_actor.id",
        "notification.source_actor_account_id",
      )
      .where("notification.recipient_account_id", "=", actorId)
      .where("notification.team_id", "=", teamId)
      .where((expression) =>
        expression.or([
          expression("team_membership.account_id", "is not", null),
          expression.and([
            expression("notification.project_id", "is not", null),
            expression("project_membership.account_id", "is not", null),
          ]),
        ]),
      )
      .where((expression) =>
        expression.or([
          expression("notification.project_id", "is", null),
          expression("project_membership.account_id", "is not", null),
        ]),
      )
  }

  private async findNotification(
    database: DatabaseExecutor,
    actorId: string,
    teamId: string,
    id: string,
  ) {
    const row = await this.notificationBase(database, actorId, teamId)
      .select([
        "notification.id",
        "notification.team_id",
        "notification.project_id",
        "project.name as project_name",
        "notification.kind",
        "notification.subject_id",
        "source_actor.display_name as source_actor_name",
        "notification.title",
        "notification.body",
        "notification.metadata",
        "notification.read_at",
        "notification.acknowledged_at",
        "notification.created_at",
      ])
      .where("notification.id", "=", id)
      .executeTakeFirst()
    return row ? this.mapNotification(row) : null
  }

  private mapNotification(row: {
    id: string
    team_id: string
    project_id: string | null
    project_name: string | null
    kind: WorkspaceNotification["kind"]
    subject_id: string
    source_actor_name: string | null
    title: string
    body: string
    metadata: Record<string, unknown>
    read_at: Date | string | null
    acknowledged_at: Date | string | null
    created_at: Date | string
  }): WorkspaceNotification {
    return {
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      projectName: row.project_name,
      kind: row.kind,
      subjectId: row.subject_id,
      sourceActorName:
        row.source_actor_name ??
        (typeof row.metadata.sourceActorName === "string"
          ? row.metadata.sourceActorName
          : "系统操作"),
      title: row.title,
      body: row.body,
      metadata: row.metadata,
      readAt: row.read_at ? toIso(row.read_at) : null,
      acknowledgedAt: row.acknowledged_at ? toIso(row.acknowledged_at) : null,
      createdAt: toIso(row.created_at),
    }
  }

  private async writePermissionNotification(
    database: DatabaseExecutor,
    input: {
      recipientAccountId: string
      sourceActorAccountId: string
      teamId: string
      projectId: string | null
      kind: "team_permission_assigned" | "project_permission_assigned"
      subjectId: string
      dedupKey: string
      title: string
      body: string
      metadata: Record<string, unknown>
    },
  ) {
    const preference = await database
      .selectFrom("notification_preferences")
      .select("permission_assignments")
      .where("account_id", "=", input.recipientAccountId)
      .where("team_id", "=", input.teamId)
      .executeTakeFirst()
    if (preference?.permission_assignments === false) return

    await database
      .insertInto("notifications")
      .values({
        id: randomUUID(),
        recipient_account_id: input.recipientAccountId,
        source_actor_account_id: input.sourceActorAccountId,
        team_id: input.teamId,
        project_id: input.projectId,
        kind: input.kind,
        subject_id: input.subjectId,
        dedup_key: input.dedupKey,
        title: input.title,
        body: input.body,
        metadata: JSON.stringify(input.metadata),
      })
      .onConflict((conflict) =>
        conflict.columns(["recipient_account_id", "dedup_key"]).doNothing(),
      )
      .execute()
  }

  private async findNote(database: DatabaseExecutor, id: string) {
    const row = await this.noteQuery(database)
      .where("note.id", "=", id)
      .executeTakeFirst()
    return row ? this.mapNote(row) : null
  }

  private mapNote(row: {
    id: string
    team_id: string
    project_id: string | null
    project_name: string | null
    title: string
    body: string
    kind: NoteKind
    pinned: boolean
    revision: number
    updated_at: Date | string
  }): WorkspaceNote {
    return {
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      projectName: row.project_name,
      title: row.title,
      body: row.body,
      kind: row.kind,
      pinned: row.pinned,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private mapPermissionTemplate(
    row: {
      id: string
      team_id: string
      scope: "team" | "project"
      key: string
      name: string
      permissions: string[]
      is_system: boolean
      revision: number
      updated_at: Date | string
    },
    assignedCount: number,
  ): PermissionTemplate {
    return {
      id: row.id,
      teamId: row.team_id,
      scope: row.scope,
      key: row.key,
      name: row.name,
      permissions: row.permissions.filter(
        (item): item is PermissionCapability => typeof item === "string",
      ),
      isSystem: row.is_system,
      assignedCount,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private async permissionTemplateAssignmentCount(
    database: DatabaseExecutor,
    templateId: string,
  ) {
    const [team, project] = await Promise.all([
      database
        .selectFrom("team_memberships")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("permission_template_id", "=", templateId)
        .executeTakeFirstOrThrow(),
      database
        .selectFrom("project_memberships")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("permission_template_id", "=", templateId)
        .executeTakeFirstOrThrow(),
    ])
    return Number(team.count) + Number(project.count)
  }

  private async ensureSystemPermissionTemplates(
    database: DatabaseExecutor,
    teamId: string,
  ) {
    await database
      .insertInto("permission_templates")
      .values(
        systemPermissionTemplates.map((template) => ({
          id: `${teamId}:${template.key}`,
          team_id: teamId,
          scope: template.scope,
          key: template.key,
          name: template.name,
          permissions: JSON.stringify(template.permissions),
          is_system: true,
          created_by_account_id: null,
        })),
      )
      .onConflict((conflict) => conflict.columns(["team_id", "scope", "key"]).doNothing())
      .execute()
    const rows = await database
      .selectFrom("permission_templates")
      .select(["id", "key"])
      .where("team_id", "=", teamId)
      .where("is_system", "=", true)
      .execute()
    const templateIds = new Map(rows.map((row) => [row.key, row.id]))
    const teamAdminId = templateIds.get("team-admin")
    const projectManagerId = templateIds.get("project-manager")
    if (!teamAdminId || !projectManagerId) {
      throw new AppError("SYSTEM_TEMPLATE_MISSING", "系统权限模板缺失", 500)
    }
    return { teamAdminId, projectManagerId }
  }

  private invitationQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("onboarding_invitations as invitation")
      .innerJoin("teams as team", "team.id", "invitation.team_id")
      .leftJoin("projects as project", "project.id", "invitation.project_id")
      .innerJoin("accounts as inviter", "inviter.id", "invitation.invited_by_account_id")
      .leftJoin("accounts as acceptor", "acceptor.id", "invitation.accepted_account_id")
      .innerJoin(
        "permission_templates as template",
        "template.id",
        "invitation.permission_template_id",
      )
      .select([
        "invitation.id",
        "invitation.team_id",
        "team.name as team_name",
        "invitation.project_id",
        "project.name as project_name",
        "invitation.scope",
        "invitation.email",
        "invitation.role",
        "invitation.status",
        "invitation.invited_by_account_id",
        "inviter.display_name as invited_by_name",
        "invitation.accepted_account_id",
        "invitation.permission_template_id",
        "template.name as template_name",
        "invitation.expires_at",
        "invitation.accepted_at",
        "invitation.revoked_at",
        "invitation.revision",
        "invitation.created_at",
      ])
  }

  private mapInvitation(row: {
    id: string
    team_id: string
    team_name: string
    project_id: string | null
    project_name: string | null
    scope: "team" | "project"
    email: string
    role: string
    status: "pending" | "accepted" | "revoked"
    invited_by_account_id: string
    invited_by_name: string
    accepted_account_id: string | null
    permission_template_id: string
    template_name: string
    expires_at: Date | string
    accepted_at: Date | string | null
    revoked_at: Date | string | null
    revision: number
    created_at: Date | string
  }): InvitationSummary {
    return {
      id: row.id,
      teamId: row.team_id,
      teamName: row.team_name,
      projectId: row.project_id,
      projectName: row.project_name,
      scope: row.scope,
      email: row.email,
      role: row.role,
      permissionTemplateId: row.permission_template_id,
      permissionTemplateName: row.template_name,
      status: row.status,
      invitedByAccountId: row.invited_by_account_id,
      invitedByName: row.invited_by_name,
      acceptedAccountId: row.accepted_account_id,
      expiresAt: toIso(row.expires_at),
      acceptedAt: row.accepted_at ? toIso(row.accepted_at) : null,
      revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
      revision: row.revision,
      createdAt: toIso(row.created_at),
    }
  }

  private async findInvitationById(database: DatabaseExecutor, id: string) {
    const row = await this.invitationQuery(database)
      .where("invitation.id", "=", id)
      .executeTakeFirst()
    return row ? this.mapInvitation(row) : null
  }

  private async getReceipt<T extends ReceiptItem>(
    database: DatabaseExecutor,
    actorId: string,
    domain: string,
    key: string,
    hash: string,
  ) {
    await sql`select pg_advisory_xact_lock(
      hashtextextended(${`${actorId}:${domain}:${key}`}, 0)
    )`.execute(database)
    const row = await database
      .selectFrom("command_receipts")
      .select(["response", "request_hash"])
      .where("actor_account_id", "=", actorId)
      .where("domain", "=", domain)
      .where("idempotency_key", "=", key)
      .executeTakeFirst()
    if (row?.request_hash && row.request_hash !== hash) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        "幂等键已用于不同请求，请重新提交",
        409,
      )
    }
    return (row?.response as T | undefined) ?? null
  }

  private async writeReceipt(
    database: DatabaseExecutor,
    actorId: string,
    domain: string,
    key: string,
    hash: string,
    response: ReceiptItem,
  ) {
    await database
      .insertInto("command_receipts")
      .values({
        actor_account_id: actorId,
        domain,
        idempotency_key: key,
        request_hash: hash,
        response: JSON.stringify(response),
      })
      .execute()
  }

  private async softDelete(
    table: "workspace_tasks" | "calendar_events" | "workspace_notes",
    command: DeleteItemCommand,
    action: string,
  ): Promise<UpdateResult<{ id: string }>> {
    return this.database.transaction().execute(async (transaction) => {
      const ownerColumn =
        table === "workspace_tasks" ? "assignee_account_id" : "owner_account_id"
      const existing = await transaction
        .selectFrom(table)
        .select("revision")
        .where("id", "=", command.itemId)
        .where("team_id", "=", command.teamId)
        .where(ownerColumn, "=", command.actorId)
        .where("deleted_at", "is", null)
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" }
      if (existing.revision !== command.expectedRevision) return { kind: "conflict" }

      const deleted = await transaction
        .updateTable(table)
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where("id", "=", command.itemId)
        .where("revision", "=", command.expectedRevision)
        .where("team_id", "=", command.teamId)
        .where(ownerColumn, "=", command.actorId)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!deleted) return { kind: "conflict" }
      await this.writeAudit(transaction, command, action, deleted.id, {})
      return { kind: "ok", item: { id: deleted.id } }
    })
  }

  private async writeAudit(
    database: DatabaseExecutor,
    command: { actorId: string; teamId: string; projectId?: string | null },
    action: string,
    subjectId: string,
    metadata: Record<string, unknown>,
  ) {
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: command.actorId,
        team_id: command.teamId,
        project_id: command.projectId ?? null,
        action,
        subject_id: subjectId,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }
}
