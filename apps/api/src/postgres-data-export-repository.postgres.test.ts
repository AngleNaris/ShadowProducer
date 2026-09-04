import { DataExportService } from "@shadowproducer/application"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { PostgresDataExportRepository } from "./postgres-data-export-repository"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 4 })
const database = createDatabase(databaseUrl, pool)
const repository = new PostgresDataExportRepository(database)
const service = new DataExportService(repository)
const runId = `pg-export-${process.pid}-${Date.now().toString(36)}`
const teamId = `${runId}-team`
const actorId = `${runId}-actor`
const outsiderId = `${runId}-outsider`
const contactOwnerId = `${runId}-contact-owner`
const visibleProjectId = `${runId}-visible`
const hiddenProjectId = `${runId}-hidden`
const visibleDocumentId = `${visibleProjectId}-document`
const hiddenDocumentId = `${hiddenProjectId}-document`
const sharedContactId = `${runId}-shared-contact`
const assetId = `${runId}-asset`
const mediaAnalysisJobId = `${runId}-media-analysis`
const assetEmbeddingId = `${runId}-embedding`
const reviewFileId = `${runId}-review-file`
const reviewCommentId = `${runId}-review-comment`
const reviewReplyId = `${runId}-review-reply`
const portfolioId = `${runId}-portfolio`

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values([
      { id: actorId, display_name: "Export Reader", email: "reader@example.test" },
      { id: outsiderId, display_name: "Outsider", email: "outsider@example.test" },
      {
        id: contactOwnerId,
        display_name: "Contact Owner",
        email: "owner@example.test",
      },
    ])
    .execute()
  await database.insertInto("teams").values({ id: teamId, name: runId }).execute()
  await database
    .insertInto("team_memberships")
    .values([
      { team_id: teamId, account_id: actorId, role: "viewer" },
      { team_id: teamId, account_id: contactOwnerId, role: "member" },
    ])
    .execute()
  await database
    .insertInto("notification_preferences")
    .values({
      account_id: actorId,
      team_id: teamId,
      published_call_sheets: false,
      important_call_sheet_changes: true,
      permission_assignments: false,
      portfolio_publications: true,
      review_activity: false,
      contact_sharing: true,
    })
    .execute()
  await database
    .insertInto("projects")
    .values([
      { id: visibleProjectId, team_id: teamId, name: "Visible Project" },
      { id: hiddenProjectId, team_id: teamId, name: "Hidden Project" },
    ])
    .execute()
  await database
    .insertInto("project_memberships")
    .values([
      { project_id: visibleProjectId, account_id: actorId, role: "viewer" },
      { project_id: hiddenProjectId, account_id: contactOwnerId, role: "producer" },
    ])
    .execute()
  await database
    .insertInto("script_documents")
    .values([
      {
        id: visibleDocumentId,
        project_id: visibleProjectId,
        title: "Visible Script",
        current_version_id: "v1",
      },
      {
        id: hiddenDocumentId,
        project_id: hiddenProjectId,
        title: "Hidden Script",
        current_version_id: "v1",
      },
    ])
    .execute()
  await database
    .insertInto("script_versions")
    .values([
      {
        project_id: visibleProjectId,
        id: "v1",
        document_id: visibleDocumentId,
        meta: "visible",
        badge: "当前",
        content: "VISIBLE_SCRIPT_CONTENT",
        revision: 1,
        is_current: true,
      },
      {
        project_id: hiddenProjectId,
        id: "v1",
        document_id: hiddenDocumentId,
        meta: "hidden",
        badge: "当前",
        content: "HIDDEN_SCRIPT_SECRET",
        revision: 1,
        is_current: true,
      },
    ])
    .execute()
  await database
    .insertInto("personal_contacts")
    .values({
      id: sharedContactId,
      owner_account_id: contactOwnerId,
      name: "Shared Name",
      role: "PRIVATE_ROLE",
      company: "Shared Company",
      phone: "PRIVATE_PHONE",
      email: "PRIVATE_EMAIL@example.test",
    })
    .execute()
  await database
    .insertInto("contact_team_shares")
    .values({
      contact_id: sharedContactId,
      team_id: teamId,
      shared_fields: ["name", "company"],
      allow_project_link: true,
    })
    .execute()
  await database
    .insertInto("team_assets")
    .values({
      id: assetId,
      team_id: teamId,
      project_id: visibleProjectId,
      name: "Visible Asset",
      kind: "视频",
      mime_type: "video/mp4",
      size_bytes: 128,
      object_key: "PRIVATE_OBJECT_KEY",
      checksum_sha256: "safe-checksum",
      status: "ready",
      favorite: false,
      rating: 0,
      tags: [],
      note: "",
      created_by_account_id: actorId,
    })
    .execute()
  await database
    .insertInto("media_analysis_jobs")
    .values({
      id: mediaAnalysisJobId,
      asset_id: assetId,
      kind: "transcription",
      tool: "openai_compatible_transcription_v1",
      provider: "export-provider",
      trigger_kind: "manual",
      status: "completed",
      triggered_by_account_id: actorId,
      source_asset_name: "Visible Asset",
      source_checksum_sha256: "a".repeat(64),
      source_object_key: "PRIVATE_ANALYSIS_OBJECT_KEY",
      source_revision: 1,
      requested_timecode_us: null,
      locked_by: null,
      lease_expires_at: null,
      failure_stage: null,
      last_error: null,
      result_text: "Visible transcript",
      result_segments: JSON.stringify([
        {
          sequence: 1,
          startUs: 0,
          endUs: 1_000_000,
          text: "Visible transcript",
          confidence: 0.98,
        },
      ]),
      input_object_key: "PRIVATE_ANALYSIS_INPUT_KEY",
      runtime_version: "openai-compatible",
      model_name: "export-model",
      model_sha256: "b".repeat(64),
      language: "zh",
      processed_at: new Date("2026-09-01T08:00:00.000Z"),
      completed_at: new Date("2026-09-01T08:00:01.000Z"),
    })
    .execute()
  await pool.query(
    `INSERT INTO asset_embeddings (
      id, asset_id, source_revision, source_kind, sequence, content_text,
      input_sha256, provider, model, dimensions, embedding
    ) VALUES ($1, $2, 1, 'transcription', 0, $3, $4, $5, $6, 2, $7::vector)`,
    [
      assetEmbeddingId,
      assetId,
      "Visible transcript",
      "c".repeat(64),
      "export-provider",
      "export-model",
      "[1,0]",
    ],
  )
  await database
    .insertInto("review_files")
    .values({
      id: reviewFileId,
      project_id: visibleProjectId,
      name: "Archived review",
      version: "v1",
      type: "video",
      status: "已通过",
      archived_at: new Date("2026-09-01T09:00:00.000Z"),
    })
    .execute()
  await database
    .insertInto("review_comments")
    .values([
      {
        id: reviewCommentId,
        project_id: visibleProjectId,
        file_id: reviewFileId,
        version: "v1",
        author_account_id: actorId,
        timecode: "00:01.000",
        text: "Root feedback",
        state: "open",
        idempotency_key: `${runId}-review-root`,
        request_hash: null,
      },
      {
        id: reviewReplyId,
        project_id: visibleProjectId,
        file_id: reviewFileId,
        parent_comment_id: reviewCommentId,
        version: "v1",
        author_account_id: actorId,
        timecode: "00:01.000",
        text: "Reply feedback",
        state: "open",
        idempotency_key: `${runId}-review-reply`,
        request_hash: null,
      },
    ])
    .execute()
  await database
    .insertInto("team_portfolios")
    .values({
      id: portfolioId,
      team_id: teamId,
      title: "Export portfolio",
      category: "Commercial",
      year: "2026",
      description: "Visible portfolio",
      theme_preset: "screening",
      seo_title: "Export SEO title",
      seo_description: "Export SEO description",
      custom_domain: `${runId}.example.test`,
      domain_verification_record: `_shadowproducer.${runId}.example.test`,
      domain_verification_status: "pending",
      domain_verified_at: null,
      state: "团队可见",
      created_by_account_id: actorId,
      published_by_account_id: null,
      archived_at: null,
    })
    .execute()
  await database
    .insertInto("portfolio_daily_views")
    .values({
      portfolio_id: portfolioId,
      view_date: "2026-09-01",
      views: 7,
      unique_visitors: 3,
    })
    .execute()
  await database
    .insertInto("command_receipts")
    .values({
      actor_account_id: actorId,
      domain: `${runId}-secret-receipt`,
      idempotency_key: `${runId}-idempotency`,
      request_hash: "PRIVATE_REQUEST_HASH",
      response: JSON.stringify({ secret: "PRIVATE_RECEIPT_CONTENT" }),
    })
    .execute()
  await database
    .insertInto("audit_logs")
    .values({
      actor_account_id: actorId,
      team_id: teamId,
      project_id: visibleProjectId,
      action: "test.sensitive-metadata",
      subject_id: runId,
      metadata: JSON.stringify({
        label: "safe audit label",
        nested: { tokenHash: "PRIVATE_AUDIT_TOKEN", objectKey: "PRIVATE_AUDIT_KEY" },
      }),
    })
    .execute()
})

afterAll(async () => {
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "=", actorId)
    .where("domain", "=", `${runId}-secret-receipt`)
    .execute()
  await database.deleteFrom("teams").where("id", "=", teamId).execute()
  await database
    .deleteFrom("accounts")
    .where("id", "in", [actorId, outsiderId, contactOwnerId])
    .execute()
  await database.destroy()
})

describe("Postgres business-data export", () => {
  it("exports all visible domains while excluding hidden projects and secrets", async () => {
    const exported = await service.createTeamDataExport(actorId, teamId)
    const serialized = JSON.stringify(exported)

    expect(exported.scope).toMatchObject({
      teamId,
      teamName: runId,
      projectIds: [visibleProjectId],
    })
    expect(exported.data.scriptVersions).toEqual([
      expect.objectContaining({ content: "VISIBLE_SCRIPT_CONTENT" }),
    ])
    expect(exported.data.sharedContacts).toEqual([
      expect.objectContaining({
        name: "Shared Name",
        company: "Shared Company",
        role: null,
        phone: null,
        email: null,
      }),
    ])
    expect(exported.data.notificationPreferences).toEqual([
      {
        teamId,
        publishedCallSheets: false,
        importantCallSheetChanges: true,
        permissionAssignments: false,
        portfolioPublications: true,
        reviewActivity: false,
        contactSharing: true,
      },
    ])
    expect(exported.data.mediaAnalysisJobs).toEqual([
      expect.objectContaining({
        id: mediaAnalysisJobId,
        provider: "export-provider",
        resultText: "Visible transcript",
        runtimeVersion: "openai-compatible",
        modelName: "export-model",
        language: "zh",
      }),
    ])
    expect(exported.data.mediaAnalysisJobs?.[0]).not.toHaveProperty("sourceObjectKey")
    expect(exported.data.mediaAnalysisJobs?.[0]).not.toHaveProperty("inputObjectKey")
    expect(exported.data.assetEmbeddings).toEqual([
      expect.objectContaining({
        id: assetEmbeddingId,
        assetId,
        sourceKind: "transcription",
        contentText: "Visible transcript",
        provider: "export-provider",
        model: "export-model",
        dimensions: 2,
      }),
    ])
    expect(exported.data.assetEmbeddings?.[0]).not.toHaveProperty("embedding")
    expect(exported.data.reviewFiles).toEqual([
      expect.objectContaining({ id: reviewFileId, archivedAt: expect.any(Date) }),
    ])
    expect(exported.data.reviewComments).toContainEqual(
      expect.objectContaining({ id: reviewReplyId, parentCommentId: reviewCommentId }),
    )
    expect(exported.data.portfolios).toEqual([
      expect.objectContaining({
        id: portfolioId,
        themePreset: "screening",
        seoTitle: "Export SEO title",
        customDomain: `${runId}.example.test`,
        domainVerificationStatus: "pending",
      }),
    ])
    expect(exported.data.portfolioDailyViews).toEqual([
      {
        portfolioId,
        viewDate: "2026-09-01",
        views: 7,
        uniqueVisitors: 3,
      },
    ])
    expect(serialized).not.toContain("HIDDEN_SCRIPT_SECRET")
    expect(serialized).not.toContain("PRIVATE_PHONE")
    expect(serialized).not.toContain("PRIVATE_EMAIL")
    expect(serialized).not.toContain("PRIVATE_OBJECT_KEY")
    expect(serialized).not.toContain("PRIVATE_REQUEST_HASH")
    expect(serialized).not.toContain("PRIVATE_RECEIPT_CONTENT")
    expect(serialized).not.toContain("PRIVATE_AUDIT_TOKEN")
    expect(serialized).not.toContain("PRIVATE_AUDIT_KEY")
    expect(serialized).not.toContain("PRIVATE_ANALYSIS_OBJECT_KEY")
    expect(serialized).not.toContain("PRIVATE_ANALYSIS_INPUT_KEY")
    expect(exported.manifest.sections).toContainEqual({ name: "projects", count: 1 })
    expect(exported.manifest.sections).toContainEqual({
      name: "portfolioDailyViews",
      count: 1,
    })

    const audit = await database
      .selectFrom("audit_logs")
      .select(["actor_account_id", "team_id", "action", "metadata"])
      .where("team_id", "=", teamId)
      .where("action", "=", "team-data.exported")
      .executeTakeFirstOrThrow()
    expect(audit).toMatchObject({ actor_account_id: actorId, team_id: teamId })
    expect(audit.metadata).toMatchObject({
      format: "shadowproducer-business-data",
      projectCount: 1,
    })
  })

  it("denies an outsider without creating a success audit", async () => {
    const before = await database
      .selectFrom("audit_logs")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("team_id", "=", teamId)
      .where("action", "=", "team-data.exported")
      .executeTakeFirstOrThrow()

    await expect(service.createTeamDataExport(outsiderId, teamId)).rejects.toMatchObject({
      code: "TEAM_ACCESS_DENIED",
      statusCode: 403,
    })

    const after = await database
      .selectFrom("audit_logs")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("team_id", "=", teamId)
      .where("action", "=", "team-data.exported")
      .executeTakeFirstOrThrow()
    expect(Number(after.count)).toBe(Number(before.count))
  })
})
