import type {
  BreakdownDraft,
  BreakdownItem,
  BreakdownRelationOptions,
  CallSheet,
  CallSheetChange,
  CallSheetPublication,
  ConfirmBreakdownBody,
  CreateCallSheetBody,
  CreateExecutionStageBody,
  CreateReviewCommentBody,
  CreateReviewCommentLinkBody,
  CreateReviewFileBody,
  CreateReviewFolderBody,
  CreateShootingDayBody,
  ExecutionConflict,
  ExecutionStage,
  MergeBreakdownBody,
  MoveReviewFileBody,
  PermanentlyDeleteRecycleItemBody,
  PermissionCapability,
  PublishCallSheetBody,
  ReviewComment,
  ReviewCommentLink,
  ReviewCommentSuggestion,
  ReviewFile,
  ReviewFileApprovalBody,
  ReviewFolder,
  ShootingDay,
  SplitBreakdownBody,
  UnlinkReviewCommentLinkBody,
  UpdateBreakdownItemBody,
  UpdateCallSheetBody,
  UpdateExecutionStageBody,
  UpdateReviewCommentBody,
  UpdateReviewFileArchiveBody,
  UpdateReviewFolderBody,
  UpdateShootingDayBody,
} from "@shadowproducer/contracts"
import { accessAllows } from "./access"
import { AppError } from "./script-service"
import type { CreateResult, UpdateResult } from "./workspace-service"

export type ProductionProjectAccess = { canRead: boolean; canWrite: boolean }
type ProjectCommand = { actorId: string; projectId: string }
type ProjectItemCommand = ProjectCommand & { itemId: string }

export type UpdateBreakdownCommand = ProjectItemCommand & UpdateBreakdownItemBody
export type ConfirmBreakdownCommand = ProjectCommand & ConfirmBreakdownBody
export type MergeBreakdownCommand = ProjectCommand & MergeBreakdownBody
export type SplitBreakdownCommand = ProjectCommand & SplitBreakdownBody
export type CreateCallSheetCommand = ProjectCommand & CreateCallSheetBody
export type GeneratedCallSheetDraft = Pick<
  CallSheet,
  "location" | "scenes" | "cast" | "departments" | "equipment" | "safety" | "keyContacts"
> & { breakdownItemIds: string[] }
export type UpdateCallSheetCommand = ProjectItemCommand & UpdateCallSheetBody
export type PublishCallSheetCommand = ProjectItemCommand & PublishCallSheetBody
export type CreateExecutionStageCommand = ProjectCommand & CreateExecutionStageBody
export type UpdateExecutionStageCommand = ProjectItemCommand & UpdateExecutionStageBody
export type CreateShootingDayCommand = ProjectCommand & CreateShootingDayBody
export type UpdateShootingDayCommand = ProjectItemCommand & UpdateShootingDayBody
export type CreateReviewCommentCommand = ProjectCommand & {
  fileId: string
} & CreateReviewCommentBody
export type CreateReviewFileCommand = ProjectCommand & CreateReviewFileBody
export type CreateReviewFolderCommand = ProjectCommand & CreateReviewFolderBody
export type UpdateReviewFolderCommand = ProjectCommand & {
  folderId: string
} & UpdateReviewFolderBody
export type MoveReviewFileCommand = ProjectCommand & {
  fileId: string
} & MoveReviewFileBody
export type UpdateReviewFileArchiveCommand = ProjectCommand & {
  fileId: string
} & UpdateReviewFileArchiveBody
export type PermanentlyDeleteReviewFileCommand = ProjectCommand &
  PermanentlyDeleteRecycleItemBody & { fileId: string }
export type UpdateReviewCommentCommand = ProjectCommand & {
  commentId: string
} & UpdateReviewCommentBody
export type CreateReviewCommentLinkCommand = ProjectCommand & CreateReviewCommentLinkBody
export type UnlinkReviewCommentLinkCommand = ProjectCommand & {
  linkId: string
} & UnlinkReviewCommentLinkBody
export type ReviewFileApprovalAction = "approve" | "revoke"
export type ReviewFileApprovalCommand = ProjectCommand & {
  fileId: string
  action: ReviewFileApprovalAction
} & ReviewFileApprovalBody

export type ReviewFileApprovalResult =
  | CreateResult<ReviewFile>
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "invalid_transition" }

export type CreateReviewFileResult =
  | CreateResult<ReviewFile>
  | { kind: "not_found" }
  | { kind: "invalid_source" }
  | { kind: "invalid_folder" }
  | { kind: "already_exists" }

export type CreateReviewFolderResult =
  | CreateResult<ReviewFolder>
  | { kind: "already_exists" }

export type MoveReviewFileResult =
  | CreateResult<ReviewFile>
  | { kind: "not_found" | "invalid_folder" | "conflict" }

export type UpdateReviewFileArchiveResult =
  | CreateResult<ReviewFile>
  | { kind: "not_found" | "conflict" }

export type PermanentlyDeleteReviewFileResult =
  | { kind: "ok"; item: { id: string } }
  | { kind: "not_found" | "conflict" | "in_use" }

export type CreateReviewCommentLinkResult =
  | CreateResult<ReviewCommentLink>
  | { kind: "not_found" | "invalid_pair" }

export type ConfirmBreakdownResult =
  | { items: BreakdownItem[]; replayed: boolean }
  | { kind: "not_found" | "conflict" | "invalid_selection" }

export type RewriteBreakdownResult = ConfirmBreakdownResult
export type UpdateBreakdownResult =
  | UpdateResult<BreakdownItem>
  | { kind: "invalid_state" }
  | { kind: "invalid_supplier" }
  | { kind: "invalid_responsible" }
  | { kind: "invalid_task" }
  | { kind: "invalid_contact" }
  | { kind: "invalid_shooting_day" }
  | { kind: "invalid_call_sheet" }

export type CreateShootingDayResult = CreateResult<ShootingDay> | { kind: "duplicate" }
export type UpdateShootingDayResult = UpdateResult<ShootingDay> | { kind: "duplicate" }

export type PublishCallSheetResult =
  | {
      item: CallSheet
      publication: CallSheetPublication
      replayed: boolean
    }
  | { kind: "not_found" | "conflict" | "already_published" }

export interface ProductionRepository {
  getProjectAccess(
    actorId: string,
    projectId: string,
  ): Promise<ProductionProjectAccess | null>
  listBreakdown(projectId: string): Promise<BreakdownItem[]>
  listBreakdownRelationOptions(projectId: string): Promise<BreakdownRelationOptions>
  updateBreakdown(command: UpdateBreakdownCommand): Promise<UpdateBreakdownResult>
  confirmBreakdown(command: ConfirmBreakdownCommand): Promise<ConfirmBreakdownResult>
  mergeBreakdown(command: MergeBreakdownCommand): Promise<RewriteBreakdownResult>
  splitBreakdown(command: SplitBreakdownCommand): Promise<RewriteBreakdownResult>
  listExecutionSchedule(
    actorId: string,
    projectId: string,
  ): Promise<{ items: ExecutionStage[]; conflicts: ExecutionConflict[] }>
  createExecutionStage(
    command: CreateExecutionStageCommand,
  ): Promise<CreateResult<ExecutionStage>>
  updateExecutionStage(
    command: UpdateExecutionStageCommand,
  ): Promise<UpdateResult<ExecutionStage>>
  listShootingDays(projectId: string): Promise<ShootingDay[]>
  createShootingDay(command: CreateShootingDayCommand): Promise<CreateShootingDayResult>
  updateShootingDay(command: UpdateShootingDayCommand): Promise<UpdateShootingDayResult>
  listCallSheets(projectId: string): Promise<CallSheet[]>
  listCallSheetHistory(
    projectId: string,
    itemId: string,
    actorId: string,
  ): Promise<{ publications: CallSheetPublication[]; changes: CallSheetChange[] } | null>
  createCallSheet(
    command: CreateCallSheetCommand,
    draft?: GeneratedCallSheetDraft,
  ): Promise<CreateResult<CallSheet>>
  updateCallSheet(command: UpdateCallSheetCommand): Promise<UpdateResult<CallSheet>>
  publishCallSheet(command: PublishCallSheetCommand): Promise<PublishCallSheetResult>
  listReviewFiles(projectId: string, archived?: boolean): Promise<ReviewFile[]>
  listReviewFolders(projectId: string, archived?: boolean): Promise<ReviewFolder[]>
  createReviewFile(command: CreateReviewFileCommand): Promise<CreateReviewFileResult>
  createReviewFolder(
    command: CreateReviewFolderCommand,
  ): Promise<CreateReviewFolderResult>
  updateReviewFolder(
    command: UpdateReviewFolderCommand,
  ): Promise<UpdateResult<ReviewFolder>>
  moveReviewFile(command: MoveReviewFileCommand): Promise<MoveReviewFileResult>
  updateReviewFileArchive(
    command: UpdateReviewFileArchiveCommand,
  ): Promise<UpdateReviewFileArchiveResult>
  permanentlyDeleteReviewFile(
    command: PermanentlyDeleteReviewFileCommand,
  ): Promise<PermanentlyDeleteReviewFileResult>
  updateReviewFileApproval(
    command: ReviewFileApprovalCommand,
  ): Promise<ReviewFileApprovalResult>
  listReviewComments(projectId: string, fileId: string): Promise<ReviewComment[] | null>
  createReviewComment(
    command: CreateReviewCommentCommand,
  ): Promise<CreateResult<ReviewComment> | null>
  updateReviewComment(
    command: UpdateReviewCommentCommand,
  ): Promise<UpdateResult<ReviewComment>>
  listReviewCommentLinks(
    projectId: string,
    primaryFileId: string,
    compareFileId: string,
  ): Promise<ReviewCommentLink[]>
  createReviewCommentLink(
    command: CreateReviewCommentLinkCommand,
  ): Promise<CreateReviewCommentLinkResult>
  unlinkReviewCommentLink(
    command: UnlinkReviewCommentLinkCommand,
  ): Promise<UpdateResult<ReviewCommentLink>>
}

export class ProductionService {
  constructor(private readonly repository: ProductionRepository) {}

  async listBreakdown(actorId: string, projectId: string) {
    await this.assertProjectAccess(actorId, projectId, "read")
    return { items: await this.repository.listBreakdown(projectId) }
  }

  async listBreakdownRelationOptions(actorId: string, projectId: string) {
    await this.assertProjectAccess(actorId, projectId, "read")
    return this.repository.listBreakdownRelationOptions(projectId)
  }

  async updateBreakdown(command: UpdateBreakdownCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "production.write",
      "write",
    )
    const textValues = [
      command.item,
      command.requirementType,
      command.specification,
      command.quantity,
      command.preparation,
      command.department,
    ].filter((value): value is string => value !== undefined)
    if (
      !textValues.length &&
      command.state === undefined &&
      command.supplierIds === undefined &&
      command.responsibleAccountId === undefined &&
      command.taskIds === undefined &&
      command.contactRefs === undefined &&
      command.shootingDayIds === undefined &&
      command.callSheetIds === undefined
    ) {
      throw new AppError("BREAKDOWN_UPDATE_EMPTY", "至少修改一个拆解字段", 400)
    }
    if (textValues.some((value) => !value.trim())) {
      throw new AppError("BREAKDOWN_FIELD_EMPTY", "拆解字段不能为空", 400)
    }
    if (command.state === "已确认") {
      throw new AppError(
        "BREAKDOWN_CONFIRMATION_REQUIRED",
        "请使用批量确认流程确认候选拆解项",
        409,
      )
    }
    const normalized = {
      ...command,
      ...(command.item === undefined ? {} : { item: command.item.trim() }),
      ...(command.requirementType === undefined
        ? {}
        : { requirementType: command.requirementType.trim() }),
      ...(command.specification === undefined
        ? {}
        : { specification: command.specification.trim() }),
      ...(command.quantity === undefined ? {} : { quantity: command.quantity.trim() }),
      ...(command.preparation === undefined
        ? {}
        : { preparation: command.preparation.trim() }),
      ...(command.department === undefined
        ? {}
        : { department: command.department.trim() }),
    }
    const result = await this.repository.updateBreakdown(normalized)
    if (result.kind === "invalid_state") {
      if (command.supplierIds === undefined) {
        throw new AppError(
          "BREAKDOWN_RELATION_REQUIRES_CONFIRMED",
          "请先确认拆解项，再关联联系人、负责人、任务、拍摄日或通告单",
          409,
        )
      }
      throw new AppError(
        "BREAKDOWN_SUPPLIER_REQUIRES_CONFIRMED",
        "请先确认拆解项，再关联供应商",
        409,
      )
    }
    if (result.kind === "invalid_supplier") {
      throw new AppError(
        "BREAKDOWN_SUPPLIER_UNAVAILABLE",
        "所选供应商未关联当前项目或已被删除",
        400,
      )
    }
    if (result.kind === "invalid_responsible") {
      throw new AppError(
        "BREAKDOWN_RESPONSIBLE_UNAVAILABLE",
        "所选负责人不是当前项目成员",
        400,
      )
    }
    if (result.kind === "invalid_task") {
      throw new AppError(
        "BREAKDOWN_TASK_UNAVAILABLE",
        "所选任务不属于当前项目或已被删除",
        400,
      )
    }
    if (result.kind === "invalid_contact") {
      throw new AppError(
        "BREAKDOWN_CONTACT_UNAVAILABLE",
        "所选联系人不可用于当前项目、未共享或已撤销",
        400,
      )
    }
    if (result.kind === "invalid_call_sheet") {
      throw new AppError(
        "BREAKDOWN_CALL_SHEET_UNAVAILABLE",
        "所选通告单不属于当前项目",
        400,
      )
    }
    if (result.kind === "invalid_shooting_day") {
      throw new AppError(
        "BREAKDOWN_SHOOTING_DAY_UNAVAILABLE",
        "所选拍摄日不属于当前项目",
        400,
      )
    }
    return this.unwrap(result, "拆解项")
  }

  async confirmBreakdown(command: ConfirmBreakdownCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    if (new Set(command.items.map((item) => item.itemId)).size !== command.items.length) {
      throw new AppError("BREAKDOWN_SELECTION_INVALID", "不能重复选择同一拆解项", 400)
    }
    const result = await this.repository.confirmBreakdown({
      ...command,
      category: command.category.trim(),
      items: [...command.items].sort((left, right) =>
        left.itemId.localeCompare(right.itemId),
      ),
    })
    if (!("kind" in result)) return result
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "所选拆解项不存在", 404)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "所选拆解项已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    throw new AppError(
      "BREAKDOWN_SELECTION_INVALID",
      "只能确认当前分类中仍待确认的拆解项",
      409,
    )
  }

  async mergeBreakdown(command: MergeBreakdownCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    if (new Set(command.items.map((item) => item.itemId)).size !== command.items.length) {
      throw new AppError("BREAKDOWN_SELECTION_INVALID", "不能重复选择同一拆解项", 400)
    }
    if (!command.items.some((item) => item.itemId === command.primaryItemId)) {
      throw new AppError("BREAKDOWN_SELECTION_INVALID", "来源基准必须来自所选拆解项", 400)
    }
    return this.unwrapBreakdownRewrite(
      await this.repository.mergeBreakdown({
        ...command,
        category: command.category.trim(),
        items: [...command.items].sort((left, right) =>
          left.itemId.localeCompare(right.itemId),
        ),
        result: this.normalizeBreakdownDraft(command.result),
      }),
      "合并",
    )
  }

  async splitBreakdown(command: SplitBreakdownCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    return this.unwrapBreakdownRewrite(
      await this.repository.splitBreakdown({
        ...command,
        items: command.items.map((item) => this.normalizeBreakdownDraft(item)),
      }),
      "拆分",
    )
  }

  async listShootingDays(actorId: string, projectId: string) {
    await this.assertProjectAccess(actorId, projectId, "read")
    return { items: await this.repository.listShootingDays(projectId) }
  }

  async createShootingDay(command: CreateShootingDayCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    const result = await this.repository.createShootingDay(
      this.normalizeShootingDay(command),
    )
    if ("kind" in result) {
      throw new AppError(
        "SHOOTING_DAY_DUPLICATE",
        "同一项目不能重复使用拍摄日期或拍摄日序号",
        409,
      )
    }
    return result
  }

  async updateShootingDay(command: UpdateShootingDayCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    if (
      command.shootDate === undefined &&
      command.dayNumber === undefined &&
      command.title === undefined &&
      command.status === undefined &&
      command.originalTimezone === undefined
    ) {
      throw new AppError("SHOOTING_DAY_UPDATE_EMPTY", "至少修改一个拍摄日字段", 400)
    }
    const result = await this.repository.updateShootingDay(
      this.normalizeShootingDay(command),
    )
    if ("kind" in result && result.kind === "duplicate") {
      throw new AppError(
        "SHOOTING_DAY_DUPLICATE",
        "同一项目不能重复使用拍摄日期或拍摄日序号",
        409,
      )
    }
    return this.unwrap(result, "拍摄日")
  }

  async listCallSheets(actorId: string, projectId: string) {
    await this.assertProjectAccess(actorId, projectId, "read")
    return { items: await this.repository.listCallSheets(projectId) }
  }

  async listCallSheetHistory(actorId: string, projectId: string, itemId: string) {
    await this.assertProjectAccess(actorId, projectId, "read")
    const history = await this.repository.listCallSheetHistory(projectId, itemId, actorId)
    if (!history) throw new AppError("RESOURCE_NOT_FOUND", "通告表不存在", 404)
    return history
  }

  async listExecutionSchedule(actorId: string, projectId: string) {
    await this.assertProjectAccess(actorId, projectId, "read")
    return this.repository.listExecutionSchedule(actorId, projectId)
  }

  async createExecutionStage(command: CreateExecutionStageCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    return this.repository.createExecutionStage(this.normalizeExecutionStage(command))
  }

  async updateExecutionStage(command: UpdateExecutionStageCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    const current = await this.repository.listExecutionSchedule(
      command.actorId,
      command.projectId,
    )
    const item = current.items.find((entry) => entry.id === command.itemId)
    if (!item) throw new AppError("RESOURCE_NOT_FOUND", "执行计划不存在", 404)
    const normalized = this.normalizeExecutionStage({
      ...item,
      ...command,
      name: command.name ?? item.name,
      startsAt: command.startsAt ?? item.startsAt,
      endsAt: command.endsAt ?? item.endsAt,
      originalTimezone: command.originalTimezone ?? item.originalTimezone,
      progress: command.progress ?? item.progress,
      owner: command.owner ?? item.owner,
      state: command.state ?? item.state,
      note: command.note ?? item.note,
      resources: command.resources ?? item.resources,
      idempotencyKey: "update-not-used",
    })
    return this.unwrap(
      await this.repository.updateExecutionStage({
        ...command,
        ...normalized,
        expectedRevision: command.expectedRevision,
      }),
      "执行计划",
    )
  }

  async createCallSheet(command: CreateCallSheetCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    if (!command.shootingDayId && (!command.date?.trim() || !command.title?.trim())) {
      throw new AppError(
        "CALL_SHEET_SOURCE_REQUIRED",
        "请选择拍摄日，或提供通告日期和标题",
        400,
      )
    }
    const normalized = {
      ...command,
      ...(command.date === undefined ? {} : { date: command.date.trim() }),
      ...(command.title === undefined ? {} : { title: command.title.trim() }),
    }
    const shootingDayId = command.shootingDayId
    const breakdown = shootingDayId
      ? (await this.repository.listBreakdown(command.projectId)).filter(
          (item) =>
            (item.state === "已确认" || item.state === "已完成") &&
            item.shootingDayIds.includes(shootingDayId),
        )
      : []
    return this.repository.createCallSheet(
      normalized,
      this.buildCallSheetDraft(breakdown),
    )
  }

  async updateCallSheet(command: UpdateCallSheetCommand) {
    await this.assertProjectAccess(command.actorId, command.projectId, "write")
    if (
      [
        command.date,
        command.day,
        command.title,
        command.status,
        command.crewCall,
        command.firstShot,
        command.wrap,
        command.weather,
        command.sunrise,
        command.sunset,
        command.basecamp,
        command.location,
        command.hospital,
        command.scenes,
        command.cast,
        command.departments,
        command.equipment,
        command.safety,
        command.transport,
        command.catering,
        command.keyContacts,
        command.nextDayPreview,
      ].every((value) => value === undefined)
    ) {
      throw new AppError("CALL_SHEET_UPDATE_EMPTY", "请至少提供一项要更新的通告内容", 400)
    }
    return this.unwrap(await this.repository.updateCallSheet(command), "通告表")
  }

  async publishCallSheet(command: PublishCallSheetCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "call_sheet.publish",
      "write",
    )
    const result = await this.repository.publishCallSheet(command)
    if (!("kind" in result)) return result
    if (result.kind === "already_published") {
      throw new AppError("CALL_SHEET_ALREADY_PUBLISHED", "当前通告表已经发布", 409)
    }
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "通告表不存在", 404)
    }
    throw new AppError(
      "RESOURCE_CONFLICT",
      "通告表已在其他位置更新，请重新载入后再试",
      409,
    )
  }

  async listReviewFiles(actorId: string, projectId: string, archived = false) {
    await this.assertProjectAccess(actorId, projectId, "read")
    const [items, folders] = await Promise.all([
      this.repository.listReviewFiles(projectId, archived),
      this.repository.listReviewFolders(projectId),
    ])
    return { items, folders }
  }

  async createReviewFolder(command: CreateReviewFolderCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.manage",
      "write",
    )
    const name = command.name.trim()
    if (!name) {
      throw new AppError("REVIEW_FOLDER_NAME_REQUIRED", "文件夹名称不能为空", 400)
    }
    const result = await this.repository.createReviewFolder({ ...command, name })
    if (!("kind" in result)) return result
    throw new AppError("REVIEW_FOLDER_EXISTS", "已存在同名文件夹", 409)
  }

  async listReviewFolders(actorId: string, projectId: string, archived = false) {
    await this.assertProjectAccess(actorId, projectId, "read")
    return { items: await this.repository.listReviewFolders(projectId, archived) }
  }

  async updateReviewFolder(command: UpdateReviewFolderCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.manage",
      "write",
    )
    const result = await this.repository.updateReviewFolder(command)
    if (result.kind === "not_found" && command.archived === false) {
      throw new AppError("REVIEW_FOLDER_NOT_ARCHIVED", "文件夹已恢复或不存在", 404)
    }
    return this.unwrap(result, "审片文件夹")
  }

  async moveReviewFile(command: MoveReviewFileCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.manage",
      "write",
    )
    const result = await this.repository.moveReviewFile(command)
    if (!("kind" in result)) return result
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "审片文件不存在", 404)
    }
    if (result.kind === "invalid_folder") {
      throw new AppError("REVIEW_FOLDER_NOT_FOUND", "目标文件夹不存在", 404)
    }
    throw new AppError(
      "RESOURCE_CONFLICT",
      "审片文件已在其他位置更新，请重新载入后再试",
      409,
    )
  }

  async updateReviewFileArchive(command: UpdateReviewFileArchiveCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.manage",
      "write",
    )
    const result = await this.repository.updateReviewFileArchive(command)
    if (!("kind" in result)) return result
    if (result.kind === "not_found") {
      throw new AppError(
        command.archived ? "RESOURCE_NOT_FOUND" : "REVIEW_FILE_NOT_ARCHIVED",
        command.archived ? "审片版本不存在" : "审片版本已恢复或不存在",
        404,
      )
    }
    throw new AppError(
      "RESOURCE_CONFLICT",
      "审片版本已在其他位置更新，请重新载入后再试",
      409,
    )
  }

  async permanentlyDeleteReviewFile(command: PermanentlyDeleteReviewFileCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.manage",
      "write",
    )
    const result = await this.repository.permanentlyDeleteReviewFile(command)
    if (result.kind === "ok") return result.item
    if (result.kind === "in_use") {
      throw new AppError(
        "REVIEW_FILE_IN_USE",
        "该审片版本仍被作品集使用，请先从作品集中移除",
        409,
      )
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        "审片版本已在其他位置更新，请重新载入后再试",
        409,
      )
    }
    throw new AppError("RESOURCE_NOT_FOUND", "审片版本未归档或不存在", 404)
  }

  async createReviewFile(command: CreateReviewFileCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.write",
      "write",
    )
    const result = await this.repository.createReviewFile(command)
    if (!("kind" in result)) return result
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "所选视频素材不存在", 404)
    }
    if (result.kind === "invalid_source") {
      throw new AppError(
        "REVIEW_SOURCE_INVALID",
        "只能使用当前项目中已入库的视频素材创建审片版本",
        409,
      )
    }
    if (result.kind === "invalid_folder") {
      throw new AppError("REVIEW_FOLDER_NOT_FOUND", "目标文件夹不存在", 404)
    }
    throw new AppError(
      "REVIEW_FILE_ALREADY_EXISTS",
      "所选视频素材已经创建过审片版本",
      409,
    )
  }

  async approveReviewFile(
    command: Omit<ReviewFileApprovalCommand, "action">,
  ): Promise<CreateResult<ReviewFile>> {
    return this.updateReviewFileApproval({ ...command, action: "approve" })
  }

  async revokeReviewFileApproval(
    command: Omit<ReviewFileApprovalCommand, "action">,
  ): Promise<CreateResult<ReviewFile>> {
    return this.updateReviewFileApproval({ ...command, action: "revoke" })
  }

  async listReviewComments(actorId: string, projectId: string, fileId: string) {
    await this.assertProjectAccess(actorId, projectId, "read")
    const items = await this.repository.listReviewComments(projectId, fileId)
    if (!items) throw new AppError("RESOURCE_NOT_FOUND", "审片文件不存在", 404)
    return { items }
  }

  async createReviewComment(command: CreateReviewCommentCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.write",
      "write",
    )
    const result = await this.repository.createReviewComment(command)
    if (!result) throw new AppError("RESOURCE_NOT_FOUND", "审片文件不存在", 404)
    return result
  }

  async updateReviewComment(command: UpdateReviewCommentCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.write",
      "write",
    )
    return this.unwrap(await this.repository.updateReviewComment(command), "审片意见")
  }

  async listReviewCommentCorrespondence(
    actorId: string,
    projectId: string,
    primaryFileId: string,
    compareFileId: string,
  ) {
    await this.assertProjectAccess(actorId, projectId, "read")
    if (primaryFileId === compareFileId) {
      throw new AppError("REVIEW_FILES_MUST_DIFFER", "请选择两个不同的审片版本", 400)
    }
    const [files, primaryComments, compareComments, links] = await Promise.all([
      this.repository.listReviewFiles(projectId),
      this.repository.listReviewComments(projectId, primaryFileId),
      this.repository.listReviewComments(projectId, compareFileId),
      this.repository.listReviewCommentLinks(projectId, primaryFileId, compareFileId),
    ])
    const primaryFile = files.find((file) => file.id === primaryFileId)
    const compareFile = files.find((file) => file.id === compareFileId)
    if (!primaryFile || !compareFile || !primaryComments || !compareComments) {
      throw new AppError("RESOURCE_NOT_FOUND", "审片文件不存在", 404)
    }
    if (primaryFile.version === compareFile.version) {
      throw new AppError("REVIEW_FILES_MUST_DIFFER", "请选择两个不同的审片版本", 400)
    }
    const primaryRoots = primaryComments.filter(
      (comment) => comment.parentCommentId === null,
    )
    const compareRoots = compareComments.filter(
      (comment) => comment.parentCommentId === null,
    )
    const rootIds = new Set(
      [...primaryRoots, ...compareRoots].map((comment) => comment.id),
    )
    const rootLinks = links.filter(
      (link) => rootIds.has(link.commentId) && rootIds.has(link.counterpartCommentId),
    )
    return {
      primaryFileId,
      compareFileId,
      links: rootLinks,
      suggestions: this.suggestReviewCommentLinks(primaryRoots, compareRoots, rootLinks),
    }
  }

  async createReviewCommentLink(command: CreateReviewCommentLinkCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.write",
      "write",
    )
    if (command.commentId === command.counterpartCommentId) {
      throw new AppError(
        "REVIEW_COMMENT_LINK_INVALID",
        "不能把审片意见与自身建立对应",
        400,
      )
    }
    const result = await this.repository.createReviewCommentLink(command)
    if (!("kind" in result)) return result
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "审片意见不存在", 404)
    }
    throw new AppError(
      "REVIEW_COMMENT_LINK_INVALID",
      "只能对应同一项目中不同版本的审片意见",
      409,
    )
  }

  async unlinkReviewCommentLink(command: UnlinkReviewCommentLinkCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.write",
      "write",
    )
    return this.unwrap(
      await this.repository.unlinkReviewCommentLink(command),
      "审片意见对应关系",
    )
  }

  private async updateReviewFileApproval(
    command: ReviewFileApprovalCommand,
  ): Promise<CreateResult<ReviewFile>> {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "review.manage",
      "write",
    )
    const result = await this.repository.updateReviewFileApproval(command)
    if (!("kind" in result)) return result
    if (result.kind === "invalid_transition") {
      throw new AppError(
        "REVIEW_FILE_APPROVAL_INVALID",
        command.action === "approve"
          ? "当前审片文件不能批准，请确认它是可审阅的视频版本"
          : "当前审片文件尚未批准，无法撤销批准",
        409,
      )
    }
    return {
      item: this.unwrap(result, "审片文件"),
      replayed: false,
    }
  }

  private async assertProjectAccess(
    actorId: string,
    projectId: string,
    capabilityOrOperation: PermissionCapability | "read" | "write",
    legacyOperation?: "read" | "write",
  ) {
    const access = await this.repository.getProjectAccess(actorId, projectId)
    const operation = legacyOperation ?? capabilityOrOperation
    const capability =
      capabilityOrOperation === "read"
        ? "project.read"
        : capabilityOrOperation === "write"
          ? "production.write"
          : capabilityOrOperation
    const allowed = accessAllows(access, capability, operation as "read" | "write")
    if (!access || !allowed) {
      throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
    }
  }

  private normalizeBreakdownDraft(draft: BreakdownDraft): BreakdownDraft {
    const normalized = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, value.trim()]),
    ) as BreakdownDraft
    if (Object.values(normalized).some((value) => !value)) {
      throw new AppError("BREAKDOWN_FIELD_EMPTY", "拆解字段不能为空", 400)
    }
    return normalized
  }

  private buildCallSheetDraft(items: BreakdownItem[]): GeneratedCallSheetDraft {
    const category = (item: BreakdownItem) => item.category.trim().toLocaleLowerCase()
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))]
    const locations = unique(
      items
        .filter((item) => category(item) === "location")
        .map((item) => item.item.trim()),
    )
    const location = locations.join(" / ").slice(0, 300) || "待安排"
    const sceneLocations = unique(
      items
        .map((item) => item.sourceLocation.trim())
        .filter((value) => /^场\s*\S+/.test(value)),
    )
    const departmentItems = items.filter(
      (item) => !["cast", "location", "equipment", "special"].includes(category(item)),
    )
    const departmentNames = unique(departmentItems.map((item) => item.department.trim()))
    const cast = new Map<string, BreakdownItem>()
    for (const item of items) {
      if (category(item) === "cast" && !cast.has(item.item.trim())) {
        cast.set(item.item.trim(), item)
      }
    }
    const responsible = new Map<string, BreakdownItem>()
    for (const item of items) {
      if (item.responsibleName?.trim() && !responsible.has(item.responsibleName.trim())) {
        responsible.set(item.responsibleName.trim(), item)
      }
    }

    return {
      breakdownItemIds: items.map((item) => item.id),
      location,
      scenes: sceneLocations.slice(0, 100).map((sourceLocation) => {
        const sceneItems = items.filter(
          (item) => item.sourceLocation.trim() === sourceLocation,
        )
        return {
          scene: sourceLocation.replace(/^场\s*/, ""),
          set: location,
          pages: "待定",
          description:
            sceneItems.find((item) => item.excerpt.trim())?.excerpt.trim() ?? "待补充",
          cast:
            unique(
              sceneItems
                .filter((item) => category(item) === "cast")
                .map((item) => item.item.trim()),
            ).join("、") || "待定",
        }
      }),
      cast: [...cast.values()].slice(0, 100).map((item) => ({
        name: item.item.trim(),
        role: item.requirementType.trim(),
        pickup: "待定",
        makeup: "待定",
        set: "待定",
      })),
      departments: departmentNames.slice(0, 40).map((name) => ({
        name: name.slice(0, 120),
        call: "待定",
        note: departmentItems
          .filter((item) => item.department.trim() === name)
          .map((item) => `${item.item.trim()}：${item.preparation.trim()}`)
          .join("；")
          .slice(0, 500),
      })),
      equipment: items
        .filter((item) => category(item) === "equipment")
        .slice(0, 100)
        .map((item) => ({
          name: item.item.trim().slice(0, 160),
          quantity: item.quantity.trim().slice(0, 80),
          source: (item.department.trim() || item.sourceDocument.trim()).slice(0, 160),
          note: item.preparation.trim().slice(0, 500),
        })),
      safety: items
        .filter(
          (item) =>
            category(item) === "special" ||
            item.requirementType.includes("安全") ||
            item.department.includes("安全"),
        )
        .slice(0, 50)
        .map((item) => ({
          level: "待评估",
          item: item.item.trim().slice(0, 300),
          owner: (item.responsibleName?.trim() || item.department.trim()).slice(0, 120),
          action: item.preparation.trim().slice(0, 500),
        })),
      keyContacts: [...responsible.entries()].slice(0, 50).map(([name, item]) => ({
        name: name.slice(0, 120),
        role: item.department.trim().slice(0, 120),
        phone: "",
        note: item.item.trim().slice(0, 500),
      })),
    }
  }

  private normalizeExecutionStage<T extends CreateExecutionStageBody>(command: T): T {
    const startsAt = new Date(command.startsAt)
    const endsAt = new Date(command.endsAt)
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      startsAt >= endsAt
    ) {
      throw new AppError(
        "SCHEDULE_RANGE_INVALID",
        "执行计划的结束时间必须晚于开始时间",
        400,
      )
    }
    try {
      new Intl.DateTimeFormat("en", { timeZone: command.originalTimezone }).format(
        startsAt,
      )
    } catch {
      throw new AppError("SCHEDULE_TIMEZONE_INVALID", "请选择有效的 IANA 时区", 400)
    }
    const resources = command.resources.map((resource) => ({
      id: resource.id.trim().toLocaleLowerCase(),
      type: resource.type,
      name: resource.name.trim(),
    }))
    if (resources.some((resource) => !resource.id || !resource.name)) {
      throw new AppError("SCHEDULE_RESOURCE_INVALID", "资源名称不能为空", 400)
    }
    const keys = resources.map((resource) => `${resource.type}:${resource.id}`)
    if (new Set(keys).size !== keys.length) {
      throw new AppError("SCHEDULE_RESOURCE_DUPLICATE", "同一资源不能重复添加", 400)
    }
    return {
      ...command,
      name: command.name.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      originalTimezone: command.originalTimezone.trim(),
      owner: command.owner.trim(),
      note: command.note.trim(),
      resources,
    }
  }

  private normalizeShootingDay<
    T extends {
      shootDate?: string
      title?: string
      originalTimezone?: string
    },
  >(command: T): T {
    if (command.shootDate !== undefined) {
      const date = new Date(`${command.shootDate}T00:00:00.000Z`)
      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== command.shootDate
      ) {
        throw new AppError("SHOOTING_DAY_DATE_INVALID", "请选择有效的拍摄日期", 400)
      }
    }
    if (command.originalTimezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en", {
          timeZone: command.originalTimezone,
        }).format(new Date())
      } catch {
        throw new AppError("SHOOTING_DAY_TIMEZONE_INVALID", "请选择有效的 IANA 时区", 400)
      }
    }
    if (command.title !== undefined && !command.title.trim()) {
      throw new AppError("SHOOTING_DAY_TITLE_EMPTY", "拍摄日标题不能为空", 400)
    }
    return {
      ...command,
      ...(command.title === undefined ? {} : { title: command.title.trim() }),
      ...(command.originalTimezone === undefined
        ? {}
        : { originalTimezone: command.originalTimezone.trim() }),
    }
  }

  private suggestReviewCommentLinks(
    primaryComments: ReviewComment[],
    compareComments: ReviewComment[],
    links: ReviewCommentLink[],
  ): ReviewCommentSuggestion[] {
    const confirmed = new Set(
      links.map((link) => [link.commentId, link.counterpartCommentId].sort().join(":")),
    )
    const candidates = primaryComments.flatMap((comment) =>
      compareComments.flatMap((counterpart) => {
        const key = [comment.id, counterpart.id].sort().join(":")
        if (confirmed.has(key)) return []
        const timeDifferenceSeconds = Math.abs(
          this.timecodeSeconds(comment.timecode) -
            this.timecodeSeconds(counterpart.timecode),
        )
        const textScore = this.textSimilarity(comment.text, counterpart.text)
        if (timeDifferenceSeconds > 5 || textScore === 0) return []
        const timeScore = Math.max(0, 1 - timeDifferenceSeconds / 5)
        const score = 0.6 * timeScore + 0.4 * textScore
        return score < 0.45
          ? []
          : [
              {
                commentId: comment.id,
                counterpartCommentId: counterpart.id,
                score: Number(score.toFixed(3)),
                timeDifferenceSeconds: Number(timeDifferenceSeconds.toFixed(3)),
              },
            ]
      }),
    )
    candidates.sort(
      (left, right) =>
        right.score - left.score ||
        left.timeDifferenceSeconds - right.timeDifferenceSeconds ||
        left.commentId.localeCompare(right.commentId) ||
        left.counterpartCommentId.localeCompare(right.counterpartCommentId),
    )
    const used = new Set<string>()
    return candidates.filter((candidate) => {
      if (used.has(candidate.commentId) || used.has(candidate.counterpartCommentId)) {
        return false
      }
      used.add(candidate.commentId)
      used.add(candidate.counterpartCommentId)
      return true
    })
  }

  private timecodeSeconds(value: string) {
    const parts = value.split(":").map(Number)
    if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0
    return parts.reduce((total, part) => total * 60 + part, 0)
  }

  private textSimilarity(left: string, right: string) {
    const normalize = (value: string) =>
      value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "")
    const a = normalize(left)
    const b = normalize(right)
    if (!a || !b) return 0
    if (a === b) return 1
    const grams = (value: string) =>
      new Set(
        Array.from({ length: Math.max(0, value.length - 1) }, (_, index) =>
          value.slice(index, index + 2),
        ),
      )
    const aGrams = grams(a)
    const bGrams = grams(b)
    if (!aGrams.size || !bGrams.size) return 0
    const overlap = [...aGrams].filter((gram) => bGrams.has(gram)).length
    return overlap / new Set([...aGrams, ...bGrams]).size
  }

  private unwrapBreakdownRewrite(result: RewriteBreakdownResult, action: string) {
    if (!("kind" in result)) return result
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", "所选拆解项不存在", 404)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        `所选拆解项已在其他位置更新，请重新载入后再${action}`,
        409,
      )
    }
    throw new AppError(
      "BREAKDOWN_SELECTION_INVALID",
      `只能${action}同一分类中仍待确认的拆解项`,
      409,
    )
  }

  private unwrap<T>(result: UpdateResult<T>, label: string) {
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", `${label}不存在`, 404)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        `${label}已在其他位置更新，请重新载入后再试`,
        409,
      )
    }
    return result.item
  }
}
