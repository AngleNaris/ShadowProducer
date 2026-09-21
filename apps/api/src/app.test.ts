import type {
  AgentCommandIntent,
  AgentCommandRepository,
  CreateCommentCommand,
  CreateDocumentCommand,
  CreateVersionCommand,
  ScriptRepository,
  ScriptWorkspaceData,
  UpdateCommentCommand,
  UpdateVersionCommand,
} from "@shadowproducer/application"
import { AgentCommandService, AppError, ScriptService } from "@shadowproducer/application"
import type {
  AnalysisJob,
  ApprovedPortfolioCandidate,
  AuditLog,
  BreakdownItem,
  CalendarEvent,
  CallSheet,
  CallSheetPublication,
  CreateScriptCommentResponse,
  CreateScriptDocumentResponse,
  CreateScriptVersionResponse,
  DeletedPersonalContact,
  ExecutionStage,
  MediaAnalysisJob,
  PersonalContact,
  ReviewComment,
  ReviewFile,
  ReviewLink,
  ShootingDay,
  TeamAsset,
  TeamContact,
  TeamPortfolio,
  TeamSupplier,
  UpdateScriptCommentResponse,
  UpdateScriptVersionResponse,
  WorkspaceNote,
  WorkspaceTask,
} from "@shadowproducer/contracts"
import { createScriptFixture } from "@shadowproducer/test-fixtures"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"
import type { ScriptRealtimeStore } from "./postgres-script-realtime-store"

class MemoryScriptRepository implements ScriptRepository {
  private readonly workspaces = new Map<string, ScriptWorkspaceData>()
  private readonly documentReceipts = new Map<
    string,
    { hash: string; response: CreateScriptDocumentResponse }
  >()
  private readonly updateReceipts = new Map<
    string,
    { hash: string; response: UpdateScriptVersionResponse }
  >()
  private readonly versionReceipts = new Map<
    string,
    { hash: string; response: CreateScriptVersionResponse }
  >()
  private readonly commentReceipts = new Map<
    string,
    { hash: string; response: CreateScriptCommentResponse }
  >()
  private readonly commentStateReceipts = new Map<
    string,
    { hash: string; response: UpdateScriptCommentResponse }
  >()

  constructor() {
    const fixture = createScriptFixture("winter-coffee", "冬夜咖啡")
    const workspace = {
      projectId: "winter-coffee",
      document: fixture.document,
      versions: fixture.versions.map((version) => ({
        ...version,
        updatedAt: "2026-08-27T10:20:00.000Z",
      })),
      comments: [],
      collaborators: [
        {
          id: "account-fanxing",
          displayName: "繁星",
          initials: "繁",
          role: "editor",
        },
      ],
    }
    this.workspaces.set(workspace.document.id, workspace)
  }

  get workspace() {
    return (
      [...this.workspaces.values()].find((item) => item.document.isDefault) ??
      [...this.workspaces.values()][0]
    )
  }

  async getProjectAccess(actorId: string, projectId: string) {
    if (projectId !== this.workspace.projectId) return null
    if (actorId === "account-fanxing") return { canRead: true, canWrite: true }
    if (actorId === "account-viewer") return { canRead: true, canWrite: false }
    return null
  }

  async listDocuments(projectId: string) {
    if (projectId !== this.workspace.projectId) return []
    return [...this.workspaces.values()].map((item) => structuredClone(item.document))
  }

  async getWorkspace(projectId: string, documentId?: string) {
    if (projectId !== this.workspace.projectId) return null
    const workspace = documentId ? this.workspaces.get(documentId) : this.workspace
    return workspace ? structuredClone(workspace) : null
  }

  async createDocument(command: CreateDocumentCommand) {
    const hash = JSON.stringify({ ...command, idempotencyKey: undefined })
    const receipt = this.documentReceipts.get(command.idempotencyKey)
    if (receipt && receipt.hash !== hash) {
      throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
    }
    if (receipt) return { ...receipt.response, replayed: true }
    const greatest = Math.max(
      ...[...this.workspaces.values()].flatMap((workspace) =>
        workspace.versions.map((item) =>
          Number.parseInt(/^v(\d+)$/.exec(item.id)?.[1] ?? "0", 10),
        ),
      ),
    )
    const document = {
      id: `document-${this.workspaces.size + 1}`,
      title: command.title,
      type: command.type ?? ("script" as const),
      currentVersionId: `v${greatest + 1}`,
      isDefault: false,
      createdAt: "2026-08-30T00:03:00.000Z",
    }
    this.workspaces.set(document.id, {
      projectId: command.projectId,
      document,
      versions: [
        {
          id: document.currentVersionId,
          meta: "初始版本",
          badge: "当前",
          content: "",
          revision: 1,
          isCurrent: true,
          updatedAt: document.createdAt,
        },
      ],
      comments: [],
      collaborators: structuredClone(this.workspace.collaborators),
    })
    const response = { document: structuredClone(document), replayed: false }
    this.documentReceipts.set(command.idempotencyKey, { hash, response })
    return response
  }

  private mutableWorkspace(documentId?: string) {
    return (documentId ? this.workspaces.get(documentId) : this.workspace) ?? null
  }

  async updateVersion(command: UpdateVersionCommand) {
    const hash = JSON.stringify({ ...command, idempotencyKey: undefined })
    const receipt = this.updateReceipts.get(command.idempotencyKey)
    if (receipt?.hash !== undefined && receipt.hash !== hash) {
      throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
    }
    if (receipt) return { ...receipt.response, replayed: true }
    const workspace = this.mutableWorkspace(command.documentId)
    if (!workspace) return null
    const version = workspace.versions.find(
      (candidate) => candidate.id === command.versionId && candidate.isCurrent,
    )
    if (!version || version.revision !== command.expectedRevision) return null
    version.content = command.content
    version.revision += 1
    version.updatedAt = "2026-08-27T10:21:00.000Z"
    const result = {
      documentId: workspace.document.id,
      version: structuredClone(version),
      replayed: false,
    }
    this.updateReceipts.set(command.idempotencyKey, { hash, response: result })
    return result
  }

  async createVersion(command: CreateVersionCommand) {
    const hash = JSON.stringify({ ...command, idempotencyKey: undefined })
    const receipt = this.versionReceipts.get(command.idempotencyKey)
    if (receipt?.hash !== undefined && receipt.hash !== hash) {
      throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
    }
    if (receipt) return { ...receipt.response, replayed: true }
    const workspace = this.mutableWorkspace(command.documentId)
    if (!workspace) return null
    const source = workspace.versions.find(
      (candidate) =>
        candidate.id === command.expectedVersionId &&
        candidate.isCurrent &&
        candidate.revision === command.expectedRevision,
    )
    if (!source) return null

    source.isCurrent = false
    source.badge = "历史"
    const greatest = Math.max(
      ...[...this.workspaces.values()]
        .flatMap((item) => item.versions)
        .map((item) => Number.parseInt(/^v(\d+)$/.exec(item.id)?.[1] ?? "0", 10)),
    )
    const version = {
      id: `v${greatest + 1}`,
      meta: command.meta.trim(),
      badge: "当前" as const,
      content: command.content,
      revision: 1,
      isCurrent: true,
      updatedAt: "2026-08-30T00:04:00.000Z",
    }
    workspace.versions.unshift(version)
    workspace.document.currentVersionId = version.id
    const result = {
      documentId: workspace.document.id,
      version: structuredClone(version),
      replayed: false,
    }
    this.versionReceipts.set(command.idempotencyKey, { hash, response: result })
    return result
  }

  async createComment(command: CreateCommentCommand) {
    const hash = JSON.stringify({ ...command, idempotencyKey: undefined })
    const receipt = this.commentReceipts.get(command.idempotencyKey)
    if (receipt && receipt.hash !== hash) {
      throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
    }
    if (receipt) return { ...receipt.response, replayed: true }
    const workspace = this.mutableWorkspace(command.documentId)
    if (!workspace?.versions.some((version) => version.id === command.versionId)) {
      return null
    }
    if (
      command.parentId &&
      !workspace.comments.some(
        (comment) =>
          comment.id === command.parentId &&
          comment.versionId === command.versionId &&
          comment.parentId === null,
      )
    ) {
      throw new AppError("COMMENT_PARENT_NOT_FOUND", "要回复的评论不存在", 404)
    }
    const comment = {
      id: `comment-${workspace.comments.length + 1}`,
      versionId: command.versionId,
      parentId: command.parentId ?? null,
      authorId: command.actorId,
      authorName: "繁星",
      title: "繁星 · 评论",
      text: command.text,
      excerpt: command.excerpt ?? "",
      createdAt: "2026-08-27T10:22:00.000Z",
      updatedAt: "2026-08-27T10:22:00.000Z",
      revision: 1,
      resolved: false,
    }
    workspace.comments.push(comment)
    const result = { documentId: workspace.document.id, comment, replayed: false }
    this.commentReceipts.set(command.idempotencyKey, { hash, response: result })
    return result
  }

  async updateComment(command: UpdateCommentCommand) {
    const receiptKey = `${command.commentId}:${command.idempotencyKey}`
    const hash = JSON.stringify({ ...command, idempotencyKey: undefined })
    const receipt = this.commentStateReceipts.get(receiptKey)
    if (receipt && receipt.hash !== hash) {
      throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
    }
    if (receipt) return { ...receipt.response, replayed: true }
    const workspace = this.mutableWorkspace(command.documentId)
    if (!workspace) throw new AppError("SCRIPT_DOCUMENT_NOT_FOUND", "脚本文档不存在", 404)
    const comment = workspace.comments.find(
      (candidate) => candidate.id === command.commentId && candidate.parentId === null,
    )
    if (!comment) throw new AppError("SCRIPT_COMMENT_NOT_FOUND", "评论不存在", 404)
    if (comment.revision !== command.expectedRevision) return null
    comment.resolved = command.resolved
    comment.revision += 1
    comment.updatedAt = "2026-08-27T10:23:00.000Z"
    const result = {
      documentId: workspace.document.id,
      comment: structuredClone(comment),
      replayed: false,
    }
    this.commentStateReceipts.set(receiptKey, { hash, response: result })
    return result
  }
}

class MemoryAgentCommandRepository implements AgentCommandRepository {
  readonly intents = new Map<string, AgentCommandIntent>()
  private readonly executionLocks = new Map<string, Promise<void>>()

  async create(intent: AgentCommandIntent) {
    this.intents.set(intent.id, intent)
  }

  async get(actorId: string, commandId: string) {
    const intent = this.intents.get(commandId)
    return intent?.actorId === actorId ? intent : null
  }

  async confirm(actorId: string, commandId: string) {
    const intent = await this.get(actorId, commandId)
    if (intent?.status !== "pending") return null
    intent.status = "confirmed"
    intent.confirmedAt = new Date("2026-08-30T00:01:00.000Z")
    return intent
  }

  async withExecutionLock<T>(
    actorId: string,
    commandId: string,
    callback: () => Promise<T>,
  ) {
    const key = `${actorId}:${commandId}`
    const previous = this.executionLocks.get(key) ?? Promise.resolve()
    let release = () => {}
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => current)
    this.executionLocks.set(key, tail)
    await previous
    try {
      return await callback()
    } finally {
      release()
      if (this.executionLocks.get(key) === tail) this.executionLocks.delete(key)
    }
  }

  async consume(
    actorId: string,
    commandId: string,
    result: AgentCommandIntent["result"],
  ) {
    const intent = await this.get(actorId, commandId)
    if (!intent || !result || intent.status === "consumed") return null
    intent.status = "consumed"
    intent.result = result
    intent.consumedAt = new Date("2026-08-30T00:02:00.000Z")
    return intent
  }
}

const agentTask: WorkspaceTask = {
  id: "task-agent-1",
  teamId: "north",
  projectId: "winter-coffee",
  projectName: "冬夜咖啡",
  title: "Agent 任务",
  dueDate: null,
  assigneeName: "繁星",
  status: "待开始",
  target: "tasks",
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentAuditLog: AuditLog = {
  id: "audit-agent-1",
  actorAccountId: "account-fanxing",
  actorName: "繁星",
  actorType: "agent",
  teamId: "north",
  projectId: "winter-coffee",
  projectName: "冬夜咖啡",
  action: "call-sheet.published",
  subjectId: "call-sheet-agent-1",
  metadata: { version: 1 },
  createdAt: "2026-08-30T00:03:00.000Z",
}

const agentBreakdownItem: BreakdownItem = {
  id: "breakdown-agent-prop-1",
  projectId: "winter-coffee",
  category: "道具",
  item: "深红色硬壳行李箱",
  requirementType: "画面道具",
  specification: "深红色，硬壳",
  quantity: "1 件",
  preparation: "拍摄前确认外观",
  department: "美术组",
  agentAssessment: "需要提前准备",
  sourceDocument: "冬夜咖啡_拍摄稿",
  sourceVersion: "v7",
  sourceLocation: "场 12",
  source: "冬夜咖啡_拍摄稿 · v7",
  excerpt: "顾遥拖着深红色硬壳行李箱",
  confidence: 96,
  state: "待确认",
  parentItemId: null,
  mergedIntoItemId: null,
  supplierIds: [],
  responsibleAccountId: null,
  responsibleName: null,
  taskIds: [],
  contactRefs: [],
  shootingDayIds: [],
  callSheetIds: [],
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentPortfolio: TeamPortfolio = {
  id: "portfolio-winter-coffee",
  teamId: "north",
  title: "冬夜咖啡",
  category: "商业短片",
  year: "2026",
  state: "待发布",
  description: "",
  themePreset: "editorial",
  seoTitle: "",
  seoDescription: "",
  customDomain: null,
  archived: false,
  revision: 1,
  publicSlug: null,
  publishedAt: null,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  contents: [],
}

const agentPortfolioCandidate: ApprovedPortfolioCandidate = {
  assetId: "asset-agent-main-v11",
  reviewFileId: "review-file-agent-1",
  projectId: "winter-coffee",
  projectName: "冬夜咖啡",
  title: "冬夜咖啡 · 主片",
  version: "v11",
  duration: "00:30",
  thumbnailUrl: null,
  downloadAvailable: true,
}

const agentAsset: TeamAsset = {
  id: "asset-agent-main-v11",
  teamId: "north",
  projectId: "winter-coffee",
  projectName: "冬夜咖啡",
  folderId: null,
  folderName: null,
  name: "冬夜咖啡_主片_v11.mp4",
  kind: "视频",
  mimeType: "video/mp4",
  sizeBytes: 12_000_000,
  checksumSha256: "agent-media-analysis-checksum",
  status: "ready",
  favorite: false,
  rating: 0,
  tags: [],
  note: "",
  ownerName: "繁星",
  thumbnailUrl: null,
  mediaStatus: "ready",
  mediaError: null,
  durationUs: 30_000_000,
  width: 1920,
  height: 1080,
  frameRateNumerator: 25,
  frameRateDenominator: 1,
  videoCodec: "h264",
  audioCodec: "aac",
  formatName: "mov,mp4",
  rotationDegrees: 0,
  variableFrameRate: false,
  reviewProxyReady: true,
  searchMatches: [],
  archived: false,
  revision: 1,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentContact: TeamContact = {
  id: "contact-agent-linqiao",
  source: "member-shared",
  ownerName: "林乔",
  name: "林乔",
  role: "制片主任",
  company: "冬夜咖啡剧组",
  phone: null,
  email: null,
  sharedFields: ["name", "role", "company"],
  projectIds: ["winter-coffee"],
  allowProjectLink: true,
  editable: false,
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentPersonalContact: PersonalContact = {
  id: "personal-contact-agent-guyao",
  name: "顾遥",
  role: "执行制片",
  company: "自由制片",
  phone: "13800000000",
  email: "guyao@example.com",
  shares: [],
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentSupplier: TeamSupplier = {
  id: "supplier-agent-lighting",
  teamId: "north",
  name: "北岸灯光器材",
  category: "灯光设备",
  services: "冬夜咖啡现场灯光与供电",
  phone: "021-00000000",
  email: "lighting@example.com",
  address: "上海",
  contactRefs: [
    { contactId: agentContact.id, source: agentContact.source },
    { contactId: "contact-private", source: "member-shared" },
  ],
  projectIds: ["winter-coffee"],
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentNote: WorkspaceNote = {
  id: "note-agent-1",
  teamId: "north",
  projectId: "winter-coffee",
  projectName: "冬夜咖啡",
  title: "Agent 笔记",
  body: "",
  kind: "note",
  pinned: false,
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentCalendarEvent: CalendarEvent = {
  id: "calendar-agent-1",
  teamId: "north",
  projectId: "winter-coffee",
  projectName: "冬夜咖啡",
  title: "Agent 日程",
  startsAt: "2026-08-31T07:00:00.000Z",
  endsAt: "2026-08-31T08:00:00.000Z",
  timezone: "Asia/Shanghai",
  allDay: false,
  visibility: "private",
  target: "calendar",
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentCallSheet: CallSheet = {
  id: "call-sheet-agent-1",
  projectId: "winter-coffee",
  shootingDayId: null,
  date: "8 月 31 日",
  day: "待定",
  title: "车站补拍通告",
  status: "待确认",
  crewCall: "待定",
  firstShot: "待定",
  wrap: "待定",
  weather: "待更新",
  sunrise: "待更新",
  sunset: "待更新",
  basecamp: "待安排",
  location: "待安排",
  hospital: "待更新",
  scenes: [],
  cast: [],
  departments: [],
  equipment: [],
  safety: [],
  transport: [],
  catering: [],
  keyContacts: [],
  nextDayPreview: { date: "", title: "", scenes: "", cast: "", note: "" },
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentExecutionStage: ExecutionStage = {
  id: "execution-stage-agent-1",
  projectId: "winter-coffee",
  name: "车站补拍",
  startsAt: "2026-09-02T08:30:00.000Z",
  endsAt: "2026-09-02T18:00:00.000Z",
  originalTimezone: "Asia/Shanghai",
  progress: 0,
  owner: "顾遥",
  state: "未开始",
  note: "",
  resources: [{ id: "old-north-station", type: "location", name: "旧北站" }],
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentShootingDay: ShootingDay = {
  id: "shooting-day-agent-1",
  projectId: "winter-coffee",
  shootDate: "2026-09-05",
  dayNumber: 92,
  title: "P1 Agent 拍摄日",
  status: "草稿",
  originalTimezone: "Asia/Shanghai",
  revision: 1,
  updatedAt: "2026-08-30T00:00:00.000Z",
}

const agentCallSheetPublication: CallSheetPublication = {
  id: "call-sheet-publication-agent-1",
  callSheetId: agentCallSheet.id,
  version: 1,
  snapshot: { ...agentCallSheet, status: "已发布", revision: 2 },
  publishedBy: "繁星",
  publishedAt: "2026-08-30T00:03:00.000Z",
  recipients: [],
}

const agentReviewFile: ReviewFile = {
  id: "review-file-agent-1",
  projectId: "winter-coffee",
  assetId: null,
  folderId: null,
  name: "主片 v11",
  version: "v11",
  type: "video",
  status: "审阅中",
  comments: 2,
  updated: "今天 10:20",
  duration: "00:30",
  approvedBy: null,
  approvedAt: null,
  mediaReady: true,
  revision: 1,
}

const agentReviewComment: ReviewComment = {
  id: "review-comment-agent-1",
  fileId: agentReviewFile.id,
  parentCommentId: null,
  version: agentReviewFile.version,
  author: "繁星",
  authorId: "account-fanxing",
  initials: "繁",
  timecode: "00:07.120",
  text: "开场站台空镜再留 8 帧",
  state: "open",
  revision: 1,
  createdAt: "2026-08-30T00:00:00.000Z",
}

const agentReviewLink: ReviewLink = {
  id: "review-link-agent-1",
  projectId: "winter-coffee",
  fileIds: [agentReviewFile.id],
  scope: {
    canComment: true,
    canCompare: true,
    canDownload: false,
    canApprove: true,
  },
  expiresAt: "2026-09-06T00:00:00.000Z",
  revokedAt: null,
  createdAt: "2026-08-30T00:02:00.000Z",
  url: "http://127.0.0.1:3211/#/review/agent-review-token",
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

async function createTestApp(
  options: {
    tasks?: WorkspaceTask[]
    notes?: WorkspaceNote[]
    calendarEvents?: CalendarEvent[]
    portfolios?: TeamPortfolio[]
    portfolioCandidates?: ApprovedPortfolioCandidate[]
    breakdownItems?: BreakdownItem[]
    executionStages?: ExecutionStage[]
    shootingDays?: ShootingDay[]
    callSheets?: CallSheet[]
    reviewFiles?: ReviewFile[]
    reviewComments?: ReviewComment[]
    auditLogs?: AuditLog[]
    assets?: TeamAsset[]
    contacts?: TeamContact[]
    personalContacts?: PersonalContact[]
    deletedPersonalContacts?: DeletedPersonalContact[]
    suppliers?: TeamSupplier[]
    scriptRealtimeStore?: ScriptRealtimeStore
  } = {},
) {
  const repository = new MemoryScriptRepository()
  const scriptService = new ScriptService(repository)
  const agentRepository = new MemoryAgentCommandRepository()
  const tasks = structuredClone(options.tasks ?? [agentTask])
  const notes = structuredClone(options.notes ?? [agentNote])
  const calendarEvents = structuredClone(options.calendarEvents ?? [agentCalendarEvent])
  const portfolios = structuredClone(options.portfolios ?? [agentPortfolio])
  const portfolioCandidates = structuredClone(
    options.portfolioCandidates ?? [agentPortfolioCandidate],
  )
  const breakdownItems = structuredClone(options.breakdownItems ?? [agentBreakdownItem])
  const executionStages = structuredClone(
    options.executionStages ?? [agentExecutionStage],
  )
  const shootingDays = structuredClone(options.shootingDays ?? [agentShootingDay])
  const callSheets = structuredClone(options.callSheets ?? [agentCallSheet])
  const reviewComments = structuredClone(options.reviewComments ?? [agentReviewComment])
  const reviewFiles = structuredClone(options.reviewFiles ?? [agentReviewFile])
  const auditLogs = structuredClone(options.auditLogs ?? [agentAuditLog])
  const assets = structuredClone(options.assets ?? [agentAsset])
  const contacts = structuredClone(options.contacts ?? [agentContact])
  const personalContacts = structuredClone(
    options.personalContacts ?? [agentPersonalContact],
  )
  const deletedPersonalContacts = structuredClone(options.deletedPersonalContacts ?? [])
  const suppliers = structuredClone(options.suppliers ?? [agentSupplier])
  let auditReadAllowed = true
  let auditReads = 0
  let taskWrites = 0
  let taskUpdates = 0
  let noteWrites = 0
  let noteUpdates = 0
  let calendarWrites = 0
  let calendarUpdates = 0
  let portfolioWrites = 0
  let portfolioCreates = 0
  let portfolioContentAdds = 0
  let callSheetCreates = 0
  let callSheetUpdates = 0
  let callSheetPublishes = 0
  let executionStageCreates = 0
  let executionStageUpdates = 0
  let shootingDayCreates = 0
  let shootingDayUpdates = 0
  let breakdownUpdates = 0
  let breakdownConfirms = 0
  let reviewCommentCreates = 0
  let reviewCommentUpdates = 0
  let reviewFileCreates = 0
  let reviewFileApprovals = 0
  let reviewLinkCreates = 0
  let analysisJobCreates = 0
  let mediaAnalysisCreates = 0
  let semanticSearches = 0
  let teamContactCreates = 0
  let teamSupplierCreates = 0
  const app = await buildApp({
    scriptService,
    scriptRealtimeStore: options.scriptRealtimeStore,
    agentService: new AgentCommandService(
      agentRepository,
      {
        async getContext(actorId) {
          return {
            actor: { id: actorId, displayName: "繁星" },
            teams: [
              {
                id: "north",
                name: "北岸影像",
                role: "owner",
                memberCount: 4,
                projects: [
                  {
                    id: "winter-coffee",
                    name: "冬夜咖啡",
                    role: "producer",
                    status: "拍摄中",
                    updatedAt: "2026-08-30T00:00:00.000Z",
                  },
                ],
              },
            ],
          }
        },
        async listAuditLogs(_actorId, teamId, query) {
          if (!auditReadAllowed) {
            throw new AppError("TEAM_READ_DENIED", "当前成员无权读取团队审计", 403)
          }
          if (query.projectId && query.scope === "team") {
            throw new AppError(
              "AUDIT_FILTER_INVALID",
              "团队范围与项目筛选不能同时使用",
              400,
            )
          }
          if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
            throw new AppError(
              "AUDIT_DATE_RANGE_INVALID",
              "审计结束时间不能早于开始时间",
              400,
            )
          }
          auditReads += 1
          const page = query.page ?? 1
          const pageSize = query.pageSize ?? 25
          const normalizedAction = query.action?.toLocaleLowerCase()
          const normalizedActor = query.actor?.toLocaleLowerCase()
          const filtered = auditLogs.filter(
            (item) =>
              item.teamId === teamId &&
              (!query.projectId || item.projectId === query.projectId) &&
              (query.scope !== "team" || item.projectId === null) &&
              (!normalizedAction ||
                item.action.toLocaleLowerCase().includes(normalizedAction)) &&
              (!normalizedActor ||
                item.actorName.toLocaleLowerCase().includes(normalizedActor) ||
                item.actorAccountId?.toLocaleLowerCase().includes(normalizedActor)) &&
              (!query.from || new Date(item.createdAt) >= new Date(query.from)) &&
              (!query.to || new Date(item.createdAt) <= new Date(query.to)),
          )
          return {
            items: structuredClone(
              filtered.slice((page - 1) * pageSize, page * pageSize),
            ),
            total: filtered.length,
            page,
            pageSize,
          }
        },
        async listTasks() {
          return { items: structuredClone(tasks) }
        },
        async createTask(command) {
          taskWrites += 1
          return {
            item: { ...agentTask, title: command.title },
            replayed: false,
          }
        },
        async updateTask(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("TEAM_WRITE_DENIED", "当前成员无权修改任务", 403)
          }
          const task = tasks.find(
            (candidate) =>
              candidate.id === command.itemId && candidate.teamId === command.teamId,
          )
          if (!task || task.revision !== command.expectedRevision) {
            throw new AppError("RESOURCE_CONFLICT", "任务已变化", 409)
          }
          taskUpdates += 1
          Object.assign(task, {
            title: command.title ?? task.title,
            dueDate: command.dueDate === undefined ? task.dueDate : command.dueDate,
            status: command.status ?? task.status,
            target: command.target ?? task.target,
            revision: task.revision + 1,
            updatedAt: "2026-08-30T00:04:00.000Z",
          })
          return structuredClone(task)
        },
        async listNotes() {
          return { items: structuredClone(notes) }
        },
        async createNote(command) {
          noteWrites += 1
          return {
            item: {
              ...agentNote,
              projectId: command.projectId ?? null,
              projectName: command.projectId ? "冬夜咖啡" : null,
              title: command.title,
              body: command.body ?? "",
              kind: command.kind,
            },
            replayed: false,
          }
        },
        async updateNote(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("TEAM_WRITE_DENIED", "当前成员无权修改笔记", 403)
          }
          const note = notes.find(
            (candidate) =>
              candidate.id === command.itemId && candidate.teamId === command.teamId,
          )
          if (!note || note.revision !== command.expectedRevision) {
            throw new AppError("RESOURCE_CONFLICT", "笔记已变化", 409)
          }
          noteUpdates += 1
          Object.assign(note, {
            title: command.title ?? note.title,
            body: command.body ?? note.body,
            pinned: command.pinned ?? note.pinned,
            revision: note.revision + 1,
            updatedAt: "2026-08-30T00:04:00.000Z",
          })
          return structuredClone(note)
        },
        async listCalendarEvents() {
          return { items: structuredClone(calendarEvents) }
        },
        async createCalendarEvent(command) {
          calendarWrites += 1
          return {
            item: {
              ...agentCalendarEvent,
              projectId: command.projectId ?? null,
              projectName: command.projectId ? "冬夜咖啡" : null,
              title: command.title,
              startsAt: command.startsAt,
              endsAt: command.endsAt ?? null,
              timezone: command.timezone,
              allDay: command.allDay ?? false,
              visibility: command.visibility ?? "private",
            },
            replayed: false,
          }
        },
        async updateCalendarEvent(command) {
          const event = calendarEvents.find(
            (candidate) =>
              candidate.id === command.itemId && candidate.teamId === command.teamId,
          )
          if (!event || event.revision !== command.expectedRevision) {
            throw new AppError("CALENDAR_EVENT_CONFLICT", "日程已变化", 409)
          }
          calendarUpdates += 1
          Object.assign(event, {
            startsAt: command.startsAt ?? event.startsAt,
            endsAt: command.endsAt === undefined ? event.endsAt : command.endsAt,
            timezone: command.timezone ?? event.timezone,
            allDay: command.allDay ?? event.allDay,
            revision: event.revision + 1,
            updatedAt: "2026-08-30T00:04:00.000Z",
          })
          return structuredClone(event)
        },
      },
      {
        async listPortfolios() {
          return { items: structuredClone(portfolios) }
        },
        async listApprovedCandidates() {
          return { items: structuredClone(portfolioCandidates) }
        },
        async createPortfolio(command) {
          portfolioCreates += 1
          return {
            item: {
              ...agentPortfolio,
              id: "portfolio-agent-created",
              title: command.title,
              category: command.category,
              year: command.year,
              description: command.description,
              state: "团队可见" as const,
            },
            replayed: false,
          }
        },
        async addContent(command) {
          const portfolio = portfolios.find((item) => item.id === command.portfolioId)
          const candidate = portfolioCandidates.find(
            (item) =>
              item.assetId === command.assetId &&
              item.reviewFileId === command.reviewFileId,
          )
          if (!portfolio || !candidate) throw new Error("Missing portfolio candidate")
          portfolioContentAdds += 1
          return {
            item: {
              ...portfolio,
              revision: portfolio.revision + 1,
              contents: [
                ...portfolio.contents,
                {
                  id: "portfolio-content-agent-1",
                  portfolioId: portfolio.id,
                  assetId: candidate.assetId,
                  reviewFileId: candidate.reviewFileId,
                  projectId: candidate.projectId,
                  projectName: candidate.projectName,
                  title: candidate.title,
                  kind: "主片" as const,
                  caption: command.caption,
                  version: candidate.version,
                  duration: candidate.duration,
                  featured: command.featured,
                  sortOrder: portfolio.contents.length,
                  thumbnailUrl: candidate.thumbnailUrl,
                  downloadAvailable: candidate.downloadAvailable,
                  createdAt: "2026-08-30T00:05:00.000Z",
                  updatedAt: "2026-08-30T00:05:00.000Z",
                },
              ],
            },
            replayed: false,
          }
        },
        async publishPortfolio() {
          portfolioWrites += 1
          return {
            item: {
              ...agentPortfolio,
              state: "已公开" as const,
              publicSlug: "winter-coffee-public",
              publishedAt: "2026-08-30T00:03:00.000Z",
              revision: 2,
            },
            replayed: false,
          }
        },
      },
      {
        async listBreakdown() {
          return { items: structuredClone(breakdownItems) }
        },
        async updateBreakdown(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          if (command.state === "已确认") {
            throw new AppError(
              "BREAKDOWN_CONFIRMATION_REQUIRED",
              "拆解项必须通过正式确认流程确认",
              409,
            )
          }
          const item = breakdownItems.find(
            (candidate) =>
              candidate.id === command.itemId &&
              candidate.projectId === command.projectId &&
              candidate.revision === command.expectedRevision,
          )
          if (!item) throw new AppError("RESOURCE_CONFLICT", "拆解项已变化", 409)
          breakdownUpdates += 1
          Object.assign(item, {
            item: command.item ?? item.item,
            requirementType: command.requirementType ?? item.requirementType,
            specification: command.specification ?? item.specification,
            quantity: command.quantity ?? item.quantity,
            preparation: command.preparation ?? item.preparation,
            department: command.department ?? item.department,
            state: command.state ?? item.state,
            supplierIds: command.supplierIds ?? item.supplierIds,
            responsibleAccountId:
              command.responsibleAccountId === undefined
                ? item.responsibleAccountId
                : command.responsibleAccountId,
            responsibleName:
              command.responsibleAccountId === undefined
                ? item.responsibleName
                : command.responsibleAccountId
                  ? "繁星"
                  : null,
            taskIds: command.taskIds ?? item.taskIds,
            contactRefs: command.contactRefs ?? item.contactRefs,
            shootingDayIds: command.shootingDayIds ?? item.shootingDayIds,
            callSheetIds: command.callSheetIds ?? item.callSheetIds,
            revision: item.revision + 1,
            updatedAt: "2026-08-30T00:04:00.000Z",
          })
          return structuredClone(item)
        },
        async confirmBreakdown(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          const selected = command.items.map(({ itemId, expectedRevision }) => {
            const item = breakdownItems.find(
              (candidate) =>
                candidate.id === itemId &&
                candidate.category === command.category &&
                candidate.state === "待确认" &&
                candidate.revision === expectedRevision,
            )
            if (!item) throw new AppError("RESOURCE_CONFLICT", "拆解项已变化", 409)
            return item
          })
          breakdownConfirms += 1
          for (const item of selected) {
            item.state = "已确认"
            item.revision += 1
          }
          return { items: structuredClone(selected), replayed: false }
        },
        async listExecutionSchedule() {
          return { items: structuredClone(executionStages), conflicts: [] }
        },
        async createExecutionStage(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          executionStageCreates += 1
          return {
            item: {
              ...agentExecutionStage,
              name: command.name,
              startsAt: command.startsAt,
              endsAt: command.endsAt,
              originalTimezone: command.originalTimezone,
              progress: command.progress,
              owner: command.owner,
              state: command.state,
              note: command.note,
              resources: command.resources,
            },
            replayed: false,
          }
        },
        async updateExecutionStage(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          const item = executionStages.find(
            (candidate) =>
              candidate.id === command.itemId &&
              candidate.projectId === command.projectId &&
              candidate.revision === command.expectedRevision,
          )
          if (!item) throw new AppError("RESOURCE_CONFLICT", "执行计划已变化", 409)
          executionStageUpdates += 1
          Object.assign(item, {
            name: command.name ?? item.name,
            startsAt: command.startsAt ?? item.startsAt,
            endsAt: command.endsAt ?? item.endsAt,
            originalTimezone: command.originalTimezone ?? item.originalTimezone,
            progress: command.progress ?? item.progress,
            owner: command.owner ?? item.owner,
            state: command.state ?? item.state,
            note: command.note ?? item.note,
            resources: command.resources ?? item.resources,
            revision: item.revision + 1,
            updatedAt: "2026-08-30T00:06:00.000Z",
          })
          return structuredClone(item)
        },
        async listShootingDays() {
          return { items: structuredClone(shootingDays) }
        },
        async createShootingDay(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          shootingDayCreates += 1
          const item: ShootingDay = {
            id: `shooting-day-agent-${shootingDays.length + 1}`,
            projectId: command.projectId,
            shootDate: command.shootDate,
            dayNumber: command.dayNumber,
            title: command.title,
            status: "草稿",
            originalTimezone: command.originalTimezone,
            revision: 1,
            updatedAt: "2026-08-30T00:06:00.000Z",
          }
          shootingDays.push(item)
          return { item: structuredClone(item), replayed: false }
        },
        async updateShootingDay(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          const item = shootingDays.find(
            (candidate) =>
              candidate.id === command.itemId &&
              candidate.projectId === command.projectId &&
              candidate.revision === command.expectedRevision,
          )
          if (!item) throw new AppError("RESOURCE_CONFLICT", "拍摄日已变化", 409)
          shootingDayUpdates += 1
          Object.assign(item, {
            shootDate: command.shootDate ?? item.shootDate,
            dayNumber: command.dayNumber ?? item.dayNumber,
            title: command.title ?? item.title,
            status: command.status ?? item.status,
            originalTimezone: command.originalTimezone ?? item.originalTimezone,
            revision: item.revision + 1,
            updatedAt: "2026-08-30T00:07:00.000Z",
          })
          return structuredClone(item)
        },
        async listCallSheets() {
          return { items: structuredClone(callSheets) }
        },
        async createCallSheet(command) {
          callSheetCreates += 1
          return {
            item: {
              ...agentCallSheet,
              date: command.date ?? agentCallSheet.date,
              title: command.title ?? agentCallSheet.title,
            },
            replayed: false,
          }
        },
        async updateCallSheet(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          const item = callSheets.find(
            (candidate) =>
              candidate.id === command.itemId &&
              candidate.projectId === command.projectId &&
              candidate.revision === command.expectedRevision,
          )
          if (!item) throw new AppError("RESOURCE_CONFLICT", "通告表已变化", 409)
          callSheetUpdates += 1
          Object.assign(item, {
            date: command.date ?? item.date,
            day: command.day ?? item.day,
            title: command.title ?? item.title,
            status: command.status ?? item.status,
            crewCall: command.crewCall ?? item.crewCall,
            firstShot: command.firstShot ?? item.firstShot,
            wrap: command.wrap ?? item.wrap,
            weather: command.weather ?? item.weather,
            sunrise: command.sunrise ?? item.sunrise,
            sunset: command.sunset ?? item.sunset,
            basecamp: command.basecamp ?? item.basecamp,
            location: command.location ?? item.location,
            hospital: command.hospital ?? item.hospital,
            scenes: command.scenes ?? item.scenes,
            cast: command.cast ?? item.cast,
            departments: command.departments ?? item.departments,
            equipment: command.equipment ?? item.equipment,
            safety: command.safety ?? item.safety,
            transport: command.transport ?? item.transport,
            catering: command.catering ?? item.catering,
            keyContacts: command.keyContacts ?? item.keyContacts,
            nextDayPreview: command.nextDayPreview ?? item.nextDayPreview,
            revision: item.revision + 1,
            updatedAt: "2026-08-30T00:08:00.000Z",
          })
          return structuredClone(item)
        },
        async publishCallSheet() {
          callSheetPublishes += 1
          return {
            item: agentCallSheetPublication.snapshot,
            publication: agentCallSheetPublication,
            replayed: false,
          }
        },
        async listReviewFiles() {
          return { items: structuredClone(reviewFiles), folders: [] }
        },
        async createReviewFile(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          reviewFileCreates += 1
          const item: ReviewFile = {
            id: `review-file-agent-${reviewFiles.length + 1}`,
            projectId: command.projectId,
            assetId: command.assetId,
            folderId: command.folderId ?? null,
            name: command.name,
            version: command.version,
            type: "video",
            status: "待审阅",
            comments: 0,
            updated: "刚刚",
            duration: command.duration ?? null,
            approvedBy: null,
            approvedAt: null,
            mediaReady: true,
            revision: 1,
          }
          reviewFiles.push(item)
          return { item: structuredClone(item), replayed: false }
        },
        async createReviewComment(command) {
          reviewCommentCreates += 1
          return {
            item: {
              ...agentReviewComment,
              fileId: command.fileId,
              version: command.version,
              timecode: command.timecode,
              text: command.text,
            },
            replayed: false,
          }
        },
        async listReviewComments(_actorId, _projectId, fileId) {
          return {
            items: structuredClone(
              reviewComments.filter((item) => item.fileId === fileId),
            ),
          }
        },
        async listReviewCommentCorrespondence(
          _actorId,
          _projectId,
          primaryFileId,
          compareFileId,
        ) {
          const primary = reviewComments.find((item) => item.fileId === primaryFileId)
          const compare = reviewComments.find((item) => item.fileId === compareFileId)
          return {
            primaryFileId,
            compareFileId,
            links: [],
            suggestions:
              primary && compare
                ? [
                    {
                      commentId: primary.id,
                      counterpartCommentId: compare.id,
                      score: 0.92,
                      timeDifferenceSeconds: 1,
                    },
                  ]
                : [],
          }
        },
        async updateReviewComment(command) {
          const comment = reviewComments.find(
            (item) =>
              item.id === command.commentId && item.revision === command.expectedRevision,
          )
          if (!comment) throw new AppError("RESOURCE_CONFLICT", "审片意见已变化", 409)
          reviewCommentUpdates += 1
          Object.assign(comment, {
            state: command.state,
            revision: comment.revision + 1,
          })
          return structuredClone(comment)
        },
        async approveReviewFile(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          const file = reviewFiles.find(
            (item) =>
              item.id === command.fileId &&
              item.projectId === command.projectId &&
              item.revision === command.expectedRevision &&
              item.type === "video" &&
              item.status !== "处理中" &&
              item.status !== "已通过",
          )
          if (!file) {
            throw new AppError(
              "REVIEW_FILE_APPROVAL_INVALID",
              "当前审片文件不能批准，请确认它是可审阅的视频版本",
              409,
            )
          }
          reviewFileApprovals += 1
          Object.assign(file, {
            status: "已通过" as const,
            approvedBy: "繁星",
            approvedAt: "2026-08-30T00:04:00.000Z",
            revision: file.revision + 1,
          })
          return { item: structuredClone(file), replayed: false }
        },
      },
      {
        async createLink(command) {
          if (command.actorId !== "account-fanxing") {
            throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
          }
          const files = command.fileIds.filter((fileId) =>
            reviewFiles.some(
              (item) => item.id === fileId && item.type === "video" && item.mediaReady,
            ),
          )
          if (files.length !== command.fileIds.length) {
            throw new AppError(
              "REVIEW_LINK_FILES_INVALID",
              "只能分享当前项目中的视频审片版本",
              409,
            )
          }
          reviewLinkCreates += 1
          return {
            item: {
              ...agentReviewLink,
              fileIds: command.fileIds,
              scope: command.scope,
              expiresAt: command.expiresAt,
            },
            replayed: false,
          }
        },
      },
      scriptService,
      {
        async createScriptBreakdown(actorId, projectId, body) {
          const workspace = await scriptService.getWorkspace(
            actorId,
            projectId,
            body.documentId,
          )
          const version = workspace.versions.find(
            (item) => item.id === body.versionId && item.revision === body.sourceRevision,
          )
          if (!version) {
            throw new AppError(
              "ANALYSIS_SOURCE_CONFLICT",
              "脚本版本已发生变化，请重新选择分析来源",
              409,
            )
          }
          analysisJobCreates += 1
          const now = "2026-08-30T00:00:00.000Z"
          const job = {
            id: `analysis-agent-${analysisJobCreates}`,
            projectId,
            kind: "script_breakdown",
            tool: "deterministic_rules_v1",
            triggerKind: "manual",
            approvalPolicy: "manual_confirmation",
            approvalThreshold: 90,
            status: "queued",
            triggeredByAccountId: actorId,
            sourceDocumentId: workspace.document.id,
            sourceDocumentTitle: workspace.document.title,
            sourceVersionId: version.id,
            sourceVersionMeta: version.meta,
            sourceRevision: version.revision,
            attempts: 0,
            maxAttempts: 3,
            candidateCount: 0,
            failureStage: null,
            lastError: null,
            revision: 1,
            createdAt: now,
            updatedAt: now,
            processedAt: null,
            completedAt: null,
            cancelledAt: null,
          } satisfies AnalysisJob
          return { job, replayed: false }
        },
      },
      {
        async listAssets(actorId, teamId) {
          if (!actorId || teamId !== "north") {
            throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队资源库", 403)
          }
          return { items: structuredClone(assets), folders: [] }
        },
        async semanticSearchText(query) {
          if (query.actorId !== "account-fanxing" || query.teamId !== "north") {
            throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队资源库", 403)
          }
          semanticSearches += 1
          return assets.slice(0, query.limit ?? 20).map((item) => ({
            item: structuredClone(item),
            score: 0.87,
            source: "vision" as const,
            excerpt: query.query,
            provider: "compatible-api",
            model: "test-embedding",
            sequence: 1,
            timecodeUs: 5_000_000,
          }))
        },
        async createMediaAnalysis(actorId, teamId, assetId, body) {
          if (actorId !== "account-fanxing" || teamId !== "north") {
            throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队资源库", 403)
          }
          const asset = assets.find(
            (item) =>
              item.id === assetId &&
              !item.archived &&
              item.revision === body.expectedRevision,
          )
          if (!asset) {
            throw new AppError("RESOURCE_CONFLICT", "素材已在其他位置更新", 409)
          }
          mediaAnalysisCreates += 1
          const now = "2026-08-30T00:00:00.000Z"
          const job = {
            id: `media-analysis-agent-${mediaAnalysisCreates}`,
            teamId,
            assetId,
            kind: "shot_detection",
            tool: "ffmpeg_scene_v1",
            provider: null,
            triggerKind: "manual",
            status: "queued",
            triggeredByAccountId: actorId,
            sourceAssetName: asset.name,
            sourceChecksumSha256: asset.checksumSha256 ?? "",
            sourceRevision: asset.revision,
            requestedTimecodeUs: null,
            attempts: 0,
            maxAttempts: 3,
            shotCount: 0,
            resultText: "",
            segments: [],
            runtimeVersion: null,
            modelName: null,
            modelSha256: null,
            language: null,
            failureStage: null,
            lastError: null,
            revision: 1,
            shots: [],
            createdAt: now,
            updatedAt: now,
            processedAt: null,
            completedAt: null,
          } satisfies MediaAnalysisJob
          return { job, replayed: false }
        },
      },
      {
        async listPersonalContacts(actorId) {
          return {
            items: actorId === "account-fanxing" ? structuredClone(personalContacts) : [],
          }
        },
        async listDeletedPersonalContacts(actorId) {
          return {
            items:
              actorId === "account-fanxing"
                ? structuredClone(deletedPersonalContacts)
                : [],
          }
        },
        async createPersonalContact(command) {
          const item: PersonalContact = {
            id: `personal-contact-agent-${personalContacts.length + 1}`,
            name: command.name.trim(),
            role: command.role?.trim() ?? "",
            company: command.company?.trim() ?? "",
            phone: command.phone?.trim() ?? "",
            email: command.email?.trim() ?? "",
            shares: [],
            revision: 1,
            updatedAt: "2026-08-30T00:09:00.000Z",
          }
          personalContacts.unshift(item)
          return { item: structuredClone(item), replayed: false }
        },
        async updatePersonalContact(command) {
          const item = personalContacts.find(
            (candidate) =>
              candidate.id === command.contactId &&
              candidate.revision === command.expectedRevision,
          )
          if (!item) throw new AppError("RESOURCE_CONFLICT", "联系人已变化", 409)
          Object.assign(item, {
            name: command.name ?? item.name,
            role: command.role ?? item.role,
            company: command.company ?? item.company,
            phone: command.phone ?? item.phone,
            email: command.email ?? item.email,
            revision: item.revision + 1,
          })
          return structuredClone(item)
        },
        async setContactShare(command) {
          const item = personalContacts.find(
            (candidate) =>
              candidate.id === command.contactId &&
              candidate.revision === command.expectedRevision,
          )
          if (!item) throw new AppError("RESOURCE_CONFLICT", "联系人已变化", 409)
          item.shares = [
            ...item.shares.filter((share) => share.teamId !== command.teamId),
            {
              teamId: command.teamId,
              teamName: "北岸影像",
              fields: command.fields,
              allowProjectLink: command.allowProjectLink ?? true,
              revision: 1,
              updatedAt: "2026-08-30T00:10:00.000Z",
            },
          ]
          item.revision += 1
          return structuredClone(item)
        },
        async deleteContactShare(command) {
          const item = personalContacts.find(
            (candidate) =>
              candidate.id === command.contactId &&
              candidate.revision === command.expectedRevision,
          )
          if (!item) throw new AppError("RESOURCE_CONFLICT", "联系人已变化", 409)
          item.shares = item.shares.filter((share) => share.teamId !== command.teamId)
          item.revision += 1
          return structuredClone(item)
        },
        async deletePersonalContact(command) {
          const index = personalContacts.findIndex(
            (candidate) =>
              candidate.id === command.contactId &&
              candidate.revision === command.expectedRevision,
          )
          if (index < 0) throw new AppError("RESOURCE_CONFLICT", "联系人已变化", 409)
          const [item] = personalContacts.splice(index, 1)
          deletedPersonalContacts.unshift({
            ...item,
            deletedAt: "2026-08-30T00:11:00.000Z",
          })
          return { id: item.id }
        },
        async restorePersonalContact(command) {
          const index = deletedPersonalContacts.findIndex(
            (candidate) =>
              candidate.id === command.contactId &&
              candidate.revision === command.expectedRevision,
          )
          if (index < 0) throw new AppError("RESOURCE_CONFLICT", "联系人已变化", 409)
          const [deleted] = deletedPersonalContacts.splice(index, 1)
          const { deletedAt: _deletedAt, ...item } = deleted
          item.revision += 1
          personalContacts.unshift(item)
          return structuredClone(item)
        },
        async listTeamContacts(actorId, teamId) {
          if (!actorId || teamId !== "north") {
            throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队联系人", 403)
          }
          return { items: structuredClone(contacts) }
        },
        async createTeamContact(command) {
          if (command.actorId !== "account-fanxing" || command.teamId !== "north") {
            throw new AppError("TEAM_ACCESS_DENIED", "无权写入当前团队联系人", 403)
          }
          teamContactCreates += 1
          const item = {
            id: `team-contact-agent-${teamContactCreates}`,
            source: "team" as const,
            ownerName: "北岸影像",
            name: command.name.trim(),
            role: command.role?.trim() ?? "",
            company: command.company?.trim() ?? "",
            phone: command.phone?.trim() ?? "",
            email: command.email?.trim() ?? "",
            sharedFields: ["name", "role", "company", "phone", "email"] as const,
            projectIds: command.projectIds ?? [],
            allowProjectLink: true,
            editable: true,
            revision: 1,
            updatedAt: "2026-08-30T00:00:00.000Z",
          } satisfies TeamContact
          contacts.unshift(item)
          return { item: structuredClone(item), replayed: false }
        },
        async listTeamSuppliers(actorId, teamId) {
          if (!actorId || teamId !== "north") {
            throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队供应商", 403)
          }
          return { items: structuredClone(suppliers) }
        },
        async createTeamSupplier(command) {
          if (command.actorId !== "account-fanxing" || command.teamId !== "north") {
            throw new AppError("TEAM_ACCESS_DENIED", "无权写入当前团队供应商", 403)
          }
          teamSupplierCreates += 1
          const item = {
            id: `team-supplier-agent-${teamSupplierCreates}`,
            teamId: command.teamId,
            name: command.name.trim(),
            category: command.category?.trim() ?? "",
            services: command.services?.trim() ?? "",
            phone: command.phone?.trim() ?? "",
            email: command.email?.trim() ?? "",
            address: command.address?.trim() ?? "",
            contactRefs: command.contactRefs ?? [],
            projectIds: command.projectIds ?? [],
            revision: 1,
            updatedAt: "2026-08-30T00:00:00.000Z",
          } satisfies TeamSupplier
          suppliers.unshift(item)
          return { item: structuredClone(item), replayed: false }
        },
      },
      () => new Date("2026-08-30T00:00:00.000Z"),
    ),
    logger: false,
  })
  apps.push(app)
  return {
    app,
    repository,
    tasks,
    notes,
    assets,
    contacts,
    personalContacts,
    deletedPersonalContacts,
    suppliers,
    breakdownItems,
    executionStages,
    shootingDays,
    callSheets,
    revokeAuditRead() {
      auditReadAllowed = false
    },
    writes: {
      get auditReads() {
        return auditReads
      },
      get tasks() {
        return taskWrites
      },
      get taskUpdates() {
        return taskUpdates
      },
      get notes() {
        return noteWrites
      },
      get noteUpdates() {
        return noteUpdates
      },
      get calendarEvents() {
        return calendarWrites
      },
      get calendarUpdates() {
        return calendarUpdates
      },
      get portfolios() {
        return portfolioWrites
      },
      get portfolioCreates() {
        return portfolioCreates
      },
      get portfolioContentAdds() {
        return portfolioContentAdds
      },
      get callSheetCreates() {
        return callSheetCreates
      },
      get callSheetUpdates() {
        return callSheetUpdates
      },
      get callSheetPublishes() {
        return callSheetPublishes
      },
      get executionStageCreates() {
        return executionStageCreates
      },
      get executionStageUpdates() {
        return executionStageUpdates
      },
      get shootingDayCreates() {
        return shootingDayCreates
      },
      get shootingDayUpdates() {
        return shootingDayUpdates
      },
      get breakdownUpdates() {
        return breakdownUpdates
      },
      get breakdownConfirms() {
        return breakdownConfirms
      },
      get reviewCommentCreates() {
        return reviewCommentCreates
      },
      get reviewCommentUpdates() {
        return reviewCommentUpdates
      },
      get reviewFileCreates() {
        return reviewFileCreates
      },
      get reviewFileApprovals() {
        return reviewFileApprovals
      },
      get reviewLinkCreates() {
        return reviewLinkCreates
      },
      get analysisJobCreates() {
        return analysisJobCreates
      },
      get mediaAnalysisCreates() {
        return mediaAnalysisCreates
      },
      get semanticSearches() {
        return semanticSearches
      },
      get teamContactCreates() {
        return teamContactCreates
      },
      get teamSupplierCreates() {
        return teamSupplierCreates
      },
    },
  }
}

async function readSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  eventName: string,
) {
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) throw new Error(`SSE stream closed before ${eventName}`)
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() ?? ""
    const event = events.find((item) => item.includes(`event: ${eventName}`))
    if (event) return event
  }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("script workspace API", () => {
  it("lists, creates, and replays project script documents", async () => {
    const { app } = await createTestApp()
    const headers = { "x-shadow-account-id": "account-fanxing" }
    const payload = {
      title: "车站夜戏补拍稿",
      type: "script" as const,
      idempotencyKey: "create-script-document-1",
    }

    const before = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-documents",
      headers,
    })
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-documents",
      headers,
      payload,
    })
    const replay = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-documents",
      headers,
      payload,
    })
    const reusedKey = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-documents",
      headers,
      payload: { ...payload, title: "另一份文档" },
    })
    const denied = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-documents",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { ...payload, idempotencyKey: "viewer-document-create-1" },
    })
    const missing = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-workspace?documentId=missing",
      headers,
    })
    const after = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-documents",
      headers,
    })

    expect(before.statusCode).toBe(200)
    expect(before.json().documents).toHaveLength(1)
    expect(before.json().documents[0]).toMatchObject({ isDefault: true, type: "script" })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      document: {
        title: "车站夜戏补拍稿",
        currentVersionId: "v8",
        isDefault: false,
      },
      replayed: false,
    })
    expect(replay.json()).toMatchObject({
      document: { id: created.json().document.id },
      replayed: true,
    })
    expect(reusedKey.statusCode).toBe(409)
    expect(reusedKey.json().code).toBe("IDEMPOTENCY_KEY_REUSED")
    expect(denied.statusCode).toBe(403)
    expect(missing.statusCode).toBe(404)
    expect(missing.json().code).toBe("SCRIPT_DOCUMENT_NOT_FOUND")
    expect(after.json().documents).toHaveLength(2)
  })

  it("keeps versions and comments inside their selected document", async () => {
    const { app } = await createTestApp()
    const headers = { "x-shadow-account-id": "account-fanxing" }
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-documents",
      headers,
      payload: {
        title: "独立协作稿",
        idempotencyKey: "document-isolation-create-1",
      },
    })
    const documentId = created.json().document.id as string

    const update = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v8",
      headers,
      payload: {
        documentId,
        content: "第二份文档的正文",
        expectedRevision: 1,
        idempotencyKey: "document-isolation-update-1",
      },
    })
    const comment = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-comments",
      headers,
      payload: {
        documentId,
        versionId: "v8",
        text: "只属于第二份文档",
        idempotencyKey: "document-isolation-comment-1",
      },
    })
    const crossDocumentComment = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-comments",
      headers,
      payload: {
        documentId,
        versionId: "v7",
        text: "不应跨文档写入",
        idempotencyKey: "document-isolation-comment-2",
      },
    })
    const selected = await app.inject({
      method: "GET",
      url: `/v1/projects/winter-coffee/script-workspace?documentId=${documentId}`,
      headers,
    })
    const fallback = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-workspace",
      headers,
    })

    expect(update.statusCode).toBe(200)
    expect(update.json().documentId).toBe(documentId)
    expect(comment.statusCode).toBe(201)
    expect(comment.json().documentId).toBe(documentId)
    expect(crossDocumentComment.statusCode).toBe(404)
    expect(selected.json().versions).toHaveLength(1)
    expect(selected.json().versions[0]).toMatchObject({
      id: "v8",
      content: "第二份文档的正文",
      revision: 2,
    })
    expect(selected.json().comments).toHaveLength(1)
    expect(fallback.json().document.isDefault).toBe(true)
    expect(fallback.json().versions.some(({ id }: { id: string }) => id === "v8")).toBe(
      false,
    )
    expect(fallback.json().comments).toHaveLength(0)
  })

  it("scopes script events and presence to one document", async () => {
    const { app } = await createTestApp()
    const headers = { "x-shadow-account-id": "account-fanxing" }
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-documents",
      headers,
      payload: {
        title: "实时协作隔离稿",
        idempotencyKey: "document-stream-create-1",
      },
    })
    const documentId = created.json().document.id as string
    const address = await app.listen({ host: "127.0.0.1", port: 0 })
    const defaultController = new AbortController()
    const selectedController = new AbortController()
    const defaultStream = await fetch(
      `${address}/v1/projects/winter-coffee/script-events`,
      {
        headers,
        signal: defaultController.signal,
      },
    )
    const selectedStream = await fetch(
      `${address}/v1/projects/winter-coffee/script-events?documentId=${documentId}`,
      { headers, signal: selectedController.signal },
    )
    if (!defaultStream.body || !selectedStream.body) {
      throw new Error("Expected both script event streams")
    }
    const defaultReader = defaultStream.body.getReader()
    const selectedReader = selectedStream.body.getReader()
    await Promise.all([
      readSseEvent(defaultReader, "script.presence.updated"),
      readSseEvent(selectedReader, "script.presence.updated"),
    ])

    const selectedPresence = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-presence",
      headers,
      payload: {
        documentId,
        versionId: "v8",
        cursorStart: 2,
        cursorEnd: 4,
        editing: true,
      },
    })
    expect(selectedPresence.statusCode).toBe(200)
    expect(selectedPresence.json()).toMatchObject({ documentId })

    await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v8",
      headers,
      payload: {
        documentId,
        content: "第二份实时正文",
        expectedRevision: 1,
        idempotencyKey: "document-stream-update-1",
      },
    })
    await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v7",
      headers,
      payload: {
        content: "默认实时正文",
        expectedRevision: 1,
        idempotencyKey: "document-stream-update-2",
      },
    })

    const [selectedUpdate, defaultUpdate] = await Promise.all([
      readSseEvent(selectedReader, "script.version.updated"),
      readSseEvent(defaultReader, "script.version.updated"),
    ])
    expect(selectedUpdate).toContain(`"documentId":"${documentId}"`)
    expect(selectedUpdate).toContain('"versionId":"v8"')
    expect(defaultUpdate).toContain('"documentId":"winter-coffee-shooting-script"')
    expect(defaultUpdate).toContain('"versionId":"v7"')

    selectedController.abort()
    defaultController.abort()
    await Promise.all([
      selectedReader.cancel().catch(() => undefined),
      defaultReader.cancel().catch(() => undefined),
    ])
  })

  it("loads a script workspace for an authorized actor", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-workspace",
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().document.currentVersionId).toBe("v7")
    expect(response.json().currentAccountId).toBe("account-fanxing")
  })

  it("rejects a request without an actor marker", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-workspace",
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().code).toBe("AUTH_REQUIRED")
  })

  it("does not expose an unauthorized project", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-workspace",
      headers: { "x-shadow-account-id": "account-outsider" },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe("PROJECT_ACCESS_DENIED")
  })

  it("validates updates before executing the command", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v7",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { content: "新正文", expectedRevision: 1 },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe("VALIDATION_FAILED")
  })

  it("updates the current version with optimistic concurrency", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v7",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        content: "更新后的正文",
        expectedRevision: 1,
        idempotencyKey: "update-command-1",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().version.revision).toBe(2)
    expect(response.json().version.content).toBe("更新后的正文")

    const reusedKey = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v7",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        content: "不应静默回放的另一份正文",
        expectedRevision: 2,
        idempotencyKey: "update-command-1",
      },
    })
    expect(reusedKey.statusCode).toBe(409)
    expect(reusedKey.json().code).toBe("IDEMPOTENCY_KEY_REUSED")
  })

  it("returns a version conflict instead of overwriting a newer edit", async () => {
    const { app } = await createTestApp()
    await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v7",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        content: "其他协作者的新正文",
        expectedRevision: 1,
        idempotencyKey: "newer-command-1",
      },
    })
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v7",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        content: "过期正文",
        expectedRevision: 1,
        idempotencyKey: "stale-command-1",
      },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe("VERSION_CONFLICT")

    const latest = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-workspace",
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    expect(
      latest.json().versions.find(({ id }: { id: string }) => id === "v7"),
    ).toMatchObject({ content: "其他协作者的新正文", revision: 2 })

    const resolved = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v7",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        content: "合并后的正文",
        expectedRevision: 2,
        idempotencyKey: "resolved-command-1",
      },
    })
    expect(resolved.statusCode).toBe(200)
    expect(resolved.json().version).toMatchObject({
      content: "合并后的正文",
      revision: 3,
    })
  })

  it("creates one immutable script version and replays the command", async () => {
    const { app, repository } = await createTestApp()
    const payload = {
      content: "另存后的冲突草稿",
      meta: "繁星提交 · 冲突合并稿",
      expectedVersionId: "v7",
      expectedRevision: 1,
      idempotencyKey: "create-version-command-1",
    }
    const first = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-versions",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload,
    })
    const replay = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-versions",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload,
    })
    const denied = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-versions",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { ...payload, idempotencyKey: "create-version-viewer-1" },
    })
    const reusedKey = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-versions",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { ...payload, content: "不应静默回放的另一份版本" },
    })
    const stale = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-versions",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { ...payload, idempotencyKey: "create-version-stale-1" },
    })

    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({
      version: {
        id: "v8",
        content: "另存后的冲突草稿",
        revision: 1,
        isCurrent: true,
      },
      replayed: false,
    })
    expect(replay.statusCode).toBe(201)
    expect(replay.json().replayed).toBe(true)
    expect(denied.statusCode).toBe(403)
    expect(reusedKey.statusCode).toBe(409)
    expect(reusedKey.json().code).toBe("IDEMPOTENCY_KEY_REUSED")
    expect(stale.statusCode).toBe(409)
    expect(repository.workspace.document.currentVersionId).toBe("v8")
    expect(repository.workspace.versions).toHaveLength(4)
    expect(repository.workspace.versions.find((item) => item.id === "v7")).toMatchObject({
      content: expect.stringContaining("旧站台"),
      badge: "历史",
      isCurrent: false,
    })
  })

  it("streams successful script updates to project subscribers", async () => {
    const { app } = await createTestApp()
    const address = await app.listen({ host: "127.0.0.1", port: 0 })
    const controller = new AbortController()
    const stream = await fetch(`${address}/v1/projects/winter-coffee/script-events`, {
      headers: { "x-shadow-account-id": "account-fanxing" },
      signal: controller.signal,
    })
    const reader = stream.body?.getReader()

    expect(stream.status).toBe(200)
    expect(stream.headers.get("content-type")).toContain("text/event-stream")
    expect(reader).toBeDefined()
    if (!reader) throw new Error("Expected script event stream")
    expect(reader).toBeDefined()

    await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/script-versions/v7",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        content: "实时协作正文",
        expectedRevision: 1,
        idempotencyKey: "stream-command-1",
      },
    })

    const update = await readSseEvent(reader, "script.version.updated")
    expect(update).toContain("event: script.version.updated")
    expect(update).toContain('"versionId":"v7"')
    expect(update).toContain('"revision":2')

    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-comments",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        versionId: "v7",
        text: "实时评论",
        idempotencyKey: "stream-comment-1",
      },
    })
    const commentUpdate = await readSseEvent(reader, "script.comment.updated")
    expect(commentUpdate).toContain("event: script.comment.updated")
    expect(commentUpdate).toContain('"action":"created"')

    await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/script-comments/${created.json().comment.id}`,
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        resolved: true,
        expectedRevision: 1,
        idempotencyKey: "stream-resolve-1",
      },
    })
    const stateUpdate = await readSseEvent(reader, "script.comment.updated")
    expect(stateUpdate).toContain("event: script.comment.updated")
    expect(stateUpdate).toContain('"action":"resolved"')

    controller.abort()
    await reader?.cancel().catch(() => undefined)
  })

  it("replays persisted script events after Last-Event-ID", async () => {
    let resolveDisconnect: (value: string[]) => void = () => undefined
    const disconnected = new Promise<string[]>((resolve) => {
      resolveDisconnect = resolve
    })
    const scriptRealtimeStore: ScriptRealtimeStore = {
      async latestEventId() {
        return 42
      },
      async listEvents(_projectId, _documentId, afterId) {
        return afterId < 42
          ? [
              {
                id: 42,
                event: "script.version.updated",
                data: { versionId: "v7", revision: 2 },
              },
            ]
          : []
      },
      async connectPresence() {},
      async disconnectPresence(connection) {
        resolveDisconnect([
          connection.projectId,
          connection.documentId,
          connection.accountId,
        ])
      },
      async updatePresence() {
        return true
      },
      async touchPresence() {},
      async listPresence() {
        return []
      },
    }
    const { app } = await createTestApp({ scriptRealtimeStore })
    const address = await app.listen({ host: "127.0.0.1", port: 0 })
    const controller = new AbortController()
    const stream = await fetch(`${address}/v1/projects/winter-coffee/script-events`, {
      headers: {
        "x-shadow-account-id": "account-fanxing",
        "last-event-id": "41",
      },
      signal: controller.signal,
    })
    const reader = stream.body?.getReader()
    if (!reader) throw new Error("Expected replayable script event stream")

    const event = await readSseEvent(reader, "script.version.updated")
    expect(event).toContain("id: 42")
    expect(event).toContain('"versionId":"v7"')
    expect(event).toContain('"revision":2')

    controller.abort()
    await reader.cancel().catch(() => undefined)
    await expect(disconnected).resolves.toEqual([
      "winter-coffee",
      "winter-coffee-shooting-script",
      "account-fanxing",
    ])
  })

  it("tracks connected collaborators and validates their cursor state", async () => {
    const { app } = await createTestApp()
    const address = await app.listen({ host: "127.0.0.1", port: 0 })
    const fanxingController = new AbortController()
    const fanxingStream = await fetch(
      `${address}/v1/projects/winter-coffee/script-events`,
      {
        headers: { "x-shadow-account-id": "account-fanxing" },
        signal: fanxingController.signal,
      },
    )
    if (!fanxingStream.body) throw new Error("Expected Fanxing script event stream")
    const fanxingReader = fanxingStream.body.getReader()
    const initial = await readSseEvent(fanxingReader, "script.presence.updated")
    expect(initial).toContain('"collaboratorId":"account-fanxing"')

    const disconnected = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-presence",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { versionId: "v7", cursorStart: 0, cursorEnd: 0, editing: true },
    })
    expect(disconnected.statusCode).toBe(409)
    expect(disconnected.json().code).toBe("SCRIPT_PRESENCE_CONNECTION_REQUIRED")

    const viewerController = new AbortController()
    const viewerStream = await fetch(
      `${address}/v1/projects/winter-coffee/script-events`,
      {
        headers: { "x-shadow-account-id": "account-viewer" },
        signal: viewerController.signal,
      },
    )
    if (!viewerStream.body) throw new Error("Expected viewer script event stream")
    const viewerReader = viewerStream.body.getReader()
    const joined = await readSseEvent(fanxingReader, "script.presence.updated")
    expect(joined).toContain('"collaboratorId":"account-viewer"')

    const cursor = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-presence",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { versionId: "v7", cursorStart: 1, cursorEnd: 3, editing: true },
    })
    expect(cursor.statusCode).toBe(200)
    expect(
      cursor
        .json()
        .participants.find(
          (item: { collaboratorId: string }) => item.collaboratorId === "account-viewer",
        ),
    ).toMatchObject({ cursorStart: 1, cursorEnd: 3, editing: false })
    const updated = await readSseEvent(fanxingReader, "script.presence.updated")
    expect(updated).toContain('"cursorEnd":3')

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-presence",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        versionId: "v7",
        cursorStart: 4,
        cursorEnd: 3,
        editing: false,
      },
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().code).toBe("SCRIPT_CURSOR_INVALID")

    viewerController.abort()
    fanxingController.abort()
    await Promise.all([
      viewerReader.cancel().catch(() => undefined),
      fanxingReader.cancel().catch(() => undefined),
    ])
  })

  it("deduplicates comment creation by idempotency key", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/script-comments",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        versionId: "v7",
        text: "请确认列车灯出现的节拍。",
        excerpt: "列车灯",
        idempotencyKey: "comment-command-1",
      },
    }

    const first = await app.inject(request)
    const second = await app.inject(request)

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    expect(second.json().replayed).toBe(true)
    expect(second.json().comment.id).toBe(first.json().comment.id)
    expect(repository.workspace.comments).toHaveLength(1)

    const reused = await app.inject({
      ...request,
      payload: { ...request.payload, text: "另一条评论" },
    })
    expect(reused.statusCode).toBe(409)
    expect(reused.json().code).toBe("IDEMPOTENCY_KEY_REUSED")

    const whitespace = await app.inject({
      ...request,
      payload: {
        ...request.payload,
        text: "   ",
        idempotencyKey: "comment-whitespace-1",
      },
    })
    expect(whitespace.statusCode).toBe(400)
    expect(whitespace.json().code).toBe("COMMENT_TEXT_REQUIRED")
  })

  it("creates a reply and resolves then reopens its thread", async () => {
    const { app } = await createTestApp()
    const root = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-comments",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        versionId: "v7",
        text: "根评论",
        idempotencyKey: "comment-root-1",
      },
    })
    const commentId = root.json().comment.id
    const reply = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/script-comments",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        versionId: "v7",
        parentId: commentId,
        text: "一级回复",
        idempotencyKey: "comment-reply-1",
      },
    })
    expect(reply.statusCode).toBe(201)
    expect(reply.json().comment.parentId).toBe(commentId)

    const resolveRequest = {
      method: "PATCH" as const,
      url: `/v1/projects/winter-coffee/script-comments/${commentId}`,
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        resolved: true,
        expectedRevision: 1,
        idempotencyKey: "comment-resolve-1",
      },
    }
    const resolved = await app.inject(resolveRequest)
    const replay = await app.inject(resolveRequest)
    expect(resolved.statusCode).toBe(200)
    expect(resolved.json().comment).toMatchObject({ resolved: true, revision: 2 })
    expect(replay.json().replayed).toBe(true)

    const stale = await app.inject({
      ...resolveRequest,
      payload: {
        resolved: false,
        expectedRevision: 1,
        idempotencyKey: "comment-stale-1",
      },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("COMMENT_CONFLICT")

    const reopened = await app.inject({
      ...resolveRequest,
      payload: {
        resolved: false,
        expectedRevision: 2,
        idempotencyKey: "comment-reopen-1",
      },
    })
    expect(reopened.statusCode).toBe(200)
    expect(reopened.json().comment).toMatchObject({ resolved: false, revision: 3 })
  })
})

describe("Agent command API", () => {
  it("lists a project execution schedule and shooting days without confirmation", async () => {
    const { app } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "list_execution_schedule",
        teamId: "north",
        projectId: "winter-coffee",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      action: "list_execution_schedule",
      risk: "read",
      requiresConfirmation: false,
      summary: "读取当前项目的 1 个执行阶段和 1 个拍摄日",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "execution_schedule_list",
      stages: [{ id: agentExecutionStage.id, name: agentExecutionStage.name }],
      conflicts: [],
      shootingDays: [{ id: agentShootingDay.id, title: agentShootingDay.title }],
    })
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
  })

  it("lists filtered audit logs and replays the stored result", async () => {
    const { app, writes } = await createTestApp({
      auditLogs: [
        agentAuditLog,
        {
          ...agentAuditLog,
          id: "audit-agent-2",
          actorAccountId: "account-linqiao",
          actorName: "林乔",
          action: "task.created",
        },
      ],
    })
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "list_audit_logs",
        teamId: "north",
        projectId: "winter-coffee",
        auditAction: "call-sheet",
        actor: "繁星",
        pageSize: 10,
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      action: "list_audit_logs",
      risk: "read",
      requiresConfirmation: false,
      scope: { teamId: "north", projectId: "winter-coffee" },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "audit_log_list",
      total: 1,
      page: 1,
      pageSize: 10,
      items: [{ id: agentAuditLog.id, action: "call-sheet.published" }],
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.auditReads).toBe(2)
  })

  it("rechecks audit read permission when executing a previewed command", async () => {
    const fixture = await createTestApp()
    const preview = await fixture.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "list_audit_logs",
        teamId: "north",
        projectId: "winter-coffee",
      },
    })
    fixture.revokeAuditRead()
    const denied = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("TEAM_READ_DENIED")
    expect(fixture.writes.auditReads).toBe(1)
  })

  it("lists visible team resources in project scope and replays the result", async () => {
    const { app } = await createTestApp({
      assets: [
        agentAsset,
        {
          ...agentAsset,
          id: "asset-other-project",
          projectId: "other-project",
          projectName: "其他项目",
        },
      ],
    })
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "list_team_resources",
        teamId: "north",
        projectId: "winter-coffee",
        keyword: "冬夜咖啡",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      action: "list_team_resources",
      risk: "read",
      requiresConfirmation: false,
      summary: "读取当前项目的 1 位联系人、1 家供应商和 1 项素材",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "team_resources_list",
      contacts: [
        {
          id: agentContact.id,
          phone: null,
          email: null,
          sharedFields: ["name", "role", "company"],
        },
      ],
      suppliers: [
        {
          id: agentSupplier.id,
          contactRefs: [{ contactId: agentContact.id, source: "member-shared" }],
        },
      ],
      assets: [{ id: agentAsset.id, projectId: "winter-coffee" }],
    })
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
  })

  it("returns empty resource groups and rejects inaccessible teams", async () => {
    const { app } = await createTestApp()
    const emptyPreview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "list_team_resources",
        teamId: "north",
        keyword: "不存在的资源",
      },
    })
    const empty = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${emptyPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const denied = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { action: "list_team_resources", teamId: "external" },
    })

    expect(empty.json().result).toEqual({
      kind: "team_resources_list",
      contacts: [],
      suppliers: [],
      assets: [],
    })
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("TEAM_ACCESS_DENIED")
  })

  it("runs one scoped semantic asset search only when the Agent command executes", async () => {
    const fixture = await createTestApp()
    const preview = await fixture.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "semantic_search_assets",
        teamId: "north",
        projectId: "winter-coffee",
        query: "  雨夜车站  ",
        limit: 8,
      },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      action: "semantic_search_assets",
      risk: "read",
      requiresConfirmation: false,
      summary: "按画面、转写与 OCR 语义搜索“雨夜车站”",
    })
    expect(fixture.writes.semanticSearches).toBe(0)

    const commandId = preview.json().commandId
    const first = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "asset_semantic_search",
      items: [
        {
          item: { id: agentAsset.id },
          score: 0.87,
          source: "vision",
          excerpt: "雨夜车站",
          sequence: 1,
          timecodeUs: 5_000_000,
        },
      ],
    })
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
    expect(fixture.writes.semanticSearches).toBe(1)
  })

  it("lists, creates, and updates personal contacts", async () => {
    const fixture = await createTestApp()
    const headers = { "x-shadow-account-id": "account-fanxing" }
    const listPreview = await fixture.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers,
      payload: { action: "list_personal_contacts", teamId: "north" },
    })
    const list = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${listPreview.json().commandId}/execute`,
      headers,
    })
    const createPreview = await fixture.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers,
      payload: {
        action: "create_personal_contact",
        teamId: "north",
        name: "林深",
        role: "场务",
      },
    })
    const created = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${createPreview.json().commandId}/execute`,
      headers,
    })
    const updatePreview = await fixture.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers,
      payload: {
        action: "update_personal_contact",
        teamId: "north",
        contactId: created.json().result.item.id,
        company: "北岸现场组",
        phone: "13900000000",
      },
    })
    const updated = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${updatePreview.json().commandId}/execute`,
      headers,
    })

    expect(listPreview.json()).toMatchObject({
      risk: "read",
      summary: "读取个人通讯录中的 1 位联系人",
    })
    expect(list.json().result).toMatchObject({
      kind: "personal_contact_list",
      items: [{ id: agentPersonalContact.id }],
    })
    expect(createPreview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "创建个人联系人“林深”",
    })
    expect(created.json().result).toMatchObject({
      kind: "personal_contact_created",
      item: { name: "林深", role: "场务" },
    })
    expect(updated.json().result).toMatchObject({
      kind: "personal_contact_updated",
      item: { company: "北岸现场组", phone: "13900000000", revision: 2 },
    })
  })

  it("requires confirmation for personal contact sharing and deletion", async () => {
    const fixture = await createTestApp()
    const headers = { "x-shadow-account-id": "account-fanxing" }
    const preview = async (payload: Record<string, unknown>) =>
      fixture.app.inject({
        method: "POST",
        url: "/v1/agent/commands/preview",
        headers,
        payload: { teamId: "north", ...payload },
      })
    const confirm = async (commandId: string) =>
      fixture.app.inject({
        method: "POST",
        url: `/v1/agent/commands/${commandId}/confirm`,
        headers,
      })
    const execute = async (commandId: string) =>
      fixture.app.inject({
        method: "POST",
        url: `/v1/agent/commands/${commandId}/execute`,
        headers,
      })

    const sharePreview = await preview({
      action: "share_personal_contact",
      contactName: "顾遥",
      fields: ["name", "role", "phone"],
      allowProjectLink: false,
    })
    const blocked = await execute(sharePreview.json().commandId)
    await confirm(sharePreview.json().commandId)
    const shared = await execute(sharePreview.json().commandId)

    const unsharePreview = await preview({
      action: "unshare_personal_contact",
      contactId: agentPersonalContact.id,
    })
    await confirm(unsharePreview.json().commandId)
    const unshared = await execute(unsharePreview.json().commandId)

    const deletePreview = await preview({
      action: "delete_personal_contact",
      contactId: agentPersonalContact.id,
    })
    await confirm(deletePreview.json().commandId)
    const deleted = await execute(deletePreview.json().commandId)

    const restorePreview = await preview({
      action: "restore_personal_contact",
      contactId: agentPersonalContact.id,
    })
    const restored = await execute(restorePreview.json().commandId)

    expect(sharePreview.json()).toMatchObject({
      risk: "high",
      requiresConfirmation: true,
      summary: "向当前团队共享个人联系人“顾遥”的 3 个字段",
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().code).toBe("AGENT_CONFIRMATION_REQUIRED")
    expect(shared.json().result).toMatchObject({
      kind: "personal_contact_shared",
      item: {
        revision: 2,
        shares: [
          {
            teamId: "north",
            fields: ["name", "role", "phone"],
            allowProjectLink: false,
          },
        ],
      },
    })
    expect(unshared.json().result).toMatchObject({
      kind: "personal_contact_unshared",
      item: { revision: 3, shares: [] },
    })
    expect(deleted.json().result).toEqual({
      kind: "personal_contact_deleted",
      id: agentPersonalContact.id,
    })
    expect(restorePreview.json()).toMatchObject({ risk: "write" })
    expect(restored.json().result).toMatchObject({
      kind: "personal_contact_restored",
      item: { id: agentPersonalContact.id, revision: 4 },
    })
    expect(fixture.deletedPersonalContacts).toHaveLength(0)
    expect(fixture.personalContacts).toHaveLength(1)
  })

  it("creates team contacts and suppliers once and rechecks write access", async () => {
    const fixture = await createTestApp()
    const contactPreview = await fixture.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_team_contact",
        teamId: "north",
        name: "顾遥",
        role: "执行制片",
        projectIds: ["winter-coffee"],
      },
    })
    const contact = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${contactPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const contactReplay = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${contactPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const supplierPreview = await fixture.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_team_supplier",
        teamId: "north",
        name: "星河灯光",
        category: "灯光器材",
        contactRefs: [{ contactId: contact.json().result.item.id, source: "team" }],
        projectIds: ["winter-coffee"],
      },
    })
    const supplier = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${supplierPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const deniedPreview = await fixture.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "create_team_contact",
        teamId: "north",
        name: "无权联系人",
      },
    })
    const denied = await fixture.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${deniedPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(contactPreview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "创建团队联系人“顾遥”",
    })
    expect(contact.json().result).toMatchObject({
      kind: "team_contact_created",
      item: { name: "顾遥", projectIds: ["winter-coffee"] },
    })
    expect(contactReplay.json()).toMatchObject({
      replayed: true,
      result: contact.json().result,
    })
    expect(supplierPreview.json().summary).toBe("创建团队供应商“星河灯光”")
    expect(supplier.json().result).toMatchObject({
      kind: "team_supplier_created",
      item: {
        name: "星河灯光",
        contactRefs: [{ contactId: contact.json().result.item.id, source: "team" }],
      },
    })
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("TEAM_ACCESS_DENIED")
    expect(fixture.writes.teamContactCreates).toBe(1)
    expect(fixture.writes.teamSupplierCreates).toBe(1)
  })

  it("rejects contradictory Agent audit filters before creating an intent", async () => {
    const { app, writes } = await createTestApp()
    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "list_audit_logs",
        teamId: "north",
        projectId: "winter-coffee",
        scope: "team",
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe("AUDIT_FILTER_INVALID")
    expect(writes.auditReads).toBe(0)
  })

  it("serializes concurrent execution and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_task",
        teamId: "north",
        projectId: "winter-coffee",
        title: "发布车站夜戏通告",
      },
    })
    const commandId = preview.json().commandId

    const request = {
      method: "POST" as const,
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    }
    const [first, replay] = await Promise.all([app.inject(request), app.inject(request)])

    expect(preview.statusCode).toBe(201)
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(first.json().result.item.title).toBe("发布车站夜戏通告")
    expect(replay.json().result).toEqual(first.json().result)
    expect(replay.json().replayed).toBe(true)
    expect(writes.tasks).toBe(1)
  })

  it("updates a selected task once and replays the stored Agent result", async () => {
    const { app, tasks, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_task",
        teamId: "north",
        projectId: "winter-coffee",
        taskTitle: "Agent 任务",
        dueDate: "2026-09-02",
        status: "进行中",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "更新任务“Agent 任务”",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "task_updated",
      item: { dueDate: "2026-09-02", status: "进行中", revision: 2 },
    })
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
    expect(tasks[0]).toMatchObject({
      dueDate: "2026-09-02",
      status: "进行中",
      revision: 2,
    })
    expect(writes.taskUpdates).toBe(1)
  })

  it("requires one unambiguous task and at least one update", async () => {
    const duplicate = { ...agentTask, id: "task-agent-2" }
    const { app } = await createTestApp({ tasks: [agentTask, duplicate] })
    const ambiguous = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_task",
        teamId: "north",
        taskTitle: "Agent 任务",
        status: "进行中",
      },
    })
    const unchanged = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_task",
        teamId: "north",
        taskId: agentTask.id,
      },
    })

    expect(ambiguous.statusCode).toBe(400)
    expect(ambiguous.json().code).toBe("AGENT_TASK_SELECTION_REQUIRED")
    expect(unchanged.statusCode).toBe(400)
    expect(unchanged.json().code).toBe("AGENT_TASK_UPDATE_REQUIRED")
  })

  it("rejects stale and read-only task updates", async () => {
    const { app, tasks, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_task",
        teamId: "north",
        taskId: agentTask.id,
        status: "进行中",
      },
    })
    tasks[0].revision += 1
    const stale = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const viewerPreview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "update_task",
        teamId: "north",
        taskId: agentTask.id,
        status: "进行中",
      },
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${viewerPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
    expect(viewerPreview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("TEAM_WRITE_DENIED")
    expect(writes.taskUpdates).toBe(0)
  })

  it("requires confirmation before a high-risk publication command", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { action: "publish_portfolio", teamId: "north" },
    })
    const commandId = preview.json().commandId
    const blocked = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/confirm`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const executed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.json().requiresConfirmation).toBe(true)
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().code).toBe("AGENT_CONFIRMATION_REQUIRED")
    expect(confirmed.statusCode).toBe(200)
    expect(executed.statusCode).toBe(200)
    expect(executed.json().result.item.state).toBe("已公开")
    expect(writes.portfolios).toBe(1)
  })

  it("updates one breakdown item once and replays the stored result", async () => {
    const { app, breakdownItems, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        itemName: " 深红色硬壳行李箱 ",
        preparation: "完成做旧并补拍连续性照片",
        department: "美术组",
      },
    })
    const commandId = preview.json().commandId
    const executed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "更新制片拆解项“深红色硬壳行李箱”",
    })
    expect(executed.statusCode).toBe(200)
    expect(executed.json().result).toMatchObject({
      kind: "breakdown_updated",
      item: {
        id: agentBreakdownItem.id,
        preparation: "完成做旧并补拍连续性照片",
        department: "美术组",
        revision: 2,
      },
    })
    expect(replay.json()).toMatchObject({
      replayed: true,
      result: executed.json().result,
    })
    expect(breakdownItems[0]).toMatchObject({
      preparation: "完成做旧并补拍连续性照片",
      department: "美术组",
      revision: 2,
    })
    expect(writes.breakdownUpdates).toBe(1)
  })

  it("updates existing production relations through one Agent command", async () => {
    const { app, breakdownItems, writes } = await createTestApp({
      breakdownItems: [{ ...agentBreakdownItem, state: "已确认" }],
    })
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        itemId: agentBreakdownItem.id,
        supplierIds: ["supplier-rain-fx"],
        responsibleAccountId: "account-fanxing",
        taskIds: ["task-agent-1"],
        contactRefs: [
          { contactId: "team-contact-rain-fx", source: "team" },
          { contactId: "personal-contact-linqiao", source: "member-shared" },
        ],
        shootingDayIds: ["shoot-day-05"],
        callSheetIds: ["sd-05"],
      },
    })
    const executed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(executed.statusCode).toBe(200)
    expect(executed.json().result.item).toMatchObject({
      supplierIds: ["supplier-rain-fx"],
      responsibleAccountId: "account-fanxing",
      responsibleName: "繁星",
      taskIds: ["task-agent-1"],
      contactRefs: [
        { contactId: "team-contact-rain-fx", source: "team" },
        { contactId: "personal-contact-linqiao", source: "member-shared" },
      ],
      shootingDayIds: ["shoot-day-05"],
      callSheetIds: ["sd-05"],
      revision: 2,
    })
    expect(breakdownItems[0]).toMatchObject(executed.json().result.item)
    expect(writes.breakdownUpdates).toBe(1)
  })

  it("rejects stale and unauthorized breakdown updates", async () => {
    const { app, breakdownItems, writes } = await createTestApp()
    const stalePreview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        itemId: agentBreakdownItem.id,
        preparation: "过期更新",
      },
    })
    breakdownItems[0].revision += 1
    const stale = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${stalePreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const viewerPreview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        itemId: agentBreakdownItem.id,
        preparation: "无权更新",
      },
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${viewerPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
    expect(viewerPreview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(writes.breakdownUpdates).toBe(0)
  })

  it("requires a breakdown target and update without bypassing confirmation", async () => {
    const { app, writes } = await createTestApp()
    const missingTarget = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        preparation: "完成做旧",
      },
    })
    const missingUpdate = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        itemId: agentBreakdownItem.id,
      },
    })
    const confirmationPreview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        itemId: agentBreakdownItem.id,
        state: "已确认",
      },
    })
    const confirmationBypass = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${confirmationPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(missingTarget.statusCode).toBe(400)
    expect(missingTarget.json().code).toBe("AGENT_BREAKDOWN_ITEM_SELECTION_REQUIRED")
    expect(missingUpdate.statusCode).toBe(400)
    expect(missingUpdate.json().code).toBe("AGENT_BREAKDOWN_UPDATE_REQUIRED")
    expect(confirmationPreview.statusCode).toBe(201)
    expect(confirmationBypass.statusCode).toBe(409)
    expect(confirmationBypass.json().code).toBe("BREAKDOWN_CONFIRMATION_REQUIRED")
    expect(writes.breakdownUpdates).toBe(0)
  })

  it("confirms selected breakdown items once and replays the stored result", async () => {
    const { app, breakdownItems, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "confirm_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        category: " 道具 ",
      },
    })
    const commandId = preview.json().commandId
    const blocked = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/confirm`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const executed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "high",
      requiresConfirmation: true,
      summary: "确认“道具”分类的 1 项制片拆解候选",
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().code).toBe("AGENT_CONFIRMATION_REQUIRED")
    expect(confirmed.statusCode).toBe(200)
    expect(executed.statusCode).toBe(200)
    expect(executed.json().result).toMatchObject({
      kind: "breakdown_confirmed",
      items: [{ id: agentBreakdownItem.id, state: "已确认", revision: 2 }],
    })
    expect(replay.json()).toMatchObject({
      replayed: true,
      result: executed.json().result,
    })
    expect(breakdownItems[0]).toMatchObject({ state: "已确认", revision: 2 })
    expect(writes.breakdownConfirms).toBe(1)
  })

  it("rejects a breakdown confirmation when an item changed after preview", async () => {
    const { app, breakdownItems, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "confirm_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        category: "道具",
        itemIds: [agentBreakdownItem.id],
      },
    })
    const commandId = preview.json().commandId
    breakdownItems[0].revision += 1
    await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/confirm`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const stale = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
    expect(writes.breakdownConfirms).toBe(0)
  })

  it("creates a scoped note once and binds execution to the preview actor", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_note",
        teamId: "north",
        projectId: "winter-coffee",
        title: "车站雨效执行提醒",
        body: "准备两套防水方案。",
      },
    })
    const commandId = preview.json().commandId

    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json().risk).toBe("write")
    expect(denied.statusCode).toBe(404)
    expect(denied.json().code).toBe("AGENT_COMMAND_NOT_FOUND")
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "note_created",
      item: {
        title: "车站雨效执行提醒",
        body: "准备两套防水方案。",
        kind: "note",
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.notes).toBe(1)
  })

  it("updates a selected note once and replays the stored Agent result", async () => {
    const { app, notes, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_note",
        teamId: "north",
        projectId: "winter-coffee",
        noteTitle: "Agent 笔记",
        title: "车站雨效提醒",
        body: "准备三套防水方案",
        pinned: true,
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "更新项目笔记“Agent 笔记”",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "note_updated",
      item: {
        title: "车站雨效提醒",
        body: "准备三套防水方案",
        pinned: true,
        revision: 2,
      },
    })
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
    expect(notes[0]).toMatchObject({
      title: "车站雨效提醒",
      body: "准备三套防水方案",
      pinned: true,
      revision: 2,
    })
    expect(writes.noteUpdates).toBe(1)
  })

  it("requires one unambiguous note and at least one update", async () => {
    const duplicate = { ...agentNote, id: "note-agent-2" }
    const { app } = await createTestApp({ notes: [agentNote, duplicate] })
    const ambiguous = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_note",
        teamId: "north",
        projectId: "winter-coffee",
        noteTitle: "Agent 笔记",
        pinned: true,
      },
    })
    const unchanged = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_note",
        teamId: "north",
        noteId: agentNote.id,
      },
    })

    expect(ambiguous.statusCode).toBe(400)
    expect(ambiguous.json().code).toBe("AGENT_NOTE_SELECTION_REQUIRED")
    expect(unchanged.statusCode).toBe(400)
    expect(unchanged.json().code).toBe("AGENT_NOTE_UPDATE_REQUIRED")
  })

  it("rejects stale and read-only note updates", async () => {
    const { app, notes, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_note",
        teamId: "north",
        noteId: agentNote.id,
        pinned: true,
      },
    })
    notes[0].revision += 1
    const stale = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const viewerPreview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "update_note",
        teamId: "north",
        noteId: agentNote.id,
        pinned: true,
      },
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${viewerPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
    expect(viewerPreview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("TEAM_WRITE_DENIED")
    expect(writes.noteUpdates).toBe(0)
  })

  it("creates a scoped calendar event once and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_calendar_event",
        teamId: "north",
        projectId: "winter-coffee",
        title: "P1 日程验收",
        startsAt: "2026-08-31T07:00:00.000Z",
        timezone: "Asia/Shanghai",
        visibility: "project",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({ risk: "write", requiresConfirmation: false })
    expect(first.json().result).toMatchObject({
      kind: "calendar_event_created",
      item: {
        projectId: "winter-coffee",
        title: "P1 日程验收",
        startsAt: "2026-08-31T07:00:00.000Z",
        timezone: "Asia/Shanghai",
        visibility: "project",
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.calendarEvents).toBe(1)
  })

  it("updates one selected calendar event and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_calendar_event",
        teamId: "north",
        projectId: "winter-coffee",
        eventTitle: "Agent 日程",
        startsAt: "2026-09-01T08:00:00.000Z",
        timezone: "Asia/Shanghai",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(first.json().result).toMatchObject({
      kind: "calendar_event_updated",
      item: {
        startsAt: "2026-09-01T08:00:00.000Z",
        endsAt: "2026-09-01T09:00:00.000Z",
        revision: 2,
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.calendarUpdates).toBe(1)
  })

  it("rejects impossible dates when updating a calendar event", async () => {
    const { app, writes } = await createTestApp()
    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_calendar_event",
        teamId: "north",
        projectId: "winter-coffee",
        eventTitle: "Agent 日程",
        startsAt: "2026-02-31T08:00:00.000Z",
        timezone: "Asia/Shanghai",
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe("INVALID_DATE")
    expect(writes.calendarUpdates).toBe(0)
  })

  it("requires a unique calendar event selection before creating an intent", async () => {
    const { app } = await createTestApp({
      calendarEvents: [
        { ...agentCalendarEvent, id: "calendar-agent-1", title: "Agent 日程 A" },
        { ...agentCalendarEvent, id: "calendar-agent-2", title: "Agent 日程 B" },
      ],
    })
    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_calendar_event",
        teamId: "north",
        projectId: "winter-coffee",
        eventTitle: "Agent 日程",
        startsAt: "2026-09-01T08:00:00.000Z",
        timezone: "Asia/Shanghai",
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe("AGENT_CALENDAR_EVENT_SELECTION_REQUIRED")
  })

  it("creates a project call sheet once and replays the Agent result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        date: "8 月 31 日",
        title: "车站补拍通告",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json().risk).toBe("write")
    expect(first.json().result).toMatchObject({
      kind: "call_sheet_created",
      item: { date: "8 月 31 日", title: "车站补拍通告", status: "待确认" },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.callSheetCreates).toBe(1)
  })

  it("updates one selected call sheet and replays the Agent result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        callSheetTitle: "车站补拍通告",
        title: "车站夜戏通告",
        crewCall: "16:00",
        departments: [{ name: "摄影组", call: "15:30", note: "检查雨具" }],
        changeSummary: "调整现场执行安排",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "更新通告表“车站补拍通告”",
    })
    expect(first.json().result).toMatchObject({
      kind: "call_sheet_updated",
      item: {
        title: "车站夜戏通告",
        crewCall: "16:00",
        departments: [{ name: "摄影组", call: "15:30", note: "检查雨具" }],
        revision: 2,
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.callSheetUpdates).toBe(1)
  })

  it("requires one call sheet target and an actual changed field", async () => {
    const duplicate = { ...agentCallSheet, id: "call-sheet-agent-2" }
    const { app } = await createTestApp({ callSheets: [agentCallSheet, duplicate] })
    const ambiguous = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        callSheetTitle: "车站补拍通告",
        crewCall: "16:00",
      },
    })
    const empty = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        callSheetId: agentCallSheet.id,
        changeSummary: "没有实际字段变化",
      },
    })

    expect(ambiguous.statusCode).toBe(400)
    expect(ambiguous.json().code).toBe("AGENT_CALL_SHEET_SELECTION_REQUIRED")
    expect(empty.statusCode).toBe(400)
    expect(empty.json().code).toBe("AGENT_CALL_SHEET_UPDATE_REQUIRED")
  })

  it("rejects a call sheet update after its revision changes", async () => {
    const { app, callSheets, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        callSheetId: agentCallSheet.id,
        location: "旧北站",
      },
    })
    const callSheet = callSheets[0]
    if (!callSheet) throw new Error("Missing call sheet fixture")
    callSheet.revision += 1
    const conflict = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().code).toBe("RESOURCE_CONFLICT")
    expect(writes.callSheetUpdates).toBe(0)
  })

  it("rechecks write access when executing a call sheet update", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "update_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        callSheetId: agentCallSheet.id,
        location: "旧北站",
      },
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(preview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(writes.callSheetUpdates).toBe(0)
  })

  it("creates a script version once, streams it, and replays the Agent result", async () => {
    const { app, repository } = await createTestApp()
    const address = await app.listen({ host: "127.0.0.1", port: 0 })
    const controller = new AbortController()
    const stream = await fetch(`${address}/v1/projects/winter-coffee/script-events`, {
      headers: { "x-shadow-account-id": "account-fanxing" },
      signal: controller.signal,
    })
    if (!stream.body) throw new Error("Expected script event stream")
    const reader = stream.body.getReader()
    await readSseEvent(reader, "script.presence.updated")

    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_script_version",
        teamId: "north",
        projectId: "winter-coffee",
        documentTitle: "冬夜咖啡_拍摄稿",
        content: "12. 外景 · 旧站台 · 夜\n\nAgent 创建的新脚本版本。",
        meta: "Agent 节奏调整稿",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const event = await readSseEvent(reader, "script.version.updated")
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      summary: "基于 v7 创建脚本版本“Agent 节奏调整稿”",
    })
    expect(first.json().result).toMatchObject({
      kind: "script_version_created",
      projectId: "winter-coffee",
      documentId: "winter-coffee-shooting-script",
      item: { id: "v8", meta: "Agent 节奏调整稿", revision: 1, isCurrent: true },
    })
    expect(event).toContain('"versionId":"v8"')
    expect(event).toContain('"revision":1')
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
    expect(repository.workspace.document.currentVersionId).toBe("v8")

    controller.abort()
    await reader.cancel().catch(() => undefined)
  })

  it("updates the frozen current script version and rejects stale execution", async () => {
    const { app, repository } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_script_version",
        teamId: "north",
        projectId: "winter-coffee",
        documentId: "winter-coffee-shooting-script",
        content: "Agent 准备写入的协作正文",
      },
    })
    await new ScriptService(repository).updateVersion({
      actorId: "account-fanxing",
      projectId: "winter-coffee",
      documentId: "winter-coffee-shooting-script",
      versionId: "v7",
      content: "另一位协作者先保存的正文",
      expectedRevision: 1,
      idempotencyKey: "concurrent-script-update-1",
    })
    const conflict = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json().summary).toBe("更新脚本文档“冬夜咖啡_拍摄稿”的当前协作稿")
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().code).toBe("VERSION_CONFLICT")
    expect(repository.workspace.versions[0]).toMatchObject({
      content: "另一位协作者先保存的正文",
      revision: 2,
    })
  })

  it("updates a script version once and rejects read-only Agent previews", async () => {
    const { app, repository } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_script_version",
        teamId: "north",
        projectId: "winter-coffee",
        content: "Agent 已保存的协作正文",
      },
    })
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const denied = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "update_script_version",
        teamId: "north",
        projectId: "winter-coffee",
        content: "只读成员不能保存",
      },
    })

    expect(first.json().result).toMatchObject({
      kind: "script_version_updated",
      item: { id: "v7", content: "Agent 已保存的协作正文", revision: 2 },
    })
    expect(replay.json().replayed).toBe(true)
    expect(repository.workspace.versions[0].revision).toBe(2)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
  })

  it("creates one frozen script breakdown analysis and replays the Agent result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_script_breakdown_analysis",
        teamId: "north",
        projectId: "winter-coffee",
        documentTitle: "冬夜咖啡_拍摄稿",
        versionId: "v7",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const denied = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "create_script_breakdown_analysis",
        teamId: "north",
        projectId: "winter-coffee",
      },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "分析脚本文档“冬夜咖啡_拍摄稿”的 v7 版本并生成制片拆解候选",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "script_breakdown_analysis_created",
      item: {
        projectId: "winter-coffee",
        status: "queued",
        sourceDocumentId: "winter-coffee-shooting-script",
        sourceVersionId: "v7",
        sourceRevision: 1,
      },
    })
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
    expect(writes.analysisJobCreates).toBe(1)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
  })

  it("creates one frozen media analysis job and replays the Agent result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_media_analysis",
        teamId: "north",
        projectId: "winter-coffee",
        assetName: "冬夜咖啡_主片_v11.mp4",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "分析视频素材“冬夜咖啡_主片_v11.mp4”并生成镜头候选",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "media_analysis_created",
      item: {
        assetId: agentAsset.id,
        status: "queued",
        sourceAssetName: agentAsset.name,
        sourceRevision: 1,
      },
    })
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
    expect(writes.mediaAnalysisCreates).toBe(1)
  })

  it("requires one matching video and rechecks media write access and revision", async () => {
    const duplicate = { ...agentAsset, id: "asset-agent-main-v11-duplicate" }
    const ambiguousApp = await createTestApp({ assets: [agentAsset, duplicate] })
    const ambiguous = await ambiguousApp.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_media_analysis",
        teamId: "north",
        assetName: agentAsset.name,
      },
    })

    const staleApp = await createTestApp()
    const stalePreview = await staleApp.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_media_analysis",
        teamId: "north",
        assetId: agentAsset.id,
      },
    })
    staleApp.assets[0].revision += 1
    const stale = await staleApp.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${stalePreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    const deniedApp = await createTestApp()
    const deniedPreview = await deniedApp.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "create_media_analysis",
        teamId: "north",
        assetId: agentAsset.id,
      },
    })
    const denied = await deniedApp.app.inject({
      method: "POST",
      url: `/v1/agent/commands/${deniedPreview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(ambiguous.statusCode).toBe(400)
    expect(ambiguous.json().code).toBe("AGENT_ASSET_SELECTION_REQUIRED")
    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
    expect(staleApp.writes.mediaAnalysisCreates).toBe(0)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("TEAM_ACCESS_DENIED")
    expect(deniedApp.writes.mediaAnalysisCreates).toBe(0)
  })

  it("creates a shooting day once and replays the Agent result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_shooting_day",
        teamId: "north",
        projectId: "winter-coffee",
        shootDate: "2026-09-06",
        dayNumber: 93,
        title: "P1 Agent 新建拍摄日",
        originalTimezone: "Asia/Shanghai",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "创建第 93 拍摄日“P1 Agent 新建拍摄日”",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "shooting_day_created",
      item: {
        shootDate: "2026-09-06",
        dayNumber: 93,
        title: "P1 Agent 新建拍摄日",
        status: "草稿",
        revision: 1,
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.shootingDayCreates).toBe(1)
  })

  it("updates one selected shooting day and replays the Agent result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_shooting_day",
        teamId: "north",
        projectId: "winter-coffee",
        shootingDayTitle: "p1 agent 拍摄日",
        shootDate: "2026-09-07",
        status: "已确认",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "更新拍摄日“P1 Agent 拍摄日”",
    })
    expect(first.json().result).toMatchObject({
      kind: "shooting_day_updated",
      item: {
        shootDate: "2026-09-07",
        status: "已确认",
        revision: 2,
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.shootingDayUpdates).toBe(1)
  })

  it("requires one shooting day target and at least one changed field", async () => {
    const duplicate = {
      ...agentShootingDay,
      id: "shooting-day-agent-2",
      shootDate: "2026-09-08",
      dayNumber: 94,
    }
    const { app } = await createTestApp({
      shootingDays: [agentShootingDay, duplicate],
    })
    const ambiguous = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_shooting_day",
        teamId: "north",
        projectId: "winter-coffee",
        shootingDayTitle: "P1 Agent 拍摄日",
        status: "已确认",
      },
    })
    const unchanged = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_shooting_day",
        teamId: "north",
        projectId: "winter-coffee",
        shootingDayId: agentShootingDay.id,
      },
    })

    expect(ambiguous.statusCode).toBe(400)
    expect(ambiguous.json().code).toBe("AGENT_SHOOTING_DAY_SELECTION_REQUIRED")
    expect(unchanged.statusCode).toBe(400)
    expect(unchanged.json().code).toBe("AGENT_SHOOTING_DAY_UPDATE_REQUIRED")
  })

  it("rejects a shooting day update after its revision changes", async () => {
    const { app, shootingDays, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_shooting_day",
        teamId: "north",
        projectId: "winter-coffee",
        shootingDayId: agentShootingDay.id,
        status: "已确认",
      },
    })
    const shootingDay = shootingDays[0]
    if (!shootingDay) throw new Error("Missing shooting day fixture")
    shootingDay.revision += 1
    const conflict = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().code).toBe("RESOURCE_CONFLICT")
    expect(writes.shootingDayUpdates).toBe(0)
  })

  it("enforces project scope and write access for Agent shooting days", async () => {
    const { app, writes } = await createTestApp()
    const payload = {
      action: "create_shooting_day",
      teamId: "north",
      projectId: "winter-coffee",
      shootDate: "2026-09-06",
      dayNumber: 93,
      title: "只读成员拍摄日",
      originalTimezone: "Asia/Shanghai",
    }
    const outsideScope = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { ...payload, teamId: "external" },
    })
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload,
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(outsideScope.statusCode).toBe(403)
    expect(outsideScope.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(preview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(writes.shootingDayCreates).toBe(0)
  })

  it("creates a project execution stage once and replays the Agent result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_execution_stage",
        teamId: "north",
        projectId: "winter-coffee",
        name: "车站夜戏",
        startsAt: "2026-09-02T08:30:00.000Z",
        endsAt: "2026-09-02T18:00:00.000Z",
        originalTimezone: "Asia/Shanghai",
        owner: "顾遥",
        resources: [
          { id: "旧北站", type: "location", name: "旧北站" },
          { id: "rain-truck", type: "equipment", name: "雨车" },
        ],
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "创建执行阶段“车站夜戏”",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "execution_stage_created",
      item: {
        name: "车站夜戏",
        originalTimezone: "Asia/Shanghai",
        owner: "顾遥",
        state: "未开始",
        progress: 0,
        resources: [
          { id: "old-north-station", type: "location", name: "旧北站" },
          { id: "rain-truck", type: "equipment", name: "雨车" },
        ],
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.executionStageCreates).toBe(1)
  })

  it("updates a selected execution stage once and replays the Agent result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_execution_stage",
        teamId: "north",
        projectId: "winter-coffee",
        stageName: "车站补拍",
        progress: 65,
        owner: "周弥",
        state: "进行中",
        note: "夜戏准备完成",
        resources: [{ id: "旧北站", type: "location", name: "旧北站" }],
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      risk: "write",
      requiresConfirmation: false,
      summary: "更新执行阶段“车站补拍”",
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "execution_stage_updated",
      item: {
        name: "车站补拍",
        progress: 65,
        owner: "周弥",
        state: "进行中",
        note: "夜戏准备完成",
        revision: 2,
        resources: [{ id: "old-north-station", type: "location", name: "旧北站" }],
      },
    })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().replayed).toBe(true)
    expect(writes.executionStageUpdates).toBe(1)
  })

  it("requires one unambiguous execution stage and at least one update", async () => {
    const duplicate = {
      ...agentExecutionStage,
      id: "execution-stage-agent-2",
    }
    const { app } = await createTestApp({
      executionStages: [agentExecutionStage, duplicate],
    })
    const ambiguous = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_execution_stage",
        teamId: "north",
        projectId: "winter-coffee",
        stageName: "车站补拍",
        progress: 50,
      },
    })
    const unchanged = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_execution_stage",
        teamId: "north",
        projectId: "winter-coffee",
        stageId: agentExecutionStage.id,
      },
    })

    expect(ambiguous.statusCode).toBe(400)
    expect(ambiguous.json().code).toBe("AGENT_EXECUTION_STAGE_SELECTION_REQUIRED")
    expect(unchanged.statusCode).toBe(400)
    expect(unchanged.json().code).toBe("AGENT_EXECUTION_STAGE_UPDATE_REQUIRED")
  })

  it("rejects an execution stage update after its revision changes", async () => {
    const { app, executionStages, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_execution_stage",
        teamId: "north",
        projectId: "winter-coffee",
        stageId: agentExecutionStage.id,
        progress: 50,
      },
    })
    const stage = executionStages[0]
    if (!stage) throw new Error("Missing execution stage fixture")
    stage.revision += 1
    const conflict = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().code).toBe("RESOURCE_CONFLICT")
    expect(writes.executionStageUpdates).toBe(0)
  })

  it("enforces project scope and write access for Agent execution stage updates", async () => {
    const { app, writes } = await createTestApp()
    const payload = {
      action: "update_execution_stage",
      teamId: "north",
      projectId: "winter-coffee",
      stageId: agentExecutionStage.id,
      progress: 35,
    }
    const outsideScope = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { ...payload, teamId: "external" },
    })
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload,
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(outsideScope.statusCode).toBe(403)
    expect(outsideScope.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(preview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(writes.executionStageUpdates).toBe(0)
  })

  it("enforces project scope and write access for Agent execution stages", async () => {
    const { app, writes } = await createTestApp()
    const payload = {
      action: "create_execution_stage",
      teamId: "north",
      projectId: "winter-coffee",
      name: "只读成员排期",
      startsAt: "2026-09-02T08:30:00.000Z",
      endsAt: "2026-09-02T18:00:00.000Z",
      originalTimezone: "Asia/Shanghai",
      owner: "顾遥",
    }
    const outsideScope = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: { ...payload, teamId: "external" },
    })
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload,
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(outsideScope.statusCode).toBe(403)
    expect(outsideScope.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(preview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(writes.executionStageCreates).toBe(0)
  })

  it("requires confirmation before publishing a selected call sheet", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "publish_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        title: "车站补拍通告",
      },
    })
    const commandId = preview.json().commandId
    const blocked = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/confirm`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const executed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.json()).toMatchObject({ risk: "high", requiresConfirmation: true })
    expect(blocked.statusCode).toBe(409)
    expect(executed.json().result).toMatchObject({
      kind: "call_sheet_published",
      item: { status: "已发布", revision: 2 },
      publication: { version: 1 },
    })
    expect(writes.callSheetPublishes).toBe(1)
  })

  it("rejects a call sheet command whose project is outside the team scope", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_call_sheet",
        teamId: "external",
        projectId: "winter-coffee",
        date: "8 月 31 日",
        title: "越界通告",
      },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe("PROJECT_ACCESS_DENIED")
  })

  it("reports a missing call sheet selection without creating an intent", async () => {
    const { app } = await createTestApp()
    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "publish_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        title: "不存在的通告表",
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: "AGENT_CALL_SHEET_SELECTION_REQUIRED",
      message: "未找到匹配的待发布通告表",
    })
  })

  it("creates one timecoded review comment and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_review_comment",
        teamId: "north",
        projectId: "winter-coffee",
        fileName: "主片 v11",
        timecode: "00:07.120",
        text: "开场站台空镜再留 8 帧",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.json()).toMatchObject({ risk: "write", requiresConfirmation: false })
    expect(first.json().result).toMatchObject({
      kind: "review_comment_created",
      item: {
        fileId: agentReviewFile.id,
        version: "v11",
        timecode: "00:07.120",
        text: "开场站台空镜再留 8 帧",
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.reviewCommentCreates).toBe(1)
  })

  it("lists and compares review feedback through the stored Agent result", async () => {
    const compareFile: ReviewFile = {
      ...agentReviewFile,
      id: "review-file-agent-2",
      name: "主片 v12",
      version: "v12",
    }
    const compareComment: ReviewComment = {
      ...agentReviewComment,
      id: "review-comment-agent-2",
      fileId: compareFile.id,
      version: compareFile.version,
      timecode: "00:08.120",
      text: "新版空镜节奏已经调整",
    }
    const { app } = await createTestApp({
      reviewFiles: [agentReviewFile, compareFile],
      reviewComments: [agentReviewComment, compareComment],
    })
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "list_review_feedback",
        teamId: "north",
        projectId: "winter-coffee",
        primaryFileName: "主片 v12",
        compareFileName: "主片 v11",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      action: "list_review_feedback",
      risk: "read",
      requiresConfirmation: false,
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().result).toMatchObject({
      kind: "review_feedback_list",
      primaryFileId: compareFile.id,
      primaryComments: [{ id: compareComment.id }],
      compareFileId: agentReviewFile.id,
      compareComments: [{ id: agentReviewComment.id }],
      correspondence: {
        primaryFileId: compareFile.id,
        compareFileId: agentReviewFile.id,
        links: [],
        suggestions: [
          {
            commentId: compareComment.id,
            counterpartCommentId: agentReviewComment.id,
          },
        ],
      },
    })
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
  })

  it("creates one review version from a project asset and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_review_file",
        teamId: "north",
        projectId: "winter-coffee",
        assetId: "asset-ready-agent-1",
        name: "车站夜戏主片",
        version: "v14",
        duration: "00:30",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      action: "create_review_file",
      risk: "write",
      requiresConfirmation: false,
      summary: "从团队素材创建审片版本“车站夜戏主片 v14”",
    })
    expect(first.json().result).toMatchObject({
      kind: "review_file_created",
      item: {
        projectId: "winter-coffee",
        assetId: "asset-ready-agent-1",
        name: "车站夜戏主片",
        version: "v14",
        status: "待审阅",
        revision: 1,
      },
    })
    expect(replay.json()).toMatchObject({ replayed: true, result: first.json().result })
    expect(writes.reviewFileCreates).toBe(1)
  })

  it("rechecks review write permission before Agent review version creation", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "create_review_file",
        teamId: "north",
        projectId: "winter-coffee",
        assetId: "asset-ready-agent-1",
        name: "越权审片版本",
        version: "v14",
      },
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(preview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(writes.reviewFileCreates).toBe(0)
  })

  it("requires a unique review video before creating an intent", async () => {
    const { app } = await createTestApp({
      reviewFiles: [
        agentReviewFile,
        { ...agentReviewFile, id: "review-file-agent-2", name: "短版 v3" },
      ],
    })
    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_review_comment",
        teamId: "north",
        projectId: "winter-coffee",
        timecode: "00:07.120",
        text: "开场站台空镜再留 8 帧",
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: "AGENT_REVIEW_FILE_SELECTION_REQUIRED",
      message: "当前有多个审片视频，请明确文件名称",
    })
  })

  it("creates one confirmed customer review link and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_review_link",
        teamId: "north",
        projectId: "winter-coffee",
        fileName: "主片 v11",
      },
    })
    const commandId = preview.json().commandId
    const blocked = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/confirm`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const executed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      action: "create_review_link",
      risk: "high",
      requiresConfirmation: true,
      summary: "为审片视频“主片 v11”创建客户链接",
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().code).toBe("AGENT_CONFIRMATION_REQUIRED")
    expect(confirmed.statusCode).toBe(200)
    expect(executed.statusCode).toBe(200)
    expect(executed.json().result).toMatchObject({
      kind: "review_link_created",
      item: {
        fileIds: [agentReviewFile.id],
        scope: {
          canComment: true,
          canCompare: true,
          canDownload: false,
          canApprove: true,
        },
        expiresAt: "2026-09-06T00:00:00.000Z",
        url: agentReviewLink.url,
      },
    })
    expect(replay.json()).toMatchObject({
      replayed: true,
      result: executed.json().result,
    })
    expect(writes.reviewLinkCreates).toBe(1)
  })

  it("approves one confirmed review video and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "approve_review_file",
        teamId: "north",
        projectId: "winter-coffee",
        fileName: "主片 v11",
      },
    })
    const commandId = preview.json().commandId
    const blocked = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/confirm`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const executed = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.statusCode).toBe(201)
    expect(preview.json()).toMatchObject({
      action: "approve_review_file",
      risk: "high",
      requiresConfirmation: true,
      summary: "批准审片视频“主片 v11”",
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().code).toBe("AGENT_CONFIRMATION_REQUIRED")
    expect(confirmed.statusCode).toBe(200)
    expect(executed.json().result).toMatchObject({
      kind: "review_file_approved",
      item: {
        id: agentReviewFile.id,
        status: "已通过",
        approvedBy: "繁星",
        revision: 2,
      },
    })
    expect(replay.json()).toMatchObject({
      replayed: true,
      result: executed.json().result,
    })
    expect(writes.reviewFileApprovals).toBe(1)
  })

  it("rechecks review manage permission before Agent approval", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "approve_review_file",
        teamId: "north",
        projectId: "winter-coffee",
        fileId: agentReviewFile.id,
      },
    })
    await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/confirm`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(preview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(writes.reviewFileApprovals).toBe(0)
  })

  it("rejects an unavailable or ambiguous review link target before confirmation", async () => {
    const unavailable = {
      ...agentReviewFile,
      id: "review-file-not-ready",
      mediaReady: false,
    }
    const { app, writes } = await createTestApp({
      reviewFiles: [agentReviewFile, unavailable],
    })
    const missing = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_review_link",
        teamId: "north",
        projectId: "winter-coffee",
        fileId: unavailable.id,
      },
    })
    const ambiguous = await createTestApp({
      reviewFiles: [
        agentReviewFile,
        { ...agentReviewFile, id: "review-file-agent-2", name: "短版 v3" },
      ],
    })
    const ambiguousResponse = await ambiguous.app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_review_link",
        teamId: "north",
        projectId: "winter-coffee",
      },
    })

    expect(missing.statusCode).toBe(400)
    expect(missing.json().code).toBe("AGENT_REVIEW_FILE_SELECTION_REQUIRED")
    expect(ambiguousResponse.statusCode).toBe(400)
    expect(ambiguousResponse.json().code).toBe("AGENT_REVIEW_FILE_SELECTION_REQUIRED")
    expect(writes.reviewLinkCreates).toBe(0)
  })

  it("rechecks review manage permission when the confirmed link is executed", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        action: "create_review_link",
        teamId: "north",
        projectId: "winter-coffee",
        fileId: agentReviewFile.id,
      },
    })
    await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/confirm`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })
    const denied = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${preview.json().commandId}/execute`,
      headers: { "x-shadow-account-id": "account-viewer" },
    })

    expect(preview.statusCode).toBe(201)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe("PROJECT_ACCESS_DENIED")
    expect(writes.reviewLinkCreates).toBe(0)
  })

  it("creates one team-visible portfolio draft and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "create_portfolio",
        teamId: "north",
        title: "冬夜咖啡幕后制作",
        category: "幕后纪录",
        year: "2026",
        description: "车站夜戏制作过程",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.json()).toMatchObject({ risk: "write", requiresConfirmation: false })
    expect(first.json().result).toMatchObject({
      kind: "portfolio_created",
      item: {
        title: "冬夜咖啡幕后制作",
        category: "幕后纪录",
        year: "2026",
        state: "团队可见",
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.portfolioCreates).toBe(1)
  })

  it("adds one approved video to a portfolio and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "add_portfolio_content",
        teamId: "north",
        portfolioTitle: "冬夜咖啡",
        fileName: "冬夜咖啡 · 主片 v11",
        caption: "车站夜戏最终版本",
        featured: true,
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.json()).toMatchObject({ risk: "write", requiresConfirmation: false })
    expect(first.json().result).toMatchObject({
      kind: "portfolio_content_added",
      item: {
        id: agentPortfolio.id,
        revision: 2,
        contents: [
          {
            reviewFileId: agentPortfolioCandidate.reviewFileId,
            caption: "车站夜戏最终版本",
            featured: true,
          },
        ],
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.portfolioContentAdds).toBe(1)
  })

  it("resolves one selected review comment and replays the stored result", async () => {
    const { app, writes } = await createTestApp()
    const preview = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_review_comment",
        teamId: "north",
        projectId: "winter-coffee",
        fileName: "主片 v11",
        timecode: "00:07.120",
        state: "resolved",
      },
    })
    const commandId = preview.json().commandId
    const first = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })
    const replay = await app.inject({
      method: "POST",
      url: `/v1/agent/commands/${commandId}/execute`,
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(preview.json()).toMatchObject({ risk: "write", requiresConfirmation: false })
    expect(first.json().result).toMatchObject({
      kind: "review_comment_updated",
      item: {
        id: agentReviewComment.id,
        state: "resolved",
        revision: 2,
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(writes.reviewCommentUpdates).toBe(1)
  })

  it("requires a unique review comment before creating an update intent", async () => {
    const { app } = await createTestApp({
      reviewComments: [
        agentReviewComment,
        { ...agentReviewComment, id: "review-comment-agent-2" },
      ],
    })
    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/commands/preview",
      headers: { "x-shadow-account-id": "account-fanxing" },
      payload: {
        action: "update_review_comment",
        teamId: "north",
        projectId: "winter-coffee",
        fileName: "主片 v11",
        timecode: "00:07.120",
        state: "resolved",
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: "AGENT_REVIEW_COMMENT_SELECTION_REQUIRED",
      message: "匹配到多条审片意见，请补充时间码或完整意见内容",
    })
  })
})
