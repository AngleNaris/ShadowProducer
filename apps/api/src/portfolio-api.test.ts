import type {
  AddPortfolioContentCommand,
  AssetStorage,
  BindPortfolioDomainCommand,
  ChangePortfolioDomainCommand,
  ChangePortfolioPublicationCommand,
  CreatePortfolioCommand,
  PermanentlyDeletePortfolioCommand,
  PortfolioRepository,
  ScriptRepository,
  UpdatePortfolioSettingsCommand,
} from "@shadowproducer/application"
import { PortfolioService, ScriptService } from "@shadowproducer/application"
import type {
  ApprovedPortfolioCandidate,
  PortfolioContent,
  TeamPortfolio,
} from "@shadowproducer/contracts"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"

const now = "2026-08-28T10:00:00.000Z"

class MemoryPortfolioRepository implements PortfolioRepository {
  readonly portfolios: TeamPortfolio[] = []
  readonly candidates: ApprovedPortfolioCandidate[] = [
    {
      assetId: "asset-approved-v11",
      reviewFileId: "review-v11",
      projectId: "winter-coffee",
      projectName: "冬夜咖啡",
      title: "冬夜咖啡_主片",
      version: "v11",
      duration: "00:30",
      thumbnailUrl: "/assets/winter-coffee.png",
      downloadAvailable: true,
    },
  ]
  private readonly createReceipts = new Map<string, TeamPortfolio>()
  private readonly contentReceipts = new Map<string, TeamPortfolio>()
  private readonly mutationReceipts = new Map<string, TeamPortfolio>()
  private readonly views = new Map<string, { views: number; visitors: Set<string> }>()

  async getTeamAccess(actorId: string, teamId: string) {
    if (teamId !== "north") return null
    if (actorId === "account-fanxing") return { canRead: true, canWrite: true }
    if (actorId === "account-viewer") return { canRead: true, canWrite: false }
    return null
  }

  async listPortfolios(teamId: string, archived = false) {
    return structuredClone(
      this.portfolios.filter(
        (item) => item.teamId === teamId && item.archived === archived,
      ),
    )
  }

  async listApprovedCandidates(teamId: string) {
    return teamId === "north" ? structuredClone(this.candidates) : []
  }

  async createPortfolio(command: CreatePortfolioCommand) {
    const replay = this.createReceipts.get(command.idempotencyKey)
    if (replay) return { item: structuredClone(replay), replayed: true }
    const item: TeamPortfolio = {
      id: `portfolio-${this.portfolios.length + 1}`,
      teamId: command.teamId,
      title: command.title,
      category: command.category,
      year: command.year,
      state: "团队可见",
      description: command.description,
      themePreset: "editorial",
      seoTitle: "",
      seoDescription: "",
      customDomain: null,
      archived: false,
      revision: 1,
      publicSlug: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      contents: [],
    }
    this.portfolios.push(item)
    this.createReceipts.set(command.idempotencyKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async addContent(command: AddPortfolioContentCommand) {
    const replay = this.contentReceipts.get(command.idempotencyKey)
    if (replay) return { item: structuredClone(replay), replayed: true }
    const portfolio = this.portfolios.find(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        !item.archived,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    const candidate = this.candidates.find(
      (item) =>
        item.assetId === command.assetId && item.reviewFileId === command.reviewFileId,
    )
    if (!candidate) return { kind: "candidate_invalid" } as const
    const content: PortfolioContent = {
      id: `content-${portfolio.contents.length + 1}`,
      portfolioId: portfolio.id,
      assetId: candidate.assetId,
      reviewFileId: candidate.reviewFileId,
      projectId: candidate.projectId,
      projectName: candidate.projectName,
      title: candidate.title,
      kind: "主片",
      caption: command.caption,
      version: candidate.version,
      duration: candidate.duration,
      featured: command.featured,
      sortOrder: portfolio.contents.length,
      thumbnailUrl: candidate.thumbnailUrl,
      downloadAvailable: candidate.downloadAvailable,
      createdAt: now,
      updatedAt: now,
    }
    portfolio.contents.push(content)
    portfolio.revision += 1
    if (portfolio.state === "已公开") {
      portfolio.state = "待发布"
      portfolio.publishedAt = null
    }
    this.contentReceipts.set(command.idempotencyKey, portfolio)
    return { item: structuredClone(portfolio), replayed: false }
  }

  async publishPortfolio(command: ChangePortfolioPublicationCommand) {
    const portfolio = this.portfolios.find(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        !item.archived,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision)
      return { kind: "conflict" } as const
    if (
      !portfolio.contents.length ||
      portfolio.contents.some((item) => !item.downloadAvailable)
    ) {
      return { kind: "candidate_invalid" } as const
    }
    portfolio.state = "已公开"
    portfolio.publicSlug ??= "public-portfolio-1"
    portfolio.publishedAt = now
    portfolio.revision += 1
    return { item: structuredClone(portfolio), replayed: false }
  }

  async unpublishPortfolio(command: ChangePortfolioPublicationCommand) {
    const portfolio = this.portfolios.find(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        !item.archived,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision)
      return { kind: "conflict" } as const
    portfolio.state = "团队可见"
    portfolio.publishedAt = null
    portfolio.revision += 1
    return { item: structuredClone(portfolio), replayed: false }
  }

  async archivePortfolio(command: ChangePortfolioPublicationCommand) {
    const replay = this.mutationReceipts.get(command.idempotencyKey)
    if (replay) return { item: structuredClone(replay), replayed: true }
    const portfolio = this.portfolios.find(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        !item.archived,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    portfolio.archived = true
    portfolio.state = "团队可见"
    portfolio.publishedAt = null
    portfolio.revision += 1
    this.mutationReceipts.set(command.idempotencyKey, structuredClone(portfolio))
    return { item: structuredClone(portfolio), replayed: false }
  }

  async restorePortfolio(command: ChangePortfolioPublicationCommand) {
    const replay = this.mutationReceipts.get(command.idempotencyKey)
    if (replay) return { item: structuredClone(replay), replayed: true }
    const portfolio = this.portfolios.find(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        item.archived,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    if (
      this.portfolios.some(
        (item) =>
          item.teamId === command.teamId &&
          !item.archived &&
          item.id !== portfolio.id &&
          item.title.toLocaleLowerCase() === portfolio.title.toLocaleLowerCase(),
      )
    ) {
      return { kind: "name_conflict" } as const
    }
    portfolio.archived = false
    portfolio.state = "团队可见"
    portfolio.publishedAt = null
    portfolio.revision += 1
    this.mutationReceipts.set(command.idempotencyKey, structuredClone(portfolio))
    return { item: structuredClone(portfolio), replayed: false }
  }

  async permanentlyDeletePortfolio(command: PermanentlyDeletePortfolioCommand) {
    const index = this.portfolios.findIndex(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        item.archived,
    )
    if (index < 0) return { kind: "not_found" } as const
    if (this.portfolios[index]?.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    const [deleted] = this.portfolios.splice(index, 1)
    return { kind: "ok", item: { id: deleted?.id ?? command.portfolioId } } as const
  }

  async getPortfolio(teamId: string, portfolioId: string) {
    return structuredClone(
      this.portfolios.find(
        (item) => item.teamId === teamId && item.id === portfolioId && !item.archived,
      ) ?? null,
    )
  }

  async updateSettings(command: UpdatePortfolioSettingsCommand) {
    const replay = this.mutationReceipts.get(command.idempotencyKey)
    if (replay) return { item: structuredClone(replay), replayed: true }
    const portfolio = this.portfolios.find(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        !item.archived,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision)
      return { kind: "conflict" } as const
    portfolio.themePreset = command.themePreset
    portfolio.seoTitle = command.seoTitle
    portfolio.seoDescription = command.seoDescription
    portfolio.revision += 1
    this.mutationReceipts.set(command.idempotencyKey, structuredClone(portfolio))
    return { item: structuredClone(portfolio), replayed: false }
  }

  async bindDomain(command: BindPortfolioDomainCommand) {
    const portfolio = this.portfolios.find(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        !item.archived,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision)
      return { kind: "conflict" } as const
    if (
      this.portfolios.some(
        (item) =>
          item.id !== portfolio.id && item.customDomain?.domain === command.domain,
      )
    ) {
      return { kind: "domain_conflict" } as const
    }
    portfolio.customDomain = {
      domain: command.domain,
      status: "pending",
      verificationName: `_shadowproducer.${command.domain}`,
      verificationValue: command.verificationValue,
      verifiedAt: null,
    }
    portfolio.revision += 1
    return { item: structuredClone(portfolio), replayed: false }
  }

  async verifyDomain(command: ChangePortfolioDomainCommand) {
    const portfolio = this.portfolios.find(
      (item) =>
        item.id === command.portfolioId &&
        item.teamId === command.teamId &&
        !item.archived,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision)
      return { kind: "conflict" } as const
    if (!portfolio.customDomain) return { kind: "not_found" } as const
    portfolio.customDomain.status = "verified"
    portfolio.customDomain.verifiedAt = now
    portfolio.revision += 1
    return { item: structuredClone(portfolio), replayed: false }
  }

  async unbindDomain(command: ChangePortfolioDomainCommand) {
    const portfolio = this.portfolios.find(
      (item) => item.id === command.portfolioId && item.teamId === command.teamId,
    )
    if (!portfolio) return { kind: "not_found" } as const
    if (portfolio.revision !== command.expectedRevision)
      return { kind: "conflict" } as const
    portfolio.customDomain = null
    portfolio.revision += 1
    return { item: structuredClone(portfolio), replayed: false }
  }

  async getAnalytics(teamId: string, portfolioId: string) {
    const portfolio = this.portfolios.find(
      (item) => item.id === portfolioId && item.teamId === teamId && !item.archived,
    )
    if (!portfolio) return null
    const current = this.views.get(portfolioId)
    return {
      totalViews: current?.views ?? 0,
      uniqueVisitors: current?.visitors.size ?? 0,
      days: current
        ? [
            {
              date: "2026-08-28",
              views: current.views,
              uniqueVisitors: current.visitors.size,
            },
          ]
        : [],
    }
  }

  async getPublicPortfolio(slug: string) {
    const portfolio = this.portfolios.find(
      (item) => item.publicSlug === slug && item.state === "已公开" && !item.archived,
    )
    if (!portfolio?.publishedAt) return null
    return {
      slug,
      title: portfolio.title,
      category: portfolio.category,
      year: portfolio.year,
      description: portfolio.description,
      themePreset: portfolio.themePreset,
      seoTitle: portfolio.seoTitle,
      seoDescription: portfolio.seoDescription,
      customDomain:
        portfolio.customDomain?.status === "verified"
          ? portfolio.customDomain.domain
          : null,
      publishedAt: portfolio.publishedAt,
      contents: portfolio.contents.map((content) => ({
        id: content.id,
        title: content.title,
        caption: content.caption,
        projectName: content.projectName,
        version: content.version,
        duration: content.duration,
        featured: content.featured,
        sortOrder: content.sortOrder,
      })),
    }
  }

  async getPublicContentSource(slug: string, contentId: string) {
    const portfolio = this.portfolios.find(
      (item) => item.publicSlug === slug && item.state === "已公开" && !item.archived,
    )
    return portfolio?.contents.some(
      (content) => content.id === contentId && content.downloadAvailable,
    )
      ? { objectKey: `portfolios/${contentId}` }
      : null
  }

  async getPublicPortfolioByDomain(domain: string) {
    const portfolio = this.portfolios.find(
      (item) =>
        item.customDomain?.domain === domain &&
        item.customDomain.status === "verified" &&
        item.state === "已公开" &&
        !item.archived,
    )
    return portfolio?.publicSlug ? this.getPublicPortfolio(portfolio.publicSlug) : null
  }

  async recordPublicView(slug: string, visitorHash: string) {
    const portfolio = this.portfolios.find(
      (item) => item.publicSlug === slug && item.state === "已公开" && !item.archived,
    )
    if (!portfolio) return false
    const current = this.views.get(portfolio.id) ?? {
      views: 0,
      visitors: new Set<string>(),
    }
    current.views += 1
    current.visitors.add(visitorHash)
    this.views.set(portfolio.id, current)
    return true
  }
}

const assetStorage: AssetStorage = {
  async ensureReady() {},
  async createMultipartUpload() {
    throw new Error("not used")
  },
  async listMultipartParts() {
    return []
  },
  async createMultipartPartUploads() {
    return []
  },
  async completeMultipartUpload() {
    throw new Error("not used")
  },
  async abortMultipartUpload() {},
  async createDownloadUrl(objectKey) {
    return `https://media.example/${objectKey}`
  },
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

async function createTestApp() {
  const repository = new MemoryPortfolioRepository()
  const app = await buildApp({
    scriptService: new ScriptService(unusedScriptRepository),
    portfolioService: new PortfolioService(repository, assetStorage, async () => [
      [repository.portfolios[0]?.customDomain?.verificationValue ?? ""],
    ]),
    logger: false,
  })
  apps.push(app)
  return { app, repository }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("team portfolio API", () => {
  it("enforces team read and write access", async () => {
    const { app } = await createTestApp()
    const missingActor = await app.inject({
      method: "GET",
      url: "/v1/teams/north/portfolios",
    })
    const viewerWrite = await app.inject({
      method: "POST",
      url: "/v1/teams/north/portfolios",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        title: "只读用户作品集",
        category: "短片",
        year: "2026",
        description: "",
        idempotencyKey: "portfolio-viewer-001",
      },
    })
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
      payload: {
        title: "归档权限检查",
        category: "短片",
        year: "2026",
        description: "",
        idempotencyKey: "portfolio-access-archive-create",
      },
    })
    const viewerArchive = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${created.json().item.id}/archive`,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        expectedRevision: 1,
        idempotencyKey: "portfolio-access-archive",
      },
    })

    expect(missingActor.statusCode).toBe(401)
    expect(viewerWrite.statusCode).toBe(403)
    expect(viewerArchive.statusCode).toBe(403)
  })

  it("lists approved candidates and creates portfolios idempotently", async () => {
    const { app, repository } = await createTestApp()
    const candidates = await app.inject({
      method: "GET",
      url: "/v1/teams/north/portfolio-candidates",
      headers: writerHeaders,
    })
    const request = {
      method: "POST" as const,
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
      payload: {
        title: "站台夜戏",
        category: "品牌短片",
        year: "2026",
        description: "已通过成片精选",
        idempotencyKey: "portfolio-create-001",
      },
    }
    const created = await app.inject(request)
    const replay = await app.inject(request)

    expect(candidates.statusCode).toBe(200)
    expect(candidates.json().items).toHaveLength(1)
    expect(created.statusCode).toBe(201)
    expect(replay.statusCode).toBe(200)
    expect(replay.json().replayed).toBe(true)
    expect(repository.portfolios).toHaveLength(1)
  })

  it("adds an approved asset reference and returns it on the next read", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
      payload: {
        title: "站台夜戏",
        category: "品牌短片",
        year: "2026",
        description: "已通过成片精选",
        idempotencyKey: "portfolio-create-002",
      },
    })
    const portfolio = created.json().item
    const added = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${portfolio.id}/items`,
      headers: writerHeaders,
      payload: {
        assetId: "asset-approved-v11",
        reviewFileId: "review-v11",
        caption: "最终确认版",
        featured: true,
        expectedRevision: portfolio.revision,
        idempotencyKey: "portfolio-content-001",
      },
    })
    const list = await app.inject({
      method: "GET",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
    })

    expect(added.statusCode).toBe(200)
    expect(added.json().item).toMatchObject({
      revision: 2,
      contents: [
        {
          assetId: "asset-approved-v11",
          reviewFileId: "review-v11",
          projectId: "winter-coffee",
        },
      ],
    })
    expect(list.json().items[0].contents).toHaveLength(1)
  })

  it("publishes, serves, and withdraws a portfolio without member auth", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
      payload: {
        title: "站台夜戏",
        category: "品牌短片",
        year: "2026",
        description: "已通过成片精选",
        idempotencyKey: "portfolio-create-public",
      },
    })
    const added = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${created.json().item.id}/items`,
      headers: writerHeaders,
      payload: {
        assetId: "asset-approved-v11",
        reviewFileId: "review-v11",
        caption: "最终确认版",
        featured: true,
        expectedRevision: 1,
        idempotencyKey: "portfolio-content-public",
      },
    })
    const published = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${created.json().item.id}/publish`,
      headers: writerHeaders,
      payload: {
        expectedRevision: added.json().item.revision,
        idempotencyKey: "portfolio-publish-001",
      },
    })
    const slug = published.json().item.publicSlug
    const publicRead = await app.inject({ method: "GET", url: `/portfolio/${slug}` })
    const media = await app.inject({
      method: "GET",
      url: `/portfolio/${slug}/contents/content-1/content-url`,
    })
    const unpublished = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${created.json().item.id}/unpublish`,
      headers: writerHeaders,
      payload: {
        expectedRevision: published.json().item.revision,
        idempotencyKey: "portfolio-unpublish-001",
      },
    })
    const unavailable = await app.inject({ method: "GET", url: `/portfolio/${slug}` })

    expect(published.statusCode).toBe(200)
    expect(publicRead.statusCode).toBe(200)
    expect(publicRead.json().contents).toHaveLength(1)
    expect(media.json()).toEqual({ url: "https://media.example/portfolios/content-1" })
    expect(unpublished.json().item.state).toBe("团队可见")
    expect(unavailable.statusCode).toBe(404)
  })

  it("archives and restores a published portfolio without reopening its public URL", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
      payload: {
        title: "可恢复作品集",
        category: "品牌短片",
        year: "2026",
        description: "保留具体成片引用",
        idempotencyKey: "portfolio-archive-create",
      },
    })
    const id = created.json().item.id
    const added = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/items`,
      headers: writerHeaders,
      payload: {
        assetId: "asset-approved-v11",
        reviewFileId: "review-v11",
        caption: "最终确认版",
        featured: true,
        expectedRevision: 1,
        idempotencyKey: "portfolio-archive-content",
      },
    })
    const published = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/publish`,
      headers: writerHeaders,
      payload: {
        expectedRevision: added.json().item.revision,
        idempotencyKey: "portfolio-archive-publish",
      },
    })
    const slug = published.json().item.publicSlug
    const stale = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/archive`,
      headers: writerHeaders,
      payload: {
        expectedRevision: published.json().item.revision - 1,
        idempotencyKey: "portfolio-archive-stale",
      },
    })
    const archiveRequest = {
      method: "POST" as const,
      url: `/v1/teams/north/portfolios/${id}/archive`,
      headers: writerHeaders,
      payload: {
        expectedRevision: published.json().item.revision,
        idempotencyKey: "portfolio-archive-apply",
      },
    }
    const archived = await app.inject(archiveRequest)
    const archiveReplay = await app.inject(archiveRequest)
    const activeList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
    })
    const trashList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/portfolios?archived=1",
      headers: writerHeaders,
    })
    const publicRead = await app.inject({ method: "GET", url: `/portfolio/${slug}` })
    const publicMedia = await app.inject({
      method: "GET",
      url: `/portfolio/${slug}/contents/content-1/content-url`,
    })
    const publicView = await app.inject({
      method: "POST",
      url: `/portfolio/${slug}/views`,
    })
    const restored = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/restore`,
      headers: writerHeaders,
      payload: {
        expectedRevision: archived.json().item.revision,
        idempotencyKey: "portfolio-restore-apply",
      },
    })
    const stillPrivate = await app.inject({ method: "GET", url: `/portfolio/${slug}` })

    expect(stale.statusCode).toBe(409)
    expect(archived.json().item).toMatchObject({
      archived: true,
      state: "团队可见",
      publicSlug: slug,
      contents: [{ reviewFileId: "review-v11" }],
    })
    expect(archiveReplay.json().replayed).toBe(true)
    expect(activeList.json().items).toHaveLength(0)
    expect(trashList.json().items).toMatchObject([{ id, archived: true }])
    expect(publicRead.statusCode).toBe(404)
    expect(publicMedia.statusCode).toBe(404)
    expect(publicView.statusCode).toBe(404)
    expect(restored.json().item).toMatchObject({
      archived: false,
      state: "团队可见",
      publicSlug: slug,
      contents: [{ reviewFileId: "review-v11" }],
    })
    expect(stillPrivate.statusCode).toBe(404)
  })

  it("keeps an archived portfolio in the recycle bin when its name is occupied", async () => {
    const { app } = await createTestApp()
    const create = (idempotencyKey: string) =>
      app.inject({
        method: "POST",
        url: "/v1/teams/north/portfolios",
        headers: writerHeaders,
        payload: {
          title: "同名作品集",
          category: "短片",
          year: "2026",
          description: "",
          idempotencyKey,
        },
      })
    const first = await create("portfolio-name-first")
    const archived = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${first.json().item.id}/archive`,
      headers: writerHeaders,
      payload: {
        expectedRevision: 1,
        idempotencyKey: "portfolio-name-archive",
      },
    })
    await create("portfolio-name-second")
    const restore = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${first.json().item.id}/restore`,
      headers: writerHeaders,
      payload: {
        expectedRevision: archived.json().item.revision,
        idempotencyKey: "portfolio-name-restore",
      },
    })
    const trashList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/portfolios?archived=1",
      headers: writerHeaders,
    })

    expect(restore.statusCode).toBe(409)
    expect(restore.json().code).toBe("PORTFOLIO_NAME_CONFLICT")
    expect(trashList.json().items).toMatchObject([
      { id: first.json().item.id, archived: true },
    ])
  })

  it("permanently deletes only archived portfolios with confirmation and matching revision", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
      payload: {
        title: "待永久删除作品集",
        category: "短片",
        year: "2026",
        description: "",
        idempotencyKey: "portfolio-delete-create",
      },
    })
    const id = created.json().item.id
    const activeDelete = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/portfolios/${id}/permanent`,
      headers: writerHeaders,
      payload: { expectedRevision: 1, confirmation: "permanent-delete" },
    })
    const archived = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/archive`,
      headers: writerHeaders,
      payload: {
        expectedRevision: 1,
        idempotencyKey: "portfolio-delete-archive",
      },
    })
    const revision = archived.json().item.revision
    const malformed = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/portfolios/${id}/permanent`,
      headers: writerHeaders,
      payload: { expectedRevision: revision },
    })
    const viewerDelete = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/portfolios/${id}/permanent`,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { expectedRevision: revision, confirmation: "permanent-delete" },
    })
    const stale = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/portfolios/${id}/permanent`,
      headers: writerHeaders,
      payload: { expectedRevision: revision - 1, confirmation: "permanent-delete" },
    })
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/teams/north/portfolios/${id}/permanent`,
      headers: writerHeaders,
      payload: { expectedRevision: revision, confirmation: "permanent-delete" },
    })
    const trashList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/portfolios?archived=1",
      headers: writerHeaders,
    })
    const restore = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/restore`,
      headers: writerHeaders,
      payload: {
        expectedRevision: revision,
        idempotencyKey: "portfolio-delete-restore",
      },
    })

    expect(activeDelete.statusCode).toBe(404)
    expect(malformed.statusCode).toBe(400)
    expect(viewerDelete.statusCode).toBe(403)
    expect(stale.statusCode).toBe(409)
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json()).toEqual({ id })
    expect(trashList.json().items).toEqual([])
    expect(restore.statusCode).toBe(404)
  })

  it("rejects stale revisions and non-approved candidates", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
      payload: {
        title: "站台夜戏",
        category: "品牌短片",
        year: "2026",
        description: "",
        idempotencyKey: "portfolio-create-003",
      },
    })
    const portfolio = created.json().item
    const invalid = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${portfolio.id}/items`,
      headers: writerHeaders,
      payload: {
        assetId: "asset-not-approved",
        reviewFileId: "review-missing",
        caption: "",
        featured: false,
        expectedRevision: 1,
        idempotencyKey: "portfolio-content-invalid",
      },
    })
    const added = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${portfolio.id}/items`,
      headers: writerHeaders,
      payload: {
        assetId: "asset-approved-v11",
        reviewFileId: "review-v11",
        caption: "",
        featured: true,
        expectedRevision: 1,
        idempotencyKey: "portfolio-content-002",
      },
    })
    const conflict = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${portfolio.id}/items`,
      headers: writerHeaders,
      payload: {
        assetId: "asset-approved-v11",
        reviewFileId: "review-v11",
        caption: "旧页面",
        featured: false,
        expectedRevision: 1,
        idempotencyKey: "portfolio-content-003",
      },
    })

    expect(invalid.statusCode).toBe(409)
    expect(invalid.json().code).toBe("PORTFOLIO_CANDIDATE_INVALID")
    expect(added.statusCode).toBe(200)
    expect(conflict.statusCode).toBe(409)
  })

  it("persists publishing settings, verifies a domain, and records private analytics", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/portfolios",
      headers: writerHeaders,
      payload: {
        title: "站台夜戏",
        category: "品牌短片",
        year: "2026",
        description: "已通过成片精选",
        idempotencyKey: "portfolio-create-enhanced",
      },
    })
    const id = created.json().item.id
    const settingsRequest = {
      method: "POST" as const,
      url: `/v1/teams/north/portfolios/${id}/settings`,
      headers: writerHeaders,
      payload: {
        themePreset: "screening",
        seoTitle: "冬夜咖啡幕后作品集",
        seoDescription: "北岸影像冬夜咖啡广告片精选镜头。",
        expectedRevision: 1,
        idempotencyKey: "portfolio-settings-001",
      },
    }
    const settings = await app.inject(settingsRequest)
    const settingsReplay = await app.inject(settingsRequest)
    const bound = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/domain`,
      headers: writerHeaders,
      payload: {
        domain: "Show.Example.COM.",
        expectedRevision: settings.json().item.revision,
        idempotencyKey: "portfolio-domain-bind-001",
      },
    })
    const verified = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/domain/verify`,
      headers: writerHeaders,
      payload: {
        expectedRevision: bound.json().item.revision,
        idempotencyKey: "portfolio-domain-verify-001",
      },
    })
    const added = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/items`,
      headers: writerHeaders,
      payload: {
        assetId: "asset-approved-v11",
        reviewFileId: "review-v11",
        caption: "最终确认版",
        featured: true,
        expectedRevision: verified.json().item.revision,
        idempotencyKey: "portfolio-content-enhanced",
      },
    })
    const published = await app.inject({
      method: "POST",
      url: `/v1/teams/north/portfolios/${id}/publish`,
      headers: writerHeaders,
      payload: {
        expectedRevision: added.json().item.revision,
        idempotencyKey: "portfolio-publish-enhanced",
      },
    })
    const slug = published.json().item.publicSlug
    const byDomain = await app.inject({
      method: "GET",
      url: "/portfolio-domain/show.example.com",
    })
    await app.inject({
      method: "POST",
      url: `/portfolio/${slug}/views`,
      headers: { "user-agent": "portfolio-test" },
    })
    await app.inject({
      method: "POST",
      url: `/portfolio/${slug}/views`,
      headers: { "user-agent": "portfolio-test" },
    })
    const analytics = await app.inject({
      method: "GET",
      url: `/v1/teams/north/portfolios/${id}/analytics?days=30`,
      headers: writerHeaders,
    })

    expect(settings.statusCode).toBe(200)
    expect(settingsReplay.json().replayed).toBe(true)
    expect(bound.json().item.customDomain).toMatchObject({
      domain: "show.example.com",
      status: "pending",
      verificationName: "_shadowproducer.show.example.com",
    })
    expect(verified.json().item.customDomain.status).toBe("verified")
    expect(byDomain.json()).toMatchObject({
      themePreset: "screening",
      seoTitle: "冬夜咖啡幕后作品集",
      customDomain: "show.example.com",
    })
    expect(analytics.json()).toMatchObject({
      totalViews: 2,
      uniqueVisitors: 1,
    })
  })
})
