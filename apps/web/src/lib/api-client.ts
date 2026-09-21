import type {
  AddPortfolioContentBody,
  AgentConfirmationResponse,
  AgentExecutionResponse,
  AgentPreviewBody,
  AgentPreviewResponse,
  AnalysisJob,
  AnalysisWorkflow,
  ApprovedPortfolioCandidate,
  AssetFolder,
  AssetSemanticSearchBody,
  AssetSemanticSearchResponse,
  AssetUploadInstruction,
  AssignPermissionTemplateBody,
  AuditLogList,
  AuditLogQuery,
  BindPortfolioDomainBody,
  BreakdownItem,
  BreakdownRelationOptions,
  CalendarEvent,
  CallSheet,
  CallSheetChange,
  CallSheetPublication,
  ChangePortfolioPublicationBody,
  ConfirmBreakdownBody,
  CreateAssetFolderBody,
  CreateAssetUploadIntentBody,
  CreateCalendarEventBody,
  CreateCallSheetBody,
  CreateExecutionStageBody,
  CreateMediaAnalysisBody,
  CreatePermissionTemplateBody,
  CreatePersonalContactBody,
  CreateReviewCommentBody,
  CreateReviewCommentLinkBody,
  CreateReviewFileBody,
  CreateReviewFolderBody,
  CreateReviewLinkBody,
  CreateScriptBreakdownAnalysisBody,
  CreateScriptCommentBody,
  CreateScriptCommentResponse,
  CreateScriptDocumentBody,
  CreateScriptDocumentResponse,
  CreateScriptVersionBody,
  CreateScriptVersionResponse,
  CreateShootingDayBody,
  CreateTeamContactBody,
  CreateTeamPortfolioBody,
  CreateTeamSupplierBody,
  CreateWorkspaceNoteBody,
  CreateWorkspaceTaskBody,
  DeletedPersonalContact,
  ErrorResponse,
  ExecutionConflict,
  ExecutionStage,
  ImportTeamContactsBody,
  ImportTeamSuppliersBody,
  MediaAnalysisJob,
  MediaAnalysisResponse,
  MergeBreakdownBody,
  MoveReviewFileBody,
  NotificationPreferences,
  PermanentlyDeleteRecycleItemBody,
  PermissionTemplate,
  PermissionWorkspace,
  PersonalContact,
  PortfolioAnalytics,
  PublicPortfolio,
  PublicReviewApprovalBody,
  PublicReviewWorkspace,
  PublishCallSheetBody,
  RequestReviewIdentityBody,
  ReviewComment,
  ReviewCommentLink,
  ReviewCommentSuggestion,
  ReviewFile,
  ReviewFileApprovalBody,
  ReviewFolder,
  ReviewIdentityChallenge,
  ReviewLink,
  ScriptDocumentList,
  ScriptPresenceSnapshot,
  ScriptVersionImpact,
  ScriptWorkspace,
  ShootingDay,
  SplitBreakdownBody,
  TeamAsset,
  TeamContact,
  TeamContactImportMutation,
  TeamPortfolio,
  TeamSupplier,
  TeamSupplierImportMutation,
  UnlinkReviewCommentLinkBody,
  UpdateAnalysisJobBody,
  UpdateAnalysisWorkflowBody,
  UpdateAssetFolderBody,
  UpdateBreakdownItemBody,
  UpdateCalendarEventBody,
  UpdateCallSheetBody,
  UpdateContactShareBody,
  UpdateExecutionStageBody,
  UpdateMediaAnalysisBody,
  UpdateNotificationStateBody,
  UpdatePermissionTemplateBody,
  UpdatePersonalContactBody,
  UpdatePortfolioSettingsBody,
  UpdateReviewCommentBody,
  UpdateReviewFileArchiveBody,
  UpdateReviewFolderBody,
  UpdateScriptCommentBody,
  UpdateScriptCommentResponse,
  UpdateScriptPresenceBody,
  UpdateScriptVersionBody,
  UpdateScriptVersionResponse,
  UpdateShootingDayBody,
  UpdateTeamAssetBody,
  UpdateTeamContactBody,
  UpdateTeamSupplierBody,
  UpdateWorkspaceNoteBody,
  UpdateWorkspaceTaskBody,
  WorkspaceContext,
  WorkspaceNote,
  WorkspaceNotification,
  WorkspaceNotificationList,
  WorkspaceRecycleItem,
  WorkspaceTask,
} from "@shadowproducer/contracts"
import type {
  AcceptInvitationResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateTeamBody,
  CreateTeamInvitationBody,
  CreateTeamResponse,
  InvitationPreview,
  TeamInvitationList,
} from "@/lib/onboarding"

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorResponse | null
    throw new ApiError(
      body?.code ?? "NETWORK_ERROR",
      body?.message ?? "服务请求失败",
      response.status,
      body?.retryable ?? response.status >= 500,
      body?.requestId,
    )
  }

  return (await response.json()) as T
}

async function apiDownload(path: string) {
  const response = await fetch(`/api${path}`, { credentials: "include" })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorResponse | null
    throw new ApiError(
      body?.code ?? "NETWORK_ERROR",
      body?.message ?? "文件下载失败",
      response.status,
      body?.retryable ?? response.status >= 500,
      body?.requestId,
    )
  }
  const disposition = response.headers.get("content-disposition") ?? ""
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const fallback = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  return {
    blob: await response.blob(),
    fileName: encoded
      ? decodeURIComponent(encoded)
      : (fallback ?? "shadowproducer-data.json"),
  }
}

async function playbackRequest<T extends { url: string }>(path: string): Promise<T> {
  const result = await apiRequest<T>(path)
  return { ...result, url: result.url.startsWith("/") ? `/api${result.url}` : result.url }
}

export const scriptApi = {
  listDocuments(projectId: string) {
    return apiRequest<ScriptDocumentList>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-documents`,
    )
  },
  createDocument(projectId: string, body: CreateScriptDocumentBody) {
    return apiRequest<CreateScriptDocumentResponse>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-documents`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  getWorkspace(projectId: string, documentId?: string) {
    const query = documentId ? `?${new URLSearchParams({ documentId })}` : ""
    return apiRequest<ScriptWorkspace>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-workspace${query}`,
    )
  },
  getVersionImpact(
    projectId: string,
    fromVersionId: string,
    toVersionId: string,
    documentId?: string,
  ) {
    const query = new URLSearchParams({
      fromVersionId,
      toVersionId,
      ...(documentId ? { documentId } : {}),
    })
    return apiRequest<ScriptVersionImpact>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-version-impact?${query}`,
    )
  },
  updateVersion(projectId: string, versionId: string, body: UpdateScriptVersionBody) {
    return apiRequest<UpdateScriptVersionResponse>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-versions/${encodeURIComponent(versionId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  createVersion(projectId: string, body: CreateScriptVersionBody) {
    return apiRequest<CreateScriptVersionResponse>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-versions`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  createComment(projectId: string, body: CreateScriptCommentBody) {
    return apiRequest<CreateScriptCommentResponse>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-comments`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateComment(projectId: string, commentId: string, body: UpdateScriptCommentBody) {
    return apiRequest<UpdateScriptCommentResponse>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-comments/${encodeURIComponent(commentId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  updatePresence(projectId: string, body: UpdateScriptPresenceBody) {
    return apiRequest<ScriptPresenceSnapshot>(
      `/v1/projects/${encodeURIComponent(projectId)}/script-presence`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
}

export const agentApi = {
  preview(body: AgentPreviewBody) {
    return apiRequest<AgentPreviewResponse>("/v1/agent/commands/preview", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  confirm(commandId: string) {
    return apiRequest<AgentConfirmationResponse>(
      `/v1/agent/commands/${encodeURIComponent(commandId)}/confirm`,
      { method: "POST" },
    )
  },
  execute(commandId: string) {
    return apiRequest<AgentExecutionResponse>(
      `/v1/agent/commands/${encodeURIComponent(commandId)}/execute`,
      { method: "POST" },
    )
  },
}

function projectPath(projectId: string, resource: string) {
  return `/v1/projects/${encodeURIComponent(projectId)}/${resource}`
}

export const analysisApi = {
  getWorkflow(projectId: string) {
    return apiRequest<AnalysisWorkflow>(projectPath(projectId, "analysis-workflow"))
  },
  updateWorkflow(projectId: string, body: UpdateAnalysisWorkflowBody) {
    return apiRequest<{ workflow: AnalysisWorkflow; replayed: boolean }>(
      projectPath(projectId, "analysis-workflow"),
      { method: "PUT", body: JSON.stringify(body) },
    )
  },
  list(projectId: string) {
    return apiRequest<{ items: AnalysisJob[] }>(projectPath(projectId, "analysis-jobs"))
  },
  createScriptBreakdown(projectId: string, body: CreateScriptBreakdownAnalysisBody) {
    return apiRequest<{ job: AnalysisJob; replayed: boolean }>(
      projectPath(projectId, "analysis-jobs/script-breakdown"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  retry(projectId: string, jobId: string, body: UpdateAnalysisJobBody) {
    return apiRequest<{ job: AnalysisJob; replayed: boolean }>(
      `${projectPath(projectId, "analysis-jobs")}/${encodeURIComponent(jobId)}/retry`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  cancel(projectId: string, jobId: string, body: UpdateAnalysisJobBody) {
    return apiRequest<{ job: AnalysisJob; replayed: boolean }>(
      `${projectPath(projectId, "analysis-jobs")}/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
}

export const productionApi = {
  listBreakdown(projectId: string) {
    return apiRequest<{ items: BreakdownItem[] }>(projectPath(projectId, "breakdown"))
  },
  listBreakdownRelationOptions(projectId: string) {
    return apiRequest<BreakdownRelationOptions>(
      projectPath(projectId, "breakdown/options"),
    )
  },
  updateBreakdown(projectId: string, itemId: string, body: UpdateBreakdownItemBody) {
    return apiRequest<BreakdownItem>(
      `${projectPath(projectId, "breakdown")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  confirmBreakdown(projectId: string, body: ConfirmBreakdownBody) {
    return apiRequest<{ items: BreakdownItem[]; replayed: boolean }>(
      `${projectPath(projectId, "breakdown")}/confirm`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  mergeBreakdown(projectId: string, body: MergeBreakdownBody) {
    return apiRequest<{ items: BreakdownItem[]; replayed: boolean }>(
      `${projectPath(projectId, "breakdown")}/merge`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  splitBreakdown(projectId: string, body: SplitBreakdownBody) {
    return apiRequest<{ items: BreakdownItem[]; replayed: boolean }>(
      `${projectPath(projectId, "breakdown")}/split`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  listExecutionSchedule(projectId: string) {
    return apiRequest<{ items: ExecutionStage[]; conflicts: ExecutionConflict[] }>(
      projectPath(projectId, "execution-schedule"),
    )
  },
  createExecutionStage(projectId: string, body: CreateExecutionStageBody) {
    return apiRequest<{ item: ExecutionStage; replayed: boolean }>(
      projectPath(projectId, "execution-schedule"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateExecutionStage(
    projectId: string,
    itemId: string,
    body: UpdateExecutionStageBody,
  ) {
    return apiRequest<ExecutionStage>(
      `${projectPath(projectId, "execution-schedule")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  listShootingDays(projectId: string) {
    return apiRequest<{ items: ShootingDay[] }>(projectPath(projectId, "shooting-days"))
  },
  createShootingDay(projectId: string, body: CreateShootingDayBody) {
    return apiRequest<{ item: ShootingDay; replayed: boolean }>(
      projectPath(projectId, "shooting-days"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateShootingDay(projectId: string, itemId: string, body: UpdateShootingDayBody) {
    return apiRequest<ShootingDay>(
      `${projectPath(projectId, "shooting-days")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  listCallSheets(projectId: string) {
    return apiRequest<{ items: CallSheet[] }>(projectPath(projectId, "call-sheets"))
  },
  createCallSheet(projectId: string, body: CreateCallSheetBody) {
    return apiRequest<{ item: CallSheet; replayed: boolean }>(
      projectPath(projectId, "call-sheets"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateCallSheet(projectId: string, itemId: string, body: UpdateCallSheetBody) {
    return apiRequest<CallSheet>(
      `${projectPath(projectId, "call-sheets")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  publishCallSheet(projectId: string, itemId: string, body: PublishCallSheetBody) {
    return apiRequest<{
      item: CallSheet
      publication: CallSheetPublication
      replayed: boolean
    }>(`${projectPath(projectId, "call-sheets")}/${encodeURIComponent(itemId)}/publish`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  listCallSheetHistory(projectId: string, itemId: string) {
    return apiRequest<{
      publications: CallSheetPublication[]
      changes: CallSheetChange[]
    }>(`${projectPath(projectId, "call-sheets")}/${encodeURIComponent(itemId)}/history`)
  },
  listReviewFiles(projectId: string, archived = false) {
    return apiRequest<{ items: ReviewFile[]; folders: ReviewFolder[] }>(
      `${projectPath(projectId, "review-files")}${archived ? "?archived=1" : ""}`,
    )
  },
  createReviewFile(projectId: string, body: CreateReviewFileBody) {
    return apiRequest<{ item: ReviewFile; replayed: boolean }>(
      projectPath(projectId, "review-files"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  createReviewFolder(projectId: string, body: CreateReviewFolderBody) {
    return apiRequest<{ item: ReviewFolder; replayed: boolean }>(
      projectPath(projectId, "review-folders"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  listReviewFolders(projectId: string, archived = false) {
    return apiRequest<{ items: ReviewFolder[] }>(
      `${projectPath(projectId, "review-folders")}${archived ? "?archived=1" : ""}`,
    )
  },
  updateReviewFolder(projectId: string, folderId: string, body: UpdateReviewFolderBody) {
    return apiRequest<ReviewFolder>(
      `${projectPath(projectId, "review-folders")}/${encodeURIComponent(folderId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  moveReviewFile(projectId: string, fileId: string, body: MoveReviewFileBody) {
    return apiRequest<{ item: ReviewFile; replayed: boolean }>(
      `${projectPath(projectId, "review-files")}/${encodeURIComponent(fileId)}/move`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateReviewFile(projectId: string, fileId: string, body: UpdateReviewFileArchiveBody) {
    return apiRequest<{ item: ReviewFile; replayed: boolean }>(
      `${projectPath(projectId, "review-files")}/${encodeURIComponent(fileId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  permanentlyDeleteReviewFile(
    projectId: string,
    fileId: string,
    body: PermanentlyDeleteRecycleItemBody,
  ) {
    return apiRequest<{ id: string }>(
      `${projectPath(projectId, "review-files")}/${encodeURIComponent(fileId)}/permanent`,
      { method: "DELETE", body: JSON.stringify(body) },
    )
  },
  listReviewComments(projectId: string, fileId: string) {
    return apiRequest<{ items: ReviewComment[] }>(
      `${projectPath(projectId, "review-files")}/${encodeURIComponent(fileId)}/comments`,
    )
  },
  approveReviewFile(projectId: string, fileId: string, body: ReviewFileApprovalBody) {
    return apiRequest<{ item: ReviewFile; replayed: boolean }>(
      `${projectPath(projectId, "review-files")}/${encodeURIComponent(fileId)}/approve`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  revokeReviewFileApproval(
    projectId: string,
    fileId: string,
    body: ReviewFileApprovalBody,
  ) {
    return apiRequest<{ item: ReviewFile; replayed: boolean }>(
      `${projectPath(projectId, "review-files")}/${encodeURIComponent(fileId)}/revoke-approval`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  createReviewComment(projectId: string, fileId: string, body: CreateReviewCommentBody) {
    return apiRequest<{ item: ReviewComment; replayed: boolean }>(
      `${projectPath(projectId, "review-files")}/${encodeURIComponent(fileId)}/comments`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateReviewComment(
    projectId: string,
    commentId: string,
    body: UpdateReviewCommentBody,
  ) {
    return apiRequest<ReviewComment>(
      `${projectPath(projectId, "review-comments")}/${encodeURIComponent(commentId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  listReviewCommentCorrespondence(
    projectId: string,
    primaryFileId: string,
    compareFileId: string,
  ) {
    const query = new URLSearchParams({ primaryFileId, compareFileId })
    return apiRequest<{
      primaryFileId: string
      compareFileId: string
      links: ReviewCommentLink[]
      suggestions: ReviewCommentSuggestion[]
    }>(`${projectPath(projectId, "review-comment-correspondence")}?${query}`)
  },
  createReviewCommentLink(projectId: string, body: CreateReviewCommentLinkBody) {
    return apiRequest<{ item: ReviewCommentLink; replayed: boolean }>(
      projectPath(projectId, "review-comment-links"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  unlinkReviewCommentLink(
    projectId: string,
    linkId: string,
    body: UnlinkReviewCommentLinkBody,
  ) {
    return apiRequest<ReviewCommentLink>(
      `${projectPath(projectId, "review-comment-links")}/${encodeURIComponent(linkId)}/unlink`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
}

export const reviewLinkApi = {
  list(projectId: string) {
    return apiRequest<{ items: ReviewLink[] }>(projectPath(projectId, "review-links"))
  },
  create(projectId: string, body: CreateReviewLinkBody) {
    return apiRequest<{ item: ReviewLink; replayed: boolean }>(
      projectPath(projectId, "review-links"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  revoke(projectId: string, linkId: string) {
    return apiRequest<ReviewLink>(
      `${projectPath(projectId, "review-links")}/${encodeURIComponent(linkId)}/revoke`,
      {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      },
    )
  },
  requestIdentity(token: string, body: RequestReviewIdentityBody) {
    return apiRequest<ReviewIdentityChallenge>(
      `/review/${encodeURIComponent(token)}/identity-challenges`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  openSession(token: string, challengeId: string, code: string) {
    return apiRequest<PublicReviewWorkspace>(
      `/review/${encodeURIComponent(token)}/session`,
      {
        method: "POST",
        body: JSON.stringify({ challengeId, code }),
      },
    )
  },
  getWorkspace(linkId: string) {
    return apiRequest<PublicReviewWorkspace>(`/review/${encodeURIComponent(linkId)}`)
  },
  listComments(linkId: string, fileId: string) {
    return apiRequest<{ items: ReviewComment[] }>(
      `/review/${encodeURIComponent(linkId)}/files/${encodeURIComponent(fileId)}/comments`,
    )
  },
  createComment(linkId: string, fileId: string, body: CreateReviewCommentBody) {
    return apiRequest<{ item: ReviewComment; replayed: boolean }>(
      `/review/${encodeURIComponent(linkId)}/files/${encodeURIComponent(fileId)}/comments`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  approve(linkId: string, fileId: string, body: PublicReviewApprovalBody) {
    return apiRequest<PublicReviewWorkspace["files"][number]>(
      `/review/${encodeURIComponent(linkId)}/files/${encodeURIComponent(fileId)}/approve`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  getContentUrl(linkId: string, fileId: string, download = false) {
    return playbackRequest<{ url: string; expiresAt: string }>(
      `/review/${encodeURIComponent(linkId)}/files/${encodeURIComponent(fileId)}/content-url${download ? "?download=1" : ""}`,
    )
  },
}

function teamPath(teamId: string, resource: string) {
  return `/v1/teams/${encodeURIComponent(teamId)}/${resource}`
}

export const workspaceApi = {
  getContext() {
    return apiRequest<WorkspaceContext>("/v1/workspace-context")
  },
  listAuditLogs(teamId: string, query: AuditLogQuery = {}) {
    const params = new URLSearchParams()
    if (query.page) params.set("page", String(query.page))
    if (query.pageSize) params.set("pageSize", String(query.pageSize))
    if (query.projectId) params.set("projectId", query.projectId)
    if (query.scope) params.set("scope", query.scope)
    if (query.action) params.set("action", query.action)
    if (query.actor) params.set("actor", query.actor)
    if (query.from) params.set("from", query.from)
    if (query.to) params.set("to", query.to)
    const suffix = params.size ? `?${params}` : ""
    return apiRequest<AuditLogList>(`${teamPath(teamId, "audit-logs")}${suffix}`)
  },
  downloadDataExport(teamId: string) {
    return apiDownload(teamPath(teamId, "data-export"))
  },
  getPermissions(teamId: string) {
    return apiRequest<PermissionWorkspace>(teamPath(teamId, "permissions"))
  },
  createPermissionTemplate(teamId: string, body: CreatePermissionTemplateBody) {
    return apiRequest<{ item: PermissionTemplate; replayed: boolean }>(
      teamPath(teamId, "permission-templates"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updatePermissionTemplate(
    teamId: string,
    itemId: string,
    body: UpdatePermissionTemplateBody,
  ) {
    return apiRequest<PermissionTemplate>(
      `${teamPath(teamId, "permission-templates")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  assignTeamPermissionTemplate(
    teamId: string,
    accountId: string,
    body: AssignPermissionTemplateBody,
  ) {
    return apiRequest<{
      accountId: string
      permissionTemplateId: string
      permissionRevision: number
    }>(
      `${teamPath(teamId, "members")}/${encodeURIComponent(accountId)}/permission-template`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  assignProjectPermissionTemplate(
    teamId: string,
    projectId: string,
    accountId: string,
    body: AssignPermissionTemplateBody,
  ) {
    return apiRequest<{
      accountId: string
      permissionTemplateId: string
      permissionRevision: number
    }>(
      `${teamPath(teamId, "projects")}/${encodeURIComponent(projectId)}/members/${encodeURIComponent(accountId)}/permission-template`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  listNotifications(teamId: string, query: { page?: number; pageSize?: number } = {}) {
    const params = new URLSearchParams()
    if (query.page) params.set("page", String(query.page))
    if (query.pageSize) params.set("pageSize", String(query.pageSize))
    const suffix = params.size ? `?${params}` : ""
    return apiRequest<WorkspaceNotificationList>(
      `${teamPath(teamId, "notifications")}${suffix}`,
    )
  },
  updateNotification(teamId: string, itemId: string, body: UpdateNotificationStateBody) {
    return apiRequest<{ item: WorkspaceNotification }>(
      `${teamPath(teamId, "notifications")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  markAllNotificationsRead(teamId: string) {
    return apiRequest<{ updated: number }>(teamPath(teamId, "notifications/read-all"), {
      method: "POST",
    })
  },
  getNotificationPreferences(teamId: string) {
    return apiRequest<NotificationPreferences>(
      teamPath(teamId, "notification-preferences"),
    )
  },
  updateNotificationPreferences(teamId: string, body: NotificationPreferences) {
    return apiRequest<NotificationPreferences>(
      teamPath(teamId, "notification-preferences"),
      { method: "PUT", body: JSON.stringify(body) },
    )
  },
  listTasks(teamId: string) {
    return apiRequest<{ items: WorkspaceTask[] }>(teamPath(teamId, "tasks"))
  },
  createTask(teamId: string, body: CreateWorkspaceTaskBody) {
    return apiRequest<{ item: WorkspaceTask; replayed: boolean }>(
      teamPath(teamId, "tasks"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateTask(teamId: string, itemId: string, body: UpdateWorkspaceTaskBody) {
    return apiRequest<WorkspaceTask>(
      `${teamPath(teamId, "tasks")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  deleteTask(teamId: string, itemId: string, expectedRevision: number) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "tasks")}/${encodeURIComponent(itemId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision }),
      },
    )
  },
  listCalendarEvents(teamId: string) {
    return apiRequest<{ items: CalendarEvent[] }>(teamPath(teamId, "calendar-events"))
  },
  createCalendarEvent(teamId: string, body: CreateCalendarEventBody) {
    return apiRequest<{ item: CalendarEvent; replayed: boolean }>(
      teamPath(teamId, "calendar-events"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateCalendarEvent(teamId: string, itemId: string, body: UpdateCalendarEventBody) {
    return apiRequest<CalendarEvent>(
      `${teamPath(teamId, "calendar-events")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  deleteCalendarEvent(teamId: string, itemId: string, expectedRevision: number) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "calendar-events")}/${encodeURIComponent(itemId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision }),
      },
    )
  },
  listNotes(teamId: string) {
    return apiRequest<{ items: WorkspaceNote[] }>(teamPath(teamId, "notes"))
  },
  createNote(teamId: string, body: CreateWorkspaceNoteBody) {
    return apiRequest<{ item: WorkspaceNote; replayed: boolean }>(
      teamPath(teamId, "notes"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateNote(teamId: string, itemId: string, body: UpdateWorkspaceNoteBody) {
    return apiRequest<WorkspaceNote>(
      `${teamPath(teamId, "notes")}/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  deleteNote(teamId: string, itemId: string, expectedRevision: number) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "notes")}/${encodeURIComponent(itemId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision }),
      },
    )
  },
  listRecycleBin(teamId: string) {
    return apiRequest<{ items: WorkspaceRecycleItem[]; canManageShared: boolean }>(
      teamPath(teamId, "recycle-bin"),
    )
  },
  restoreRecycleItem(teamId: string, item: WorkspaceRecycleItem) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "recycle-bin")}/${item.kind}/${encodeURIComponent(item.id)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision: item.revision }),
      },
    )
  },
  permanentlyDeleteRecycleItem(teamId: string, item: WorkspaceRecycleItem) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "recycle-bin")}/${item.kind}/${encodeURIComponent(item.id)}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          expectedRevision: item.revision,
          confirmation: "permanent-delete",
        }),
      },
    )
  },
}

// Thin onboarding client for account, team, project, and invitation flows.
export const onboardingApi = {
  createTeam(body: CreateTeamBody) {
    return apiRequest<CreateTeamResponse>("/v1/teams", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  createProject(teamId: string, body: CreateProjectBody) {
    return apiRequest<CreateProjectResponse>(teamPath(teamId, "projects"), {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  listInvitations(teamId: string) {
    return apiRequest<TeamInvitationList>(teamPath(teamId, "invitations"))
  },
  createInvitation(teamId: string, body: CreateTeamInvitationBody) {
    return apiRequest<{
      item: import("@shadowproducer/contracts").CreatedInvitation
      replayed: boolean
    }>(teamPath(teamId, "invitations"), { method: "POST", body: JSON.stringify(body) })
  },
  revokeInvitation(teamId: string, invitationId: string, expectedRevision: number) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "invitations")}/${encodeURIComponent(invitationId)}/revoke`,
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      },
    )
  },
  rotateInvitationToken(
    teamId: string,
    invitationId: string,
    body: { expectedRevision: number; idempotencyKey: string },
  ) {
    return apiRequest<{
      item: import("@shadowproducer/contracts").CreatedInvitation
      replayed: boolean
    }>(
      `${teamPath(teamId, "invitations")}/${encodeURIComponent(invitationId)}/rotate-token`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  getInvitation(token: string) {
    return apiRequest<{ item: InvitationPreview }>(
      `/invitations/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    ).then((response) => response.item)
  },
  acceptInvitation(token: string) {
    const storageKey = `shadowproducer:invitation-accept:${token}`
    let idempotencyKey: string
    try {
      idempotencyKey = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID()
      window.sessionStorage.setItem(storageKey, idempotencyKey)
    } catch {
      // Non-browser callers still get a valid request; browser retries reuse the key.
      idempotencyKey = crypto.randomUUID()
    }
    return apiRequest<{
      item: AcceptInvitationResponse
      replayed: boolean
    }>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey,
      }),
    }).then((response) => {
      try {
        window.sessionStorage.removeItem(storageKey)
      } catch {
        // Ignore storage cleanup failures after the server has committed.
      }
      return response.item
    })
  },
}

export const contactApi = {
  listPersonal() {
    return apiRequest<{ items: PersonalContact[] }>("/v1/contacts")
  },
  listDeletedPersonal() {
    return apiRequest<{ items: DeletedPersonalContact[] }>("/v1/contacts/deleted")
  },
  createPersonal(body: CreatePersonalContactBody) {
    return apiRequest<{ item: PersonalContact; replayed: boolean }>("/v1/contacts", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  updatePersonal(contactId: string, body: UpdatePersonalContactBody) {
    return apiRequest<PersonalContact>(`/v1/contacts/${encodeURIComponent(contactId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
  deletePersonal(contactId: string, expectedRevision: number) {
    return apiRequest<{ id: string }>(`/v1/contacts/${encodeURIComponent(contactId)}`, {
      method: "DELETE",
      body: JSON.stringify({ expectedRevision }),
    })
  },
  restorePersonal(contactId: string, expectedRevision: number) {
    return apiRequest<PersonalContact>(
      `/v1/contacts/${encodeURIComponent(contactId)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      },
    )
  },
  permanentlyDeletePersonal(contactId: string, expectedRevision: number) {
    return apiRequest<{ id: string }>(
      `/v1/contacts/${encodeURIComponent(contactId)}/permanent`,
      {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision, confirmation: "permanent-delete" }),
      },
    )
  },
  setShare(contactId: string, teamId: string, body: UpdateContactShareBody) {
    return apiRequest<PersonalContact>(
      `/v1/contacts/${encodeURIComponent(contactId)}/team-shares/${encodeURIComponent(teamId)}`,
      { method: "PUT", body: JSON.stringify(body) },
    )
  },
  revokeShare(contactId: string, teamId: string, expectedRevision: number) {
    return apiRequest<PersonalContact>(
      `/v1/contacts/${encodeURIComponent(contactId)}/team-shares/${encodeURIComponent(teamId)}`,
      { method: "DELETE", body: JSON.stringify({ expectedRevision }) },
    )
  },
  listTeam(teamId: string) {
    return apiRequest<{ items: TeamContact[] }>(teamPath(teamId, "contacts"))
  },
  createTeam(teamId: string, body: CreateTeamContactBody) {
    return apiRequest<{ item: TeamContact; replayed: boolean }>(
      teamPath(teamId, "contacts"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  importTeam(teamId: string, body: ImportTeamContactsBody) {
    return apiRequest<TeamContactImportMutation>(teamPath(teamId, "contacts/import"), {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  updateTeam(teamId: string, contactId: string, body: UpdateTeamContactBody) {
    return apiRequest<TeamContact>(
      `${teamPath(teamId, "contacts")}/${encodeURIComponent(contactId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  deleteTeam(teamId: string, contactId: string, expectedRevision: number) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "contacts")}/${encodeURIComponent(contactId)}`,
      { method: "DELETE", body: JSON.stringify({ expectedRevision }) },
    )
  },
}

export const supplierApi = {
  listTeam(teamId: string) {
    return apiRequest<{ items: TeamSupplier[] }>(teamPath(teamId, "suppliers"))
  },
  createTeam(teamId: string, body: CreateTeamSupplierBody) {
    return apiRequest<{ item: TeamSupplier; replayed: boolean }>(
      teamPath(teamId, "suppliers"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  importTeam(teamId: string, body: ImportTeamSuppliersBody) {
    return apiRequest<TeamSupplierImportMutation>(teamPath(teamId, "suppliers/import"), {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  updateTeam(teamId: string, supplierId: string, body: UpdateTeamSupplierBody) {
    return apiRequest<TeamSupplier>(
      `${teamPath(teamId, "suppliers")}/${encodeURIComponent(supplierId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  deleteTeam(teamId: string, supplierId: string, expectedRevision: number) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "suppliers")}/${encodeURIComponent(supplierId)}`,
      { method: "DELETE", body: JSON.stringify({ expectedRevision }) },
    )
  },
}

export const assetApi = {
  list(teamId: string, archived = false, query?: string) {
    const search = new URLSearchParams()
    if (archived) search.set("archived", "1")
    if (query?.trim()) search.set("q", query.trim())
    const suffix = search.size ? `?${search.toString()}` : ""
    return apiRequest<{ items: TeamAsset[]; folders: AssetFolder[] }>(
      `${teamPath(teamId, "assets")}${suffix}`,
    )
  },
  semanticSearch(teamId: string, body: AssetSemanticSearchBody) {
    return apiRequest<AssetSemanticSearchResponse>(
      teamPath(teamId, "assets/semantic-search"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  createFolder(teamId: string, body: CreateAssetFolderBody) {
    return apiRequest<{ item: AssetFolder; replayed: boolean }>(
      teamPath(teamId, "asset-folders"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  updateFolder(teamId: string, folderId: string, body: UpdateAssetFolderBody) {
    return apiRequest<AssetFolder>(
      `${teamPath(teamId, "asset-folders")}/${encodeURIComponent(folderId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  createUploadIntent(teamId: string, body: CreateAssetUploadIntentBody) {
    return apiRequest<{
      item: TeamAsset
      replayed: boolean
      upload: AssetUploadInstruction | null
    }>(teamPath(teamId, "assets/upload-intents"), {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  async uploadFile(
    upload: AssetUploadInstruction,
    file: File,
    onProgress?: (percent: number) => void,
  ) {
    let completedParts = upload.uploadedParts.length
    onProgress?.(Math.round((completedParts / upload.totalParts) * 100))
    for (const part of [...upload.parts].sort(
      (left, right) => left.partNumber - right.partNumber,
    )) {
      const start = (part.partNumber - 1) * upload.partSizeBytes
      const body = file.slice(start, Math.min(start + upload.partSizeBytes, file.size))
      if (!body.size) {
        throw new ApiError(
          "ASSET_PART_MISMATCH",
          "本地文件与待恢复的上传任务不一致",
          409,
          false,
        )
      }
      const response = await fetch(part.url, {
        method: part.method,
        headers: part.headers,
        body,
      })
      if (!response.ok) {
        throw new ApiError(
          "OBJECT_UPLOAD_FAILED",
          "素材分片上传失败，正在保留进度以便重试",
          response.status,
          response.status >= 500,
        )
      }
      completedParts += 1
      onProgress?.(Math.round((completedParts / upload.totalParts) * 100))
    }
  },
  completeUpload(
    teamId: string,
    assetId: string,
    body: { expectedRevision: number; idempotencyKey: string },
  ) {
    return apiRequest<{ item: TeamAsset; replayed: boolean }>(
      `${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/complete`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  update(teamId: string, assetId: string, body: UpdateTeamAssetBody) {
    return apiRequest<TeamAsset>(
      `${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    )
  },
  getMediaAnalysis(teamId: string, assetId: string) {
    return apiRequest<MediaAnalysisResponse>(
      `${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/media-analysis`,
    )
  },
  createMediaAnalysis(teamId: string, assetId: string, body: CreateMediaAnalysisBody) {
    return apiRequest<{ job: MediaAnalysisJob; replayed: boolean }>(
      `${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/media-analysis`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  retryMediaAnalysis(
    teamId: string,
    assetId: string,
    jobId: string,
    body: UpdateMediaAnalysisBody,
  ) {
    return apiRequest<{ job: MediaAnalysisJob; replayed: boolean }>(
      `${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/media-analysis/${encodeURIComponent(jobId)}/retry`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  confirmMediaAnalysis(
    teamId: string,
    assetId: string,
    jobId: string,
    body: UpdateMediaAnalysisBody,
  ) {
    return apiRequest<{ job: MediaAnalysisJob; replayed: boolean }>(
      `${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/media-analysis/${encodeURIComponent(jobId)}/confirm`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  mediaAnalysisKeyframeUrl(
    teamId: string,
    assetId: string,
    jobId: string,
    shotId: string,
  ) {
    return `/api${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/media-analysis/${encodeURIComponent(jobId)}/shots/${encodeURIComponent(shotId)}/keyframe`
  },
  contentUrl(teamId: string, assetId: string) {
    return `/api${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/content`
  },
  previewUrl(teamId: string, assetId: string) {
    return `/api${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/preview`
  },
  getContentUrl(teamId: string, assetId: string) {
    return apiRequest<{ url: string }>(
      `${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/content-url`,
    )
  },
  getReviewContentUrl(teamId: string, assetId: string) {
    return playbackRequest<{ url: string }>(
      `${teamPath(teamId, "assets")}/${encodeURIComponent(assetId)}/review-content-url`,
    )
  },
}

export const portfolioApi = {
  list(teamId: string, archived = false) {
    return apiRequest<{ items: TeamPortfolio[] }>(
      `${teamPath(teamId, "portfolios")}${archived ? "?archived=1" : ""}`,
    )
  },
  listCandidates(teamId: string) {
    return apiRequest<{ items: ApprovedPortfolioCandidate[] }>(
      teamPath(teamId, "portfolio-candidates"),
    )
  },
  create(teamId: string, body: CreateTeamPortfolioBody) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      teamPath(teamId, "portfolios"),
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  addContent(teamId: string, portfolioId: string, body: AddPortfolioContentBody) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/items`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  publish(teamId: string, portfolioId: string, body: ChangePortfolioPublicationBody) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/publish`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  unpublish(teamId: string, portfolioId: string, body: ChangePortfolioPublicationBody) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/unpublish`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  archive(teamId: string, portfolioId: string, body: ChangePortfolioPublicationBody) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/archive`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  restore(teamId: string, portfolioId: string, body: ChangePortfolioPublicationBody) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/restore`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  permanentlyDelete(
    teamId: string,
    portfolioId: string,
    body: PermanentlyDeleteRecycleItemBody,
  ) {
    return apiRequest<{ id: string }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/permanent`,
      { method: "DELETE", body: JSON.stringify(body) },
    )
  },
  updateSettings(teamId: string, portfolioId: string, body: UpdatePortfolioSettingsBody) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/settings`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  bindDomain(teamId: string, portfolioId: string, body: BindPortfolioDomainBody) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/domain`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  verifyDomain(
    teamId: string,
    portfolioId: string,
    body: ChangePortfolioPublicationBody,
  ) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/domain/verify`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  unbindDomain(
    teamId: string,
    portfolioId: string,
    body: ChangePortfolioPublicationBody,
  ) {
    return apiRequest<{ item: TeamPortfolio; replayed: boolean }>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/domain/unbind`,
      { method: "POST", body: JSON.stringify(body) },
    )
  },
  analytics(teamId: string, portfolioId: string, days = 30) {
    return apiRequest<PortfolioAnalytics>(
      `${teamPath(teamId, "portfolios")}/${encodeURIComponent(portfolioId)}/analytics?days=${days}`,
    )
  },
}

export const publicPortfolioApi = {
  get(slug: string) {
    return apiRequest<PublicPortfolio>(`/portfolio/${encodeURIComponent(slug)}`)
  },
  getContentUrl(slug: string, contentId: string) {
    return playbackRequest<{ url: string }>(
      `/portfolio/${encodeURIComponent(slug)}/contents/${encodeURIComponent(contentId)}/content-url`,
    )
  },
  recordView(slug: string) {
    return apiRequest<{ recorded: true }>(
      `/portfolio/${encodeURIComponent(slug)}/views`,
      { method: "POST" },
    )
  },
}
