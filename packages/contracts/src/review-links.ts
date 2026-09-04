import { type Static, Type } from "@sinclair/typebox"

import { ReviewCommentSchema } from "./production"

export const ReviewLinkScopeSchema = Type.Object({
  canComment: Type.Boolean(),
  canCompare: Type.Boolean(),
  canDownload: Type.Boolean(),
  canApprove: Type.Boolean(),
})

export const CreateReviewLinkBodySchema = Type.Object({
  fileIds: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
    minItems: 1,
    maxItems: 20,
  }),
  scope: ReviewLinkScopeSchema,
  expiresAt: Type.String({ minLength: 1, maxLength: 100 }),
  password: Type.Optional(Type.String({ minLength: 6, maxLength: 128 })),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const ReviewLinkSchema = Type.Object({
  id: Type.String(),
  projectId: Type.String(),
  fileIds: Type.Array(Type.String()),
  scope: ReviewLinkScopeSchema,
  expiresAt: Type.String(),
  revokedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  url: Type.String(),
})

export const ReviewLinkMutationSchema = Type.Object({
  item: ReviewLinkSchema,
  replayed: Type.Boolean(),
})
export const ReviewLinkListSchema = Type.Object({ items: Type.Array(ReviewLinkSchema) })

export const ReviewLinkParamsSchema = Type.Object({
  projectId: Type.String({ minLength: 1, maxLength: 100 }),
  linkId: Type.String({ minLength: 1, maxLength: 100 }),
})
export const RevokeReviewLinkBodySchema = Type.Object({
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})
export const PublicReviewTokenParamsSchema = Type.Object({
  token: Type.String({ minLength: 32, maxLength: 200 }),
})
export const PublicReviewSessionParamsSchema = Type.Object({
  linkId: Type.String({ minLength: 1, maxLength: 100 }),
})
export const PublicReviewFileParamsSchema = Type.Object({
  linkId: Type.String({ minLength: 1, maxLength: 100 }),
  fileId: Type.String({ minLength: 1, maxLength: 100 }),
})
export const PublicReviewContentUrlQuerySchema = Type.Object({
  download: Type.Optional(Type.Literal("1")),
})

export const RequestReviewIdentityBodySchema = Type.Object({
  displayName: Type.String({ minLength: 1, maxLength: 80 }),
  email: Type.String({ minLength: 3, maxLength: 254 }),
  password: Type.Optional(Type.String({ maxLength: 128 })),
})

export const ReviewIdentityChallengeSchema = Type.Object({
  challengeId: Type.String(),
  emailMasked: Type.String(),
  expiresAt: Type.String(),
  developmentCode: Type.Optional(Type.String()),
})

export const OpenReviewSessionBodySchema = Type.Object({
  challengeId: Type.String({ minLength: 1, maxLength: 100 }),
  code: Type.String({ minLength: 6, maxLength: 6 }),
})

export const PublicReviewFileSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  version: Type.String(),
  status: Type.String(),
  duration: Type.Union([Type.String(), Type.Null()]),
  comments: Type.Integer({ minimum: 0 }),
  approvedBy: Type.Union([Type.String(), Type.Null()]),
  approvedAt: Type.Union([Type.String(), Type.Null()]),
  revision: Type.Integer({ minimum: 1 }),
})

export const PublicReviewWorkspaceSchema = Type.Object({
  linkId: Type.String(),
  projectName: Type.String(),
  displayName: Type.String(),
  verifiedIdentity: Type.Object({
    emailMasked: Type.String(),
    verifiedAt: Type.String(),
  }),
  scope: ReviewLinkScopeSchema,
  expiresAt: Type.String(),
  files: Type.Array(PublicReviewFileSchema),
})

export const PublicReviewCommentListSchema = Type.Object({
  items: Type.Array(ReviewCommentSchema),
})
export const PublicReviewCommentMutationSchema = Type.Object({
  item: ReviewCommentSchema,
  replayed: Type.Boolean(),
})
export const PublicReviewApprovalBodySchema = Type.Object({
  expectedRevision: Type.Integer({ minimum: 1 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export type ReviewLinkScope = Static<typeof ReviewLinkScopeSchema>
export type CreateReviewLinkBody = Static<typeof CreateReviewLinkBodySchema>
export type ReviewLink = Static<typeof ReviewLinkSchema>
export type ReviewLinkParams = Static<typeof ReviewLinkParamsSchema>
export type RevokeReviewLinkBody = Static<typeof RevokeReviewLinkBodySchema>
export type PublicReviewTokenParams = Static<typeof PublicReviewTokenParamsSchema>
export type PublicReviewSessionParams = Static<typeof PublicReviewSessionParamsSchema>
export type PublicReviewFileParams = Static<typeof PublicReviewFileParamsSchema>
export type PublicReviewContentUrlQuery = Static<typeof PublicReviewContentUrlQuerySchema>
export type RequestReviewIdentityBody = Static<typeof RequestReviewIdentityBodySchema>
export type ReviewIdentityChallenge = Static<typeof ReviewIdentityChallengeSchema>
export type OpenReviewSessionBody = Static<typeof OpenReviewSessionBodySchema>
export type PublicReviewFile = Static<typeof PublicReviewFileSchema>
export type PublicReviewWorkspace = Static<typeof PublicReviewWorkspaceSchema>
export type PublicReviewApprovalBody = Static<typeof PublicReviewApprovalBodySchema>
