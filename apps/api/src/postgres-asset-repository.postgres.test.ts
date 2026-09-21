import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { claimEmbeddingJob, processEmbeddingJob, processJob } from "./media-worker"
import { PostgresAssetRepository } from "./postgres-asset-repository"
import type { S3AssetStorage } from "./s3-asset-storage"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 4 })
const database = createDatabase(databaseUrl, pool)
const repository = new PostgresAssetRepository(database)
const runId = `pg-asset-text-${process.pid}-${Date.now().toString(36)}`
const teamId = `${runId}-team`
const actorId = `${runId}-actor`
const assetId = `${runId}-asset`
const objectKey = `teams/${teamId}/originals/${assetId}`
const checksum = "a".repeat(64)
const semanticProjectId = `${runId}-semantic-project`
const otherProjectId = `${runId}-other-project`
const otherTeamId = `${runId}-other-team`
const semanticAssetIds = {
  exact: `${runId}-semantic-exact`,
  near: `${runId}-semantic-near`,
  otherProject: `${runId}-semantic-other-project`,
  otherTeam: `${runId}-semantic-other-team`,
}

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values({ id: actorId, display_name: "Media Text Writer", email: null })
    .execute()
  await database.insertInto("teams").values({ id: teamId, name: runId }).execute()
  await database
    .insertInto("team_assets")
    .values({
      id: assetId,
      team_id: teamId,
      project_id: null,
      folder_id: null,
      name: "Interview source.mp4",
      kind: "视频",
      mime_type: "video/mp4",
      size_bytes: 256,
      object_key: objectKey,
      checksum_sha256: checksum,
      status: "ready",
      favorite: false,
      rating: 0,
      tags: [],
      note: "",
      thumbnail_url: null,
      created_by_account_id: actorId,
      revision: 1,
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
    })
    .execute()
  await database
    .insertInto("teams")
    .values({ id: otherTeamId, name: otherTeamId })
    .execute()
  await database
    .insertInto("projects")
    .values([
      { id: semanticProjectId, team_id: teamId, name: "Semantic", status: "拍摄中" },
      { id: otherProjectId, team_id: teamId, name: "Other", status: "拍摄中" },
    ])
    .execute()
  await database
    .insertInto("team_assets")
    .values(
      [
        [semanticAssetIds.exact, teamId, semanticProjectId, "Exact match"],
        [semanticAssetIds.near, teamId, semanticProjectId, "Near match"],
        [semanticAssetIds.otherProject, teamId, otherProjectId, "Other project"],
        [semanticAssetIds.otherTeam, otherTeamId, null, "Other team"],
      ].map(([id, assetTeamId, projectId, name]) => ({
        id: id as string,
        team_id: assetTeamId as string,
        project_id: projectId,
        folder_id: null,
        name: name as string,
        kind: "视频",
        mime_type: "video/mp4",
        size_bytes: 128,
        object_key: `teams/${assetTeamId}/originals/${id}`,
        checksum_sha256: checksum,
        status: "ready",
        favorite: false,
        rating: 0,
        tags: [],
        note: "",
        thumbnail_url: null,
        created_by_account_id: actorId,
        revision: 1,
        created_at: new Date(),
        updated_at: new Date(),
        archived_at: null,
      })),
    )
    .execute()
})

afterAll(async () => {
  await database.deleteFrom("teams").where("id", "=", teamId).execute()
  await database.deleteFrom("teams").where("id", "=", otherTeamId).execute()
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "=", actorId)
    .where("domain", "like", "asset.media-analysis.%")
    .execute()
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "=", actorId)
    .where("domain", "=", `asset-folder.create:${teamId}`)
    .execute()
  await database.deleteFrom("accounts").where("id", "=", actorId).execute()
  await database.destroy()
})

describe("Postgres asset text analysis", () => {
  it("does not let a stale media attempt overwrite its replacement", async () => {
    await database
      .insertInto("asset_media")
      .values({ asset_id: assetId, status: "ready" })
      .execute()
    await database
      .insertInto("media_processing_jobs")
      .values({
        asset_id: assetId,
        status: "processing",
        attempts: 2,
        locked_by: "new-worker",
        lease_expires_at: new Date(Date.now() + 900000),
      })
      .execute()
    const storage = {
      async downloadObjectToFile() {
        throw new Error("download interrupted")
      },
    } as unknown as S3AssetStorage
    try {
      await processJob(
        database,
        storage,
        {
          workerId: "old-worker",
          assetId,
          teamId,
          kind: "视频",
          mimeType: "video/mp4",
          objectKey,
          createdByAccountId: actorId,
          attempts: 1,
          maxAttempts: 3,
        },
        new AbortController().signal,
      )
      expect(
        await database
          .selectFrom("media_processing_jobs")
          .select(["status", "attempts", "locked_by"])
          .where("asset_id", "=", assetId)
          .executeTakeFirst(),
      ).toEqual({ status: "processing", attempts: 2, locked_by: "new-worker" })
      expect(
        await database
          .selectFrom("asset_media")
          .select("status")
          .where("asset_id", "=", assetId)
          .executeTakeFirst(),
      ).toEqual({ status: "ready" })
    } finally {
      await database
        .deleteFrom("media_processing_jobs")
        .where("asset_id", "=", assetId)
        .execute()
      await database.deleteFrom("asset_media").where("asset_id", "=", assetId).execute()
    }
  })
  it("keeps legacy local-model tool markers read-only", async () => {
    const insertLegacy = (id: string, status: "queued" | "completed") =>
      pool.query(
        `INSERT INTO media_analysis_jobs (
          id, asset_id, kind, tool, trigger_kind, status,
          triggered_by_account_id, source_asset_name, source_checksum_sha256,
          source_object_key, source_revision
        ) VALUES ($1, $2, 'transcription', 'whisper_cpp_v1', 'manual', $3, $4, $5, $6, $7, 1)`,
        [id, assetId, status, actorId, "Legacy transcript", checksum, objectKey],
      )

    await expect(
      insertLegacy(`${runId}-legacy-runnable`, "queued"),
    ).rejects.toMatchObject({
      code: "23514",
    })

    const historicalId = `${runId}-legacy-history`
    await insertLegacy(historicalId, "completed")
    const historical = await database
      .selectFrom("media_analysis_jobs")
      .select(["tool", "status"])
      .where("id", "=", historicalId)
      .executeTakeFirstOrThrow()
    expect(historical).toEqual({ tool: "whisper_cpp_v1", status: "completed" })
  })

  it("upserts and searches current embeddings without crossing actor scope", async () => {
    const provider = `provider-${runId}`
    const model = `model-${runId}`
    const save = (
      targetAssetId: string,
      targetTeamId: string,
      content: string,
      embedding: number[],
    ) =>
      repository.saveAssetEmbedding({
        actorId,
        teamId: targetTeamId,
        assetId: targetAssetId,
        sourceRevision: 1,
        sourceKind: "metadata",
        sequence: 0,
        content,
        inputSha256: checksum,
        provider,
        model,
        embedding,
      })

    await Promise.all([
      save(semanticAssetIds.exact, teamId, "exact", [1, 0]),
      save(semanticAssetIds.near, teamId, "near", [0.8, 0.2]),
      save(semanticAssetIds.otherProject, teamId, "other project", [1, 0]),
      save(semanticAssetIds.otherTeam, otherTeamId, "other team", [1, 0]),
    ])

    const projectMatches = await repository.semanticSearchAssets(
      teamId,
      semanticProjectId,
      provider,
      model,
      [1, 0],
      10,
    )
    expect(projectMatches.map((match) => match.item.id)).toEqual([
      semanticAssetIds.exact,
      semanticAssetIds.near,
    ])
    expect(projectMatches[0]).toMatchObject({ score: 1, excerpt: "exact" })
    expect(
      (
        await repository.semanticSearchAssets(
          otherTeamId,
          undefined,
          provider,
          model,
          [1, 0],
          10,
        )
      ).map((match) => match.item.id),
    ).toEqual([semanticAssetIds.otherTeam])
    expect(
      await repository.semanticSearchAssets(
        teamId,
        semanticProjectId,
        provider,
        "other-model",
        [1, 0],
        10,
      ),
    ).toEqual([])
    expect(
      await repository.semanticSearchAssets(
        teamId,
        semanticProjectId,
        provider,
        model,
        [1, 0, 0],
        10,
      ),
    ).toEqual([])

    await save(semanticAssetIds.exact, teamId, "updated", [0, 1])
    const updatedMatches = await repository.semanticSearchAssets(
      teamId,
      semanticProjectId,
      provider,
      model,
      [1, 0],
      10,
    )
    expect(updatedMatches[0]?.item.id).toBe(semanticAssetIds.near)
    expect(
      updatedMatches.find((match) => match.item.id === semanticAssetIds.exact)?.excerpt,
    ).toBe("updated")

    await database
      .updateTable("team_assets")
      .set({ revision: 2 })
      .where("id", "=", semanticAssetIds.exact)
      .execute()
    expect(
      (
        await repository.semanticSearchAssets(
          teamId,
          semanticProjectId,
          provider,
          model,
          [1, 0],
          10,
        )
      ).map((match) => match.item.id),
    ).toEqual([semanticAssetIds.near])
  })

  it("persists provenance and searches only confirmed current-source text", async () => {
    const created = await repository.createMediaAnalysisJob({
      actorId,
      teamId,
      assetId,
      kind: "transcription",
      tool: "openai_compatible_transcription_v1",
      idempotencyKey: `${runId}-create`,
      expectedRevision: 1,
      requestedTimecodeUs: null,
      sourceAssetName: "Interview source.mp4",
      sourceChecksumSha256: checksum,
      sourceObjectKey: objectKey,
      sourceRevision: 1,
    })
    const resultText = `confirmed-${runId}`
    const segments = [
      {
        sequence: 1,
        startUs: 0,
        endUs: 1_000_000,
        text: resultText,
        confidence: null,
      },
    ]
    await database
      .updateTable("media_analysis_jobs")
      .set({
        status: "awaiting_confirmation",
        result_text: resultText,
        result_segments: JSON.stringify(segments),
        input_object_key: `teams/${teamId}/derived/${assetId}/audio.wav`,
        provider: "compatible-api",
        runtime_version: "openai-compatible",
        model_name: "transcription-model",
        model_sha256: null,
        language: "zh",
        processed_at: new Date(),
        revision: 2,
      })
      .where("id", "=", created.job.id)
      .execute()

    const candidate = await repository.getLatestMediaAnalysis(
      teamId,
      assetId,
      "transcription",
    )
    expect(candidate).toMatchObject({
      status: "awaiting_confirmation",
      resultText,
      segments,
      provider: "compatible-api",
      runtimeVersion: "openai-compatible",
      modelName: "transcription-model",
      modelSha256: null,
      language: "zh",
    })
    expect((await repository.listAssets(teamId, false, resultText)).items).toEqual([])

    const confirmed = await repository.confirmMediaAnalysisJob({
      actorId,
      teamId,
      assetId,
      jobId: created.job.id,
      expectedRevision: 2,
      idempotencyKey: `${runId}-confirm`,
    })
    expect(confirmed).toMatchObject({
      job: { status: "completed", resultText, segments },
      replayed: false,
    })
    const embeddingJob = await database
      .selectFrom("asset_embedding_jobs")
      .select([
        "id",
        "asset_id",
        "analysis_job_id",
        "source_revision",
        "source_kind",
        "content_text",
        "status",
        "attempts",
      ])
      .where("analysis_job_id", "=", created.job.id)
      .executeTakeFirstOrThrow()
    expect(embeddingJob).toEqual({
      id: expect.any(String),
      asset_id: assetId,
      analysis_job_id: created.job.id,
      source_revision: 1,
      source_kind: "transcription",
      content_text: resultText,
      status: "queued",
      attempts: 0,
    })
    const workerId = `${runId}-worker`
    const previousEnvironment = {
      EMBEDDING_API_BASE_URL: process.env.EMBEDDING_API_BASE_URL,
      EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY,
      EMBEDDING_API_PROVIDER: process.env.EMBEDDING_API_PROVIDER,
      EMBEDDING_API_MODEL: process.env.EMBEDDING_API_MODEL,
      EMBEDDING_API_TIMEOUT_MS: process.env.EMBEDDING_API_TIMEOUT_MS,
    }
    Object.assign(process.env, {
      EMBEDDING_API_BASE_URL: "https://models.example.test/v1",
      EMBEDDING_API_KEY: "postgres-test-secret",
      EMBEDDING_API_PROVIDER: "compatible-api",
      EMBEDDING_API_MODEL: "embedding-model",
      EMBEDDING_API_TIMEOUT_MS: "1000",
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    try {
      const claimed = await claimEmbeddingJob(database, workerId)
      expect(claimed).toMatchObject({
        id: embeddingJob.id,
        assetId,
        analysisJobId: created.job.id,
        attempts: 1,
        maxAttempts: 3,
      })
      if (!claimed) throw new Error("Expected queued embedding job to be claimed")
      fetchMock.mockResolvedValueOnce(
        Response.json({ data: [{ embedding: [0.5, 0.25] }] }),
      )
      await processEmbeddingJob(database, claimed, workerId, new AbortController().signal)
      expect(
        await database
          .selectFrom("asset_embedding_jobs")
          .select(["status", "provider", "model", "dimensions"])
          .where("id", "=", embeddingJob.id)
          .executeTakeFirst(),
      ).toEqual({
        status: "succeeded",
        provider: "compatible-api",
        model: "embedding-model",
        dimensions: 2,
      })

      await database
        .updateTable("asset_embedding_jobs")
        .set({ status: "processing", attempts: 2, locked_by: workerId })
        .where("id", "=", embeddingJob.id)
        .execute()
      fetchMock.mockRejectedValueOnce(new Error("provider postgres-test-secret"))
      await processEmbeddingJob(
        database,
        { ...claimed, attempts: 2 },
        workerId,
        new AbortController().signal,
      )
      expect(
        await database
          .selectFrom("asset_embedding_jobs")
          .select(["status", "attempts", "last_error"])
          .where("id", "=", embeddingJob.id)
          .executeTakeFirst(),
      ).toEqual({
        status: "queued",
        attempts: 2,
        last_error: "向量生成 API 请求失败或超时",
      })

      await database
        .updateTable("asset_embedding_jobs")
        .set({ status: "processing", attempts: 3, locked_by: workerId })
        .where("id", "=", embeddingJob.id)
        .execute()
      fetchMock.mockRejectedValueOnce(new Error("provider postgres-test-secret"))
      await expect(
        processEmbeddingJob(
          database,
          { ...claimed, attempts: 3 },
          workerId,
          new AbortController().signal,
        ),
      ).rejects.toThrow("向量生成 API 请求失败或超时")
      expect(
        await database
          .selectFrom("asset_embedding_jobs")
          .select(["status", "attempts", "last_error"])
          .where("id", "=", embeddingJob.id)
          .executeTakeFirst(),
      ).toEqual({
        status: "failed",
        attempts: 3,
        last_error: "向量生成 API 请求失败或超时",
      })

      await database
        .updateTable("asset_embedding_jobs")
        .set({
          status: "processing",
          attempts: 3,
          locked_by: "expired-worker",
          lease_expires_at: new Date(Date.now() - 60_000),
        })
        .where("id", "=", embeddingJob.id)
        .execute()
      expect(await claimEmbeddingJob(database, workerId)).toBeNull()
      expect(
        await database
          .selectFrom("asset_embedding_jobs")
          .select(["status", "last_error"])
          .where("id", "=", embeddingJob.id)
          .executeTakeFirst(),
      ).toEqual({
        status: "failed",
        last_error: "处理租约过期且已达到最大尝试次数",
      })
    } finally {
      vi.unstubAllGlobals()
      for (const [name, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
    expect((await repository.listAssets(teamId, false, resultText)).items).toEqual([
      expect.objectContaining({
        id: assetId,
        searchMatches: [
          expect.objectContaining({ source: "transcription", excerpt: resultText }),
        ],
      }),
    ])

    await database
      .updateTable("team_assets")
      .set({ revision: 2 })
      .where("id", "=", assetId)
      .execute()
    await database
      .updateTable("asset_embedding_jobs")
      .set({
        status: "queued",
        attempts: 0,
        locked_by: null,
        lease_expires_at: null,
        available_at: new Date(0),
      })
      .where("id", "=", embeddingJob.id)
      .execute()
    expect(await claimEmbeddingJob(database, `${runId}-revision-worker`)).toBeNull()
    expect(
      await database
        .selectFrom("asset_embedding_jobs")
        .select("status")
        .where("id", "=", embeddingJob.id)
        .executeTakeFirst(),
    ).toEqual({ status: "expired" })
    expect((await repository.listAssets(teamId, false, resultText)).items).toEqual([])
  })

  it("embeds confirmed shot descriptions and returns the matching timecode", async () => {
    const visionAssetId = `${runId}-vision-asset`
    await database
      .insertInto("team_assets")
      .values({
        id: visionAssetId,
        team_id: teamId,
        project_id: semanticProjectId,
        folder_id: null,
        name: "Vision source.mp4",
        kind: "视频",
        mime_type: "video/mp4",
        size_bytes: 256,
        object_key: `teams/${teamId}/originals/${visionAssetId}`,
        checksum_sha256: checksum,
        status: "ready",
        favorite: false,
        rating: 0,
        tags: [],
        note: "",
        thumbnail_url: null,
        created_by_account_id: actorId,
        revision: 1,
        created_at: new Date(),
        updated_at: new Date(),
        archived_at: null,
      })
      .execute()
    const created = await repository.createMediaAnalysisJob({
      actorId,
      teamId,
      assetId: visionAssetId,
      kind: "shot_detection",
      tool: "ffmpeg_scene_v1",
      idempotencyKey: `${runId}-vision-create`,
      expectedRevision: 1,
      requestedTimecodeUs: null,
      sourceAssetName: "Vision source.mp4",
      sourceChecksumSha256: checksum,
      sourceObjectKey: `teams/${teamId}/originals/${visionAssetId}`,
      sourceRevision: 1,
    })
    const descriptions = ["雨夜车站的中景人物", "明亮咖啡店的桌面特写"]
    const segments = descriptions.map((text, index) => ({
      sequence: index + 1,
      startUs: index * 1_000_000,
      endUs: (index + 1) * 1_000_000,
      text,
      confidence: null,
    }))
    await database.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("media_analysis_shots")
        .values(
          descriptions.map((_, index) => ({
            id: `${runId}-vision-shot-${index + 1}`,
            job_id: created.job.id,
            sequence: index + 1,
            start_us: String(index * 1_000_000),
            end_us: String((index + 1) * 1_000_000),
            keyframe_us: String(index * 1_000_000 + 500_000),
            keyframe_object_key: `vision-shot-${index + 1}.jpg`,
            state: "candidate" as const,
            created_at: new Date(),
          })),
        )
        .execute()
      await transaction
        .updateTable("media_analysis_jobs")
        .set({
          status: "awaiting_confirmation",
          shot_count: descriptions.length,
          result_text: descriptions.join("\n"),
          result_segments: JSON.stringify(segments),
          provider: "vision-provider",
          runtime_version: "openai-compatible",
          model_name: "vision-model",
          processed_at: new Date(),
          revision: 2,
        })
        .where("id", "=", created.job.id)
        .execute()
    })

    await repository.confirmMediaAnalysisJob({
      actorId,
      teamId,
      assetId: visionAssetId,
      jobId: created.job.id,
      expectedRevision: 2,
      idempotencyKey: `${runId}-vision-confirm`,
    })
    expect(
      await database
        .selectFrom("asset_embedding_jobs")
        .select(["source_kind", "sequence", "content_text", "status"])
        .where("analysis_job_id", "=", created.job.id)
        .orderBy("sequence")
        .execute(),
    ).toEqual([
      {
        source_kind: "vision",
        sequence: 1,
        content_text: descriptions[0],
        status: "queued",
      },
      {
        source_kind: "vision",
        sequence: 2,
        content_text: descriptions[1],
        status: "queued",
      },
    ])

    const previousEnvironment = {
      EMBEDDING_API_BASE_URL: process.env.EMBEDDING_API_BASE_URL,
      EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY,
      EMBEDDING_API_PROVIDER: process.env.EMBEDDING_API_PROVIDER,
      EMBEDDING_API_MODEL: process.env.EMBEDDING_API_MODEL,
    }
    Object.assign(process.env, {
      EMBEDDING_API_BASE_URL: "https://models.example.test/v1",
      EMBEDDING_API_KEY: "vision-test-secret",
      EMBEDDING_API_PROVIDER: "vision-search-provider",
      EMBEDDING_API_MODEL: "vision-search-model",
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { input: string }
        return Response.json({
          data: [{ embedding: body.input === descriptions[0] ? [1, 0] : [0, 1] }],
        })
      }),
    )
    try {
      for (let index = 0; index < descriptions.length; index += 1) {
        const workerId = `${runId}-vision-worker-${index}`
        const claimed = await claimEmbeddingJob(database, workerId)
        if (!claimed) throw new Error("Expected queued vision embedding job")
        await processEmbeddingJob(
          database,
          claimed,
          workerId,
          new AbortController().signal,
        )
      }
    } finally {
      vi.unstubAllGlobals()
      for (const [name, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }

    const matches = await repository.semanticSearchAssets(
      teamId,
      semanticProjectId,
      "vision-search-provider",
      "vision-search-model",
      [1, 0],
      10,
    )
    expect(matches[0]).toMatchObject({
      item: { id: visionAssetId },
      source: "vision",
      sequence: 1,
      timecodeUs: 500_000,
      excerpt: descriptions[0],
      score: 1,
    })
    expect(
      (await repository.listAssets(teamId, false, "雨夜车站")).items[0],
    ).toMatchObject({
      id: visionAssetId,
      searchMatches: [{ source: "vision", excerpt: expect.stringContaining("雨夜车站") }],
    })
  })

  it("archives and restores empty folders without breaking contained resources", async () => {
    const created = await repository.createFolder({
      actorId,
      teamId,
      name: `Archive ${runId}`,
      parentId: null,
      idempotencyKey: `${runId}-folder-create`,
    })
    await database
      .updateTable("team_assets")
      .set({ folder_id: created.item.id })
      .where("id", "=", assetId)
      .execute()
    await expect(
      repository.updateFolder({
        actorId,
        teamId,
        folderId: created.item.id,
        archived: true,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "ASSET_FOLDER_NOT_EMPTY" })
    await database
      .updateTable("team_assets")
      .set({ folder_id: null })
      .where("id", "=", assetId)
      .execute()

    const childId = `${runId}-child`
    await database
      .insertInto("asset_folders")
      .values({
        id: childId,
        team_id: teamId,
        parent_id: created.item.id,
        name: "Child",
        created_by_account_id: actorId,
      })
      .execute()
    await expect(
      repository.updateFolder({
        actorId,
        teamId,
        folderId: created.item.id,
        archived: true,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "ASSET_FOLDER_NOT_EMPTY" })
    await database.deleteFrom("asset_folders").where("id", "=", childId).execute()

    const archived = await repository.updateFolder({
      actorId,
      teamId,
      folderId: created.item.id,
      archived: true,
      expectedRevision: 1,
    })
    expect(archived).toMatchObject({
      kind: "ok",
      item: { archived: true, revision: 2 },
    })
    expect((await repository.listAssets(teamId, false)).folders).toEqual([])
    expect((await repository.listAssets(teamId, true)).folders).toEqual([
      expect.objectContaining({ id: created.item.id, archived: true, revision: 2 }),
    ])
    expect(
      await repository.updateFolder({
        actorId,
        teamId,
        folderId: created.item.id,
        archived: false,
        expectedRevision: 1,
      }),
    ).toEqual({ kind: "conflict" })
    expect(
      await repository.updateFolder({
        actorId,
        teamId,
        folderId: created.item.id,
        archived: false,
        expectedRevision: 2,
      }),
    ).toMatchObject({ kind: "ok", item: { archived: false, revision: 3 } })
    const auditActions = await database
      .selectFrom("audit_logs")
      .select("action")
      .where("team_id", "=", teamId)
      .where("subject_id", "=", created.item.id)
      .orderBy("id")
      .execute()
    expect(auditActions.map((row) => row.action)).toEqual([
      "asset.folder.created",
      "asset.folder.archived",
      "asset.folder.restored",
    ])
  })
})
