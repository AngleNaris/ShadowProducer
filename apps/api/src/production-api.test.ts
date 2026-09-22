import type {
  ConfirmBreakdownCommand,
  CreateCallSheetCommand,
  CreateExecutionStageCommand,
  CreateReviewCommentCommand,
  CreateReviewCommentLinkCommand,
  CreateReviewFileCommand,
  CreateReviewFolderCommand,
  CreateShootingDayCommand,
  GeneratedCallSheetDraft,
  MergeBreakdownCommand,
  MoveReviewFileCommand,
  PermanentlyDeleteReviewFileCommand,
  ProductionRepository,
  PublishCallSheetCommand,
  ReviewFileApprovalCommand,
  ScriptRepository,
  ScriptWorkspaceData,
  SplitBreakdownCommand,
  UnlinkReviewCommentLinkCommand,
  UpdateBreakdownCommand,
  UpdateBreakdownResult,
  UpdateCallSheetCommand,
  UpdateExecutionStageCommand,
  UpdateResult,
  UpdateReviewCommentCommand,
  UpdateReviewFileArchiveCommand,
  UpdateReviewFolderCommand,
  UpdateShootingDayCommand,
} from "@shadowproducer/application"
import { AppError, ProductionService, ScriptService } from "@shadowproducer/application"
import type {
  BreakdownItem,
  CallSheet,
  CallSheetChange,
  CallSheetPublication,
  ExecutionConflict,
  ExecutionStage,
  ReviewComment,
  ReviewCommentLink,
  ReviewFile,
  ReviewFolder,
  ShootingDay,
} from "@shadowproducer/contracts"
import { createScriptFixture } from "@shadowproducer/test-fixtures"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"

const now = "2026-08-28T08:00:00.000Z"

class MemoryProductionRepository implements ProductionRepository {
  readonly breakdown: BreakdownItem[] = [
    {
      id: "breakdown-1",
      projectId: "winter-coffee",
      category: "cast",
      item: "顾遥",
      requirementType: "主要角色",
      specification: "夜雨环境",
      quantity: "演员 1 人",
      preparation: "确认档期并准备雨戏替换服装",
      department: "演员统筹",
      agentAssessment: "剧本明确出现主要角色",
      sourceDocument: "拍摄稿",
      sourceVersion: "v7",
      sourceLocation: "场 12",
      source: "拍摄稿 v7 · 场 12",
      excerpt: "顾遥走入站台。",
      confidence: 98,
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
      updatedAt: now,
    },
    {
      id: "breakdown-2",
      projectId: "winter-coffee",
      category: "cast",
      item: "站台群演",
      requirementType: "群演",
      specification: "夜雨环境，4 人",
      quantity: "4 人",
      preparation: "确认身高层次并准备雨具",
      department: "演员统筹",
      agentAssessment: "场景动作需要背景表演",
      sourceDocument: "拍摄稿",
      sourceVersion: "v7",
      sourceLocation: "场 12",
      source: "拍摄稿 v7 · 场 12",
      excerpt: "站台群演从顾遥身后经过。",
      confidence: 94,
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
      updatedAt: now,
    },
    {
      id: "breakdown-location",
      projectId: "winter-coffee",
      category: "location",
      item: "旧站台",
      requirementType: "拍摄场地",
      specification: "封闭站台半幅",
      quantity: "1 处",
      preparation: "确认许可、封控和轨道安全",
      department: "制片组",
      agentAssessment: "场景明确指定旧站台",
      sourceDocument: "拍摄稿",
      sourceVersion: "v7",
      sourceLocation: "场 12",
      source: "拍摄稿 v7 · 场 12",
      excerpt: "内景，旧站台，夜。",
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
      updatedAt: now,
    },
    {
      id: "breakdown-other-project",
      projectId: "city-walk",
      category: "cast",
      item: "游客",
      requirementType: "群演",
      specification: "日景",
      quantity: "6 人",
      preparation: "准备日常服装并确认肖像授权",
      department: "演员统筹",
      agentAssessment: "街景需要背景人群",
      sourceDocument: "城市慢行",
      sourceVersion: "v2",
      sourceLocation: "场 3",
      source: "城市慢行 v2 · 场 3",
      excerpt: "游客穿过路口。",
      confidence: 90,
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
      updatedAt: now,
    },
  ]
  readonly callSheets: CallSheet[] = []
  readonly shootingDays: ShootingDay[] = [
    {
      id: "shooting-day-winter-1",
      projectId: "winter-coffee",
      shootDate: "2026-08-19",
      dayNumber: 5,
      title: "车站夜戏",
      status: "已确认",
      originalTimezone: "Asia/Shanghai",
      revision: 1,
      updatedAt: now,
    },
    {
      id: "shooting-day-city-1",
      projectId: "city-walk",
      shootDate: "2026-08-19",
      dayNumber: 1,
      title: "城市晨景",
      status: "已确认",
      originalTimezone: "Asia/Shanghai",
      revision: 1,
      updatedAt: now,
    },
  ]
  readonly callSheetPublications: CallSheetPublication[] = []
  readonly callSheetChanges: CallSheetChange[] = []
  readonly executionStages: ExecutionStage[] = []
  readonly reviewFiles: ReviewFile[] = [
    {
      id: "review-file-1",
      projectId: "winter-coffee",
      assetId: "asset-already-reviewed",
      folderId: null,
      name: "冬夜咖啡_主片",
      version: "v12",
      type: "video",
      status: "审阅中",
      comments: 0,
      updated: "今天 10:26",
      duration: "00:30",
      approvedBy: null,
      approvedAt: null,
      mediaReady: true,
      revision: 1,
    },
  ]
  readonly reviewComments: ReviewComment[] = []
  readonly reviewCommentLinks: ReviewCommentLink[] = []
  readonly reviewFolders: ReviewFolder[] = []
  readonly reviewSources = [
    {
      id: "asset-already-reviewed",
      projectId: "winter-coffee",
      kind: "视频",
      status: "ready",
      archived: false,
      objectKey: "north/winter-coffee/already-reviewed.mp4",
    },
    {
      id: "asset-review-ready",
      projectId: "winter-coffee",
      kind: "视频",
      status: "ready",
      archived: false,
      objectKey: "north/winter-coffee/review-ready.mp4",
    },
    {
      id: "asset-review-image",
      projectId: "winter-coffee",
      kind: "图片",
      status: "ready",
      archived: false,
      objectKey: "north/winter-coffee/review-image.png",
    },
    {
      id: "asset-review-uploading",
      projectId: "winter-coffee",
      kind: "视频",
      status: "uploading",
      archived: false,
      objectKey: "north/winter-coffee/review-uploading.mp4",
    },
    {
      id: "asset-review-archived",
      projectId: "winter-coffee",
      kind: "视频",
      status: "ready",
      archived: true,
      objectKey: "north/winter-coffee/review-archived.mp4",
    },
    {
      id: "asset-review-team-library",
      projectId: null,
      kind: "视频",
      status: "ready",
      archived: false,
      objectKey: "north/team-library/review-team.mp4",
    },
  ]
  private readonly callSheetReceipts = new Map<string, CallSheet>()
  private readonly callSheetPublishReceipts = new Map<
    string,
    { fingerprint: string; item: CallSheet; publication: CallSheetPublication }
  >()
  private readonly executionStageReceipts = new Map<
    string,
    { fingerprint: string; item: ExecutionStage }
  >()
  private readonly shootingDayReceipts = new Map<
    string,
    { fingerprint: string; item: ShootingDay }
  >()
  private readonly breakdownReceipts = new Map<
    string,
    { fingerprint: string; items: BreakdownItem[] }
  >()
  private readonly breakdownRewriteReceipts = new Map<
    string,
    { fingerprint: string; items: BreakdownItem[] }
  >()
  private readonly reviewCommentReceipts = new Map<string, ReviewComment>()
  private readonly reviewCommentLinkReceipts = new Map<string, ReviewCommentLink>()
  private readonly reviewFileReceipts = new Map<
    string,
    { fingerprint: string; item: ReviewFile }
  >()
  private readonly reviewFileCreateReceipts = new Map<
    string,
    { fingerprint: string; item: ReviewFile }
  >()
  private readonly reviewFolderCreateReceipts = new Map<
    string,
    { fingerprint: string; item: ReviewFolder }
  >()
  private readonly reviewFileMoveReceipts = new Map<
    string,
    { fingerprint: string; item: ReviewFile }
  >()
  private readonly reviewFileArchiveReceipts = new Map<
    string,
    { fingerprint: string; item: ReviewFile }
  >()
  private readonly archivedReviewFileIds = new Set<string>()
  readonly portfolioReviewFileIds = new Set<string>()

  async getProjectAccess(actorId: string, projectId: string) {
    if (projectId !== "winter-coffee") return null
    if (actorId === "account-fanxing") return { canRead: true, canWrite: true }
    if (actorId === "account-viewer") return { canRead: true, canWrite: false }
    return null
  }

  async listBreakdown(projectId: string) {
    return structuredClone(this.breakdown.filter((item) => item.projectId === projectId))
  }

  async listBreakdownRelationOptions(projectId: string) {
    if (projectId !== "winter-coffee") {
      return { members: [], tasks: [], contacts: [], shootingDays: [], callSheets: [] }
    }
    return {
      members: [
        { accountId: "account-fanxing", displayName: "繁星", role: "producer" },
        { accountId: "account-director", displayName: "林乔", role: "director" },
      ],
      tasks: [
        {
          id: "task-winter-coffee",
          title: "车站夜戏执行",
          status: "进行中",
          assigneeName: "繁星",
        },
      ],
      contacts: [
        {
          id: "team-contact-rain-fx",
          source: "team" as const,
          name: "赵衡",
          role: "现场特效协调",
          company: "远景现场特效",
        },
        {
          id: "personal-contact-linqiao",
          source: "member-shared" as const,
          name: "林乔",
          role: "导演",
          company: null,
        },
      ],
      shootingDays: this.shootingDays
        .filter((item) => item.projectId === projectId)
        .map(({ id, shootDate, dayNumber, title, status }) => ({
          id,
          shootDate,
          dayNumber,
          title,
          status,
        })),
      callSheets: [
        {
          id: "call-sheet-winter-1",
          date: "8 月 19 日",
          day: "拍摄第 5 天",
          title: "车站夜戏",
          status: "已发布" as const,
        },
        {
          id: "call-sheet-winter-2",
          date: "8 月 20 日",
          day: "拍摄第 6 天",
          title: "站台出口与清晨补景",
          status: "草稿" as const,
        },
      ],
    }
  }

  async updateBreakdown(command: UpdateBreakdownCommand): Promise<UpdateBreakdownResult> {
    const item = this.breakdown.find(
      (entry) => entry.id === command.itemId && entry.projectId === command.projectId,
    )
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (
      command.supplierIds !== undefined ||
      command.responsibleAccountId !== undefined ||
      command.taskIds !== undefined ||
      command.contactRefs !== undefined ||
      command.shootingDayIds !== undefined ||
      command.callSheetIds !== undefined
    ) {
      if (item.state !== "已确认") return { kind: "invalid_state" }
    }
    if (command.supplierIds !== undefined) {
      if (command.supplierIds.some((id) => id !== "supplier-rain-fx")) {
        return { kind: "invalid_supplier" }
      }
      item.supplierIds = [...command.supplierIds]
    }
    if (
      command.responsibleAccountId !== undefined &&
      command.responsibleAccountId !== null &&
      !["account-fanxing", "account-director"].includes(command.responsibleAccountId)
    ) {
      return { kind: "invalid_responsible" }
    }
    if (command.taskIds?.some((id) => id !== "task-winter-coffee")) {
      return { kind: "invalid_task" }
    }
    const allowedContacts = new Set([
      "team:team-contact-rain-fx",
      "member-shared:personal-contact-linqiao",
    ])
    if (
      command.contactRefs?.some(
        (contact) => !allowedContacts.has(`${contact.source}:${contact.contactId}`),
      )
    ) {
      return { kind: "invalid_contact" }
    }
    if (command.shootingDayIds?.some((id) => id !== "shooting-day-winter-1")) {
      return { kind: "invalid_shooting_day" }
    }
    if (
      command.callSheetIds?.some(
        (id) => !["call-sheet-winter-1", "call-sheet-winter-2"].includes(id),
      )
    ) {
      return { kind: "invalid_call_sheet" }
    }
    if (command.responsibleAccountId !== undefined) {
      item.responsibleAccountId = command.responsibleAccountId
      item.responsibleName =
        command.responsibleAccountId === "account-director"
          ? "林乔"
          : command.responsibleAccountId === "account-fanxing"
            ? "繁星"
            : null
    }
    if (command.taskIds !== undefined) item.taskIds = [...command.taskIds]
    if (command.contactRefs !== undefined) item.contactRefs = [...command.contactRefs]
    if (command.shootingDayIds !== undefined) {
      item.shootingDayIds = [...command.shootingDayIds]
    }
    if (command.callSheetIds !== undefined) item.callSheetIds = [...command.callSheetIds]
    if (command.item !== undefined) item.item = command.item
    if (command.requirementType !== undefined)
      item.requirementType = command.requirementType
    if (command.specification !== undefined) item.specification = command.specification
    if (command.quantity !== undefined) item.quantity = command.quantity
    if (command.preparation !== undefined) item.preparation = command.preparation
    if (command.department !== undefined) item.department = command.department
    if (command.state !== undefined) item.state = command.state
    item.revision += 1
    item.updatedAt = now
    return { kind: "ok", item: structuredClone(item) }
  }

  async confirmBreakdown(command: ConfirmBreakdownCommand) {
    const receiptKey = `${command.actorId}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify({
      projectId: command.projectId,
      category: command.category,
      items: command.items,
    })
    const receipt = this.breakdownReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { items: structuredClone(receipt.items), replayed: true }
    }

    const items = command.items.map(({ itemId }) =>
      this.breakdown.find(
        (entry) => entry.id === itemId && entry.projectId === command.projectId,
      ),
    )
    if (items.some((item) => !item)) return { kind: "not_found" } as const
    const selected = items as BreakdownItem[]
    if (
      selected.some(
        (item) => item.category !== command.category || item.state !== "待确认",
      )
    ) {
      return { kind: "invalid_selection" } as const
    }
    const expected = new Map(
      command.items.map((item) => [item.itemId, item.expectedRevision]),
    )
    if (selected.some((item) => item.revision !== expected.get(item.id))) {
      return { kind: "conflict" } as const
    }

    selected.forEach((item) => {
      item.state = "已确认"
      item.revision += 1
      item.updatedAt = now
    })
    const result = structuredClone(selected)
    this.breakdownReceipts.set(receiptKey, { fingerprint, items: result })
    return { items: result, replayed: false }
  }

  async mergeBreakdown(command: MergeBreakdownCommand) {
    const receiptKey = `${command.actorId}:merge:${command.idempotencyKey}`
    const fingerprint = JSON.stringify(command)
    const receipt = this.breakdownRewriteReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { items: structuredClone(receipt.items), replayed: true }
    }
    const selected = command.items.map(({ itemId }) =>
      this.breakdown.find(
        (entry) => entry.id === itemId && entry.projectId === command.projectId,
      ),
    )
    if (selected.some((item) => !item)) return { kind: "not_found" } as const
    const rows = selected as BreakdownItem[]
    const expected = new Map(
      command.items.map((item) => [item.itemId, item.expectedRevision]),
    )
    const primary = rows.find((item) => item.id === command.primaryItemId)
    if (
      !primary ||
      rows.some((item) => item.category !== command.category || item.state !== "待确认")
    ) {
      return { kind: "invalid_selection" } as const
    }
    if (rows.some((item) => item.revision !== expected.get(item.id))) {
      return { kind: "conflict" } as const
    }
    const merged: BreakdownItem = {
      ...structuredClone(primary),
      ...command.result,
      id: `breakdown-merged-${this.breakdown.length + 1}`,
      state: "待确认",
      parentItemId: null,
      mergedIntoItemId: null,
      revision: 1,
      updatedAt: now,
    }
    rows.forEach((item) => {
      item.state = "已取消"
      item.mergedIntoItemId = merged.id
      item.revision += 1
      item.updatedAt = now
    })
    this.breakdown.push(merged)
    const items = structuredClone([merged, ...rows])
    this.breakdownRewriteReceipts.set(receiptKey, { fingerprint, items })
    return { items, replayed: false }
  }

  async splitBreakdown(command: SplitBreakdownCommand) {
    const receiptKey = `${command.actorId}:split:${command.idempotencyKey}`
    const fingerprint = JSON.stringify(command)
    const receipt = this.breakdownRewriteReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { items: structuredClone(receipt.items), replayed: true }
    }
    const parent = this.breakdown.find(
      (item) => item.id === command.itemId && item.projectId === command.projectId,
    )
    if (!parent) return { kind: "not_found" } as const
    if (parent.state !== "待确认") return { kind: "invalid_selection" } as const
    if (parent.revision !== command.expectedRevision) return { kind: "conflict" } as const
    const children = command.items.map(
      (draft, index): BreakdownItem => ({
        ...structuredClone(parent),
        ...draft,
        id: `breakdown-split-${this.breakdown.length + index + 1}`,
        state: "待确认",
        parentItemId: parent.id,
        mergedIntoItemId: null,
        revision: 1,
        updatedAt: now,
      }),
    )
    parent.state = "已取消"
    parent.revision += 1
    parent.updatedAt = now
    this.breakdown.push(...children)
    const items = structuredClone([parent, ...children])
    this.breakdownRewriteReceipts.set(receiptKey, { fingerprint, items })
    return { items, replayed: false }
  }

  async listCallSheets(projectId: string) {
    return structuredClone(this.callSheets.filter((item) => item.projectId === projectId))
  }

  async listShootingDays(projectId: string) {
    return structuredClone(
      this.shootingDays.filter((item) => item.projectId === projectId),
    )
  }

  async createShootingDay(command: CreateShootingDayCommand) {
    const key = `${command.actorId}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify(command)
    const receipt = this.shootingDayReceipts.get(key)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { item: structuredClone(receipt.item), replayed: true }
    }
    if (
      this.shootingDays.some(
        (item) =>
          item.projectId === command.projectId &&
          (item.shootDate === command.shootDate || item.dayNumber === command.dayNumber),
      )
    ) {
      return { kind: "duplicate" } as const
    }
    const item: ShootingDay = {
      id: `shooting-day-${this.shootingDays.length + 1}`,
      projectId: command.projectId,
      shootDate: command.shootDate,
      dayNumber: command.dayNumber,
      title: command.title,
      status: "草稿",
      originalTimezone: command.originalTimezone,
      revision: 1,
      updatedAt: now,
    }
    this.shootingDays.push(item)
    this.shootingDayReceipts.set(key, { fingerprint, item: structuredClone(item) })
    return { item: structuredClone(item), replayed: false }
  }

  async updateShootingDay(command: UpdateShootingDayCommand) {
    const item = this.shootingDays.find(
      (entry) => entry.id === command.itemId && entry.projectId === command.projectId,
    )
    if (!item) return { kind: "not_found" } as const
    if (item.revision !== command.expectedRevision) return { kind: "conflict" } as const
    if (
      this.shootingDays.some(
        (entry) =>
          entry.id !== item.id &&
          entry.projectId === command.projectId &&
          (entry.shootDate === (command.shootDate ?? item.shootDate) ||
            entry.dayNumber === (command.dayNumber ?? item.dayNumber)),
      )
    ) {
      return { kind: "duplicate" } as const
    }
    if (command.shootDate !== undefined) item.shootDate = command.shootDate
    if (command.dayNumber !== undefined) item.dayNumber = command.dayNumber
    if (command.title !== undefined) item.title = command.title
    if (command.status !== undefined) item.status = command.status
    if (command.originalTimezone !== undefined)
      item.originalTimezone = command.originalTimezone
    item.revision += 1
    item.updatedAt = now
    return { kind: "ok", item: structuredClone(item) } as const
  }

  async listExecutionSchedule(_actorId: string, projectId: string) {
    const items = this.executionStages.filter((item) => item.projectId === projectId)
    const conflicts: ExecutionConflict[] = []
    const seen = new Set<string>()
    for (const item of items) {
      for (const other of this.executionStages) {
        if (
          item.id === other.id ||
          item.startsAt >= other.endsAt ||
          other.startsAt >= item.endsAt
        ) {
          continue
        }
        for (const resource of item.resources) {
          if (
            !other.resources.some(
              (candidate) =>
                candidate.type === resource.type && candidate.id === resource.id,
            )
          ) {
            continue
          }
          const pair = [item.id, other.id].sort().join(":")
          const key = `${pair}:${resource.type}:${resource.id}`
          if (seen.has(key)) continue
          seen.add(key)
          const redacted = other.projectId !== projectId
          conflicts.push({
            key,
            resource,
            itemId: item.id,
            itemName: item.name,
            conflictingItemId: redacted ? null : other.id,
            conflictingProjectId: redacted ? null : other.projectId,
            conflictingItemName: redacted ? "其他项目占用" : other.name,
            startsAt: item.startsAt > other.startsAt ? item.startsAt : other.startsAt,
            endsAt: item.endsAt < other.endsAt ? item.endsAt : other.endsAt,
            crossProject: redacted,
            redacted,
          })
        }
      }
    }
    return { items: structuredClone(items), conflicts: structuredClone(conflicts) }
  }

  async createExecutionStage(command: CreateExecutionStageCommand) {
    const key = `${command.actorId}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify(command)
    const receipt = this.executionStageReceipts.get(key)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { item: structuredClone(receipt.item), replayed: true }
    }
    const item: ExecutionStage = {
      id: `execution-stage-${this.executionStages.length + 1}`,
      projectId: command.projectId,
      name: command.name,
      startsAt: command.startsAt,
      endsAt: command.endsAt,
      originalTimezone: command.originalTimezone,
      progress: command.progress,
      owner: command.owner,
      state: command.state,
      note: command.note,
      resources: structuredClone(command.resources),
      revision: 1,
      updatedAt: now,
    }
    this.executionStages.push(item)
    this.executionStageReceipts.set(key, {
      fingerprint,
      item: structuredClone(item),
    })
    return { item: structuredClone(item), replayed: false }
  }

  async updateExecutionStage(
    command: UpdateExecutionStageCommand,
  ): Promise<UpdateResult<ExecutionStage>> {
    const item = this.executionStages.find(
      (entry) => entry.id === command.itemId && entry.projectId === command.projectId,
    )
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (command.name !== undefined) item.name = command.name
    if (command.startsAt !== undefined) item.startsAt = command.startsAt
    if (command.endsAt !== undefined) item.endsAt = command.endsAt
    if (command.originalTimezone !== undefined) {
      item.originalTimezone = command.originalTimezone
    }
    if (command.progress !== undefined) item.progress = command.progress
    if (command.owner !== undefined) item.owner = command.owner
    if (command.state !== undefined) item.state = command.state
    if (command.note !== undefined) item.note = command.note
    if (command.resources !== undefined)
      item.resources = structuredClone(command.resources)
    item.revision += 1
    item.updatedAt = now
    return { kind: "ok", item: structuredClone(item) }
  }

  async createCallSheet(
    command: CreateCallSheetCommand,
    draft?: GeneratedCallSheetDraft,
  ) {
    const receipt = this.callSheetReceipts.get(command.idempotencyKey)
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const shootingDay = command.shootingDayId
      ? this.shootingDays.find(
          (item) =>
            item.id === command.shootingDayId && item.projectId === command.projectId,
        )
      : null
    if (command.shootingDayId && !shootingDay) {
      throw new AppError(
        "CALL_SHEET_SHOOTING_DAY_UNAVAILABLE",
        "所选拍摄日不属于当前项目",
        400,
      )
    }
    const item: CallSheet = {
      id: `call-sheet-${this.callSheets.length + 1}`,
      projectId: command.projectId,
      shootingDayId: shootingDay?.id ?? null,
      date: shootingDay?.shootDate ?? command.date ?? "待安排",
      day: shootingDay ? `拍摄第 ${shootingDay.dayNumber} 天` : "待安排",
      title: command.title ?? shootingDay?.title ?? "未命名通告",
      status: "草稿",
      crewCall: "",
      firstShot: "",
      wrap: "",
      weather: "",
      sunrise: "",
      sunset: "",
      basecamp: "",
      location: draft?.location ?? "",
      hospital: "",
      scenes: structuredClone(draft?.scenes ?? []),
      cast: structuredClone(draft?.cast ?? []),
      departments: structuredClone(draft?.departments ?? []),
      equipment: structuredClone(draft?.equipment ?? []),
      safety: structuredClone(draft?.safety ?? []),
      transport: [],
      catering: [],
      keyContacts: structuredClone(draft?.keyContacts ?? []),
      nextDayPreview: { date: "", title: "", scenes: "", cast: "", note: "" },
      revision: 1,
      updatedAt: now,
    }
    this.callSheets.push(item)
    for (const breakdownItemId of draft?.breakdownItemIds ?? []) {
      const breakdownItem = this.breakdown.find((entry) => entry.id === breakdownItemId)
      if (breakdownItem && !breakdownItem.callSheetIds.includes(item.id)) {
        breakdownItem.callSheetIds.push(item.id)
      }
    }
    this.callSheetReceipts.set(command.idempotencyKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async listCallSheetHistory(projectId: string, itemId: string, _actorId: string) {
    const item = this.callSheets.find(
      (entry) => entry.id === itemId && entry.projectId === projectId,
    )
    if (!item) return null
    return {
      publications: structuredClone(
        this.callSheetPublications
          .filter((entry) => entry.callSheetId === itemId)
          .sort((left, right) => right.version - left.version),
      ),
      changes: structuredClone(
        this.callSheetChanges.filter((entry) => entry.callSheetId === itemId),
      ),
    }
  }

  async updateCallSheet(
    command: UpdateCallSheetCommand,
  ): Promise<UpdateResult<CallSheet>> {
    const item = this.callSheets.find(
      (entry) => entry.id === command.itemId && entry.projectId === command.projectId,
    )
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    const before = structuredClone(item)
    if (command.date !== undefined) item.date = command.date
    if (command.day !== undefined) item.day = command.day
    if (command.title !== undefined) item.title = command.title
    if (command.status !== undefined) item.status = command.status
    if (command.crewCall !== undefined) item.crewCall = command.crewCall
    if (command.firstShot !== undefined) item.firstShot = command.firstShot
    if (command.wrap !== undefined) item.wrap = command.wrap
    if (command.weather !== undefined) item.weather = command.weather
    if (command.sunrise !== undefined) item.sunrise = command.sunrise
    if (command.sunset !== undefined) item.sunset = command.sunset
    if (command.basecamp !== undefined) item.basecamp = command.basecamp
    if (command.location !== undefined) item.location = command.location
    if (command.hospital !== undefined) item.hospital = command.hospital
    if (command.scenes !== undefined) item.scenes = structuredClone(command.scenes)
    if (command.cast !== undefined) item.cast = structuredClone(command.cast)
    if (command.departments !== undefined) {
      item.departments = structuredClone(command.departments)
    }
    if (command.equipment !== undefined)
      item.equipment = structuredClone(command.equipment)
    if (command.safety !== undefined) item.safety = structuredClone(command.safety)
    if (command.transport !== undefined)
      item.transport = structuredClone(command.transport)
    if (command.catering !== undefined) item.catering = structuredClone(command.catering)
    if (command.keyContacts !== undefined) {
      item.keyContacts = structuredClone(command.keyContacts)
    }
    if (command.nextDayPreview !== undefined) {
      item.nextDayPreview = structuredClone(command.nextDayPreview)
    }
    if (before.status === "已发布" && command.status === undefined) {
      item.status = "待确认"
    }
    item.revision += 1
    item.updatedAt = now
    if (before.status === "已发布") {
      const basePublication = this.callSheetPublications
        .filter((entry) => entry.callSheetId === item.id)
        .sort((left, right) => right.version - left.version)[0]
      this.callSheetChanges.unshift({
        id: `call-sheet-change-${this.callSheetChanges.length + 1}`,
        callSheetId: item.id,
        basePublicationVersion: basePublication?.version ?? null,
        summary: command.changeSummary?.trim() || "已发布通告内容更新",
        beforeSnapshot: before,
        afterSnapshot: structuredClone(item),
        changedBy: "繁星",
        changedAt: now,
      })
    }
    return { kind: "ok", item: structuredClone(item) }
  }

  async publishCallSheet(command: PublishCallSheetCommand) {
    const receiptKey = `${command.actorId}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify({
      projectId: command.projectId,
      itemId: command.itemId,
      expectedRevision: command.expectedRevision,
    })
    const receipt = this.callSheetPublishReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return {
        item: structuredClone(receipt.item),
        publication: structuredClone(receipt.publication),
        replayed: true,
      }
    }
    const item = this.callSheets.find(
      (entry) => entry.id === command.itemId && entry.projectId === command.projectId,
    )
    if (!item) return { kind: "not_found" } as const
    if (item.revision !== command.expectedRevision) return { kind: "conflict" } as const
    if (item.status === "已发布") return { kind: "already_published" } as const
    item.status = "已发布"
    item.revision += 1
    item.updatedAt = now
    const publication: CallSheetPublication = {
      id: `call-sheet-publication-${this.callSheetPublications.length + 1}`,
      callSheetId: item.id,
      version:
        this.callSheetPublications.filter((entry) => entry.callSheetId === item.id)
          .length + 1,
      snapshot: structuredClone(item),
      publishedBy: "繁星",
      publishedAt: now,
      recipients: [],
    }
    this.callSheetPublications.unshift(publication)
    this.callSheetPublishReceipts.set(receiptKey, {
      fingerprint,
      item: structuredClone(item),
      publication: structuredClone(publication),
    })
    return {
      item: structuredClone(item),
      publication: structuredClone(publication),
      replayed: false,
    }
  }

  async listReviewFiles(projectId: string, archived = false) {
    return structuredClone(
      this.reviewFiles.filter(
        (item) =>
          item.projectId === projectId &&
          this.archivedReviewFileIds.has(item.id) === archived,
      ),
    )
  }

  async listReviewFolders(projectId: string, archived = false) {
    return structuredClone(
      this.reviewFolders.filter(
        (item) => item.projectId === projectId && item.archived === archived,
      ),
    )
  }

  async createReviewFolder(command: CreateReviewFolderCommand) {
    const receiptKey = `${command.actorId}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify({
      projectId: command.projectId,
      name: command.name,
    })
    const receipt = this.reviewFolderCreateReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { item: structuredClone(receipt.item), replayed: true }
    }
    if (
      this.reviewFolders.some(
        (item) =>
          item.projectId === command.projectId &&
          !item.archived &&
          item.name.toLocaleLowerCase() === command.name.toLocaleLowerCase(),
      )
    ) {
      return { kind: "already_exists" } as const
    }
    const item: ReviewFolder = {
      id: `review-folder-${this.reviewFolders.length + 1}`,
      projectId: command.projectId,
      name: command.name,
      archived: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    }
    this.reviewFolders.push(item)
    this.reviewFolderCreateReceipts.set(receiptKey, {
      fingerprint,
      item: structuredClone(item),
    })
    return { item: structuredClone(item), replayed: false }
  }

  async updateReviewFolder(
    command: UpdateReviewFolderCommand,
  ): Promise<UpdateResult<ReviewFolder>> {
    const item = this.reviewFolders.find(
      (folder) =>
        folder.id === command.folderId &&
        folder.projectId === command.projectId &&
        folder.archived !== command.archived,
    )
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (
      command.archived &&
      this.reviewFiles.some(
        (file) => file.projectId === command.projectId && file.folderId === item.id,
      )
    ) {
      throw new AppError("REVIEW_FOLDER_NOT_EMPTY", "仅空文件夹可以移入回收站", 409)
    }
    if (
      !command.archived &&
      this.reviewFolders.some(
        (folder) =>
          folder.id !== item.id &&
          folder.projectId === command.projectId &&
          !folder.archived &&
          folder.name.toLocaleLowerCase() === item.name.toLocaleLowerCase(),
      )
    ) {
      throw new AppError("REVIEW_FOLDER_EXISTS", "当前项目已存在同名文件夹", 409)
    }
    item.archived = command.archived
    item.revision += 1
    item.updatedAt = now
    return { kind: "ok", item: structuredClone(item) }
  }

  async moveReviewFile(command: MoveReviewFileCommand) {
    const receiptKey = `${command.actorId}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify({
      projectId: command.projectId,
      fileId: command.fileId,
      folderId: command.folderId,
      expectedRevision: command.expectedRevision,
    })
    const receipt = this.reviewFileMoveReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { item: structuredClone(receipt.item), replayed: true }
    }
    if (
      command.folderId &&
      !this.reviewFolders.some(
        (folder) =>
          folder.id === command.folderId &&
          folder.projectId === command.projectId &&
          !folder.archived,
      )
    ) {
      return { kind: "invalid_folder" } as const
    }
    const item = this.reviewFiles.find(
      (file) =>
        file.id === command.fileId &&
        file.projectId === command.projectId &&
        !this.archivedReviewFileIds.has(file.id),
    )
    if (!item) return { kind: "not_found" } as const
    if (item.revision !== command.expectedRevision) return { kind: "conflict" } as const
    if (item.folderId !== command.folderId) {
      item.folderId = command.folderId
      item.revision += 1
      item.updated = now
    }
    this.reviewFileMoveReceipts.set(receiptKey, {
      fingerprint,
      item: structuredClone(item),
    })
    return { item: structuredClone(item), replayed: false }
  }

  async updateReviewFileArchive(command: UpdateReviewFileArchiveCommand) {
    const receiptKey = `${command.actorId}:${command.archived}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify({
      projectId: command.projectId,
      fileId: command.fileId,
      archived: command.archived,
      expectedRevision: command.expectedRevision,
    })
    const receipt = this.reviewFileArchiveReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { item: structuredClone(receipt.item), replayed: true }
    }
    const item = this.reviewFiles.find(
      (file) => file.id === command.fileId && file.projectId === command.projectId,
    )
    if (!item || this.archivedReviewFileIds.has(item.id) === command.archived) {
      return { kind: "not_found" } as const
    }
    if (item.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    if (command.archived) this.archivedReviewFileIds.add(item.id)
    else this.archivedReviewFileIds.delete(item.id)
    item.revision += 1
    item.updated = now
    this.reviewFileArchiveReceipts.set(receiptKey, {
      fingerprint,
      item: structuredClone(item),
    })
    return { item: structuredClone(item), replayed: false }
  }

  async permanentlyDeleteReviewFile(command: PermanentlyDeleteReviewFileCommand) {
    const index = this.reviewFiles.findIndex(
      (file) =>
        file.id === command.fileId &&
        file.projectId === command.projectId &&
        this.archivedReviewFileIds.has(file.id),
    )
    if (index < 0) return { kind: "not_found" } as const
    const item = this.reviewFiles[index]
    if (item.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    if (this.portfolioReviewFileIds.has(item.id)) return { kind: "in_use" } as const
    this.reviewFiles.splice(index, 1)
    this.archivedReviewFileIds.delete(item.id)
    return { kind: "ok", item: { id: item.id } } as const
  }

  async createReviewFile(command: CreateReviewFileCommand) {
    const receiptKey = `${command.actorId}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify({
      projectId: command.projectId,
      assetId: command.assetId,
      folderId: command.folderId ?? null,
      name: command.name,
      version: command.version,
      duration: command.duration,
    })
    const receipt = this.reviewFileCreateReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { item: structuredClone(receipt.item), replayed: true }
    }

    const source = this.reviewSources.find(
      (item) =>
        item.id === command.assetId &&
        (item.projectId === command.projectId || item.projectId === null) &&
        !item.archived,
    )
    if (!source) return { kind: "not_found" } as const
    if (source.kind !== "视频" || source.status !== "ready" || !source.objectKey) {
      return { kind: "invalid_source" } as const
    }
    if (this.reviewFiles.some((item) => item.assetId === command.assetId)) {
      return { kind: "already_exists" } as const
    }

    const item: ReviewFile = {
      id: `review-file-${this.reviewFiles.length + 1}`,
      projectId: command.projectId,
      assetId: command.assetId,
      folderId: command.folderId ?? null,
      name: command.name,
      version: command.version,
      type: "video",
      status: "待审阅",
      comments: 0,
      updated: now,
      duration: command.duration ?? null,
      approvedBy: null,
      approvedAt: null,
      mediaReady: true,
      revision: 1,
    }
    this.reviewFiles.push(item)
    this.reviewFileCreateReceipts.set(receiptKey, {
      fingerprint,
      item: structuredClone(item),
    })
    return { item: structuredClone(item), replayed: false }
  }

  async updateReviewFileApproval(command: ReviewFileApprovalCommand) {
    const receiptKey = `${command.actorId}:${command.action}:${command.idempotencyKey}`
    const fingerprint = JSON.stringify({
      projectId: command.projectId,
      fileId: command.fileId,
      action: command.action,
      expectedRevision: command.expectedRevision,
    })
    const receipt = this.reviewFileReceipts.get(receiptKey)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
      }
      return { item: structuredClone(receipt.item), replayed: true }
    }

    const item = this.reviewFiles.find(
      (entry) =>
        entry.id === command.fileId &&
        entry.projectId === command.projectId &&
        !this.archivedReviewFileIds.has(entry.id),
    )
    if (!item) return { kind: "not_found" } as const
    if (item.revision !== command.expectedRevision) return { kind: "conflict" } as const
    const validTransition =
      item.type === "video" &&
      item.status !== "处理中" &&
      (command.action === "approve" ? item.status !== "已通过" : item.status === "已通过")
    if (!validTransition) return { kind: "invalid_transition" } as const

    item.status = command.action === "approve" ? "已通过" : "审阅中"
    item.approvedBy = command.action === "approve" ? "繁星" : null
    item.approvedAt = command.action === "approve" ? now : null
    item.revision += 1
    item.updated = now
    this.reviewFileReceipts.set(receiptKey, {
      fingerprint,
      item: structuredClone(item),
    })
    return { item: structuredClone(item), replayed: false }
  }

  async listReviewComments(projectId: string, fileId: string) {
    const file = this.reviewFiles.find(
      (item) =>
        item.id === fileId &&
        item.projectId === projectId &&
        !this.archivedReviewFileIds.has(item.id),
    )
    if (!file) return null
    return structuredClone(
      this.reviewComments.filter((comment) => comment.fileId === fileId),
    )
  }

  async createReviewComment(command: CreateReviewCommentCommand) {
    const file = this.reviewFiles.find(
      (item) =>
        item.id === command.fileId &&
        item.projectId === command.projectId &&
        !this.archivedReviewFileIds.has(item.id),
    )
    if (!file) return null
    const parentCommentId = command.parentCommentId ?? null
    if (parentCommentId) {
      const parent = this.reviewComments.find(
        (comment) => comment.id === parentCommentId && comment.fileId === file.id,
      )
      if (!parent) {
        throw new AppError(
          "REVIEW_COMMENT_PARENT_NOT_FOUND",
          "要回复的审片意见不存在",
          404,
        )
      }
      if (parent.parentCommentId) {
        throw new AppError(
          "REVIEW_COMMENT_REPLY_DEPTH_EXCEEDED",
          "审片意见只支持一级回复",
          400,
        )
      }
    }
    const receipt = this.reviewCommentReceipts.get(command.idempotencyKey)
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const item: ReviewComment = {
      id: `review-comment-${this.reviewComments.length + 1}`,
      fileId: command.fileId,
      parentCommentId,
      version: file.version,
      author: "繁星",
      authorId: command.actorId,
      initials: "FX",
      timecode: command.timecode,
      text: command.text,
      state: "open",
      revision: 1,
      createdAt: now,
    }
    this.reviewComments.push(item)
    file.comments += 1
    this.reviewCommentReceipts.set(command.idempotencyKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async updateReviewComment(
    command: UpdateReviewCommentCommand,
  ): Promise<UpdateResult<ReviewComment>> {
    const item = this.reviewComments.find((entry) => entry.id === command.commentId)
    if (!item) return { kind: "not_found" }
    if (item.parentCommentId) {
      throw new AppError(
        "REVIEW_COMMENT_THREAD_ROOT_REQUIRED",
        "请在主审片意见上更新状态",
        400,
      )
    }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    item.state = command.state
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async listReviewCommentLinks(
    projectId: string,
    primaryFileId: string,
    compareFileId: string,
  ) {
    const fileByComment = new Map(
      this.reviewComments.map((comment) => [comment.id, comment.fileId]),
    )
    return structuredClone(
      this.reviewCommentLinks.filter((link) => {
        if (link.projectId !== projectId || link.removedAt) return false
        const files = [
          fileByComment.get(link.commentId),
          fileByComment.get(link.counterpartCommentId),
        ]
        return files.includes(primaryFileId) && files.includes(compareFileId)
      }),
    )
  }

  async createReviewCommentLink(command: CreateReviewCommentLinkCommand) {
    const receiptKey = `${command.actorId}:${command.idempotencyKey}`
    const receipt = this.reviewCommentLinkReceipts.get(receiptKey)
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const comments = [command.commentId, command.counterpartCommentId].map((id) =>
      this.reviewComments.find(
        (comment) =>
          comment.id === id &&
          this.reviewFiles.some(
            (file) => file.id === comment.fileId && file.projectId === command.projectId,
          ),
      ),
    )
    if (comments.some((comment) => !comment)) return { kind: "not_found" } as const
    const files = comments.map((comment) =>
      this.reviewFiles.find((file) => file.id === comment?.fileId),
    )
    if (
      comments[0]?.fileId === comments[1]?.fileId ||
      files[0]?.version === files[1]?.version
    ) {
      return { kind: "invalid_pair" } as const
    }
    const [commentId, counterpartCommentId] = [
      command.commentId,
      command.counterpartCommentId,
    ].sort()
    const existing = this.reviewCommentLinks.find(
      (link) =>
        link.projectId === command.projectId &&
        link.commentId === commentId &&
        link.counterpartCommentId === counterpartCommentId,
    )
    if (existing && !existing.removedAt) {
      this.reviewCommentLinkReceipts.set(receiptKey, structuredClone(existing))
      return { item: structuredClone(existing), replayed: true }
    }
    const item: ReviewCommentLink = existing ?? {
      id: `review-comment-link-${this.reviewCommentLinks.length + 1}`,
      projectId: command.projectId,
      commentId,
      counterpartCommentId,
      createdById: command.actorId,
      revision: 1,
      createdAt: now,
      removedAt: null,
    }
    if (existing) {
      item.createdById = command.actorId
      item.revision += 1
      item.createdAt = now
      item.removedAt = null
    } else {
      this.reviewCommentLinks.push(item)
    }
    this.reviewCommentLinkReceipts.set(receiptKey, structuredClone(item))
    return { item: structuredClone(item), replayed: false }
  }

  async unlinkReviewCommentLink(
    command: UnlinkReviewCommentLinkCommand,
  ): Promise<UpdateResult<ReviewCommentLink>> {
    const item = this.reviewCommentLinks.find(
      (link) => link.id === command.linkId && link.projectId === command.projectId,
    )
    if (!item) return { kind: "not_found" }
    if (item.removedAt || item.revision !== command.expectedRevision) {
      return { kind: "conflict" }
    }
    item.removedAt = now
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }
}

function createScriptRepository(
  configure?: (workspace: ScriptWorkspaceData) => void,
): ScriptRepository {
  const fixture = createScriptFixture("winter-coffee", "冬夜咖啡")
  const workspace: ScriptWorkspaceData = {
    projectId: "winter-coffee",
    document: fixture.document,
    versions: fixture.versions.map((version) => ({
      ...version,
      updatedAt: now,
    })),
    comments: [],
    collaborators: [],
  }
  configure?.(workspace)
  return {
    async getProjectAccess(actorId, projectId) {
      if (projectId !== workspace.projectId) return null
      if (actorId === "account-fanxing") return { canRead: true, canWrite: true }
      if (actorId === "account-viewer") return { canRead: true, canWrite: false }
      return null
    },
    async listDocuments(projectId) {
      return projectId === workspace.projectId
        ? [structuredClone(workspace.document)]
        : []
    },
    async createDocument() {
      throw new Error("unused")
    },
    async getWorkspace(projectId) {
      return projectId === workspace.projectId ? structuredClone(workspace) : null
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
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
const writerHeaders = { "x-shadow-account-id": "account-fanxing" }

async function createTestApp(configureScript?: (workspace: ScriptWorkspaceData) => void) {
  const repository = new MemoryProductionRepository()
  const productionService = new ProductionService(repository)
  const app = await buildApp({
    scriptService: new ScriptService(createScriptRepository(configureScript)),
    productionService,
    logger: false,
  })
  apps.push(app)
  return { app, repository, productionService }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("production workflow API", () => {
  it("enforces project access for production resources", async () => {
    const { app } = await createTestApp()
    const missingActor = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown",
    })
    const outsider = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files",
      headers: { "x-shadow-account-id": "account-outsider" },
    })

    expect(missingActor.statusCode).toBe(401)
    expect(outsider.statusCode).toBe(403)
  })

  it("maps changed script lines to formal breakdown, shooting-day, and call-sheet links", async () => {
    const { app, repository } = await createTestApp()
    repository.breakdown[0].sourceVersion = "v6"
    repository.breakdown[0].state = "已确认"
    repository.breakdown[0].sourceLocation = "第 3 行"
    repository.breakdown[0].shootingDayIds = ["shooting-day-a", "shooting-day-shared"]
    repository.breakdown[0].callSheetIds = ["call-sheet-a", "call-sheet-shared"]
    repository.breakdown[1].sourceVersion = "v6"
    repository.breakdown[1].state = "已完成"
    repository.breakdown[1].sourceLocation = "第 2-3 行"
    repository.breakdown[1].shootingDayIds = ["shooting-day-shared", "shooting-day-b"]
    repository.breakdown[1].callSheetIds = ["call-sheet-shared", "call-sheet-b"]
    repository.breakdown[2].sourceVersion = "v6"
    repository.breakdown[2].state = "已确认"
    repository.breakdown[2].sourceLocation = "第 2 至 3 行"
    repository.breakdown.push(
      {
        ...structuredClone(repository.breakdown[0]),
        id: "breakdown-manual-review",
        sourceLocation: "场 12",
        shootingDayIds: ["shooting-day-manual"],
        callSheetIds: ["call-sheet-manual"],
      },
      {
        ...structuredClone(repository.breakdown[0]),
        id: "breakdown-unchanged-line",
        sourceLocation: "第 1 行",
      },
    )

    const compared = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-version-impact?fromVersionId=v6&toVersionId=v7",
      headers: writerHeaders,
    })
    const viewer = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-version-impact?fromVersionId=v6&toVersionId=v7",
      headers: { "x-shadow-account-id": "account-viewer" },
    })
    const outsider = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-version-impact?fromVersionId=v6&toVersionId=v7",
      headers: { "x-shadow-account-id": "account-outsider" },
    })
    const missingVersion = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-version-impact?fromVersionId=missing&toVersionId=v7",
      headers: writerHeaders,
    })
    const sameVersion = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-version-impact?fromVersionId=v7&toVersionId=v7",
      headers: writerHeaders,
    })

    expect(compared.statusCode).toBe(200)
    expect(compared.json()).toMatchObject({
      fromVersion: { id: "v6" },
      toVersion: { id: "v7" },
      processingStatus: "limited",
      affectedBreakdownItems: [
        { id: "breakdown-1", sourceVersion: "v6" },
        { id: "breakdown-2", sourceVersion: "v6" },
        { id: "breakdown-location", sourceVersion: "v6" },
      ],
      manualReviewBreakdownItems: [{ id: "breakdown-manual-review" }],
      affectedShootingDayIds: ["shooting-day-a", "shooting-day-shared", "shooting-day-b"],
      affectedCallSheetIds: ["call-sheet-a", "call-sheet-shared", "call-sheet-b"],
    })
    expect(compared.json().changes.length).toBeGreaterThan(0)
    expect(compared.json().coverageLimitations).toHaveLength(3)
    expect(viewer.statusCode).toBe(200)
    expect(outsider.statusCode).toBe(403)
    expect(missingVersion.statusCode).toBe(404)
    expect(missingVersion.json().code).toBe("SCRIPT_VERSION_NOT_FOUND")
    expect(sameVersion.statusCode).toBe(400)
    expect(sameVersion.json().code).toBe("SCRIPT_VERSION_PAIR_REQUIRED")
  })

  it("does not flag baseline breakdown items for a pure insertion", async () => {
    const { app, repository } = await createTestApp((workspace) => {
      const fromVersion = workspace.versions.find((item) => item.id === "v6")
      const toVersion = workspace.versions.find((item) => item.id === "v7")
      if (!fromVersion || !toVersion) throw new Error("script fixture versions missing")
      toVersion.content = `${fromVersion.content}\n新增说明。`
    })
    repository.breakdown[0].sourceVersion = "v6"
    repository.breakdown[0].sourceLocation = "第 3 行"
    repository.breakdown[0].state = "已确认"

    const response = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/script-version-impact?fromVersionId=v6&toVersionId=v7",
      headers: writerHeaders,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      processingStatus: "complete",
      affectedBreakdownItems: [],
      manualReviewBreakdownItems: [],
      affectedShootingDayIds: [],
      affectedCallSheetIds: [],
      changes: [{ kind: "added", from: { startLine: null, endLine: null } }],
    })
  })

  it("updates professional breakdown fields, trims values, and rejects a stale revision", async () => {
    const { app } = await createTestApp()
    const updated = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        item: " 顾遥（雨戏） ",
        requirementType: " 主要角色 ",
        specification: " 夜雨连续戏 ",
        quantity: " 演员 1 人，替身 1 人 ",
        preparation: " 完成试装并准备两套替换服装 ",
        department: " 选角 / 演员统筹 ",
        state: "待安排",
        expectedRevision: 1,
      },
    })
    const conflict = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { state: "已联系", expectedRevision: 1 },
    })

    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({
      item: "顾遥（雨戏）",
      requirementType: "主要角色",
      specification: "夜雨连续戏",
      quantity: "演员 1 人，替身 1 人",
      preparation: "完成试装并准备两套替换服装",
      department: "选角 / 演员统筹",
      state: "待安排",
      sourceDocument: "拍摄稿",
      sourceVersion: "v7",
      sourceLocation: "场 12",
      revision: 2,
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().code).toBe("RESOURCE_CONFLICT")
  })

  it("associates available suppliers only after a breakdown item is confirmed", async () => {
    const { app } = await createTestApp()
    const beforeConfirmation = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { supplierIds: ["supplier-rain-fx"], expectedRevision: 1 },
    })
    const confirmed = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-1", expectedRevision: 1 }],
        idempotencyKey: "breakdown-supplier-confirm",
      },
    })
    const unavailable = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { supplierIds: ["supplier-unavailable"], expectedRevision: 2 },
    })
    const associated = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { supplierIds: ["supplier-rain-fx"], expectedRevision: 2 },
    })
    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown",
      headers: writerHeaders,
    })

    expect(beforeConfirmation.statusCode).toBe(409)
    expect(beforeConfirmation.json().code).toBe("BREAKDOWN_SUPPLIER_REQUIRES_CONFIRMED")
    expect(confirmed.statusCode).toBe(200)
    expect(unavailable.statusCode).toBe(400)
    expect(unavailable.json().code).toBe("BREAKDOWN_SUPPLIER_UNAVAILABLE")
    expect(associated.statusCode).toBe(200)
    expect(associated.json()).toMatchObject({
      supplierIds: ["supplier-rain-fx"],
      revision: 3,
    })
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "breakdown-1",
          supplierIds: ["supplier-rain-fx"],
          revision: 3,
        }),
      ]),
    )
  })

  it("lists project relation options and atomically assigns a responsible member and tasks", async () => {
    const { app } = await createTestApp()
    const options = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown/options",
      headers: writerHeaders,
    })
    const viewerOptions = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown/options",
      headers: { "x-shadow-account-id": "account-viewer" },
    })
    const beforeConfirmation = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        responsibleAccountId: "account-director",
        taskIds: ["task-winter-coffee"],
        expectedRevision: 1,
      },
    })
    await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-1", expectedRevision: 1 }],
        idempotencyKey: "breakdown-relations-confirm",
      },
    })
    const unavailableResponsible = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { responsibleAccountId: "account-outsider", expectedRevision: 2 },
    })
    const unavailableTask = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { taskIds: ["task-city-walk"], expectedRevision: 2 },
    })
    const assigned = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        responsibleAccountId: "account-director",
        taskIds: ["task-winter-coffee"],
        expectedRevision: 2,
      },
    })
    const staleClear = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { responsibleAccountId: null, taskIds: [], expectedRevision: 2 },
    })
    const cleared = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { responsibleAccountId: null, taskIds: [], expectedRevision: 3 },
    })
    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown",
      headers: writerHeaders,
    })

    expect(options.statusCode).toBe(200)
    expect(options.json()).toMatchObject({
      members: expect.arrayContaining([
        expect.objectContaining({ accountId: "account-director", displayName: "林乔" }),
      ]),
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: "task-winter-coffee", title: "车站夜戏执行" }),
      ]),
    })
    expect(viewerOptions.statusCode).toBe(200)
    expect(beforeConfirmation.statusCode).toBe(409)
    expect(beforeConfirmation.json().code).toBe("BREAKDOWN_RELATION_REQUIRES_CONFIRMED")
    expect(unavailableResponsible.statusCode).toBe(400)
    expect(unavailableResponsible.json().code).toBe("BREAKDOWN_RESPONSIBLE_UNAVAILABLE")
    expect(unavailableTask.statusCode).toBe(400)
    expect(unavailableTask.json().code).toBe("BREAKDOWN_TASK_UNAVAILABLE")
    expect(assigned.statusCode).toBe(200)
    expect(assigned.json()).toMatchObject({
      responsibleAccountId: "account-director",
      responsibleName: "林乔",
      taskIds: ["task-winter-coffee"],
      revision: 3,
    })
    expect(staleClear.statusCode).toBe(409)
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toMatchObject({
      responsibleAccountId: null,
      responsibleName: null,
      taskIds: [],
      revision: 4,
    })
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "breakdown-1",
          responsibleAccountId: null,
          taskIds: [],
          revision: 4,
        }),
      ]),
    )
  })

  it("rejects empty candidate edits, direct confirmation, and viewer writes", async () => {
    const { app } = await createTestApp()
    const empty = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { expectedRevision: 1 },
    })
    const whitespace = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { item: "   ", expectedRevision: 1 },
    })
    const directConfirmation = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { state: "已确认", expectedRevision: 1 },
    })
    const viewer = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { state: "待安排", expectedRevision: 1 },
    })

    expect(empty.statusCode).toBe(400)
    expect(empty.json().code).toBe("BREAKDOWN_UPDATE_EMPTY")
    expect(whitespace.statusCode).toBe(400)
    expect(whitespace.json().code).toBe("BREAKDOWN_FIELD_EMPTY")
    expect(directConfirmation.statusCode).toBe(409)
    expect(directConfirmation.json().code).toBe("BREAKDOWN_CONFIRMATION_REQUIRED")
    expect(viewer.statusCode).toBe(403)
  })

  it("supports every professional breakdown state through the proper workflows", async () => {
    const { app } = await createTestApp()
    const editableStates = [
      "待确认",
      "待安排",
      "待采购或租赁",
      "已联系",
      "已完成",
      "不需要",
      "已取消",
    ] as const

    for (const [index, state] of editableStates.entries()) {
      const response = await app.inject({
        method: "PATCH",
        url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
        headers: writerHeaders,
        payload: { state, expectedRevision: index + 1 },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().state).toBe(state)
    }

    const confirmed = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-2", expectedRevision: 1 }],
        idempotencyKey: "breakdown-confirm-state-set",
      },
    })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().items[0].state).toBe("已确认")
  })

  it("confirms a breakdown category atomically and replays the command", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
      payload: {
        category: "cast",
        items: [
          { itemId: "breakdown-1", expectedRevision: 1 },
          { itemId: "breakdown-2", expectedRevision: 1 },
        ],
        idempotencyKey: "breakdown-confirm-1",
      },
    }
    const confirmed = await app.inject(request)
    const replay = await app.inject(request)
    const reusedKey = await app.inject({
      ...request,
      payload: { ...request.payload, items: [request.payload.items[0]] },
    })

    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json()).toMatchObject({ replayed: false })
    expect(confirmed.json().items).toHaveLength(2)
    expect(
      confirmed.json().items.every((item: BreakdownItem) => item.revision === 2),
    ).toBe(true)
    expect(replay.json()).toMatchObject({ replayed: true })
    expect(reusedKey.statusCode).toBe(409)
    expect(reusedKey.json().code).toBe("IDEMPOTENCY_KEY_REUSED")
    expect(repository.breakdown.filter((item) => item.category === "cast")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "breakdown-1", state: "已确认", revision: 2 }),
        expect.objectContaining({ id: "breakdown-2", state: "已确认", revision: 2 }),
      ]),
    )
  })

  it("keeps the whole breakdown batch unchanged when one revision is stale", async () => {
    const { app, repository } = await createTestApp()
    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
      payload: {
        category: "cast",
        items: [
          { itemId: "breakdown-1", expectedRevision: 1 },
          { itemId: "breakdown-2", expectedRevision: 9 },
        ],
        idempotencyKey: "breakdown-confirm-stale",
      },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe("RESOURCE_CONFLICT")
    expect(repository.breakdown.filter((item) => item.category === "cast")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "breakdown-1", state: "待确认", revision: 1 }),
        expect.objectContaining({ id: "breakdown-2", state: "待确认", revision: 1 }),
      ]),
    )
  })

  it("rejects duplicate, cross-category, cross-project, and viewer selections", async () => {
    const { app } = await createTestApp()
    const base = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
    }
    const duplicate = await app.inject({
      ...base,
      payload: {
        category: "cast",
        items: [
          { itemId: "breakdown-1", expectedRevision: 1 },
          { itemId: "breakdown-1", expectedRevision: 1 },
        ],
        idempotencyKey: "breakdown-confirm-duplicate",
      },
    })
    const crossCategory = await app.inject({
      ...base,
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-location", expectedRevision: 1 }],
        idempotencyKey: "breakdown-confirm-category",
      },
    })
    const crossProject = await app.inject({
      ...base,
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-other-project", expectedRevision: 1 }],
        idempotencyKey: "breakdown-confirm-project",
      },
    })
    const viewer = await app.inject({
      ...base,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-1", expectedRevision: 1 }],
        idempotencyKey: "breakdown-confirm-viewer",
      },
    })

    expect(duplicate.statusCode).toBe(400)
    expect(duplicate.json().code).toBe("BREAKDOWN_SELECTION_INVALID")
    expect(crossCategory.statusCode).toBe(409)
    expect(crossCategory.json().code).toBe("BREAKDOWN_SELECTION_INVALID")
    expect(crossProject.statusCode).toBe(404)
    expect(viewer.statusCode).toBe(403)
  })

  it("merges pending breakdown candidates with lineage and idempotent replay", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/breakdown/merge",
      headers: writerHeaders,
      payload: {
        category: "cast",
        primaryItemId: "breakdown-1",
        items: [
          { itemId: "breakdown-1", expectedRevision: 1 },
          { itemId: "breakdown-2", expectedRevision: 1 },
        ],
        result: {
          item: " 站台演员组 ",
          requirementType: " 演员组合 ",
          specification: " 雨夜站台表演 ",
          quantity: " 5 人 ",
          preparation: " 统一确认档期与雨戏服装 ",
          department: " 演员统筹 ",
        },
        idempotencyKey: "breakdown-merge-command-1",
      },
    }
    const merged = await app.inject(request)
    const replay = await app.inject(request)
    const reusedKey = await app.inject({
      ...request,
      payload: {
        ...request.payload,
        result: { ...request.payload.result, quantity: "6 人" },
      },
    })

    expect(merged.statusCode).toBe(200)
    expect(merged.json().replayed).toBe(false)
    const [result, ...sources] = merged.json().items as BreakdownItem[]
    expect(result).toMatchObject({
      item: "站台演员组",
      quantity: "5 人",
      state: "待确认",
      sourceDocument: "拍摄稿",
      parentItemId: null,
      mergedIntoItemId: null,
      revision: 1,
    })
    expect(sources).toHaveLength(2)
    expect(
      sources.every(
        (item) =>
          item.state === "已取消" &&
          item.mergedIntoItemId === result.id &&
          item.revision === 2,
      ),
    ).toBe(true)
    expect(replay.json()).toMatchObject({ replayed: true, items: merged.json().items })
    expect(reusedKey.statusCode).toBe(409)
    expect(reusedKey.json().code).toBe("IDEMPOTENCY_KEY_REUSED")
    expect(repository.breakdown.find((item) => item.id === result.id)).toBeTruthy()
  })

  it("splits one pending candidate and inherits its immutable source", async () => {
    const { app } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/breakdown/split",
      headers: writerHeaders,
      payload: {
        itemId: "breakdown-location",
        expectedRevision: 1,
        items: [
          {
            item: "旧站台许可",
            requirementType: "场地许可",
            specification: "轨道区域拍摄许可",
            quantity: "1 份",
            preparation: "确认许可范围和时间窗口",
            department: "制片组",
          },
          {
            item: "旧站台安全封控",
            requirementType: "现场安全",
            specification: "半幅站台封控",
            quantity: "1 套",
            preparation: "确认封控、排水与轨道安全",
            department: "场务组",
          },
        ],
        idempotencyKey: "breakdown-split-command-1",
      },
    }
    const split = await app.inject(request)
    const replay = await app.inject(request)

    expect(split.statusCode).toBe(200)
    const [parent, ...children] = split.json().items as BreakdownItem[]
    expect(parent).toMatchObject({
      id: "breakdown-location",
      state: "已取消",
      revision: 2,
    })
    expect(children).toHaveLength(2)
    expect(
      children.every(
        (item) =>
          item.parentItemId === parent.id &&
          item.sourceDocument === parent.sourceDocument &&
          item.agentAssessment === parent.agentAssessment &&
          item.revision === 1,
      ),
    ).toBe(true)
    expect(replay.json()).toMatchObject({ replayed: true, items: split.json().items })
  })

  it("keeps rewrite sources unchanged on stale, cross-category, and viewer requests", async () => {
    const { app, repository } = await createTestApp()
    const mergePayload = {
      category: "cast",
      primaryItemId: "breakdown-1",
      items: [
        { itemId: "breakdown-1", expectedRevision: 1 },
        { itemId: "breakdown-2", expectedRevision: 9 },
      ],
      result: {
        item: "站台演员组",
        requirementType: "演员组合",
        specification: "雨夜站台表演",
        quantity: "5 人",
        preparation: "统一准备",
        department: "演员统筹",
      },
      idempotencyKey: "breakdown-merge-stale",
    }
    const stale = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/merge",
      headers: writerHeaders,
      payload: mergePayload,
    })
    const crossCategory = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/merge",
      headers: writerHeaders,
      payload: {
        ...mergePayload,
        items: [
          { itemId: "breakdown-1", expectedRevision: 1 },
          { itemId: "breakdown-location", expectedRevision: 1 },
        ],
        idempotencyKey: "breakdown-merge-cross-category",
      },
    })
    const viewer = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/split",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        itemId: "breakdown-1",
        expectedRevision: 1,
        items: [mergePayload.result, mergePayload.result],
        idempotencyKey: "breakdown-split-viewer",
      },
    })

    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
    expect(crossCategory.statusCode).toBe(409)
    expect(crossCategory.json().code).toBe("BREAKDOWN_SELECTION_INVALID")
    expect(viewer.statusCode).toBe(403)
    expect(repository.breakdown.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "breakdown-1", state: "待确认", revision: 1 }),
        expect.objectContaining({ id: "breakdown-2", state: "待确认", revision: 1 }),
        expect.objectContaining({
          id: "breakdown-location",
          state: "待确认",
          revision: 1,
        }),
      ]),
    )
  })

  it("creates call sheets idempotently and requires write access", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/call-sheets",
      headers: writerHeaders,
      payload: {
        date: "8 月 29 日",
        title: "补拍通告",
        idempotencyKey: "call-sheet-command-1",
      },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)
    const viewerWrite = await app.inject({
      ...request,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { ...request.payload, idempotencyKey: "call-sheet-viewer-1" },
    })

    expect(first.statusCode).toBe(201)
    expect(replay.json().replayed).toBe(true)
    expect(repository.callSheets).toHaveLength(1)
    expect(viewerWrite.statusCode).toBe(403)
  })

  it("generates call sheet drafts from confirmed shooting-day breakdown facts", async () => {
    const { app, repository } = await createTestApp()
    const shootingDayId = "shooting-day-winter-1"
    const cast = repository.breakdown.find((item) => item.id === "breakdown-1")
    const excludedCast = repository.breakdown.find((item) => item.id === "breakdown-2")
    const location = repository.breakdown.find((item) => item.id === "breakdown-location")
    if (!cast || !excludedCast || !location)
      throw new Error("Breakdown fixtures are missing")
    Object.assign(cast, { state: "已确认", shootingDayIds: [shootingDayId] })
    Object.assign(excludedCast, { shootingDayIds: [shootingDayId] })
    Object.assign(location, { state: "已完成", shootingDayIds: [shootingDayId] })
    repository.breakdown.push(
      {
        ...structuredClone(location),
        id: "breakdown-art",
        category: "art",
        item: "深红色硬壳行李箱",
        preparation: "核对英雄件与替换件连续性",
        department: "美术 / 道具",
        responsibleName: "周弥",
        callSheetIds: [],
      },
      {
        ...structuredClone(location),
        id: "breakdown-equipment",
        category: "equipment",
        item: "人工雨夜景摄影包",
        quantity: "1 套",
        preparation: "完成防雨测试和镜头除雾",
        department: "摄影 / 灯光 / 录音",
        callSheetIds: [],
      },
      {
        ...structuredClone(location),
        id: "breakdown-safety",
        category: "special",
        item: "人工雨与现场安全",
        preparation: "铺设防滑垫并配置漏电保护",
        department: "特效 / 安全 / 后勤",
        responsibleName: "崔岚",
        callSheetIds: [],
      },
    )

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/call-sheets",
      headers: writerHeaders,
      payload: {
        shootingDayId,
        idempotencyKey: "generated-call-sheet-1",
      },
    })
    const item = response.json().item as CallSheet

    expect(response.statusCode).toBe(201)
    expect(item).toMatchObject({
      location: "旧站台",
      scenes: [
        {
          scene: "12",
          set: "旧站台",
          pages: "待定",
          description: "顾遥走入站台。",
          cast: "顾遥",
        },
      ],
      cast: [
        { name: "顾遥", role: "主要角色", pickup: "待定", makeup: "待定", set: "待定" },
      ],
      departments: [
        {
          name: "美术 / 道具",
          call: "待定",
          note: "深红色硬壳行李箱：核对英雄件与替换件连续性",
        },
      ],
      equipment: [
        {
          name: "人工雨夜景摄影包",
          quantity: "1 套",
          source: "摄影 / 灯光 / 录音",
          note: "完成防雨测试和镜头除雾",
        },
      ],
      safety: [
        {
          level: "待评估",
          item: "人工雨与现场安全",
          owner: "崔岚",
          action: "铺设防滑垫并配置漏电保护",
        },
      ],
      keyContacts: [
        { name: "周弥", role: "美术 / 道具", phone: "", note: "深红色硬壳行李箱" },
        { name: "崔岚", role: "特效 / 安全 / 后勤", phone: "", note: "人工雨与现场安全" },
      ],
    })
    expect(item.cast).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "站台群演" })]),
    )
    expect(cast.callSheetIds).toContain(item.id)
    expect(excludedCast.callSheetIds).not.toContain(item.id)
  })

  it("manages shooting days with permissions, validation, revisions, and call sheets", async () => {
    const { app, repository } = await createTestApp()
    const listWithoutActor = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/shooting-days",
    })
    const viewerList = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/shooting-days",
      headers: { "x-shadow-account-id": "account-viewer" },
    })
    const createRequest = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/shooting-days",
      headers: writerHeaders,
      payload: {
        shootDate: "2026-08-20",
        dayNumber: 6,
        title: "站台出口与清晨补景",
        originalTimezone: "Asia/Shanghai",
        idempotencyKey: "shooting-day-create-1",
      },
    }
    const created = await app.inject(createRequest)
    const replay = await app.inject(createRequest)
    const item = created.json().item as ShootingDay
    const duplicateDate = await app.inject({
      ...createRequest,
      payload: {
        ...createRequest.payload,
        dayNumber: 7,
        idempotencyKey: "shooting-day-create-2",
      },
    })
    const duplicateNumber = await app.inject({
      ...createRequest,
      payload: {
        ...createRequest.payload,
        shootDate: "2026-08-21",
        idempotencyKey: "shooting-day-create-3",
      },
    })
    const invalidDate = await app.inject({
      ...createRequest,
      payload: {
        ...createRequest.payload,
        shootDate: "2026-02-30",
        dayNumber: 8,
        idempotencyKey: "shooting-day-create-4",
      },
    })
    const invalidTimezone = await app.inject({
      ...createRequest,
      payload: {
        ...createRequest.payload,
        shootDate: "2026-08-22",
        dayNumber: 8,
        originalTimezone: "Moon/Sea-of-Tranquility",
        idempotencyKey: "shooting-day-create-5",
      },
    })
    const viewerWrite = await app.inject({
      ...createRequest,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { ...createRequest.payload, idempotencyKey: "shooting-day-create-6" },
    })
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/shooting-days/${item.id}`,
      headers: writerHeaders,
      payload: { status: "已确认", expectedRevision: item.revision },
    })
    const stale = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/shooting-days/${item.id}`,
      headers: writerHeaders,
      payload: { title: "过期修改", expectedRevision: item.revision },
    })
    const callSheet = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/call-sheets",
      headers: writerHeaders,
      payload: {
        shootingDayId: item.id,
        idempotencyKey: "shooting-day-call-sheet-1",
      },
    })

    expect(listWithoutActor.statusCode).toBe(401)
    expect(viewerList.statusCode).toBe(200)
    expect(viewerList.json().items).toEqual([
      expect.objectContaining({ id: "shooting-day-winter-1" }),
    ])
    expect(created.statusCode).toBe(201)
    expect(replay.json()).toMatchObject({ item, replayed: true })
    expect(
      repository.shootingDays.filter((entry) => entry.projectId === "winter-coffee"),
    ).toHaveLength(2)
    expect(duplicateDate.json().code).toBe("SHOOTING_DAY_DUPLICATE")
    expect(duplicateNumber.json().code).toBe("SHOOTING_DAY_DUPLICATE")
    expect(invalidDate.json().code).toBe("SHOOTING_DAY_DATE_INVALID")
    expect(invalidTimezone.json().code).toBe("SHOOTING_DAY_TIMEZONE_INVALID")
    expect(viewerWrite.statusCode).toBe(403)
    expect(updated.json()).toMatchObject({ status: "已确认", revision: 2 })
    expect(stale.statusCode).toBe(409)
    expect(callSheet.statusCode).toBe(201)
    expect(callSheet.json().item).toMatchObject({
      shootingDayId: item.id,
      date: item.shootDate,
      day: `拍摄第 ${item.dayNumber} 天`,
      title: item.title,
    })
  })

  it("publishes immutable call sheet versions and records post-publication changes", async () => {
    const { app, repository } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/call-sheets",
      headers: writerHeaders,
      payload: {
        date: "8 月 30 日",
        title: "车站补拍通告",
        idempotencyKey: "call-sheet-history-create",
      },
    })
    const createdSheet = created.json().item as CallSheet
    const emptyUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/call-sheets/${createdSheet.id}`,
      headers: writerHeaders,
      payload: { expectedRevision: createdSheet.revision },
    })
    const summaryOnlyUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/call-sheets/${createdSheet.id}`,
      headers: writerHeaders,
      payload: {
        changeSummary: "没有实际字段变化",
        expectedRevision: createdSheet.revision,
      },
    })
    const prepared = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/call-sheets/${createdSheet.id}`,
      headers: writerHeaders,
      payload: {
        departments: [{ name: "摄影组", call: "15:30", note: "雨戏防护" }],
        equipment: [
          { name: "雨车", quantity: "1 台", source: "北岸特效", note: "17:30 试雨" },
        ],
        safety: [
          { level: "高", item: "轨道区", owner: "安全员", action: "场务统一放行" },
        ],
        transport: [
          {
            item: "全组班车",
            time: "14:30",
            route: "制作中心 → 旧北站",
            owner: "交通组",
            note: "准时发车",
          },
        ],
        catering: [{ meal: "晚餐", time: "18:00", location: "基地", note: "热餐" }],
        keyContacts: [
          { name: "崔岚", role: "现场制片", phone: "138-0000-1205", note: "总协调" },
        ],
        nextDayPreview: {
          date: "8 月 31 日",
          title: "清晨补景",
          scenes: "14",
          cast: "顾遥",
          note: "04:30 集合",
        },
        expectedRevision: createdSheet.revision,
      },
    })
    const sheet = prepared.json() as CallSheet
    const directPublish = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/call-sheets/${sheet.id}`,
      headers: writerHeaders,
      payload: { status: "已发布", expectedRevision: sheet.revision },
    })
    const publishRequest = {
      method: "POST" as const,
      url: `/v1/projects/winter-coffee/call-sheets/${sheet.id}/publish`,
      headers: writerHeaders,
      payload: {
        expectedRevision: sheet.revision,
        idempotencyKey: "call-sheet-history-publish-1",
      },
    }
    const viewerPublish = await app.inject({
      ...publishRequest,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        ...publishRequest.payload,
        idempotencyKey: "call-sheet-history-viewer",
      },
    })
    const firstPublish = await app.inject(publishRequest)
    const replay = await app.inject(publishRequest)
    const stalePublish = await app.inject({
      ...publishRequest,
      payload: {
        expectedRevision: sheet.revision,
        idempotencyKey: "call-sheet-history-stale",
      },
    })
    const published = firstPublish.json().item as CallSheet
    const edited = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/call-sheets/${sheet.id}`,
      headers: writerHeaders,
      payload: {
        title: "车站补拍通告 · 修订",
        safety: [
          { level: "高", item: "轨道区", owner: "安全员", action: "增加双人复核" },
        ],
        nextDayPreview: {
          date: "9 月 1 日",
          title: "室内补拍",
          scenes: "18",
          cast: "顾遥、林森",
          note: "场地提前一小时开放",
        },
        changeSummary: "集合地点调整",
        expectedRevision: published.revision,
      },
    })
    const editedSheet = edited.json() as CallSheet
    const staleStructuredEdit = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/call-sheets/${sheet.id}`,
      headers: writerHeaders,
      payload: {
        equipment: [{ name: "错误覆盖", quantity: "1", source: "", note: "" }],
        changeSummary: "过期修改",
        expectedRevision: published.revision,
      },
    })
    const secondPublish = await app.inject({
      ...publishRequest,
      payload: {
        expectedRevision: editedSheet.revision,
        idempotencyKey: "call-sheet-history-publish-2",
      },
    })
    const history = await app.inject({
      method: "GET",
      url: `/v1/projects/winter-coffee/call-sheets/${sheet.id}/history`,
      headers: writerHeaders,
    })

    expect(emptyUpdate.statusCode).toBe(400)
    expect(emptyUpdate.json().code).toBe("CALL_SHEET_UPDATE_EMPTY")
    expect(summaryOnlyUpdate.statusCode).toBe(400)
    expect(summaryOnlyUpdate.json().code).toBe("CALL_SHEET_UPDATE_EMPTY")
    expect(directPublish.statusCode).toBe(400)
    expect(viewerPublish.statusCode).toBe(403)
    expect(firstPublish.statusCode).toBe(200)
    expect(replay.json().replayed).toBe(true)
    expect(stalePublish.statusCode).toBe(409)
    expect(staleStructuredEdit.statusCode).toBe(409)
    expect(editedSheet.status).toBe("待确认")
    expect(secondPublish.json().publication.version).toBe(2)
    expect(history.statusCode).toBe(200)
    expect(history.json().publications).toHaveLength(2)
    expect(history.json().publications[1].snapshot).toMatchObject({
      title: "车站补拍通告",
      departments: [{ name: "摄影组", call: "15:30", note: "雨戏防护" }],
      equipment: [{ name: "雨车", quantity: "1 台" }],
      nextDayPreview: { title: "清晨补景", scenes: "14" },
    })
    expect(history.json().changes).toEqual([
      expect.objectContaining({
        basePublicationVersion: 1,
        summary: "集合地点调整",
        beforeSnapshot: expect.objectContaining({
          status: "已发布",
          safety: [expect.objectContaining({ action: "场务统一放行" })],
        }),
        afterSnapshot: expect.objectContaining({
          status: "待确认",
          safety: [expect.objectContaining({ action: "增加双人复核" })],
          nextDayPreview: expect.objectContaining({ title: "室内补拍" }),
        }),
      }),
    ])
    expect(repository.callSheetPublications).toHaveLength(2)
    expect(repository.callSheetChanges).toHaveLength(1)
  })

  it("persists timezone-aware execution stages and reports resource overlaps", async () => {
    const { app, repository } = await createTestApp()
    const firstPayload = {
      name: " 车站夜戏 ",
      startsAt: "2026-08-19T16:30:00+08:00",
      endsAt: "2026-08-20T03:30:00+08:00",
      originalTimezone: "Asia/Shanghai",
      progress: 20,
      owner: " 崔岚 ",
      state: "进行中" as const,
      note: " 人工雨实拍 ",
      resources: [
        { id: " Cast-Guyao ", type: "cast" as const, name: " 顾遥 " },
        { id: " Crew-Cuilan ", type: "crew" as const, name: " 崔岚 " },
        { id: " Old-North-Station ", type: "location" as const, name: " 旧北站 " },
        { id: " Rain-Rig-1 ", type: "equipment" as const, name: " 雨车 1 号 " },
      ],
      idempotencyKey: "schedule-stage-1",
    }
    const first = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: firstPayload,
    })
    const replay = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: firstPayload,
    })
    const second = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: {
        ...firstPayload,
        name: "雨效测试",
        startsAt: "2026-08-19T18:00:00+08:00",
        endsAt: "2026-08-19T20:00:00+08:00",
        idempotencyKey: "schedule-stage-2",
      },
    })
    await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: {
        ...firstPayload,
        name: "设备回收",
        startsAt: "2026-08-20T03:30:00+08:00",
        endsAt: "2026-08-20T04:30:00+08:00",
        idempotencyKey: "schedule-stage-3",
      },
    })
    await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: {
        ...firstPayload,
        name: "独立设备测试",
        startsAt: "2026-08-19T18:00:00+08:00",
        endsAt: "2026-08-19T20:00:00+08:00",
        resources: [{ id: "rain-rig-2", type: "equipment" as const, name: "雨车 2 号" }],
        idempotencyKey: "schedule-stage-4",
      },
    })
    const list = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
    })

    expect(first.statusCode).toBe(201)
    expect(first.json().item).toEqual(
      expect.objectContaining({
        name: "车站夜戏",
        startsAt: "2026-08-19T08:30:00.000Z",
        endsAt: "2026-08-19T19:30:00.000Z",
        owner: "崔岚",
        resources: [
          { id: "cast-guyao", type: "cast", name: "顾遥" },
          { id: "crew-cuilan", type: "crew", name: "崔岚" },
          { id: "old-north-station", type: "location", name: "旧北站" },
          { id: "rain-rig-1", type: "equipment", name: "雨车 1 号" },
        ],
      }),
    )
    expect(replay.json().replayed).toBe(true)
    expect(second.statusCode).toBe(201)
    expect(list.json().conflicts).toHaveLength(4)
    expect(
      list
        .json()
        .conflicts.map((conflict: ExecutionConflict) => conflict.resource.type)
        .sort(),
    ).toEqual(["cast", "crew", "equipment", "location"])
    expect(list.json().conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startsAt: "2026-08-19T10:00:00.000Z",
          endsAt: "2026-08-19T12:00:00.000Z",
        }),
      ]),
    )
    expect(repository.executionStages).toHaveLength(4)
  })

  it("preserves DST boundary instants and their original timezone", async () => {
    const { app } = await createTestApp()
    const create = (payload: {
      name: string
      startsAt: string
      endsAt: string
      idempotencyKey: string
    }) =>
      app.inject({
        method: "POST",
        url: "/v1/projects/winter-coffee/execution-schedule",
        headers: writerHeaders,
        payload: {
          ...payload,
          originalTimezone: "America/New_York",
          progress: 0,
          owner: "林乔",
          state: "未开始",
          note: "",
          resources: [],
        },
      })
    const spring = await create({
      name: "春季换时",
      startsAt: "2026-03-08T01:30:00-05:00",
      endsAt: "2026-03-08T03:30:00-04:00",
      idempotencyKey: "schedule-dst-spring",
    })
    const fall = await create({
      name: "秋季换时",
      startsAt: "2026-11-01T01:30:00-04:00",
      endsAt: "2026-11-01T01:30:00-05:00",
      idempotencyKey: "schedule-dst-fall",
    })

    for (const response of [spring, fall]) {
      expect(response.statusCode).toBe(201)
      const item = response.json().item as ExecutionStage
      expect(item.originalTimezone).toBe("America/New_York")
      expect(new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()).toBe(
        60 * 60 * 1000,
      )
    }
  })

  it("rejects invalid execution ranges, timezones, duplicate resources, and stale writes", async () => {
    const { app } = await createTestApp()
    const payload = {
      name: "补拍",
      startsAt: "2026-08-22T01:00:00.000Z",
      endsAt: "2026-08-22T03:00:00.000Z",
      originalTimezone: "Asia/Shanghai",
      progress: 0,
      owner: "林乔",
      state: "未开始" as const,
      note: "",
      resources: [{ id: "cast-guyao", type: "cast" as const, name: "顾遥" }],
      idempotencyKey: "schedule-validation-1",
    }
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload,
    })
    const item = created.json().item as ExecutionStage
    const stale = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/execution-schedule/${item.id}`,
      headers: writerHeaders,
      payload: { progress: 40, expectedRevision: 2 },
    })
    const invalidRange = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: {
        ...payload,
        endsAt: payload.startsAt,
        idempotencyKey: "schedule-validation-2",
      },
    })
    const invalidTimezone = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: {
        ...payload,
        originalTimezone: "Moon/Sea-of-Tranquility",
        idempotencyKey: "schedule-validation-3",
      },
    })
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: {
        ...payload,
        resources: [payload.resources[0], payload.resources[0]],
        idempotencyKey: "schedule-validation-4",
      },
    })
    const viewer = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { ...payload, idempotencyKey: "schedule-validation-5" },
    })

    expect(stale.statusCode).toBe(409)
    expect(invalidRange.json().code).toBe("SCHEDULE_RANGE_INVALID")
    expect(invalidTimezone.json().code).toBe("SCHEDULE_TIMEZONE_INVALID")
    expect(duplicate.json().code).toBe("SCHEDULE_RESOURCE_DUPLICATE")
    expect(viewer.statusCode).toBe(403)
  })

  it("preserves execution stage fields omitted by an update command", async () => {
    const { app, productionService } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/execution-schedule",
      headers: writerHeaders,
      payload: {
        name: "部分更新验收",
        startsAt: "2026-08-22T01:00:00.000Z",
        endsAt: "2026-08-22T03:00:00.000Z",
        originalTimezone: "Asia/Shanghai",
        progress: 0,
        owner: "林乔",
        state: "未开始",
        note: "保留内容",
        resources: [],
        idempotencyKey: "schedule-partial-update-1",
      },
    })
    const before = created.json().item as ExecutionStage
    const updated = await productionService.updateExecutionStage({
      actorId: "account-fanxing",
      projectId: "winter-coffee",
      itemId: before.id,
      startsAt: undefined,
      endsAt: undefined,
      progress: 40,
      expectedRevision: before.revision,
    })

    expect(updated).toMatchObject({
      startsAt: before.startsAt,
      endsAt: before.endsAt,
      originalTimezone: before.originalTimezone,
      owner: before.owner,
      note: before.note,
      progress: 40,
      revision: 2,
    })
  })

  it("associates only project-available contacts with confirmed breakdown items", async () => {
    const { app } = await createTestApp()
    const beforeConfirmation = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        contactRefs: [{ source: "team", contactId: "team-contact-rain-fx" }],
        expectedRevision: 1,
      },
    })
    await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-1", expectedRevision: 1 }],
        idempotencyKey: "breakdown-contacts-confirm",
      },
    })
    const duplicate = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        contactRefs: [
          { source: "team", contactId: "team-contact-rain-fx" },
          { source: "team", contactId: "team-contact-rain-fx" },
        ],
        expectedRevision: 2,
      },
    })
    const unavailable = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        contactRefs: [{ source: "member-shared", contactId: "personal-contact-private" }],
        expectedRevision: 2,
      },
    })
    const associated = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        contactRefs: [
          { source: "team", contactId: "team-contact-rain-fx" },
          { source: "member-shared", contactId: "personal-contact-linqiao" },
        ],
        expectedRevision: 2,
      },
    })
    const staleClear = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { contactRefs: [], expectedRevision: 2 },
    })
    const cleared = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { contactRefs: [], expectedRevision: 3 },
    })
    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown",
      headers: writerHeaders,
    })

    expect(beforeConfirmation.statusCode).toBe(409)
    expect(beforeConfirmation.json().code).toBe("BREAKDOWN_RELATION_REQUIRES_CONFIRMED")
    expect(duplicate.statusCode).toBe(400)
    expect(unavailable.statusCode).toBe(400)
    expect(unavailable.json().code).toBe("BREAKDOWN_CONTACT_UNAVAILABLE")
    expect(associated.statusCode).toBe(200)
    expect(associated.json()).toMatchObject({
      contactRefs: [
        { source: "team", contactId: "team-contact-rain-fx" },
        { source: "member-shared", contactId: "personal-contact-linqiao" },
      ],
      revision: 3,
    })
    expect(staleClear.statusCode).toBe(409)
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toMatchObject({ contactRefs: [], revision: 4 })
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "breakdown-1", contactRefs: [], revision: 4 }),
      ]),
    )
  })

  it("associates only current-project call sheets with confirmed breakdown items", async () => {
    const { app } = await createTestApp()
    const options = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown/options",
      headers: writerHeaders,
    })
    const beforeConfirmation = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { callSheetIds: ["call-sheet-winter-1"], expectedRevision: 1 },
    })
    await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-1", expectedRevision: 1 }],
        idempotencyKey: "breakdown-call-sheets-confirm",
      },
    })
    const duplicate = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        callSheetIds: ["call-sheet-winter-1", "call-sheet-winter-1"],
        expectedRevision: 2,
      },
    })
    const unavailable = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { callSheetIds: ["call-sheet-other-project"], expectedRevision: 2 },
    })
    const associated = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: {
        callSheetIds: ["call-sheet-winter-1", "call-sheet-winter-2"],
        expectedRevision: 2,
      },
    })
    const staleClear = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { callSheetIds: [], expectedRevision: 2 },
    })
    const cleared = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { callSheetIds: [], expectedRevision: 3 },
    })
    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown",
      headers: writerHeaders,
    })

    expect(options.json()).toMatchObject({
      callSheets: expect.arrayContaining([
        expect.objectContaining({ id: "call-sheet-winter-1", title: "车站夜戏" }),
        expect.objectContaining({
          id: "call-sheet-winter-2",
          title: "站台出口与清晨补景",
        }),
      ]),
    })
    expect(beforeConfirmation.statusCode).toBe(409)
    expect(beforeConfirmation.json().code).toBe("BREAKDOWN_RELATION_REQUIRES_CONFIRMED")
    expect(duplicate.statusCode).toBe(400)
    expect(unavailable.statusCode).toBe(400)
    expect(unavailable.json().code).toBe("BREAKDOWN_CALL_SHEET_UNAVAILABLE")
    expect(associated.statusCode).toBe(200)
    expect(associated.json()).toMatchObject({
      callSheetIds: ["call-sheet-winter-1", "call-sheet-winter-2"],
      revision: 3,
    })
    expect(staleClear.statusCode).toBe(409)
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toMatchObject({ callSheetIds: [], revision: 4 })
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "breakdown-1", callSheetIds: [], revision: 4 }),
      ]),
    )
  })

  it("associates only current-project shooting days with confirmed breakdown items", async () => {
    const { app } = await createTestApp()
    const options = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown/options",
      headers: writerHeaders,
    })
    const beforeConfirmation = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { shootingDayIds: ["shooting-day-winter-1"], expectedRevision: 1 },
    })
    await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/breakdown/confirm",
      headers: writerHeaders,
      payload: {
        category: "cast",
        items: [{ itemId: "breakdown-1", expectedRevision: 1 }],
        idempotencyKey: "breakdown-shooting-days-confirm",
      },
    })
    const unavailable = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { shootingDayIds: ["shooting-day-city-1"], expectedRevision: 2 },
    })
    const associated = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/breakdown/breakdown-1",
      headers: writerHeaders,
      payload: { shootingDayIds: ["shooting-day-winter-1"], expectedRevision: 2 },
    })
    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/breakdown",
      headers: writerHeaders,
    })

    expect(options.json()).toMatchObject({
      shootingDays: [
        expect.objectContaining({
          id: "shooting-day-winter-1",
          shootDate: "2026-08-19",
          dayNumber: 5,
        }),
      ],
    })
    expect(beforeConfirmation.statusCode).toBe(409)
    expect(beforeConfirmation.json().code).toBe("BREAKDOWN_RELATION_REQUIRES_CONFIRMED")
    expect(unavailable.statusCode).toBe(400)
    expect(unavailable.json().code).toBe("BREAKDOWN_SHOOTING_DAY_UNAVAILABLE")
    expect(associated.json()).toMatchObject({
      shootingDayIds: ["shooting-day-winter-1"],
      revision: 3,
    })
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "breakdown-1",
          shootingDayIds: ["shooting-day-winter-1"],
        }),
      ]),
    )
  })

  it("creates a review version from a ready project video idempotently", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
      payload: {
        assetId: "asset-review-ready",
        name: "冬夜咖啡_补拍版",
        version: "v13",
        duration: "00:32",
        idempotencyKey: "review-file-create-1",
      },
    }
    const created = await app.inject(request)
    const replay = await app.inject(request)
    const reusedKey = await app.inject({
      ...request,
      payload: { ...request.payload, name: "不同名称" },
    })
    const duplicateSource = await app.inject({
      ...request,
      payload: { ...request.payload, idempotencyKey: "review-file-create-2" },
    })
    const readback = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
    })

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      replayed: false,
      item: {
        assetId: "asset-review-ready",
        name: "冬夜咖啡_补拍版",
        version: "v13",
        type: "video",
        status: "待审阅",
        revision: 1,
      },
    })
    expect(replay.json().replayed).toBe(true)
    expect(reusedKey.statusCode).toBe(409)
    expect(reusedKey.json().code).toBe("IDEMPOTENCY_KEY_REUSED")
    expect(duplicateSource.statusCode).toBe(409)
    expect(duplicateSource.json().code).toBe("REVIEW_FILE_ALREADY_EXISTS")
    expect(readback.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetId: "asset-review-ready", version: "v13" }),
      ]),
    )
    expect(repository.reviewFiles).toHaveLength(2)
  })
  it("creates a review version from a team-library video asset of the same team", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
      payload: {
        assetId: "asset-review-team-library",
        name: "团队库成片",
        version: "v1",
        idempotencyKey: "review-file-create-team-1",
      },
    }
    const created = await app.inject(request)
    const readback = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
    })

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      replayed: false,
      item: {
        assetId: "asset-review-team-library",
        name: "团队库成片",
        version: "v1",
        type: "video",
        status: "待审阅",
      },
    })
    expect(readback.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetId: "asset-review-team-library" }),
      ]),
    )
    // 素材全局只能挂载一个审片版本
    const duplicate = await app.inject({
      ...request,
      payload: { ...request.payload, idempotencyKey: "review-file-create-team-2" },
    })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().code).toBe("REVIEW_FILE_ALREADY_EXISTS")
    expect(repository.reviewFiles).toHaveLength(2)
  })
  it("rejects invalid review sources and requires project write access", async () => {
    const { app } = await createTestApp()
    const requestFor = (assetId: string, idempotencyKey: string) => ({
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
      payload: { assetId, name: "候选版本", version: "v1", idempotencyKey },
    })
    const missing = await app.inject(requestFor("asset-missing", "review-source-missing"))
    const image = await app.inject(
      requestFor("asset-review-image", "review-source-image"),
    )
    const uploading = await app.inject(
      requestFor("asset-review-uploading", "review-source-uploading"),
    )
    const archived = await app.inject(
      requestFor("asset-review-archived", "review-source-archived"),
    )
    const viewer = await app.inject({
      ...requestFor("asset-review-ready", "review-source-viewer"),
      headers: { "x-shadow-account-id": "account-viewer" },
    })
    const anonymous = await app.inject({
      ...requestFor("asset-review-ready", "review-source-anonymous"),
      headers: undefined,
    })

    expect(missing.statusCode).toBe(404)
    expect(image.statusCode).toBe(409)
    expect(image.json().code).toBe("REVIEW_SOURCE_INVALID")
    expect(uploading.statusCode).toBe(409)
    expect(archived.statusCode).toBe(404)
    expect(viewer.statusCode).toBe(403)
    expect(anonymous.statusCode).toBe(401)
  })

  it("creates review folders and moves files with refresh-safe revisions", async () => {
    const { app } = await createTestApp()
    const folderRequest = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/review-folders",
      headers: writerHeaders,
      payload: {
        name: "客户精修",
        idempotencyKey: "review-folder-create-1",
      },
    }
    const created = await app.inject(folderRequest)
    const replay = await app.inject(folderRequest)
    const duplicate = await app.inject({
      ...folderRequest,
      payload: { name: "客户精修", idempotencyKey: "review-folder-create-2" },
    })
    const folderId = created.json().item.id as string
    const moveRequest = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/review-files/review-file-1/move",
      headers: writerHeaders,
      payload: {
        folderId,
        expectedRevision: 1,
        idempotencyKey: "review-file-move-1",
      },
    }
    const moved = await app.inject(moveRequest)
    const moveReplay = await app.inject(moveRequest)
    const nonEmptyArchive = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-folders/${folderId}`,
      headers: writerHeaders,
      payload: { archived: true, expectedRevision: 1 },
    })
    const stale = await app.inject({
      ...moveRequest,
      payload: { ...moveRequest.payload, idempotencyKey: "review-file-move-stale" },
    })
    const missingFolder = await app.inject({
      ...moveRequest,
      payload: {
        folderId: "review-folder-missing",
        expectedRevision: 2,
        idempotencyKey: "review-file-move-missing",
      },
    })
    const movedToRoot = await app.inject({
      ...moveRequest,
      payload: {
        folderId: null,
        expectedRevision: 2,
        idempotencyKey: "review-file-move-root",
      },
    })
    const readback = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
    })
    const viewer = await app.inject({
      ...folderRequest,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { name: "无权目录", idempotencyKey: "review-folder-viewer-1" },
    })
    const staleArchive = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-folders/${folderId}`,
      headers: writerHeaders,
      payload: { archived: true, expectedRevision: 99 },
    })
    const archivedFolder = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-folders/${folderId}`,
      headers: writerHeaders,
      payload: { archived: true, expectedRevision: 1 },
    })
    const activeFolders = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-folders",
      headers: writerHeaders,
    })
    const archivedFolders = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-folders?archived=1",
      headers: writerHeaders,
    })
    const staleRestore = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-folders/${folderId}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: 1 },
    })
    const viewerRestore = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-folders/${folderId}`,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { archived: false, expectedRevision: 2 },
    })
    const restoredFolder = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-folders/${folderId}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: 2 },
    })
    const archivedAgain = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-folders/${folderId}`,
      headers: writerHeaders,
      payload: { archived: true, expectedRevision: 3 },
    })
    const replacement = await app.inject({
      ...folderRequest,
      payload: { name: "客户精修", idempotencyKey: "review-folder-replacement" },
    })
    const conflictingRestore = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-folders/${folderId}`,
      headers: writerHeaders,
      payload: { archived: false, expectedRevision: 4 },
    })

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      replayed: false,
      item: { name: "客户精修", revision: 1 },
    })
    expect(replay.json().replayed).toBe(true)
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().code).toBe("REVIEW_FOLDER_EXISTS")
    expect(moved.json()).toMatchObject({
      replayed: false,
      item: { folderId, revision: 2 },
    })
    expect(moveReplay.json().replayed).toBe(true)
    expect(nonEmptyArchive.statusCode).toBe(409)
    expect(nonEmptyArchive.json().code).toBe("REVIEW_FOLDER_NOT_EMPTY")
    expect(stale.statusCode).toBe(409)
    expect(missingFolder.statusCode).toBe(404)
    expect(movedToRoot.json().item).toMatchObject({ folderId: null, revision: 3 })
    expect(readback.json()).toMatchObject({
      items: [expect.objectContaining({ id: "review-file-1", folderId: null })],
      folders: [expect.objectContaining({ id: folderId, name: "客户精修" })],
    })
    expect(viewer.statusCode).toBe(403)
    expect(staleArchive.statusCode).toBe(409)
    expect(archivedFolder.json()).toMatchObject({ archived: true, revision: 2 })
    expect(activeFolders.json().items).toEqual([])
    expect(archivedFolders.json().items).toEqual([
      expect.objectContaining({ id: folderId, archived: true, revision: 2 }),
    ])
    expect(staleRestore.statusCode).toBe(409)
    expect(viewerRestore.statusCode).toBe(403)
    expect(restoredFolder.json()).toMatchObject({ archived: false, revision: 3 })
    expect(archivedAgain.json()).toMatchObject({ archived: true, revision: 4 })
    expect(replacement.statusCode).toBe(201)
    expect(conflictingRestore.statusCode).toBe(409)
    expect(conflictingRestore.json().code).toBe("REVIEW_FOLDER_EXISTS")
  })

  it("approves and revokes review files with idempotency and revision checks", async () => {
    const { app } = await createTestApp()
    const approveRequest = {
      method: "POST" as const,
      url: "/v1/projects/winter-coffee/review-files/review-file-1/approve",
      headers: writerHeaders,
      payload: {
        expectedRevision: 1,
        idempotencyKey: "review-file-approve-1",
      },
    }
    const approved = await app.inject(approveRequest)
    const replay = await app.inject(approveRequest)
    const reusedKey = await app.inject({
      ...approveRequest,
      payload: { ...approveRequest.payload, expectedRevision: 2 },
    })
    const invalidRepeat = await app.inject({
      ...approveRequest,
      payload: {
        expectedRevision: 2,
        idempotencyKey: "review-file-approve-2",
      },
    })
    const approvedReadback = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
    })
    const revoked = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-files/review-file-1/revoke-approval",
      headers: writerHeaders,
      payload: {
        expectedRevision: 2,
        idempotencyKey: "review-file-revoke-1",
      },
    })
    const revokedReadback = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
    })
    const stale = await app.inject({
      ...approveRequest,
      payload: {
        expectedRevision: 2,
        idempotencyKey: "review-file-stale-1",
      },
    })

    expect(approved.statusCode).toBe(200)
    expect(approved.json().item).toMatchObject({
      status: "已通过",
      approvedBy: "繁星",
      approvedAt: now,
      revision: 2,
    })
    expect(approvedReadback.json().items[0]).toMatchObject({
      approvedBy: "繁星",
      approvedAt: now,
    })
    expect(approved.json().replayed).toBe(false)
    expect(replay.json().replayed).toBe(true)
    expect(reusedKey.statusCode).toBe(409)
    expect(reusedKey.json().code).toBe("IDEMPOTENCY_KEY_REUSED")
    expect(invalidRepeat.statusCode).toBe(409)
    expect(invalidRepeat.json().code).toBe("REVIEW_FILE_APPROVAL_INVALID")
    expect(revoked.statusCode).toBe(200)
    expect(revoked.json().item).toMatchObject({
      status: "审阅中",
      approvedBy: null,
      approvedAt: null,
      revision: 3,
    })
    expect(revokedReadback.json().items[0]).toMatchObject({
      approvedBy: null,
      approvedAt: null,
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe("RESOURCE_CONFLICT")
  })

  it("archives and restores review files with project-scoped revisions", async () => {
    const { app } = await createTestApp()
    const archiveRequest = {
      method: "PATCH" as const,
      url: "/v1/projects/winter-coffee/review-files/review-file-1",
      headers: writerHeaders,
      payload: {
        archived: true,
        expectedRevision: 1,
        idempotencyKey: "review-file-archive-1",
      },
    }
    const archived = await app.inject(archiveRequest)
    const replay = await app.inject(archiveRequest)
    const activeList = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
    })
    const archivedList = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files?archived=1",
      headers: writerHeaders,
    })
    const staleRestore = await app.inject({
      ...archiveRequest,
      payload: {
        archived: false,
        expectedRevision: 1,
        idempotencyKey: "review-file-restore-stale",
      },
    })
    const viewerRestore = await app.inject({
      ...archiveRequest,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        archived: false,
        expectedRevision: 2,
        idempotencyKey: "review-file-restore-viewer",
      },
    })
    const restored = await app.inject({
      ...archiveRequest,
      payload: {
        archived: false,
        expectedRevision: 2,
        idempotencyKey: "review-file-restore-1",
      },
    })
    const restoredList = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files",
      headers: writerHeaders,
    })

    expect(archived.statusCode).toBe(200)
    expect(archived.json()).toMatchObject({
      replayed: false,
      item: { id: "review-file-1", revision: 2 },
    })
    expect(replay.json()).toMatchObject({ replayed: true, item: { revision: 2 } })
    expect(activeList.json().items).toEqual([])
    expect(archivedList.json().items).toEqual([
      expect.objectContaining({ id: "review-file-1", revision: 2 }),
    ])
    expect(staleRestore.statusCode).toBe(409)
    expect(viewerRestore.statusCode).toBe(403)
    expect(restored.json()).toMatchObject({
      replayed: false,
      item: { id: "review-file-1", revision: 3 },
    })
    expect(restoredList.json().items).toEqual([
      expect.objectContaining({ id: "review-file-1", revision: 3 }),
    ])
  })

  it("permanently deletes only archived review files with explicit confirmation", async () => {
    const { app, repository } = await createTestApp()
    const url = "/v1/projects/winter-coffee/review-files/review-file-1/permanent"
    const activeDelete = await app.inject({
      method: "DELETE",
      url,
      headers: writerHeaders,
      payload: { expectedRevision: 1, confirmation: "permanent-delete" },
    })
    const archived = await app.inject({
      method: "PATCH",
      url: "/v1/projects/winter-coffee/review-files/review-file-1",
      headers: writerHeaders,
      payload: {
        archived: true,
        expectedRevision: 1,
        idempotencyKey: "review-file-delete-archive",
      },
    })
    const missingConfirmation = await app.inject({
      method: "DELETE",
      url,
      headers: writerHeaders,
      payload: { expectedRevision: 2 },
    })
    const stale = await app.inject({
      method: "DELETE",
      url,
      headers: writerHeaders,
      payload: { expectedRevision: 1, confirmation: "permanent-delete" },
    })
    const viewer = await app.inject({
      method: "DELETE",
      url,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { expectedRevision: 2, confirmation: "permanent-delete" },
    })
    repository.portfolioReviewFileIds.add("review-file-1")
    const inUse = await app.inject({
      method: "DELETE",
      url,
      headers: writerHeaders,
      payload: { expectedRevision: 2, confirmation: "permanent-delete" },
    })
    repository.portfolioReviewFileIds.clear()
    const deleted = await app.inject({
      method: "DELETE",
      url,
      headers: writerHeaders,
      payload: { expectedRevision: 2, confirmation: "permanent-delete" },
    })
    const archivedList = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files?archived=1",
      headers: writerHeaders,
    })

    expect(activeDelete.statusCode).toBe(404)
    expect(archived.statusCode).toBe(200)
    expect(missingConfirmation.statusCode).toBe(400)
    expect(stale.statusCode).toBe(409)
    expect(viewer.statusCode).toBe(403)
    expect(inUse.statusCode).toBe(409)
    expect(inUse.json()).toMatchObject({ code: "REVIEW_FILE_IN_USE" })
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json()).toEqual({ id: "review-file-1" })
    expect(archivedList.json().items).toEqual([])
  })

  it("requires project write access to change review approval", async () => {
    const { app } = await createTestApp()
    const viewer = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-files/review-file-1/approve",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        expectedRevision: 1,
        idempotencyKey: "review-file-viewer-1",
      },
    })
    const missingActor = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-files/review-file-1/approve",
      payload: {
        expectedRevision: 1,
        idempotencyKey: "review-file-anonymous-1",
      },
    })

    expect(viewer.statusCode).toBe(403)
    expect(missingActor.statusCode).toBe(401)
  })

  it("persists review comments and their resolved state", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-files/review-file-1/comments",
      headers: writerHeaders,
      payload: {
        version: "forged-client-version",
        timecode: "00:18.420",
        text: "这里需要再多留两帧。",
        parentCommentId: null,
        idempotencyKey: "review-comment-command-1",
      },
    })
    const reply = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-files/review-file-1/comments",
      headers: writerHeaders,
      payload: {
        version: "v12",
        timecode: "00:18.420",
        text: "收到，调整后再回传。",
        parentCommentId: created.json().item.id,
        idempotencyKey: "review-comment-reply-1",
      },
    })
    const nestedReply = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-files/review-file-1/comments",
      headers: writerHeaders,
      payload: {
        version: "v12",
        timecode: "00:18.420",
        text: "不应创建二级回复。",
        parentCommentId: reply.json().item.id,
        idempotencyKey: "review-comment-reply-2",
      },
    })
    const resolved = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-comments/${created.json().item.id}`,
      headers: writerHeaders,
      payload: { state: "resolved", expectedRevision: 1 },
    })
    const reopened = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-comments/${created.json().item.id}`,
      headers: writerHeaders,
      payload: { state: "open", expectedRevision: 2 },
    })
    const replyStateChange = await app.inject({
      method: "PATCH",
      url: `/v1/projects/winter-coffee/review-comments/${reply.json().item.id}`,
      headers: writerHeaders,
      payload: { state: "resolved", expectedRevision: 1 },
    })
    const listed = await app.inject({
      method: "GET",
      url: "/v1/projects/winter-coffee/review-files/review-file-1/comments",
      headers: writerHeaders,
    })

    expect(created.statusCode).toBe(201)
    expect(created.json().item.parentCommentId).toBeNull()
    expect(created.json().item.version).toBe("v12")
    expect(reply.statusCode).toBe(201)
    expect(reply.json().item.parentCommentId).toBe(created.json().item.id)
    expect(nestedReply.statusCode).toBe(400)
    expect(resolved.statusCode).toBe(200)
    expect(resolved.json().state).toBe("resolved")
    expect(resolved.json().revision).toBe(2)
    expect(reopened.statusCode).toBe(200)
    expect(reopened.json()).toMatchObject({ state: "open", revision: 3 })
    expect(replyStateChange.statusCode).toBe(400)
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.json().item.id, parentCommentId: null }),
        expect.objectContaining({
          id: reply.json().item.id,
          parentCommentId: created.json().item.id,
        }),
      ]),
    )
  })

  it("suggests, confirms, persists and unlinks cross-version review comments", async () => {
    const { app, repository } = await createTestApp()
    repository.reviewFiles.push({
      ...repository.reviewFiles[0],
      id: "review-file-2",
      assetId: "asset-review-ready",
      version: "v13",
    })
    const primary = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-files/review-file-1/comments",
      headers: writerHeaders,
      payload: {
        version: "v12",
        timecode: "00:07.120",
        text: "开场站台空镜需要再留两帧。",
        idempotencyKey: "review-correspondence-primary-1",
      },
    })
    const counterpart = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-files/review-file-2/comments",
      headers: writerHeaders,
      payload: {
        version: "v13",
        timecode: "00:07.480",
        text: "开场站台空镜再留两帧。",
        idempotencyKey: "review-correspondence-compare-1",
      },
    })
    const correspondenceUrl =
      "/v1/projects/winter-coffee/review-comment-correspondence" +
      "?primaryFileId=review-file-1&compareFileId=review-file-2"
    const suggested = await app.inject({
      method: "GET",
      url: correspondenceUrl,
      headers: writerHeaders,
    })
    const created = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-comment-links",
      headers: writerHeaders,
      payload: {
        commentId: primary.json().item.id,
        counterpartCommentId: counterpart.json().item.id,
        idempotencyKey: "review-correspondence-link-1",
      },
    })
    const replayed = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-comment-links",
      headers: writerHeaders,
      payload: {
        commentId: primary.json().item.id,
        counterpartCommentId: counterpart.json().item.id,
        idempotencyKey: "review-correspondence-link-1",
      },
    })
    const confirmed = await app.inject({
      method: "GET",
      url: correspondenceUrl,
      headers: writerHeaders,
    })
    const unlinked = await app.inject({
      method: "POST",
      url: `/v1/projects/winter-coffee/review-comment-links/${created.json().item.id}/unlink`,
      headers: writerHeaders,
      payload: { expectedRevision: 1 },
    })
    const stale = await app.inject({
      method: "POST",
      url: `/v1/projects/winter-coffee/review-comment-links/${created.json().item.id}/unlink`,
      headers: writerHeaders,
      payload: { expectedRevision: 1 },
    })
    const afterUnlink = await app.inject({
      method: "GET",
      url: correspondenceUrl,
      headers: writerHeaders,
    })

    expect(suggested.statusCode).toBe(200)
    expect(suggested.json().links).toHaveLength(0)
    expect(suggested.json().suggestions).toEqual([
      expect.objectContaining({
        commentId: primary.json().item.id,
        counterpartCommentId: counterpart.json().item.id,
      }),
    ])
    expect(created.statusCode).toBe(201)
    expect(created.json().replayed).toBe(false)
    expect(replayed.json().replayed).toBe(true)
    expect(confirmed.json().links).toHaveLength(1)
    expect(confirmed.json().suggestions).toHaveLength(0)
    expect(unlinked.statusCode).toBe(200)
    expect(unlinked.json()).toMatchObject({ revision: 2 })
    expect(stale.statusCode).toBe(409)
    expect(afterUnlink.json().links).toHaveLength(0)
    expect(afterUnlink.json().suggestions).toHaveLength(1)
    expect(repository.reviewComments).toHaveLength(2)
    expect(repository.reviewComments.every((comment) => comment.revision === 1)).toBe(
      true,
    )
  })

  it("keeps cross-version review correspondence read-only for viewers", async () => {
    const { app, repository } = await createTestApp()
    repository.reviewFiles.push({
      ...repository.reviewFiles[0],
      id: "review-file-2",
      assetId: "asset-review-ready",
      version: "v13",
    })
    repository.reviewComments.push(
      {
        id: "review-comment-a",
        fileId: "review-file-1",
        parentCommentId: null,
        version: "v12",
        author: "繁星",
        authorId: "account-fanxing",
        initials: "FX",
        timecode: "00:07.120",
        text: "开场站台空镜。",
        state: "open",
        revision: 1,
        createdAt: now,
      },
      {
        id: "review-comment-b",
        fileId: "review-file-2",
        parentCommentId: null,
        version: "v13",
        author: "繁星",
        authorId: "account-fanxing",
        initials: "FX",
        timecode: "00:07.220",
        text: "开场站台空镜。",
        state: "open",
        revision: 1,
        createdAt: now,
      },
    )
    const read = await app.inject({
      method: "GET",
      url:
        "/v1/projects/winter-coffee/review-comment-correspondence" +
        "?primaryFileId=review-file-1&compareFileId=review-file-2",
      headers: { "x-shadow-account-id": "account-viewer" },
    })
    const write = await app.inject({
      method: "POST",
      url: "/v1/projects/winter-coffee/review-comment-links",
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: {
        commentId: "review-comment-a",
        counterpartCommentId: "review-comment-b",
        idempotencyKey: "review-correspondence-viewer-1",
      },
    })

    expect(read.statusCode).toBe(200)
    expect(read.json().suggestions).toHaveLength(1)
    expect(write.statusCode).toBe(403)
  })
})
