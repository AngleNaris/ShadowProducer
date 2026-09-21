import { type Static, Type } from "@sinclair/typebox"

export const TeamParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const TeamItemParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  itemId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const WorkspaceRecycleItemKindSchema = Type.Union([
  Type.Literal("task"),
  Type.Literal("calendar-event"),
  Type.Literal("note"),
  Type.Literal("team-contact"),
  Type.Literal("supplier"),
])

export const WorkspaceRecycleItemParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  kind: WorkspaceRecycleItemKindSchema,
  itemId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const PermissionTemplateScopeSchema = Type.Union([
  Type.Literal("team"),
  Type.Literal("project"),
])

export const PermissionCapabilitySchema = Type.Union([
  Type.Literal("team.read"),
  Type.Literal("team.write"),
  Type.Literal("team.permissions.manage"),
  Type.Literal("team.recycle.manage"),
  Type.Literal("asset.write"),
  Type.Literal("portfolio.write"),
  Type.Literal("portfolio.publish"),
  Type.Literal("project.read"),
  Type.Literal("project.write"),
  Type.Literal("script.write"),
  Type.Literal("production.write"),
  Type.Literal("call_sheet.publish"),
  Type.Literal("review.write"),
  Type.Literal("review.manage"),
])

export const PermissionTemplateSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  scope: PermissionTemplateScopeSchema,
  key: Type.String(),
  name: Type.String(),
  permissions: Type.Array(PermissionCapabilitySchema, { uniqueItems: true }),
  isSystem: Type.Boolean(),
  assignedCount: Type.Integer({ minimum: 0 }),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const PermissionProjectMembershipSchema = Type.Object({
  projectId: Type.String(),
  projectName: Type.String(),
  role: Type.String(),
  permissionTemplateId: Type.Union([Type.String(), Type.Null()]),
  permissionTemplateName: Type.Union([Type.String(), Type.Null()]),
  permissionRevision: Type.Integer({ minimum: 1 }),
})

export const PermissionMemberSchema = Type.Object({
  accountId: Type.String(),
  displayName: Type.String(),
  role: Type.Union([Type.String(), Type.Null()]),
  permissionTemplateId: Type.Union([Type.String(), Type.Null()]),
  permissionTemplateName: Type.Union([Type.String(), Type.Null()]),
  permissionRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  projects: Type.Array(PermissionProjectMembershipSchema),
})

export const PermissionWorkspaceSchema = Type.Object({
  currentAccountId: Type.String(),
  canManage: Type.Boolean(),
  templates: Type.Array(PermissionTemplateSchema),
  members: Type.Array(PermissionMemberSchema),
})

export const CreatePermissionTemplateBodySchema = Type.Object({
  scope: PermissionTemplateScopeSchema,
  name: Type.String({ minLength: 1, maxLength: 80 }),
  permissions: Type.Array(PermissionCapabilitySchema, {
    minItems: 1,
    uniqueItems: true,
  }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdatePermissionTemplateBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  permissions: Type.Optional(
    Type.Array(PermissionCapabilitySchema, { minItems: 1, uniqueItems: true }),
  ),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const AssignPermissionTemplateBodySchema = Type.Object({
  templateId: Type.String({ minLength: 1, maxLength: 100 }),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const PermissionTeamMemberParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  accountId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const PermissionProjectMemberParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  accountId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const PermissionTemplateMutationSchema = Type.Object({
  item: PermissionTemplateSchema,
  replayed: Type.Optional(Type.Boolean()),
})

export const PermissionAssignmentMutationSchema = Type.Object({
  accountId: Type.String(),
  permissionTemplateId: Type.String(),
  permissionRevision: Type.Integer({ minimum: 1 }),
})

export const WorkspaceContextSchema = Type.Object({
  actor: Type.Object({
    id: Type.String(),
    displayName: Type.String(),
  }),
  teams: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      role: Type.Union([Type.String(), Type.Null()]),
      memberCount: Type.Integer({ minimum: 0 }),
      projects: Type.Array(
        Type.Object({
          id: Type.String(),
          name: Type.String(),
          role: Type.String(),
          status: Type.String(),
          updatedAt: Type.String(),
        }),
      ),
    }),
  ),
})

export const AuditLogQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  scope: Type.Optional(Type.Literal("team")),
  action: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  actor: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  from: Type.Optional(
    Type.String({
      pattern:
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
    }),
  ),
  to: Type.Optional(
    Type.String({
      pattern:
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
    }),
  ),
})

export const AuditLogSchema = Type.Object({
  id: Type.String(),
  actorAccountId: Type.Union([Type.String(), Type.Null()]),
  actorName: Type.String(),
  actorType: Type.String(),
  teamId: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  action: Type.String(),
  subjectId: Type.String(),
  metadata: Type.Record(Type.String(), Type.Any()),
  createdAt: Type.String(),
})

export const AuditLogListSchema = Type.Object({
  items: Type.Array(AuditLogSchema),
  total: Type.Integer({ minimum: 0 }),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
})

export const NotificationKindSchema = Type.Union([
  Type.Literal("call_sheet_published"),
  Type.Literal("call_sheet_changed"),
  Type.Literal("team_permission_assigned"),
  Type.Literal("project_permission_assigned"),
  Type.Literal("portfolio_published"),
  Type.Literal("portfolio_unpublished"),
  Type.Literal("review_comment_created"),
  Type.Literal("review_comment_replied"),
  Type.Literal("review_file_approved"),
  Type.Literal("contact_share_updated"),
  Type.Literal("contact_share_revoked"),
  Type.Literal("team_invitation_accepted"),
  Type.Literal("project_invitation_accepted"),
])

export const WorkspaceNotificationSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  kind: NotificationKindSchema,
  subjectId: Type.String(),
  sourceActorName: Type.String(),
  title: Type.String(),
  body: Type.String(),
  metadata: Type.Record(Type.String(), Type.Any()),
  readAt: Type.Union([Type.String(), Type.Null()]),
  acknowledgedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
})

export const WorkspaceNotificationListSchema = Type.Object({
  items: Type.Array(WorkspaceNotificationSchema),
  unreadCount: Type.Integer({ minimum: 0 }),
  total: Type.Integer({ minimum: 0 }),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
})

export const NotificationListQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
})

export const UpdateNotificationStateBodySchema = Type.Object({
  action: Type.Union([Type.Literal("read"), Type.Literal("acknowledge")]),
})

export const WorkspaceNotificationMutationSchema = Type.Object({
  item: WorkspaceNotificationSchema,
})

export const MarkAllNotificationsReadSchema = Type.Object({
  updated: Type.Integer({ minimum: 0 }),
})

export const NotificationPreferencesSchema = Type.Object({
  publishedCallSheets: Type.Boolean(),
  importantCallSheetChanges: Type.Boolean(),
  permissionAssignments: Type.Boolean(),
  portfolioPublications: Type.Boolean(),
  reviewActivity: Type.Boolean(),
  contactSharing: Type.Boolean(),
})

export const TaskStatusSchema = Type.Union([
  Type.Literal("待开始"),
  Type.Literal("进行中"),
  Type.Literal("等待他人"),
  Type.Literal("已完成"),
])

export const WorkspaceTaskSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  title: Type.String(),
  dueDate: Type.Union([Type.String(), Type.Null()]),
  assigneeName: Type.String(),
  status: TaskStatusSchema,
  target: Type.String(),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const CreateWorkspaceTaskBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 300 }),
  projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  dueDate: Type.Optional(
    Type.Union([Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), Type.Null()]),
  ),
  status: Type.Optional(TaskStatusSchema),
  target: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateWorkspaceTaskBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  dueDate: Type.Optional(
    Type.Union([Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), Type.Null()]),
  ),
  status: Type.Optional(TaskStatusSchema),
  target: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const CalendarEventSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  title: Type.String(),
  startsAt: Type.String(),
  endsAt: Type.Union([Type.String(), Type.Null()]),
  timezone: Type.String(),
  allDay: Type.Boolean(),
  visibility: Type.Union([
    Type.Literal("private"),
    Type.Literal("team"),
    Type.Literal("project"),
  ]),
  target: Type.String(),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const CreateCalendarEventBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 300 }),
  projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  startsAt: Type.String({
    pattern:
      "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
  }),
  endsAt: Type.Optional(
    Type.Union([
      Type.String({
        pattern:
          "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
      }),
      Type.Null(),
    ]),
  ),
  timezone: Type.String({ minLength: 1, maxLength: 80 }),
  allDay: Type.Optional(Type.Boolean()),
  visibility: Type.Optional(
    Type.Union([Type.Literal("private"), Type.Literal("team"), Type.Literal("project")]),
  ),
  target: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateCalendarEventBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  startsAt: Type.Optional(
    Type.String({
      pattern:
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
    }),
  ),
  endsAt: Type.Optional(
    Type.Union([
      Type.String({
        pattern:
          "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
      }),
      Type.Null(),
    ]),
  ),
  timezone: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  allDay: Type.Optional(Type.Boolean()),
  visibility: Type.Optional(
    Type.Union([Type.Literal("private"), Type.Literal("team"), Type.Literal("project")]),
  ),
  target: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const NoteKindSchema = Type.Union([Type.Literal("note"), Type.Literal("sticky")])

export const WorkspaceNoteSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  title: Type.String(),
  body: Type.String(),
  kind: NoteKindSchema,
  pinned: Type.Boolean(),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const CreateWorkspaceNoteBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 300 }),
  body: Type.Optional(Type.String({ maxLength: 100_000 })),
  kind: NoteKindSchema,
  projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  pinned: Type.Optional(Type.Boolean()),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateWorkspaceNoteBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  body: Type.Optional(Type.String({ maxLength: 100_000 })),
  pinned: Type.Optional(Type.Boolean()),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const DeleteItemBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const PermanentlyDeleteRecycleItemBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  confirmation: Type.Literal("permanent-delete"),
})

export const DeleteItemResponseSchema = Type.Object({ id: Type.String() })
export const WorkspaceTaskListSchema = Type.Object({
  items: Type.Array(WorkspaceTaskSchema),
})
export const CalendarEventListSchema = Type.Object({
  items: Type.Array(CalendarEventSchema),
})
export const WorkspaceNoteListSchema = Type.Object({
  items: Type.Array(WorkspaceNoteSchema),
})
export const WorkspaceRecycleItemSchema = Type.Object({
  id: Type.String(),
  kind: WorkspaceRecycleItemKindSchema,
  title: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  deletedAt: Type.String(),
  revision: Type.Integer({ minimum: 1 }),
})
export const WorkspaceRecycleListSchema = Type.Object({
  items: Type.Array(WorkspaceRecycleItemSchema),
  canManageShared: Type.Boolean(),
})
export const WorkspaceTaskMutationSchema = Type.Object({
  item: WorkspaceTaskSchema,
  replayed: Type.Boolean(),
})
export const CalendarEventMutationSchema = Type.Object({
  item: CalendarEventSchema,
  replayed: Type.Boolean(),
})
export const WorkspaceNoteMutationSchema = Type.Object({
  item: WorkspaceNoteSchema,
  replayed: Type.Boolean(),
})

export const CreateTeamBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 80 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const CreateProjectBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 80 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const OnboardingTeamSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  role: Type.String(),
  permissionTemplateId: Type.String(),
  createdAt: Type.String(),
})

export const OnboardingProjectSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  name: Type.String(),
  role: Type.String(),
  status: Type.String(),
  permissionTemplateId: Type.String(),
  createdAt: Type.String(),
})

export const InvitationStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("accepted"),
  Type.Literal("revoked"),
])

export const InvitationSummarySchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  teamName: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  scope: PermissionTemplateScopeSchema,
  email: Type.String(),
  role: Type.String(),
  permissionTemplateId: Type.String(),
  permissionTemplateName: Type.String(),
  status: InvitationStatusSchema,
  invitedByAccountId: Type.String(),
  invitedByName: Type.String(),
  acceptedAccountId: Type.Union([Type.String(), Type.Null()]),
  expiresAt: Type.String(),
  acceptedAt: Type.Union([Type.String(), Type.Null()]),
  revokedAt: Type.Union([Type.String(), Type.Null()]),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
})

export const CreatedInvitationSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  teamName: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  scope: PermissionTemplateScopeSchema,
  email: Type.String(),
  role: Type.String(),
  permissionTemplateId: Type.String(),
  permissionTemplateName: Type.String(),
  status: InvitationStatusSchema,
  invitedByAccountId: Type.String(),
  invitedByName: Type.String(),
  acceptedAccountId: Type.Union([Type.String(), Type.Null()]),
  expiresAt: Type.String(),
  acceptedAt: Type.Union([Type.String(), Type.Null()]),
  revokedAt: Type.Union([Type.String(), Type.Null()]),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  token: Type.Optional(Type.String()),
})

export const InvitationMutationSchema = Type.Object({
  item: CreatedInvitationSchema,
  replayed: Type.Boolean(),
})

export const InvitationListSchema = Type.Object({
  items: Type.Array(InvitationSummarySchema),
})

export const CreateInvitationBodySchema = Type.Object({
  scope: PermissionTemplateScopeSchema,
  email: Type.String({
    minLength: 3,
    maxLength: 200,
    pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
  }),
  projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  permissionTemplateId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  expiresInDays: Type.Optional(
    Type.Union([Type.Literal(7), Type.Literal(30), Type.Literal(90)]),
  ),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const AcceptInvitationBodySchema = Type.Object({
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const RevokeInvitationBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const RotateInvitationTokenBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const InvitationAcceptanceSchema = Type.Object({
  invitationId: Type.String(),
  scope: PermissionTemplateScopeSchema,
  teamId: Type.String(),
  teamName: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  role: Type.String(),
  permissionTemplateId: Type.String(),
  permissionTemplateName: Type.String(),
})

export const InvitationAcceptanceMutationSchema = Type.Object({
  item: InvitationAcceptanceSchema,
  replayed: Type.Boolean(),
})

export type TeamParams = Static<typeof TeamParamsSchema>
export type TeamItemParams = Static<typeof TeamItemParamsSchema>
export type WorkspaceRecycleItemKind = Static<typeof WorkspaceRecycleItemKindSchema>
export type WorkspaceRecycleItemParams = Static<typeof WorkspaceRecycleItemParamsSchema>
export type PermissionTemplateScope = Static<typeof PermissionTemplateScopeSchema>
export type PermissionCapability = Static<typeof PermissionCapabilitySchema>
export type PermissionTemplate = Static<typeof PermissionTemplateSchema>
export type PermissionMember = Static<typeof PermissionMemberSchema>
export type PermissionWorkspace = Static<typeof PermissionWorkspaceSchema>
export type CreatePermissionTemplateBody = Static<
  typeof CreatePermissionTemplateBodySchema
>
export type UpdatePermissionTemplateBody = Static<
  typeof UpdatePermissionTemplateBodySchema
>
export type AssignPermissionTemplateBody = Static<
  typeof AssignPermissionTemplateBodySchema
>
export type PermissionTeamMemberParams = Static<typeof PermissionTeamMemberParamsSchema>
export type PermissionProjectMemberParams = Static<
  typeof PermissionProjectMemberParamsSchema
>
export type WorkspaceContext = Static<typeof WorkspaceContextSchema>
export type AuditLogQuery = Static<typeof AuditLogQuerySchema>
export type AuditLog = Static<typeof AuditLogSchema>
export type AuditLogList = Static<typeof AuditLogListSchema>
export type NotificationKind = Static<typeof NotificationKindSchema>
export type WorkspaceNotification = Static<typeof WorkspaceNotificationSchema>
export type WorkspaceNotificationList = Static<typeof WorkspaceNotificationListSchema>
export type NotificationListQuery = Static<typeof NotificationListQuerySchema>
export type UpdateNotificationStateBody = Static<typeof UpdateNotificationStateBodySchema>
export type NotificationPreferences = Static<typeof NotificationPreferencesSchema>
export type TaskStatus = Static<typeof TaskStatusSchema>
export type WorkspaceTask = Static<typeof WorkspaceTaskSchema>
export type CreateWorkspaceTaskBody = Static<typeof CreateWorkspaceTaskBodySchema>
export type UpdateWorkspaceTaskBody = Static<typeof UpdateWorkspaceTaskBodySchema>
export type CalendarEvent = Static<typeof CalendarEventSchema>
export type CreateCalendarEventBody = Static<typeof CreateCalendarEventBodySchema>
export type UpdateCalendarEventBody = Static<typeof UpdateCalendarEventBodySchema>
export type NoteKind = Static<typeof NoteKindSchema>
export type WorkspaceNote = Static<typeof WorkspaceNoteSchema>
export type WorkspaceRecycleItem = Static<typeof WorkspaceRecycleItemSchema>
export type CreateWorkspaceNoteBody = Static<typeof CreateWorkspaceNoteBodySchema>
export type UpdateWorkspaceNoteBody = Static<typeof UpdateWorkspaceNoteBodySchema>
export type DeleteItemBody = Static<typeof DeleteItemBodySchema>
export type PermanentlyDeleteRecycleItemBody = Static<
  typeof PermanentlyDeleteRecycleItemBodySchema
>
export type CreateTeamBody = Static<typeof CreateTeamBodySchema>
export type CreateProjectBody = Static<typeof CreateProjectBodySchema>
export type OnboardingTeam = Static<typeof OnboardingTeamSchema>
export type OnboardingProject = Static<typeof OnboardingProjectSchema>
export type InvitationStatus = Static<typeof InvitationStatusSchema>
export type InvitationSummary = Static<typeof InvitationSummarySchema>
export type CreatedInvitation = Static<typeof CreatedInvitationSchema>
export type InvitationList = Static<typeof InvitationListSchema>
export type CreateInvitationBody = Static<typeof CreateInvitationBodySchema>
export type AcceptInvitationBody = Static<typeof AcceptInvitationBodySchema>
export type RevokeInvitationBody = Static<typeof RevokeInvitationBodySchema>
export type RotateInvitationTokenBody = Static<typeof RotateInvitationTokenBodySchema>
export type InvitationAcceptance = Static<typeof InvitationAcceptanceSchema>
