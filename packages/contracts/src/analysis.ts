import { type Static, Type } from "@sinclair/typebox"

export const AnalysisJobParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  jobId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const AnalysisJobStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("processing"),
  Type.Literal("awaiting_confirmation"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
])

export const AnalysisFailureStageSchema = Type.Union([
  Type.Literal("claim"),
  Type.Literal("extract"),
  Type.Literal("persist"),
])

export const AnalysisJobTriggerKindSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("script_version_updated"),
])

export const AnalysisApprovalPolicySchema = Type.Union([
  Type.Literal("manual_confirmation"),
  Type.Literal("confidence_threshold"),
])

export const AnalysisJobSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  kind: Type.Literal("script_breakdown"),
  tool: Type.Literal("deterministic_rules_v1"),
  triggerKind: AnalysisJobTriggerKindSchema,
  approvalPolicy: AnalysisApprovalPolicySchema,
  approvalThreshold: Type.Integer({ minimum: 0, maximum: 100 }),
  status: AnalysisJobStatusSchema,
  triggeredByAccountId: Type.String(),
  sourceDocumentId: Type.String(),
  sourceDocumentTitle: Type.String(),
  sourceVersionId: Type.String(),
  sourceVersionMeta: Type.String(),
  sourceRevision: Type.Integer({ minimum: 1 }),
  attempts: Type.Integer({ minimum: 0 }),
  maxAttempts: Type.Integer({ minimum: 1 }),
  candidateCount: Type.Integer({ minimum: 0 }),
  failureStage: Type.Union([AnalysisFailureStageSchema, Type.Null()]),
  lastError: Type.Union([Type.String(), Type.Null()]),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  processedAt: Type.Union([Type.String(), Type.Null()]),
  completedAt: Type.Union([Type.String(), Type.Null()]),
  cancelledAt: Type.Union([Type.String(), Type.Null()]),
})

export const AnalysisJobListSchema = Type.Object({
  items: Type.Array(AnalysisJobSchema),
})

export const CreateScriptBreakdownAnalysisBodySchema = Type.Object({
  documentId: Type.String({ minLength: 1, maxLength: 100 }),
  versionId: Type.String({ minLength: 1, maxLength: 100 }),
  sourceRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateAnalysisJobBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const AnalysisJobMutationSchema = Type.Object({
  job: AnalysisJobSchema,
  replayed: Type.Boolean(),
})

export const AnalysisWorkflowSchema = Type.Object({
  projectId: Type.String(),
  enabled: Type.Boolean(),
  sourceDocumentId: Type.Union([Type.String(), Type.Null()]),
  triggerKind: Type.Literal("script_version_updated"),
  approvalPolicy: AnalysisApprovalPolicySchema,
  approvalThreshold: Type.Integer({ minimum: 0, maximum: 100 }),
  configuredByAccountId: Type.Union([Type.String(), Type.Null()]),
  revision: Type.Integer({ minimum: 0 }),
  createdAt: Type.Union([Type.String(), Type.Null()]),
  updatedAt: Type.Union([Type.String(), Type.Null()]),
})

export const UpdateAnalysisWorkflowBodySchema = Type.Object({
  enabled: Type.Boolean(),
  sourceDocumentId: Type.Union([
    Type.String({ minLength: 1, maxLength: 100 }),
    Type.Null(),
  ]),
  approvalPolicy: AnalysisApprovalPolicySchema,
  approvalThreshold: Type.Integer({ minimum: 0, maximum: 100 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const AnalysisWorkflowMutationSchema = Type.Object({
  workflow: AnalysisWorkflowSchema,
  replayed: Type.Boolean(),
})

export type AnalysisJobParams = Static<typeof AnalysisJobParamsSchema>
export type AnalysisJobStatus = Static<typeof AnalysisJobStatusSchema>
export type AnalysisFailureStage = Static<typeof AnalysisFailureStageSchema>
export type AnalysisJobTriggerKind = Static<typeof AnalysisJobTriggerKindSchema>
export type AnalysisApprovalPolicy = Static<typeof AnalysisApprovalPolicySchema>
export type AnalysisJob = Static<typeof AnalysisJobSchema>
export type CreateScriptBreakdownAnalysisBody = Static<
  typeof CreateScriptBreakdownAnalysisBodySchema
>
export type UpdateAnalysisJobBody = Static<typeof UpdateAnalysisJobBodySchema>
export type AnalysisWorkflow = Static<typeof AnalysisWorkflowSchema>
export type UpdateAnalysisWorkflowBody = Static<typeof UpdateAnalysisWorkflowBodySchema>
