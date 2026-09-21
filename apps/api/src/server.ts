import {
  AgentCommandService,
  AnalysisService,
  AppError,
  AssetService,
  ContactService,
  DataExportService,
  PortfolioService,
  ProductionService,
  type ReviewIdentityDelivery,
  ReviewLinkService,
  ScriptService,
  WorkspaceService,
} from "@shadowproducer/application"
import { Pool } from "pg"

import { buildApp } from "./app"
import {
  allowDevHeaderFromEnvironment,
  authAllowSignUpFromEnvironment,
  authBaseURLFromEnvironment,
  authSecretFromEnvironment,
  authTrustedOriginsFromEnvironment,
  createAuthGateway,
  createShadowAuth,
} from "./auth"
import { createDatabase, defaultDatabaseUrl } from "./database"
import {
  createEmbeddingWithModelApi,
  modelApiConfigFromEnvironment,
} from "./openai-compatible-model-provider"
import { PostgresAgentCommandRepository } from "./postgres-agent-command-repository"
import { PostgresAnalysisJobRepository } from "./postgres-analysis-job-repository"
import { PostgresAssetRepository } from "./postgres-asset-repository"
import { PostgresContactRepository } from "./postgres-contact-repository"
import { PostgresDataExportRepository } from "./postgres-data-export-repository"
import { PostgresPortfolioRepository } from "./postgres-portfolio-repository"
import { PostgresProductionRepository } from "./postgres-production-repository"
import { PostgresReviewLinkRepository } from "./postgres-review-link-repository"
import { PostgresScriptRealtimeStore } from "./postgres-script-realtime-store"
import { PostgresScriptRepository } from "./postgres-script-repository"
import { PostgresWorkspaceRepository } from "./postgres-workspace-repository"
import { createS3AssetStorage } from "./s3-asset-storage"

const host = process.env.API_HOST ?? "127.0.0.1"
const port = Number(process.env.API_PORT ?? 3220)
const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl })
const database = createDatabase(databaseUrl, pool)
const authBaseURL = authBaseURLFromEnvironment()
const authSecret = authSecretFromEnvironment()
const auth = createShadowAuth({
  pool,
  baseURL: authBaseURL,
  secret: authSecret,
  trustedOrigins: authTrustedOriginsFromEnvironment(authBaseURL),
  disableSignUp: !authAllowSignUpFromEnvironment(),
})
const repository = new PostgresScriptRepository(database)
const workspaceRepository = new PostgresWorkspaceRepository(database)
const contactRepository = new PostgresContactRepository(database)
const portfolioRepository = new PostgresPortfolioRepository(database)
const productionRepository = new PostgresProductionRepository(database)
const assetRepository = new PostgresAssetRepository(database)
const assetStorage = createS3AssetStorage()
const reviewLinkRepository = new PostgresReviewLinkRepository(database)
const workspaceService = new WorkspaceService(workspaceRepository)
const contactService = new ContactService(contactRepository)
const dataExportService = new DataExportService(
  new PostgresDataExportRepository(database),
)
const scriptService = new ScriptService(repository)
const portfolioService = new PortfolioService(portfolioRepository, assetStorage)
const productionService = new ProductionService(productionRepository)
const analysisService = new AnalysisService(
  new PostgresAnalysisJobRepository(database),
  scriptService,
)
const assetService = new AssetService(
  assetRepository,
  assetStorage,
  Number(process.env.ASSET_MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024 * 1024),
  (input) =>
    createEmbeddingWithModelApi(modelApiConfigFromEnvironment("embedding"), input),
)
const reviewIdentityDelivery: ReviewIdentityDelivery = async (input) => {
  const webhookURL = process.env.REVIEW_IDENTITY_WEBHOOK_URL?.trim()
  if (webhookURL) {
    const secret = process.env.REVIEW_IDENTITY_WEBHOOK_SECRET?.trim()
    const response = await fetch(webhookURL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new AppError("REVIEW_IDENTITY_DELIVERY_FAILED", "验证码发送失败", 503)
    }
    return {}
  }
  if (process.env.NODE_ENV === "production") {
    throw new AppError(
      "REVIEW_IDENTITY_DELIVERY_UNAVAILABLE",
      "客户身份验证服务未配置",
      503,
    )
  }
  return { developmentCode: input.code }
}
const reviewLinkService = new ReviewLinkService(
  reviewLinkRepository,
  assetStorage,
  process.env.REVIEW_LINK_SECRET ?? authSecret,
  process.env.REVIEW_PUBLIC_BASE_URL ?? authBaseURL,
  reviewIdentityDelivery,
)
const app = await buildApp({
  scriptService,
  scriptRealtimeStore: new PostgresScriptRealtimeStore(database),
  analysisService,
  agentService: new AgentCommandService(
    new PostgresAgentCommandRepository(database),
    workspaceService,
    portfolioService,
    productionService,
    reviewLinkService,
    scriptService,
    analysisService,
    assetService,
    contactService,
  ),
  workspaceService,
  contactService,
  dataExportService,
  portfolioService,
  productionService,
  reviewLinkService,
  assetService,
  authGateway: createAuthGateway({
    auth,
    database,
    baseURL: authBaseURL,
    allowDevHeader: allowDevHeaderFromEnvironment(),
  }),
})

const shutdown = async () => {
  await app.close()
  await database.destroy()
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)

try {
  await app.listen({ host, port })
} catch (error) {
  app.log.error(error)
  await shutdown()
  process.exitCode = 1
}
