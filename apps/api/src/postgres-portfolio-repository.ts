import { createHash, randomUUID } from "node:crypto"

import {
  type AddPortfolioContentCommand,
  AppError,
  type BindPortfolioDomainCommand,
  type ChangePortfolioDomainCommand,
  type ChangePortfolioPublicationCommand,
  type CreatePortfolioCommand,
  type PermanentlyDeletePortfolioCommand,
  type PortfolioDeleteResult,
  type PortfolioRepository,
  type PortfolioWriteResult,
  type UpdatePortfolioSettingsCommand,
} from "@shadowproducer/application"
import type {
  ApprovedPortfolioCandidate,
  PortfolioContent,
  PublicPortfolio,
  TeamPortfolio,
} from "@shadowproducer/contracts"
import { type Kysely, type Selectable, sql, type Transaction } from "kysely"

import type { Database } from "./database"
import { resolveTeamAccess } from "./postgres-access"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toIsoOrNull(value: Date | string | null) {
  return value ? toIso(value) : null
}

function requestHash(value: object) {
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "idempotencyKey")
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

export class PostgresPortfolioRepository implements PortfolioRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getTeamAccess(actorId: string, teamId: string) {
    return resolveTeamAccess(this.database, actorId, teamId)
  }

  async listPortfolios(teamId: string, archived = false) {
    const rows = await this.database
      .selectFrom("team_portfolios")
      .selectAll()
      .where("team_id", "=", teamId)
      .where("archived_at", archived ? "is not" : "is", null)
      .orderBy("updated_at", "desc")
      .execute()
    const contents = await this.listContents(this.database, teamId, undefined, archived)
    const byPortfolio = new Map<string, PortfolioContent[]>()
    for (const content of contents) {
      const current = byPortfolio.get(content.portfolioId) ?? []
      current.push(content)
      byPortfolio.set(content.portfolioId, current)
    }
    return rows.map((row) => this.mapPortfolio(row, byPortfolio.get(row.id) ?? []))
  }

  async listApprovedCandidates(teamId: string) {
    const rows = await this.candidateQuery(this.database)
      .where("asset.team_id", "=", teamId)
      .where("project.team_id", "=", teamId)
      .orderBy("review.updated_at", "desc")
      .execute()
    return rows.map((row) => this.mapCandidate(row))
  }

  async createPortfolio(command: CreatePortfolioCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `portfolio.create:${command.teamId}`
      const replay = await this.getReceipt<TeamPortfolio>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const row = await transaction
        .insertInto("team_portfolios")
        .values({
          id: randomUUID(),
          team_id: command.teamId,
          title: command.title.trim(),
          category: command.category.trim(),
          year: command.year.trim(),
          description: command.description.trim(),
          state: "团队可见",
          public_slug: null,
          created_by_account_id: command.actorId,
          published_by_account_id: null,
          published_at: null,
          archived_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const item = this.mapPortfolio(row, [])
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "portfolio.created",
        item.id,
        { revision: item.revision },
      )
      return { item, replayed: false }
    })
  }

  async addContent(command: AddPortfolioContentCommand): Promise<PortfolioWriteResult> {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `portfolio.content.add:${command.portfolioId}`
      const replay = await this.getReceipt<TeamPortfolio>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const candidateRow = await this.candidateQuery(transaction)
        .where("asset.team_id", "=", command.teamId)
        .where("project.team_id", "=", command.teamId)
        .where("asset.id", "=", command.assetId)
        .where("review.id", "=", command.reviewFileId)
        .executeTakeFirst()
      if (!candidateRow) return { kind: "candidate_invalid" }

      const duplicate = await transaction
        .selectFrom("portfolio_items as item")
        .innerJoin("team_portfolios as portfolio", "portfolio.id", "item.portfolio_id")
        .select("item.id")
        .where("item.portfolio_id", "=", command.portfolioId)
        .where("item.review_file_id", "=", command.reviewFileId)
        .where("portfolio.team_id", "=", command.teamId)
        .where("portfolio.archived_at", "is", null)
        .executeTakeFirst()
      if (duplicate) {
        throw new AppError("PORTFOLIO_ITEM_EXISTS", "这个已通过版本已经在作品集中", 409)
      }

      const updated = await transaction
        .updateTable("team_portfolios")
        .set({
          published_at: null,
          published_by_account_id: null,
          state: sql`case when state = '已公开' then '待发布' else state end`,
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.missingOrConflict(transaction, command)

      if (command.featured) {
        await transaction
          .updateTable("portfolio_items")
          .set({ featured: false, updated_at: sql<Date>`now()` })
          .where("portfolio_id", "=", command.portfolioId)
          .execute()
      }
      const maxOrder = await transaction
        .selectFrom("portfolio_items")
        .select((expression) => expression.fn.max<number>("sort_order").as("value"))
        .where("portfolio_id", "=", command.portfolioId)
        .executeTakeFirst()
      const candidate = this.mapCandidate(candidateRow)
      await transaction
        .insertInto("portfolio_items")
        .values({
          id: randomUUID(),
          portfolio_id: command.portfolioId,
          asset_id: command.assetId,
          review_file_id: command.reviewFileId,
          title: candidate.title,
          kind: "主片",
          caption: command.caption.trim(),
          featured: command.featured,
          sort_order: Number(maxOrder?.value ?? -1) + 1,
        })
        .execute()

      const item = await this.loadPortfolio(
        transaction,
        command.teamId,
        command.portfolioId,
      )
      if (!item) return { kind: "not_found" }
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "portfolio.content.added",
        command.portfolioId,
        {
          assetId: command.assetId,
          reviewFileId: command.reviewFileId,
          revision: item.revision,
        },
      )
      return { item, replayed: false }
    })
  }

  async publishPortfolio(command: ChangePortfolioPublicationCommand) {
    return this.changePublication(command, true)
  }

  async unpublishPortfolio(command: ChangePortfolioPublicationCommand) {
    return this.changePublication(command, false)
  }

  async archivePortfolio(command: ChangePortfolioPublicationCommand) {
    return this.changeArchiveState(command, true)
  }

  async restorePortfolio(command: ChangePortfolioPublicationCommand) {
    return this.changeArchiveState(command, false)
  }

  async permanentlyDeletePortfolio(
    command: PermanentlyDeletePortfolioCommand,
  ): Promise<PortfolioDeleteResult> {
    return this.database.transaction().execute(async (transaction) => {
      const current = await transaction
        .selectFrom("team_portfolios")
        .select(["id", "revision", "public_slug", "custom_domain"])
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("archived_at", "is not", null)
        .forUpdate()
        .executeTakeFirst()
      if (!current) return { kind: "not_found" }
      if (current.revision !== command.expectedRevision) return { kind: "conflict" }

      await transaction
        .deleteFrom("notifications")
        .where("team_id", "=", command.teamId)
        .where("subject_id", "=", command.portfolioId)
        .where("kind", "in", ["portfolio_published", "portfolio_unpublished"])
        .execute()
      await transaction
        .deleteFrom("command_receipts")
        .where("domain", "like", "portfolio.%")
        .where(sql<boolean>`response ->> 'id' = ${command.portfolioId}`)
        .execute()

      const deleted = await transaction
        .deleteFrom("team_portfolios")
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", "is not", null)
        .returning("id")
        .executeTakeFirst()
      if (!deleted) return { kind: "conflict" }

      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "portfolio.permanently-deleted",
        deleted.id,
        {
          customDomain: current.custom_domain,
          publicSlug: current.public_slug,
          revision: current.revision,
        },
      )
      return { kind: "ok", item: { id: deleted.id } }
    })
  }

  private async changeArchiveState(
    command: ChangePortfolioPublicationCommand,
    archived: boolean,
  ): Promise<PortfolioWriteResult> {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `portfolio.${archived ? "archive" : "restore"}:${command.portfolioId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<TeamPortfolio>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const current = await transaction
        .selectFrom("team_portfolios")
        .selectAll()
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("archived_at", archived ? "is" : "is not", null)
        .forUpdate()
        .executeTakeFirst()
      if (!current) return { kind: "not_found" }
      if (current.revision !== command.expectedRevision) {
        return { kind: "conflict" }
      }

      if (!archived) {
        const activeMatch = await transaction
          .selectFrom("team_portfolios")
          .select("id")
          .where("team_id", "=", command.teamId)
          .where("title", "ilike", current.title)
          .where("archived_at", "is", null)
          .where("id", "!=", current.id)
          .executeTakeFirst()
        if (activeMatch) return { kind: "name_conflict" }
      }

      const row = await transaction
        .updateTable("team_portfolios")
        .set({
          archived_at: archived ? sql<Date>`now()` : null,
          state: "团队可见",
          published_at: null,
          published_by_account_id: null,
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", archived ? "is" : "is not", null)
        .returningAll()
        .executeTakeFirst()
      if (!row) return { kind: "conflict" }

      const contents = await this.listContents(
        transaction,
        command.teamId,
        command.portfolioId,
        archived,
      )
      const item = this.mapPortfolio(row, contents)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        archived ? "portfolio.archived" : "portfolio.restored",
        command.portfolioId,
        { publicSlug: item.publicSlug, revision: item.revision },
      )
      return { item, replayed: false }
    })
  }

  async updateSettings(command: UpdatePortfolioSettingsCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `portfolio.settings:${command.portfolioId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<TeamPortfolio>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }
      const updated = await transaction
        .updateTable("team_portfolios")
        .set({
          theme_preset: command.themePreset,
          seo_title: command.seoTitle.trim(),
          seo_description: command.seoDescription.trim(),
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.missingOrConflict(transaction, command)
      return this.finishMutation(
        transaction,
        command,
        domain,
        hash,
        "portfolio.settings.updated",
      )
    })
  }

  async bindDomain(command: BindPortfolioDomainCommand) {
    try {
      return await this.database.transaction().execute(async (transaction) => {
        const domain = `portfolio.domain.bind:${command.portfolioId}`
        const hash = requestHash(command)
        const replay = await this.getReceipt<TeamPortfolio>(
          transaction,
          command.actorId,
          domain,
          command.idempotencyKey,
          hash,
        )
        if (replay) return { item: replay, replayed: true }
        const updated = await transaction
          .updateTable("team_portfolios")
          .set({
            custom_domain: command.domain,
            domain_verification_record: command.verificationValue,
            domain_verification_status: "pending",
            domain_verified_at: null,
            updated_at: sql<Date>`now()`,
          })
          .set((expression) => ({ revision: expression("revision", "+", 1) }))
          .where("id", "=", command.portfolioId)
          .where("team_id", "=", command.teamId)
          .where("revision", "=", command.expectedRevision)
          .where("archived_at", "is", null)
          .returning("id")
          .executeTakeFirst()
        if (!updated) return this.missingOrConflict(transaction, command)
        return this.finishMutation(
          transaction,
          command,
          domain,
          hash,
          "portfolio.domain.bound",
        )
      })
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return { kind: "domain_conflict" } as const
      }
      throw error
    }
  }

  async verifyDomain(command: ChangePortfolioDomainCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `portfolio.domain.verify:${command.portfolioId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<TeamPortfolio>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }
      const updated = await transaction
        .updateTable("team_portfolios")
        .set({
          domain_verification_status: "verified",
          domain_verified_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("custom_domain", "is not", null)
        .where("archived_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.missingOrConflict(transaction, command)
      return this.finishMutation(
        transaction,
        command,
        domain,
        hash,
        "portfolio.domain.verified",
      )
    })
  }

  async unbindDomain(command: ChangePortfolioDomainCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const domain = `portfolio.domain.unbind:${command.portfolioId}`
      const hash = requestHash(command)
      const replay = await this.getReceipt<TeamPortfolio>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }
      const updated = await transaction
        .updateTable("team_portfolios")
        .set({
          custom_domain: null,
          domain_verification_record: null,
          domain_verification_status: null,
          domain_verified_at: null,
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.missingOrConflict(transaction, command)
      return this.finishMutation(
        transaction,
        command,
        domain,
        hash,
        "portfolio.domain.unbound",
      )
    })
  }

  async getAnalytics(teamId: string, portfolioId: string, days: number) {
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - days + 1)
    const portfolio = await this.database
      .selectFrom("team_portfolios")
      .select("id")
      .where("id", "=", portfolioId)
      .where("team_id", "=", teamId)
      .where("archived_at", "is", null)
      .executeTakeFirst()
    if (!portfolio) return null
    const rows = await this.database
      .selectFrom("portfolio_daily_views")
      .selectAll()
      .where("portfolio_id", "=", portfolioId)
      .where("view_date", ">=", cutoff.toISOString().slice(0, 10))
      .orderBy("view_date")
      .execute()
    return {
      totalViews: rows.reduce((total, row) => total + row.views, 0),
      uniqueVisitors: rows.reduce((total, row) => total + row.unique_visitors, 0),
      days: rows.map((row) => ({
        date: String(row.view_date),
        views: row.views,
        uniqueVisitors: row.unique_visitors,
      })),
    }
  }

  async getPublicPortfolio(slug: string): Promise<PublicPortfolio | null> {
    const row = await this.database
      .selectFrom("team_portfolios")
      .selectAll()
      .where("public_slug", "=", slug)
      .where("state", "=", "已公开")
      .where("archived_at", "is", null)
      .executeTakeFirst()
    return row ? this.mapPublicPortfolio(row) : null
  }

  async getPublicPortfolioByDomain(domain: string): Promise<PublicPortfolio | null> {
    const row = await this.database
      .selectFrom("team_portfolios")
      .selectAll()
      .where(sql<boolean>`lower(custom_domain) = ${domain}`)
      .where("domain_verification_status", "=", "verified")
      .where("state", "=", "已公开")
      .where("archived_at", "is", null)
      .executeTakeFirst()
    return row ? this.mapPublicPortfolio(row) : null
  }

  async recordPublicView(slug: string, visitorHash: string) {
    return this.database.transaction().execute(async (transaction) => {
      const portfolio = await transaction
        .selectFrom("team_portfolios")
        .select("id")
        .where("public_slug", "=", slug)
        .where("state", "=", "已公开")
        .where("archived_at", "is", null)
        .executeTakeFirst()
      if (!portfolio) return false
      const visitor = await transaction
        .insertInto("portfolio_daily_visitors")
        .values({
          portfolio_id: portfolio.id,
          view_date: sql<string>`current_date`,
          visitor_hash: visitorHash,
        })
        .onConflict((conflict) => conflict.doNothing())
        .returning("portfolio_id")
        .executeTakeFirst()
      await transaction
        .insertInto("portfolio_daily_views")
        .values({
          portfolio_id: portfolio.id,
          view_date: sql<string>`current_date`,
          views: 1,
          unique_visitors: visitor ? 1 : 0,
        })
        .onConflict((conflict) =>
          conflict.columns(["portfolio_id", "view_date"]).doUpdateSet({
            views: sql<number>`portfolio_daily_views.views + 1`,
            unique_visitors: sql<number>`portfolio_daily_views.unique_visitors + ${visitor ? 1 : 0}`,
          }),
        )
        .execute()
      return true
    })
  }

  async getPublicContentSource(slug: string, contentId: string) {
    const row = await this.publicContentsQuery(this.database)
      .innerJoin("asset_media as media", "media.asset_id", "asset.id")
      .select("media.review_proxy_object_key")
      .where("media.status", "=", "ready")
      .innerJoin("team_portfolios as portfolio", "portfolio.id", "item.portfolio_id")
      .where("portfolio.public_slug", "=", slug)
      .where("portfolio.state", "=", "已公开")
      .where("portfolio.archived_at", "is", null)
      .where("item.id", "=", contentId)
      .executeTakeFirst()
    return row?.review_proxy_object_key
      ? { objectKey: row.review_proxy_object_key }
      : null
  }

  private async changePublication(
    command: ChangePortfolioPublicationCommand,
    publish: boolean,
  ): Promise<PortfolioWriteResult> {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `portfolio.${publish ? "publish" : "unpublish"}:${command.portfolioId}`
      const replay = await this.getReceipt<TeamPortfolio>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const current = await transaction
        .selectFrom("team_portfolios")
        .select(["public_slug", "revision"])
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("archived_at", "is", null)
        .executeTakeFirst()
      if (!current) return { kind: "not_found" }
      if (current.revision !== command.expectedRevision) return { kind: "conflict" }

      if (publish) {
        const total = await transaction
          .selectFrom("portfolio_items")
          .select((expression) => expression.fn.countAll<number>().as("value"))
          .where("portfolio_id", "=", command.portfolioId)
          .executeTakeFirst()
        const valid = await this.publicContentsQuery(
          transaction,
          command.portfolioId,
        ).execute()
        if (!Number(total?.value) || valid.length !== Number(total?.value)) {
          return { kind: "candidate_invalid" }
        }
      }

      const updated = await transaction
        .updateTable("team_portfolios")
        .set({
          public_slug: current.public_slug ?? randomUUID().replaceAll("-", ""),
          published_at: publish ? sql<Date>`now()` : null,
          published_by_account_id: publish ? command.actorId : null,
          state: publish ? "已公开" : "团队可见",
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.portfolioId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" }

      const item = await this.loadPortfolio(
        transaction,
        command.teamId,
        command.portfolioId,
      )
      if (!item) return { kind: "not_found" }
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        publish ? "portfolio.published" : "portfolio.unpublished",
        command.portfolioId,
        { publicSlug: item.publicSlug, revision: item.revision },
      )
      await this.writePublicationNotifications(transaction, command, item, publish)
      return { item, replayed: false }
    })
  }

  private async writePublicationNotifications(
    database: DatabaseExecutor,
    command: ChangePortfolioPublicationCommand,
    item: TeamPortfolio,
    publish: boolean,
  ) {
    const recipients = await database
      .selectFrom("team_memberships as membership")
      .leftJoin("notification_preferences as preference", (join) =>
        join
          .onRef("preference.account_id", "=", "membership.account_id")
          .on("preference.team_id", "=", command.teamId),
      )
      .select(["membership.account_id", "preference.portfolio_publications"])
      .where("membership.team_id", "=", command.teamId)
      .where("membership.account_id", "!=", command.actorId)
      .execute()
    const enabledRecipients = recipients.filter(
      (recipient) => recipient.portfolio_publications ?? true,
    )
    if (!enabledRecipients.length) return

    const kind = publish ? "portfolio_published" : "portfolio_unpublished"
    await database
      .insertInto("notifications")
      .values(
        enabledRecipients.map((recipient) => ({
          id: randomUUID(),
          recipient_account_id: recipient.account_id,
          source_actor_account_id: command.actorId,
          team_id: command.teamId,
          project_id: null,
          kind,
          subject_id: item.id,
          dedup_key: `${kind}:${item.id}:${item.revision}`,
          title: publish ? `作品集已发布：${item.title}` : `作品集已下架：${item.title}`,
          body: publish ? "作品集已开放公开访问" : "作品集已停止公开访问",
          metadata: JSON.stringify({
            publicSlug: item.publicSlug,
            revision: item.revision,
          }),
        })),
      )
      .onConflict((conflict) =>
        conflict.columns(["recipient_account_id", "dedup_key"]).doNothing(),
      )
      .execute()
  }

  private publicContentsQuery(database: DatabaseExecutor, portfolioId?: string) {
    let query = database
      .selectFrom("portfolio_items as item")
      .innerJoin("team_assets as asset", "asset.id", "item.asset_id")
      .innerJoin("review_files as review", "review.id", "item.review_file_id")
      .innerJoin("projects as project", "project.id", "review.project_id")
      .select([
        "item.id",
        "item.title",
        "item.caption",
        "item.featured",
        "item.sort_order",
        "asset.object_key",
        "review.version",
        "review.duration",
        "project.name as project_name",
      ])
      .whereRef("review.asset_id", "=", "asset.id")
      .where("asset.status", "=", "ready")
      .where("asset.archived_at", "is", null)
      .where("asset.object_key", "is not", null)
      .where("review.type", "=", "video")
      .where("review.status", "=", "已通过")
      .orderBy("item.sort_order")
      .orderBy("item.created_at")
    if (portfolioId) query = query.where("item.portfolio_id", "=", portfolioId)
    return query
  }

  private candidateQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("team_assets as asset")
      .innerJoin("review_files as review", "review.asset_id", "asset.id")
      .innerJoin("projects as project", "project.id", "review.project_id")
      .select([
        "asset.id as asset_id",
        "asset.object_key",
        "asset.thumbnail_url",
        "review.id as review_file_id",
        "review.project_id",
        "review.name",
        "review.version",
        "review.duration",
        "project.name as project_name",
      ])
      .whereRef("asset.project_id", "=", "review.project_id")
      .where("asset.status", "=", "ready")
      .where("asset.archived_at", "is", null)
      .where("asset.object_key", "is not", null)
      .where("review.type", "=", "video")
      .where("review.status", "=", "已通过")
      .where("review.archived_at", "is", null)
  }

  async getPortfolio(teamId: string, portfolioId: string) {
    return this.loadPortfolio(this.database, teamId, portfolioId)
  }

  private async loadPortfolio(
    database: DatabaseExecutor,
    teamId: string,
    portfolioId: string,
    archived = false,
  ) {
    const row = await database
      .selectFrom("team_portfolios")
      .selectAll()
      .where("id", "=", portfolioId)
      .where("team_id", "=", teamId)
      .where("archived_at", archived ? "is not" : "is", null)
      .executeTakeFirst()
    if (!row) return null
    const contents = await this.listContents(database, teamId, portfolioId, archived)
    return this.mapPortfolio(row, contents)
  }

  private async listContents(
    database: DatabaseExecutor,
    teamId: string,
    portfolioId?: string,
    archived = false,
  ) {
    let query = database
      .selectFrom("portfolio_items as item")
      .innerJoin("team_portfolios as portfolio", "portfolio.id", "item.portfolio_id")
      .innerJoin("team_assets as asset", "asset.id", "item.asset_id")
      .innerJoin("review_files as review", "review.id", "item.review_file_id")
      .innerJoin("projects as project", "project.id", "review.project_id")
      .select([
        "item.id",
        "item.portfolio_id",
        "item.asset_id",
        "item.review_file_id",
        "item.title",
        "item.kind",
        "item.caption",
        "item.featured",
        "item.sort_order",
        "item.created_at",
        "item.updated_at",
        "asset.object_key",
        "asset.thumbnail_url",
        "review.project_id",
        "review.version",
        "review.duration",
        "project.name as project_name",
      ])
      .where("portfolio.team_id", "=", teamId)
      .where("portfolio.archived_at", archived ? "is not" : "is", null)
      .orderBy("item.sort_order")
      .orderBy("item.created_at")
    if (portfolioId) query = query.where("portfolio.id", "=", portfolioId)
    const rows = await query.execute()
    return rows.map(
      (row): PortfolioContent => ({
        id: row.id,
        portfolioId: row.portfolio_id,
        assetId: row.asset_id,
        reviewFileId: row.review_file_id,
        projectId: row.project_id,
        projectName: row.project_name,
        title: row.title,
        kind: row.kind,
        caption: row.caption,
        version: row.version,
        duration: row.duration,
        featured: row.featured,
        sortOrder: row.sort_order,
        thumbnailUrl: row.thumbnail_url,
        downloadAvailable: row.object_key !== null,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      }),
    )
  }

  private mapCandidate(row: {
    asset_id: string
    object_key: string | null
    thumbnail_url: string | null
    review_file_id: string
    project_id: string
    name: string
    version: string
    duration: string | null
    project_name: string
  }): ApprovedPortfolioCandidate {
    return {
      assetId: row.asset_id,
      reviewFileId: row.review_file_id,
      projectId: row.project_id,
      projectName: row.project_name,
      title: row.name,
      version: row.version,
      duration: row.duration,
      thumbnailUrl: row.thumbnail_url,
      downloadAvailable: row.object_key !== null,
    }
  }

  private mapPortfolio(
    row: Selectable<Database["team_portfolios"]>,
    contents: PortfolioContent[],
  ): TeamPortfolio {
    return {
      id: row.id,
      teamId: row.team_id,
      title: row.title,
      category: row.category,
      year: row.year,
      state: row.state,
      description: row.description,
      themePreset: row.theme_preset,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      customDomain:
        row.custom_domain &&
        row.domain_verification_record &&
        row.domain_verification_status
          ? {
              domain: row.custom_domain,
              status: row.domain_verification_status,
              verificationName: `_shadowproducer.${row.custom_domain}`,
              verificationValue: row.domain_verification_record,
              verifiedAt: toIsoOrNull(row.domain_verified_at),
            }
          : null,
      archived: row.archived_at !== null,
      revision: row.revision,
      publicSlug: row.public_slug,
      publishedAt: toIsoOrNull(row.published_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
      contents,
    }
  }

  private async missingOrConflict(
    database: DatabaseExecutor,
    command: { teamId: string; portfolioId: string },
  ) {
    const current = await database
      .selectFrom("team_portfolios")
      .select("revision")
      .where("id", "=", command.portfolioId)
      .where("team_id", "=", command.teamId)
      .where("archived_at", "is", null)
      .executeTakeFirst()
    return current ? ({ kind: "conflict" } as const) : ({ kind: "not_found" } as const)
  }

  private async finishMutation(
    transaction: Transaction<Database>,
    command: {
      actorId: string
      teamId: string
      portfolioId: string
      idempotencyKey: string
    },
    domain: string,
    hash: string,
    action: string,
  ) {
    const item = await this.loadPortfolio(
      transaction,
      command.teamId,
      command.portfolioId,
    )
    if (!item) return { kind: "not_found" } as const
    await this.writeReceipt(
      transaction,
      command.actorId,
      domain,
      command.idempotencyKey,
      hash,
      item,
    )
    await this.writeAudit(
      transaction,
      command.actorId,
      command.teamId,
      action,
      command.portfolioId,
      { revision: item.revision },
    )
    return { item, replayed: false as const }
  }

  private async mapPublicPortfolio(
    row: Selectable<Database["team_portfolios"]>,
  ): Promise<PublicPortfolio | null> {
    if (!row.published_at || !row.public_slug) return null
    const count = await this.database
      .selectFrom("portfolio_items")
      .select((expression) => expression.fn.countAll<number>().as("value"))
      .where("portfolio_id", "=", row.id)
      .executeTakeFirst()
    const contents = await this.publicContentsQuery(this.database, row.id).execute()
    if (!contents.length || contents.length !== Number(count?.value ?? 0)) return null
    return {
      slug: row.public_slug,
      title: row.title,
      category: row.category,
      year: row.year,
      description: row.description,
      themePreset: row.theme_preset,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      customDomain:
        row.domain_verification_status === "verified" ? row.custom_domain : null,
      publishedAt: toIso(row.published_at),
      contents: contents.map((content) => ({
        id: content.id,
        title: content.title,
        caption: content.caption,
        projectName: content.project_name,
        version: content.version,
        duration: content.duration,
        featured: content.featured,
        sortOrder: content.sort_order,
      })),
    }
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
    response: TeamPortfolio,
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
  ) {
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: actorId,
        team_id: teamId,
        project_id: null,
        action,
        subject_id: subjectId,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }
}
