import { createHash, randomUUID } from "node:crypto"

import {
  AppError,
  type AssetRepository,
  type AssetSemanticMatch,
  type CompleteAssetUploadCommand,
  type CreateAssetFolderCommand,
  type CreateAssetUploadCommand,
  type CreateMediaAnalysisCommand,
  type MultipartUploadSession,
  type SaveAssetEmbeddingCommand,
  type UpdateAssetCommand,
  type UpdateAssetFolderCommand,
  type UpdateMediaAnalysisCommand,
  type UpdateResult,
} from "@shadowproducer/application"
import type {
  AssetFolder,
  AssetSearchMatch,
  MediaAnalysisJob,
  MediaAnalysisTextSegment,
  TeamAsset,
} from "@shadowproducer/contracts"
import { type Kysely, type Selectable, sql, type Transaction } from "kysely"

import type { Database } from "./database"
import { resolveProjectAccess, resolveTeamAccess } from "./postgres-access"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>
type MediaAnalysisJobRow = Selectable<Database["media_analysis_jobs"]> & {
  team_id: string
}
type MediaAnalysisShotRow = Selectable<Database["media_analysis_shots"]>

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toNullableIso(value: Date | string | null) {
  return value ? toIso(value) : null
}

function requestHash(value: object) {
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "idempotencyKey" && key !== "objectKey")
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

function searchExcerpt(value: string, query: string) {
  const matchIndex = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  const start = Math.max(0, (matchIndex < 0 ? 0 : matchIndex) - 32)
  const end = Math.min(value.length, start + 96)
  return `${start ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`
}

export class PostgresAssetRepository implements AssetRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getTeamAccess(actorId: string, teamId: string) {
    return resolveTeamAccess(this.database, actorId, teamId)
  }

  async getProjectAccess(actorId: string, teamId: string, projectId: string) {
    return resolveProjectAccess(this.database, actorId, projectId, teamId)
  }

  async listAssets(teamId: string, archived: boolean, query?: string) {
    let rowsQuery = this.assetQuery(this.database)
      .where("asset.team_id", "=", teamId)
      .where("asset.archived_at", archived ? "is not" : "is", null)
    const normalizedQuery = query?.trim()
    if (normalizedQuery) {
      const pattern = `%${normalizedQuery}%`
      rowsQuery = rowsQuery.where(sql<boolean>`(
        asset.name ILIKE ${pattern}
        OR asset.note ILIKE ${pattern}
        OR asset.kind ILIKE ${pattern}
        OR COALESCE(project.name, '') ILIKE ${pattern}
        OR COALESCE(folder.name, '') ILIKE ${pattern}
        OR asset.tags::text ILIKE ${pattern}
        OR EXISTS (
          SELECT 1
          FROM media_analysis_jobs AS analysis
          WHERE analysis.asset_id = asset.id
            AND analysis.status = 'completed'
            AND analysis.source_revision = asset.revision
            AND analysis.result_text ILIKE ${pattern}
        )
      )`)
    }
    const [rows, folderRows] = await Promise.all([
      rowsQuery.orderBy("asset.updated_at", "desc").execute(),
      this.database
        .selectFrom("asset_folders")
        .selectAll()
        .where("team_id", "=", teamId)
        .where("archived_at", archived ? "is not" : "is", null)
        .orderBy("name")
        .execute(),
    ])
    const analysisRows =
      normalizedQuery && rows.length
        ? await this.database
            .selectFrom("media_analysis_jobs as analysis")
            .innerJoin("team_assets as asset", "asset.id", "analysis.asset_id")
            .select(["analysis.asset_id", "analysis.kind", "analysis.result_text"])
            .where(
              "analysis.asset_id",
              "in",
              rows.map((row) => row.id),
            )
            .where("analysis.kind", "in", ["transcription", "ocr", "shot_detection"])
            .where("analysis.status", "=", "completed")
            .whereRef("analysis.source_revision", "=", "asset.revision")
            .where("analysis.result_text", "ilike", `%${normalizedQuery}%`)
            .orderBy("analysis.created_at", "desc")
            .execute()
        : []
    const analysisMatches = new Map<string, AssetSearchMatch[]>()
    for (const row of analysisRows) {
      const matches = analysisMatches.get(row.asset_id) ?? []
      const source = row.kind === "shot_detection" ? "vision" : row.kind
      if (matches.some((match) => match.source === source)) continue
      matches.push({
        source: source as "transcription" | "ocr" | "vision",
        excerpt: searchExcerpt(row.result_text, normalizedQuery ?? ""),
      })
      analysisMatches.set(row.asset_id, matches)
    }
    return {
      items: rows.map((row) => {
        const matches = analysisMatches.get(row.id) ?? []
        const metadataMatch = normalizedQuery
          ? this.metadataSearchMatch(row, normalizedQuery)
          : null
        return this.mapAsset(row, metadataMatch ? [metadataMatch, ...matches] : matches)
      }),
      folders: folderRows.map((row) => this.mapFolder(row)),
    }
  }

  async saveAssetEmbedding(command: SaveAssetEmbeddingCommand) {
    const asset = await this.database
      .selectFrom("team_assets")
      .select(["revision", "archived_at"])
      .where("id", "=", command.assetId)
      .where("team_id", "=", command.teamId)
      .executeTakeFirst()
    if (!asset || asset.archived_at) {
      throw new AppError("RESOURCE_NOT_FOUND", "素材不存在或已归档", 404)
    }
    if (asset.revision !== command.sourceRevision) {
      throw new AppError("RESOURCE_CONFLICT", "素材来源版本已变化", 409)
    }
    const vector = `[${command.embedding.join(",")}]`
    await this.database
      .insertInto("asset_embeddings")
      .values({
        id: randomUUID(),
        asset_id: command.assetId,
        source_revision: command.sourceRevision,
        source_kind: command.sourceKind,
        sequence: command.sequence,
        content_text: command.content,
        input_sha256: command.inputSha256,
        provider: command.provider,
        model: command.model,
        dimensions: command.embedding.length,
        embedding: sql`${vector}::vector`,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict
          .columns([
            "asset_id",
            "source_revision",
            "source_kind",
            "sequence",
            "provider",
            "model",
          ])
          .doUpdateSet({
            content_text: command.content,
            input_sha256: command.inputSha256,
            dimensions: command.embedding.length,
            embedding: sql`${vector}::vector`,
            updated_at: new Date(),
          }),
      )
      .execute()
  }

  async semanticSearchAssets(
    teamId: string,
    projectId: string | undefined,
    provider: string,
    model: string,
    embedding: number[],
    limit: number,
  ): Promise<AssetSemanticMatch[]> {
    const vector = `[${embedding.join(",")}]`
    const projectFilter = projectId ? sql`AND asset.project_id = ${projectId}` : sql``
    const matches = await sql<{
      asset_id: string
      source_kind: AssetSemanticMatch["source"]
      content_text: string
      provider: string
      model: string
      sequence: number
      distance: number | string
    }>`
      SELECT ranked.asset_id,
             ranked.source_kind,
             ranked.content_text,
             ranked.provider,
             ranked.model,
             ranked.sequence,
             ranked.distance
      FROM (
        SELECT DISTINCT ON (asset.id)
               asset.id AS asset_id,
               source.source_kind,
               source.content_text,
               source.provider,
               source.model,
               source.sequence,
               source.embedding <=> ${vector}::vector AS distance
        FROM asset_embeddings AS source
        INNER JOIN team_assets AS asset ON asset.id = source.asset_id
        WHERE asset.team_id = ${teamId}
          AND asset.archived_at IS NULL
          AND asset.status = 'ready'
          AND source.source_revision = asset.revision
          AND source.provider = ${provider}
          AND source.model = ${model}
          AND source.dimensions = ${embedding.length}
          ${projectFilter}
        ORDER BY asset.id, source.embedding <=> ${vector}::vector
      ) AS ranked
      ORDER BY ranked.distance
      LIMIT ${limit}
    `.execute(this.database)
    if (!matches.rows.length) return []
    const assets = await this.assetQuery(this.database)
      .where(
        "asset.id",
        "in",
        matches.rows.map((row) => row.asset_id),
      )
      .execute()
    const visionAssetIds = [
      ...new Set(
        matches.rows
          .filter((row) => row.source_kind === "vision")
          .map((row) => row.asset_id),
      ),
    ]
    const shotRows = visionAssetIds.length
      ? await this.database
          .selectFrom("media_analysis_shots as shot")
          .innerJoin("media_analysis_jobs as analysis", "analysis.id", "shot.job_id")
          .innerJoin("team_assets as asset", "asset.id", "analysis.asset_id")
          .select(["analysis.asset_id", "shot.sequence", "shot.keyframe_us"])
          .where("analysis.asset_id", "in", visionAssetIds)
          .where("analysis.kind", "=", "shot_detection")
          .where("analysis.status", "=", "completed")
          .whereRef("analysis.source_revision", "=", "asset.revision")
          .orderBy("analysis.completed_at", "desc")
          .execute()
      : []
    const timecodeBySource = new Map<string, number>()
    for (const shot of shotRows) {
      const key = `${shot.asset_id}:${shot.sequence}`
      if (!timecodeBySource.has(key)) {
        timecodeBySource.set(key, Number(shot.keyframe_us))
      }
    }
    const assetsById = new Map(assets.map((row) => [row.id, this.mapAsset(row)]))
    return matches.rows.flatMap((row) => {
      const item = assetsById.get(row.asset_id)
      if (!item) return []
      const score = 1 - Number(row.distance)
      return [
        {
          item,
          score: Math.max(-1, Math.min(1, score)),
          source: row.source_kind,
          excerpt: row.content_text,
          provider: row.provider,
          model: row.model,
          sequence: row.sequence,
          timecodeUs:
            row.source_kind === "vision"
              ? (timecodeBySource.get(`${row.asset_id}:${row.sequence}`) ?? null)
              : null,
        },
      ]
    })
  }

  async createFolder(command: CreateAssetFolderCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const replay = await this.getReceipt<AssetFolder>(
        transaction,
        command.actorId,
        `asset-folder.create:${command.teamId}`,
        command.idempotencyKey,
        hash,
      )
      if (replay) {
        return {
          item: { ...replay, archived: replay.archived ?? false },
          replayed: true,
        }
      }
      await this.assertFolder(transaction, command.teamId, command.parentId ?? null, true)
      const existing = await transaction
        .selectFrom("asset_folders")
        .select("id")
        .where("team_id", "=", command.teamId)
        .where("parent_id", command.parentId ? "=" : "is", command.parentId ?? null)
        .where("name", "ilike", command.name.trim())
        .where("archived_at", "is", null)
        .executeTakeFirst()
      if (existing) {
        throw new AppError("ASSET_FOLDER_EXISTS", "同级目录已存在同名文件夹", 409)
      }
      const id = randomUUID()
      const row = await transaction
        .insertInto("asset_folders")
        .values({
          id,
          team_id: command.teamId,
          parent_id: command.parentId ?? null,
          name: command.name.trim(),
          created_by_account_id: command.actorId,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const item = this.mapFolder(row)
      await this.writeReceipt(
        transaction,
        command.actorId,
        `asset-folder.create:${command.teamId}`,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "asset.folder.created",
        item.id,
        { parentId: item.parentId },
      )
      return { item, replayed: false }
    })
  }

  async updateFolder(
    command: UpdateAssetFolderCommand,
  ): Promise<UpdateResult<AssetFolder>> {
    return this.database.transaction().execute(async (transaction) => {
      const current = await transaction
        .selectFrom("asset_folders")
        .selectAll()
        .where("id", "=", command.folderId)
        .where("team_id", "=", command.teamId)
        .forUpdate()
        .executeTakeFirst()
      const restoring = command.archived === false
      if (!current || (current.archived_at !== null) !== restoring) {
        return { kind: "not_found" }
      }
      if (current.revision !== command.expectedRevision) return { kind: "conflict" }

      if (command.archived) {
        const [asset, child] = await Promise.all([
          transaction
            .selectFrom("team_assets")
            .select("id")
            .where("team_id", "=", command.teamId)
            .where("folder_id", "=", command.folderId)
            .executeTakeFirst(),
          transaction
            .selectFrom("asset_folders")
            .select("id")
            .where("team_id", "=", command.teamId)
            .where("parent_id", "=", command.folderId)
            .executeTakeFirst(),
        ])
        if (asset || child) {
          throw new AppError("ASSET_FOLDER_NOT_EMPTY", "仅空文件夹可以移入回收站", 409)
        }
      } else {
        if (current.parent_id) {
          const parent = await transaction
            .selectFrom("asset_folders")
            .select("id")
            .where("id", "=", current.parent_id)
            .where("team_id", "=", command.teamId)
            .where("archived_at", "is", null)
            .executeTakeFirst()
          if (!parent) {
            throw new AppError(
              "ASSET_FOLDER_PARENT_UNAVAILABLE",
              "原父文件夹不可用，无法恢复到原位置",
              409,
            )
          }
        }
        const sibling = await transaction
          .selectFrom("asset_folders")
          .select("id")
          .where("team_id", "=", command.teamId)
          .where("parent_id", current.parent_id ? "=" : "is", current.parent_id)
          .where("name", "ilike", current.name)
          .where("archived_at", "is", null)
          .where("id", "!=", current.id)
          .executeTakeFirst()
        if (sibling) {
          throw new AppError("ASSET_FOLDER_EXISTS", "原位置已存在同名文件夹", 409)
        }
      }

      const row = await transaction
        .updateTable("asset_folders")
        .set({
          archived_at: command.archived ? sql<Date>`now()` : null,
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.folderId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", restoring ? "is not" : "is", null)
        .returningAll()
        .executeTakeFirst()
      if (!row) return { kind: "conflict" }
      const item = this.mapFolder(row)
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        command.archived ? "asset.folder.archived" : "asset.folder.restored",
        item.id,
        { name: item.name, revision: item.revision },
      )
      return { kind: "ok", item }
    })
  }

  async createUploadAsset(command: CreateAssetUploadCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `asset.upload.intent:${command.teamId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<TeamAsset>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) {
        const stored = await this.findAsset(transaction, command.teamId, replay.id, true)
        if (!stored) throw new Error("Replayed asset could not be read")
        return { ...stored, replayed: true }
      }
      await this.assertFolder(transaction, command.teamId, command.folderId ?? null)
      await this.assertProject(transaction, command.teamId, command.projectId ?? null)
      const id = randomUUID()
      const objectKey = `teams/${command.teamId}/originals/${randomUUID()}`
      await transaction
        .insertInto("team_assets")
        .values({
          id,
          team_id: command.teamId,
          project_id: command.projectId ?? null,
          folder_id: command.folderId ?? null,
          name: command.name.trim(),
          kind: command.kind,
          mime_type: command.mimeType,
          size_bytes: command.sizeBytes,
          object_key: objectKey,
          checksum_sha256: null,
          status: "uploading",
          favorite: false,
          rating: 0,
          tags: [],
          note: "",
          thumbnail_url: null,
          created_by_account_id: command.actorId,
        })
        .execute()
      const stored = await this.findAsset(transaction, command.teamId, id, true)
      if (!stored) throw new Error("Created asset could not be read")
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        stored.item,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "asset.upload.created",
        id,
        { sizeBytes: command.sizeBytes, mimeType: command.mimeType },
      )
      return { ...stored, replayed: false }
    })
  }

  getAsset(teamId: string, assetId: string) {
    return this.findAsset(this.database, teamId, assetId)
  }

  async getMultipartUpload(assetId: string) {
    const row = await this.database
      .selectFrom("asset_multipart_uploads")
      .select(["upload_id", "part_size_bytes", "total_parts"])
      .where("asset_id", "=", assetId)
      .where("completed_at", "is", null)
      .executeTakeFirst()
    return row
      ? {
          uploadId: row.upload_id,
          partSizeBytes: row.part_size_bytes,
          totalParts: row.total_parts,
        }
      : null
  }

  async saveMultipartUpload(assetId: string, upload: MultipartUploadSession) {
    await this.database
      .insertInto("asset_multipart_uploads")
      .values({
        asset_id: assetId,
        upload_id: upload.uploadId,
        part_size_bytes: upload.partSizeBytes,
        total_parts: upload.totalParts,
      })
      .onConflict((conflict) => conflict.column("asset_id").doNothing())
      .execute()
    const persisted = await this.database
      .selectFrom("asset_multipart_uploads")
      .select(["upload_id", "part_size_bytes", "total_parts"])
      .where("asset_id", "=", assetId)
      .executeTakeFirstOrThrow()
    return {
      uploadId: persisted.upload_id,
      partSizeBytes: persisted.part_size_bytes,
      totalParts: persisted.total_parts,
    }
  }

  async completeUpload(
    command: CompleteAssetUploadCommand,
    checksumSha256: string | null,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `asset.upload.complete:${command.teamId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<TeamAsset>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) {
        const stored = await this.findAsset(
          transaction,
          command.teamId,
          command.assetId,
          true,
        )
        return { item: stored?.item ?? replay, replayed: true }
      }
      if (!checksumSha256) {
        throw new AppError(
          "ASSET_CHECKSUM_REQUIRED",
          "服务端尚未完成文件校验，请继续上传后重试",
          409,
        )
      }
      const updated = await transaction
        .updateTable("team_assets")
        .set({
          status: "ready",
          checksum_sha256: checksumSha256,
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.assetId)
        .where("team_id", "=", command.teamId)
        .where("status", "=", "uploading")
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.missingOrConflict(transaction, command)
      const completedAsset = await transaction
        .selectFrom("team_assets")
        .select("kind")
        .where("id", "=", updated.id)
        .executeTakeFirstOrThrow()
      if (completedAsset.kind !== "文档") {
        await transaction
          .insertInto("asset_media")
          .values({ asset_id: updated.id, status: "pending" })
          .onConflict((conflict) => conflict.column("asset_id").doNothing())
          .execute()
        await transaction
          .insertInto("media_processing_jobs")
          .values({ asset_id: updated.id, status: "pending" })
          .onConflict((conflict) => conflict.column("asset_id").doNothing())
          .execute()
      }
      const stored = await this.findAsset(transaction, command.teamId, updated.id)
      if (!stored) return { kind: "not_found" } as const
      await transaction
        .updateTable("asset_multipart_uploads")
        .set({ completed_at: sql<Date>`now()`, updated_at: sql<Date>`now()` })
        .where("asset_id", "=", stored.item.id)
        .execute()
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        stored.item,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "asset.upload.completed",
        stored.item.id,
        { revision: stored.item.revision, checksumSha256 },
      )
      return { item: stored.item, replayed: false }
    })
  }

  async updateAsset(command: UpdateAssetCommand): Promise<UpdateResult<TeamAsset>> {
    return this.database.transaction().execute(async (transaction) => {
      const restoring = command.archived === false
      await this.assertFolder(transaction, command.teamId, command.folderId)
      await this.assertProject(transaction, command.teamId, command.projectId)
      const values: Record<string, unknown> = { updated_at: sql<Date>`now()` }
      if (command.name !== undefined) values.name = command.name.trim()
      if (command.projectId !== undefined) values.project_id = command.projectId
      if (command.folderId !== undefined) values.folder_id = command.folderId
      if (command.favorite !== undefined) values.favorite = command.favorite
      if (command.rating !== undefined) values.rating = command.rating
      if (command.tags !== undefined) {
        values.tags = [...new Set(command.tags.map((tag) => tag.trim()).filter(Boolean))]
      }
      if (command.note !== undefined) values.note = command.note.trim()
      if (command.archived !== undefined) {
        values.archived_at = command.archived ? sql<Date>`now()` : null
      }
      const updated = await transaction
        .updateTable("team_assets")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.assetId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", restoring ? "is not" : "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.missingOrConflict(transaction, command, restoring)
      const stored = await this.findAsset(transaction, command.teamId, updated.id, true)
      if (!stored) return { kind: "not_found" }
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        command.archived === true
          ? "asset.archived"
          : restoring
            ? "asset.restored"
            : "asset.updated",
        stored.item.id,
        { revision: stored.item.revision },
        stored.item.projectId,
      )
      return { kind: "ok", item: stored.item }
    })
  }

  async getLatestMediaAnalysis(
    teamId: string,
    assetId: string,
    kind: Exclude<MediaAnalysisJob["kind"], "frame_capture">,
  ) {
    const row = await this.mediaAnalysisQuery(this.database)
      .where("job.asset_id", "=", assetId)
      .where("asset.team_id", "=", teamId)
      .where("job.kind", "=", kind)
      .orderBy("job.created_at", "desc")
      .executeTakeFirst()
    return row ? this.hydrateMediaAnalysis(this.database, row) : null
  }

  async listMediaAnalysisFrameCaptures(teamId: string, assetId: string) {
    const rows = await this.mediaAnalysisQuery(this.database)
      .where("job.asset_id", "=", assetId)
      .where("asset.team_id", "=", teamId)
      .where("job.kind", "=", "frame_capture")
      .orderBy("job.created_at", "desc")
      .limit(100)
      .execute()
    return Promise.all(rows.map((row) => this.hydrateMediaAnalysis(this.database, row)))
  }

  async createMediaAnalysisJob(command: CreateMediaAnalysisCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `asset.media-analysis.create:${command.assetId}`
      const hash = requestHash(command)
      await this.lockCommand(transaction, command.actorId, domain, command.idempotencyKey)
      const replay = await this.getReceipt<MediaAnalysisJob>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { job: replay, replayed: true }

      await sql`select pg_advisory_xact_lock(hashtextextended(${`media-analysis:${command.assetId}`}, 0))`.execute(
        transaction,
      )
      const active = await this.mediaAnalysisQuery(transaction)
        .where("job.asset_id", "=", command.assetId)
        .where("asset.team_id", "=", command.teamId)
        .where("job.kind", "=", command.kind)
        .where("job.tool", "=", command.tool)
        .where("job.status", "in", ["queued", "processing"])
        .executeTakeFirst()
      if (active) {
        const job = await this.hydrateMediaAnalysis(transaction, active)
        await this.writeReceipt(
          transaction,
          command.actorId,
          domain,
          command.idempotencyKey,
          hash,
          job,
        )
        return { job, replayed: true }
      }

      const row = await transaction
        .insertInto("media_analysis_jobs")
        .values({
          id: randomUUID(),
          asset_id: command.assetId,
          kind: command.kind,
          tool: command.tool,
          trigger_kind: "manual",
          status: "queued",
          triggered_by_account_id: command.actorId,
          source_asset_name: command.sourceAssetName,
          source_checksum_sha256: command.sourceChecksumSha256,
          source_object_key: command.sourceObjectKey,
          source_revision: command.sourceRevision,
          requested_timecode_us:
            command.requestedTimecodeUs === null
              ? null
              : String(command.requestedTimecodeUs),
          available_at: new Date(),
          locked_by: null,
          lease_expires_at: null,
          failure_stage: null,
          last_error: null,
          result_segments: JSON.stringify([]),
          input_object_key: null,
          runtime_version: null,
          model_name: null,
          model_sha256: null,
          language: null,
          processed_at: null,
          completed_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const job = await this.hydrateMediaAnalysis(transaction, {
        ...row,
        team_id: command.teamId,
      })
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        job,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "asset.media-analysis.created",
        job.id,
        {
          assetId: command.assetId,
          sourceChecksumSha256: command.sourceChecksumSha256,
          sourceRevision: command.sourceRevision,
          tool: job.tool,
          requestedTimecodeUs: command.requestedTimecodeUs,
        },
      )
      return { job, replayed: false }
    })
  }

  async retryMediaAnalysisJob(command: UpdateMediaAnalysisCommand) {
    return this.mutateMediaAnalysis(command, "retry")
  }

  async confirmMediaAnalysisJob(command: UpdateMediaAnalysisCommand) {
    return this.mutateMediaAnalysis(command, "confirm")
  }

  async getMediaAnalysisKeyframeObjectKey(
    teamId: string,
    assetId: string,
    jobId: string,
    shotId: string,
  ) {
    const row = await this.database
      .selectFrom("media_analysis_shots as shot")
      .innerJoin("media_analysis_jobs as job", "job.id", "shot.job_id")
      .innerJoin("team_assets as asset", "asset.id", "job.asset_id")
      .select("shot.keyframe_object_key")
      .where("shot.id", "=", shotId)
      .where("job.id", "=", jobId)
      .where("job.asset_id", "=", assetId)
      .where("asset.team_id", "=", teamId)
      .where("asset.archived_at", "is", null)
      .executeTakeFirst()
    return row?.keyframe_object_key ?? null
  }

  private async mutateMediaAnalysis(
    command: UpdateMediaAnalysisCommand,
    action: "retry" | "confirm",
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `asset.media-analysis.${action}:${command.jobId}`
      const hash = requestHash(command)
      await this.lockCommand(transaction, command.actorId, domain, command.idempotencyKey)
      const replay = await this.getReceipt<MediaAnalysisJob>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { job: replay, replayed: true }

      const values =
        action === "retry"
          ? {
              status: "queued" as const,
              max_attempts: sql<number>`attempts + 1`,
              available_at: sql<Date>`now()`,
              locked_by: null,
              lease_expires_at: null,
              failure_stage: null,
              last_error: null,
              shot_count: 0,
              result_text: "",
              result_segments: JSON.stringify([]),
              input_object_key: null,
              provider: null,
              runtime_version: null,
              model_name: null,
              model_sha256: null,
              language: null,
              processed_at: null,
              completed_at: null,
              revision: sql<number>`revision + 1`,
              updated_at: sql<Date>`now()`,
            }
          : {
              status: "completed" as const,
              completed_at: sql<Date>`now()`,
              revision: sql<number>`revision + 1`,
              updated_at: sql<Date>`now()`,
            }
      const row = await transaction
        .updateTable("media_analysis_jobs")
        .set(values)
        .where("id", "=", command.jobId)
        .where("asset_id", "=", command.assetId)
        .where("revision", "=", command.expectedRevision)
        .where("status", "=", action === "retry" ? "failed" : "awaiting_confirmation")
        .returningAll()
        .executeTakeFirst()
      if (!row) return this.mediaAnalysisMutationFailure(transaction, command)

      if (action === "confirm") {
        await transaction
          .updateTable("media_analysis_shots")
          .set({ state: "confirmed" })
          .where("job_id", "=", command.jobId)
          .execute()
        const segments = row.result_segments as MediaAnalysisTextSegment[]
        const embeddingSources =
          row.kind === "shot_detection"
            ? segments
                .filter((segment) => segment.text.trim())
                .map((segment) => ({
                  sourceKind: "vision" as const,
                  sequence: segment.sequence,
                  content: segment.text.trim(),
                }))
            : (row.kind === "transcription" || row.kind === "ocr") &&
                row.result_text.trim()
              ? [
                  {
                    sourceKind: row.kind,
                    sequence: 0,
                    content: row.result_text.trim(),
                  },
                ]
              : []
        if (embeddingSources.length) {
          await transaction
            .insertInto("asset_embedding_jobs")
            .values(
              embeddingSources.map((source) => ({
                id: randomUUID(),
                asset_id: row.asset_id,
                analysis_job_id: row.id,
                source_revision: row.source_revision,
                source_kind: source.sourceKind,
                sequence: source.sequence,
                content_text: source.content,
                input_sha256: createHash("sha256").update(source.content).digest("hex"),
                status: "queued" as const,
                available_at: new Date(),
                locked_by: null,
                lease_expires_at: null,
                provider: null,
                model: null,
                dimensions: null,
                last_error: null,
                created_at: new Date(),
                updated_at: new Date(),
                completed_at: null,
              })),
            )
            .onConflict((conflict) =>
              conflict.columns(["analysis_job_id", "sequence"]).doNothing(),
            )
            .execute()
        }
      }
      const job = await this.hydrateMediaAnalysis(transaction, {
        ...row,
        team_id: command.teamId,
      })
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        job,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        action === "retry"
          ? "asset.media-analysis.retried"
          : "asset.media-analysis.confirmed",
        job.id,
        { assetId: command.assetId, expectedRevision: command.expectedRevision },
      )
      return { job, replayed: false }
    })
  }

  private mediaAnalysisQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("media_analysis_jobs as job")
      .innerJoin("team_assets as asset", "asset.id", "job.asset_id")
      .selectAll("job")
      .select("asset.team_id as team_id")
      .where("asset.archived_at", "is", null)
  }

  private async hydrateMediaAnalysis(
    database: DatabaseExecutor,
    row: MediaAnalysisJobRow,
  ): Promise<MediaAnalysisJob> {
    const shots = await database
      .selectFrom("media_analysis_shots")
      .selectAll()
      .where("job_id", "=", row.id)
      .orderBy("sequence", "asc")
      .execute()
    return this.mapMediaAnalysis(row, shots)
  }

  private mapMediaAnalysis(
    row: MediaAnalysisJobRow,
    shots: MediaAnalysisShotRow[],
  ): MediaAnalysisJob {
    const segments = row.result_segments as MediaAnalysisTextSegment[]
    return {
      id: row.id,
      teamId: row.team_id,
      assetId: row.asset_id,
      kind: row.kind,
      tool: row.tool,
      provider: row.provider,
      triggerKind: row.trigger_kind,
      status: row.status,
      triggeredByAccountId: row.triggered_by_account_id,
      sourceAssetName: row.source_asset_name,
      sourceChecksumSha256: row.source_checksum_sha256,
      sourceRevision: row.source_revision,
      requestedTimecodeUs:
        row.requested_timecode_us === null ? null : Number(row.requested_timecode_us),
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      shotCount: row.shot_count,
      resultText: row.result_text,
      segments,
      runtimeVersion: row.runtime_version,
      modelName: row.model_name,
      modelSha256: row.model_sha256,
      language: row.language,
      failureStage: row.failure_stage,
      lastError: row.last_error,
      revision: row.revision,
      shots: shots.map((shot) => ({
        id: shot.id,
        sequence: shot.sequence,
        startUs: Number(shot.start_us),
        endUs: Number(shot.end_us),
        keyframeUs: Number(shot.keyframe_us),
        keyframeAvailable: Boolean(shot.keyframe_object_key),
        description:
          segments.find((segment) => segment.sequence === shot.sequence)?.text ?? "",
        state: shot.state,
      })),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
      processedAt: toNullableIso(row.processed_at),
      completedAt: toNullableIso(row.completed_at),
    }
  }

  private async mediaAnalysisMutationFailure(
    database: DatabaseExecutor,
    command: UpdateMediaAnalysisCommand,
  ) {
    const row = await database
      .selectFrom("media_analysis_jobs as job")
      .innerJoin("team_assets as asset", "asset.id", "job.asset_id")
      .select(["job.revision", "job.status"])
      .where("job.id", "=", command.jobId)
      .where("job.asset_id", "=", command.assetId)
      .where("asset.team_id", "=", command.teamId)
      .where("asset.archived_at", "is", null)
      .executeTakeFirst()
    if (!row) return { kind: "not_found" as const }
    return row.revision === command.expectedRevision
      ? { kind: "invalid_state" as const }
      : { kind: "conflict" as const }
  }

  private async lockCommand(
    database: DatabaseExecutor,
    actorId: string,
    domain: string,
    key: string,
  ) {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${actorId}:${domain}:${key}`}, 0))`.execute(
      database,
    )
  }

  private assetQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("team_assets as asset")
      .leftJoin("projects as project", "project.id", "asset.project_id")
      .leftJoin("asset_folders as folder", "folder.id", "asset.folder_id")
      .leftJoin("asset_media as media", "media.asset_id", "asset.id")
      .innerJoin("accounts as owner", "owner.id", "asset.created_by_account_id")
      .selectAll("asset")
      .select([
        "project.name as project_name",
        "folder.name as folder_name",
        "owner.display_name as owner_name",
        "media.status as media_status",
        "media.error_message as media_error",
        "media.duration_us as media_duration_us",
        "media.width as media_width",
        "media.height as media_height",
        "media.frame_rate_numerator as media_frame_rate_numerator",
        "media.frame_rate_denominator as media_frame_rate_denominator",
        "media.video_codec as media_video_codec",
        "media.audio_codec as media_audio_codec",
        "media.format_name as media_format_name",
        "media.rotation_degrees as media_rotation_degrees",
        "media.is_vfr as media_is_vfr",
        "media.thumbnail_object_key as media_thumbnail_object_key",
        "media.review_proxy_object_key as media_review_proxy_object_key",
      ])
  }

  private async findAsset(
    database: DatabaseExecutor,
    teamId: string,
    assetId: string,
    includeArchived = false,
  ) {
    let query = this.assetQuery(database)
      .where("asset.id", "=", assetId)
      .where("asset.team_id", "=", teamId)
    if (!includeArchived) query = query.where("asset.archived_at", "is", null)
    const row = await query.executeTakeFirst()
    if (!row) return null
    return {
      item: this.mapAsset(row),
      objectKey: row.object_key,
      thumbnailObjectKey: row.media_thumbnail_object_key,
      reviewProxyObjectKey: row.media_review_proxy_object_key,
    }
  }

  private metadataSearchMatch(
    row: {
      name: string
      note: string
      kind: string
      tags: string[]
      project_name: string | null
      folder_name: string | null
    },
    query: string,
  ): AssetSearchMatch | null {
    const fields = [
      ["名称", row.name],
      ["备注", row.note],
      ["类型", row.kind],
      ["项目", row.project_name ?? ""],
      ["文件夹", row.folder_name ?? ""],
      ["标签", row.tags.join(" · ")],
    ] as const
    const matched = fields.find(([, value]) =>
      value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    return matched
      ? {
          source: "metadata",
          excerpt: `${matched[0]} · ${searchExcerpt(matched[1], query)}`,
        }
      : null
  }

  private mapAsset(
    row: {
      id: string
      team_id: string
      project_id: string | null
      folder_id: string | null
      name: string
      kind: "视频" | "图片" | "音频" | "文档"
      mime_type: string
      size_bytes: number
      checksum_sha256: string | null
      status: "uploading" | "ready" | "failed"
      favorite: boolean
      rating: number
      tags: string[]
      note: string
      thumbnail_url: string | null
      revision: number
      created_at: Date | string
      updated_at: Date | string
      archived_at: Date | string | null
      project_name: string | null
      folder_name: string | null
      owner_name: string
      media_status: "pending" | "processing" | "ready" | "failed" | null
      media_error: string | null
      media_duration_us: string | null
      media_width: number | null
      media_height: number | null
      media_frame_rate_numerator: number | null
      media_frame_rate_denominator: number | null
      media_video_codec: string | null
      media_audio_codec: string | null
      media_format_name: string | null
      media_rotation_degrees: number | null
      media_is_vfr: boolean | null
      media_thumbnail_object_key: string | null
      media_review_proxy_object_key: string | null
    },
    searchMatches: AssetSearchMatch[] = [],
  ): TeamAsset {
    return {
      id: row.id,
      teamId: row.team_id,
      projectId: row.project_id,
      projectName: row.project_name,
      folderId: row.folder_id,
      folderName: row.folder_name,
      name: row.name,
      kind: row.kind,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      checksumSha256: row.checksum_sha256,
      status: row.status,
      favorite: row.favorite,
      rating: row.rating,
      tags: row.tags,
      note: row.note,
      ownerName: row.owner_name,
      thumbnailUrl: row.media_thumbnail_object_key
        ? `/api/v1/teams/${encodeURIComponent(row.team_id)}/assets/${encodeURIComponent(row.id)}/thumbnail`
        : row.thumbnail_url,
      mediaStatus: row.media_status,
      mediaError: row.media_error,
      durationUs: row.media_duration_us === null ? null : Number(row.media_duration_us),
      width: row.media_width,
      height: row.media_height,
      frameRateNumerator: row.media_frame_rate_numerator,
      frameRateDenominator: row.media_frame_rate_denominator,
      videoCodec: row.media_video_codec,
      audioCodec: row.media_audio_codec,
      formatName: row.media_format_name,
      rotationDegrees: row.media_rotation_degrees,
      variableFrameRate: row.media_is_vfr,
      reviewProxyReady: row.media_review_proxy_object_key !== null,
      searchMatches,
      archived: row.archived_at !== null,
      revision: row.revision,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }
  }

  private mapFolder(row: {
    id: string
    team_id: string
    parent_id: string | null
    name: string
    revision: number
    created_at: Date | string
    updated_at: Date | string
    archived_at: Date | string | null
  }): AssetFolder {
    return {
      id: row.id,
      teamId: row.team_id,
      parentId: row.parent_id,
      name: row.name,
      archived: row.archived_at !== null,
      revision: row.revision,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }
  }

  private async assertFolder(
    database: DatabaseExecutor,
    teamId: string,
    folderId: string | null | undefined,
    allowNull = false,
  ) {
    if (folderId === undefined || (folderId === null && allowNull)) return
    if (folderId === null) return
    const folder = await database
      .selectFrom("asset_folders")
      .select("id")
      .where("id", "=", folderId)
      .where("team_id", "=", teamId)
      .where("archived_at", "is", null)
      .forKeyShare()
      .executeTakeFirst()
    if (!folder) {
      throw new AppError("ASSET_FOLDER_NOT_FOUND", "所选文件夹不存在", 404)
    }
  }

  private async assertProject(
    database: DatabaseExecutor,
    teamId: string,
    projectId: string | null | undefined,
  ) {
    if (projectId === undefined || projectId === null) return
    const project = await database
      .selectFrom("projects")
      .select("id")
      .where("id", "=", projectId)
      .where("team_id", "=", teamId)
      .executeTakeFirst()
    if (!project) {
      throw new AppError("PROJECT_NOT_FOUND", "所选项目不属于当前团队", 404)
    }
  }

  private async missingOrConflict(
    database: DatabaseExecutor,
    command: { teamId: string; assetId: string },
    archived = false,
  ) {
    const current = await database
      .selectFrom("team_assets")
      .select(["revision", "archived_at"])
      .where("id", "=", command.assetId)
      .where("team_id", "=", command.teamId)
      .executeTakeFirst()
    if (!current || (current.archived_at !== null) !== archived) {
      return { kind: "not_found" } as const
    }
    return { kind: "conflict" } as const
  }

  private async getReceipt<T>(
    database: DatabaseExecutor,
    actorId: string,
    domain: string,
    key: string,
    hash: string,
  ) {
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
    response: TeamAsset | AssetFolder | MediaAnalysisJob,
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

  private async writeAudit(
    database: DatabaseExecutor,
    actorId: string,
    teamId: string,
    action: string,
    subjectId: string,
    metadata: Record<string, unknown>,
    projectId: string | null = null,
  ) {
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: actorId,
        team_id: teamId,
        project_id: projectId,
        action,
        subject_id: subjectId,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }
}
