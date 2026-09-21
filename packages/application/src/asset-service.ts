import type {
  AssetFolder,
  AssetUploadInstruction,
  CreateAssetFolderBody,
  CreateAssetUploadIntentBody,
  CreateMediaAnalysisBody,
  MediaAnalysisJob,
  TeamAsset,
  UpdateAssetFolderBody,
  UpdateMediaAnalysisBody,
  UpdateTeamAssetBody,
} from "@shadowproducer/contracts"
import { accessAllows } from "./access"
import { playbackResource, playbackUrl } from "./hls-playback"
import { AppError } from "./script-service"
import type { CreateResult, TeamAccess, UpdateResult } from "./workspace-service"

const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
const MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024

type TeamCommand = { actorId: string; teamId: string }
type AssetCommand = TeamCommand & { assetId: string }
type AssetFolderCommand = TeamCommand & { folderId: string }

export type CreateAssetFolderCommand = TeamCommand & CreateAssetFolderBody
export type UpdateAssetFolderCommand = AssetFolderCommand & UpdateAssetFolderBody
export type CreateAssetUploadCommand = TeamCommand & CreateAssetUploadIntentBody
export type CompleteAssetUploadCommand = AssetCommand & {
  expectedRevision: number
  idempotencyKey: string
}
export type UpdateAssetCommand = AssetCommand & UpdateTeamAssetBody
export type CreateMediaAnalysisCommand = AssetCommand &
  Omit<CreateMediaAnalysisBody, "kind"> & {
    kind: MediaAnalysisJob["kind"]
    tool:
      | "ffmpeg_scene_v1"
      | "ffmpeg_frame_v1"
      | "openai_compatible_transcription_v1"
      | "openai_compatible_vision_v1"
    requestedTimecodeUs: number | null
    sourceAssetName: string
    sourceChecksumSha256: string
    sourceObjectKey: string
    sourceRevision: number
  }
export type UpdateMediaAnalysisCommand = AssetCommand &
  UpdateMediaAnalysisBody & { jobId: string }

type MediaAnalysisMutation = { job: MediaAnalysisJob; replayed: boolean }
type MediaAnalysisMutationFailure = "not_found" | "conflict" | "invalid_state"

export type StoredAsset = {
  item: TeamAsset
  objectKey: string | null
  thumbnailObjectKey: string | null
  reviewProxyObjectKey: string | null
}
export type AssetEmbeddingSource = "metadata" | "transcription" | "ocr" | "vision"
export type SaveAssetEmbeddingCommand = AssetCommand & {
  sourceRevision: number
  sourceKind: AssetEmbeddingSource
  sequence: number
  content: string
  inputSha256: string
  provider: string
  model: string
  embedding: number[]
}
export type AssetSemanticMatch = {
  item: TeamAsset
  score: number
  source: AssetEmbeddingSource
  excerpt: string
  provider: string
  model: string
  sequence: number
  timecodeUs: number | null
}
export type AssetSemanticSearchQuery = TeamCommand & {
  projectId?: string
  provider: string
  model: string
  embedding: number[]
  limit?: number
}
export type AssetSemanticTextSearchQuery = TeamCommand & {
  projectId?: string
  query: string
  limit?: number
}
export type AssetSemanticEmbeddingProvider = (
  input: string,
) => Promise<{ provider: string; model: string; embedding: number[] }>
export type CreatedStoredAsset = StoredAsset & { replayed: boolean }
export type MultipartUploadSession = {
  uploadId: string
  partSizeBytes: number
  totalParts: number
}
export type MultipartUploadedPart = {
  partNumber: number
  etag: string
  sizeBytes: number
}

export interface AssetRepository {
  getTeamAccess(actorId: string, teamId: string): Promise<TeamAccess | null>
  getProjectAccess(
    actorId: string,
    teamId: string,
    projectId: string,
  ): Promise<TeamAccess | null>
  listAssets(
    teamId: string,
    archived: boolean,
    query?: string,
  ): Promise<{ items: TeamAsset[]; folders: AssetFolder[] }>
  saveAssetEmbedding(command: SaveAssetEmbeddingCommand): Promise<void>
  semanticSearchAssets(
    teamId: string,
    projectId: string | undefined,
    provider: string,
    model: string,
    embedding: number[],
    limit: number,
  ): Promise<AssetSemanticMatch[]>
  createFolder(command: CreateAssetFolderCommand): Promise<CreateResult<AssetFolder>>
  updateFolder(command: UpdateAssetFolderCommand): Promise<UpdateResult<AssetFolder>>
  createUploadAsset(command: CreateAssetUploadCommand): Promise<CreatedStoredAsset>
  getAsset(teamId: string, assetId: string): Promise<StoredAsset | null>
  getMultipartUpload(assetId: string): Promise<MultipartUploadSession | null>
  saveMultipartUpload(
    assetId: string,
    upload: MultipartUploadSession,
  ): Promise<MultipartUploadSession>
  completeUpload(
    command: CompleteAssetUploadCommand,
    checksumSha256: string | null,
  ): Promise<CreateResult<TeamAsset> | UpdateResult<TeamAsset>>
  updateAsset(command: UpdateAssetCommand): Promise<UpdateResult<TeamAsset>>
  getLatestMediaAnalysis(
    teamId: string,
    assetId: string,
    kind: Exclude<MediaAnalysisJob["kind"], "frame_capture">,
  ): Promise<MediaAnalysisJob | null>
  listMediaAnalysisFrameCaptures(
    teamId: string,
    assetId: string,
  ): Promise<MediaAnalysisJob[]>
  createMediaAnalysisJob(
    command: CreateMediaAnalysisCommand,
  ): Promise<MediaAnalysisMutation>
  retryMediaAnalysisJob(
    command: UpdateMediaAnalysisCommand,
  ): Promise<MediaAnalysisMutation | { kind: MediaAnalysisMutationFailure }>
  confirmMediaAnalysisJob(
    command: UpdateMediaAnalysisCommand,
  ): Promise<MediaAnalysisMutation | { kind: MediaAnalysisMutationFailure }>
  getMediaAnalysisKeyframeObjectKey(
    teamId: string,
    assetId: string,
    jobId: string,
    shotId: string,
  ): Promise<string | null>
}

export interface AssetStorage {
  ensureReady(): Promise<void>
  createMultipartUpload(input: {
    objectKey: string
    mimeType: string
  }): Promise<{ uploadId: string }>
  listMultipartParts(input: {
    objectKey: string
    uploadId: string
  }): Promise<MultipartUploadedPart[]>
  createMultipartPartUploads(input: {
    objectKey: string
    uploadId: string
    partNumbers: number[]
  }): Promise<AssetUploadInstruction["parts"]>
  completeMultipartUpload(input: {
    objectKey: string
    uploadId: string
    partSizeBytes: number
    totalParts: number
    sizeBytes: number
    mimeType: string
  }): Promise<string>
  abortMultipartUpload(input: { objectKey: string; uploadId: string }): Promise<void>
  createDownloadUrl(
    objectKey: string,
    options?: { attachment?: boolean; expiresInSeconds?: number },
  ): Promise<string>
  readTextObject(objectKey: string): Promise<string>
}

export class AssetService {
  constructor(
    private readonly repository: AssetRepository,
    private readonly storage: AssetStorage,
    private readonly maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
    private readonly semanticEmbeddingProvider?: AssetSemanticEmbeddingProvider,
  ) {}

  async listAssets(actorId: string, teamId: string, archived = false, query?: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    return this.repository.listAssets(teamId, archived, query?.normalize("NFKC").trim())
  }

  async saveAssetEmbedding(command: SaveAssetEmbeddingCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.repository.saveAssetEmbedding({
      ...command,
      provider: this.requiredModelValue(command.provider, "向量供应商"),
      model: this.requiredModelValue(command.model, "向量模型"),
      inputSha256: this.validSha256(command.inputSha256),
      embedding: this.validEmbedding(command.embedding),
    })
  }

  async semanticSearchAssets(query: AssetSemanticSearchQuery) {
    await this.assertSemanticSearchAccess(query.actorId, query.teamId, query.projectId)
    const limit = query.limit ?? 20
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("SEMANTIC_SEARCH_LIMIT_INVALID", "语义检索条数无效", 400)
    }
    return this.repository.semanticSearchAssets(
      query.teamId,
      query.projectId,
      this.requiredModelValue(query.provider, "向量供应商"),
      this.requiredModelValue(query.model, "向量模型"),
      this.validEmbedding(query.embedding),
      limit,
    )
  }

  async semanticSearchText(query: AssetSemanticTextSearchQuery) {
    const text = query.query.normalize("NFKC").trim()
    if (!text || text.length > 200) {
      throw new AppError("SEMANTIC_SEARCH_QUERY_INVALID", "语义检索内容无效", 400)
    }
    await this.assertSemanticSearchAccess(query.actorId, query.teamId, query.projectId)
    if (!this.semanticEmbeddingProvider) {
      throw new AppError("SEMANTIC_SEARCH_UNAVAILABLE", "语义检索服务尚未配置", 503)
    }
    let embedding: Awaited<ReturnType<AssetSemanticEmbeddingProvider>>
    try {
      embedding = await this.semanticEmbeddingProvider(text)
    } catch {
      throw new AppError("SEMANTIC_SEARCH_UNAVAILABLE", "语义检索服务暂时不可用", 503)
    }
    return this.semanticSearchAssets({
      actorId: query.actorId,
      teamId: query.teamId,
      projectId: query.projectId,
      provider: embedding.provider,
      model: embedding.model,
      embedding: embedding.embedding,
      limit: query.limit,
    })
  }

  async createFolder(command: CreateAssetFolderCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.repository.createFolder(command)
  }

  async updateFolder(command: UpdateAssetFolderCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    const result = await this.repository.updateFolder(command)
    if (command.archived === false && result.kind === "not_found") {
      throw new AppError("ASSET_FOLDER_NOT_ARCHIVED", "文件夹已恢复或不存在", 404)
    }
    return this.unwrapMutation(result, "文件夹")
  }

  async createUploadIntent(command: TeamCommand & CreateAssetUploadIntentBody) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    if (!Number.isSafeInteger(command.sizeBytes) || command.sizeBytes <= 0) {
      throw new AppError("ASSET_EMPTY", "文件为空，无法导入", 400)
    }
    if (command.sizeBytes > this.maxUploadBytes) {
      throw new AppError(
        "ASSET_TOO_LARGE",
        `上传单文件上限为 ${Math.round(this.maxUploadBytes / 1024 / 1024)} MB`,
        413,
      )
    }
    if (command.projectId) {
      const access = await this.repository.getProjectAccess(
        command.actorId,
        command.teamId,
        command.projectId,
      )
      if (!access?.canRead) {
        throw new AppError("PROJECT_ACCESS_DENIED", "无权关联所选项目", 403)
      }
    }
    await this.storage.ensureReady()
    const created = await this.repository.createUploadAsset(command)
    const upload = await this.prepareMultipartUpload(created)
    return { item: created.item, replayed: created.replayed, upload }
  }

  async completeUpload(command: CompleteAssetUploadCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    const stored = await this.repository.getAsset(command.teamId, command.assetId)
    if (!stored?.objectKey) {
      throw new AppError("RESOURCE_NOT_FOUND", "待完成的素材不存在", 404)
    }
    let checksumSha256: string | null = null
    if (stored.item.status === "uploading") {
      const upload = await this.repository.getMultipartUpload(stored.item.id)
      if (!upload) {
        throw new AppError(
          "ASSET_UPLOAD_INCOMPLETE",
          "上传会话不存在，请重新选择文件后继续上传",
          409,
        )
      }
      checksumSha256 = await this.storage.completeMultipartUpload({
        objectKey: stored.objectKey,
        uploadId: upload.uploadId,
        partSizeBytes: upload.partSizeBytes,
        totalParts: upload.totalParts,
        sizeBytes: stored.item.sizeBytes,
        mimeType: stored.item.mimeType,
      })
    }
    const result = await this.repository.completeUpload(command, checksumSha256)
    if ("kind" in result) {
      return { item: this.unwrapMutation(result, "素材"), replayed: false }
    }
    return result
  }

  async updateAsset(command: UpdateAssetCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    if (command.projectId) {
      const access = await this.repository.getProjectAccess(
        command.actorId,
        command.teamId,
        command.projectId,
      )
      if (!access?.canRead) {
        throw new AppError("PROJECT_ACCESS_DENIED", "无权关联所选项目", 403)
      }
    }
    const result = await this.repository.updateAsset(command)
    if (command.archived === false && result.kind === "not_found") {
      throw new AppError("ASSET_NOT_ARCHIVED", "素材已恢复或不存在", 404)
    }
    return this.unwrapMutation(result, "素材")
  }

  async getLatestMediaAnalysis(actorId: string, teamId: string, assetId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    const [job, frameCaptures, transcription, ocr] = await Promise.all([
      this.repository.getLatestMediaAnalysis(teamId, assetId, "shot_detection"),
      this.repository.listMediaAnalysisFrameCaptures(teamId, assetId),
      this.repository.getLatestMediaAnalysis(teamId, assetId, "transcription"),
      this.repository.getLatestMediaAnalysis(teamId, assetId, "ocr"),
    ])
    return { job, frameCaptures, transcription, ocr }
  }

  async createMediaAnalysis(
    actorId: string,
    teamId: string,
    assetId: string,
    body: CreateMediaAnalysisBody,
  ) {
    await this.assertTeamAccess(actorId, teamId, "write")
    const stored = await this.repository.getAsset(teamId, assetId)
    const requestedTimecodeUs = body.timecodeUs ?? null
    if (requestedTimecodeUs !== null && body.kind && body.kind !== "shot_detection") {
      throw new AppError(
        "MEDIA_ANALYSIS_KIND_CONFLICT",
        "指定时间码截帧不能同时选择其他分析类型",
        400,
      )
    }
    const kind =
      requestedTimecodeUs !== null ? "frame_capture" : (body.kind ?? "shot_detection")
    const sourceKindAllowed =
      kind === "transcription"
        ? stored?.item.kind === "视频" || stored?.item.kind === "音频"
        : kind === "ocr"
          ? stored?.item.kind === "图片"
          : stored?.item.kind === "视频"
    if (
      !stored?.objectKey ||
      stored.item.archived ||
      stored.item.status !== "ready" ||
      !sourceKindAllowed ||
      !stored.item.checksumSha256
    ) {
      throw new AppError(
        "MEDIA_ANALYSIS_SOURCE_UNAVAILABLE",
        kind === "transcription"
          ? "请选择已完成上传的视频或音频素材"
          : kind === "ocr"
            ? "请选择已完成上传的图片素材"
            : "请选择已完成上传的视频素材",
        409,
      )
    }
    if (body.expectedRevision && stored.item.revision !== body.expectedRevision) {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "素材已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    if (stored.item.mediaStatus !== "ready") {
      throw new AppError(
        "MEDIA_ANALYSIS_SOURCE_PROCESSING",
        "基础媒体处理完成后才能开始分析",
        409,
      )
    }
    if (
      requestedTimecodeUs !== null &&
      (stored.item.durationUs === null || requestedTimecodeUs >= stored.item.durationUs)
    ) {
      throw new AppError(
        "FRAME_CAPTURE_TIMECODE_OUT_OF_RANGE",
        "截帧时间码必须位于视频时长内",
        400,
      )
    }
    return this.repository.createMediaAnalysisJob({
      actorId,
      teamId,
      assetId,
      ...body,
      kind,
      tool:
        kind === "shot_detection"
          ? "ffmpeg_scene_v1"
          : kind === "frame_capture"
            ? "ffmpeg_frame_v1"
            : kind === "transcription"
              ? "openai_compatible_transcription_v1"
              : "openai_compatible_vision_v1",
      requestedTimecodeUs,
      sourceAssetName: stored.item.name,
      sourceChecksumSha256: stored.item.checksumSha256,
      sourceObjectKey: stored.objectKey,
      sourceRevision: stored.item.revision,
    })
  }

  async retryMediaAnalysis(command: UpdateMediaAnalysisCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.unwrapMediaAnalysisMutation(
      await this.repository.retryMediaAnalysisJob(command),
      "重试",
    )
  }

  async confirmMediaAnalysis(command: UpdateMediaAnalysisCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.unwrapMediaAnalysisMutation(
      await this.repository.confirmMediaAnalysisJob(command),
      "确认",
    )
  }

  async getMediaAnalysisKeyframeUrl(
    actorId: string,
    teamId: string,
    assetId: string,
    jobId: string,
    shotId: string,
    attachment = false,
  ) {
    await this.assertTeamAccess(actorId, teamId, "read")
    const objectKey = await this.repository.getMediaAnalysisKeyframeObjectKey(
      teamId,
      assetId,
      jobId,
      shotId,
    )
    if (!objectKey) throw new AppError("RESOURCE_NOT_FOUND", "关键帧不存在", 404)
    return this.storage.createDownloadUrl(objectKey, { attachment })
  }

  async getContentUrl(actorId: string, teamId: string, assetId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    const stored = await this.repository.getAsset(teamId, assetId)
    if (!stored?.objectKey || stored.item.status !== "ready") {
      throw new AppError("RESOURCE_NOT_FOUND", "素材内容尚不可用", 404)
    }
    return this.storage.createDownloadUrl(stored.objectKey)
  }

  async getReviewContentUrl(actorId: string, teamId: string, assetId: string) {
    const key = await this.getReviewSource(actorId, teamId, assetId)
    return playbackUrl(
      this.storage,
      key,
      `/v1/teams/${encodeURIComponent(teamId)}/assets/${encodeURIComponent(assetId)}/preview`,
    )
  }

  async getReviewPlayback(
    actorId: string,
    teamId: string,
    assetId: string,
    file?: string,
  ) {
    return playbackResource(
      this.storage,
      await this.getReviewSource(actorId, teamId, assetId),
      file,
    )
  }

  private async getReviewSource(actorId: string, teamId: string, assetId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    const stored = await this.repository.getAsset(teamId, assetId)
    if (!stored?.objectKey || stored.item.status !== "ready") {
      throw new AppError("RESOURCE_NOT_FOUND", "审阅媒体尚不可用", 404)
    }
    if (stored.item.mediaStatus !== "ready" || !stored.reviewProxyObjectKey) {
      throw new AppError("MEDIA_NOT_READY", "预览文件尚未生成，请等待媒体处理完成", 409)
    }
    return stored.reviewProxyObjectKey
  }

  async getThumbnailUrl(actorId: string, teamId: string, assetId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    const stored = await this.repository.getAsset(teamId, assetId)
    if (!stored?.thumbnailObjectKey || stored.item.status !== "ready") {
      throw new AppError("RESOURCE_NOT_FOUND", "素材缩略图尚不可用", 404)
    }
    return this.storage.createDownloadUrl(stored.thumbnailObjectKey)
  }

  private async prepareMultipartUpload(
    created: CreatedStoredAsset,
  ): Promise<AssetUploadInstruction | null> {
    if (created.item.status !== "uploading" || !created.objectKey) return null
    const totalParts = Math.ceil(created.item.sizeBytes / MULTIPART_PART_SIZE_BYTES)
    let upload = await this.repository.getMultipartUpload(created.item.id)
    if (!upload) {
      const initiated = await this.storage.createMultipartUpload({
        objectKey: created.objectKey,
        mimeType: created.item.mimeType,
      })
      upload = await this.repository.saveMultipartUpload(created.item.id, {
        uploadId: initiated.uploadId,
        partSizeBytes: MULTIPART_PART_SIZE_BYTES,
        totalParts,
      })
      if (upload.uploadId !== initiated.uploadId) {
        await this.storage.abortMultipartUpload({
          objectKey: created.objectKey,
          uploadId: initiated.uploadId,
        })
      }
    }
    const uploadedParts = await this.storage.listMultipartParts({
      objectKey: created.objectKey,
      uploadId: upload.uploadId,
    })
    const uploadedNumbers = new Set(uploadedParts.map((part) => part.partNumber))
    const missingPartNumbers = Array.from(
      { length: upload.totalParts },
      (_, index) => index + 1,
    ).filter((partNumber) => !uploadedNumbers.has(partNumber))
    return {
      mode: "multipart",
      uploadId: upload.uploadId,
      partSizeBytes: upload.partSizeBytes,
      totalParts: upload.totalParts,
      uploadedParts: uploadedParts.map(({ partNumber, sizeBytes }) => ({
        partNumber,
        sizeBytes,
      })),
      parts: await this.storage.createMultipartPartUploads({
        objectKey: created.objectKey,
        uploadId: upload.uploadId,
        partNumbers: missingPartNumbers,
      }),
    }
  }

  private async assertTeamAccess(
    actorId: string,
    teamId: string,
    operation: "read" | "write",
  ) {
    const access = await this.repository.getTeamAccess(actorId, teamId)
    const allowed = accessAllows(
      access,
      operation === "read" ? "team.read" : "asset.write",
      operation,
    )
    if (!access || !allowed) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队资源库", 403)
    }
  }

  private async assertSemanticSearchAccess(
    actorId: string,
    teamId: string,
    projectId?: string,
  ) {
    await this.assertTeamAccess(actorId, teamId, "read")
    if (!projectId) return
    const access = await this.repository.getProjectAccess(actorId, teamId, projectId)
    if (!accessAllows(access, "project.read", "read")) {
      throw new AppError("PROJECT_ACCESS_DENIED", "无权检索所选项目素材", 403)
    }
  }

  private requiredModelValue(value: string, label: string) {
    const normalized = value.normalize("NFKC").trim()
    if (!normalized || normalized.length > 200) {
      throw new AppError("EMBEDDING_MODEL_INVALID", `${label}无效`, 400)
    }
    return normalized
  }

  private validSha256(value: string) {
    const normalized = value.trim().toLocaleLowerCase()
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
      throw new AppError("EMBEDDING_INPUT_INVALID", "向量输入摘要无效", 400)
    }
    return normalized
  }

  private validEmbedding(value: number[]) {
    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.length > 16_000 ||
      value.every((item) => item === 0) ||
      value.some((item) => !Number.isFinite(item))
    ) {
      throw new AppError("EMBEDDING_VECTOR_INVALID", "向量数据无效", 400)
    }
    return value
  }

  private unwrapMutation<T>(result: UpdateResult<T>, label: string) {
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", `${label}不存在或已归档`, 404)
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

  private unwrapMediaAnalysisMutation(
    result: MediaAnalysisMutation | { kind: MediaAnalysisMutationFailure },
    action: string,
  ) {
    if (!("kind" in result)) return result
    if (result.kind === "not_found") {
      throw new AppError("MEDIA_ANALYSIS_NOT_FOUND", "媒体分析任务不存在", 404)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "MEDIA_ANALYSIS_CONFLICT",
        `媒体分析任务已发生变化，请刷新后再${action}`,
        409,
      )
    }
    throw new AppError(
      "MEDIA_ANALYSIS_INVALID_STATE",
      `当前媒体分析状态不能${action}`,
      409,
    )
  }
}
