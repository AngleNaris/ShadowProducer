import { type Static, Type } from "@sinclair/typebox"

import { AnalysisJobSchema } from "./analysis"
import {
  AssetSemanticSearchBodySchema,
  AssetSemanticSearchMatchSchema,
  MediaAnalysisJobSchema,
  TeamAssetSchema,
} from "./assets"
import {
  CreatePersonalContactBodySchema,
  CreateTeamContactBodySchema,
  CreateTeamSupplierBodySchema,
  PersonalContactSchema,
  TeamContactSchema,
  TeamSupplierSchema,
  UpdateContactShareBodySchema,
  UpdatePersonalContactBodySchema,
} from "./contacts"
import { TeamPortfolioSchema } from "./portfolios"
import {
  BreakdownItemSchema,
  CallSheetPublicationSchema,
  CallSheetSchema,
  ExecutionConflictSchema,
  ExecutionResourceSchema,
  ExecutionStageSchema,
  ReviewCommentCorrespondenceSchema,
  ReviewCommentSchema,
  ReviewFileSchema,
  ShootingDaySchema,
  ShootingDayStatusSchema,
  UpdateBreakdownItemBodySchema,
  UpdateCallSheetBodySchema,
} from "./production"
import { ReviewLinkSchema } from "./review-links"
import { ScriptVersionSchema } from "./scripts"
import {
  AuditLogSchema,
  CalendarEventSchema,
  TaskStatusSchema,
  WorkspaceNoteSchema,
  WorkspaceTaskSchema,
} from "./workspace"

export const AgentActionSchema = Type.Union([
  Type.Literal("list_audit_logs"),
  Type.Literal("list_team_resources"),
  Type.Literal("semantic_search_assets"),
  Type.Literal("list_personal_contacts"),
  Type.Literal("create_personal_contact"),
  Type.Literal("update_personal_contact"),
  Type.Literal("share_personal_contact"),
  Type.Literal("unshare_personal_contact"),
  Type.Literal("delete_personal_contact"),
  Type.Literal("restore_personal_contact"),
  Type.Literal("create_team_contact"),
  Type.Literal("create_team_supplier"),
  Type.Literal("list_tasks"),
  Type.Literal("list_execution_schedule"),
  Type.Literal("create_task"),
  Type.Literal("update_task"),
  Type.Literal("create_note"),
  Type.Literal("update_note"),
  Type.Literal("create_calendar_event"),
  Type.Literal("update_calendar_event"),
  Type.Literal("create_execution_stage"),
  Type.Literal("update_execution_stage"),
  Type.Literal("update_breakdown"),
  Type.Literal("confirm_breakdown"),
  Type.Literal("create_shooting_day"),
  Type.Literal("update_shooting_day"),
  Type.Literal("create_call_sheet"),
  Type.Literal("update_call_sheet"),
  Type.Literal("publish_call_sheet"),
  Type.Literal("create_script_version"),
  Type.Literal("update_script_version"),
  Type.Literal("create_script_breakdown_analysis"),
  Type.Literal("create_media_analysis"),
  Type.Literal("list_review_feedback"),
  Type.Literal("create_review_file"),
  Type.Literal("create_review_comment"),
  Type.Literal("update_review_comment"),
  Type.Literal("approve_review_file"),
  Type.Literal("create_review_link"),
  Type.Literal("create_portfolio"),
  Type.Literal("add_portfolio_content"),
  Type.Literal("publish_portfolio"),
])

export const AgentRiskSchema = Type.Union([
  Type.Literal("read"),
  Type.Literal("write"),
  Type.Literal("high"),
])

export const AgentPreviewBodySchema = Type.Union([
  Type.Object({
    action: Type.Literal("list_audit_logs"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    scope: Type.Optional(Type.Literal("team")),
    auditAction: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
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
    page: Type.Optional(Type.Integer({ minimum: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  }),
  Type.Object({
    action: Type.Literal("list_team_resources"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    keyword: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  }),
  Type.Object({
    action: Type.Literal("semantic_search_assets"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    ...AssetSemanticSearchBodySchema.properties,
  }),
  Type.Object({
    action: Type.Literal("list_personal_contacts"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
  }),
  Type.Object({
    action: Type.Literal("create_personal_contact"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    ...Type.Omit(CreatePersonalContactBodySchema, ["idempotencyKey"]).properties,
  }),
  Type.Object({
    action: Type.Literal("update_personal_contact"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    contactId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    contactName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    ...Type.Omit(UpdatePersonalContactBodySchema, ["expectedRevision"]).properties,
  }),
  Type.Object({
    action: Type.Literal("share_personal_contact"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    contactId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    contactName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    ...Type.Omit(UpdateContactShareBodySchema, ["expectedRevision"]).properties,
  }),
  Type.Object({
    action: Type.Literal("unshare_personal_contact"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    contactId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    contactName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  }),
  Type.Object({
    action: Type.Literal("delete_personal_contact"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    contactId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    contactName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  }),
  Type.Object({
    action: Type.Literal("restore_personal_contact"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    contactId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    contactName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  }),
  Type.Object({
    action: Type.Literal("create_team_contact"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    ...Type.Omit(CreateTeamContactBodySchema, ["idempotencyKey"]).properties,
  }),
  Type.Object({
    action: Type.Literal("create_team_supplier"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    ...Type.Omit(CreateTeamSupplierBodySchema, ["idempotencyKey"]).properties,
  }),
  Type.Object({
    action: Type.Literal("list_tasks"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  }),
  Type.Object({
    action: Type.Literal("list_execution_schedule"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
  }),
  Type.Object({
    action: Type.Literal("create_task"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    title: Type.String({ minLength: 1, maxLength: 300 }),
  }),
  Type.Object({
    action: Type.Literal("update_task"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    taskId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    taskTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    dueDate: Type.Optional(
      Type.Union([Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), Type.Null()]),
    ),
    status: Type.Optional(TaskStatusSchema),
    target: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  }),
  Type.Object({
    action: Type.Literal("create_note"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    title: Type.String({ minLength: 1, maxLength: 300 }),
    body: Type.Optional(Type.String({ maxLength: 100_000 })),
  }),
  Type.Object({
    action: Type.Literal("update_note"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    noteId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    noteTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    body: Type.Optional(Type.String({ maxLength: 100_000 })),
    pinned: Type.Optional(Type.Boolean()),
  }),
  Type.Object({
    action: Type.Literal("create_calendar_event"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    title: Type.String({ minLength: 1, maxLength: 300 }),
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
      Type.Union([
        Type.Literal("private"),
        Type.Literal("team"),
        Type.Literal("project"),
      ]),
    ),
  }),
  Type.Object({
    action: Type.Literal("update_calendar_event"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    eventId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    eventTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    startsAt: Type.String({
      pattern:
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
    }),
    timezone: Type.String({ minLength: 1, maxLength: 80 }),
    allDay: Type.Optional(Type.Boolean()),
  }),
  Type.Object({
    action: Type.Literal("create_execution_stage"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    startsAt: Type.String({ format: "date-time" }),
    endsAt: Type.String({ format: "date-time" }),
    originalTimezone: Type.String({ minLength: 1, maxLength: 80 }),
    progress: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
    owner: Type.String({ minLength: 1, maxLength: 160 }),
    state: Type.Optional(
      Type.Union([
        Type.Literal("未开始"),
        Type.Literal("进行中"),
        Type.Literal("已完成"),
        Type.Literal("已暂停"),
      ]),
    ),
    note: Type.Optional(Type.String({ maxLength: 2_000 })),
    resources: Type.Optional(Type.Array(ExecutionResourceSchema, { maxItems: 50 })),
  }),
  Type.Object({
    action: Type.Literal("update_execution_stage"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    stageId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    stageName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    startsAt: Type.Optional(Type.String({ format: "date-time" })),
    endsAt: Type.Optional(Type.String({ format: "date-time" })),
    originalTimezone: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    progress: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
    owner: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    state: Type.Optional(
      Type.Union([
        Type.Literal("未开始"),
        Type.Literal("进行中"),
        Type.Literal("已完成"),
        Type.Literal("已暂停"),
      ]),
    ),
    note: Type.Optional(Type.String({ maxLength: 2_000 })),
    resources: Type.Optional(Type.Array(ExecutionResourceSchema, { maxItems: 50 })),
  }),
  Type.Object({
    action: Type.Literal("update_breakdown"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    itemId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    itemName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    item: UpdateBreakdownItemBodySchema.properties.item,
    requirementType: UpdateBreakdownItemBodySchema.properties.requirementType,
    specification: UpdateBreakdownItemBodySchema.properties.specification,
    quantity: UpdateBreakdownItemBodySchema.properties.quantity,
    preparation: UpdateBreakdownItemBodySchema.properties.preparation,
    department: UpdateBreakdownItemBodySchema.properties.department,
    state: UpdateBreakdownItemBodySchema.properties.state,
    supplierIds: UpdateBreakdownItemBodySchema.properties.supplierIds,
    responsibleAccountId: UpdateBreakdownItemBodySchema.properties.responsibleAccountId,
    taskIds: UpdateBreakdownItemBodySchema.properties.taskIds,
    contactRefs: UpdateBreakdownItemBodySchema.properties.contactRefs,
    shootingDayIds: UpdateBreakdownItemBodySchema.properties.shootingDayIds,
    callSheetIds: UpdateBreakdownItemBodySchema.properties.callSheetIds,
  }),
  Type.Object({
    action: Type.Literal("confirm_breakdown"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    category: Type.String({ minLength: 1, maxLength: 100 }),
    itemIds: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
        minItems: 1,
        maxItems: 100,
        uniqueItems: true,
      }),
    ),
  }),
  Type.Object({
    action: Type.Literal("create_shooting_day"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    shootDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    dayNumber: Type.Integer({ minimum: 1, maximum: 9999 }),
    title: Type.String({ minLength: 1, maxLength: 300 }),
    originalTimezone: Type.String({ minLength: 1, maxLength: 80 }),
  }),
  Type.Object({
    action: Type.Literal("update_shooting_day"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    shootingDayId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    shootingDayTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    shootDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
    dayNumber: Type.Optional(Type.Integer({ minimum: 1, maximum: 9999 })),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    status: Type.Optional(ShootingDayStatusSchema),
    originalTimezone: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  }),
  Type.Object({
    action: Type.Literal("create_call_sheet"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    date: Type.String({ minLength: 1, maxLength: 80 }),
    title: Type.String({ minLength: 1, maxLength: 300 }),
  }),
  Type.Object({
    action: Type.Literal("update_call_sheet"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    callSheetId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    callSheetTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    ...Type.Omit(UpdateCallSheetBodySchema, ["expectedRevision"]).properties,
  }),
  Type.Object({
    action: Type.Literal("publish_call_sheet"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    callSheetId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  }),
  Type.Object({
    action: Type.Literal("create_script_version"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    documentTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    content: Type.String({ minLength: 1, maxLength: 200_000 }),
    meta: Type.String({ minLength: 1, maxLength: 120 }),
  }),
  Type.Object({
    action: Type.Literal("update_script_version"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    documentTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    content: Type.String({ minLength: 1, maxLength: 200_000 }),
  }),
  Type.Object({
    action: Type.Literal("create_script_breakdown_analysis"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    documentTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    versionId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  }),
  Type.Object({
    action: Type.Literal("create_media_analysis"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    assetId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    assetName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  }),
  Type.Object({
    action: Type.Literal("list_review_feedback"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    primaryFileId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    primaryFileName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    compareFileId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    compareFileName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  }),
  Type.Object({
    action: Type.Literal("create_review_file"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    assetId: Type.String({ minLength: 1, maxLength: 100 }),
    name: Type.String({ minLength: 1, maxLength: 300 }),
    version: Type.String({ minLength: 1, maxLength: 50 }),
    duration: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  }),
  Type.Object({
    action: Type.Literal("create_review_comment"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    fileId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    fileName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    timecode: Type.String({ minLength: 1, maxLength: 50 }),
    text: Type.String({ minLength: 1, maxLength: 10_000 }),
  }),
  Type.Object({
    action: Type.Literal("update_review_comment"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    commentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    fileId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    fileName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    timecode: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
    commentText: Type.Optional(Type.String({ minLength: 1, maxLength: 10_000 })),
    state: Type.Union([Type.Literal("open"), Type.Literal("resolved")]),
  }),
  Type.Object({
    action: Type.Literal("create_review_link"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    fileId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    fileName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    expiresAt: Type.Optional(Type.String({ format: "date-time" })),
  }),
  Type.Object({
    action: Type.Literal("approve_review_file"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    projectId: Type.String({ minLength: 1, maxLength: 100 }),
    fileId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    fileName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  }),
  Type.Object({
    action: Type.Literal("create_portfolio"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    category: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    year: Type.Optional(Type.String({ minLength: 4, maxLength: 10 })),
    description: Type.Optional(Type.String({ maxLength: 4_000 })),
  }),
  Type.Object({
    action: Type.Literal("add_portfolio_content"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    portfolioId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    portfolioTitle: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    reviewFileId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    fileName: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    caption: Type.Optional(Type.String({ maxLength: 1_000 })),
    featured: Type.Optional(Type.Boolean()),
  }),
  Type.Object({
    action: Type.Literal("publish_portfolio"),
    teamId: Type.String({ minLength: 1, maxLength: 100 }),
    portfolioId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  }),
])

export const AgentCommandParamsSchema = Type.Object({
  commandId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const AgentCommandScopeSchema = Type.Object({
  teamId: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
})

export const AgentPreviewResponseSchema = Type.Object({
  commandId: Type.String(),
  action: AgentActionSchema,
  risk: AgentRiskSchema,
  summary: Type.String(),
  scope: AgentCommandScopeSchema,
  requiresConfirmation: Type.Boolean(),
  expiresAt: Type.String(),
})

export const AgentConfirmationResponseSchema = Type.Object({
  commandId: Type.String(),
  status: Type.Literal("confirmed"),
  confirmedAt: Type.String(),
})

export const AgentCommandResultSchema = Type.Union([
  Type.Object({
    kind: Type.Literal("audit_log_list"),
    items: Type.Array(AuditLogSchema),
    total: Type.Integer({ minimum: 0 }),
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
  }),
  Type.Object({
    kind: Type.Literal("team_resources_list"),
    contacts: Type.Array(TeamContactSchema),
    suppliers: Type.Array(TeamSupplierSchema),
    assets: Type.Array(TeamAssetSchema),
  }),
  Type.Object({
    kind: Type.Literal("asset_semantic_search"),
    items: Type.Array(AssetSemanticSearchMatchSchema),
  }),
  Type.Object({
    kind: Type.Literal("personal_contact_list"),
    items: Type.Array(PersonalContactSchema),
  }),
  Type.Object({
    kind: Type.Literal("personal_contact_created"),
    item: PersonalContactSchema,
  }),
  Type.Object({
    kind: Type.Literal("personal_contact_updated"),
    item: PersonalContactSchema,
  }),
  Type.Object({
    kind: Type.Literal("personal_contact_shared"),
    item: PersonalContactSchema,
  }),
  Type.Object({
    kind: Type.Literal("personal_contact_unshared"),
    item: PersonalContactSchema,
  }),
  Type.Object({
    kind: Type.Literal("personal_contact_deleted"),
    id: Type.String(),
  }),
  Type.Object({
    kind: Type.Literal("personal_contact_restored"),
    item: PersonalContactSchema,
  }),
  Type.Object({
    kind: Type.Literal("team_contact_created"),
    item: TeamContactSchema,
  }),
  Type.Object({
    kind: Type.Literal("team_supplier_created"),
    item: TeamSupplierSchema,
  }),
  Type.Object({
    kind: Type.Literal("task_list"),
    items: Type.Array(WorkspaceTaskSchema),
  }),
  Type.Object({
    kind: Type.Literal("execution_schedule_list"),
    stages: Type.Array(ExecutionStageSchema),
    conflicts: Type.Array(ExecutionConflictSchema),
    shootingDays: Type.Array(ShootingDaySchema),
  }),
  Type.Object({
    kind: Type.Literal("task_created"),
    item: WorkspaceTaskSchema,
  }),
  Type.Object({
    kind: Type.Literal("task_updated"),
    item: WorkspaceTaskSchema,
  }),
  Type.Object({
    kind: Type.Literal("note_created"),
    item: WorkspaceNoteSchema,
  }),
  Type.Object({
    kind: Type.Literal("note_updated"),
    item: WorkspaceNoteSchema,
  }),
  Type.Object({
    kind: Type.Literal("calendar_event_created"),
    item: CalendarEventSchema,
  }),
  Type.Object({
    kind: Type.Literal("calendar_event_updated"),
    item: CalendarEventSchema,
  }),
  Type.Object({
    kind: Type.Literal("execution_stage_created"),
    item: ExecutionStageSchema,
  }),
  Type.Object({
    kind: Type.Literal("execution_stage_updated"),
    item: ExecutionStageSchema,
  }),
  Type.Object({
    kind: Type.Literal("breakdown_updated"),
    item: BreakdownItemSchema,
  }),
  Type.Object({
    kind: Type.Literal("breakdown_confirmed"),
    items: Type.Array(BreakdownItemSchema),
  }),
  Type.Object({
    kind: Type.Literal("shooting_day_created"),
    item: ShootingDaySchema,
  }),
  Type.Object({
    kind: Type.Literal("shooting_day_updated"),
    item: ShootingDaySchema,
  }),
  Type.Object({
    kind: Type.Literal("call_sheet_created"),
    item: CallSheetSchema,
  }),
  Type.Object({
    kind: Type.Literal("call_sheet_updated"),
    item: CallSheetSchema,
  }),
  Type.Object({
    kind: Type.Literal("call_sheet_published"),
    item: CallSheetSchema,
    publication: CallSheetPublicationSchema,
  }),
  Type.Object({
    kind: Type.Literal("script_version_created"),
    projectId: Type.String(),
    documentId: Type.String(),
    item: ScriptVersionSchema,
  }),
  Type.Object({
    kind: Type.Literal("script_version_updated"),
    projectId: Type.String(),
    documentId: Type.String(),
    item: ScriptVersionSchema,
  }),
  Type.Object({
    kind: Type.Literal("script_breakdown_analysis_created"),
    item: AnalysisJobSchema,
  }),
  Type.Object({
    kind: Type.Literal("media_analysis_created"),
    item: MediaAnalysisJobSchema,
  }),
  Type.Object({
    kind: Type.Literal("review_feedback_list"),
    files: Type.Array(ReviewFileSchema),
    primaryFileId: Type.Union([Type.String(), Type.Null()]),
    primaryComments: Type.Array(ReviewCommentSchema),
    compareFileId: Type.Union([Type.String(), Type.Null()]),
    compareComments: Type.Array(ReviewCommentSchema),
    correspondence: Type.Union([ReviewCommentCorrespondenceSchema, Type.Null()]),
  }),
  Type.Object({
    kind: Type.Literal("review_file_created"),
    item: ReviewFileSchema,
  }),
  Type.Object({
    kind: Type.Literal("review_comment_created"),
    item: ReviewCommentSchema,
  }),
  Type.Object({
    kind: Type.Literal("review_comment_updated"),
    item: ReviewCommentSchema,
  }),
  Type.Object({
    kind: Type.Literal("review_link_created"),
    item: ReviewLinkSchema,
  }),
  Type.Object({
    kind: Type.Literal("review_file_approved"),
    item: ReviewFileSchema,
  }),
  Type.Object({
    kind: Type.Literal("portfolio_created"),
    item: TeamPortfolioSchema,
  }),
  Type.Object({
    kind: Type.Literal("portfolio_content_added"),
    item: TeamPortfolioSchema,
  }),
  Type.Object({
    kind: Type.Literal("portfolio_published"),
    item: TeamPortfolioSchema,
  }),
])

export const AgentExecutionResponseSchema = Type.Object({
  commandId: Type.String(),
  action: AgentActionSchema,
  result: AgentCommandResultSchema,
  replayed: Type.Boolean(),
})

export type AgentAction = Static<typeof AgentActionSchema>
export type AgentRisk = Static<typeof AgentRiskSchema>
export type AgentPreviewBody = Static<typeof AgentPreviewBodySchema>
export type AgentCommandParams = Static<typeof AgentCommandParamsSchema>
export type AgentCommandScope = Static<typeof AgentCommandScopeSchema>
export type AgentPreviewResponse = Static<typeof AgentPreviewResponseSchema>
export type AgentConfirmationResponse = Static<typeof AgentConfirmationResponseSchema>
export type AgentCommandResult = Static<typeof AgentCommandResultSchema>
export type AgentExecutionResponse = Static<typeof AgentExecutionResponseSchema>
