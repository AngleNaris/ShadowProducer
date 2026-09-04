import { type Static, Type } from "@sinclair/typebox"

export const PortfolioStateSchema = Type.Union([
  Type.Literal("团队可见"),
  Type.Literal("待发布"),
  Type.Literal("已公开"),
])

export const PortfolioContentKindSchema = Type.Literal("主片")

export const PortfolioThemePresetSchema = Type.Union([
  Type.Literal("editorial"),
  Type.Literal("gallery"),
  Type.Literal("screening"),
])

export const PortfolioDomainSchema = Type.Object({
  domain: Type.String(),
  status: Type.Union([Type.Literal("pending"), Type.Literal("verified")]),
  verificationName: Type.String(),
  verificationValue: Type.String(),
  verifiedAt: Type.Union([Type.String(), Type.Null()]),
})

export const PortfolioContentSchema = Type.Object({
  id: Type.String(),
  portfolioId: Type.String(),
  assetId: Type.String(),
  reviewFileId: Type.String(),
  projectId: Type.String(),
  projectName: Type.String(),
  title: Type.String(),
  kind: PortfolioContentKindSchema,
  caption: Type.String(),
  version: Type.String(),
  duration: Type.Union([Type.String(), Type.Null()]),
  featured: Type.Boolean(),
  sortOrder: Type.Integer({ minimum: 0 }),
  thumbnailUrl: Type.Union([Type.String(), Type.Null()]),
  downloadAvailable: Type.Boolean(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const TeamPortfolioSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  title: Type.String(),
  category: Type.String(),
  year: Type.String(),
  state: PortfolioStateSchema,
  description: Type.String(),
  themePreset: PortfolioThemePresetSchema,
  seoTitle: Type.String(),
  seoDescription: Type.String(),
  customDomain: Type.Union([PortfolioDomainSchema, Type.Null()]),
  archived: Type.Boolean(),
  revision: Type.Integer({ minimum: 1 }),
  publicSlug: Type.Union([Type.String(), Type.Null()]),
  publishedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  contents: Type.Array(PortfolioContentSchema),
})

export const ApprovedPortfolioCandidateSchema = Type.Object({
  assetId: Type.String(),
  reviewFileId: Type.String(),
  projectId: Type.String(),
  projectName: Type.String(),
  title: Type.String(),
  version: Type.String(),
  duration: Type.Union([Type.String(), Type.Null()]),
  thumbnailUrl: Type.Union([Type.String(), Type.Null()]),
  downloadAvailable: Type.Boolean(),
})

export const TeamPortfolioListSchema = Type.Object({
  items: Type.Array(TeamPortfolioSchema),
})

export const PortfolioListQuerySchema = Type.Object({
  archived: Type.Optional(Type.Literal("1")),
})

export const ApprovedPortfolioCandidateListSchema = Type.Object({
  items: Type.Array(ApprovedPortfolioCandidateSchema),
})

export const TeamPortfolioMutationSchema = Type.Object({
  item: TeamPortfolioSchema,
  replayed: Type.Boolean(),
})

export const PublicPortfolioContentSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  caption: Type.String(),
  projectName: Type.String(),
  version: Type.String(),
  duration: Type.Union([Type.String(), Type.Null()]),
  featured: Type.Boolean(),
  sortOrder: Type.Integer({ minimum: 0 }),
})

export const PublicPortfolioSchema = Type.Object({
  slug: Type.String(),
  title: Type.String(),
  category: Type.String(),
  year: Type.String(),
  description: Type.String(),
  themePreset: PortfolioThemePresetSchema,
  seoTitle: Type.String(),
  seoDescription: Type.String(),
  customDomain: Type.Union([Type.String(), Type.Null()]),
  publishedAt: Type.String(),
  contents: Type.Array(PublicPortfolioContentSchema),
})

export const TeamPortfolioParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  portfolioId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const PublicPortfolioParamsSchema = Type.Object({
  slug: Type.String({ minLength: 8, maxLength: 100 }),
})

export const PublicPortfolioDomainParamsSchema = Type.Object({
  domain: Type.String({ minLength: 4, maxLength: 253 }),
})

export const PublicPortfolioContentParamsSchema = Type.Object({
  slug: Type.String({ minLength: 8, maxLength: 100 }),
  contentId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const CreateTeamPortfolioBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  category: Type.String({ minLength: 1, maxLength: 100 }),
  year: Type.String({ minLength: 4, maxLength: 10 }),
  description: Type.String({ maxLength: 4_000 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const AddPortfolioContentBodySchema = Type.Object({
  assetId: Type.String({ minLength: 1, maxLength: 100 }),
  reviewFileId: Type.String({ minLength: 1, maxLength: 100 }),
  caption: Type.String({ maxLength: 1_000 }),
  featured: Type.Boolean(),
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const ChangePortfolioPublicationBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdatePortfolioSettingsBodySchema = Type.Object({
  themePreset: PortfolioThemePresetSchema,
  seoTitle: Type.String({ maxLength: 70 }),
  seoDescription: Type.String({ maxLength: 160 }),
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const BindPortfolioDomainBodySchema = Type.Object({
  domain: Type.String({ minLength: 4, maxLength: 253 }),
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const PortfolioAnalyticsQuerySchema = Type.Object({
  days: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
})

export const PortfolioAnalyticsSchema = Type.Object({
  totalViews: Type.Integer({ minimum: 0 }),
  uniqueVisitors: Type.Integer({ minimum: 0 }),
  days: Type.Array(
    Type.Object({
      date: Type.String(),
      views: Type.Integer({ minimum: 0 }),
      uniqueVisitors: Type.Integer({ minimum: 0 }),
    }),
  ),
})

export const PublicPortfolioViewMutationSchema = Type.Object({
  recorded: Type.Literal(true),
})

export type PortfolioState = Static<typeof PortfolioStateSchema>
export type PortfolioThemePreset = Static<typeof PortfolioThemePresetSchema>
export type PortfolioDomain = Static<typeof PortfolioDomainSchema>
export type PortfolioContent = Static<typeof PortfolioContentSchema>
export type TeamPortfolio = Static<typeof TeamPortfolioSchema>
export type PortfolioListQuery = Static<typeof PortfolioListQuerySchema>
export type PublicPortfolio = Static<typeof PublicPortfolioSchema>
export type ApprovedPortfolioCandidate = Static<typeof ApprovedPortfolioCandidateSchema>
export type TeamPortfolioParams = Static<typeof TeamPortfolioParamsSchema>
export type PublicPortfolioParams = Static<typeof PublicPortfolioParamsSchema>
export type PublicPortfolioDomainParams = Static<typeof PublicPortfolioDomainParamsSchema>
export type PublicPortfolioContentParams = Static<
  typeof PublicPortfolioContentParamsSchema
>
export type CreateTeamPortfolioBody = Static<typeof CreateTeamPortfolioBodySchema>
export type AddPortfolioContentBody = Static<typeof AddPortfolioContentBodySchema>
export type ChangePortfolioPublicationBody = Static<
  typeof ChangePortfolioPublicationBodySchema
>
export type UpdatePortfolioSettingsBody = Static<typeof UpdatePortfolioSettingsBodySchema>
export type BindPortfolioDomainBody = Static<typeof BindPortfolioDomainBodySchema>
export type PortfolioAnalyticsQuery = Static<typeof PortfolioAnalyticsQuerySchema>
export type PortfolioAnalytics = Static<typeof PortfolioAnalyticsSchema>
