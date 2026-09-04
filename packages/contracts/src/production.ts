import { type Static, Type } from "@sinclair/typebox"

import { ContactRefSchema } from "./contacts"

export const ProjectItemParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  itemId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const ReviewFileParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  fileId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const ReviewFolderParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  folderId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const ReviewCommentParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  commentId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const ReviewCommentLinkParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  linkId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const BreakdownStateSchema = Type.Union([
  Type.Literal("待确认"),
  Type.Literal("待安排"),
  Type.Literal("待采购或租赁"),
  Type.Literal("已联系"),
  Type.Literal("已确认"),
  Type.Literal("已完成"),
  Type.Literal("不需要"),
  Type.Literal("已取消"),
])

export const BreakdownItemSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  category: Type.String(),
  item: Type.String(),
  requirementType: Type.String(),
  specification: Type.String(),
  quantity: Type.String(),
  preparation: Type.String(),
  department: Type.String(),
  agentAssessment: Type.String(),
  sourceDocument: Type.String(),
  sourceVersion: Type.String(),
  sourceLocation: Type.String(),
  source: Type.String(),
  excerpt: Type.String(),
  confidence: Type.Integer({ minimum: 0, maximum: 100 }),
  state: BreakdownStateSchema,
  parentItemId: Type.Union([Type.String(), Type.Null()]),
  mergedIntoItemId: Type.Union([Type.String(), Type.Null()]),
  supplierIds: Type.Array(Type.String()),
  responsibleAccountId: Type.Union([Type.String(), Type.Null()]),
  responsibleName: Type.Union([Type.String(), Type.Null()]),
  taskIds: Type.Array(Type.String()),
  contactRefs: Type.Array(ContactRefSchema),
  shootingDayIds: Type.Array(Type.String()),
  callSheetIds: Type.Array(Type.String()),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const BreakdownDraftSchema = Type.Object({
  item: Type.String({ minLength: 1, maxLength: 300 }),
  requirementType: Type.String({ minLength: 1, maxLength: 120 }),
  specification: Type.String({ minLength: 1, maxLength: 500 }),
  quantity: Type.String({ minLength: 1, maxLength: 120 }),
  preparation: Type.String({ minLength: 1, maxLength: 2_000 }),
  department: Type.String({ minLength: 1, maxLength: 300 }),
})

export const UpdateBreakdownItemBodySchema = Type.Object({
  item: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  requirementType: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  specification: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  quantity: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  preparation: Type.Optional(Type.String({ minLength: 1, maxLength: 2_000 })),
  department: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  state: Type.Optional(BreakdownStateSchema),
  supplierIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      maxItems: 100,
      uniqueItems: true,
    }),
  ),
  responsibleAccountId: Type.Optional(
    Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
  ),
  taskIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      maxItems: 100,
      uniqueItems: true,
    }),
  ),
  contactRefs: Type.Optional(
    Type.Array(ContactRefSchema, { maxItems: 100, uniqueItems: true }),
  ),
  shootingDayIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      maxItems: 100,
      uniqueItems: true,
    }),
  ),
  callSheetIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      maxItems: 100,
      uniqueItems: true,
    }),
  ),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const BreakdownRelationOptionsSchema = Type.Object({
  members: Type.Array(
    Type.Object({
      accountId: Type.String(),
      displayName: Type.String(),
      role: Type.String(),
    }),
  ),
  tasks: Type.Array(
    Type.Object({
      id: Type.String(),
      title: Type.String(),
      status: Type.String(),
      assigneeName: Type.String(),
    }),
  ),
  contacts: Type.Array(
    Type.Object({
      id: Type.String(),
      source: Type.Union([Type.Literal("team"), Type.Literal("member-shared")]),
      name: Type.Union([Type.String(), Type.Null()]),
      role: Type.Union([Type.String(), Type.Null()]),
      company: Type.Union([Type.String(), Type.Null()]),
    }),
  ),
  shootingDays: Type.Array(
    Type.Object({
      id: Type.String(),
      shootDate: Type.String(),
      dayNumber: Type.Integer({ minimum: 1 }),
      title: Type.String(),
      status: Type.Union([
        Type.Literal("草稿"),
        Type.Literal("已确认"),
        Type.Literal("拍摄中"),
        Type.Literal("已完成"),
        Type.Literal("已取消"),
      ]),
    }),
  ),
  callSheets: Type.Array(
    Type.Object({
      id: Type.String(),
      date: Type.String(),
      day: Type.String(),
      title: Type.String(),
      status: Type.Union([
        Type.Literal("草稿"),
        Type.Literal("待确认"),
        Type.Literal("已发布"),
      ]),
    }),
  ),
})

export const ConfirmBreakdownBodySchema = Type.Object({
  category: Type.String({ minLength: 1, maxLength: 100 }),
  items: Type.Array(
    Type.Object({
      itemId: Type.String({ minLength: 1, maxLength: 100 }),
      expectedRevision: Type.Integer({ minimum: 1 }),
    }),
    { minItems: 1, maxItems: 100 },
  ),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const MergeBreakdownBodySchema = Type.Object({
  category: Type.String({ minLength: 1, maxLength: 100 }),
  primaryItemId: Type.String({ minLength: 1, maxLength: 100 }),
  items: Type.Array(
    Type.Object({
      itemId: Type.String({ minLength: 1, maxLength: 100 }),
      expectedRevision: Type.Integer({ minimum: 1 }),
    }),
    { minItems: 2, maxItems: 20 },
  ),
  result: BreakdownDraftSchema,
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const SplitBreakdownBodySchema = Type.Object({
  itemId: Type.String({ minLength: 1, maxLength: 100 }),
  expectedRevision: Type.Integer({ minimum: 1 }),
  items: Type.Array(BreakdownDraftSchema, { minItems: 2, maxItems: 20 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const CallSheetSceneSchema = Type.Object({
  scene: Type.String(),
  set: Type.String(),
  pages: Type.String(),
  description: Type.String(),
  cast: Type.String(),
})

export const CallSheetCastSchema = Type.Object({
  name: Type.String(),
  role: Type.String(),
  pickup: Type.String(),
  makeup: Type.String(),
  set: Type.String(),
})

export const CallSheetDepartmentSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  call: Type.String({ maxLength: 80 }),
  note: Type.String({ maxLength: 500 }),
})

export const CallSheetEquipmentSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 160 }),
  quantity: Type.String({ maxLength: 80 }),
  source: Type.String({ maxLength: 160 }),
  note: Type.String({ maxLength: 500 }),
})

export const CallSheetSafetySchema = Type.Object({
  level: Type.String({ maxLength: 40 }),
  item: Type.String({ minLength: 1, maxLength: 300 }),
  owner: Type.String({ maxLength: 120 }),
  action: Type.String({ maxLength: 500 }),
})

export const CallSheetTransportSchema = Type.Object({
  item: Type.String({ minLength: 1, maxLength: 160 }),
  time: Type.String({ maxLength: 80 }),
  route: Type.String({ maxLength: 300 }),
  owner: Type.String({ maxLength: 120 }),
  note: Type.String({ maxLength: 500 }),
})

export const CallSheetCateringSchema = Type.Object({
  meal: Type.String({ minLength: 1, maxLength: 120 }),
  time: Type.String({ maxLength: 80 }),
  location: Type.String({ maxLength: 200 }),
  note: Type.String({ maxLength: 500 }),
})

export const CallSheetKeyContactSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  role: Type.String({ maxLength: 120 }),
  phone: Type.String({ maxLength: 80 }),
  note: Type.String({ maxLength: 500 }),
})

export const CallSheetNextDayPreviewSchema = Type.Object({
  date: Type.String({ maxLength: 80 }),
  title: Type.String({ maxLength: 300 }),
  scenes: Type.String({ maxLength: 500 }),
  cast: Type.String({ maxLength: 500 }),
  note: Type.String({ maxLength: 1_000 }),
})

export const CallSheetStatusSchema = Type.Union([
  Type.Literal("草稿"),
  Type.Literal("待确认"),
  Type.Literal("已发布"),
])

export const EditableCallSheetStatusSchema = Type.Union([
  Type.Literal("草稿"),
  Type.Literal("待确认"),
])

export const ExecutionStageStateSchema = Type.Union([
  Type.Literal("未开始"),
  Type.Literal("进行中"),
  Type.Literal("已完成"),
  Type.Literal("已暂停"),
])

export const ExecutionResourceTypeSchema = Type.Union([
  Type.Literal("cast"),
  Type.Literal("crew"),
  Type.Literal("location"),
  Type.Literal("equipment"),
])

export const ExecutionResourceSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 160 }),
  type: ExecutionResourceTypeSchema,
  name: Type.String({ minLength: 1, maxLength: 160 }),
})

export const ExecutionStageSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  name: Type.String(),
  startsAt: Type.String(),
  endsAt: Type.String(),
  originalTimezone: Type.String(),
  progress: Type.Integer({ minimum: 0, maximum: 100 }),
  owner: Type.String(),
  state: ExecutionStageStateSchema,
  note: Type.String(),
  resources: Type.Array(ExecutionResourceSchema),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const ExecutionConflictSchema = Type.Object({
  key: Type.String(),
  resource: ExecutionResourceSchema,
  itemId: Type.String(),
  itemName: Type.String(),
  conflictingItemId: Type.Union([Type.String(), Type.Null()]),
  conflictingProjectId: Type.Union([Type.String(), Type.Null()]),
  conflictingItemName: Type.String(),
  startsAt: Type.String(),
  endsAt: Type.String(),
  crossProject: Type.Boolean(),
  redacted: Type.Boolean(),
})

export const CreateExecutionStageBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  startsAt: Type.String({ minLength: 20, maxLength: 40 }),
  endsAt: Type.String({ minLength: 20, maxLength: 40 }),
  originalTimezone: Type.String({ minLength: 1, maxLength: 80 }),
  progress: Type.Integer({ minimum: 0, maximum: 100 }),
  owner: Type.String({ minLength: 1, maxLength: 160 }),
  state: ExecutionStageStateSchema,
  note: Type.String({ maxLength: 2_000 }),
  resources: Type.Array(ExecutionResourceSchema, { maxItems: 50 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateExecutionStageBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  startsAt: Type.Optional(Type.String({ minLength: 20, maxLength: 40 })),
  endsAt: Type.Optional(Type.String({ minLength: 20, maxLength: 40 })),
  originalTimezone: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  progress: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  owner: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
  state: Type.Optional(ExecutionStageStateSchema),
  note: Type.Optional(Type.String({ maxLength: 2_000 })),
  resources: Type.Optional(Type.Array(ExecutionResourceSchema, { maxItems: 50 })),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const ShootingDayStatusSchema = Type.Union([
  Type.Literal("草稿"),
  Type.Literal("已确认"),
  Type.Literal("拍摄中"),
  Type.Literal("已完成"),
  Type.Literal("已取消"),
])

export const ShootingDaySchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  shootDate: Type.String(),
  dayNumber: Type.Integer({ minimum: 1 }),
  title: Type.String(),
  status: ShootingDayStatusSchema,
  originalTimezone: Type.String(),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const CreateShootingDayBodySchema = Type.Object({
  shootDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  dayNumber: Type.Integer({ minimum: 1, maximum: 9999 }),
  title: Type.String({ minLength: 1, maxLength: 300 }),
  originalTimezone: Type.String({ minLength: 1, maxLength: 80 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateShootingDayBodySchema = Type.Object({
  shootDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
  dayNumber: Type.Optional(Type.Integer({ minimum: 1, maximum: 9999 })),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  status: Type.Optional(ShootingDayStatusSchema),
  originalTimezone: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const CallSheetSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  shootingDayId: Type.Union([Type.String(), Type.Null()]),
  date: Type.String(),
  day: Type.String(),
  title: Type.String(),
  status: CallSheetStatusSchema,
  crewCall: Type.String(),
  firstShot: Type.String(),
  wrap: Type.String(),
  weather: Type.String(),
  sunrise: Type.String(),
  sunset: Type.String(),
  basecamp: Type.String(),
  location: Type.String(),
  hospital: Type.String(),
  scenes: Type.Array(CallSheetSceneSchema),
  cast: Type.Array(CallSheetCastSchema),
  departments: Type.Array(CallSheetDepartmentSchema, { maxItems: 40 }),
  equipment: Type.Array(CallSheetEquipmentSchema, { maxItems: 100 }),
  safety: Type.Array(CallSheetSafetySchema, { maxItems: 50 }),
  transport: Type.Array(CallSheetTransportSchema, { maxItems: 50 }),
  catering: Type.Array(CallSheetCateringSchema, { maxItems: 20 }),
  keyContacts: Type.Array(CallSheetKeyContactSchema, { maxItems: 50 }),
  nextDayPreview: CallSheetNextDayPreviewSchema,
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const CreateCallSheetBodySchema = Type.Object({
  shootingDayId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  date: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateCallSheetBodySchema = Type.Object({
  date: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  day: Type.Optional(Type.String({ maxLength: 100 })),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  status: Type.Optional(EditableCallSheetStatusSchema),
  crewCall: Type.Optional(Type.String({ maxLength: 50 })),
  firstShot: Type.Optional(Type.String({ maxLength: 50 })),
  wrap: Type.Optional(Type.String({ maxLength: 50 })),
  weather: Type.Optional(Type.String({ maxLength: 200 })),
  sunrise: Type.Optional(Type.String({ maxLength: 50 })),
  sunset: Type.Optional(Type.String({ maxLength: 50 })),
  basecamp: Type.Optional(Type.String({ maxLength: 300 })),
  location: Type.Optional(Type.String({ maxLength: 300 })),
  hospital: Type.Optional(Type.String({ maxLength: 300 })),
  scenes: Type.Optional(Type.Array(CallSheetSceneSchema, { maxItems: 100 })),
  cast: Type.Optional(Type.Array(CallSheetCastSchema, { maxItems: 100 })),
  departments: Type.Optional(Type.Array(CallSheetDepartmentSchema, { maxItems: 40 })),
  equipment: Type.Optional(Type.Array(CallSheetEquipmentSchema, { maxItems: 100 })),
  safety: Type.Optional(Type.Array(CallSheetSafetySchema, { maxItems: 50 })),
  transport: Type.Optional(Type.Array(CallSheetTransportSchema, { maxItems: 50 })),
  catering: Type.Optional(Type.Array(CallSheetCateringSchema, { maxItems: 20 })),
  keyContacts: Type.Optional(Type.Array(CallSheetKeyContactSchema, { maxItems: 50 })),
  nextDayPreview: Type.Optional(CallSheetNextDayPreviewSchema),
  changeSummary: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const PublishCallSheetBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const CallSheetPublicationRecipientSchema = Type.Object({
  id: Type.String(),
  notificationId: Type.Union([Type.String(), Type.Null()]),
  displayName: Type.String(),
  email: Type.Union([Type.String(), Type.Null()]),
  projectRole: Type.String(),
  deliveredAt: Type.String(),
  acknowledgedAt: Type.Union([Type.String(), Type.Null()]),
  canAcknowledge: Type.Boolean(),
})

export const CallSheetPublicationSchema = Type.Object({
  id: Type.String(),
  callSheetId: Type.String(),
  version: Type.Integer({ minimum: 1 }),
  snapshot: CallSheetSchema,
  publishedBy: Type.String(),
  publishedAt: Type.String(),
  recipients: Type.Array(CallSheetPublicationRecipientSchema),
})

export const CallSheetChangeSchema = Type.Object({
  id: Type.String(),
  callSheetId: Type.String(),
  basePublicationVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  summary: Type.String(),
  beforeSnapshot: CallSheetSchema,
  afterSnapshot: CallSheetSchema,
  changedBy: Type.String(),
  changedAt: Type.String(),
})

export const ReviewFileStatusSchema = Type.Union([
  Type.Literal("待审阅"),
  Type.Literal("审阅中"),
  Type.Literal("已通过"),
  Type.Literal("处理中"),
])

export const ReviewFileSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  assetId: Type.Union([Type.String(), Type.Null()]),
  folderId: Type.Union([Type.String(), Type.Null()]),
  name: Type.String(),
  version: Type.String(),
  type: Type.Literal("video"),
  status: ReviewFileStatusSchema,
  comments: Type.Integer({ minimum: 0 }),
  updated: Type.String(),
  duration: Type.Union([Type.String(), Type.Null()]),
  approvedBy: Type.Union([Type.String(), Type.Null()]),
  approvedAt: Type.Union([Type.String(), Type.Null()]),
  mediaReady: Type.Boolean(),
  revision: Type.Integer({ minimum: 1 }),
})

export const ReviewFolderSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  name: Type.String(),
  archived: Type.Boolean(),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const ReviewFolderListQuerySchema = Type.Object({
  archived: Type.Optional(Type.Literal("1")),
})

export const ReviewFileListQuerySchema = Type.Object({
  archived: Type.Optional(Type.Literal("1")),
})

export const CreateReviewFolderBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateReviewFolderBodySchema = Type.Object({
  archived: Type.Boolean(),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const MoveReviewFileBodySchema = Type.Object({
  folderId: Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateReviewFileArchiveBodySchema = Type.Object({
  archived: Type.Boolean(),
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const CreateReviewFileBodySchema = Type.Object({
  assetId: Type.String({ minLength: 1, maxLength: 100 }),
  folderId: Type.Optional(
    Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
  ),
  name: Type.String({ minLength: 1, maxLength: 300 }),
  version: Type.String({ minLength: 1, maxLength: 50 }),
  duration: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const ReviewFileApprovalBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const ReviewCommentStateSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("resolved"),
])

export const ReviewCommentSchema = Type.Object({
  id: Type.String(),
  fileId: Type.String(),
  parentCommentId: Type.Union([Type.String(), Type.Null()]),
  version: Type.String(),
  author: Type.String(),
  authorId: Type.String(),
  initials: Type.String(),
  timecode: Type.String(),
  text: Type.String(),
  state: ReviewCommentStateSchema,
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
})

export const CreateReviewCommentBodySchema = Type.Object({
  version: Type.String({ minLength: 1, maxLength: 50 }),
  timecode: Type.String({ minLength: 1, maxLength: 50 }),
  text: Type.String({ minLength: 1, maxLength: 10_000 }),
  parentCommentId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateReviewCommentBodySchema = Type.Object({
  state: ReviewCommentStateSchema,
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const ReviewCommentLinkSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  commentId: Type.String(),
  counterpartCommentId: Type.String(),
  createdById: Type.String(),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  removedAt: Type.Union([Type.String(), Type.Null()]),
})

export const ReviewCommentSuggestionSchema = Type.Object({
  commentId: Type.String(),
  counterpartCommentId: Type.String(),
  score: Type.Number({ minimum: 0, maximum: 1 }),
  timeDifferenceSeconds: Type.Number({ minimum: 0 }),
})

export const ReviewCommentCorrespondenceQuerySchema = Type.Object({
  primaryFileId: Type.String({ minLength: 1, maxLength: 100 }),
  compareFileId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const CreateReviewCommentLinkBodySchema = Type.Object({
  commentId: Type.String({ minLength: 1, maxLength: 100 }),
  counterpartCommentId: Type.String({ minLength: 1, maxLength: 100 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UnlinkReviewCommentLinkBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const BreakdownListSchema = Type.Object({ items: Type.Array(BreakdownItemSchema) })
export const BreakdownMutationSchema = Type.Object({
  items: Type.Array(BreakdownItemSchema),
  replayed: Type.Boolean(),
})
export const ExecutionScheduleSchema = Type.Object({
  items: Type.Array(ExecutionStageSchema),
  conflicts: Type.Array(ExecutionConflictSchema),
})
export const ExecutionStageMutationSchema = Type.Object({
  item: ExecutionStageSchema,
  replayed: Type.Boolean(),
})
export const ShootingDayListSchema = Type.Object({ items: Type.Array(ShootingDaySchema) })
export const ShootingDayMutationSchema = Type.Object({
  item: ShootingDaySchema,
  replayed: Type.Boolean(),
})
export const CallSheetListSchema = Type.Object({ items: Type.Array(CallSheetSchema) })
export const CallSheetMutationSchema = Type.Object({
  item: CallSheetSchema,
  replayed: Type.Boolean(),
})
export const CallSheetPublishMutationSchema = Type.Object({
  item: CallSheetSchema,
  publication: CallSheetPublicationSchema,
  replayed: Type.Boolean(),
})
export const CallSheetHistorySchema = Type.Object({
  publications: Type.Array(CallSheetPublicationSchema),
  changes: Type.Array(CallSheetChangeSchema),
})
export const ReviewFileListSchema = Type.Object({
  items: Type.Array(ReviewFileSchema),
  folders: Type.Array(ReviewFolderSchema),
})
export const ReviewFolderListSchema = Type.Object({
  items: Type.Array(ReviewFolderSchema),
})
export const ReviewFileMutationSchema = Type.Object({
  item: ReviewFileSchema,
  replayed: Type.Boolean(),
})
export const ReviewFolderMutationSchema = Type.Object({
  item: ReviewFolderSchema,
  replayed: Type.Boolean(),
})
export const ReviewCommentListSchema = Type.Object({
  items: Type.Array(ReviewCommentSchema),
})
export const ReviewCommentMutationSchema = Type.Object({
  item: ReviewCommentSchema,
  replayed: Type.Boolean(),
})
export const ReviewCommentCorrespondenceSchema = Type.Object({
  primaryFileId: Type.String(),
  compareFileId: Type.String(),
  links: Type.Array(ReviewCommentLinkSchema),
  suggestions: Type.Array(ReviewCommentSuggestionSchema),
})
export const ReviewCommentLinkMutationSchema = Type.Object({
  item: ReviewCommentLinkSchema,
  replayed: Type.Boolean(),
})

export type ProjectItemParams = Static<typeof ProjectItemParamsSchema>
export type ReviewFileParams = Static<typeof ReviewFileParamsSchema>
export type ReviewFolderParams = Static<typeof ReviewFolderParamsSchema>
export type ReviewCommentParams = Static<typeof ReviewCommentParamsSchema>
export type ReviewCommentLinkParams = Static<typeof ReviewCommentLinkParamsSchema>
export type BreakdownState = Static<typeof BreakdownStateSchema>
export type BreakdownItem = Static<typeof BreakdownItemSchema>
export type BreakdownDraft = Static<typeof BreakdownDraftSchema>
export type UpdateBreakdownItemBody = Static<typeof UpdateBreakdownItemBodySchema>
export type BreakdownRelationOptions = Static<typeof BreakdownRelationOptionsSchema>
export type ConfirmBreakdownBody = Static<typeof ConfirmBreakdownBodySchema>
export type MergeBreakdownBody = Static<typeof MergeBreakdownBodySchema>
export type SplitBreakdownBody = Static<typeof SplitBreakdownBodySchema>
export type ExecutionStageState = Static<typeof ExecutionStageStateSchema>
export type ExecutionResourceType = Static<typeof ExecutionResourceTypeSchema>
export type ExecutionResource = Static<typeof ExecutionResourceSchema>
export type ExecutionStage = Static<typeof ExecutionStageSchema>
export type ExecutionConflict = Static<typeof ExecutionConflictSchema>
export type CreateExecutionStageBody = Static<typeof CreateExecutionStageBodySchema>
export type UpdateExecutionStageBody = Static<typeof UpdateExecutionStageBodySchema>
export type ShootingDayStatus = Static<typeof ShootingDayStatusSchema>
export type ShootingDay = Static<typeof ShootingDaySchema>
export type CreateShootingDayBody = Static<typeof CreateShootingDayBodySchema>
export type UpdateShootingDayBody = Static<typeof UpdateShootingDayBodySchema>
export type CallSheetScene = Static<typeof CallSheetSceneSchema>
export type CallSheetCast = Static<typeof CallSheetCastSchema>
export type CallSheetDepartment = Static<typeof CallSheetDepartmentSchema>
export type CallSheetEquipment = Static<typeof CallSheetEquipmentSchema>
export type CallSheetSafety = Static<typeof CallSheetSafetySchema>
export type CallSheetTransport = Static<typeof CallSheetTransportSchema>
export type CallSheetCatering = Static<typeof CallSheetCateringSchema>
export type CallSheetKeyContact = Static<typeof CallSheetKeyContactSchema>
export type CallSheetNextDayPreview = Static<typeof CallSheetNextDayPreviewSchema>
export type CallSheetStatus = Static<typeof CallSheetStatusSchema>
export type CallSheet = Static<typeof CallSheetSchema>
export type CreateCallSheetBody = Static<typeof CreateCallSheetBodySchema>
export type UpdateCallSheetBody = Static<typeof UpdateCallSheetBodySchema>
export type PublishCallSheetBody = Static<typeof PublishCallSheetBodySchema>
export type CallSheetPublicationRecipient = Static<
  typeof CallSheetPublicationRecipientSchema
>
export type CallSheetPublication = Static<typeof CallSheetPublicationSchema>
export type CallSheetChange = Static<typeof CallSheetChangeSchema>
export type ReviewFile = Static<typeof ReviewFileSchema>
export type ReviewFolder = Static<typeof ReviewFolderSchema>
export type CreateReviewFileBody = Static<typeof CreateReviewFileBodySchema>
export type CreateReviewFolderBody = Static<typeof CreateReviewFolderBodySchema>
export type ReviewFileListQuery = Static<typeof ReviewFileListQuerySchema>
export type ReviewFolderListQuery = Static<typeof ReviewFolderListQuerySchema>
export type UpdateReviewFolderBody = Static<typeof UpdateReviewFolderBodySchema>
export type MoveReviewFileBody = Static<typeof MoveReviewFileBodySchema>
export type UpdateReviewFileArchiveBody = Static<typeof UpdateReviewFileArchiveBodySchema>
export type ReviewFileApprovalBody = Static<typeof ReviewFileApprovalBodySchema>
export type ReviewCommentState = Static<typeof ReviewCommentStateSchema>
export type ReviewComment = Static<typeof ReviewCommentSchema>
export type CreateReviewCommentBody = Static<typeof CreateReviewCommentBodySchema>
export type UpdateReviewCommentBody = Static<typeof UpdateReviewCommentBodySchema>
export type ReviewCommentLink = Static<typeof ReviewCommentLinkSchema>
export type ReviewCommentSuggestion = Static<typeof ReviewCommentSuggestionSchema>
export type ReviewCommentCorrespondenceQuery = Static<
  typeof ReviewCommentCorrespondenceQuerySchema
>
export type CreateReviewCommentLinkBody = Static<typeof CreateReviewCommentLinkBodySchema>
export type UnlinkReviewCommentLinkBody = Static<typeof UnlinkReviewCommentLinkBodySchema>
