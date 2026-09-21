import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { accessAllows } from "@shadowproducer/application"
import type { MediaAnalysisTextSegment } from "@shadowproducer/contracts"
import { type Kysely, sql } from "kysely"

import { createDatabase, type Database, defaultDatabaseUrl } from "./database"
import { hlsEncodings, hlsMaster, hlsOutputArgs } from "./hls-encoding"
import {
  createEmbeddingWithModelApi,
  modelApiConfigFromEnvironment,
  recognizeImageWithModelApi,
  transcribeWithModelApi,
} from "./openai-compatible-model-provider"
import { resolveTeamAccess } from "./postgres-access"
import { PostgresAssetRepository } from "./postgres-asset-repository"
import { createS3AssetStorage, type S3AssetStorage } from "./s3-asset-storage"

const pollIntervalMs = 1_000
const leaseMinutes = 15
const maxOutputBytes = 2 * 1024 * 1024

type ClaimedJob = {
  workerId: string
  assetId: string
  teamId: string
  kind: "视频" | "图片" | "音频" | "文档"
  mimeType: string
  objectKey: string
  createdByAccountId: string
  attempts: number
  maxAttempts: number
}

type ClaimedAnalysisJob = {
  id: string
  assetId: string
  teamId: string
  kind: "shot_detection" | "frame_capture" | "transcription" | "ocr"
  tool:
    | "ffmpeg_scene_v1"
    | "ffmpeg_frame_v1"
    // Completed pre-migration rows can retain these values; the worker never invokes local inference.
    | "whisper_cpp_v1"
    | "tesseract_v1"
    | "openai_compatible_transcription_v1"
    | "openai_compatible_vision_v1"
  requestedTimecodeUs: number | null
  sourceObjectKey: string
  sourceChecksumSha256: string
  sourceRevision: number
  triggeredByAccountId: string
  attempts: number
  maxAttempts: number
}

type ClaimedEmbeddingJob = {
  id: string
  assetId: string
  teamId: string
  analysisJobId: string
  sourceRevision: number
  sourceKind: "transcription" | "ocr" | "vision"
  sequence: number
  content: string
  inputSha256: string
  triggeredByAccountId: string
  attempts: number
  maxAttempts: number
}

type DetectedShot = {
  startUs: number
  endUs: number
  keyframeUs: number
}

type AnalysisFailureStage =
  | "authorization"
  | "download"
  | "probe"
  | "prepare"
  | "detect"
  | "transcribe"
  | "ocr"
  | "keyframe"
  | "vision"
  | "persist"

type AnalysisSourceSnapshot = {
  status: string | null
  archivedAt: Date | null
  objectKey: string | null
  checksumSha256: string | null
  revision: number | null
}

export function isCurrentAnalysisSource(
  asset: AnalysisSourceSnapshot,
  source: { objectKey: string; checksumSha256: string; revision: number },
) {
  return (
    asset.status === "ready" &&
    !asset.archivedAt &&
    asset.objectKey === source.objectKey &&
    asset.checksumSha256 === source.checksumSha256 &&
    asset.revision === source.revision
  )
}

class AnalysisStageError extends Error {
  constructor(
    readonly stage: AnalysisFailureStage,
    message: string,
  ) {
    super(message)
  }
}

export type ParsedMedia = {
  durationUs: number | null
  width: number | null
  height: number | null
  frameRateNumerator: number | null
  frameRateDenominator: number | null
  videoCodec: string | null
  audioCodec: string | null
  formatName: string | null
  rotationDegrees: number | null
  variableFrameRate: boolean | null
}

type ProbeStream = {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  duration?: string
  avg_frame_rate?: string
  r_frame_rate?: string
  tags?: { rotate?: string }
  side_data_list?: Array<{ rotation?: number }>
}

export function parseProbeOutput(raw: string): ParsedMedia {
  const payload = JSON.parse(raw) as {
    streams?: ProbeStream[]
    format?: { duration?: string; format_name?: string }
  }
  const streams = payload.streams ?? []
  const video = streams.find((stream) => stream.codec_type === "video")
  const audio = streams.find((stream) => stream.codec_type === "audio")
  const durationSeconds = finiteNumber(payload.format?.duration ?? video?.duration)
  const averageRate = parseRate(video?.avg_frame_rate)
  const nominalRate = parseRate(video?.r_frame_rate)
  const rotation =
    video?.side_data_list?.find((entry) => Number.isFinite(entry.rotation))?.rotation ??
    finiteNumber(video?.tags?.rotate)
  return {
    durationUs:
      durationSeconds === null ? null : Math.max(0, Math.round(durationSeconds * 1e6)),
    width: positiveInteger(video?.width),
    height: positiveInteger(video?.height),
    frameRateNumerator: averageRate?.numerator ?? null,
    frameRateDenominator: averageRate?.denominator ?? null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    formatName: payload.format?.format_name ?? null,
    rotationDegrees: rotation === null ? null : Math.round(rotation),
    variableFrameRate:
      averageRate && nominalRate
        ? Math.abs(
            averageRate.numerator / averageRate.denominator -
              nominalRate.numerator / nominalRate.denominator,
          ) > 0.001
        : null,
  }
}

export function parseSceneTimes(
  raw: string,
  durationUs: number,
  maxShots = 200,
): DetectedShot[] {
  if (!Number.isSafeInteger(durationUs) || durationUs <= 0) {
    throw new Error("视频时长不可用")
  }
  const durationSeconds = durationUs / 1_000_000
  const detected = [...raw.matchAll(/pts_time:\s*(-?\d+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value < durationSeconds)
    .sort((left, right) => left - right)
  const boundaries = [0]
  for (const seconds of detected) {
    if (seconds - (boundaries.at(-1) ?? 0) < 0.1) continue
    boundaries.push(seconds)
    if (boundaries.length >= maxShots) break
  }
  return boundaries.map((seconds, index) => {
    const startUs = Math.round(seconds * 1_000_000)
    const endUs =
      index + 1 < boundaries.length
        ? Math.round((boundaries[index + 1] ?? durationSeconds) * 1_000_000)
        : durationUs
    return {
      startUs,
      endUs,
      keyframeUs: startUs + Math.min(500_000, Math.floor((endUs - startUs) / 2)),
    }
  })
}

function parseRate(value: string | undefined) {
  if (!value) return null
  const [numerator, denominator] = value.split("/").map(Number)
  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    denominator <= 0
  ) {
    return null
  }
  return numerator > 0 ? { numerator, denominator } : null
}

function finiteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function positiveInteger(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

async function claimJob(database: Kysely<Database>, workerId: string) {
  return database.transaction().execute(async (transaction) => {
    const candidate = await transaction
      .selectFrom("media_processing_jobs")
      .select("asset_id")
      .where((expression) =>
        expression.or([
          expression("status", "=", "pending"),
          expression.and([
            expression("status", "=", "processing"),
            expression("lease_expires_at", "<", sql<Date>`now()`),
          ]),
        ]),
      )
      .where("available_at", "<=", sql<Date>`now()`)
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .executeTakeFirst()
    if (!candidate) return null
    const job = await transaction
      .updateTable("media_processing_jobs")
      .set({
        status: "processing",
        attempts: sql<number>`attempts + 1`,
        locked_by: workerId,
        lease_expires_at: sql<Date>`now() + (${leaseMinutes} * interval '1 minute')`,
        last_error: null,
        updated_at: sql<Date>`now()`,
      })
      .where("asset_id", "=", candidate.asset_id)
      .returning(["attempts", "max_attempts"])
      .executeTakeFirstOrThrow()
    const asset = await transaction
      .selectFrom("team_assets")
      .select([
        "id",
        "team_id",
        "kind",
        "mime_type",
        "object_key",
        "created_by_account_id",
      ])
      .where("id", "=", candidate.asset_id)
      .where("status", "=", "ready")
      .where("archived_at", "is", null)
      .executeTakeFirst()
    if (!asset?.object_key) {
      await transaction
        .updateTable("media_processing_jobs")
        .set({
          status: "failed",
          last_error: "原始素材不可用",
          updated_at: sql<Date>`now()`,
        })
        .where("asset_id", "=", candidate.asset_id)
        .execute()
      return null
    }
    await transaction
      .updateTable("asset_media")
      .set({ status: "processing", error_message: null, updated_at: sql<Date>`now()` })
      .where("asset_id", "=", asset.id)
      .execute()
    return {
      workerId,
      assetId: asset.id,
      teamId: asset.team_id,
      kind: asset.kind,
      mimeType: asset.mime_type,
      objectKey: asset.object_key,
      createdByAccountId: asset.created_by_account_id,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
    } satisfies ClaimedJob
  })
}

async function claimAnalysisJob(database: Kysely<Database>, workerId: string) {
  return database.transaction().execute(async (transaction) => {
    const candidate = await transaction
      .selectFrom("media_analysis_jobs")
      .select("id")
      .where((expression) =>
        expression.or([
          expression("status", "=", "queued"),
          expression.and([
            expression("status", "=", "processing"),
            expression("lease_expires_at", "<", sql<Date>`now()`),
          ]),
        ]),
      )
      .where("available_at", "<=", sql<Date>`now()`)
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .executeTakeFirst()
    if (!candidate) return null

    const job = await transaction
      .updateTable("media_analysis_jobs")
      .set({
        status: "processing",
        attempts: sql<number>`attempts + 1`,
        locked_by: workerId,
        lease_expires_at: sql<Date>`now() + (${leaseMinutes} * interval '1 minute')`,
        failure_stage: null,
        last_error: null,
        updated_at: sql<Date>`now()`,
      })
      .where("id", "=", candidate.id)
      .returningAll()
      .executeTakeFirstOrThrow()
    const asset = await transaction
      .selectFrom("team_assets")
      .select([
        "team_id",
        "object_key",
        "checksum_sha256",
        "status",
        "archived_at",
        "revision",
      ])
      .where("id", "=", job.asset_id)
      .executeTakeFirst()
    if (
      !asset ||
      !isCurrentAnalysisSource(
        {
          status: asset.status,
          archivedAt: asset.archived_at,
          objectKey: asset.object_key,
          checksumSha256: asset.checksum_sha256,
          revision: asset.revision,
        },
        {
          objectKey: job.source_object_key,
          checksumSha256: job.source_checksum_sha256,
          revision: job.source_revision,
        },
      )
    ) {
      await transaction
        .updateTable("media_analysis_jobs")
        .set({
          status: "expired",
          locked_by: null,
          lease_expires_at: null,
          failure_stage: null,
          last_error: "源素材版本已变化或不可用",
          revision: sql<number>`revision + 1`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", job.id)
        .execute()
      return null
    }
    return {
      id: job.id,
      assetId: job.asset_id,
      teamId: asset.team_id,
      kind: job.kind,
      tool: job.tool,
      requestedTimecodeUs:
        job.requested_timecode_us === null ? null : Number(job.requested_timecode_us),
      sourceObjectKey: job.source_object_key,
      sourceChecksumSha256: job.source_checksum_sha256,
      sourceRevision: job.source_revision,
      triggeredByAccountId: job.triggered_by_account_id,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
    } satisfies ClaimedAnalysisJob
  })
}

export async function claimEmbeddingJob(database: Kysely<Database>, workerId: string) {
  return database.transaction().execute(async (transaction) => {
    await transaction
      .updateTable("asset_embedding_jobs")
      .set({
        status: "failed",
        locked_by: null,
        lease_expires_at: null,
        last_error: "处理租约过期且已达到最大尝试次数",
        updated_at: sql<Date>`now()`,
      })
      .where("status", "=", "processing")
      .where("lease_expires_at", "<", sql<Date>`now()`)
      .where(sql<boolean>`attempts >= max_attempts`)
      .execute()

    const candidate = await transaction
      .selectFrom("asset_embedding_jobs")
      .select("id")
      .where((expression) =>
        expression.or([
          expression("status", "=", "queued"),
          expression.and([
            expression("status", "=", "processing"),
            expression("lease_expires_at", "<", sql<Date>`now()`),
          ]),
        ]),
      )
      .where("available_at", "<=", sql<Date>`now()`)
      .where(sql<boolean>`attempts < max_attempts`)
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .executeTakeFirst()
    if (!candidate) return null

    const job = await transaction
      .updateTable("asset_embedding_jobs")
      .set({
        status: "processing",
        attempts: sql<number>`attempts + 1`,
        locked_by: workerId,
        lease_expires_at: sql<Date>`now() + (${leaseMinutes} * interval '1 minute')`,
        last_error: null,
        updated_at: sql<Date>`now()`,
      })
      .where("id", "=", candidate.id)
      .returningAll()
      .executeTakeFirstOrThrow()
    const source = await transaction
      .selectFrom("team_assets as asset")
      .innerJoin("media_analysis_jobs as analysis", "analysis.asset_id", "asset.id")
      .select([
        "asset.team_id",
        "asset.status as asset_status",
        "asset.archived_at",
        "asset.revision as asset_revision",
        "analysis.status as analysis_status",
        "analysis.kind as analysis_kind",
        "analysis.source_revision as analysis_source_revision",
        "analysis.result_text",
        "analysis.result_segments",
        "analysis.triggered_by_account_id",
      ])
      .where("analysis.id", "=", job.analysis_job_id)
      .where("asset.id", "=", job.asset_id)
      .executeTakeFirst()
    const analysisKind = job.source_kind === "vision" ? "shot_detection" : job.source_kind
    const sourceContent =
      job.source_kind === "vision"
        ? ((source?.result_segments as MediaAnalysisTextSegment[] | undefined)?.find(
            (segment) => segment.sequence === job.sequence,
          )?.text ?? "")
        : (source?.result_text ?? "")
    if (
      source?.asset_status !== "ready" ||
      source.archived_at ||
      source.asset_revision !== job.source_revision ||
      source.analysis_status !== "completed" ||
      source.analysis_kind !== analysisKind ||
      source.analysis_source_revision !== job.source_revision ||
      sourceContent.trim() !== job.content_text
    ) {
      await transaction
        .updateTable("asset_embedding_jobs")
        .set({
          status: "expired",
          locked_by: null,
          lease_expires_at: null,
          last_error: "来源分析或素材版本已变化",
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", job.id)
        .execute()
      return null
    }
    return {
      id: job.id,
      assetId: job.asset_id,
      teamId: source.team_id,
      analysisJobId: job.analysis_job_id,
      sourceRevision: job.source_revision,
      sourceKind: job.source_kind,
      sequence: job.sequence,
      content: job.content_text,
      inputSha256: job.input_sha256,
      triggeredByAccountId: source.triggered_by_account_id,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
    } satisfies ClaimedEmbeddingJob
  })
}

export function mediaPreviewEncoding(kind: ClaimedJob["kind"]) {
  if (kind === "图片")
    return {
      fileName: "preview-v2.webp",
      mimeType: "image/webp",
      args: [
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-vf",
        "scale=w='min(1600,iw)':h='min(1600,ih)':force_original_aspect_ratio=decrease",
        "-c:v",
        "libwebp",
        "-quality",
        "78",
      ],
    }
  return null
}

export async function processJob(
  database: Kysely<Database>,
  storage: S3AssetStorage,
  job: ClaimedJob,
  signal: AbortSignal,
) {
  const directory = await mkdtemp(join(tmpdir(), "shadowproducer-media-"))
  const source = join(directory, "source")
  const thumbnail = join(directory, "thumbnail.jpg")
  const encoding = mediaPreviewEncoding(job.kind)
  const uploadedHlsKeys: string[] = []
  let committed = false
  const processingSignal = AbortSignal.any([signal, AbortSignal.timeout(12 * 60_000)])
  try {
    await storage.downloadObjectToFile(job.objectKey, source)
    const probe = await runCommand(
      process.env.FFPROBE_PATH ?? "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", source],
      120_000,
      signal,
    )
    const metadata = parseProbeOutput(probe.stdout)
    if (job.kind === "视频" && (!metadata.width || !metadata.height)) {
      throw new Error("文件不包含可用的视频流")
    }

    const derivativeBase = `teams/${job.teamId}/derivatives/${job.assetId}`
    let thumbnailObjectKey: string | null = null
    let reviewProxyObjectKey: string | null = null
    if (metadata.width && metadata.height) {
      const seekSeconds = Math.min(
        10,
        Math.max(0, (metadata.durationUs ?? 0) / 10_000_000),
      )
      await runCommand(
        process.env.FFMPEG_PATH ?? "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          seekSeconds.toFixed(3),
          "-i",
          source,
          "-frames:v",
          "1",
          "-vf",
          "scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
          "-q:v",
          "3",
          "-y",
          thumbnail,
        ],
        180_000,
        signal,
      )
      thumbnailObjectKey = `${derivativeBase}/thumbnail.jpg`
      await storage.uploadDerivedFile(thumbnailObjectKey, thumbnail, "image/jpeg")
    }
    if (job.kind === "视频" || job.kind === "音频") {
      const hlsDirectory = join(directory, "hls")
      await mkdir(hlsDirectory)
      const encodings = hlsEncodings(job.kind, metadata)
      for (const profile of encodings) {
        await runCommand(
          process.env.FFMPEG_PATH ?? "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            source,
            ...profile.args,
            ...hlsOutputArgs(hlsDirectory, profile.name),
            "-y",
            join(hlsDirectory, `${profile.name}.m3u8`),
          ],
          10 * 60_000,
          processingSignal,
          hlsDirectory,
        )
        await readFile(join(hlsDirectory, `${profile.name}_init.mp4`))
      }
      await writeFile(join(hlsDirectory, "master.m3u8"), hlsMaster(encodings), "utf8")
      const prefix = `${derivativeBase}/preview-v2.hls/${randomUUID()}`
      for (const name of await readdir(hlsDirectory)) {
        if (processingSignal.aborted)
          throw processingSignal.reason ?? new Error("Media job aborted")
        const key = `${prefix}/${name}`
        // Track before upload so a lost acknowledgement also gets cleaned on failure.
        uploadedHlsKeys.push(key)
        await storage.uploadDerivedFile(
          key,
          join(hlsDirectory, name),
          name.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp4",
        )
      }
      reviewProxyObjectKey = `${prefix}/master.m3u8`
    } else if (encoding) {
      const proxy = join(directory, encoding.fileName)
      await runCommand(
        process.env.FFMPEG_PATH ?? "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          source,
          ...encoding.args,
          "-y",
          proxy,
        ],
        10 * 60_000,
        signal,
      )
      // The existing proxy column stores display derivatives for all media kinds.
      reviewProxyObjectKey = `${derivativeBase}/${encoding.fileName}`
      await storage.uploadDerivedFile(reviewProxyObjectKey, proxy, encoding.mimeType)
    }

    processingSignal.throwIfAborted()
    await database.transaction().execute(async (transaction) => {
      const owned = await transaction
        .selectFrom("media_processing_jobs")
        .select("asset_id")
        .where("asset_id", "=", job.assetId)
        .where("status", "=", "processing")
        .where("locked_by", "=", job.workerId)
        .where("attempts", "=", job.attempts)
        .where("lease_expires_at", ">", sql<Date>`now()`)
        .forUpdate()
        .executeTakeFirst()
      if (!owned) throw new Error("Media processing lease lost")
      await transaction
        .updateTable("asset_media")
        .set({
          status: "ready",
          duration_us: metadata.durationUs === null ? null : String(metadata.durationUs),
          width: metadata.width,
          height: metadata.height,
          frame_rate_numerator: metadata.frameRateNumerator,
          frame_rate_denominator: metadata.frameRateDenominator,
          video_codec: metadata.videoCodec,
          audio_codec: metadata.audioCodec,
          format_name: metadata.formatName,
          rotation_degrees: metadata.rotationDegrees,
          is_vfr: metadata.variableFrameRate,
          thumbnail_object_key: thumbnailObjectKey,
          review_proxy_object_key: reviewProxyObjectKey,
          error_message: null,
          processed_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .where("asset_id", "=", job.assetId)
        .execute()
      await transaction
        .updateTable("media_processing_jobs")
        .set({
          status: "succeeded",
          locked_by: null,
          lease_expires_at: null,
          last_error: null,
          completed_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .where("asset_id", "=", job.assetId)
        .execute()
      await transaction
        .insertInto("audit_logs")
        .values({
          actor_account_id: job.createdByAccountId,
          team_id: job.teamId,
          project_id: null,
          action: "asset.media.processed",
          subject_id: job.assetId,
          metadata: JSON.stringify({
            actorKind: "worker",
            thumbnail: Boolean(thumbnailObjectKey),
            reviewProxy: Boolean(reviewProxyObjectKey),
          }),
        })
        .execute()
    })
    committed = true
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 2_000) : "媒体处理失败"
    const retry = job.attempts < job.maxAttempts && !signal.aborted
    await database.transaction().execute(async (transaction) => {
      const owned = await transaction
        .selectFrom("media_processing_jobs")
        .select("asset_id")
        .where("asset_id", "=", job.assetId)
        .where("status", "=", "processing")
        .where("locked_by", "=", job.workerId)
        .where("attempts", "=", job.attempts)
        .forUpdate()
        .executeTakeFirst()
      if (!owned) return
      await transaction
        .updateTable("asset_media")
        .set({
          status: retry ? "pending" : "failed",
          error_message: message,
          updated_at: sql<Date>`now()`,
        })
        .where("asset_id", "=", job.assetId)
        .execute()
      await transaction
        .updateTable("media_processing_jobs")
        .set({
          status: retry ? "pending" : "failed",
          available_at: retry
            ? sql<Date>`now() + (${job.attempts * 5} * interval '1 second')`
            : sql<Date>`now()`,
          locked_by: null,
          lease_expires_at: null,
          last_error: message,
          updated_at: sql<Date>`now()`,
        })
        .where("asset_id", "=", job.assetId)
        .execute()
    })
    if (!retry) throw error
  } finally {
    if (!committed) {
      for (const key of uploadedHlsKeys) {
        await storage
          .deleteObject(key)
          .catch(() => console.error("Failed to clean HLS derivative", key))
      }
    }
    await rm(directory, { recursive: true, force: true })
  }
}

async function processAnalysisJob(
  database: Kysely<Database>,
  storage: S3AssetStorage,
  job: ClaimedAnalysisJob,
  workerId: string,
  signal: AbortSignal,
) {
  const directory = await mkdtemp(join(tmpdir(), "shadowproducer-analysis-"))
  const source = join(directory, "source")
  const uploadedObjectKeys: string[] = []
  let stage: AnalysisFailureStage = "authorization"
  try {
    const access = await resolveTeamAccess(database, job.triggeredByAccountId, job.teamId)
    if (!access || !accessAllows(access, "asset.write", "write")) {
      throw new AnalysisStageError("authorization", "任务执行时账号已无资源库写入权限")
    }

    stage = "download"
    await storage.downloadObjectToFile(job.sourceObjectKey, source)
    let threshold: number | null = null
    let resultText = ""
    let segments: MediaAnalysisTextSegment[] = []
    let inputObjectKey: string | null = null
    let provider: string | null = null
    let runtimeVersion: string | null = null
    let modelName: string | null = null
    const modelSha256: string | null = null
    let language: string | null = null
    const persistedShots: Array<
      DetectedShot & { id: string; sequence: number; objectKey: string }
    > = []

    if (job.kind === "transcription") {
      stage = "probe"
      const probe = await runCommand(
        process.env.FFPROBE_PATH ?? "ffprobe",
        ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", source],
        120_000,
        signal,
      )
      if (!parseProbeOutput(probe.stdout).audioCodec) {
        throw new AnalysisStageError("probe", "文件不包含可转写的音轨")
      }
      stage = "prepare"
      const audioInput = join(directory, "asr-input.wav")
      await runCommand(
        process.env.FFMPEG_PATH ?? "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          source,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "pcm_s16le",
          "-y",
          audioInput,
        ],
        10 * 60_000,
        signal,
      )
      inputObjectKey = `teams/${job.teamId}/derivatives/${job.assetId}/analysis/${job.id}/asr-input.wav`
      await storage.uploadDerivedFile(inputObjectKey, audioInput, "audio/wav")
      uploadedObjectKeys.push(inputObjectKey)

      stage = "transcribe"
      const parsed = await transcribeWithModelApi(
        modelApiConfigFromEnvironment("transcription"),
        {
          data: new Uint8Array(await readFile(audioInput)),
          fileName: "asr-input.wav",
          mimeType: "audio/wav",
        },
        signal,
      )
      resultText = parsed.text
      segments = parsed.segments
      provider = parsed.provider
      runtimeVersion = "openai-compatible"
      modelName = parsed.model
      language = parsed.language
    } else if (job.kind === "ocr") {
      stage = "prepare"
      const imageInput = join(directory, "ocr-input.png")
      await runCommand(
        process.env.FFMPEG_PATH ?? "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          source,
          "-frames:v",
          "1",
          "-vf",
          "scale=w='min(2400,iw)':h=-2:force_original_aspect_ratio=decrease",
          "-y",
          imageInput,
        ],
        180_000,
        signal,
      )
      inputObjectKey = `teams/${job.teamId}/derivatives/${job.assetId}/analysis/${job.id}/ocr-input.png`
      await storage.uploadDerivedFile(inputObjectKey, imageInput, "image/png")
      uploadedObjectKeys.push(inputObjectKey)

      stage = "ocr"
      const parsed = await recognizeImageWithModelApi(
        modelApiConfigFromEnvironment("vision"),
        {
          data: new Uint8Array(await readFile(imageInput)),
          fileName: "ocr-input.png",
          mimeType: "image/png",
        },
        signal,
      )
      resultText = parsed.text
      segments = parsed.segments
      provider = parsed.provider
      runtimeVersion = "openai-compatible"
      modelName = parsed.model
    } else {
      stage = "probe"
      const probe = await runCommand(
        process.env.FFPROBE_PATH ?? "ffprobe",
        ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", source],
        120_000,
        signal,
      )
      const metadata = parseProbeOutput(probe.stdout)
      if (!metadata.durationUs || !metadata.width || !metadata.height) {
        throw new AnalysisStageError("probe", "文件不包含可分析的视频流")
      }
      let shots: DetectedShot[]
      if (job.kind === "frame_capture") {
        if (
          job.requestedTimecodeUs === null ||
          job.requestedTimecodeUs >= metadata.durationUs
        ) {
          throw new AnalysisStageError("probe", "截帧时间码超出视频时长")
        }
        shots = [
          {
            startUs: job.requestedTimecodeUs,
            endUs: job.requestedTimecodeUs + 1,
            keyframeUs: job.requestedTimecodeUs,
          },
        ]
      } else {
        stage = "detect"
        const configuredThreshold = Number(
          process.env.MEDIA_ANALYSIS_SCENE_THRESHOLD ?? "0.3",
        )
        threshold = Number.isFinite(configuredThreshold)
          ? Math.min(0.9, Math.max(0.01, configuredThreshold))
          : 0.3
        const configuredMaxShots = Number(process.env.MEDIA_ANALYSIS_MAX_SHOTS ?? "200")
        const maxShots = Number.isSafeInteger(configuredMaxShots)
          ? Math.min(500, Math.max(1, configuredMaxShots))
          : 200
        const detection = await runCommand(
          process.env.FFMPEG_PATH ?? "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "info",
            "-i",
            source,
            "-map",
            "0:v:0",
            "-vf",
            `select=gt(scene\\,${threshold}),showinfo`,
            "-an",
            "-f",
            "null",
            "-",
          ],
          10 * 60_000,
          signal,
        )
        shots = parseSceneTimes(detection.stderr, metadata.durationUs, maxShots)
      }

      const visionConfig =
        job.kind === "shot_detection"
          ? (() => {
              stage = "vision"
              return modelApiConfigFromEnvironment("vision")
            })()
          : null
      for (const [index, shot] of shots.entries()) {
        stage = "keyframe"
        const sequence = index + 1
        const target = join(directory, `shot-${sequence.toString().padStart(4, "0")}.jpg`)
        await runCommand(
          process.env.FFMPEG_PATH ?? "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            (shot.keyframeUs / 1_000_000).toFixed(6),
            "-i",
            source,
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2:force_original_aspect_ratio=decrease",
            "-q:v",
            "3",
            "-y",
            target,
          ],
          180_000,
          signal,
        )
        const objectKey = `teams/${job.teamId}/derivatives/${job.assetId}/analysis/${job.id}/shot-${sequence.toString().padStart(4, "0")}.jpg`
        await storage.uploadDerivedFile(objectKey, target, "image/jpeg")
        uploadedObjectKeys.push(objectKey)
        if (visionConfig) {
          stage = "vision"
          const parsed = await recognizeImageWithModelApi(
            visionConfig,
            {
              data: new Uint8Array(await readFile(target)),
              fileName: `shot-${sequence.toString().padStart(4, "0")}.jpg`,
              mimeType: "image/jpeg",
              instruction:
                "Describe this film frame in concise Chinese for semantic shot search. Include people, action, location, important objects, visible text, shot scale, lighting, and mood. Return description only.",
            },
            signal,
          )
          provider = parsed.provider
          runtimeVersion = "openai-compatible"
          modelName = parsed.model
          segments.push({
            sequence,
            startUs: shot.startUs,
            endUs: shot.endUs,
            text: parsed.text,
            confidence: null,
          })
        }
        persistedShots.push({
          ...shot,
          id: randomUUID(),
          sequence,
          objectKey,
        })
      }
      resultText = segments.map((segment) => segment.text).join("\n")
    }

    stage = "persist"
    await database.transaction().execute(async (transaction) => {
      await transaction
        .deleteFrom("media_analysis_shots")
        .where("job_id", "=", job.id)
        .execute()
      if (persistedShots.length) {
        await transaction
          .insertInto("media_analysis_shots")
          .values(
            persistedShots.map((shot) => ({
              id: shot.id,
              job_id: job.id,
              sequence: shot.sequence,
              start_us: String(shot.startUs),
              end_us: String(shot.endUs),
              keyframe_us: String(shot.keyframeUs),
              keyframe_object_key: shot.objectKey,
              state: job.kind === "frame_capture" ? ("confirmed" as const) : "candidate",
            })),
          )
          .execute()
      }
      const updated = await transaction
        .updateTable("media_analysis_jobs")
        .set({
          status:
            job.kind === "frame_capture"
              ? ("completed" as const)
              : "awaiting_confirmation",
          shot_count: persistedShots.length,
          result_text: resultText,
          result_segments: JSON.stringify(segments),
          input_object_key: inputObjectKey,
          provider,
          runtime_version: runtimeVersion,
          model_name: modelName,
          model_sha256: modelSha256,
          language,
          locked_by: null,
          lease_expires_at: null,
          failure_stage: null,
          last_error: null,
          processed_at: sql<Date>`now()`,
          completed_at: job.kind === "frame_capture" ? sql<Date>`now()` : null,
          revision: sql<number>`revision + 1`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", job.id)
        .where("status", "=", "processing")
        .where("locked_by", "=", workerId)
        .executeTakeFirst()
      if (!updated) throw new Error("分析任务状态已变化")
      await transaction
        .insertInto("audit_logs")
        .values({
          actor_account_id: job.triggeredByAccountId,
          team_id: job.teamId,
          project_id: null,
          action: "asset.media-analysis.processed",
          subject_id: job.id,
          metadata: JSON.stringify({
            actorKind: "worker",
            assetId: job.assetId,
            sourceChecksumSha256: job.sourceChecksumSha256,
            kind: job.kind,
            tool: job.tool,
            threshold,
            requestedTimecodeUs: job.requestedTimecodeUs,
            shotCount: persistedShots.length,
            segmentCount: segments.length,
            resultCharacterCount: resultText.length,
            provider,
            runtimeVersion,
            modelName,
            modelSha256,
            language,
          }),
        })
        .execute()
    })
  } catch (error) {
    const cleanupResults = await Promise.allSettled(
      uploadedObjectKeys.map((objectKey) => storage.deleteObject(objectKey)),
    )
    for (const [index, result] of cleanupResults.entries()) {
      if (result.status === "rejected") {
        console.error(
          `[media-worker] failed to clean derived object ${uploadedObjectKeys[index]}`,
          result.reason,
        )
      }
    }
    const failureStage = error instanceof AnalysisStageError ? error.stage : stage
    const message =
      error instanceof Error
        ? error.message.slice(0, 2_000)
        : job.kind === "frame_capture"
          ? "截帧失败"
          : job.kind === "transcription"
            ? "语音转写失败"
            : job.kind === "ocr"
              ? "OCR 识别失败"
              : "镜头分析失败"
    const retry =
      failureStage !== "authorization" &&
      job.attempts < job.maxAttempts &&
      !signal.aborted
    await database.transaction().execute(async (transaction) => {
      await transaction
        .updateTable("media_analysis_jobs")
        .set({
          status: retry ? "queued" : "failed",
          available_at: retry
            ? sql<Date>`now() + (${job.attempts * 5} * interval '1 second')`
            : sql<Date>`now()`,
          locked_by: null,
          lease_expires_at: null,
          failure_stage: failureStage,
          last_error: message,
          revision: sql<number>`revision + 1`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", job.id)
        .where("status", "=", "processing")
        .where("locked_by", "=", workerId)
        .execute()
      if (!retry) {
        await transaction
          .insertInto("audit_logs")
          .values({
            actor_account_id: job.triggeredByAccountId,
            team_id: job.teamId,
            project_id: null,
            action: "asset.media-analysis.failed",
            subject_id: job.id,
            metadata: JSON.stringify({
              actorKind: "worker",
              assetId: job.assetId,
              failureStage,
              attempts: job.attempts,
            }),
          })
          .execute()
      }
    })
    if (!retry) throw error
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function processEmbeddingJob(
  database: Kysely<Database>,
  job: ClaimedEmbeddingJob,
  workerId: string,
  signal: AbortSignal,
) {
  try {
    const result = await createEmbeddingWithModelApi(
      modelApiConfigFromEnvironment("embedding"),
      job.content,
      signal,
    )
    await new PostgresAssetRepository(database).saveAssetEmbedding({
      actorId: job.triggeredByAccountId,
      teamId: job.teamId,
      assetId: job.assetId,
      sourceRevision: job.sourceRevision,
      sourceKind: job.sourceKind,
      sequence: job.sequence,
      content: job.content,
      inputSha256: job.inputSha256,
      provider: result.provider,
      model: result.model,
      embedding: result.embedding,
    })
    await database.transaction().execute(async (transaction) => {
      const updated = await transaction
        .updateTable("asset_embedding_jobs")
        .set({
          status: "succeeded",
          locked_by: null,
          lease_expires_at: null,
          provider: result.provider,
          model: result.model,
          dimensions: result.embedding.length,
          last_error: null,
          completed_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", job.id)
        .where("status", "=", "processing")
        .where("locked_by", "=", workerId)
        .executeTakeFirst()
      if (!updated) throw new Error("向量任务状态已变化")
      await transaction
        .insertInto("audit_logs")
        .values({
          actor_account_id: job.triggeredByAccountId,
          team_id: job.teamId,
          project_id: null,
          action: "asset.embedding.generated",
          subject_id: job.id,
          metadata: JSON.stringify({
            actorKind: "worker",
            assetId: job.assetId,
            analysisJobId: job.analysisJobId,
            sourceRevision: job.sourceRevision,
            sourceKind: job.sourceKind,
            provider: result.provider,
            model: result.model,
            dimensions: result.embedding.length,
          }),
        })
        .execute()
    })
  } catch (error) {
    const retry = job.attempts < job.maxAttempts && !signal.aborted
    const message =
      error instanceof Error ? error.message.slice(0, 2_000) : "向量生成失败"
    await database.transaction().execute(async (transaction) => {
      await transaction
        .updateTable("asset_embedding_jobs")
        .set({
          status: retry ? "queued" : "failed",
          available_at: retry
            ? sql<Date>`now() + (${job.attempts * 5} * interval '1 second')`
            : sql<Date>`now()`,
          locked_by: null,
          lease_expires_at: null,
          last_error: message,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", job.id)
        .where("status", "=", "processing")
        .where("locked_by", "=", workerId)
        .execute()
      if (!retry) {
        await transaction
          .insertInto("audit_logs")
          .values({
            actor_account_id: job.triggeredByAccountId,
            team_id: job.teamId,
            project_id: null,
            action: "asset.embedding.failed",
            subject_id: job.id,
            metadata: JSON.stringify({
              actorKind: "worker",
              assetId: job.assetId,
              analysisJobId: job.analysisJobId,
              attempts: job.attempts,
            }),
          })
          .execute()
      }
    })
    if (!retry) throw error
  }
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  signal: AbortSignal,
  cwd?: string,
) {
  if (signal.aborted) throw signal.reason ?? new Error("Media command aborted")
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, cwd })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener("abort", abort)
      if (error) reject(error)
      else
        resolve({
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        })
    }
    const stop = async (message: string) => {
      await terminateProcessTree(child)
      finish(new Error(message))
    }
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      if (settled) return
      outputBytes += chunk.byteLength
      if (outputBytes > maxOutputBytes) void stop(`${command} 输出超过限制`)
      else target.push(chunk)
    }
    child.stdout.on("data", collect(stdout))
    child.stderr.on("data", collect(stderr))
    child.once("error", (error) => finish(error))
    child.once("close", (code) => {
      if (settled) return
      const errorText = Buffer.concat(stderr).toString().trim()
      if (code === 0) finish()
      else finish(new Error(errorText || `${command} 退出码 ${code}`))
    })
    const abort = () => void stop(`${command} 已取消`)
    signal.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => void stop(`${command} 执行超时`), timeoutMs)
  })
}

async function terminateProcessTree(child: ChildProcessWithoutNullStreams) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform !== "win32") {
    child.kill("SIGKILL")
    return
  }
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    })
    killer.once("error", () => resolve())
    killer.once("close", () => resolve())
  })
}

export async function runMediaWorker(
  database: Kysely<Database>,
  storage: S3AssetStorage,
  signal: AbortSignal,
) {
  const workerId = `media-${process.pid}`
  while (!signal.aborted) {
    const job = await claimJob(database, workerId)
    if (job) {
      try {
        await processJob(database, storage, job, signal)
        console.info(`[media-worker] processed ${job.assetId}`)
      } catch (error) {
        console.error(`[media-worker] failed ${job.assetId}`, error)
      }
      continue
    }

    const analysisJob = await claimAnalysisJob(database, workerId)
    if (analysisJob) {
      try {
        await processAnalysisJob(database, storage, analysisJob, workerId, signal)
        console.info(`[media-worker] analyzed ${analysisJob.assetId}`)
      } catch (error) {
        console.error(`[media-worker] analysis failed ${analysisJob.assetId}`, error)
      }
      continue
    }

    const embeddingJob = await claimEmbeddingJob(database, workerId)
    if (embeddingJob) {
      try {
        await processEmbeddingJob(database, embeddingJob, workerId, signal)
        console.info(`[media-worker] embedded ${embeddingJob.assetId}`)
      } catch (error) {
        console.error(`[media-worker] embedding failed ${embeddingJob.assetId}`, error)
      }
      continue
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}

async function main() {
  const controller = new AbortController()
  process.once("SIGINT", () => controller.abort())
  process.once("SIGTERM", () => controller.abort())
  const database = createDatabase(process.env.DATABASE_URL ?? defaultDatabaseUrl)
  try {
    console.info(`[media-worker] started pid=${process.pid}`)
    await runMediaWorker(database, createS3AssetStorage(), controller.signal)
  } finally {
    await database.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
