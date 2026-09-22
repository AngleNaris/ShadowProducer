import { createHash, randomUUID } from "node:crypto"
import type { ServerResponse } from "node:http"
import cors from "@fastify/cors"
import {
  type AgentCommandService,
  type AnalysisService,
  AppError,
  type AssetService,
  type ContactService,
  type DataExportService,
  type PlaybackResource,
  type PortfolioService,
  type ProductionService,
  type ReviewLinkService,
  type ScriptService,
  type WorkspaceService,
} from "@shadowproducer/application"
import {
  type AcceptInvitationBody,
  AcceptInvitationBodySchema,
  type AddPortfolioContentBody,
  AddPortfolioContentBodySchema,
  type AgentCommandParams,
  AgentCommandParamsSchema,
  AgentConfirmationResponseSchema,
  AgentExecutionResponseSchema,
  type AgentPreviewBody,
  AgentPreviewBodySchema,
  AgentPreviewResponseSchema,
  AnalysisJobListSchema,
  AnalysisJobMutationSchema,
  type AnalysisJobParams,
  AnalysisJobParamsSchema,
  AnalysisWorkflowMutationSchema,
  AnalysisWorkflowSchema,
  ApprovedPortfolioCandidateListSchema,
  AssetContentUrlSchema,
  AssetFolderMutationSchema,
  type AssetFolderParams,
  AssetFolderParamsSchema,
  AssetFolderSchema,
  type AssetSemanticSearchBody,
  AssetSemanticSearchBodySchema,
  AssetSemanticSearchResponseSchema,
  AssetUploadIntentResponseSchema,
  type AssignPermissionTemplateBody,
  AssignPermissionTemplateBodySchema,
  AuditLogListSchema,
  type AuditLogQuery,
  AuditLogQuerySchema,
  type BindPortfolioDomainBody,
  BindPortfolioDomainBodySchema,
  BreakdownItemSchema,
  BreakdownListSchema,
  BreakdownMutationSchema,
  BreakdownRelationOptionsSchema,
  CalendarEventListSchema,
  CalendarEventMutationSchema,
  CalendarEventSchema,
  CallSheetHistorySchema,
  CallSheetListSchema,
  CallSheetMutationSchema,
  CallSheetPublishMutationSchema,
  CallSheetSchema,
  type ChangePortfolioPublicationBody,
  ChangePortfolioPublicationBodySchema,
  type CompleteAssetUploadBody,
  CompleteAssetUploadBodySchema,
  type ConfirmBreakdownBody,
  ConfirmBreakdownBodySchema,
  type ContactParams,
  ContactParamsSchema,
  type ContactShareParams,
  ContactShareParamsSchema,
  type CreateAssetFolderBody,
  CreateAssetFolderBodySchema,
  type CreateAssetUploadIntentBody,
  CreateAssetUploadIntentBodySchema,
  type CreateCalendarEventBody,
  CreateCalendarEventBodySchema,
  type CreateCallSheetBody,
  CreateCallSheetBodySchema,
  type CreateExecutionStageBody,
  CreateExecutionStageBodySchema,
  type CreateInvitationBody,
  CreateInvitationBodySchema,
  type CreateMediaAnalysisBody,
  CreateMediaAnalysisBodySchema,
  type CreatePermissionTemplateBody,
  CreatePermissionTemplateBodySchema,
  type CreatePersonalContactBody,
  CreatePersonalContactBodySchema,
  type CreateProjectBody,
  CreateProjectBodySchema,
  type CreateReviewCommentBody,
  CreateReviewCommentBodySchema,
  type CreateReviewCommentLinkBody,
  CreateReviewCommentLinkBodySchema,
  type CreateReviewFileBody,
  CreateReviewFileBodySchema,
  type CreateReviewFolderBody,
  CreateReviewFolderBodySchema,
  type CreateReviewLinkBody,
  CreateReviewLinkBodySchema,
  type CreateScriptBreakdownAnalysisBody,
  CreateScriptBreakdownAnalysisBodySchema,
  type CreateScriptCommentBody,
  CreateScriptCommentBodySchema,
  CreateScriptCommentResponseSchema,
  type CreateScriptDocumentBody,
  CreateScriptDocumentBodySchema,
  CreateScriptDocumentResponseSchema,
  type CreateScriptVersionBody,
  CreateScriptVersionBodySchema,
  CreateScriptVersionResponseSchema,
  type CreateShootingDayBody,
  CreateShootingDayBodySchema,
  type CreateTeamBody,
  CreateTeamBodySchema,
  type CreateTeamContactBody,
  CreateTeamContactBodySchema,
  type CreateTeamPortfolioBody,
  CreateTeamPortfolioBodySchema,
  type CreateTeamSupplierBody,
  CreateTeamSupplierBodySchema,
  type CreateWorkspaceNoteBody,
  CreateWorkspaceNoteBodySchema,
  type CreateWorkspaceTaskBody,
  CreateWorkspaceTaskBodySchema,
  DeletedPersonalContactListSchema,
  type DeleteItemBody,
  DeleteItemBodySchema,
  DeleteItemResponseSchema,
  ErrorResponseSchema,
  ExecutionScheduleSchema,
  ExecutionStageMutationSchema,
  ExecutionStageSchema,
  type ImportTeamContactsBody,
  ImportTeamContactsBodySchema,
  type ImportTeamSuppliersBody,
  ImportTeamSuppliersBodySchema,
  InvitationAcceptanceMutationSchema,
  InvitationListSchema,
  InvitationMutationSchema,
  InvitationSummarySchema,
  MarkAllNotificationsReadSchema,
  type MediaAnalysisKeyframeQuery,
  MediaAnalysisKeyframeQuerySchema,
  MediaAnalysisMutationSchema,
  type MediaAnalysisParams,
  MediaAnalysisParamsSchema,
  MediaAnalysisResponseSchema,
  type MediaAnalysisShotParams,
  MediaAnalysisShotParamsSchema,
  type MergeBreakdownBody,
  MergeBreakdownBodySchema,
  type MoveReviewFileBody,
  MoveReviewFileBodySchema,
  type NotificationListQuery,
  NotificationListQuerySchema,
  type NotificationPreferences,
  NotificationPreferencesSchema,
  OnboardingProjectSchema,
  OnboardingTeamSchema,
  type OpenReviewSessionBody,
  OpenReviewSessionBodySchema,
  type PermanentlyDeleteRecycleItemBody,
  PermanentlyDeleteRecycleItemBodySchema,
  PermissionAssignmentMutationSchema,
  type PermissionProjectMemberParams,
  PermissionProjectMemberParamsSchema,
  type PermissionTeamMemberParams,
  PermissionTeamMemberParamsSchema,
  PermissionTemplateMutationSchema,
  PermissionTemplateSchema,
  PermissionWorkspaceSchema,
  PersonalContactListSchema,
  PersonalContactMutationSchema,
  PersonalContactSchema,
  type PortfolioAnalyticsQuery,
  PortfolioAnalyticsQuerySchema,
  PortfolioAnalyticsSchema,
  type PortfolioListQuery,
  PortfolioListQuerySchema,
  type ProjectItemParams,
  ProjectItemParamsSchema,
  type ProjectParams,
  ProjectParamsSchema,
  type PublicPortfolioContentParams,
  PublicPortfolioContentParamsSchema,
  type PublicPortfolioDomainParams,
  PublicPortfolioDomainParamsSchema,
  type PublicPortfolioParams,
  PublicPortfolioParamsSchema,
  PublicPortfolioSchema,
  PublicPortfolioViewMutationSchema,
  type PublicReviewApprovalBody,
  PublicReviewApprovalBodySchema,
  PublicReviewCommentListSchema,
  PublicReviewCommentMutationSchema,
  type PublicReviewContentUrlQuery,
  PublicReviewContentUrlQuerySchema,
  type PublicReviewFileParams,
  PublicReviewFileParamsSchema,
  PublicReviewFileSchema,
  type PublicReviewSessionParams,
  PublicReviewSessionParamsSchema,
  type PublicReviewTokenParams,
  PublicReviewTokenParamsSchema,
  PublicReviewWorkspaceSchema,
  type PublishCallSheetBody,
  PublishCallSheetBodySchema,
  type RequestReviewIdentityBody,
  RequestReviewIdentityBodySchema,
  type ReviewCommentCorrespondenceQuery,
  ReviewCommentCorrespondenceQuerySchema,
  ReviewCommentCorrespondenceSchema,
  ReviewCommentLinkMutationSchema,
  type ReviewCommentLinkParams,
  ReviewCommentLinkParamsSchema,
  ReviewCommentLinkSchema,
  ReviewCommentListSchema,
  ReviewCommentMutationSchema,
  type ReviewCommentParams,
  ReviewCommentParamsSchema,
  ReviewCommentSchema,
  type ReviewFileApprovalBody,
  ReviewFileApprovalBodySchema,
  type ReviewFileListQuery,
  ReviewFileListQuerySchema,
  ReviewFileListSchema,
  ReviewFileMutationSchema,
  type ReviewFileParams,
  ReviewFileParamsSchema,
  type ReviewFolderListQuery,
  ReviewFolderListQuerySchema,
  ReviewFolderListSchema,
  ReviewFolderMutationSchema,
  type ReviewFolderParams,
  ReviewFolderParamsSchema,
  ReviewFolderSchema,
  ReviewIdentityChallengeSchema,
  ReviewLinkListSchema,
  ReviewLinkMutationSchema,
  type ReviewLinkParams,
  ReviewLinkParamsSchema,
  ReviewLinkSchema,
  type RevokeInvitationBody,
  RevokeInvitationBodySchema,
  type RevokeReviewLinkBody,
  RevokeReviewLinkBodySchema,
  type RotateInvitationTokenBody,
  RotateInvitationTokenBodySchema,
  type ScriptCommentParams,
  ScriptCommentParamsSchema,
  ScriptDocumentListSchema,
  type ScriptDocumentQuery,
  ScriptDocumentQuerySchema,
  type ScriptPresence,
  ScriptPresenceSnapshotSchema,
  type ScriptVersionImpactQuery,
  ScriptVersionImpactQuerySchema,
  ScriptVersionImpactSchema,
  type ScriptVersionParams,
  ScriptVersionParamsSchema,
  ScriptWorkspaceSchema,
  ShootingDayListSchema,
  ShootingDayMutationSchema,
  ShootingDaySchema,
  type SplitBreakdownBody,
  SplitBreakdownBodySchema,
  type TeamAssetListQuery,
  TeamAssetListQuerySchema,
  TeamAssetListSchema,
  TeamAssetMutationSchema,
  type TeamAssetParams,
  TeamAssetParamsSchema,
  TeamAssetSchema,
  TeamContactImportMutationSchema,
  TeamContactListSchema,
  TeamContactMutationSchema,
  type TeamContactParams,
  TeamContactParamsSchema,
  TeamContactSchema,
  type TeamItemParams,
  TeamItemParamsSchema,
  type TeamParams,
  TeamParamsSchema,
  TeamPortfolioListSchema,
  TeamPortfolioMutationSchema,
  type TeamPortfolioParams,
  TeamPortfolioParamsSchema,
  TeamSupplierImportMutationSchema,
  TeamSupplierListSchema,
  TeamSupplierMutationSchema,
  type TeamSupplierParams,
  TeamSupplierParamsSchema,
  TeamSupplierSchema,
  type UnlinkReviewCommentLinkBody,
  UnlinkReviewCommentLinkBodySchema,
  type UpdateAnalysisJobBody,
  UpdateAnalysisJobBodySchema,
  type UpdateAnalysisWorkflowBody,
  UpdateAnalysisWorkflowBodySchema,
  type UpdateAssetFolderBody,
  UpdateAssetFolderBodySchema,
  type UpdateBreakdownItemBody,
  UpdateBreakdownItemBodySchema,
  type UpdateCalendarEventBody,
  UpdateCalendarEventBodySchema,
  type UpdateCallSheetBody,
  UpdateCallSheetBodySchema,
  type UpdateContactShareBody,
  UpdateContactShareBodySchema,
  type UpdateExecutionStageBody,
  UpdateExecutionStageBodySchema,
  type UpdateMediaAnalysisBody,
  UpdateMediaAnalysisBodySchema,
  type UpdateNotificationStateBody,
  UpdateNotificationStateBodySchema,
  type UpdatePermissionTemplateBody,
  UpdatePermissionTemplateBodySchema,
  type UpdatePersonalContactBody,
  UpdatePersonalContactBodySchema,
  type UpdatePortfolioSettingsBody,
  UpdatePortfolioSettingsBodySchema,
  type UpdateReviewCommentBody,
  UpdateReviewCommentBodySchema,
  type UpdateReviewFileArchiveBody,
  UpdateReviewFileArchiveBodySchema,
  type UpdateReviewFolderBody,
  UpdateReviewFolderBodySchema,
  type UpdateScriptCommentBody,
  UpdateScriptCommentBodySchema,
  UpdateScriptCommentResponseSchema,
  type UpdateScriptPresenceBody,
  UpdateScriptPresenceBodySchema,
  type UpdateScriptVersionBody,
  UpdateScriptVersionBodySchema,
  UpdateScriptVersionResponseSchema,
  type UpdateShootingDayBody,
  UpdateShootingDayBodySchema,
  type UpdateTeamAssetBody,
  UpdateTeamAssetBodySchema,
  type UpdateTeamContactBody,
  UpdateTeamContactBodySchema,
  type UpdateTeamSupplierBody,
  UpdateTeamSupplierBodySchema,
  type UpdateWorkspaceNoteBody,
  UpdateWorkspaceNoteBodySchema,
  type UpdateWorkspaceTaskBody,
  UpdateWorkspaceTaskBodySchema,
  WorkspaceContextSchema,
  WorkspaceNoteListSchema,
  WorkspaceNoteMutationSchema,
  WorkspaceNoteSchema,
  WorkspaceNotificationListSchema,
  WorkspaceNotificationMutationSchema,
  type WorkspaceRecycleItemParams,
  WorkspaceRecycleItemParamsSchema,
  WorkspaceRecycleListSchema,
  WorkspaceTaskListSchema,
  WorkspaceTaskMutationSchema,
  WorkspaceTaskSchema,
} from "@shadowproducer/contracts"
import Fastify, { type FastifyError, type FastifyReply } from "fastify"

import type { AuthGateway } from "./auth"
import type {
  ScriptPresenceConnection,
  ScriptRealtimeEvent,
  ScriptRealtimeStore,
} from "./postgres-script-realtime-store"

const playbackQuerySchema = {
  type: "object",
  properties: { file: { type: "string", maxLength: 80 } },
  additionalProperties: false,
} as const

function sendPlayback(reply: FastifyReply, resource: PlaybackResource) {
  reply.header("Cache-Control", "private, no-store")
  reply.header("X-Content-Type-Options", "nosniff")
  return "playlist" in resource
    ? reply.type("application/vnd.apple.mpegurl").send(resource.playlist)
    : reply.redirect(resource.url)
}

type AppOptions = {
  scriptService: ScriptService
  scriptRealtimeStore?: ScriptRealtimeStore
  agentService?: AgentCommandService
  analysisService?: AnalysisService
  workspaceService?: WorkspaceService
  contactService?: ContactService
  dataExportService?: DataExportService
  productionService?: ProductionService
  reviewLinkService?: ReviewLinkService
  assetService?: AssetService
  portfolioService?: PortfolioService
  authGateway?: AuthGateway
  logger?: boolean
}

const reviewSessionCookieName = "shadow_review_session"

function cookieValue(header: string | undefined, name: string) {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=")
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim()
    }
  }
  return null
}

function reviewSessionToken(header: string | undefined) {
  const token = cookieValue(header, reviewSessionCookieName)
  if (!token) throw new AppError("REVIEW_SESSION_REQUIRED", "请先进入审片链接", 401)
  return token
}

function reviewSessionCookie(linkId: string, token: string, expiresAt: string) {
  const maxAge = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  )
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${reviewSessionCookieName}=${token}; Path=/api/review/${encodeURIComponent(linkId)}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
}

function actorIdFromHeader(header: string | string[] | undefined) {
  if (typeof header !== "string" || !header.trim()) {
    throw new AppError("AUTH_REQUIRED", "缺少开发身份标记", 401)
  }
  return header.trim()
}

// ---------------------------------------------------------------------------
// Onboarding route glue. Team/project/invitation payload schemas live in
// @shadowproducer/contracts; only the path-param schemas and the mutation
// wrappers that contracts does not define are composed locally.
// ---------------------------------------------------------------------------

type InvitationTokenParams = { token: string }
type InvitationRevokeParams = { teamId: string; invitationId: string }

const invitationTokenParamsJsonSchema = {
  type: "object",
  required: ["token"],
  properties: {
    token: { type: "string", minLength: 10, maxLength: 200 },
  },
}

const invitationRevokeParamsJsonSchema = {
  type: "object",
  required: ["teamId", "invitationId"],
  properties: {
    teamId: { type: "string", minLength: 1, maxLength: 100 },
    invitationId: { type: "string", minLength: 1, maxLength: 100 },
  },
}

const onboardingTeamMutationJsonSchema = {
  type: "object",
  required: ["item", "replayed"],
  properties: {
    item: OnboardingTeamSchema,
    replayed: { type: "boolean" },
  },
}

const onboardingProjectMutationJsonSchema = {
  type: "object",
  required: ["item", "replayed"],
  properties: {
    item: OnboardingProjectSchema,
    replayed: { type: "boolean" },
  },
}

const invitationSummaryMutationJsonSchema = {
  type: "object",
  required: ["item"],
  properties: {
    item: InvitationSummarySchema,
  },
}

function maskInvitedEmail(email: string) {
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  return local.slice(0, 1) + "***@" + domain
}

export async function buildApp({
  scriptService,
  scriptRealtimeStore,
  agentService,
  analysisService,
  workspaceService,
  contactService,
  dataExportService,
  productionService,
  reviewLinkService,
  assetService,
  portfolioService,
  authGateway,
  logger = true,
}: AppOptions) {
  const loggerOption = logger
    ? {
        level: process.env.LOG_LEVEL ?? "info",
        redact: {
          paths: ["req.url"],
          // Invitation tokens travel in the request URL; they must never reach logs.
          censor: (url: unknown) =>
            typeof url === "string" && url.includes("/invitations/")
              ? "[REDACTED_INVITATION_URL]"
              : url,
        },
      }
    : false
  const app = Fastify({ logger: loggerOption })
  type ScriptEvent = ScriptRealtimeEvent["event"] | "script.presence.updated"
  type ScriptEventStream = {
    actorId: string
    connection: ScriptPresenceConnection | null
    response: ServerResponse
    lastEventId: number
    replaying: boolean
  }
  const scriptEventStreams = new Map<string, Set<ScriptEventStream>>()
  const scriptPresence = new Map<string, Map<string, ScriptPresence>>()
  const presenceFingerprints = new Map<string, string>()
  const presenceTtlMs = 45_000
  const realtimeInstanceId = randomUUID()
  let localEventId = 0
  let realtimePollRunning = false

  const scriptScopeKey = (projectId: string, documentId: string) =>
    `${projectId}\u0000${documentId}`

  const presenceActiveAt = () => new Date()

  const presenceSnapshot = async (projectId: string, documentId: string) => ({
    projectId,
    documentId,
    participants: scriptRealtimeStore
      ? await scriptRealtimeStore.listPresence(projectId, documentId, presenceActiveAt())
      : [...(scriptPresence.get(scriptScopeKey(projectId, documentId))?.values() ?? [])],
  })

  const writeScriptEvent = (
    stream: ScriptEventStream,
    projectId: string,
    documentId: string,
    event: ScriptEvent,
    data: Record<string, unknown>,
    eventId?: number,
  ) => {
    if (stream.response.destroyed || stream.response.writableEnded) return
    const payload = `${eventId === undefined ? "" : `id: ${eventId}\n`}event: ${event}\ndata: ${JSON.stringify({ projectId, documentId, ...data })}\n\n`
    if (!stream.response.write(payload)) stream.response.once("drain", () => undefined)
    if (eventId !== undefined) stream.lastEventId = eventId
  }

  const publishScriptEvent = (
    projectId: string,
    documentId: string,
    event: ScriptEvent,
    data: Record<string, unknown>,
    eventId?: number,
  ) => {
    for (const stream of scriptEventStreams.get(scriptScopeKey(projectId, documentId)) ??
      []) {
      if (eventId !== undefined && (stream.replaying || eventId <= stream.lastEventId))
        continue
      writeScriptEvent(stream, projectId, documentId, event, data, eventId)
    }
  }

  const publishPresence = async (projectId: string, documentId: string, force = true) => {
    const snapshot = await presenceSnapshot(projectId, documentId)
    const fingerprint = JSON.stringify(
      snapshot.participants.map(
        ({ updatedAt: _updatedAt, ...participant }) => participant,
      ),
    )
    const scopeKey = scriptScopeKey(projectId, documentId)
    if (!force && presenceFingerprints.get(scopeKey) === fingerprint) return snapshot
    presenceFingerprints.set(scopeKey, fingerprint)
    publishScriptEvent(projectId, documentId, "script.presence.updated", snapshot)
    return snapshot
  }

  const flushPersistedEvents = async (projectId: string, documentId: string) => {
    if (!scriptRealtimeStore) return
    const streams = [
      ...(scriptEventStreams.get(scriptScopeKey(projectId, documentId)) ?? []),
    ].filter((stream) => !stream.replaying)
    if (!streams.length) return
    const events = await scriptRealtimeStore.listEvents(
      projectId,
      documentId,
      Math.min(...streams.map((stream) => stream.lastEventId)),
    )
    for (const event of events) {
      publishScriptEvent(projectId, documentId, event.event, event.data, event.id)
    }
  }

  const notifyScriptWrite = async (
    projectId: string,
    documentId: string,
    event: ScriptRealtimeEvent["event"],
    data: Record<string, unknown>,
  ) => {
    if (scriptRealtimeStore) {
      await flushPersistedEvents(projectId, documentId)
      return
    }
    publishScriptEvent(projectId, documentId, event, data, ++localEventId)
  }

  // ponytail: one-second DB polling keeps replicas coherent; switch to LISTEN/NOTIFY
  // when active collaboration scopes make the polling query load measurable.
  const realtimePoll = scriptRealtimeStore
    ? setInterval(async () => {
        if (realtimePollRunning) return
        realtimePollRunning = true
        try {
          for (const [scopeKey, streams] of scriptEventStreams) {
            if (!streams.size) continue
            const separator = scopeKey.indexOf("\u0000")
            const projectId = scopeKey.slice(0, separator)
            const documentId = scopeKey.slice(separator + 1)
            await flushPersistedEvents(projectId, documentId)
            await publishPresence(projectId, documentId, false)
          }
        } catch (error) {
          app.log.error({ error }, "script realtime poll failed")
        } finally {
          realtimePollRunning = false
        }
      }, 1_000)
    : null

  app.addHook("onClose", async () => {
    if (realtimePoll) clearInterval(realtimePoll)
    for (const streams of scriptEventStreams.values()) {
      for (const { response } of streams) response.end()
    }
    scriptEventStreams.clear()
    scriptPresence.clear()
    presenceFingerprints.clear()
  })

  await app.register(cors, {
    origin: /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/,
    credentials: true,
  })

  app.get("/healthz", async () => ({ status: "ok" }))

  if (authGateway) {
    app.addHook("preHandler", async (request) => {
      if (!request.url.startsWith("/v1/")) return
      // Overwrite the untrusted development header before existing handlers read it.
      request.headers["x-shadow-account-id"] = await authGateway.resolveActorId(
        request.headers,
      )
    })
  }

  if (analysisService) {
    app.get<{ Params: ProjectParams }>(
      "/v1/projects/:projectId/analysis-workflow",
      {
        schema: {
          params: ProjectParamsSchema,
          response: {
            200: AnalysisWorkflowSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return analysisService.getWorkflow(actorId, request.params.projectId)
      },
    )

    app.put<{ Params: ProjectParams; Body: UpdateAnalysisWorkflowBody }>(
      "/v1/projects/:projectId/analysis-workflow",
      {
        schema: {
          params: ProjectParamsSchema,
          body: UpdateAnalysisWorkflowBodySchema,
          response: {
            200: AnalysisWorkflowMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return analysisService.updateWorkflow(
          actorId,
          request.params.projectId,
          request.body,
        )
      },
    )

    app.get<{ Params: ProjectParams }>(
      "/v1/projects/:projectId/analysis-jobs",
      {
        schema: {
          params: ProjectParamsSchema,
          response: {
            200: AnalysisJobListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return analysisService.listJobs(actorId, request.params.projectId)
      },
    )

    app.post<{ Params: ProjectParams; Body: CreateScriptBreakdownAnalysisBody }>(
      "/v1/projects/:projectId/analysis-jobs/script-breakdown",
      {
        schema: {
          params: ProjectParamsSchema,
          body: CreateScriptBreakdownAnalysisBodySchema,
          response: {
            200: AnalysisJobMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return analysisService.createScriptBreakdown(
          actorId,
          request.params.projectId,
          request.body,
        )
      },
    )

    app.post<{ Params: AnalysisJobParams; Body: UpdateAnalysisJobBody }>(
      "/v1/projects/:projectId/analysis-jobs/:jobId/retry",
      {
        schema: {
          params: AnalysisJobParamsSchema,
          body: UpdateAnalysisJobBodySchema,
          response: {
            200: AnalysisJobMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return analysisService.retryJob({
          actorId,
          projectId: request.params.projectId,
          jobId: request.params.jobId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: AnalysisJobParams; Body: UpdateAnalysisJobBody }>(
      "/v1/projects/:projectId/analysis-jobs/:jobId/cancel",
      {
        schema: {
          params: AnalysisJobParamsSchema,
          body: UpdateAnalysisJobBodySchema,
          response: {
            200: AnalysisJobMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return analysisService.cancelJob({
          actorId,
          projectId: request.params.projectId,
          jobId: request.params.jobId,
          ...request.body,
        })
      },
    )
  }

  if (authGateway) {
    app.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      async handler(request, reply) {
        const response = await authGateway.handle(request)
        reply.code(response.status)
        response.headers.forEach((value, key) => {
          if (!["content-length", "set-cookie", "transfer-encoding"].includes(key)) {
            reply.header(key, value)
          }
        })
        const cookies = response.headers.getSetCookie()
        if (cookies.length) reply.header("set-cookie", cookies)
        const body = Buffer.from(await response.arrayBuffer())
        return body.length ? reply.send(body) : reply.send()
      },
    })
  }

  app.addHook("onSend", async (request, reply) => {
    if (
      request.url.startsWith("/review/") ||
      request.url.startsWith("/portfolio/") ||
      request.url.startsWith("/invitations/")
    ) {
      reply.header("cache-control", "no-store")
    }
  })

  if (agentService) {
    app.post<{ Body: AgentPreviewBody }>(
      "/v1/agent/commands/preview",
      {
        schema: {
          body: AgentPreviewBodySchema,
          response: {
            201: AgentPreviewResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return reply.code(201).send(await agentService.preview(actorId, request.body))
      },
    )

    app.post<{ Params: AgentCommandParams }>(
      "/v1/agent/commands/:commandId/confirm",
      {
        schema: {
          params: AgentCommandParamsSchema,
          response: {
            200: AgentConfirmationResponseSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
            410: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return agentService.confirm(actorId, request.params.commandId)
      },
    )

    app.post<{ Params: AgentCommandParams }>(
      "/v1/agent/commands/:commandId/execute",
      {
        schema: {
          params: AgentCommandParamsSchema,
          response: {
            200: AgentExecutionResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
            410: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const execution = await agentService.execute(actorId, request.params.commandId)
        if (
          !execution.replayed &&
          (execution.result.kind === "script_version_created" ||
            execution.result.kind === "script_version_updated")
        ) {
          await notifyScriptWrite(
            execution.result.projectId,
            execution.result.documentId,
            "script.version.updated",
            {
              versionId: execution.result.item.id,
              revision: execution.result.item.revision,
            },
          )
        }
        return execution
      },
    )
  }

  if (workspaceService) {
    app.get(
      "/v1/workspace-context",
      {
        schema: {
          response: {
            200: WorkspaceContextSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.getContext(actorId)
      },
    )

    app.get<{ Params: TeamParams; Querystring: AuditLogQuery }>(
      "/v1/teams/:teamId/audit-logs",
      {
        schema: {
          params: TeamParamsSchema,
          querystring: AuditLogQuerySchema,
          response: {
            200: AuditLogListSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.listAuditLogs(
          actorId,
          request.params.teamId,
          request.query,
        )
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/permissions",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: PermissionWorkspaceSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.listPermissionWorkspace(actorId, request.params.teamId)
      },
    )

    app.post<{ Params: TeamParams; Body: CreatePermissionTemplateBody }>(
      "/v1/teams/:teamId/permission-templates",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreatePermissionTemplateBodySchema,
          response: {
            201: PermissionTemplateMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.createPermissionTemplate({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: TeamItemParams; Body: UpdatePermissionTemplateBody }>(
      "/v1/teams/:teamId/permission-templates/:itemId",
      {
        schema: {
          params: TeamItemParamsSchema,
          body: UpdatePermissionTemplateBodySchema,
          response: {
            200: PermissionTemplateSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.updatePermissionTemplate({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.patch<{
      Params: PermissionTeamMemberParams
      Body: AssignPermissionTemplateBody
    }>(
      "/v1/teams/:teamId/members/:accountId/permission-template",
      {
        schema: {
          params: PermissionTeamMemberParamsSchema,
          body: AssignPermissionTemplateBodySchema,
          response: {
            200: PermissionAssignmentMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.assignTeamPermissionTemplate({
          actorId,
          teamId: request.params.teamId,
          accountId: request.params.accountId,
          ...request.body,
        })
      },
    )

    app.patch<{
      Params: PermissionProjectMemberParams
      Body: AssignPermissionTemplateBody
    }>(
      "/v1/teams/:teamId/projects/:projectId/members/:accountId/permission-template",
      {
        schema: {
          params: PermissionProjectMemberParamsSchema,
          body: AssignPermissionTemplateBodySchema,
          response: {
            200: PermissionAssignmentMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.assignProjectPermissionTemplate({
          actorId,
          teamId: request.params.teamId,
          projectId: request.params.projectId,
          accountId: request.params.accountId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: TeamParams; Querystring: NotificationListQuery }>(
      "/v1/teams/:teamId/notifications",
      {
        schema: {
          params: TeamParamsSchema,
          querystring: NotificationListQuerySchema,
          response: {
            200: WorkspaceNotificationListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.listNotifications(
          actorId,
          request.params.teamId,
          request.query,
        )
      },
    )

    app.patch<{
      Params: TeamItemParams
      Body: UpdateNotificationStateBody
    }>(
      "/v1/teams/:teamId/notifications/:itemId",
      {
        schema: {
          params: TeamItemParamsSchema,
          body: UpdateNotificationStateBodySchema,
          response: {
            200: WorkspaceNotificationMutationSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.updateNotification({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.itemId,
          action: request.body.action,
        })
      },
    )

    app.post<{ Params: TeamParams }>(
      "/v1/teams/:teamId/notifications/read-all",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: MarkAllNotificationsReadSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.markAllNotificationsRead(actorId, request.params.teamId)
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/notification-preferences",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: NotificationPreferencesSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.getNotificationPreferences(actorId, request.params.teamId)
      },
    )

    app.put<{ Params: TeamParams; Body: NotificationPreferences }>(
      "/v1/teams/:teamId/notification-preferences",
      {
        schema: {
          params: TeamParamsSchema,
          body: NotificationPreferencesSchema,
          response: {
            200: NotificationPreferencesSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.updateNotificationPreferences({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/tasks",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: WorkspaceTaskListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.listTasks(actorId, request.params.teamId)
      },
    )

    app.post<{ Params: TeamParams; Body: CreateWorkspaceTaskBody }>(
      "/v1/teams/:teamId/tasks",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateWorkspaceTaskBodySchema,
          response: {
            201: WorkspaceTaskMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.createTask({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: TeamItemParams; Body: UpdateWorkspaceTaskBody }>(
      "/v1/teams/:teamId/tasks/:itemId",
      {
        schema: {
          params: TeamItemParamsSchema,
          body: UpdateWorkspaceTaskBodySchema,
          response: {
            200: WorkspaceTaskSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.updateTask({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.delete<{ Params: TeamItemParams; Body: DeleteItemBody }>(
      "/v1/teams/:teamId/tasks/:itemId",
      {
        schema: {
          params: TeamItemParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.deleteTask({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.itemId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/calendar-events",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: CalendarEventListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.listCalendarEvents(actorId, request.params.teamId)
      },
    )

    app.post<{ Params: TeamParams; Body: CreateCalendarEventBody }>(
      "/v1/teams/:teamId/calendar-events",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateCalendarEventBodySchema,
          response: {
            201: CalendarEventMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.createCalendarEvent({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: TeamItemParams; Body: UpdateCalendarEventBody }>(
      "/v1/teams/:teamId/calendar-events/:itemId",
      {
        schema: {
          params: TeamItemParamsSchema,
          body: UpdateCalendarEventBodySchema,
          response: {
            200: CalendarEventSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.updateCalendarEvent({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.delete<{ Params: TeamItemParams; Body: DeleteItemBody }>(
      "/v1/teams/:teamId/calendar-events/:itemId",
      {
        schema: {
          params: TeamItemParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.deleteCalendarEvent({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.itemId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/notes",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: WorkspaceNoteListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.listNotes(actorId, request.params.teamId)
      },
    )

    app.post<{ Params: TeamParams; Body: CreateWorkspaceNoteBody }>(
      "/v1/teams/:teamId/notes",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateWorkspaceNoteBodySchema,
          response: {
            201: WorkspaceNoteMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.createNote({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: TeamItemParams; Body: UpdateWorkspaceNoteBody }>(
      "/v1/teams/:teamId/notes/:itemId",
      {
        schema: {
          params: TeamItemParamsSchema,
          body: UpdateWorkspaceNoteBodySchema,
          response: {
            200: WorkspaceNoteSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.updateNote({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.delete<{ Params: TeamItemParams; Body: DeleteItemBody }>(
      "/v1/teams/:teamId/notes/:itemId",
      {
        schema: {
          params: TeamItemParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.deleteNote({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.itemId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/recycle-bin",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: WorkspaceRecycleListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.listDeletedItems(actorId, request.params.teamId)
      },
    )

    app.post<{ Params: WorkspaceRecycleItemParams; Body: DeleteItemBody }>(
      "/v1/teams/:teamId/recycle-bin/:kind/:itemId/restore",
      {
        schema: {
          params: WorkspaceRecycleItemParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.restoreDeletedItem({
          actorId,
          teamId: request.params.teamId,
          kind: request.params.kind,
          itemId: request.params.itemId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    app.delete<{
      Params: WorkspaceRecycleItemParams
      Body: PermanentlyDeleteRecycleItemBody
    }>(
      "/v1/teams/:teamId/recycle-bin/:kind/:itemId",
      {
        schema: {
          params: WorkspaceRecycleItemParamsSchema,
          body: PermanentlyDeleteRecycleItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.permanentlyDeleteDeletedItem({
          actorId,
          teamId: request.params.teamId,
          kind: request.params.kind,
          itemId: request.params.itemId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    // ---- Onboarding: team/project creation and invitation management ----

    app.post<{ Body: CreateTeamBody }>(
      "/v1/teams",
      {
        schema: {
          body: CreateTeamBodySchema,
          response: {
            201: onboardingTeamMutationJsonSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.createTeam({
          actorId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.post<{ Params: TeamParams; Body: CreateProjectBody }>(
      "/v1/teams/:teamId/projects",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateProjectBodySchema,
          response: {
            201: onboardingProjectMutationJsonSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.createProject({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/invitations",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: InvitationListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.listInvitations(actorId, request.params.teamId)
      },
    )

    app.post<{ Params: TeamParams; Body: CreateInvitationBody }>(
      "/v1/teams/:teamId/invitations",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateInvitationBodySchema,
          response: {
            201: InvitationMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.createInvitation({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    // Public invitation summary: reachable without a session so the invitee
    // can inspect the team before signing in. Kept outside /v1/ like the
    // other public routes (review links, public portfolios), so the global
    // auth preHandler never runs for it.
    app.get<{ Params: InvitationTokenParams }>(
      "/invitations/:token",
      {
        schema: {
          params: invitationTokenParamsJsonSchema,
          response: {
            200: invitationSummaryMutationJsonSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            410: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const result = await workspaceService.getInvitationSummary(
          request.params.token,
        )
        // The public preview must not hand out the full invited email; a
        // recognizable prefix plus domain is enough for the invitee to
        // confirm their own address without leaking it to token holders.
        return {
          item: { ...result.item, email: maskInvitedEmail(result.item.email) },
        }
      },
    )

    // Invitation accept stays on the public /invitations path but requires a
    // session: this route-level preHandler mirrors the global /v1 preHandler
    // and resolves the signed-in session (or the configured development
    // header) into the trusted identity before the handler reads it.
    app.post<{ Params: InvitationTokenParams; Body: AcceptInvitationBody }>(
      "/invitations/:token/accept",
      {
        preHandler: async (request) => {
          if (authGateway) {
            request.headers["x-shadow-account-id"] = await authGateway.resolveActorId(
              request.headers,
            )
          }
        },
        schema: {
          params: invitationTokenParamsJsonSchema,
          body: AcceptInvitationBodySchema,
          response: {
            200: InvitationAcceptanceMutationSchema,
            201: InvitationAcceptanceMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
            410: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.acceptInvitation({
          actorId,
          // The invitation link in the path is the resource being accepted.
          token: request.params.token,
          idempotencyKey: request.body.idempotencyKey,
        })
        return reply.code(result.replayed ? 200 : 201).send(result)
      },
    )

    app.post<{ Params: InvitationRevokeParams; Body: RotateInvitationTokenBody }>(
      "/v1/teams/:teamId/invitations/:invitationId/rotate-token",
      {
        schema: {
          params: invitationRevokeParamsJsonSchema,
          body: RotateInvitationTokenBodySchema,
          response: {
            200: InvitationMutationSchema,
            201: InvitationMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
            410: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await workspaceService.rotateInvitationToken({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.invitationId,
          ...request.body,
        })
        return reply
          .code("replayed" in result && result.replayed ? 200 : 201)
          .send(result)
      },
    )

    app.post<{ Params: InvitationRevokeParams; Body: RevokeInvitationBody }>(
      "/v1/teams/:teamId/invitations/:invitationId/revoke",
      {
        schema: {
          params: invitationRevokeParamsJsonSchema,
          body: RevokeInvitationBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
            410: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return workspaceService.revokeInvitation({
          actorId,
          teamId: request.params.teamId,
          itemId: request.params.invitationId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )
  }

  if (dataExportService) {
    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/data-export",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            500: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const snapshot = await dataExportService.createTeamDataExport(
          actorId,
          request.params.teamId,
        )
        const date = snapshot.generatedAt.slice(0, 10)
        const displayName = `${snapshot.scope.teamName}-${date}-业务数据.json`.replace(
          /[\\/:*?"<>|]/g,
          "-",
        )
        reply
          .type("application/json; charset=utf-8")
          .header("cache-control", "no-store")
          .header("x-content-type-options", "nosniff")
          .header(
            "content-disposition",
            `attachment; filename="shadowproducer-data-${date}.json"; filename*=UTF-8''${encodeURIComponent(displayName)}`,
          )
        return reply.send(JSON.stringify(snapshot))
      },
    )
  }

  if (contactService) {
    app.get(
      "/v1/contacts",
      {
        schema: {
          response: {
            200: PersonalContactListSchema,
            401: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.listPersonalContacts(actorId)
      },
    )

    app.get(
      "/v1/contacts/deleted",
      {
        schema: {
          response: {
            200: DeletedPersonalContactListSchema,
            401: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.listDeletedPersonalContacts(actorId)
      },
    )

    app.post<{ Body: CreatePersonalContactBody }>(
      "/v1/contacts",
      {
        schema: {
          body: CreatePersonalContactBodySchema,
          response: {
            201: PersonalContactMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await contactService.createPersonalContact({
          actorId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: ContactParams; Body: UpdatePersonalContactBody }>(
      "/v1/contacts/:contactId",
      {
        schema: {
          params: ContactParamsSchema,
          body: UpdatePersonalContactBodySchema,
          response: {
            200: PersonalContactSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.updatePersonalContact({
          actorId,
          contactId: request.params.contactId,
          ...request.body,
        })
      },
    )

    app.delete<{ Params: ContactParams; Body: DeleteItemBody }>(
      "/v1/contacts/:contactId",
      {
        schema: {
          params: ContactParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.deletePersonalContact({
          actorId,
          contactId: request.params.contactId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    app.post<{ Params: ContactParams; Body: DeleteItemBody }>(
      "/v1/contacts/:contactId/restore",
      {
        schema: {
          params: ContactParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: PersonalContactSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.restorePersonalContact({
          actorId,
          contactId: request.params.contactId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    app.delete<{ Params: ContactParams; Body: PermanentlyDeleteRecycleItemBody }>(
      "/v1/contacts/:contactId/permanent",
      {
        schema: {
          params: ContactParamsSchema,
          body: PermanentlyDeleteRecycleItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.permanentlyDeletePersonalContact({
          actorId,
          contactId: request.params.contactId,
          ...request.body,
        })
      },
    )

    app.put<{ Params: ContactShareParams; Body: UpdateContactShareBody }>(
      "/v1/contacts/:contactId/team-shares/:teamId",
      {
        schema: {
          params: ContactShareParamsSchema,
          body: UpdateContactShareBodySchema,
          response: {
            200: PersonalContactSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.setContactShare({
          actorId,
          contactId: request.params.contactId,
          teamId: request.params.teamId,
          ...request.body,
        })
      },
    )

    app.delete<{ Params: ContactShareParams; Body: DeleteItemBody }>(
      "/v1/contacts/:contactId/team-shares/:teamId",
      {
        schema: {
          params: ContactShareParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: PersonalContactSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.deleteContactShare({
          actorId,
          contactId: request.params.contactId,
          teamId: request.params.teamId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/contacts",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: TeamContactListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.listTeamContacts(actorId, request.params.teamId)
      },
    )

    app.post<{ Params: TeamParams; Body: CreateTeamContactBody }>(
      "/v1/teams/:teamId/contacts",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateTeamContactBodySchema,
          response: {
            201: TeamContactMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await contactService.createTeamContact({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.post<{ Params: TeamParams; Body: ImportTeamContactsBody }>(
      "/v1/teams/:teamId/contacts/import",
      {
        schema: {
          params: TeamParamsSchema,
          body: ImportTeamContactsBodySchema,
          response: {
            201: TeamContactImportMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await contactService.importTeamContacts({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: TeamContactParams; Body: UpdateTeamContactBody }>(
      "/v1/teams/:teamId/contacts/:contactId",
      {
        schema: {
          params: TeamContactParamsSchema,
          body: UpdateTeamContactBodySchema,
          response: {
            200: TeamContactSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.updateTeamContact({
          actorId,
          teamId: request.params.teamId,
          contactId: request.params.contactId,
          ...request.body,
        })
      },
    )

    app.delete<{ Params: TeamContactParams; Body: DeleteItemBody }>(
      "/v1/teams/:teamId/contacts/:contactId",
      {
        schema: {
          params: TeamContactParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.deleteTeamContact({
          actorId,
          teamId: request.params.teamId,
          contactId: request.params.contactId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )

    app.get<{ Params: TeamParams }>(
      "/v1/teams/:teamId/suppliers",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: TeamSupplierListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.listTeamSuppliers(actorId, request.params.teamId)
      },
    )

    app.post<{ Params: TeamParams; Body: CreateTeamSupplierBody }>(
      "/v1/teams/:teamId/suppliers",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateTeamSupplierBodySchema,
          response: {
            201: TeamSupplierMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await contactService.createTeamSupplier({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.post<{ Params: TeamParams; Body: ImportTeamSuppliersBody }>(
      "/v1/teams/:teamId/suppliers/import",
      {
        schema: {
          params: TeamParamsSchema,
          body: ImportTeamSuppliersBodySchema,
          response: {
            201: TeamSupplierImportMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await contactService.importTeamSuppliers({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: TeamSupplierParams; Body: UpdateTeamSupplierBody }>(
      "/v1/teams/:teamId/suppliers/:supplierId",
      {
        schema: {
          params: TeamSupplierParamsSchema,
          body: UpdateTeamSupplierBodySchema,
          response: {
            200: TeamSupplierSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.updateTeamSupplier({
          actorId,
          teamId: request.params.teamId,
          supplierId: request.params.supplierId,
          ...request.body,
        })
      },
    )

    app.delete<{ Params: TeamSupplierParams; Body: DeleteItemBody }>(
      "/v1/teams/:teamId/suppliers/:supplierId",
      {
        schema: {
          params: TeamSupplierParamsSchema,
          body: DeleteItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return contactService.deleteTeamSupplier({
          actorId,
          teamId: request.params.teamId,
          supplierId: request.params.supplierId,
          expectedRevision: request.body.expectedRevision,
        })
      },
    )
  }

  if (assetService) {
    app.get<{ Params: TeamParams; Querystring: TeamAssetListQuery }>(
      "/v1/teams/:teamId/assets",
      {
        schema: {
          params: TeamParamsSchema,
          querystring: TeamAssetListQuerySchema,
          response: {
            200: TeamAssetListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return assetService.listAssets(
          actorId,
          request.params.teamId,
          request.query.archived === "1",
          request.query.q,
        )
      },
    )

    app.post<{ Params: TeamParams; Body: AssetSemanticSearchBody }>(
      "/v1/teams/:teamId/assets/semantic-search",
      {
        schema: {
          params: TeamParamsSchema,
          body: AssetSemanticSearchBodySchema,
          response: {
            200: AssetSemanticSearchResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            503: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return {
          items: await assetService.semanticSearchText({
            actorId,
            teamId: request.params.teamId,
            ...request.body,
          }),
        }
      },
    )

    app.post<{ Params: TeamParams; Body: CreateAssetFolderBody }>(
      "/v1/teams/:teamId/asset-folders",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateAssetFolderBodySchema,
          response: {
            201: AssetFolderMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await assetService.createFolder({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: AssetFolderParams; Body: UpdateAssetFolderBody }>(
      "/v1/teams/:teamId/asset-folders/:folderId",
      {
        schema: {
          params: AssetFolderParamsSchema,
          body: UpdateAssetFolderBodySchema,
          response: {
            200: AssetFolderSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return assetService.updateFolder({
          actorId,
          teamId: request.params.teamId,
          folderId: request.params.folderId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: TeamParams; Body: CreateAssetUploadIntentBody }>(
      "/v1/teams/:teamId/assets/upload-intents",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateAssetUploadIntentBodySchema,
          response: {
            201: AssetUploadIntentResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
            413: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await assetService.createUploadIntent({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.post<{
      Params: TeamAssetParams
      Body: CompleteAssetUploadBody
    }>(
      "/v1/teams/:teamId/assets/:assetId/complete",
      {
        schema: {
          params: TeamAssetParamsSchema,
          body: CompleteAssetUploadBodySchema,
          response: {
            200: TeamAssetMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return assetService.completeUpload({
          actorId,
          teamId: request.params.teamId,
          assetId: request.params.assetId,
          ...request.body,
        })
      },
    )

    app.patch<{ Params: TeamAssetParams; Body: UpdateTeamAssetBody }>(
      "/v1/teams/:teamId/assets/:assetId",
      {
        schema: {
          params: TeamAssetParamsSchema,
          body: UpdateTeamAssetBodySchema,
          response: {
            200: TeamAssetSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return assetService.updateAsset({
          actorId,
          teamId: request.params.teamId,
          assetId: request.params.assetId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: TeamAssetParams }>(
      "/v1/teams/:teamId/assets/:assetId/media-analysis",
      {
        schema: {
          params: TeamAssetParamsSchema,
          response: {
            200: MediaAnalysisResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return assetService.getLatestMediaAnalysis(
          actorId,
          request.params.teamId,
          request.params.assetId,
        )
      },
    )

    app.post<{ Params: TeamAssetParams; Body: CreateMediaAnalysisBody }>(
      "/v1/teams/:teamId/assets/:assetId/media-analysis",
      {
        schema: {
          params: TeamAssetParamsSchema,
          body: CreateMediaAnalysisBodySchema,
          response: {
            201: MediaAnalysisMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await assetService.createMediaAnalysis(
          actorId,
          request.params.teamId,
          request.params.assetId,
          request.body,
        )
        return reply.code(201).send(result)
      },
    )

    app.post<{ Params: MediaAnalysisParams; Body: UpdateMediaAnalysisBody }>(
      "/v1/teams/:teamId/assets/:assetId/media-analysis/:jobId/retry",
      {
        schema: {
          params: MediaAnalysisParamsSchema,
          body: UpdateMediaAnalysisBodySchema,
          response: {
            200: MediaAnalysisMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return assetService.retryMediaAnalysis({
          actorId,
          teamId: request.params.teamId,
          assetId: request.params.assetId,
          jobId: request.params.jobId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: MediaAnalysisParams; Body: UpdateMediaAnalysisBody }>(
      "/v1/teams/:teamId/assets/:assetId/media-analysis/:jobId/confirm",
      {
        schema: {
          params: MediaAnalysisParamsSchema,
          body: UpdateMediaAnalysisBodySchema,
          response: {
            200: MediaAnalysisMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return assetService.confirmMediaAnalysis({
          actorId,
          teamId: request.params.teamId,
          assetId: request.params.assetId,
          jobId: request.params.jobId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: MediaAnalysisShotParams; Querystring: MediaAnalysisKeyframeQuery }>(
      "/v1/teams/:teamId/assets/:assetId/media-analysis/:jobId/shots/:shotId/keyframe",
      {
        schema: {
          params: MediaAnalysisShotParamsSchema,
          querystring: MediaAnalysisKeyframeQuerySchema,
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const url = await assetService.getMediaAnalysisKeyframeUrl(
          actorId,
          request.params.teamId,
          request.params.assetId,
          request.params.jobId,
          request.params.shotId,
          request.query.download === "1",
        )
        return reply.redirect(url)
      },
    )

    app.get<{ Params: TeamAssetParams }>(
      "/v1/teams/:teamId/assets/:assetId/content-url",
      {
        schema: {
          params: TeamAssetParamsSchema,
          response: { 200: AssetContentUrlSchema },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const url = await assetService.getContentUrl(
          actorId,
          request.params.teamId,
          request.params.assetId,
        )
        return { url }
      },
    )

    app.get<{ Params: TeamAssetParams }>(
      "/v1/teams/:teamId/assets/:assetId/review-content-url",
      {
        schema: {
          params: TeamAssetParamsSchema,
          response: { 200: AssetContentUrlSchema },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const url = await assetService.getReviewContentUrl(
          actorId,
          request.params.teamId,
          request.params.assetId,
        )
        return { url }
      },
    )

    app.get<{ Params: TeamAssetParams; Querystring: { file?: string } }>(
      "/v1/teams/:teamId/assets/:assetId/preview",
      { schema: { params: TeamAssetParamsSchema, querystring: playbackQuerySchema } },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return sendPlayback(
          reply,
          await assetService.getReviewPlayback(
            actorId,
            request.params.teamId,
            request.params.assetId,
            request.query.file,
          ),
        )
      },
    )

    app.get<{ Params: TeamAssetParams }>(
      "/v1/teams/:teamId/assets/:assetId/thumbnail",
      { schema: { params: TeamAssetParamsSchema } },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const url = await assetService.getThumbnailUrl(
          actorId,
          request.params.teamId,
          request.params.assetId,
        )
        return reply.redirect(url)
      },
    )

    app.get<{ Params: TeamAssetParams }>(
      "/v1/teams/:teamId/assets/:assetId/content",
      { schema: { params: TeamAssetParamsSchema } },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const url = await assetService.getContentUrl(
          actorId,
          request.params.teamId,
          request.params.assetId,
        )
        return reply.redirect(url)
      },
    )
  }

  if (portfolioService) {
    app.get<{ Params: TeamParams; Querystring: PortfolioListQuery }>(
      "/v1/teams/:teamId/portfolios",
      {
        schema: {
          params: TeamParamsSchema,
          querystring: PortfolioListQuerySchema,
          response: {
            200: TeamPortfolioListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return portfolioService.listPortfolios(
          actorId,
          request.params.teamId,
          request.query.archived === "1",
        )
      },
    )

    app.get(
      "/v1/teams/:teamId/portfolio-candidates",
      {
        schema: {
          params: TeamParamsSchema,
          response: {
            200: ApprovedPortfolioCandidateListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const params = request.params as TeamParams
        return portfolioService.listApprovedCandidates(actorId, params.teamId)
      },
    )

    app.post<{ Params: TeamParams; Body: CreateTeamPortfolioBody }>(
      "/v1/teams/:teamId/portfolios",
      {
        schema: {
          params: TeamParamsSchema,
          body: CreateTeamPortfolioBodySchema,
          response: {
            200: TeamPortfolioMutationSchema,
            201: TeamPortfolioMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await portfolioService.createPortfolio({
          actorId,
          teamId: request.params.teamId,
          ...request.body,
        })
        return reply.code(result.replayed ? 200 : 201).send(result)
      },
    )

    app.post<{ Params: TeamPortfolioParams; Body: AddPortfolioContentBody }>(
      "/v1/teams/:teamId/portfolios/:portfolioId/items",
      {
        schema: {
          params: TeamPortfolioParamsSchema,
          body: AddPortfolioContentBodySchema,
          response: {
            200: TeamPortfolioMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return portfolioService.addContent({
          actorId,
          teamId: request.params.teamId,
          portfolioId: request.params.portfolioId,
          ...request.body,
        })
      },
    )

    app.post<{
      Params: TeamPortfolioParams
      Body: ChangePortfolioPublicationBody
    }>(
      "/v1/teams/:teamId/portfolios/:portfolioId/publish",
      {
        schema: {
          params: TeamPortfolioParamsSchema,
          body: ChangePortfolioPublicationBodySchema,
          response: {
            200: TeamPortfolioMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return portfolioService.publishPortfolio({
          actorId,
          teamId: request.params.teamId,
          portfolioId: request.params.portfolioId,
          ...request.body,
        })
      },
    )

    app.post<{
      Params: TeamPortfolioParams
      Body: UpdatePortfolioSettingsBody
    }>(
      "/v1/teams/:teamId/portfolios/:portfolioId/settings",
      {
        schema: {
          params: TeamPortfolioParamsSchema,
          body: UpdatePortfolioSettingsBodySchema,
          response: {
            200: TeamPortfolioMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return portfolioService.updateSettings({
          actorId,
          teamId: request.params.teamId,
          portfolioId: request.params.portfolioId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: TeamPortfolioParams; Body: BindPortfolioDomainBody }>(
      "/v1/teams/:teamId/portfolios/:portfolioId/domain",
      {
        schema: {
          params: TeamPortfolioParamsSchema,
          body: BindPortfolioDomainBodySchema,
          response: {
            200: TeamPortfolioMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return portfolioService.bindDomain({
          actorId,
          teamId: request.params.teamId,
          portfolioId: request.params.portfolioId,
          ...request.body,
        })
      },
    )

    for (const action of ["verify", "unbind"] as const) {
      app.post<{
        Params: TeamPortfolioParams
        Body: ChangePortfolioPublicationBody
      }>(
        `/v1/teams/:teamId/portfolios/:portfolioId/domain/${action}`,
        {
          schema: {
            params: TeamPortfolioParamsSchema,
            body: ChangePortfolioPublicationBodySchema,
            response: {
              200: TeamPortfolioMutationSchema,
              400: ErrorResponseSchema,
              401: ErrorResponseSchema,
              403: ErrorResponseSchema,
              404: ErrorResponseSchema,
              409: ErrorResponseSchema,
            },
          },
        },
        async (request) => {
          const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
          const command = {
            actorId,
            teamId: request.params.teamId,
            portfolioId: request.params.portfolioId,
            ...request.body,
          }
          return action === "verify"
            ? portfolioService.verifyDomain(command)
            : portfolioService.unbindDomain(command)
        },
      )
    }

    app.get<{
      Params: TeamPortfolioParams
      Querystring: PortfolioAnalyticsQuery
    }>(
      "/v1/teams/:teamId/portfolios/:portfolioId/analytics",
      {
        schema: {
          params: TeamPortfolioParamsSchema,
          querystring: PortfolioAnalyticsQuerySchema,
          response: {
            200: PortfolioAnalyticsSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return portfolioService.getAnalytics(
          actorId,
          request.params.teamId,
          request.params.portfolioId,
          request.query.days ?? 30,
        )
      },
    )

    app.post<{
      Params: TeamPortfolioParams
      Body: ChangePortfolioPublicationBody
    }>(
      "/v1/teams/:teamId/portfolios/:portfolioId/unpublish",
      {
        schema: {
          params: TeamPortfolioParamsSchema,
          body: ChangePortfolioPublicationBodySchema,
          response: {
            200: TeamPortfolioMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return portfolioService.unpublishPortfolio({
          actorId,
          teamId: request.params.teamId,
          portfolioId: request.params.portfolioId,
          ...request.body,
        })
      },
    )

    for (const action of ["archive", "restore"] as const) {
      app.post<{
        Params: TeamPortfolioParams
        Body: ChangePortfolioPublicationBody
      }>(
        `/v1/teams/:teamId/portfolios/:portfolioId/${action}`,
        {
          schema: {
            params: TeamPortfolioParamsSchema,
            body: ChangePortfolioPublicationBodySchema,
            response: {
              200: TeamPortfolioMutationSchema,
              400: ErrorResponseSchema,
              401: ErrorResponseSchema,
              403: ErrorResponseSchema,
              404: ErrorResponseSchema,
              409: ErrorResponseSchema,
            },
          },
        },
        async (request) => {
          const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
          const command = {
            actorId,
            teamId: request.params.teamId,
            portfolioId: request.params.portfolioId,
            ...request.body,
          }
          return action === "archive"
            ? portfolioService.archivePortfolio(command)
            : portfolioService.restorePortfolio(command)
        },
      )
    }

    app.delete<{
      Params: TeamPortfolioParams
      Body: PermanentlyDeleteRecycleItemBody
    }>(
      "/v1/teams/:teamId/portfolios/:portfolioId/permanent",
      {
        schema: {
          params: TeamPortfolioParamsSchema,
          body: PermanentlyDeleteRecycleItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return portfolioService.permanentlyDeletePortfolio({
          actorId,
          teamId: request.params.teamId,
          portfolioId: request.params.portfolioId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: PublicPortfolioParams }>(
      "/portfolio/:slug",
      {
        schema: {
          params: PublicPortfolioParamsSchema,
          response: {
            200: PublicPortfolioSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      (request) => portfolioService.getPublicPortfolio(request.params.slug),
    )

    app.get<{ Params: PublicPortfolioDomainParams }>(
      "/portfolio-domain/:domain",
      {
        schema: {
          params: PublicPortfolioDomainParamsSchema,
          response: {
            200: PublicPortfolioSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      (request) => portfolioService.getPublicPortfolioByDomain(request.params.domain),
    )

    app.post<{ Params: PublicPortfolioParams }>(
      "/portfolio/:slug/views",
      {
        schema: {
          params: PublicPortfolioParamsSchema,
          response: {
            200: PublicPortfolioViewMutationSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      (request) => {
        const day = new Date().toISOString().slice(0, 10)
        const salt =
          process.env.PORTFOLIO_ANALYTICS_SALT ??
          process.env.BETTER_AUTH_SECRET ??
          "shadowproducer-local-analytics"
        const visitorHash = createHash("sha256")
          .update([salt, request.ip, request.headers["user-agent"] ?? "", day].join(":"))
          .digest("hex")
        return portfolioService.recordPublicView(request.params.slug, visitorHash)
      },
    )

    app.get<{ Params: PublicPortfolioContentParams }>(
      "/portfolio/:slug/contents/:contentId/content-url",
      {
        schema: {
          params: PublicPortfolioContentParamsSchema,
          response: {
            200: AssetContentUrlSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      (request) =>
        portfolioService.getPublicContentUrl(
          request.params.slug,
          request.params.contentId,
        ),
    )
    app.get<{ Params: PublicPortfolioContentParams; Querystring: { file?: string } }>(
      "/portfolio/:slug/contents/:contentId/playback",
      {
        schema: {
          params: PublicPortfolioContentParamsSchema,
          querystring: playbackQuerySchema,
        },
      },
      async (request, reply) =>
        sendPlayback(
          reply,
          await portfolioService.getPublicPlayback(
            request.params.slug,
            request.params.contentId,
            request.query.file,
          ),
        ),
    )
  }

  if (productionService) {
    app.get<{ Params: ProjectParams; Querystring: ScriptVersionImpactQuery }>(
      "/v1/projects/:projectId/script-version-impact",
      {
        schema: {
          params: ProjectParamsSchema,
          querystring: ScriptVersionImpactQuerySchema,
          response: {
            200: ScriptVersionImpactSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const breakdown = await productionService.listBreakdown(
          actorId,
          request.params.projectId,
        )
        return scriptService.getVersionImpact(
          actorId,
          request.params.projectId,
          request.query.fromVersionId,
          request.query.toVersionId,
          breakdown.items,
          request.query.documentId,
        )
      },
    )

    app.get<{ Params: ProjectParams }>(
      "/v1/projects/:projectId/breakdown",
      {
        schema: {
          params: ProjectParamsSchema,
          response: {
            200: BreakdownListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listBreakdown(actorId, request.params.projectId)
      },
    )

    app.get<{ Params: ProjectParams }>(
      "/v1/projects/:projectId/breakdown/options",
      {
        schema: {
          params: ProjectParamsSchema,
          response: {
            200: BreakdownRelationOptionsSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listBreakdownRelationOptions(
          actorId,
          request.params.projectId,
        )
      },
    )

    app.patch<{ Params: ProjectItemParams; Body: UpdateBreakdownItemBody }>(
      "/v1/projects/:projectId/breakdown/:itemId",
      {
        schema: {
          params: ProjectItemParamsSchema,
          body: UpdateBreakdownItemBodySchema,
          response: {
            200: BreakdownItemSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.updateBreakdown({
          actorId,
          projectId: request.params.projectId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: ProjectParams; Body: ConfirmBreakdownBody }>(
      "/v1/projects/:projectId/breakdown/confirm",
      {
        schema: {
          params: ProjectParamsSchema,
          body: ConfirmBreakdownBodySchema,
          response: {
            200: BreakdownMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.confirmBreakdown({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: ProjectParams; Body: MergeBreakdownBody }>(
      "/v1/projects/:projectId/breakdown/merge",
      {
        schema: {
          params: ProjectParamsSchema,
          body: MergeBreakdownBodySchema,
          response: {
            200: BreakdownMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.mergeBreakdown({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: ProjectParams; Body: SplitBreakdownBody }>(
      "/v1/projects/:projectId/breakdown/split",
      {
        schema: {
          params: ProjectParamsSchema,
          body: SplitBreakdownBodySchema,
          response: {
            200: BreakdownMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.splitBreakdown({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: ProjectParams }>(
      "/v1/projects/:projectId/execution-schedule",
      {
        schema: {
          params: ProjectParamsSchema,
          response: {
            200: ExecutionScheduleSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listExecutionSchedule(actorId, request.params.projectId)
      },
    )

    app.post<{ Params: ProjectParams; Body: CreateExecutionStageBody }>(
      "/v1/projects/:projectId/execution-schedule",
      {
        schema: {
          params: ProjectParamsSchema,
          body: CreateExecutionStageBodySchema,
          response: {
            201: ExecutionStageMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await productionService.createExecutionStage({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: ProjectItemParams; Body: UpdateExecutionStageBody }>(
      "/v1/projects/:projectId/execution-schedule/:itemId",
      {
        schema: {
          params: ProjectItemParamsSchema,
          body: UpdateExecutionStageBodySchema,
          response: {
            200: ExecutionStageSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.updateExecutionStage({
          actorId,
          projectId: request.params.projectId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: ProjectParams }>(
      "/v1/projects/:projectId/shooting-days",
      {
        schema: {
          params: ProjectParamsSchema,
          response: {
            200: ShootingDayListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listShootingDays(actorId, request.params.projectId)
      },
    )

    app.post<{ Params: ProjectParams; Body: CreateShootingDayBody }>(
      "/v1/projects/:projectId/shooting-days",
      {
        schema: {
          params: ProjectParamsSchema,
          body: CreateShootingDayBodySchema,
          response: {
            201: ShootingDayMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await productionService.createShootingDay({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: ProjectItemParams; Body: UpdateShootingDayBody }>(
      "/v1/projects/:projectId/shooting-days/:itemId",
      {
        schema: {
          params: ProjectItemParamsSchema,
          body: UpdateShootingDayBodySchema,
          response: {
            200: ShootingDaySchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.updateShootingDay({
          actorId,
          projectId: request.params.projectId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: ProjectParams }>(
      "/v1/projects/:projectId/call-sheets",
      {
        schema: {
          params: ProjectParamsSchema,
          response: {
            200: CallSheetListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listCallSheets(actorId, request.params.projectId)
      },
    )

    app.post<{ Params: ProjectParams; Body: CreateCallSheetBody }>(
      "/v1/projects/:projectId/call-sheets",
      {
        schema: {
          params: ProjectParamsSchema,
          body: CreateCallSheetBodySchema,
          response: {
            201: CallSheetMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await productionService.createCallSheet({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.get<{ Params: ProjectItemParams }>(
      "/v1/projects/:projectId/call-sheets/:itemId/history",
      {
        schema: {
          params: ProjectItemParamsSchema,
          response: {
            200: CallSheetHistorySchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listCallSheetHistory(
          actorId,
          request.params.projectId,
          request.params.itemId,
        )
      },
    )

    app.post<{ Params: ProjectItemParams; Body: PublishCallSheetBody }>(
      "/v1/projects/:projectId/call-sheets/:itemId/publish",
      {
        schema: {
          params: ProjectItemParamsSchema,
          body: PublishCallSheetBodySchema,
          response: {
            200: CallSheetPublishMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.publishCallSheet({
          actorId,
          projectId: request.params.projectId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.patch<{ Params: ProjectItemParams; Body: UpdateCallSheetBody }>(
      "/v1/projects/:projectId/call-sheets/:itemId",
      {
        schema: {
          params: ProjectItemParamsSchema,
          body: UpdateCallSheetBodySchema,
          response: {
            200: CallSheetSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.updateCallSheet({
          actorId,
          projectId: request.params.projectId,
          itemId: request.params.itemId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: ProjectParams; Querystring: ReviewFileListQuery }>(
      "/v1/projects/:projectId/review-files",
      {
        schema: {
          params: ProjectParamsSchema,
          querystring: ReviewFileListQuerySchema,
          response: {
            200: ReviewFileListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listReviewFiles(
          actorId,
          request.params.projectId,
          request.query.archived === "1",
        )
      },
    )

    app.post<{ Params: ProjectParams; Body: CreateReviewFileBody }>(
      "/v1/projects/:projectId/review-files",
      {
        schema: {
          params: ProjectParamsSchema,
          body: CreateReviewFileBodySchema,
          response: {
            201: ReviewFileMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await productionService.createReviewFile({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.post<{ Params: ProjectParams; Body: CreateReviewFolderBody }>(
      "/v1/projects/:projectId/review-folders",
      {
        schema: {
          params: ProjectParamsSchema,
          body: CreateReviewFolderBodySchema,
          response: {
            201: ReviewFolderMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await productionService.createReviewFolder({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.get<{ Params: ProjectParams; Querystring: ReviewFolderListQuery }>(
      "/v1/projects/:projectId/review-folders",
      {
        schema: {
          params: ProjectParamsSchema,
          querystring: ReviewFolderListQuerySchema,
          response: {
            200: ReviewFolderListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listReviewFolders(
          actorId,
          request.params.projectId,
          request.query.archived === "1",
        )
      },
    )

    app.patch<{ Params: ReviewFolderParams; Body: UpdateReviewFolderBody }>(
      "/v1/projects/:projectId/review-folders/:folderId",
      {
        schema: {
          params: ReviewFolderParamsSchema,
          body: UpdateReviewFolderBodySchema,
          response: {
            200: ReviewFolderSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.updateReviewFolder({
          actorId,
          projectId: request.params.projectId,
          folderId: request.params.folderId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: ReviewFileParams; Body: MoveReviewFileBody }>(
      "/v1/projects/:projectId/review-files/:fileId/move",
      {
        schema: {
          params: ReviewFileParamsSchema,
          body: MoveReviewFileBodySchema,
          response: {
            200: ReviewFileMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.moveReviewFile({
          actorId,
          projectId: request.params.projectId,
          fileId: request.params.fileId,
          ...request.body,
        })
      },
    )

    app.patch<{ Params: ReviewFileParams; Body: UpdateReviewFileArchiveBody }>(
      "/v1/projects/:projectId/review-files/:fileId",
      {
        schema: {
          params: ReviewFileParamsSchema,
          body: UpdateReviewFileArchiveBodySchema,
          response: {
            200: ReviewFileMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.updateReviewFileArchive({
          actorId,
          projectId: request.params.projectId,
          fileId: request.params.fileId,
          ...request.body,
        })
      },
    )

    app.delete<{
      Params: ReviewFileParams
      Body: PermanentlyDeleteRecycleItemBody
    }>(
      "/v1/projects/:projectId/review-files/:fileId/permanent",
      {
        schema: {
          params: ReviewFileParamsSchema,
          body: PermanentlyDeleteRecycleItemBodySchema,
          response: {
            200: DeleteItemResponseSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.permanentlyDeleteReviewFile({
          actorId,
          projectId: request.params.projectId,
          fileId: request.params.fileId,
          ...request.body,
        })
      },
    )

    app.get<{ Params: ReviewFileParams }>(
      "/v1/projects/:projectId/review-files/:fileId/comments",
      {
        schema: {
          params: ReviewFileParamsSchema,
          response: {
            200: ReviewCommentListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listReviewComments(
          actorId,
          request.params.projectId,
          request.params.fileId,
        )
      },
    )

    app.post<{ Params: ReviewFileParams; Body: ReviewFileApprovalBody }>(
      "/v1/projects/:projectId/review-files/:fileId/approve",
      {
        schema: {
          params: ReviewFileParamsSchema,
          body: ReviewFileApprovalBodySchema,
          response: {
            200: ReviewFileMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.approveReviewFile({
          actorId,
          projectId: request.params.projectId,
          fileId: request.params.fileId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: ReviewFileParams; Body: ReviewFileApprovalBody }>(
      "/v1/projects/:projectId/review-files/:fileId/revoke-approval",
      {
        schema: {
          params: ReviewFileParamsSchema,
          body: ReviewFileApprovalBodySchema,
          response: {
            200: ReviewFileMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.revokeReviewFileApproval({
          actorId,
          projectId: request.params.projectId,
          fileId: request.params.fileId,
          ...request.body,
        })
      },
    )

    app.post<{ Params: ReviewFileParams; Body: CreateReviewCommentBody }>(
      "/v1/projects/:projectId/review-files/:fileId/comments",
      {
        schema: {
          params: ReviewFileParamsSchema,
          body: CreateReviewCommentBodySchema,
          response: {
            201: ReviewCommentMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await productionService.createReviewComment({
          actorId,
          projectId: request.params.projectId,
          fileId: request.params.fileId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.patch<{ Params: ReviewCommentParams; Body: UpdateReviewCommentBody }>(
      "/v1/projects/:projectId/review-comments/:commentId",
      {
        schema: {
          params: ReviewCommentParamsSchema,
          body: UpdateReviewCommentBodySchema,
          response: {
            200: ReviewCommentSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.updateReviewComment({
          actorId,
          projectId: request.params.projectId,
          commentId: request.params.commentId,
          ...request.body,
        })
      },
    )

    app.get<{
      Params: ProjectParams
      Querystring: ReviewCommentCorrespondenceQuery
    }>(
      "/v1/projects/:projectId/review-comment-correspondence",
      {
        schema: {
          params: ProjectParamsSchema,
          querystring: ReviewCommentCorrespondenceQuerySchema,
          response: {
            200: ReviewCommentCorrespondenceSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.listReviewCommentCorrespondence(
          actorId,
          request.params.projectId,
          request.query.primaryFileId,
          request.query.compareFileId,
        )
      },
    )

    app.post<{ Params: ProjectParams; Body: CreateReviewCommentLinkBody }>(
      "/v1/projects/:projectId/review-comment-links",
      {
        schema: {
          params: ProjectParamsSchema,
          body: CreateReviewCommentLinkBodySchema,
          response: {
            201: ReviewCommentLinkMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await productionService.createReviewCommentLink({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
        return reply.code(201).send(result)
      },
    )

    app.post<{
      Params: ReviewCommentLinkParams
      Body: UnlinkReviewCommentLinkBody
    }>(
      "/v1/projects/:projectId/review-comment-links/:linkId/unlink",
      {
        schema: {
          params: ReviewCommentLinkParamsSchema,
          body: UnlinkReviewCommentLinkBodySchema,
          response: {
            200: ReviewCommentLinkSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return productionService.unlinkReviewCommentLink({
          actorId,
          projectId: request.params.projectId,
          linkId: request.params.linkId,
          ...request.body,
        })
      },
    )
  }

  if (reviewLinkService) {
    app.post<{ Params: ProjectParams; Body: CreateReviewLinkBody }>(
      "/v1/projects/:projectId/review-links",
      {
        schema: {
          params: ProjectParamsSchema,
          body: CreateReviewLinkBodySchema,
          response: {
            200: ReviewLinkMutationSchema,
            201: ReviewLinkMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        const result = await reviewLinkService.createLink({
          actorId,
          projectId: request.params.projectId,
          ...request.body,
        })
        return reply.code(result.replayed ? 200 : 201).send(result)
      },
    )

    app.get<{ Params: ProjectParams }>(
      "/v1/projects/:projectId/review-links",
      {
        schema: {
          params: ProjectParamsSchema,
          response: {
            200: ReviewLinkListSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return reviewLinkService.listLinks(actorId, request.params.projectId)
      },
    )

    app.post<{ Params: ReviewLinkParams; Body: RevokeReviewLinkBody }>(
      "/v1/projects/:projectId/review-links/:linkId/revoke",
      {
        schema: {
          params: ReviewLinkParamsSchema,
          body: RevokeReviewLinkBodySchema,
          response: {
            200: ReviewLinkSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request) => {
        const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
        return reviewLinkService.revokeLink(
          actorId,
          request.params.projectId,
          request.params.linkId,
          request.body.idempotencyKey,
        )
      },
    )

    app.post<{ Params: PublicReviewTokenParams; Body: RequestReviewIdentityBody }>(
      "/review/:token/identity-challenges",
      {
        schema: {
          params: PublicReviewTokenParamsSchema,
          body: RequestReviewIdentityBodySchema,
          response: {
            201: ReviewIdentityChallengeSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
            429: ErrorResponseSchema,
            503: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const challenge = await reviewLinkService.requestIdentity(
          request.params.token,
          request.body,
        )
        return reply.code(201).send(challenge)
      },
    )

    app.post<{ Params: PublicReviewTokenParams; Body: OpenReviewSessionBody }>(
      "/review/:token/session",
      {
        schema: {
          params: PublicReviewTokenParamsSchema,
          body: OpenReviewSessionBodySchema,
          response: {
            201: PublicReviewWorkspaceSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
            429: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const result = await reviewLinkService.openSession(
          request.params.token,
          request.body.challengeId,
          request.body.code,
        )
        reply.header(
          "set-cookie",
          reviewSessionCookie(
            result.workspace.linkId,
            result.rawSessionToken,
            result.workspace.expiresAt,
          ),
        )
        return reply.code(201).send(result.workspace)
      },
    )

    app.get<{ Params: PublicReviewSessionParams }>(
      "/review/:linkId",
      {
        schema: {
          params: PublicReviewSessionParamsSchema,
          response: {
            200: PublicReviewWorkspaceSchema,
            401: ErrorResponseSchema,
          },
        },
      },
      (request) =>
        reviewLinkService.getWorkspace(
          request.params.linkId,
          reviewSessionToken(request.headers.cookie),
        ),
    )

    app.get<{ Params: PublicReviewFileParams }>(
      "/review/:linkId/files/:fileId/comments",
      {
        schema: {
          params: PublicReviewFileParamsSchema,
          response: {
            200: PublicReviewCommentListSchema,
            401: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      (request) =>
        reviewLinkService.listComments(
          request.params.linkId,
          reviewSessionToken(request.headers.cookie),
          request.params.fileId,
        ),
    )

    app.post<{ Params: PublicReviewFileParams; Body: CreateReviewCommentBody }>(
      "/review/:linkId/files/:fileId/comments",
      {
        schema: {
          params: PublicReviewFileParamsSchema,
          body: CreateReviewCommentBodySchema,
          response: {
            200: PublicReviewCommentMutationSchema,
            201: PublicReviewCommentMutationSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const result = await reviewLinkService.createComment(
          request.params.linkId,
          reviewSessionToken(request.headers.cookie),
          request.params.fileId,
          request.body,
        )
        return reply.code(result.replayed ? 200 : 201).send(result)
      },
    )

    app.post<{ Params: PublicReviewFileParams; Body: PublicReviewApprovalBody }>(
      "/review/:linkId/files/:fileId/approve",
      {
        schema: {
          params: PublicReviewFileParamsSchema,
          body: PublicReviewApprovalBodySchema,
          response: {
            200: PublicReviewFileSchema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      (request) =>
        reviewLinkService.approveFile(
          request.params.linkId,
          reviewSessionToken(request.headers.cookie),
          request.params.fileId,
          request.body,
        ),
    )

    app.get<{ Params: PublicReviewFileParams; Querystring: PublicReviewContentUrlQuery }>(
      "/review/:linkId/files/:fileId/content-url",
      {
        schema: {
          params: PublicReviewFileParamsSchema,
          querystring: PublicReviewContentUrlQuerySchema,
          response: {
            200: AssetContentUrlSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      (request) =>
        reviewLinkService.getContentUrl(
          request.params.linkId,
          reviewSessionToken(request.headers.cookie),
          request.params.fileId,
          request.query.download === "1",
        ),
    )
    app.get<{ Params: PublicReviewFileParams; Querystring: { file?: string } }>(
      "/review/:linkId/files/:fileId/playback",
      {
        schema: {
          params: PublicReviewFileParamsSchema,
          querystring: playbackQuerySchema,
        },
      },
      async (request, reply) =>
        sendPlayback(
          reply,
          await reviewLinkService.getPlayback(
            request.params.linkId,
            reviewSessionToken(request.headers.cookie),
            request.params.fileId,
            request.query.file,
          ),
        ),
    )
  }

  app.get<{ Params: ProjectParams }>(
    "/v1/projects/:projectId/script-documents",
    {
      schema: {
        params: ProjectParamsSchema,
        response: {
          200: ScriptDocumentListSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      return scriptService.listDocuments(actorId, request.params.projectId)
    },
  )

  app.post<{ Params: ProjectParams; Body: CreateScriptDocumentBody }>(
    "/v1/projects/:projectId/script-documents",
    {
      schema: {
        params: ProjectParamsSchema,
        body: CreateScriptDocumentBodySchema,
        response: {
          201: CreateScriptDocumentResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      const result = await scriptService.createDocument({
        actorId,
        projectId: request.params.projectId,
        ...request.body,
      })
      return reply.code(201).send(result)
    },
  )

  app.get<{ Params: ProjectParams; Querystring: ScriptDocumentQuery }>(
    "/v1/projects/:projectId/script-workspace",
    {
      schema: {
        params: ProjectParamsSchema,
        querystring: ScriptDocumentQuerySchema,
        response: {
          200: ScriptWorkspaceSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      return scriptService.getWorkspace(
        actorId,
        request.params.projectId,
        request.query.documentId,
      )
    },
  )

  app.get<{ Params: ProjectParams; Querystring: ScriptDocumentQuery }>(
    "/v1/projects/:projectId/script-events",
    {
      schema: {
        params: ProjectParamsSchema,
        querystring: ScriptDocumentQuerySchema,
        response: {
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      const workspace = await scriptService.getWorkspace(
        actorId,
        request.params.projectId,
        request.query.documentId,
      )
      const projectId = request.params.projectId
      const documentId = workspace.document.id
      const scopeKey = scriptScopeKey(projectId, documentId)
      const rawLastEventId = request.headers["last-event-id"]
      const requestedLastEventId =
        typeof rawLastEventId === "string" && /^\d+$/.test(rawLastEventId)
          ? Number(rawLastEventId)
          : null
      const latestEventId = scriptRealtimeStore
        ? await scriptRealtimeStore.latestEventId(projectId, documentId)
        : localEventId
      const lastEventId = Math.min(requestedLastEventId ?? latestEventId, latestEventId)

      const connection: ScriptPresenceConnection | null = scriptRealtimeStore
        ? {
            connectionId: randomUUID(),
            projectId,
            documentId,
            accountId: actorId,
            instanceId: realtimeInstanceId,
            leaseExpiresAt: new Date(Date.now() + presenceTtlMs),
          }
        : null
      if (connection && scriptRealtimeStore) {
        await scriptRealtimeStore.connectPresence(connection)
      }

      reply.hijack()
      reply.raw.writeHead(200, {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      })
      reply.raw.write("retry: 3000\n\n")
      const heartbeat = setInterval(() => {
        reply.raw.write(": keepalive\n\n")
        if (connection && scriptRealtimeStore) {
          void scriptRealtimeStore
            .touchPresence(connection.connectionId, new Date(Date.now() + presenceTtlMs))
            .catch((error) =>
              app.log.error({ error }, "script presence heartbeat failed"),
            )
        }
      }, 15_000)
      const streams = scriptEventStreams.get(scopeKey) ?? new Set<ScriptEventStream>()
      const stream = {
        actorId,
        connection,
        response: reply.raw,
        lastEventId,
        replaying: Boolean(scriptRealtimeStore && requestedLastEventId !== null),
      }
      streams.add(stream)
      scriptEventStreams.set(scopeKey, streams)
      let participants = scriptPresence.get(scopeKey)
      if (!scriptRealtimeStore) {
        participants ??= new Map<string, ScriptPresence>()
        participants.set(actorId, {
          collaboratorId: actorId,
          versionId: null,
          cursorStart: null,
          cursorEnd: null,
          editing: false,
          updatedAt: new Date().toISOString(),
        })
        scriptPresence.set(scopeKey, participants)
      }
      await publishPresence(projectId, documentId)
      if (scriptRealtimeStore && requestedLastEventId !== null) {
        try {
          const events = await scriptRealtimeStore.listEvents(
            projectId,
            documentId,
            stream.lastEventId,
          )
          for (const event of events) {
            writeScriptEvent(
              stream,
              projectId,
              documentId,
              event.event,
              event.data,
              event.id,
            )
          }
        } finally {
          stream.replaying = false
        }
        await flushPersistedEvents(projectId, documentId)
      }
      reply.raw.once("close", () => {
        clearInterval(heartbeat)
        streams.delete(stream)
        const actorStillConnected = [...streams].some((item) => item.actorId === actorId)
        if (connection && scriptRealtimeStore) {
          void scriptRealtimeStore
            .disconnectPresence(connection, presenceActiveAt())
            .then(() => {
              presenceFingerprints.delete(scopeKey)
              if (streams.size) return publishPresence(projectId, documentId)
            })
            .catch((error) =>
              app.log.error({ error }, "script presence disconnect failed"),
            )
        } else if (!actorStillConnected) {
          participants?.delete(actorId)
        }
        if (!streams.size) {
          scriptEventStreams.delete(scopeKey)
          if (!scriptRealtimeStore) scriptPresence.delete(scopeKey)
          presenceFingerprints.delete(scopeKey)
          return
        }
        if (!scriptRealtimeStore && !actorStillConnected) {
          void publishPresence(projectId, documentId)
        }
      })
    },
  )

  app.post<{ Params: ProjectParams; Body: UpdateScriptPresenceBody }>(
    "/v1/projects/:projectId/script-presence",
    {
      schema: {
        params: ProjectParamsSchema,
        body: UpdateScriptPresenceBodySchema,
        response: {
          200: ScriptPresenceSnapshotSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      const projectId = request.params.projectId
      const workspace = await scriptService.getWorkspace(
        actorId,
        projectId,
        request.body.documentId,
      )
      const documentId = workspace.document.id
      const version = workspace.versions.find(
        (item) => item.id === request.body.versionId,
      )
      if (!version) {
        throw new AppError("SCRIPT_VERSION_NOT_FOUND", "脚本版本不存在", 404)
      }
      if (request.body.cursorEnd < request.body.cursorStart) {
        throw new AppError("SCRIPT_CURSOR_INVALID", "脚本光标位置无效", 400)
      }
      const scopeKey = scriptScopeKey(projectId, documentId)
      const presence = {
        collaboratorId: actorId,
        versionId: request.body.versionId,
        cursorStart: request.body.cursorStart,
        cursorEnd: request.body.cursorEnd,
        editing: request.body.editing && workspace.permissions.canWrite,
        updatedAt: new Date().toISOString(),
      }
      const connected = scriptRealtimeStore
        ? await scriptRealtimeStore.updatePresence(
            projectId,
            documentId,
            presence,
            presenceActiveAt(),
          )
        : [...(scriptEventStreams.get(scopeKey) ?? [])].some(
            (item) => item.actorId === actorId,
          )
      if (!connected) {
        throw new AppError(
          "SCRIPT_PRESENCE_CONNECTION_REQUIRED",
          "实时协作连接尚未建立",
          409,
          true,
        )
      }
      if (!scriptRealtimeStore) {
        const participants =
          scriptPresence.get(scopeKey) ?? new Map<string, ScriptPresence>()
        participants.set(actorId, presence)
        scriptPresence.set(scopeKey, participants)
      }
      return publishPresence(projectId, documentId)
    },
  )

  app.patch<{ Params: ScriptVersionParams; Body: UpdateScriptVersionBody }>(
    "/v1/projects/:projectId/script-versions/:versionId",
    {
      schema: {
        params: ScriptVersionParamsSchema,
        body: UpdateScriptVersionBodySchema,
        response: {
          200: UpdateScriptVersionResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      const result = await scriptService.updateVersion({
        actorId,
        projectId: request.params.projectId,
        versionId: request.params.versionId,
        ...request.body,
      })
      if (!result.replayed) {
        await notifyScriptWrite(
          request.params.projectId,
          result.documentId,
          "script.version.updated",
          {
            versionId: result.version.id,
            revision: result.version.revision,
          },
        )
      }
      return result
    },
  )

  app.post<{ Params: ProjectParams; Body: CreateScriptVersionBody }>(
    "/v1/projects/:projectId/script-versions",
    {
      schema: {
        params: ProjectParamsSchema,
        body: CreateScriptVersionBodySchema,
        response: {
          201: CreateScriptVersionResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      const result = await scriptService.createVersion({
        actorId,
        projectId: request.params.projectId,
        ...request.body,
      })
      if (!result.replayed) {
        await notifyScriptWrite(
          request.params.projectId,
          result.documentId,
          "script.version.updated",
          {
            versionId: result.version.id,
            revision: result.version.revision,
          },
        )
      }
      return reply.code(201).send(result)
    },
  )

  app.post<{ Params: ProjectParams; Body: CreateScriptCommentBody }>(
    "/v1/projects/:projectId/script-comments",
    {
      schema: {
        params: ProjectParamsSchema,
        body: CreateScriptCommentBodySchema,
        response: {
          201: CreateScriptCommentResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      const result = await scriptService.createComment({
        actorId,
        projectId: request.params.projectId,
        ...request.body,
      })
      if (!result.replayed) {
        await notifyScriptWrite(
          request.params.projectId,
          result.documentId,
          "script.comment.updated",
          {
            commentId: result.comment.id,
            versionId: result.comment.versionId,
            action: "created",
          },
        )
      }
      return reply.code(201).send(result)
    },
  )

  app.patch<{ Params: ScriptCommentParams; Body: UpdateScriptCommentBody }>(
    "/v1/projects/:projectId/script-comments/:commentId",
    {
      schema: {
        params: ScriptCommentParamsSchema,
        body: UpdateScriptCommentBodySchema,
        response: {
          200: UpdateScriptCommentResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const actorId = actorIdFromHeader(request.headers["x-shadow-account-id"])
      const result = await scriptService.updateComment({
        actorId,
        projectId: request.params.projectId,
        commentId: request.params.commentId,
        ...request.body,
      })
      if (!result.replayed) {
        await notifyScriptWrite(
          request.params.projectId,
          result.documentId,
          "script.comment.updated",
          {
            commentId: result.comment.id,
            versionId: result.comment.versionId,
            action: result.comment.resolved ? "resolved" : "reopened",
          },
        )
      }
      return result
    },
  )

  app.setErrorHandler((error, request, reply) => {
    const fastifyError = error as FastifyError
    if (fastifyError.validation) {
      return reply.code(400).send({
        code: "VALIDATION_FAILED",
        message: "请求参数不符合契约",
        requestId: request.id,
        details: fastifyError.validation,
        retryable: false,
      })
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
        details: error.details,
        retryable: error.retryable,
      })
    }
    request.log.error(error)
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "服务暂时不可用",
      requestId: request.id,
      retryable: true,
    })
  })

  return app
}
