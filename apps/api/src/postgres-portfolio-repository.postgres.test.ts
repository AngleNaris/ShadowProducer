import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { PostgresPortfolioRepository } from "./postgres-portfolio-repository"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 4 })
const database = createDatabase(databaseUrl, pool)
const repository = new PostgresPortfolioRepository(database)
const runId = `pg-portfolio-${process.pid}-${Date.now().toString(36)}`
const teamId = `${runId}-team`
const actorId = `${runId}-actor`
const recipientId = `${runId}-recipient`
const portfolioId = `${runId}-portfolio`

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values([
      { id: actorId, display_name: "Portfolio Writer", email: null },
      { id: recipientId, display_name: "Portfolio Recipient", email: null },
    ])
    .execute()
  await database.insertInto("teams").values({ id: teamId, name: runId }).execute()
  await database
    .insertInto("team_memberships")
    .values([
      { team_id: teamId, account_id: actorId, role: "owner" },
      { team_id: teamId, account_id: recipientId, role: "member" },
    ])
    .execute()
  await database
    .insertInto("team_portfolios")
    .values({
      id: portfolioId,
      team_id: teamId,
      title: "Postgres portfolio",
      category: "Test",
      year: "2026",
      description: "",
      state: "已公开",
      public_slug: `${runId}-public`,
      published_at: new Date(),
      created_by_account_id: actorId,
      published_by_account_id: actorId,
      archived_at: null,
    })
    .execute()
})

afterAll(async () => {
  await database.deleteFrom("audit_logs").where("team_id", "=", teamId).execute()
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "=", actorId)
    .execute()
  await database
    .deleteFrom("portfolio_items")
    .where("portfolio_id", "like", `${runId}%`)
    .execute()
  await database
    .deleteFrom("review_files")
    .where("project_id", "like", `${runId}%`)
    .execute()
  await database.deleteFrom("teams").where("id", "=", teamId).execute()
  await database
    .deleteFrom("accounts")
    .where("id", "in", [actorId, recipientId])
    .execute()
  await database.destroy()
})

describe("Postgres portfolio publishing enhancements", () => {
  it("persists settings and aggregates daily views without duplicate visitors", async () => {
    const settings = await repository.updateSettings({
      actorId,
      teamId,
      portfolioId,
      themePreset: "screening",
      seoTitle: "Search title",
      seoDescription: "Search description",
      expectedRevision: 1,
      idempotencyKey: `${runId}-settings`,
    })
    expect(settings).toMatchObject({
      replayed: false,
      item: {
        revision: 2,
        themePreset: "screening",
        seoTitle: "Search title",
      },
    })

    const slug = `${runId}-public`
    await repository.recordPublicView(slug, "visitor-a")
    await repository.recordPublicView(slug, "visitor-a")
    await repository.recordPublicView(slug, "visitor-b")
    await expect(repository.getAnalytics(teamId, portfolioId, 30)).resolves.toMatchObject(
      {
        totalViews: 3,
        uniqueVisitors: 2,
      },
    )
  })

  it("archives and restores a portfolio with revision and audit history", async () => {
    const current = (await repository.listPortfolios(teamId))[0]
    expect(current).toBeDefined()
    const archived = await repository.archivePortfolio({
      actorId,
      teamId,
      portfolioId,
      expectedRevision: current?.revision ?? 0,
      idempotencyKey: `${runId}-archive`,
    })
    expect(archived).toMatchObject({
      replayed: false,
      item: {
        archived: true,
        state: "团队可见",
        publicSlug: `${runId}-public`,
      },
    })
    await expect(repository.listPortfolios(teamId)).resolves.toEqual([])
    await expect(repository.listPortfolios(teamId, true)).resolves.toMatchObject([
      { id: portfolioId, archived: true },
    ])

    const restored = await repository.restorePortfolio({
      actorId,
      teamId,
      portfolioId,
      expectedRevision: "item" in archived ? archived.item.revision : 0,
      idempotencyKey: `${runId}-restore`,
    })
    expect(restored).toMatchObject({
      replayed: false,
      item: {
        archived: false,
        state: "团队可见",
        publicSlug: `${runId}-public`,
      },
    })
    const audits = await database
      .selectFrom("audit_logs")
      .select("action")
      .where("team_id", "=", teamId)
      .where("subject_id", "=", portfolioId)
      .where("action", "in", ["portfolio.archived", "portfolio.restored"])
      .orderBy("id")
      .execute()
    expect(audits.map((row) => row.action)).toEqual([
      "portfolio.archived",
      "portfolio.restored",
    ])
  })

  it("notifies team members when a portfolio is published or withdrawn", async () => {
    const projectId = `${runId}-notification-project`
    const assetId = `${runId}-notification-asset`
    const reviewFileId = `${runId}-notification-review`
    const contentId = `${runId}-notification-content`
    await database
      .insertInto("projects")
      .values({ id: projectId, team_id: teamId, name: "Notification project" })
      .execute()
    await database
      .insertInto("team_assets")
      .values({
        id: assetId,
        team_id: teamId,
        project_id: projectId,
        folder_id: null,
        name: "Notification review.mp4",
        kind: "视频",
        mime_type: "video/mp4",
        size_bytes: 1024,
        object_key: `${runId}/notification-review.mp4`,
        checksum_sha256: "c".repeat(64),
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
      .insertInto("review_files")
      .values({
        id: reviewFileId,
        project_id: projectId,
        asset_id: assetId,
        name: "Notification review",
        version: "v1",
        type: "video",
        status: "已通过",
      })
      .execute()
    await database
      .insertInto("portfolio_items")
      .values({
        id: contentId,
        portfolio_id: portfolioId,
        asset_id: assetId,
        review_file_id: reviewFileId,
        title: "Notification review",
        kind: "主片",
        caption: "Approved",
        featured: true,
        sort_order: 0,
      })
      .execute()

    const current = (await repository.listPortfolios(teamId))[0]
    if (!current) throw new Error("Portfolio missing")
    const publishCommand = {
      actorId,
      teamId,
      portfolioId,
      expectedRevision: current.revision,
      idempotencyKey: `${runId}-notify-publish`,
    }
    const published = await repository.publishPortfolio(publishCommand)
    const replay = await repository.publishPortfolio(publishCommand)
    if ("kind" in published || "kind" in replay) throw new Error("Publish failed")
    expect(replay).toMatchObject({ replayed: true, item: published.item })

    const unpublished = await repository.unpublishPortfolio({
      actorId,
      teamId,
      portfolioId,
      expectedRevision: published.item.revision,
      idempotencyKey: `${runId}-notify-unpublish`,
    })
    if ("kind" in unpublished) throw new Error("Unpublish failed")
    const notifications = await database
      .selectFrom("notifications")
      .select(["kind", "project_id", "subject_id"])
      .where("recipient_account_id", "=", recipientId)
      .where("subject_id", "=", portfolioId)
      .orderBy("created_at", "asc")
      .execute()
    expect(notifications).toEqual([
      { kind: "portfolio_published", project_id: null, subject_id: portfolioId },
      { kind: "portfolio_unpublished", project_id: null, subject_id: portfolioId },
    ])

    await database
      .insertInto("notification_preferences")
      .values({
        account_id: recipientId,
        team_id: teamId,
        published_call_sheets: true,
        important_call_sheet_changes: true,
        permission_assignments: true,
        portfolio_publications: false,
      })
      .onConflict((conflict) =>
        conflict.columns(["account_id", "team_id"]).doUpdateSet({
          portfolio_publications: false,
        }),
      )
      .execute()
    const suppressed = await repository.publishPortfolio({
      actorId,
      teamId,
      portfolioId,
      expectedRevision: unpublished.item.revision,
      idempotencyKey: `${runId}-notify-publish-suppressed`,
    })
    if ("kind" in suppressed) throw new Error("Suppressed publish failed")
    expect(
      await database
        .selectFrom("notifications")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("recipient_account_id", "=", recipientId)
        .where("subject_id", "=", portfolioId)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: "2" })
  })

  it("excludes archived reviews from candidates but preserves published content", async () => {
    const projectId = `${runId}-review-project`
    const assetId = `${runId}-review-asset`
    const reviewFileId = `${runId}-review-file`
    const publicPortfolioId = `${runId}-review-public`
    const targetPortfolioId = `${runId}-review-target`
    const contentId = `${runId}-review-content`
    const slug = `${runId}-review-slug`
    await database
      .insertInto("projects")
      .values({ id: projectId, team_id: teamId, name: "Review project" })
      .execute()
    await database
      .insertInto("team_assets")
      .values({
        id: assetId,
        team_id: teamId,
        project_id: projectId,
        folder_id: null,
        name: "Approved review.mp4",
        kind: "视频",
        mime_type: "video/mp4",
        size_bytes: 1024,
        object_key: `${runId}/approved-review.mp4`,
        checksum_sha256: "b".repeat(64),
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
      .insertInto("review_files")
      .values({
        id: reviewFileId,
        project_id: projectId,
        asset_id: assetId,
        name: "Approved review",
        version: "v1",
        type: "video",
        status: "已通过",
      })
      .execute()
    await database
      .insertInto("team_portfolios")
      .values([
        {
          id: publicPortfolioId,
          team_id: teamId,
          title: "Published review",
          category: "Test",
          year: "2026",
          description: "",
          state: "已公开",
          public_slug: slug,
          published_at: new Date(),
          created_by_account_id: actorId,
          published_by_account_id: actorId,
          archived_at: null,
        },
        {
          id: targetPortfolioId,
          team_id: teamId,
          title: "Target review",
          category: "Test",
          year: "2026",
          description: "",
          state: "团队可见",
          public_slug: null,
          published_at: null,
          created_by_account_id: actorId,
          published_by_account_id: null,
          archived_at: null,
        },
      ])
      .execute()
    await database
      .insertInto("portfolio_items")
      .values({
        id: contentId,
        portfolio_id: publicPortfolioId,
        asset_id: assetId,
        review_file_id: reviewFileId,
        title: "Approved review",
        kind: "主片",
        caption: "Published before archive",
        featured: true,
        sort_order: 0,
      })
      .execute()

    await expect(repository.listApprovedCandidates(teamId)).resolves.toContainEqual(
      expect.objectContaining({ reviewFileId }),
    )
    await database
      .updateTable("team_assets")
      .set({ object_key: null })
      .where("id", "=", assetId)
      .execute()
    await expect(repository.listApprovedCandidates(teamId)).resolves.not.toContainEqual(
      expect.objectContaining({ reviewFileId }),
    )
    await database
      .updateTable("team_assets")
      .set({ object_key: `${runId}/approved-review.mp4` })
      .where("id", "=", assetId)
      .execute()
    await database
      .updateTable("review_files")
      .set({ archived_at: new Date(), revision: 2 })
      .where("id", "=", reviewFileId)
      .execute()

    await expect(repository.listApprovedCandidates(teamId)).resolves.not.toContainEqual(
      expect.objectContaining({ reviewFileId }),
    )
    await expect(
      repository.addContent({
        actorId,
        teamId,
        portfolioId: targetPortfolioId,
        assetId,
        reviewFileId,
        caption: "Must be rejected",
        featured: false,
        expectedRevision: 1,
        idempotencyKey: `${runId}-archived-candidate`,
      }),
    ).resolves.toEqual({ kind: "candidate_invalid" })
    await expect(repository.getPublicPortfolio(slug)).resolves.toMatchObject({
      contents: [expect.objectContaining({ id: contentId, version: "v1" })],
    })
    await expect(repository.getPublicContentSource(slug, contentId)).resolves.toEqual({
      objectKey: `${runId}/approved-review.mp4`,
    })
  })

  it("permanently deletes an archived portfolio without deleting shared media", async () => {
    const projectId = `${runId}-delete-project`
    const assetId = `${runId}-delete-asset`
    const reviewFileId = `${runId}-delete-review`
    const deletePortfolioId = `${runId}-delete-portfolio`
    const replacementPortfolioId = `${runId}-replacement-portfolio`
    const contentId = `${runId}-delete-content`
    const publicSlug = `${runId}-deleted-slug`
    const customDomain = `${runId}.example.com`
    const revision = 3

    await database
      .insertInto("projects")
      .values({ id: projectId, team_id: teamId, name: "Delete boundary project" })
      .execute()
    await database
      .insertInto("team_assets")
      .values({
        id: assetId,
        team_id: teamId,
        project_id: projectId,
        folder_id: null,
        name: "Shared source.mp4",
        kind: "视频",
        mime_type: "video/mp4",
        size_bytes: 1024,
        object_key: `${runId}/shared-source.mp4`,
        checksum_sha256: "d".repeat(64),
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
      .insertInto("review_files")
      .values({
        id: reviewFileId,
        project_id: projectId,
        asset_id: assetId,
        name: "Shared review",
        version: "v1",
        type: "video",
        status: "已通过",
      })
      .execute()
    await database
      .insertInto("team_portfolios")
      .values({
        id: deletePortfolioId,
        team_id: teamId,
        title: "Archived delete target",
        category: "Test",
        year: "2026",
        description: "",
        state: "团队可见",
        public_slug: publicSlug,
        custom_domain: customDomain,
        domain_verification_record: `${runId}-verification`,
        domain_verification_status: "verified",
        domain_verified_at: new Date(),
        published_at: null,
        created_by_account_id: actorId,
        published_by_account_id: null,
        revision,
        archived_at: new Date(),
      })
      .execute()
    await database
      .insertInto("portfolio_items")
      .values({
        id: contentId,
        portfolio_id: deletePortfolioId,
        asset_id: assetId,
        review_file_id: reviewFileId,
        title: "Shared review",
        kind: "主片",
        caption: "Delete the container only",
        featured: true,
        sort_order: 0,
      })
      .execute()
    await database
      .insertInto("portfolio_daily_views")
      .values({
        portfolio_id: deletePortfolioId,
        view_date: "2026-08-31",
        views: 4,
        unique_visitors: 1,
      })
      .execute()
    await database
      .insertInto("portfolio_daily_visitors")
      .values({
        portfolio_id: deletePortfolioId,
        view_date: "2026-08-31",
        visitor_hash: `${runId}-visitor`,
      })
      .execute()
    await database
      .insertInto("notifications")
      .values({
        id: `${runId}-delete-notification`,
        recipient_account_id: recipientId,
        source_actor_account_id: actorId,
        team_id: teamId,
        project_id: null,
        kind: "portfolio_published",
        subject_id: deletePortfolioId,
        dedup_key: `${runId}-delete-notification`,
        title: "Old publication",
        body: "Must be deleted with the portfolio",
        metadata: JSON.stringify({}),
      })
      .execute()
    await database
      .insertInto("command_receipts")
      .values({
        actor_account_id: actorId,
        domain: `portfolio.create:${teamId}`,
        idempotency_key: `${runId}-delete-receipt`,
        request_hash: null,
        response: JSON.stringify({ id: deletePortfolioId }),
      })
      .execute()
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: actorId,
        team_id: teamId,
        project_id: null,
        action: "portfolio.archived",
        subject_id: deletePortfolioId,
        metadata: JSON.stringify({ revision }),
      })
      .execute()

    await expect(
      repository.permanentlyDeletePortfolio({
        actorId,
        teamId,
        portfolioId: deletePortfolioId,
        expectedRevision: revision - 1,
        confirmation: "permanent-delete",
      }),
    ).resolves.toEqual({ kind: "conflict" })
    await expect(
      repository.permanentlyDeletePortfolio({
        actorId,
        teamId,
        portfolioId: deletePortfolioId,
        expectedRevision: revision,
        confirmation: "permanent-delete",
      }),
    ).resolves.toEqual({ kind: "ok", item: { id: deletePortfolioId } })

    const counts = await Promise.all(
      (
        [
          "team_portfolios",
          "portfolio_items",
          "portfolio_daily_views",
          "portfolio_daily_visitors",
          "notifications",
        ] as const
      ).map((table) =>
        database
          .selectFrom(table)
          .select(({ fn }) => fn.countAll<string>().as("count"))
          .where(
            table === "team_portfolios"
              ? "id"
              : table === "notifications"
                ? "subject_id"
                : "portfolio_id",
            "=",
            deletePortfolioId,
          )
          .executeTakeFirstOrThrow(),
      ),
    )
    expect(counts.map(({ count }) => count)).toEqual(["0", "0", "0", "0", "0"])
    await expect(
      database
        .selectFrom("command_receipts")
        .select(({ fn }) => fn.countAll<string>().as("count"))
        .where("idempotency_key", "=", `${runId}-delete-receipt`)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ count: "0" })
    await expect(
      database
        .selectFrom("team_assets")
        .select("id")
        .where("id", "=", assetId)
        .executeTakeFirst(),
    ).resolves.toEqual({ id: assetId })
    await expect(
      database
        .selectFrom("review_files")
        .select("id")
        .where("id", "=", reviewFileId)
        .executeTakeFirst(),
    ).resolves.toEqual({ id: reviewFileId })
    await expect(
      database
        .selectFrom("audit_logs")
        .select("action")
        .where("subject_id", "=", deletePortfolioId)
        .orderBy("id")
        .execute(),
    ).resolves.toEqual([
      { action: "portfolio.archived" },
      { action: "portfolio.permanently-deleted" },
    ])

    await database
      .insertInto("team_portfolios")
      .values({
        id: replacementPortfolioId,
        team_id: teamId,
        title: "Replacement portfolio",
        category: "Test",
        year: "2026",
        description: "",
        state: "团队可见",
        public_slug: publicSlug,
        custom_domain: customDomain,
        domain_verification_record: `${runId}-replacement-verification`,
        domain_verification_status: "pending",
        created_by_account_id: actorId,
        published_by_account_id: null,
        archived_at: null,
      })
      .execute()
  })
})
