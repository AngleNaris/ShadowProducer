import { type Static, Type } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

import { BreakdownItemSchema } from "./production"

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
  details: Type.Optional(Type.Unknown()),
  retryable: Type.Boolean(),
  fieldErrors: Type.Optional(Type.Record(Type.String(), Type.Array(Type.String()))),
})

export const ProjectParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const ScriptDocumentQuerySchema = Type.Object({
  documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
})

export const ScriptVersionParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  versionId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const ScriptCommentParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  commentId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const ScriptVersionSchema = Type.Object({
  id: Type.String(),
  meta: Type.String(),
  badge: Type.Union([Type.Literal("当前"), Type.Literal("历史")]),
  content: Type.String(),
  revision: Type.Integer({ minimum: 1 }),
  isCurrent: Type.Boolean(),
  updatedAt: Type.String(),
})

export const StoryboardShotSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 100 }),
    type: Type.String({ minLength: 1, maxLength: 40 }),
    seconds: Type.Number({ minimum: 0.5, maximum: 300 }),
    dialogue: Type.String({ maxLength: 2_000 }),
    lens: Type.String({ maxLength: 100 }),
    movement: Type.String({ maxLength: 200 }),
    content: Type.String({ maxLength: 5_000 }),
    note: Type.String({ maxLength: 5_000 }),
    source: Type.String({ maxLength: 500 }),
    objectPosition: Type.String({ maxLength: 100 }),
    assetId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  },
  { additionalProperties: false },
)

export const StoryboardContentSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    shots: Type.Array(StoryboardShotSchema, { maxItems: 500 }),
  },
  { additionalProperties: false },
)

export const ScriptCommentSchema = Type.Object({
  id: Type.String(),
  versionId: Type.String(),
  parentId: Type.Union([Type.String(), Type.Null()]),
  authorId: Type.String(),
  authorName: Type.String(),
  title: Type.String(),
  text: Type.String(),
  excerpt: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  revision: Type.Integer({ minimum: 1 }),
  resolved: Type.Boolean(),
})

export const ScriptCollaboratorSchema = Type.Object({
  id: Type.String(),
  displayName: Type.String(),
  initials: Type.String(),
  role: Type.String(),
})

export const ScriptPresenceSchema = Type.Object({
  collaboratorId: Type.String(),
  versionId: Type.Union([Type.String(), Type.Null()]),
  cursorStart: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  cursorEnd: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  editing: Type.Boolean(),
  updatedAt: Type.String(),
})

export const ScriptPresenceSnapshotSchema = Type.Object({
  projectId: Type.String(),
  documentId: Type.String(),
  participants: Type.Array(ScriptPresenceSchema),
})

export const UpdateScriptPresenceBodySchema = Type.Object({
  documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  versionId: Type.String({ minLength: 1, maxLength: 100 }),
  cursorStart: Type.Integer({ minimum: 0, maximum: 200_000 }),
  cursorEnd: Type.Integer({ minimum: 0, maximum: 200_000 }),
  editing: Type.Boolean(),
})

export const ScriptDocumentSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  type: Type.Union([Type.Literal("script"), Type.Literal("storyboard")]),
  currentVersionId: Type.String(),
  isDefault: Type.Boolean(),
  createdAt: Type.String(),
})

export const ScriptDocumentListSchema = Type.Object({
  projectId: Type.String(),
  documents: Type.Array(ScriptDocumentSchema),
  permissions: Type.Object({
    canWrite: Type.Boolean(),
  }),
})

export const CreateScriptDocumentBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 120 }),
  type: Type.Optional(Type.Union([Type.Literal("script"), Type.Literal("storyboard")])),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const CreateScriptDocumentResponseSchema = Type.Object({
  document: ScriptDocumentSchema,
  replayed: Type.Boolean(),
})

export const ScriptWorkspaceSchema = Type.Object({
  projectId: Type.String(),
  currentAccountId: Type.String(),
  document: Type.Object({
    id: Type.String(),
    title: Type.String(),
    type: Type.Union([Type.Literal("script"), Type.Literal("storyboard")]),
    currentVersionId: Type.String(),
    isDefault: Type.Boolean(),
    createdAt: Type.String(),
  }),
  versions: Type.Array(ScriptVersionSchema),
  comments: Type.Array(ScriptCommentSchema),
  collaborators: Type.Array(ScriptCollaboratorSchema),
  permissions: Type.Object({
    canWrite: Type.Boolean(),
  }),
})

export const ScriptVersionImpactQuerySchema = Type.Object({
  documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  fromVersionId: Type.String({ minLength: 1, maxLength: 100 }),
  toVersionId: Type.String({ minLength: 1, maxLength: 100 }),
})

const ScriptImpactLineRangeSchema = Type.Object({
  startLine: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  endLine: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  text: Type.String(),
})

export const ScriptVersionImpactChangeSchema = Type.Object({
  id: Type.String(),
  kind: Type.Union([
    Type.Literal("added"),
    Type.Literal("removed"),
    Type.Literal("modified"),
  ]),
  from: ScriptImpactLineRangeSchema,
  to: ScriptImpactLineRangeSchema,
})

export const ScriptVersionImpactSchema = Type.Object({
  fromVersion: Type.Object({
    id: Type.String(),
    meta: Type.String(),
    updatedAt: Type.String(),
  }),
  toVersion: Type.Object({
    id: Type.String(),
    meta: Type.String(),
    updatedAt: Type.String(),
  }),
  generatedAt: Type.String(),
  processingStatus: Type.Union([Type.Literal("complete"), Type.Literal("limited")]),
  changes: Type.Array(ScriptVersionImpactChangeSchema),
  affectedBreakdownItems: Type.Array(BreakdownItemSchema),
  manualReviewBreakdownItems: Type.Array(BreakdownItemSchema),
  affectedShootingDayIds: Type.Array(Type.String()),
  affectedCallSheetIds: Type.Array(Type.String()),
  coverageLimitations: Type.Array(Type.String()),
})

export const UpdateScriptVersionBodySchema = Type.Object({
  documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  content: Type.String({ minLength: 1, maxLength: 200_000 }),
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateScriptVersionResponseSchema = Type.Object({
  documentId: Type.String(),
  version: ScriptVersionSchema,
  replayed: Type.Boolean(),
})

export const CreateScriptVersionBodySchema = Type.Object({
  documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  content: Type.String({ minLength: 1, maxLength: 200_000 }),
  meta: Type.String({ minLength: 1, maxLength: 120 }),
  expectedVersionId: Type.String({ minLength: 1, maxLength: 100 }),
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const CreateScriptVersionResponseSchema = Type.Object({
  documentId: Type.String(),
  version: ScriptVersionSchema,
  replayed: Type.Boolean(),
})

export const CreateScriptCommentBodySchema = Type.Object({
  documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  versionId: Type.String({ minLength: 1, maxLength: 100 }),
  parentId: Type.Optional(
    Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
  ),
  text: Type.String({ minLength: 1, maxLength: 5_000 }),
  excerpt: Type.Optional(Type.String({ maxLength: 500 })),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const CreateScriptCommentResponseSchema = Type.Object({
  documentId: Type.String(),
  comment: ScriptCommentSchema,
  replayed: Type.Boolean(),
})

export const UpdateScriptCommentBodySchema = Type.Object({
  documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  resolved: Type.Boolean(),
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateScriptCommentResponseSchema = Type.Object({
  documentId: Type.String(),
  comment: ScriptCommentSchema,
  replayed: Type.Boolean(),
})

export type ErrorResponse = Static<typeof ErrorResponseSchema>
export type ProjectParams = Static<typeof ProjectParamsSchema>
export type ScriptDocumentQuery = Static<typeof ScriptDocumentQuerySchema>
export type ScriptVersionParams = Static<typeof ScriptVersionParamsSchema>
export type ScriptCommentParams = Static<typeof ScriptCommentParamsSchema>
export type ScriptVersion = Static<typeof ScriptVersionSchema>
export type StoryboardShot = Static<typeof StoryboardShotSchema>
export type StoryboardContent = Static<typeof StoryboardContentSchema>
export type ScriptComment = Static<typeof ScriptCommentSchema>
export type ScriptCollaborator = Static<typeof ScriptCollaboratorSchema>
export type ScriptPresence = Static<typeof ScriptPresenceSchema>
export type ScriptPresenceSnapshot = Static<typeof ScriptPresenceSnapshotSchema>
export type UpdateScriptPresenceBody = Static<typeof UpdateScriptPresenceBodySchema>
export type ScriptDocument = Static<typeof ScriptDocumentSchema>
export type ScriptDocumentList = Static<typeof ScriptDocumentListSchema>
export type CreateScriptDocumentBody = Static<typeof CreateScriptDocumentBodySchema>
export type CreateScriptDocumentResponse = Static<
  typeof CreateScriptDocumentResponseSchema
>
export type ScriptWorkspace = Static<typeof ScriptWorkspaceSchema>
export type ScriptVersionImpactQuery = Static<typeof ScriptVersionImpactQuerySchema>
export type ScriptVersionImpactChange = Static<typeof ScriptVersionImpactChangeSchema>
export type ScriptVersionImpact = Static<typeof ScriptVersionImpactSchema>
export type UpdateScriptVersionBody = Static<typeof UpdateScriptVersionBodySchema>
export type UpdateScriptVersionResponse = Static<typeof UpdateScriptVersionResponseSchema>
export type CreateScriptVersionBody = Static<typeof CreateScriptVersionBodySchema>
export type CreateScriptVersionResponse = Static<typeof CreateScriptVersionResponseSchema>
export type CreateScriptCommentBody = Static<typeof CreateScriptCommentBodySchema>
export type CreateScriptCommentResponse = Static<typeof CreateScriptCommentResponseSchema>
export type UpdateScriptCommentBody = Static<typeof UpdateScriptCommentBodySchema>
export type UpdateScriptCommentResponse = Static<typeof UpdateScriptCommentResponseSchema>

export function parseStoryboardContentJson(content: string): StoryboardContent | null {
  try {
    const value: unknown = JSON.parse(content)
    if (!Value.Check(StoryboardContentSchema, value)) return null
    const ids = new Set(value.shots.map((shot) => shot.id))
    return ids.size === value.shots.length ? value : null
  } catch {
    return null
  }
}
