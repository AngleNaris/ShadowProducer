import type {
  AssetRepository,
  AssetSemanticEmbeddingProvider,
  AssetStorage,
  CompleteAssetUploadCommand,
  CreateAssetFolderCommand,
  CreateAssetUploadCommand,
  CreateMediaAnalysisCommand,
  SaveAssetEmbeddingCommand,
  ScriptRepository,
  StoredAsset,
  UpdateAssetCommand,
  UpdateAssetFolderCommand,
  UpdateMediaAnalysisCommand,
  UpdateResult,
} from "@shadowproducer/application"
import { AppError, AssetService, ScriptService } from "@shadowproducer/application"
import type {
  AssetFolder,
  AssetSearchMatch,
  MediaAnalysisJob,
  TeamAsset,
} from "@shadowproducer/contracts"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"

const now = "2026-08-28T08:00:00.000Z"

class MemoryAssetRepository implements AssetRepository {
  readonly folders: AssetFolder[] = []
  readonly assets: StoredAsset[] = []
  readonly embeddings: SaveAssetEmbeddingCommand[] = []
  readonly mediaAnalysisJobs: MediaAnalysisJob[] = []
  readonly semanticSearches: Array<{
    teamId: string
    projectId: string | undefined
    provider: string
    model: string
    embedding: number[]
    limit: number
  }> = []
  private readonly folderReceipts = new Map<string, AssetFolder>()
  private readonly uploadReceipts = new Map<string, TeamAsset>()
  private readonly completeReceipts = new Map<string, TeamAsset>()
  private readonly multipartUploads = new Map<
    string,
    { uploadId: string; partSizeBytes: number; totalParts: number }
  >()

  async getTeamAccess(actorId: string, teamId: string) {
    if (teamId !== "north") return null
    if (actorId === "account-fanxing") return { canRead: true, canWrite: true }
    if (actorId === "account-viewer") return { canRead: true, canWrite: false }
    return null
  }

  async getProjectAccess(actorId: string, teamId: string, projectId: string) {
    if (teamId !== "north" || projectId !== "winter-coffee") return null
    return this.getTeamAccess(actorId, teamId)
  }

  async listAssets(teamId: string, archived: boolean, query?: string) {
    const normalizedQuery = query?.toLowerCase()
    return {
      items: structuredClone(
        this.assets
          .map((asset) => asset.item)
          .filter((asset) => asset.teamId === teamId && asset.archived === archived)
          .map((asset) => {
            if (!normalizedQuery) return { ...asset, searchMatches: [] }
            const matches: AssetSearchMatch[] = []
            const metadata = `${asset.name}${asset.note}${asset.kind}${asset.tags.join("")}`
            if (metadata.toLowerCase().includes(normalizedQuery)) {
              matches.push({ source: "metadata", excerpt: asset.name })
            }
            for (const job of this.mediaAnalysisJobs) {
              if (
                job.assetId === asset.id &&
                job.status === "completed" &&
                job.sourceRevision === asset.revision &&
                job.resultText.toLowerCase().includes(normalizedQuery) &&
                (job.kind === "transcription" ||
                  job.kind === "ocr" ||
                  job.kind === "shot_detection")
              ) {
                matches.push({
                  source: job.kind === "shot_detection" ? "vision" : job.kind,
                  excerpt: job.resultText,
                })
              }
            }
            return { ...asset, searchMatches: matches }
          })
          .filter((asset) => !normalizedQuery || asset.searchMatches.length > 0),
      ),
      folders: structuredClone(
        this.folders.filter(
          (folder) => folder.teamId === teamId && folder.archived === archived,
        ),
      ),
    }
  }

  async saveAssetEmbedding(command: SaveAssetEmbeddingCommand) {
    this.embeddings.push(structuredClone(command))
  }

  async semanticSearchAssets(
    teamId: string,
    projectId: string | undefined,
    provider: string,
    model: string,
    embedding: number[],
    limit: number,
  ) {
    this.semanticSearches.push({
      teamId,
      projectId,
      provider,
      model,
      embedding: [...embedding],
      limit,
    })
    return []
  }

  async createFolder(command: CreateAssetFolderCommand) {
    const replay = this.folderReceipts.get(command.idempotencyKey)
    if (replay) return { item: structuredClone(replay), replayed: true }
    const item: AssetFolder = {
      id: `folder-${this.folders.length + 1}`,
      teamId: command.teamId,
      parentId: command.parentId ?? null,
      name: command.name,
      archived: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    }
    this.folders.push(item)
    this.folderReceipts.set(command.idempotencyKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async updateFolder(
    command: UpdateAssetFolderCommand,
  ): Promise<UpdateResult<AssetFolder>> {
    const folder = this.folders.find(
      (item) => item.id === command.folderId && item.teamId === command.teamId,
    )
    const restoring = command.archived === false
    if (!folder || folder.archived !== restoring) return { kind: "not_found" }
    if (folder.revision !== command.expectedRevision) return { kind: "conflict" }
    if (
      command.archived &&
      (this.assets.some((asset) => asset.item.folderId === folder.id) ||
        this.folders.some((item) => item.parentId === folder.id))
    ) {
      throw new AppError("ASSET_FOLDER_NOT_EMPTY", "仅空文件夹可以移入回收站", 409)
    }
    if (
      !command.archived &&
      this.folders.some(
        (item) =>
          item.id !== folder.id &&
          item.teamId === folder.teamId &&
          item.parentId === folder.parentId &&
          item.name.toLocaleLowerCase() === folder.name.toLocaleLowerCase() &&
          !item.archived,
      )
    ) {
      throw new AppError("ASSET_FOLDER_EXISTS", "原位置已存在同名文件夹", 409)
    }
    folder.archived = command.archived
    folder.revision += 1
    folder.updatedAt = now
    return { kind: "ok", item: structuredClone(folder) }
  }

  async createUploadAsset(command: CreateAssetUploadCommand) {
    const replay = this.uploadReceipts.get(command.idempotencyKey)
    if (replay) {
      const stored = this.assets.find((asset) => asset.item.id === replay.id)
      if (!stored) throw new Error("Missing replayed asset")
      return { ...structuredClone(stored), replayed: true }
    }
    const item: TeamAsset = {
      id: `asset-${this.assets.length + 1}`,
      teamId: command.teamId,
      projectId: command.projectId ?? null,
      projectName: command.projectId === "winter-coffee" ? "冬夜咖啡" : null,
      folderId: command.folderId ?? null,
      folderName: null,
      name: command.name,
      kind: command.kind,
      mimeType: command.mimeType,
      sizeBytes: command.sizeBytes,
      checksumSha256: null,
      status: "uploading",
      favorite: false,
      rating: 0,
      tags: [],
      note: "",
      ownerName: "繁星",
      thumbnailUrl: null,
      mediaStatus: null,
      mediaError: null,
      durationUs: null,
      width: null,
      height: null,
      frameRateNumerator: null,
      frameRateDenominator: null,
      videoCodec: null,
      audioCodec: null,
      formatName: null,
      rotationDegrees: null,
      variableFrameRate: null,
      reviewProxyReady: false,
      searchMatches: [],
      archived: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    }
    const stored: StoredAsset = {
      item,
      objectKey: `teams/north/originals/${item.id}`,
      thumbnailObjectKey: null,
      reviewProxyObjectKey: null,
    }
    this.assets.push(stored)
    this.uploadReceipts.set(command.idempotencyKey, item)
    return { ...structuredClone(stored), replayed: false }
  }

  async getAsset(teamId: string, assetId: string) {
    const stored = this.assets.find(
      (asset) =>
        asset.item.id === assetId && asset.item.teamId === teamId && !asset.item.archived,
    )
    return stored ? structuredClone(stored) : null
  }

  async getMultipartUpload(assetId: string) {
    return structuredClone(this.multipartUploads.get(assetId) ?? null)
  }

  async saveMultipartUpload(
    assetId: string,
    upload: { uploadId: string; partSizeBytes: number; totalParts: number },
  ) {
    const existing = this.multipartUploads.get(assetId)
    if (existing) return structuredClone(existing)
    this.multipartUploads.set(assetId, structuredClone(upload))
    return structuredClone(upload)
  }

  async completeUpload(
    command: CompleteAssetUploadCommand,
    checksumSha256: string | null,
  ) {
    const replay = this.completeReceipts.get(command.idempotencyKey)
    if (replay) return { item: structuredClone(replay), replayed: true }
    const stored = this.assets.find((asset) => asset.item.id === command.assetId)
    if (!stored) return { kind: "not_found" } as const
    if (stored.item.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    stored.item.status = "ready"
    stored.item.checksumSha256 = checksumSha256
    stored.item.revision += 1
    this.completeReceipts.set(command.idempotencyKey, stored.item)
    return { item: structuredClone(stored.item), replayed: false }
  }

  async updateAsset(command: UpdateAssetCommand): Promise<UpdateResult<TeamAsset>> {
    const stored = this.assets.find((asset) => asset.item.id === command.assetId)
    const restoring = command.archived === false
    if (!stored || stored.item.archived !== restoring) return { kind: "not_found" }
    if (stored.item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (command.favorite !== undefined) stored.item.favorite = command.favorite
    if (command.rating !== undefined) stored.item.rating = command.rating
    if (command.tags !== undefined) stored.item.tags = [...command.tags]
    if (command.note !== undefined) stored.item.note = command.note
    if (command.folderId !== undefined) stored.item.folderId = command.folderId
    if (command.projectId !== undefined) stored.item.projectId = command.projectId
    if (command.archived !== undefined) stored.item.archived = command.archived
    stored.item.revision += 1
    return { kind: "ok", item: structuredClone(stored.item) }
  }

  async getLatestMediaAnalysis(
    teamId: string,
    assetId: string,
    kind: Exclude<MediaAnalysisJob["kind"], "frame_capture">,
  ) {
    return structuredClone(
      [...this.mediaAnalysisJobs]
        .reverse()
        .find(
          (job) => job.teamId === teamId && job.assetId === assetId && job.kind === kind,
        ) ?? null,
    )
  }

  async listMediaAnalysisFrameCaptures(teamId: string, assetId: string) {
    return structuredClone(
      this.mediaAnalysisJobs
        .filter(
          (job) =>
            job.teamId === teamId &&
            job.assetId === assetId &&
            job.kind === "frame_capture",
        )
        .reverse(),
    )
  }

  async createMediaAnalysisJob(command: CreateMediaAnalysisCommand) {
    const active = this.mediaAnalysisJobs.find(
      (job) =>
        job.assetId === command.assetId &&
        job.kind === command.kind &&
        (job.status === "queued" || job.status === "processing"),
    )
    if (active) return { job: structuredClone(active), replayed: true }
    const job: MediaAnalysisJob = {
      id: `analysis-${this.mediaAnalysisJobs.length + 1}`,
      teamId: command.teamId,
      assetId: command.assetId,
      kind: command.kind,
      tool: command.tool,
      provider: null,
      triggerKind: "manual",
      status: "queued",
      triggeredByAccountId: command.actorId,
      sourceAssetName: command.sourceAssetName,
      sourceChecksumSha256: command.sourceChecksumSha256,
      sourceRevision: command.sourceRevision,
      requestedTimecodeUs: command.requestedTimecodeUs,
      attempts: 0,
      maxAttempts: 3,
      shotCount: 0,
      resultText: "",
      segments: [],
      runtimeVersion: null,
      modelName: null,
      modelSha256: null,
      language: null,
      failureStage: null,
      lastError: null,
      revision: 1,
      shots: [],
      createdAt: now,
      updatedAt: now,
      processedAt: null,
      completedAt: null,
    }
    this.mediaAnalysisJobs.push(job)
    return { job: structuredClone(job), replayed: false }
  }

  async retryMediaAnalysisJob(command: UpdateMediaAnalysisCommand) {
    const job = this.mediaAnalysisJobs.find(
      (item) => item.id === command.jobId && item.assetId === command.assetId,
    )
    if (!job) return { kind: "not_found" as const }
    if (job.revision !== command.expectedRevision) return { kind: "conflict" as const }
    if (job.status !== "failed") return { kind: "invalid_state" as const }
    job.status = "queued"
    job.failureStage = null
    job.lastError = null
    job.revision += 1
    return { job: structuredClone(job), replayed: false }
  }

  async confirmMediaAnalysisJob(command: UpdateMediaAnalysisCommand) {
    const job = this.mediaAnalysisJobs.find(
      (item) => item.id === command.jobId && item.assetId === command.assetId,
    )
    if (!job) return { kind: "not_found" as const }
    if (job.revision !== command.expectedRevision) return { kind: "conflict" as const }
    if (job.status !== "awaiting_confirmation") {
      return { kind: "invalid_state" as const }
    }
    job.status = "completed"
    job.completedAt = now
    job.revision += 1
    job.shots = job.shots.map((shot) => ({ ...shot, state: "confirmed" }))
    return { job: structuredClone(job), replayed: false }
  }

  async getMediaAnalysisKeyframeObjectKey(
    teamId: string,
    assetId: string,
    jobId: string,
    shotId: string,
  ) {
    return this.mediaAnalysisJobs.some(
      (job) =>
        job.teamId === teamId &&
        job.assetId === assetId &&
        job.id === jobId &&
        job.shots.some((shot) => shot.id === shotId),
    )
      ? "derived/keyframe.jpg"
      : null
  }
}

class MemoryAssetStorage implements AssetStorage {
  verified = false
  failReadiness = false
  createdUploads = 0
  lastDownloadOptions: { attachment?: boolean } | undefined

  async ensureReady() {
    if (this.failReadiness) throw new Error("Object storage unavailable")
  }

  async createMultipartUpload() {
    this.createdUploads += 1
    return { uploadId: "multipart-upload-1" }
  }

  async listMultipartParts() {
    return []
  }

  async createMultipartPartUploads(input: { partNumbers: number[] }) {
    return input.partNumbers.map((partNumber) => ({
      partNumber,
      method: "PUT" as const,
      url: `http://storage.test/upload/${partNumber}`,
      headers: {},
      expiresAt: now,
    }))
  }

  async completeMultipartUpload() {
    this.verified = true
    return "a".repeat(64)
  }

  async abortMultipartUpload() {
    return undefined
  }

  async createDownloadUrl(_objectKey: string, options?: { attachment?: boolean }) {
    this.lastDownloadOptions = options
    return "http://storage.test/download"
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
const writerHeaders = { "x-shadow-account-id": "account-fanxing" }

async function createTestApp(
  maxUploadBytes = 1024,
  storage = new MemoryAssetStorage(),
  semanticEmbeddingProvider?: AssetSemanticEmbeddingProvider,
) {
  const repository = new MemoryAssetRepository()
  const assetService = new AssetService(
    repository,
    storage,
    maxUploadBytes,
    semanticEmbeddingProvider,
  )
  const app = await buildApp({
    scriptService: new ScriptService(unusedScriptRepository),
    assetService,
    logger: false,
  })
  apps.push(app)
  return { app, repository, storage, assetService }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("asset embedding service", () => {
  const validEmbedding = {
    actorId: "account-fanxing",
    teamId: "north",
    assetId: "asset-1",
    sourceRevision: 1,
    sourceKind: "metadata" as const,
    sequence: 0,
    content: "车站夜戏",
    inputSha256: "A".repeat(64),
    provider: " compatible-api ",
    model: " embedding-model ",
    embedding: [1, 0],
  }

  it("normalizes provider metadata and enforces actor scope", async () => {
    const { assetService, repository } = await createTestApp()

    await assetService.saveAssetEmbedding(validEmbedding)
    await assetService.semanticSearchAssets({
      actorId: "account-fanxing",
      teamId: "north",
      projectId: "winter-coffee",
      provider: " compatible-api ",
      model: " embedding-model ",
      embedding: [1, 0],
      limit: 5,
    })

    expect(repository.embeddings[0]).toMatchObject({
      provider: "compatible-api",
      model: "embedding-model",
      inputSha256: "a".repeat(64),
    })
    expect(repository.semanticSearches[0]).toEqual({
      teamId: "north",
      projectId: "winter-coffee",
      provider: "compatible-api",
      model: "embedding-model",
      embedding: [1, 0],
      limit: 5,
    })
    await expect(
      assetService.saveAssetEmbedding({
        ...validEmbedding,
        actorId: "account-viewer",
      }),
    ).rejects.toMatchObject({ code: "TEAM_ACCESS_DENIED" })
    await expect(
      assetService.semanticSearchAssets({
        actorId: "account-fanxing",
        teamId: "north",
        projectId: "unknown-project",
        provider: "compatible-api",
        model: "embedding-model",
        embedding: [1, 0],
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED" })
  })

  it.each([
    { embedding: [] },
    { embedding: [0, 0] },
    { embedding: [Number.NaN] },
    { embedding: [Number.POSITIVE_INFINITY] },
  ])("rejects invalid semantic vectors: $embedding", async ({ embedding }) => {
    const { assetService } = await createTestApp()
    await expect(
      assetService.semanticSearchAssets({
        actorId: "account-fanxing",
        teamId: "north",
        provider: "compatible-api",
        model: "embedding-model",
        embedding,
      }),
    ).rejects.toMatchObject({ code: "EMBEDDING_VECTOR_INVALID" })
  })
})

describe("team asset API", () => {
  it("enforces team read and write access", async () => {
    const { app } = await createTestApp()
    const missingActor = await app.inject({
      method: "GET",
      url: "/v1/teams/north/assets",
    })
    const viewerWrite = await app.inject({
      method: "POST",
      url: "/v1/teams/north/asset-folders",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { name: "只读目录", idempotencyKey: "folder-command-viewer" },
    })

    expect(missingActor.statusCode).toBe(401)
    expect(viewerWrite.statusCode).toBe(403)
  })

  it("generates query embeddings after scope checks and exposes semantic search", async () => {
    const providerInputs: string[] = []
    const provider: AssetSemanticEmbeddingProvider = async (input) => {
      providerInputs.push(input)
      return {
        provider: "compatible-api",
        model: "embedding-model",
        embedding: [0.25, 0.75],
      }
    }
    const { app, repository } = await createTestApp(
      1024,
      new MemoryAssetStorage(),
      provider,
    )
    const response = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/semantic-search",
      headers: writerHeaders,
      payload: {
        query: "  车站的雨夜台词  ",
        projectId: "winter-coffee",
        limit: 8,
      },
    })
    const denied = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/semantic-search",
      headers: writerHeaders,
      payload: { query: "不应调用供应商", projectId: "unknown-project" },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ items: [] })
    expect(providerInputs).toEqual(["车站的雨夜台词"])
    expect(repository.semanticSearches).toEqual([
      {
        teamId: "north",
        projectId: "winter-coffee",
        provider: "compatible-api",
        model: "embedding-model",
        embedding: [0.25, 0.75],
        limit: 8,
      },
    ])
    expect(denied.statusCode).toBe(403)
    expect(providerInputs).toHaveLength(1)
  })

  it("reports semantic search as unavailable without provider configuration", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/semantic-search",
      headers: writerHeaders,
      payload: { query: "车站雨夜" },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ code: "SEMANTIC_SEARCH_UNAVAILABLE" })
  })

  it("creates folders idempotently", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/teams/north/asset-folders",
      headers: writerHeaders,
      payload: { name: "收件箱", idempotencyKey: "folder-command-001" },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)

    expect(first.statusCode).toBe(201)
    expect(first.json().replayed).toBe(false)
    expect(replay.json().replayed).toBe(true)
    expect(repository.folders).toHaveLength(1)
  })

  it("archives and restores only empty folders with revision and permission checks", async () => {
    const { app } = await createTestApp()
    const folderResponse = await app.inject({
      method: "POST",
      url: "/v1/teams/north/asset-folders",
      headers: writerHeaders,
      payload: { name: "待归档", idempotencyKey: "folder-trash-command-001" },
    })
    const folder = folderResponse.json().item
    const uploadResponse = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "目录内素材.png",
        kind: "图片",
        mimeType: "image/png",
        sizeBytes: 128,
        folderId: folder.id,
        idempotencyKey: "folder-trash-asset-001",
      },
    })
    const asset = uploadResponse.json().item
    const nonEmpty = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/asset-folders/${folder.id}`,
      headers: writerHeaders,
      payload: { archived: true, expectedRevision: folder.revision },
    })
    await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/assets/${asset.id}`,
      headers: writerHeaders,
      payload: { folderId: null, expectedRevision: asset.revision },
    })
    const viewerArchive = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/asset-folders/${folder.id}`,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { archived: true, expectedRevision: folder.revision },
    })
    const archived = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/asset-folders/${folder.id}`,
      headers: writerHeaders,
      payload: { archived: true, expectedRevision: folder.revision },
    })
    const activeList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/assets",
      headers: writerHeaders,
    })
    const trashList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/assets?archived=1",
      headers: writerHeaders,
    })
    const staleRestore = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/asset-folders/${folder.id}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: folder.revision },
    })
    const restored = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/asset-folders/${folder.id}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: archived.json().revision },
    })
    const repeatedRestore = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/asset-folders/${folder.id}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: archived.json().revision },
    })

    expect(nonEmpty.statusCode).toBe(409)
    expect(nonEmpty.json().code).toBe("ASSET_FOLDER_NOT_EMPTY")
    expect(viewerArchive.statusCode).toBe(403)
    expect(archived.json()).toMatchObject({ archived: true, revision: 2 })
    expect(activeList.json().folders).toEqual([])
    expect(trashList.json().folders).toEqual([
      expect.objectContaining({ id: folder.id, archived: true, revision: 2 }),
    ])
    expect(staleRestore.statusCode).toBe(409)
    expect(restored.json()).toMatchObject({ archived: false, revision: 3 })
    expect(repeatedRestore.statusCode).toBe(404)
    expect(repeatedRestore.json().code).toBe("ASSET_FOLDER_NOT_ARCHIVED")
  })

  it("creates and completes an upload through the storage boundary", async () => {
    const { app, storage } = await createTestApp()
    const intent = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "验收图片.png",
        kind: "图片",
        mimeType: "image/png",
        sizeBytes: 256,
        projectId: "winter-coffee",
        idempotencyKey: "asset-upload-intent-001",
      },
    })
    const created = intent.json()
    const completed = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${created.item.id}/complete`,
      headers: writerHeaders,
      payload: {
        expectedRevision: created.item.revision,
        idempotencyKey: "asset-upload-complete-001",
      },
    })

    expect(intent.statusCode).toBe(201)
    expect(created.upload.mode).toBe("multipart")
    expect(created.upload.parts).toHaveLength(1)
    expect(completed.statusCode).toBe(200)
    expect(completed.json().item.status).toBe("ready")
    expect(completed.json().item.checksumSha256).toBe("a".repeat(64))
    expect(storage.verified).toBe(true)
  })

  it("reuses a multipart upload session when an intent is replayed", async () => {
    const { app, storage } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "可恢复上传.png",
        kind: "图片",
        mimeType: "image/png",
        sizeBytes: 256,
        idempotencyKey: "asset-upload-resume-001",
      },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)

    expect(first.statusCode).toBe(201)
    expect(replay.statusCode).toBe(201)
    expect(replay.json().replayed).toBe(true)
    expect(replay.json().upload.uploadId).toBe(first.json().upload.uploadId)
    expect(storage.createdUploads).toBe(1)
  })

  it("returns an authenticated short-lived URL for ready asset content", async () => {
    const { app } = await createTestApp()
    const intent = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "审片源.mp4",
        kind: "视频",
        mimeType: "video/mp4",
        sizeBytes: 256,
        projectId: "winter-coffee",
        idempotencyKey: "asset-playback-intent-001",
      },
    })
    const item = intent.json().item
    await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/complete`,
      headers: writerHeaders,
      payload: {
        expectedRevision: item.revision,
        idempotencyKey: "asset-playback-complete-001",
      },
    })

    const response = await app.inject({
      method: "GET",
      url: `/v1/teams/north/assets/${item.id}/content-url`,
      headers: writerHeaders,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ url: "http://storage.test/download" })
  })

  it("creates, reads, confirms, and protects a media analysis task", async () => {
    const { app, repository, storage } = await createTestApp()
    const intent = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "镜头分析.mp4",
        kind: "视频",
        mimeType: "video/mp4",
        sizeBytes: 256,
        idempotencyKey: "media-analysis-upload-001",
      },
    })
    const item = intent.json().item
    await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/complete`,
      headers: writerHeaders,
      payload: {
        expectedRevision: item.revision,
        idempotencyKey: "media-analysis-complete-001",
      },
    })
    const stored = repository.assets.find((asset) => asset.item.id === item.id)
    if (!stored) throw new Error("Missing completed video")
    stored.item.mediaStatus = "ready"
    stored.item.durationUs = 2_000_000

    const stale = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/media-analysis`,
      headers: writerHeaders,
      payload: {
        idempotencyKey: "media-analysis-stale-001",
        expectedRevision: stored.item.revision + 1,
      },
    })
    const viewer = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/media-analysis`,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { idempotencyKey: "media-analysis-viewer-001" },
    })
    const created = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/media-analysis`,
      headers: writerHeaders,
      payload: { idempotencyKey: "media-analysis-create-001" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/media-analysis`,
      headers: writerHeaders,
      payload: { idempotencyKey: "media-analysis-create-002" },
    })

    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
    expect(viewer.statusCode).toBe(403)
    expect(created.statusCode).toBe(201)
    expect(created.json().job).toMatchObject({
      assetId: item.id,
      status: "queued",
      tool: "ffmpeg_scene_v1",
    })
    expect(replay.json()).toMatchObject({ replayed: true })
    expect(repository.mediaAnalysisJobs).toHaveLength(1)

    const job = repository.mediaAnalysisJobs[0]
    if (!job) throw new Error("Missing media analysis job")
    job.status = "awaiting_confirmation"
    job.revision = 2
    job.shotCount = 1
    job.provider = "compatible-api"
    job.modelName = "vision-model"
    job.resultText = "雨夜车站内，一名演员站在列车旁等待开拍"
    job.segments = [
      {
        sequence: 1,
        startUs: 0,
        endUs: 1_000_000,
        text: job.resultText,
        confidence: null,
      },
    ]
    job.shots = [
      {
        id: "shot-1",
        sequence: 1,
        startUs: 0,
        endUs: 1_000_000,
        keyframeUs: 500_000,
        keyframeAvailable: true,
        description: job.resultText,
        state: "candidate",
      },
    ]
    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/media-analysis/${job.id}/confirm`,
      headers: writerHeaders,
      payload: {
        expectedRevision: job.revision,
        idempotencyKey: "media-analysis-confirm-001",
      },
    })
    const read = await app.inject({
      method: "GET",
      url: `/v1/teams/north/assets/${item.id}/media-analysis`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(confirmed.json().job).toMatchObject({
      status: "completed",
      shots: [{ state: "confirmed" }],
    })
    expect(read.statusCode).toBe(200)
    expect(read.json().job.status).toBe("completed")
    expect(read.json().frameCaptures).toEqual([])
    const visionSearch = await app.inject({
      method: "GET",
      url: "/v1/teams/north/assets?q=%E9%9B%A8%E5%A4%9C%E8%BD%A6%E7%AB%99",
      headers: writerHeaders,
    })
    expect(visionSearch.json().items[0]).toMatchObject({
      id: item.id,
      searchMatches: [{ source: "vision", excerpt: expect.stringContaining("雨夜车站") }],
    })

    const capture = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/media-analysis`,
      headers: writerHeaders,
      payload: {
        idempotencyKey: "media-frame-capture-001",
        timecodeUs: 750_000,
      },
    })
    const outOfRange = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${item.id}/media-analysis`,
      headers: writerHeaders,
      payload: {
        idempotencyKey: "media-frame-capture-002",
        timecodeUs: 2_000_000,
      },
    })

    expect(capture.statusCode).toBe(201)
    expect(capture.json().job).toMatchObject({
      kind: "frame_capture",
      tool: "ffmpeg_frame_v1",
      requestedTimecodeUs: 750_000,
      status: "queued",
    })
    expect(outOfRange.statusCode).toBe(400)
    expect(outOfRange.json().code).toBe("FRAME_CAPTURE_TIMECODE_OUT_OF_RANGE")

    const captureJob = repository.mediaAnalysisJobs.find(
      (candidate) => candidate.kind === "frame_capture",
    )
    if (!captureJob) throw new Error("Missing frame capture job")
    captureJob.status = "completed"
    captureJob.shotCount = 1
    captureJob.shots = [
      {
        id: "capture-1",
        sequence: 1,
        startUs: 750_000,
        endUs: 750_001,
        keyframeUs: 750_000,
        keyframeAvailable: true,
        description: "",
        state: "confirmed",
      },
    ]
    const readWithCapture = await app.inject({
      method: "GET",
      url: `/v1/teams/north/assets/${item.id}/media-analysis`,
      headers: writerHeaders,
    })
    expect(readWithCapture.json()).toMatchObject({
      job: { kind: "shot_detection", status: "completed" },
      frameCaptures: [
        {
          id: captureJob.id,
          requestedTimecodeUs: 750_000,
          shots: [{ keyframeUs: 750_000, state: "confirmed" }],
        },
      ],
    })

    const download = await app.inject({
      method: "GET",
      url: `/v1/teams/north/assets/${item.id}/media-analysis/${captureJob.id}/shots/capture-1/keyframe?download=1`,
      headers: writerHeaders,
    })
    expect(download.statusCode).toBe(302)
    expect(storage.lastDownloadOptions).toEqual({ attachment: true })
  })

  it("creates transcription and OCR candidates and searches only confirmed current text", async () => {
    const { app, repository } = await createTestApp()
    const createReadyAsset = async (
      name: string,
      kind: "视频" | "图片",
      mimeType: string,
      key: string,
    ) => {
      const intent = await app.inject({
        method: "POST",
        url: "/v1/teams/north/assets/upload-intents",
        headers: writerHeaders,
        payload: {
          name,
          kind,
          mimeType,
          sizeBytes: 256,
          idempotencyKey: `${key}-intent`,
        },
      })
      const item = intent.json().item
      await app.inject({
        method: "POST",
        url: `/v1/teams/north/assets/${item.id}/complete`,
        headers: writerHeaders,
        payload: {
          expectedRevision: item.revision,
          idempotencyKey: `${key}-complete`,
        },
      })
      const stored = repository.assets.find((candidate) => candidate.item.id === item.id)
      if (!stored) throw new Error(`Missing ready asset: ${name}`)
      stored.item.mediaStatus = "ready"
      return stored
    }

    const video = await createReadyAsset(
      "采访原片.mp4",
      "视频",
      "video/mp4",
      "text-analysis-video",
    )
    const image = await createReadyAsset(
      "场记板.png",
      "图片",
      "image/png",
      "text-analysis-image",
    )
    const transcription = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${video.item.id}/media-analysis`,
      headers: writerHeaders,
      payload: {
        kind: "transcription",
        expectedRevision: video.item.revision,
        idempotencyKey: "text-analysis-transcription-create",
      },
    })
    const ocr = await app.inject({
      method: "POST",
      url: `/v1/teams/north/assets/${image.item.id}/media-analysis`,
      headers: writerHeaders,
      payload: {
        kind: "ocr",
        expectedRevision: image.item.revision,
        idempotencyKey: "text-analysis-ocr-create",
      },
    })

    expect(transcription.statusCode).toBe(201)
    expect(transcription.json().job).toMatchObject({
      kind: "transcription",
      tool: "openai_compatible_transcription_v1",
      status: "queued",
    })
    expect(ocr.statusCode).toBe(201)
    expect(ocr.json().job).toMatchObject({
      kind: "ocr",
      tool: "openai_compatible_vision_v1",
      status: "queued",
    })

    const candidates = [
      {
        jobId: transcription.json().job.id as string,
        assetId: video.item.id,
        text: "转写检索唯一词",
        key: "text-analysis-transcription-confirm",
      },
      {
        jobId: ocr.json().job.id as string,
        assetId: image.item.id,
        text: "识字检索唯一词",
        key: "text-analysis-ocr-confirm",
      },
    ]
    for (const candidate of candidates) {
      const job = repository.mediaAnalysisJobs.find((item) => item.id === candidate.jobId)
      if (!job) throw new Error(`Missing analysis job: ${candidate.jobId}`)
      job.status = "awaiting_confirmation"
      job.revision = 2
      job.resultText = candidate.text
      job.segments = [
        {
          sequence: 1,
          startUs: job.kind === "transcription" ? 0 : null,
          endUs: job.kind === "transcription" ? 1_000_000 : null,
          text: candidate.text,
          confidence: 0.9,
        },
      ]

      const before = await app.inject({
        method: "GET",
        url: `/v1/teams/north/assets?q=${encodeURIComponent(candidate.text)}`,
        headers: writerHeaders,
      })
      expect(before.json().items).toEqual([])

      const confirmed = await app.inject({
        method: "POST",
        url: `/v1/teams/north/assets/${candidate.assetId}/media-analysis/${job.id}/confirm`,
        headers: writerHeaders,
        payload: { expectedRevision: job.revision, idempotencyKey: candidate.key },
      })
      expect(confirmed.statusCode).toBe(200)
      expect(confirmed.json().job).toMatchObject({
        status: "completed",
        resultText: candidate.text,
      })

      const after = await app.inject({
        method: "GET",
        url: `/v1/teams/north/assets?q=${encodeURIComponent(candidate.text)}`,
        headers: writerHeaders,
      })
      expect(after.json().items).toEqual([
        expect.objectContaining({
          id: candidate.assetId,
          searchMatches: [
            expect.objectContaining({
              source: job.kind,
              excerpt: expect.stringContaining(candidate.text),
            }),
          ],
        }),
      ])
    }

    image.item.revision += 1
    const staleSearch = await app.inject({
      method: "GET",
      url: `/v1/teams/north/assets?q=${encodeURIComponent("识字检索唯一词")}`,
      headers: writerHeaders,
    })
    expect(staleSearch.json().items).toEqual([])
  })

  it("does not create an asset when object storage is unavailable", async () => {
    const storage = new MemoryAssetStorage()
    storage.failReadiness = true
    const { app, repository } = await createTestApp(1024, storage)
    const response = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "unavailable.png",
        kind: "图片",
        mimeType: "image/png",
        sizeBytes: 128,
        idempotencyKey: "asset-upload-intent-unavailable",
      },
    })

    expect(response.statusCode).toBe(500)
    expect(repository.assets).toHaveLength(0)
  })

  it("persists metadata changes and rejects stale revisions", async () => {
    const { app } = await createTestApp()
    const intent = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "评级素材.png",
        kind: "图片",
        mimeType: "image/png",
        sizeBytes: 128,
        idempotencyKey: "asset-upload-intent-002",
      },
    })
    const item = intent.json().item
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/assets/${item.id}`,
      headers: writerHeaders,
      payload: { favorite: true, rating: 5, tags: ["精选"], expectedRevision: 1 },
    })
    const conflict = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/assets/${item.id}`,
      headers: writerHeaders,
      payload: { note: "过期写入", expectedRevision: 1 },
    })

    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({ favorite: true, rating: 5, tags: ["精选"] })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().code).toBe("RESOURCE_CONFLICT")
  })

  it("lists archived assets and restores them with revision and permission checks", async () => {
    const { app } = await createTestApp()
    const intent = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "回收站素材.png",
        kind: "图片",
        mimeType: "image/png",
        sizeBytes: 128,
        idempotencyKey: "asset-trash-intent-001",
      },
    })
    const item = intent.json().item
    const archived = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/assets/${item.id}`,
      headers: writerHeaders,
      payload: { archived: true, expectedRevision: item.revision },
    })
    const activeList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/assets",
      headers: writerHeaders,
    })
    const trashList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/assets?archived=1",
      headers: writerHeaders,
    })
    const viewerRestore = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/assets/${item.id}`,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { archived: false, expectedRevision: archived.json().revision },
    })
    const staleRestore = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/assets/${item.id}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: item.revision },
    })
    const restored = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/assets/${item.id}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: archived.json().revision },
    })
    const repeatedRestore = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/assets/${item.id}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: archived.json().revision },
    })

    expect(archived.statusCode).toBe(200)
    expect(archived.json()).toMatchObject({ archived: true, revision: 2 })
    expect(activeList.json().items).toHaveLength(0)
    expect(trashList.json().items).toEqual([
      expect.objectContaining({ id: item.id, archived: true, revision: 2 }),
    ])
    expect(viewerRestore.statusCode).toBe(403)
    expect(staleRestore.statusCode).toBe(409)
    expect(restored.statusCode).toBe(200)
    expect(restored.json()).toMatchObject({ archived: false, revision: 3 })
    expect(repeatedRestore.statusCode).toBe(404)
    expect(repeatedRestore.json().code).toBe("ASSET_NOT_ARCHIVED")
  })

  it("rejects files above the configured development limit", async () => {
    const { app } = await createTestApp(100)
    const response = await app.inject({
      method: "POST",
      url: "/v1/teams/north/assets/upload-intents",
      headers: writerHeaders,
      payload: {
        name: "too-large.mov",
        kind: "视频",
        mimeType: "video/quicktime",
        sizeBytes: 101,
        idempotencyKey: "asset-upload-intent-003",
      },
    })

    expect(response.statusCode).toBe(413)
    expect(response.json().code).toBe("ASSET_TOO_LARGE")
  })
})
