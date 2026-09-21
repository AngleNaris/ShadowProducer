import { createHash } from "node:crypto"
import { resolveTxt } from "node:dns/promises"
import { isIP } from "node:net"

import type {
  AddPortfolioContentBody,
  ApprovedPortfolioCandidate,
  BindPortfolioDomainBody,
  ChangePortfolioPublicationBody,
  CreateTeamPortfolioBody,
  PermanentlyDeleteRecycleItemBody,
  PortfolioAnalytics,
  PublicPortfolio,
  TeamPortfolio,
  UpdatePortfolioSettingsBody,
} from "@shadowproducer/contracts"
import { accessAllows } from "./access"
import type { AssetStorage } from "./asset-service"
import { playbackResource, playbackUrl } from "./hls-playback"
import { AppError } from "./script-service"
import type { CreateResult, TeamAccess } from "./workspace-service"

type TeamCommand = { actorId: string; teamId: string }

export type CreatePortfolioCommand = TeamCommand & CreateTeamPortfolioBody
export type AddPortfolioContentCommand = TeamCommand &
  AddPortfolioContentBody & { portfolioId: string }
export type ChangePortfolioPublicationCommand = TeamCommand &
  ChangePortfolioPublicationBody & { portfolioId: string }
export type UpdatePortfolioSettingsCommand = TeamCommand &
  UpdatePortfolioSettingsBody & { portfolioId: string }
export type BindPortfolioDomainCommand = TeamCommand &
  BindPortfolioDomainBody & { portfolioId: string; verificationValue: string }
export type ChangePortfolioDomainCommand = TeamCommand &
  ChangePortfolioPublicationBody & { portfolioId: string }
export type PermanentlyDeletePortfolioCommand = TeamCommand &
  PermanentlyDeleteRecycleItemBody & { portfolioId: string }

export type PortfolioWriteResult =
  | CreateResult<TeamPortfolio>
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "candidate_invalid" }
  | { kind: "domain_conflict" }
  | { kind: "name_conflict" }

export type PortfolioDeleteResult =
  | { kind: "ok"; item: { id: string } }
  | { kind: "not_found" }
  | { kind: "conflict" }

export interface PortfolioRepository {
  getTeamAccess(actorId: string, teamId: string): Promise<TeamAccess | null>
  listPortfolios(teamId: string, archived?: boolean): Promise<TeamPortfolio[]>
  listApprovedCandidates(teamId: string): Promise<ApprovedPortfolioCandidate[]>
  createPortfolio(command: CreatePortfolioCommand): Promise<CreateResult<TeamPortfolio>>
  addContent(command: AddPortfolioContentCommand): Promise<PortfolioWriteResult>
  publishPortfolio(
    command: ChangePortfolioPublicationCommand,
  ): Promise<PortfolioWriteResult>
  unpublishPortfolio(
    command: ChangePortfolioPublicationCommand,
  ): Promise<PortfolioWriteResult>
  archivePortfolio(
    command: ChangePortfolioPublicationCommand,
  ): Promise<PortfolioWriteResult>
  restorePortfolio(
    command: ChangePortfolioPublicationCommand,
  ): Promise<PortfolioWriteResult>
  permanentlyDeletePortfolio(
    command: PermanentlyDeletePortfolioCommand,
  ): Promise<PortfolioDeleteResult>
  getPortfolio(teamId: string, portfolioId: string): Promise<TeamPortfolio | null>
  updateSettings(command: UpdatePortfolioSettingsCommand): Promise<PortfolioWriteResult>
  bindDomain(command: BindPortfolioDomainCommand): Promise<PortfolioWriteResult>
  verifyDomain(command: ChangePortfolioDomainCommand): Promise<PortfolioWriteResult>
  unbindDomain(command: ChangePortfolioDomainCommand): Promise<PortfolioWriteResult>
  getAnalytics(
    teamId: string,
    portfolioId: string,
    days: number,
  ): Promise<PortfolioAnalytics | null>
  getPublicPortfolio(slug: string): Promise<PublicPortfolio | null>
  getPublicPortfolioByDomain(domain: string): Promise<PublicPortfolio | null>
  recordPublicView(slug: string, visitorHash: string): Promise<boolean>
  getPublicContentSource(
    slug: string,
    contentId: string,
  ): Promise<{ objectKey: string } | null>
}

export class PortfolioService {
  constructor(
    private readonly repository: PortfolioRepository,
    private readonly storage: AssetStorage,
    private readonly resolveDnsTxt: (
      hostname: string,
    ) => Promise<string[][]> = resolveTxt,
  ) {}

  async listPortfolios(actorId: string, teamId: string, archived = false) {
    await this.assertTeamAccess(actorId, teamId, "team.read", "read")
    return { items: await this.repository.listPortfolios(teamId, archived) }
  }

  async listApprovedCandidates(actorId: string, teamId: string) {
    await this.assertTeamAccess(actorId, teamId, "team.read", "read")
    return { items: await this.repository.listApprovedCandidates(teamId) }
  }

  async createPortfolio(command: CreatePortfolioCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.write",
      "write",
    )
    return this.repository.createPortfolio(command)
  }

  async addContent(command: AddPortfolioContentCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.write",
      "write",
    )
    const result = await this.repository.addContent(command)
    if (!("kind" in result)) return result
    if (result.kind === "candidate_invalid") {
      throw new AppError(
        "PORTFOLIO_CANDIDATE_INVALID",
        "所选内容不是当前团队已通过的可用成片版本",
        409,
      )
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "作品集已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    throw new AppError("RESOURCE_NOT_FOUND", "作品集不存在或已归档", 404)
  }

  async publishPortfolio(command: ChangePortfolioPublicationCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.publish",
      "write",
    )
    return this.requirePublicationResult(await this.repository.publishPortfolio(command))
  }

  async unpublishPortfolio(command: ChangePortfolioPublicationCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.publish",
      "write",
    )
    return this.requirePublicationResult(
      await this.repository.unpublishPortfolio(command),
    )
  }

  async archivePortfolio(command: ChangePortfolioPublicationCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.write",
      "write",
    )
    return this.requireArchiveResult(
      await this.repository.archivePortfolio(command),
      false,
    )
  }

  async restorePortfolio(command: ChangePortfolioPublicationCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.write",
      "write",
    )
    return this.requireArchiveResult(
      await this.repository.restorePortfolio(command),
      true,
    )
  }

  async permanentlyDeletePortfolio(command: PermanentlyDeletePortfolioCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.write",
      "write",
    )
    const result = await this.repository.permanentlyDeletePortfolio(command)
    if (result.kind === "ok") return result.item
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "作品集已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    throw new AppError("RESOURCE_NOT_FOUND", "作品集未归档或不存在", 404)
  }

  async updateSettings(command: UpdatePortfolioSettingsCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.write",
      "write",
    )
    return this.requireWriteResult(await this.repository.updateSettings(command))
  }

  async bindDomain(command: Omit<BindPortfolioDomainCommand, "verificationValue">) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.publish",
      "write",
    )
    const domain = normalizeDomain(command.domain)
    const verificationValue = `shadowproducer-verification=${createHash("sha256")
      .update(`${command.actorId}:${command.portfolioId}:${command.idempotencyKey}`)
      .digest("hex")}`
    return this.requireWriteResult(
      await this.repository.bindDomain({ ...command, domain, verificationValue }),
    )
  }

  async verifyDomain(command: ChangePortfolioDomainCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.publish",
      "write",
    )
    const portfolio = await this.repository.getPortfolio(
      command.teamId,
      command.portfolioId,
    )
    if (!portfolio) throw new AppError("RESOURCE_NOT_FOUND", "作品集不存在", 404)
    if (portfolio.revision !== command.expectedRevision) {
      throw new AppError("RESOURCE_CONFLICT", "作品集已更新，请重新载入", 409)
    }
    if (!portfolio.customDomain) {
      throw new AppError("PORTFOLIO_DOMAIN_NOT_BOUND", "作品集尚未绑定域名", 409)
    }
    let records: string[][]
    try {
      records = await this.resolveDnsTxt(portfolio.customDomain.verificationName)
    } catch {
      throw new AppError("PORTFOLIO_DOMAIN_NOT_VERIFIED", "尚未查询到域名验证记录", 409)
    }
    if (
      !records.some(
        (record) => record.join("") === portfolio.customDomain?.verificationValue,
      )
    ) {
      throw new AppError("PORTFOLIO_DOMAIN_NOT_VERIFIED", "域名验证记录不匹配", 409)
    }
    return this.requireWriteResult(await this.repository.verifyDomain(command))
  }

  async unbindDomain(command: ChangePortfolioDomainCommand) {
    await this.assertTeamAccess(
      command.actorId,
      command.teamId,
      "portfolio.publish",
      "write",
    )
    return this.requireWriteResult(await this.repository.unbindDomain(command))
  }

  async getAnalytics(actorId: string, teamId: string, portfolioId: string, days = 30) {
    await this.assertTeamAccess(actorId, teamId, "team.read", "read")
    const analytics = await this.repository.getAnalytics(teamId, portfolioId, days)
    if (!analytics) throw new AppError("RESOURCE_NOT_FOUND", "作品集不存在", 404)
    return analytics
  }

  async getPublicPortfolio(slug: string) {
    const item = await this.repository.getPublicPortfolio(slug)
    if (!item) throw new AppError("RESOURCE_NOT_FOUND", "公开作品集不存在", 404)
    return item
  }

  async getPublicPortfolioByDomain(domain: string) {
    const item = await this.repository.getPublicPortfolioByDomain(normalizeDomain(domain))
    if (!item) throw new AppError("RESOURCE_NOT_FOUND", "公开作品集不存在", 404)
    return item
  }

  async recordPublicView(slug: string, visitorHash: string) {
    const recorded = await this.repository.recordPublicView(slug, visitorHash)
    if (!recorded) throw new AppError("RESOURCE_NOT_FOUND", "公开作品集不存在", 404)
    return { recorded: true as const }
  }

  async getPublicContentUrl(slug: string, contentId: string) {
    const source = await this.repository.getPublicContentSource(slug, contentId)
    if (!source) throw new AppError("RESOURCE_NOT_FOUND", "公开作品内容不存在", 404)
    return {
      url: await playbackUrl(
        this.storage,
        source.objectKey,
        `/portfolio/${encodeURIComponent(slug)}/contents/${encodeURIComponent(contentId)}/playback`,
      ),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }
  }

  async getPublicPlayback(slug: string, contentId: string, file?: string) {
    const source = await this.repository.getPublicContentSource(slug, contentId)
    if (!source) throw new AppError("RESOURCE_NOT_FOUND", "公开作品内容不存在", 404)
    return playbackResource(this.storage, source.objectKey, file)
  }

  private requirePublicationResult(result: PortfolioWriteResult) {
    if (!("kind" in result)) return result
    if (result.kind === "candidate_invalid") {
      throw new AppError(
        "PORTFOLIO_PUBLICATION_INVALID",
        "作品集必须包含仍已通过且源文件可用的成片",
        409,
      )
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "作品集已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    throw new AppError("RESOURCE_NOT_FOUND", "作品集不存在或已归档", 404)
  }

  private requireWriteResult(result: PortfolioWriteResult) {
    if (!("kind" in result)) return result
    if (result.kind === "domain_conflict") {
      throw new AppError("PORTFOLIO_DOMAIN_CONFLICT", "这个域名已经绑定到其他作品集", 409)
    }
    if (result.kind === "conflict") {
      throw new AppError("RESOURCE_CONFLICT", "作品集已在其他位置更新，请重新载入", 409)
    }
    throw new AppError("RESOURCE_NOT_FOUND", "作品集不存在或已归档", 404)
  }

  private requireArchiveResult(result: PortfolioWriteResult, restoring: boolean) {
    if (!("kind" in result)) return result
    if (result.kind === "name_conflict") {
      throw new AppError("PORTFOLIO_NAME_CONFLICT", "当前团队已存在同名作品集", 409)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "作品集已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    throw new AppError(
      "RESOURCE_NOT_FOUND",
      restoring ? "作品集已恢复或不存在" : "作品集已归档或不存在",
      404,
    )
  }

  private async assertTeamAccess(
    actorId: string,
    teamId: string,
    capability: "team.read" | "portfolio.write" | "portfolio.publish",
    legacyOperation: "read" | "write",
  ) {
    const access = await this.repository.getTeamAccess(actorId, teamId)
    const allowed = accessAllows(access, capability, legacyOperation)
    if (!access || !allowed) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队作品集", 403)
    }
  }
}

function normalizeDomain(value: string) {
  const raw = value.trim().toLowerCase().replace(/\.$/, "")
  let parsed: URL
  try {
    parsed = new URL(`https://${raw}`)
  } catch {
    throw new AppError("PORTFOLIO_DOMAIN_INVALID", "请输入有效的域名", 400)
  }
  const domain = parsed.hostname
  const labels = domain.split(".")
  if (
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    isIP(domain) ||
    labels.length < 2 ||
    domain.length > 253 ||
    labels.some((label) => !label || label.length > 63)
  ) {
    throw new AppError(
      "PORTFOLIO_DOMAIN_INVALID",
      "请输入不含协议、端口和路径的域名",
      400,
    )
  }
  return domain
}
