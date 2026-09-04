import { type Static, Type } from "@sinclair/typebox"

export const AssetKindSchema = Type.Union([
  Type.Literal("视频"),
  Type.Literal("图片"),
  Type.Literal("音频"),
  Type.Literal("文档"),
])

export const AssetStatusSchema = Type.Union([
  Type.Literal("uploading"),
  Type.Literal("ready"),
  Type.Literal("failed"),
])

export const AssetMediaStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("processing"),
  Type.Literal("ready"),
  Type.Literal("failed"),
])

export const MediaAnalysisStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("processing"),
  Type.Literal("awaiting_confirmation"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
  Type.Literal("expired"),
])

export const MediaAnalysisFailureStageSchema = Type.Union([
  Type.Literal("authorization"),
  Type.Literal("download"),
  Type.Literal("probe"),
  Type.Literal("prepare"),
  Type.Literal("detect"),
  Type.Literal("transcribe"),
  Type.Literal("ocr"),
  Type.Literal("keyframe"),
  Type.Literal("vision"),
  Type.Literal("persist"),
])

export const MediaAnalysisKindSchema = Type.Union([
  Type.Literal("shot_detection"),
  Type.Literal("frame_capture"),
  Type.Literal("transcription"),
  Type.Literal("ocr"),
])

export const MediaAnalysisToolSchema = Type.Union([
  Type.Literal("ffmpeg_scene_v1"),
  Type.Literal("ffmpeg_frame_v1"),
  // Read compatibility for completed pre-migration records; new inference always uses an API tool.
  Type.Literal("whisper_cpp_v1"),
  Type.Literal("tesseract_v1"),
  Type.Literal("openai_compatible_transcription_v1"),
  Type.Literal("openai_compatible_vision_v1"),
])

export const MediaAnalysisShotSchema = Type.Object({
  id: Type.String(),
  sequence: Type.Integer({ minimum: 1 }),
  startUs: Type.Integer({ minimum: 0 }),
  endUs: Type.Integer({ minimum: 1 }),
  keyframeUs: Type.Integer({ minimum: 0 }),
  keyframeAvailable: Type.Boolean(),
  description: Type.String(),
  state: Type.Union([Type.Literal("candidate"), Type.Literal("confirmed")]),
})

export const MediaAnalysisTextSegmentSchema = Type.Object({
  sequence: Type.Integer({ minimum: 1 }),
  startUs: Type.Union([
    Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    Type.Null(),
  ]),
  endUs: Type.Union([
    Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    Type.Null(),
  ]),
  text: Type.String(),
  confidence: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
})

export const MediaAnalysisJobSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  assetId: Type.String(),
  kind: MediaAnalysisKindSchema,
  tool: MediaAnalysisToolSchema,
  provider: Type.Union([Type.String(), Type.Null()]),
  triggerKind: Type.Literal("manual"),
  status: MediaAnalysisStatusSchema,
  triggeredByAccountId: Type.String(),
  sourceAssetName: Type.String(),
  sourceChecksumSha256: Type.String(),
  sourceRevision: Type.Integer({ minimum: 1 }),
  requestedTimecodeUs: Type.Union([
    Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    Type.Null(),
  ]),
  attempts: Type.Integer({ minimum: 0 }),
  maxAttempts: Type.Integer({ minimum: 1 }),
  shotCount: Type.Integer({ minimum: 0 }),
  resultText: Type.String(),
  segments: Type.Array(MediaAnalysisTextSegmentSchema),
  runtimeVersion: Type.Union([Type.String(), Type.Null()]),
  modelName: Type.Union([Type.String(), Type.Null()]),
  modelSha256: Type.Union([Type.String(), Type.Null()]),
  language: Type.Union([Type.String(), Type.Null()]),
  failureStage: Type.Union([MediaAnalysisFailureStageSchema, Type.Null()]),
  lastError: Type.Union([Type.String(), Type.Null()]),
  revision: Type.Integer({ minimum: 1 }),
  shots: Type.Array(MediaAnalysisShotSchema),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  processedAt: Type.Union([Type.String(), Type.Null()]),
  completedAt: Type.Union([Type.String(), Type.Null()]),
})

export const MediaAnalysisResponseSchema = Type.Object({
  job: Type.Union([MediaAnalysisJobSchema, Type.Null()]),
  frameCaptures: Type.Array(MediaAnalysisJobSchema),
  transcription: Type.Union([MediaAnalysisJobSchema, Type.Null()]),
  ocr: Type.Union([MediaAnalysisJobSchema, Type.Null()]),
})

export const CreateMediaAnalysisBodySchema = Type.Object({
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
  expectedRevision: Type.Optional(Type.Integer({ minimum: 1 })),
  kind: Type.Optional(
    Type.Union([
      Type.Literal("shot_detection"),
      Type.Literal("transcription"),
      Type.Literal("ocr"),
    ]),
  ),
  timecodeUs: Type.Optional(
    Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  ),
})

export const UpdateMediaAnalysisBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const MediaAnalysisMutationSchema = Type.Object({
  job: MediaAnalysisJobSchema,
  replayed: Type.Boolean(),
})

export const MediaAnalysisShotParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  assetId: Type.String({ minLength: 1, maxLength: 100 }),
  jobId: Type.String({ minLength: 1, maxLength: 100 }),
  shotId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const MediaAnalysisKeyframeQuerySchema = Type.Object({
  download: Type.Optional(Type.Literal("1")),
})

export const MediaAnalysisParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  assetId: Type.String({ minLength: 1, maxLength: 100 }),
  jobId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const AssetFolderSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  parentId: Type.Union([Type.String(), Type.Null()]),
  name: Type.String(),
  archived: Type.Boolean(),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const AssetSearchMatchSchema = Type.Object({
  source: Type.Union([
    Type.Literal("metadata"),
    Type.Literal("transcription"),
    Type.Literal("ocr"),
    Type.Literal("vision"),
  ]),
  excerpt: Type.String(),
})

export const TeamAssetSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  projectId: Type.Union([Type.String(), Type.Null()]),
  projectName: Type.Union([Type.String(), Type.Null()]),
  folderId: Type.Union([Type.String(), Type.Null()]),
  folderName: Type.Union([Type.String(), Type.Null()]),
  name: Type.String(),
  kind: AssetKindSchema,
  mimeType: Type.String(),
  sizeBytes: Type.Integer({ minimum: 0 }),
  checksumSha256: Type.Union([Type.String(), Type.Null()]),
  status: AssetStatusSchema,
  favorite: Type.Boolean(),
  rating: Type.Integer({ minimum: 0, maximum: 5 }),
  tags: Type.Array(Type.String()),
  note: Type.String(),
  ownerName: Type.String(),
  thumbnailUrl: Type.Union([Type.String(), Type.Null()]),
  mediaStatus: Type.Union([AssetMediaStatusSchema, Type.Null()]),
  mediaError: Type.Union([Type.String(), Type.Null()]),
  durationUs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  width: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  height: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  frameRateNumerator: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  frameRateDenominator: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  videoCodec: Type.Union([Type.String(), Type.Null()]),
  audioCodec: Type.Union([Type.String(), Type.Null()]),
  formatName: Type.Union([Type.String(), Type.Null()]),
  rotationDegrees: Type.Union([Type.Integer(), Type.Null()]),
  variableFrameRate: Type.Union([Type.Boolean(), Type.Null()]),
  reviewProxyReady: Type.Boolean(),
  searchMatches: Type.Array(AssetSearchMatchSchema),
  archived: Type.Boolean(),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const TeamAssetListQuerySchema = Type.Object({
  archived: Type.Optional(Type.Literal("1")),
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
})

export const TeamAssetListSchema = Type.Object({
  items: Type.Array(TeamAssetSchema),
  folders: Type.Array(AssetFolderSchema),
})

export const AssetSemanticSearchBodySchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 200 }),
  projectId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
})

export const AssetSemanticSearchMatchSchema = Type.Object({
  item: TeamAssetSchema,
  score: Type.Number({ minimum: -1, maximum: 1 }),
  source: AssetSearchMatchSchema.properties.source,
  excerpt: Type.String(),
  sequence: Type.Integer({ minimum: 0 }),
  timecodeUs: Type.Union([
    Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    Type.Null(),
  ]),
})

export const AssetSemanticSearchResponseSchema = Type.Object({
  items: Type.Array(AssetSemanticSearchMatchSchema),
})

export const TeamAssetMutationSchema = Type.Object({
  item: TeamAssetSchema,
  replayed: Type.Boolean(),
})

export const AssetContentUrlSchema = Type.Object({
  url: Type.String({ minLength: 1 }),
})

export const AssetFolderMutationSchema = Type.Object({
  item: AssetFolderSchema,
  replayed: Type.Boolean(),
})

export const TeamAssetParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  assetId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const AssetFolderParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  folderId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const CreateAssetFolderBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 160 }),
  parentId: Type.Optional(
    Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
  ),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateAssetFolderBodySchema = Type.Object({
  archived: Type.Boolean(),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const CreateAssetUploadIntentBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 300 }),
  kind: AssetKindSchema,
  mimeType: Type.String({ minLength: 1, maxLength: 200 }),
  sizeBytes: Type.Integer({ minimum: 1 }),
  projectId: Type.Optional(
    Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
  ),
  folderId: Type.Optional(
    Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
  ),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const AssetUploadPartSchema = Type.Object({
  partNumber: Type.Integer({ minimum: 1, maximum: 10_000 }),
  method: Type.Literal("PUT"),
  url: Type.String(),
  headers: Type.Record(Type.String(), Type.String()),
  expiresAt: Type.String(),
})

export const AssetUploadedPartSchema = Type.Object({
  partNumber: Type.Integer({ minimum: 1, maximum: 10_000 }),
  sizeBytes: Type.Integer({ minimum: 1 }),
})

export const AssetUploadInstructionSchema = Type.Object({
  mode: Type.Literal("multipart"),
  uploadId: Type.String({ minLength: 1 }),
  partSizeBytes: Type.Integer({ minimum: 5 * 1024 * 1024 }),
  totalParts: Type.Integer({ minimum: 1, maximum: 10_000 }),
  uploadedParts: Type.Array(AssetUploadedPartSchema),
  parts: Type.Array(AssetUploadPartSchema),
})

export const AssetUploadIntentResponseSchema = Type.Object({
  item: TeamAssetSchema,
  replayed: Type.Boolean(),
  upload: Type.Union([AssetUploadInstructionSchema, Type.Null()]),
})

export const CompleteAssetUploadBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateTeamAssetBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    projectId: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
    ),
    folderId: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
    ),
    favorite: Type.Optional(Type.Boolean()),
    rating: Type.Optional(Type.Integer({ minimum: 0, maximum: 5 })),
    tags: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 40 }),
    ),
    note: Type.Optional(Type.String({ maxLength: 20_000 })),
    archived: Type.Optional(Type.Boolean()),
    expectedRevision: Type.Integer({ minimum: 1 }),
  },
  { minProperties: 2 },
)

export type AssetKind = Static<typeof AssetKindSchema>
export type AssetStatus = Static<typeof AssetStatusSchema>
export type AssetMediaStatus = Static<typeof AssetMediaStatusSchema>
export type MediaAnalysisStatus = Static<typeof MediaAnalysisStatusSchema>
export type MediaAnalysisFailureStage = Static<typeof MediaAnalysisFailureStageSchema>
export type MediaAnalysisKind = Static<typeof MediaAnalysisKindSchema>
export type MediaAnalysisTool = Static<typeof MediaAnalysisToolSchema>
export type MediaAnalysisShot = Static<typeof MediaAnalysisShotSchema>
export type MediaAnalysisTextSegment = Static<typeof MediaAnalysisTextSegmentSchema>
export type MediaAnalysisJob = Static<typeof MediaAnalysisJobSchema>
export type MediaAnalysisResponse = Static<typeof MediaAnalysisResponseSchema>
export type CreateMediaAnalysisBody = Static<typeof CreateMediaAnalysisBodySchema>
export type UpdateMediaAnalysisBody = Static<typeof UpdateMediaAnalysisBodySchema>
export type MediaAnalysisShotParams = Static<typeof MediaAnalysisShotParamsSchema>
export type MediaAnalysisKeyframeQuery = Static<typeof MediaAnalysisKeyframeQuerySchema>
export type MediaAnalysisParams = Static<typeof MediaAnalysisParamsSchema>
export type AssetFolder = Static<typeof AssetFolderSchema>
export type AssetSearchMatch = Static<typeof AssetSearchMatchSchema>
export type TeamAsset = Static<typeof TeamAssetSchema>
export type TeamAssetListQuery = Static<typeof TeamAssetListQuerySchema>
export type AssetSemanticSearchBody = Static<typeof AssetSemanticSearchBodySchema>
export type AssetSemanticSearchMatch = Static<typeof AssetSemanticSearchMatchSchema>
export type AssetSemanticSearchResponse = Static<typeof AssetSemanticSearchResponseSchema>
export type TeamAssetParams = Static<typeof TeamAssetParamsSchema>
export type AssetFolderParams = Static<typeof AssetFolderParamsSchema>
export type CreateAssetFolderBody = Static<typeof CreateAssetFolderBodySchema>
export type UpdateAssetFolderBody = Static<typeof UpdateAssetFolderBodySchema>
export type CreateAssetUploadIntentBody = Static<typeof CreateAssetUploadIntentBodySchema>
export type AssetUploadInstruction = Static<typeof AssetUploadInstructionSchema>
export type AssetUploadIntentResponse = Static<typeof AssetUploadIntentResponseSchema>
export type AssetContentUrl = Static<typeof AssetContentUrlSchema>
export type CompleteAssetUploadBody = Static<typeof CompleteAssetUploadBodySchema>
export type UpdateTeamAssetBody = Static<typeof UpdateTeamAssetBodySchema>
