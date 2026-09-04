import { createHash, randomUUID } from "node:crypto"

import type {
  AgentAction,
  AgentCommandResult,
  AgentConfirmationResponse,
  AgentExecutionResponse,
  AgentPreviewBody,
  AgentPreviewResponse,
  AgentRisk,
  AuditLogQuery,
  BreakdownState,
  ContactField,
  ContactRef,
  PersonalContact,
} from "@shadowproducer/contracts"

import type { AnalysisService } from "./analysis-service"
import type { AssetService } from "./asset-service"
import type { ContactService } from "./contact-service"
import type { PortfolioService } from "./portfolio-service"
import type { ProductionService } from "./production-service"
import type { ReviewLinkService } from "./review-link-service"
import { AppError, type ScriptService } from "./script-service"
import type { WorkspaceService } from "./workspace-service"

export type AgentStoredCommand =
  | { action: "list_audit_logs"; teamId: string; query: AuditLogQuery }
  | {
      action: "list_team_resources"
      teamId: string
      projectId?: string
      keyword?: string
    }
  | Extract<AgentPreviewBody, { action: "semantic_search_assets" }>
  | { action: "list_personal_contacts"; teamId: string }
  | Extract<AgentPreviewBody, { action: "create_personal_contact" }>
  | {
      action: "update_personal_contact"
      teamId: string
      itemId: string
      name?: string
      role?: string
      company?: string
      phone?: string
      email?: string
      expectedRevision: number
    }
  | {
      action: "share_personal_contact"
      teamId: string
      itemId: string
      fields: ContactField[]
      allowProjectLink: boolean
      expectedRevision: number
    }
  | {
      action: "unshare_personal_contact"
      teamId: string
      itemId: string
      expectedRevision: number
    }
  | {
      action: "delete_personal_contact"
      teamId: string
      itemId: string
      expectedRevision: number
    }
  | {
      action: "restore_personal_contact"
      teamId: string
      itemId: string
      expectedRevision: number
    }
  | Extract<AgentPreviewBody, { action: "create_team_contact" }>
  | Extract<AgentPreviewBody, { action: "create_team_supplier" }>
  | { action: "list_tasks"; teamId: string; projectId?: string }
  | Extract<AgentPreviewBody, { action: "list_execution_schedule" }>
  | { action: "create_task"; teamId: string; projectId?: string; title: string }
  | {
      action: "update_task"
      teamId: string
      projectId?: string
      itemId: string
      title?: string
      dueDate?: string | null
      status?: "待开始" | "进行中" | "等待他人" | "已完成"
      target?: string
      expectedRevision: number
    }
  | {
      action: "create_note"
      teamId: string
      projectId?: string
      title: string
      body?: string
    }
  | {
      action: "update_note"
      teamId: string
      projectId?: string
      itemId: string
      title?: string
      body?: string
      pinned?: boolean
      expectedRevision: number
    }
  | {
      action: "create_calendar_event"
      teamId: string
      projectId?: string
      title: string
      startsAt: string
      endsAt?: string | null
      timezone: string
      allDay?: boolean
      visibility?: "private" | "team" | "project"
    }
  | {
      action: "update_calendar_event"
      teamId: string
      projectId?: string
      itemId: string
      startsAt: string
      endsAt?: string | null
      timezone: string
      allDay?: boolean
      expectedRevision: number
    }
  | {
      action: "create_execution_stage"
      teamId: string
      projectId: string
      name: string
      startsAt: string
      endsAt: string
      originalTimezone: string
      progress: number
      owner: string
      state: "未开始" | "进行中" | "已完成" | "已暂停"
      note: string
      resources: Array<{
        id: string
        type: "cast" | "crew" | "location" | "equipment"
        name: string
      }>
    }
  | {
      action: "update_execution_stage"
      teamId: string
      projectId: string
      itemId: string
      name?: string
      startsAt?: string
      endsAt?: string
      originalTimezone?: string
      progress?: number
      owner?: string
      state?: "未开始" | "进行中" | "已完成" | "已暂停"
      note?: string
      resources?: Array<{
        id: string
        type: "cast" | "crew" | "location" | "equipment"
        name: string
      }>
      expectedRevision: number
    }
  | {
      action: "update_breakdown"
      teamId: string
      projectId: string
      itemId: string
      item?: string
      requirementType?: string
      specification?: string
      quantity?: string
      preparation?: string
      department?: string
      state?: BreakdownState
      supplierIds?: string[]
      responsibleAccountId?: string | null
      taskIds?: string[]
      contactRefs?: ContactRef[]
      shootingDayIds?: string[]
      callSheetIds?: string[]
      expectedRevision: number
    }
  | {
      action: "confirm_breakdown"
      teamId: string
      projectId: string
      category: string
      items: Array<{ itemId: string; expectedRevision: number }>
    }
  | {
      action: "publish_portfolio"
      teamId: string
      portfolioId: string
      expectedRevision: number
    }
  | {
      action: "create_shooting_day"
      teamId: string
      projectId: string
      shootDate: string
      dayNumber: number
      title: string
      originalTimezone: string
    }
  | {
      action: "update_shooting_day"
      teamId: string
      projectId: string
      itemId: string
      shootDate?: string
      dayNumber?: number
      title?: string
      status?: "草稿" | "已确认" | "拍摄中" | "已完成" | "已取消"
      originalTimezone?: string
      expectedRevision: number
    }
  | {
      action: "create_call_sheet"
      teamId: string
      projectId: string
      date: string
      title: string
    }
  | (Extract<AgentPreviewBody, { action: "update_call_sheet" }> & {
      itemId: string
      expectedRevision: number
    })
  | {
      action: "publish_call_sheet"
      teamId: string
      projectId: string
      itemId: string
      expectedRevision: number
    }
  | {
      action: "create_script_version"
      teamId: string
      projectId: string
      documentId: string
      content: string
      meta: string
      expectedVersionId: string
      expectedRevision: number
    }
  | {
      action: "update_script_version"
      teamId: string
      projectId: string
      documentId: string
      versionId: string
      content: string
      expectedRevision: number
    }
  | {
      action: "create_script_breakdown_analysis"
      teamId: string
      projectId: string
      documentId: string
      versionId: string
      sourceRevision: number
    }
  | {
      action: "create_media_analysis"
      teamId: string
      projectId?: string
      assetId: string
      expectedRevision: number
    }
  | {
      action: "list_review_feedback"
      teamId: string
      projectId: string
      primaryFileId?: string
      compareFileId?: string
    }
  | {
      action: "create_review_file"
      teamId: string
      projectId: string
      assetId: string
      name: string
      version: string
      duration?: string
    }
  | {
      action: "create_review_comment"
      teamId: string
      projectId: string
      fileId: string
      version: string
      timecode: string
      text: string
    }
  | {
      action: "update_review_comment"
      teamId: string
      projectId: string
      commentId: string
      state: "open" | "resolved"
      expectedRevision: number
    }
  | {
      action: "create_review_link"
      teamId: string
      projectId: string
      fileId: string
      expiresAt: string
    }
  | {
      action: "approve_review_file"
      teamId: string
      projectId: string
      fileId: string
      expectedRevision: number
    }
  | {
      action: "create_portfolio"
      teamId: string
      title: string
      category: string
      year: string
      description: string
    }
  | {
      action: "add_portfolio_content"
      teamId: string
      portfolioId: string
      assetId: string
      reviewFileId: string
      caption: string
      featured: boolean
      expectedRevision: number
    }

export type AgentCommandIntent = {
  id: string
  actorId: string
  action: AgentAction
  risk: AgentRisk
  teamId: string
  projectId: string | null
  command: AgentStoredCommand
  requestHash: string
  summary: string
  status: "pending" | "confirmed" | "consumed"
  expiresAt: Date
  confirmedAt: Date | null
  consumedAt: Date | null
  result: AgentCommandResult | null
  createdAt: Date
}

export interface AgentCommandRepository {
  create(intent: AgentCommandIntent): Promise<void>
  get(actorId: string, commandId: string): Promise<AgentCommandIntent | null>
  confirm(actorId: string, commandId: string): Promise<AgentCommandIntent | null>
  withExecutionLock<T>(
    actorId: string,
    commandId: string,
    callback: () => Promise<T>,
  ): Promise<T>
  consume(
    actorId: string,
    commandId: string,
    result: AgentCommandResult,
  ): Promise<AgentCommandIntent | null>
}

export class AgentCommandService {
  constructor(
    private readonly repository: AgentCommandRepository,
    private readonly workspaceService: Pick<
      WorkspaceService,
      | "getContext"
      | "listAuditLogs"
      | "listTasks"
      | "createTask"
      | "updateTask"
      | "listNotes"
      | "createNote"
      | "updateNote"
      | "listCalendarEvents"
      | "createCalendarEvent"
      | "updateCalendarEvent"
    >,
    private readonly portfolioService: Pick<
      PortfolioService,
      | "listPortfolios"
      | "listApprovedCandidates"
      | "createPortfolio"
      | "addContent"
      | "publishPortfolio"
    >,
    private readonly productionService: Pick<
      ProductionService,
      | "listCallSheets"
      | "listShootingDays"
      | "createShootingDay"
      | "updateShootingDay"
      | "createCallSheet"
      | "updateCallSheet"
      | "publishCallSheet"
      | "listReviewFiles"
      | "listReviewCommentCorrespondence"
      | "createReviewFile"
      | "listReviewComments"
      | "createReviewComment"
      | "updateReviewComment"
      | "approveReviewFile"
      | "listExecutionSchedule"
      | "createExecutionStage"
      | "updateExecutionStage"
      | "listBreakdown"
      | "updateBreakdown"
      | "confirmBreakdown"
    >,
    private readonly reviewLinkService: Pick<ReviewLinkService, "createLink">,
    private readonly scriptService: Pick<
      ScriptService,
      "listDocuments" | "getWorkspace" | "createVersion" | "updateVersion"
    >,
    private readonly analysisService: Pick<AnalysisService, "createScriptBreakdown">,
    private readonly assetService: Pick<
      AssetService,
      "listAssets" | "createMediaAnalysis" | "semanticSearchText"
    >,
    private readonly contactService: Pick<
      ContactService,
      | "listPersonalContacts"
      | "listDeletedPersonalContacts"
      | "createPersonalContact"
      | "updatePersonalContact"
      | "setContactShare"
      | "deleteContactShare"
      | "deletePersonalContact"
      | "restorePersonalContact"
      | "listTeamContacts"
      | "createTeamContact"
      | "listTeamSuppliers"
      | "createTeamSupplier"
    >,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async preview(actorId: string, body: AgentPreviewBody): Promise<AgentPreviewResponse> {
    const normalized = await this.normalize(actorId, body)
    const createdAt = this.now()
    const intent: AgentCommandIntent = {
      id: randomUUID(),
      actorId,
      action: body.action,
      risk: normalized.risk,
      teamId: body.teamId,
      projectId: "projectId" in body ? (body.projectId ?? null) : null,
      command: normalized.command,
      requestHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
      summary: normalized.summary,
      status: "pending",
      expiresAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
      confirmedAt: null,
      consumedAt: null,
      result: null,
      createdAt,
    }
    await this.repository.create(intent)
    return this.toPreview(intent)
  }

  async confirm(actorId: string, commandId: string): Promise<AgentConfirmationResponse> {
    const intent = await this.requireIntent(actorId, commandId)
    if (intent.risk !== "high") {
      throw new AppError("AGENT_CONFIRMATION_NOT_REQUIRED", "此命令不需要高风险确认", 409)
    }
    if (intent.status === "consumed") {
      throw new AppError("AGENT_COMMAND_ALREADY_EXECUTED", "此命令已经执行", 409)
    }
    if (intent.confirmedAt) {
      return {
        commandId: intent.id,
        status: "confirmed",
        confirmedAt: intent.confirmedAt.toISOString(),
      }
    }
    const confirmed = await this.repository.confirm(actorId, commandId)
    if (!confirmed?.confirmedAt) {
      throw new AppError("AGENT_COMMAND_CONFLICT", "命令状态已变化，请重新预览", 409)
    }
    return {
      commandId: confirmed.id,
      status: "confirmed",
      confirmedAt: confirmed.confirmedAt.toISOString(),
    }
  }

  async execute(actorId: string, commandId: string): Promise<AgentExecutionResponse> {
    return this.repository.withExecutionLock(actorId, commandId, async () => {
      const intent = await this.requireIntent(actorId, commandId)
      if (intent.status === "consumed" && intent.result) {
        return {
          commandId: intent.id,
          action: intent.action,
          result: intent.result,
          replayed: true,
        }
      }
      if (intent.risk === "high" && intent.status !== "confirmed") {
        throw new AppError("AGENT_CONFIRMATION_REQUIRED", "此命令必须确认后才能执行", 409)
      }

      const { result, replayed } = await this.executeCommand(actorId, intent)
      const consumed = await this.repository.consume(actorId, commandId, result)
      if (!consumed) {
        throw new AppError("AGENT_COMMAND_CONFLICT", "命令状态已变化，请重新预览", 409)
      }
      return { commandId, action: intent.action, result, replayed }
    })
  }

  private async normalize(actorId: string, body: AgentPreviewBody) {
    if (body.action === "list_audit_logs") {
      const query = {
        projectId: body.projectId,
        scope: body.scope,
        action: body.auditAction,
        actor: body.actor,
        from: body.from,
        to: body.to,
        page: body.page,
        pageSize: body.pageSize,
      } satisfies AuditLogQuery
      const result = await this.workspaceService.listAuditLogs(
        actorId,
        body.teamId,
        query,
      )
      return {
        risk: "read" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          query,
        } satisfies AgentStoredCommand,
        summary: `查询${body.projectId ? "当前项目" : body.scope === "team" ? "团队范围" : "当前团队"}的 ${result.total} 条审计记录`,
      }
    }
    if (body.action === "list_tasks") {
      const tasks = await this.workspaceService.listTasks(actorId, body.teamId)
      return {
        risk: "read" as const,
        command: body,
        summary: `读取当前团队的 ${tasks.items.length} 项任务并整理优先状态`,
      }
    }
    if (body.action === "list_execution_schedule") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const [schedule, shootingDays] = await Promise.all([
        this.productionService.listExecutionSchedule(actorId, body.projectId),
        this.productionService.listShootingDays(actorId, body.projectId),
      ])
      return {
        risk: "read" as const,
        command: body,
        summary: `读取当前项目的 ${schedule.items.length} 个执行阶段和 ${shootingDays.items.length} 个拍摄日`,
      }
    }
    if (body.action === "list_team_resources") {
      const command = {
        ...body,
        keyword: body.keyword?.normalize("NFKC").trim() || undefined,
      } satisfies AgentStoredCommand
      const result = await this.listTeamResources(actorId, command)
      return {
        risk: "read" as const,
        command,
        summary: `读取当前${body.projectId ? "项目" : "团队"}的 ${result.contacts.length} 位联系人、${result.suppliers.length} 家供应商和 ${result.assets.length} 项素材`,
      }
    }
    if (body.action === "semantic_search_assets") {
      if (body.projectId) {
        await this.assertProjectScope(actorId, body.teamId, body.projectId)
      }
      await this.assetService.listAssets(actorId, body.teamId)
      const query = body.query.normalize("NFKC").trim()
      if (!query) {
        throw new AppError("SEMANTIC_SEARCH_QUERY_INVALID", "语义检索内容无效", 400)
      }
      const command = {
        ...body,
        query,
      } satisfies AgentStoredCommand
      return {
        risk: "read" as const,
        command,
        summary: `按画面、转写与 OCR 语义搜索“${command.query}”`,
      }
    }
    if (body.action === "list_personal_contacts") {
      await this.assertTeamScope(actorId, body.teamId)
      const result = await this.contactService.listPersonalContacts(actorId)
      return {
        risk: "read" as const,
        command: body satisfies AgentStoredCommand,
        summary: `读取个人通讯录中的 ${result.items.length} 位联系人`,
      }
    }
    if (body.action === "create_personal_contact") {
      await this.assertTeamScope(actorId, body.teamId)
      return {
        risk: "write" as const,
        command: body,
        summary: `创建个人联系人“${body.name.trim()}”`,
      }
    }
    if (body.action === "update_personal_contact") {
      await this.assertTeamScope(actorId, body.teamId)
      const item = await this.selectPersonalContact(actorId, body)
      const command = {
        action: body.action,
        teamId: body.teamId,
        itemId: item.id,
        ...(body.name === undefined ? {} : { name: body.name.trim() }),
        ...(body.role === undefined ? {} : { role: body.role.trim() }),
        ...(body.company === undefined ? {} : { company: body.company.trim() }),
        ...(body.phone === undefined ? {} : { phone: body.phone.trim() }),
        ...(body.email === undefined ? {} : { email: body.email.trim() }),
        expectedRevision: item.revision,
      } satisfies AgentStoredCommand
      if (
        command.name === undefined &&
        command.role === undefined &&
        command.company === undefined &&
        command.phone === undefined &&
        command.email === undefined
      ) {
        throw new AppError(
          "AGENT_PERSONAL_CONTACT_UPDATE_REQUIRED",
          "请至少提供一个要修改的联系人字段",
          400,
        )
      }
      if (command.name === "") {
        throw new AppError("CONTACT_NAME_REQUIRED", "联系人姓名不能为空", 400)
      }
      return {
        risk: "write" as const,
        command,
        summary: `更新个人联系人“${item.name}”`,
      }
    }
    if (body.action === "share_personal_contact") {
      await this.assertTeamScope(actorId, body.teamId)
      const item = await this.selectPersonalContact(actorId, body)
      return {
        risk: "high" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          itemId: item.id,
          fields: body.fields,
          allowProjectLink: body.allowProjectLink ?? true,
          expectedRevision: item.revision,
        } satisfies AgentStoredCommand,
        summary: `向当前团队共享个人联系人“${item.name}”的 ${body.fields.length} 个字段`,
      }
    }
    if (body.action === "unshare_personal_contact") {
      await this.assertTeamScope(actorId, body.teamId)
      const item = await this.selectPersonalContact(actorId, body)
      if (!item.shares.some((share) => share.teamId === body.teamId)) {
        throw new AppError(
          "AGENT_PERSONAL_CONTACT_NOT_SHARED",
          "该联系人尚未共享给当前团队",
          409,
        )
      }
      return {
        risk: "high" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          itemId: item.id,
          expectedRevision: item.revision,
        } satisfies AgentStoredCommand,
        summary: `撤销个人联系人“${item.name}”对当前团队的共享`,
      }
    }
    if (body.action === "delete_personal_contact") {
      await this.assertTeamScope(actorId, body.teamId)
      const item = await this.selectPersonalContact(actorId, body)
      return {
        risk: "high" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          itemId: item.id,
          expectedRevision: item.revision,
        } satisfies AgentStoredCommand,
        summary: `删除个人联系人“${item.name}”`,
      }
    }
    if (body.action === "restore_personal_contact") {
      await this.assertTeamScope(actorId, body.teamId)
      const item = await this.selectPersonalContact(actorId, body, true)
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          itemId: item.id,
          expectedRevision: item.revision,
        } satisfies AgentStoredCommand,
        summary: `恢复个人联系人“${item.name}”`,
      }
    }
    if (body.action === "create_team_contact") {
      await this.contactService.listTeamContacts(actorId, body.teamId)
      return {
        risk: "write" as const,
        command: body,
        summary: `创建团队联系人“${body.name}”`,
      }
    }
    if (body.action === "create_team_supplier") {
      await this.contactService.listTeamSuppliers(actorId, body.teamId)
      return {
        risk: "write" as const,
        command: body,
        summary: `创建团队供应商“${body.name}”`,
      }
    }
    if (body.action === "create_task") {
      await this.workspaceService.listTasks(actorId, body.teamId)
      return {
        risk: "write" as const,
        command: body,
        summary: `创建任务“${body.title}”`,
      }
    }
    if (body.action === "update_task") {
      const { items } = await this.workspaceService.listTasks(actorId, body.teamId)
      const candidates = items.filter(
        (item) => !body.projectId || item.projectId === body.projectId,
      )
      const taskTitle = body.taskTitle?.normalize("NFKC").trim().toLocaleLowerCase()
      const matching = body.taskId
        ? candidates.filter((item) => item.id === body.taskId)
        : taskTitle
          ? candidates.filter(
              (item) =>
                item.title.normalize("NFKC").trim().toLocaleLowerCase() === taskTitle,
            )
          : []
      const task = matching.length === 1 ? matching[0] : null
      if (!task) {
        throw new AppError(
          "AGENT_TASK_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个任务，请提供任务 ID"
            : "未找到唯一匹配的任务，请明确任务标题或 ID",
          400,
        )
      }
      if (
        [body.title, body.dueDate, body.status, body.target].every(
          (value) => value === undefined,
        )
      ) {
        throw new AppError(
          "AGENT_TASK_UPDATE_REQUIRED",
          "请至少提供一项要更新的任务内容",
          400,
        )
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          itemId: task.id,
          title: body.title,
          dueDate: body.dueDate,
          status: body.status,
          target: body.target,
          expectedRevision: task.revision,
        } satisfies AgentStoredCommand,
        summary: `更新任务“${task.title}”`,
      }
    }
    if (body.action === "create_note") {
      await this.workspaceService.listNotes(actorId, body.teamId)
      return {
        risk: "write" as const,
        command: body,
        summary: `创建${body.projectId ? "项目笔记" : "个人便签"}“${body.title}”`,
      }
    }
    if (body.action === "update_note") {
      const { items } = await this.workspaceService.listNotes(actorId, body.teamId)
      const candidates = items.filter(
        (item) => !body.projectId || item.projectId === body.projectId,
      )
      const noteTitle = body.noteTitle?.normalize("NFKC").trim().toLocaleLowerCase()
      const matching = body.noteId
        ? candidates.filter((item) => item.id === body.noteId)
        : noteTitle
          ? candidates.filter(
              (item) =>
                item.title.normalize("NFKC").trim().toLocaleLowerCase() === noteTitle,
            )
          : []
      const note = matching.length === 1 ? matching[0] : null
      if (!note) {
        throw new AppError(
          "AGENT_NOTE_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个笔记，请提供笔记 ID"
            : "未找到唯一匹配的笔记，请明确标题或 ID",
          400,
        )
      }
      if ([body.title, body.body, body.pinned].every((value) => value === undefined)) {
        throw new AppError(
          "AGENT_NOTE_UPDATE_REQUIRED",
          "请至少提供一项要更新的笔记内容",
          400,
        )
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          itemId: note.id,
          title: body.title,
          body: body.body,
          pinned: body.pinned,
          expectedRevision: note.revision,
        } satisfies AgentStoredCommand,
        summary: `更新${note.kind === "note" ? "项目笔记" : "个人便签"}“${note.title}”`,
      }
    }
    if (body.action === "create_calendar_event") {
      await this.workspaceService.listCalendarEvents(actorId, body.teamId)
      return {
        risk: "write" as const,
        command: body,
        summary: `创建日程“${body.title}”`,
      }
    }
    if (body.action === "update_calendar_event") {
      const { items } = await this.workspaceService.listCalendarEvents(
        actorId,
        body.teamId,
      )
      const candidates = items.filter(
        (item) => !body.projectId || item.projectId === body.projectId,
      )
      const title = body.eventTitle?.trim()
      const matching = body.eventId
        ? candidates.filter((item) => item.id === body.eventId)
        : title
          ? candidates.filter(
              (item) =>
                item.title === title ||
                item.title.includes(title) ||
                title.includes(item.title),
            )
          : []
      const event = matching.length === 1 ? matching[0] : null
      if (!event) {
        throw new AppError(
          "AGENT_CALENDAR_EVENT_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个日程，请提供完整标题"
            : "未找到唯一匹配的日程，请明确日程标题",
          400,
        )
      }
      const startsAt = new Date(body.startsAt)
      const endsAt = event.endsAt
        ? new Date(
            startsAt.getTime() +
              (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()),
          ).toISOString()
        : undefined
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          itemId: event.id,
          startsAt: body.startsAt,
          endsAt,
          timezone: body.timezone,
          allDay: body.allDay,
          expectedRevision: event.revision,
        } satisfies AgentStoredCommand,
        summary: `将日程“${event.title}”调整到新的时间`,
      }
    }

    if (body.action === "create_call_sheet") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      await this.productionService.listCallSheets(actorId, body.projectId)
      return {
        risk: "write" as const,
        command: body,
        summary: `创建 ${body.date} 的通告表“${body.title}”`,
      }
    }

    if (body.action === "update_call_sheet") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const { items } = await this.productionService.listCallSheets(
        actorId,
        body.projectId,
      )
      const callSheetTitle = body.callSheetTitle
        ?.normalize("NFKC")
        .trim()
        .toLocaleLowerCase()
      const matching = body.callSheetId
        ? items.filter((item) => item.id === body.callSheetId)
        : callSheetTitle
          ? items.filter(
              (item) =>
                item.title.normalize("NFKC").trim().toLocaleLowerCase() ===
                callSheetTitle,
            )
          : []
      const callSheet = matching.length === 1 ? matching[0] : null
      if (!callSheet) {
        throw new AppError(
          "AGENT_CALL_SHEET_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个通告表，请提供通告表 ID"
            : "未找到唯一匹配的通告表，请明确标题或 ID",
          400,
        )
      }
      const hasUpdate = Object.entries(body).some(
        ([key, value]) =>
          ![
            "action",
            "teamId",
            "projectId",
            "callSheetId",
            "callSheetTitle",
            "changeSummary",
          ].includes(key) && value !== undefined,
      )
      if (!hasUpdate) {
        throw new AppError(
          "AGENT_CALL_SHEET_UPDATE_REQUIRED",
          "请至少提供一项要更新的通告表内容",
          400,
        )
      }
      return {
        risk: "write" as const,
        command: {
          ...body,
          itemId: callSheet.id,
          expectedRevision: callSheet.revision,
        } satisfies AgentStoredCommand,
        summary: `更新通告表“${callSheet.title}”`,
      }
    }

    if (body.action === "create_script_version") {
      const { documentId, version } = await this.resolveScriptVersionTarget(
        actorId,
        body.teamId,
        body.projectId,
        body.documentId,
        body.documentTitle,
      )
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          documentId,
          content: body.content,
          meta: body.meta,
          expectedVersionId: version.id,
          expectedRevision: version.revision,
        } satisfies AgentStoredCommand,
        summary: `基于 ${version.id} 创建脚本版本“${body.meta.trim()}”`,
      }
    }

    if (body.action === "update_script_version") {
      const { document, documentId, version } = await this.resolveScriptVersionTarget(
        actorId,
        body.teamId,
        body.projectId,
        body.documentId,
        body.documentTitle,
      )
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          documentId,
          versionId: version.id,
          content: body.content,
          expectedRevision: version.revision,
        } satisfies AgentStoredCommand,
        summary: `更新脚本文档“${document.title}”的当前协作稿`,
      }
    }

    if (body.action === "create_script_breakdown_analysis") {
      const target = await this.resolveScriptVersionTarget(
        actorId,
        body.teamId,
        body.projectId,
        body.documentId,
        body.documentTitle,
      )
      const version = body.versionId
        ? target.versions.find((item) => item.id === body.versionId)
        : target.version
      if (!version) {
        throw new AppError("SCRIPT_VERSION_NOT_FOUND", "脚本版本不存在", 404)
      }
      if (target.document.type !== "script") {
        throw new AppError("ANALYSIS_SCRIPT_REQUIRED", "只能分析脚本文档", 400)
      }
      if (!version.content.trim()) {
        throw new AppError("ANALYSIS_SOURCE_EMPTY", "脚本正文为空，无法开始分析", 400)
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          documentId: target.documentId,
          versionId: version.id,
          sourceRevision: version.revision,
        } satisfies AgentStoredCommand,
        summary: `分析脚本文档“${target.document.title}”的 ${version.id} 版本并生成制片拆解候选`,
      }
    }

    if (body.action === "create_media_analysis") {
      const { items } = await this.assetService.listAssets(actorId, body.teamId)
      const candidates = items.filter(
        (item) =>
          item.kind === "视频" && (!body.projectId || item.projectId === body.projectId),
      )
      const assetName = body.assetName?.normalize("NFKC").trim().toLocaleLowerCase()
      const matching = body.assetId
        ? candidates.filter((item) => item.id === body.assetId)
        : assetName
          ? candidates.filter(
              (item) =>
                item.name.normalize("NFKC").trim().toLocaleLowerCase() === assetName,
            )
          : candidates
      const asset = matching.length === 1 ? matching[0] : null
      if (!asset) {
        throw new AppError(
          "AGENT_ASSET_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个视频素材，请提供素材 ID"
            : "未找到唯一匹配的已上传视频，请明确素材名称或 ID",
          400,
        )
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          assetId: asset.id,
          expectedRevision: asset.revision,
        } satisfies AgentStoredCommand,
        summary: `分析视频素材“${asset.name}”并生成镜头候选`,
      }
    }

    if (body.action === "create_shooting_day") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      await this.productionService.listShootingDays(actorId, body.projectId)
      return {
        risk: "write" as const,
        command: body,
        summary: `创建第 ${body.dayNumber} 拍摄日“${body.title}”`,
      }
    }

    if (body.action === "update_shooting_day") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const { items } = await this.productionService.listShootingDays(
        actorId,
        body.projectId,
      )
      const shootingDayTitle = body.shootingDayTitle
        ?.normalize("NFKC")
        .trim()
        .toLocaleLowerCase()
      const matching = body.shootingDayId
        ? items.filter((item) => item.id === body.shootingDayId)
        : shootingDayTitle
          ? items.filter(
              (item) =>
                item.title.normalize("NFKC").trim().toLocaleLowerCase() ===
                shootingDayTitle,
            )
          : []
      const shootingDay = matching.length === 1 ? matching[0] : null
      if (!shootingDay) {
        throw new AppError(
          "AGENT_SHOOTING_DAY_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个拍摄日，请提供拍摄日 ID"
            : "未找到唯一匹配的拍摄日，请明确标题或 ID",
          400,
        )
      }
      if (
        [
          body.shootDate,
          body.dayNumber,
          body.title,
          body.status,
          body.originalTimezone,
        ].every((value) => value === undefined)
      ) {
        throw new AppError(
          "AGENT_SHOOTING_DAY_UPDATE_REQUIRED",
          "请至少提供一项要更新的拍摄日内容",
          400,
        )
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          itemId: shootingDay.id,
          shootDate: body.shootDate,
          dayNumber: body.dayNumber,
          title: body.title,
          status: body.status,
          originalTimezone: body.originalTimezone,
          expectedRevision: shootingDay.revision,
        } satisfies AgentStoredCommand,
        summary: `更新拍摄日“${shootingDay.title}”`,
      }
    }

    if (body.action === "create_execution_stage") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const schedule = await this.productionService.listExecutionSchedule(
        actorId,
        body.projectId,
      )
      const resources = (body.resources ?? []).map((resource) => {
        const existing = schedule.items
          .flatMap((item) => item.resources)
          .find(
            (candidate) =>
              candidate.type === resource.type &&
              candidate.name.normalize("NFKC").toLocaleLowerCase() ===
                resource.name.normalize("NFKC").toLocaleLowerCase(),
          )
        return existing ?? resource
      })
      return {
        risk: "write" as const,
        command: {
          ...body,
          progress: body.progress ?? 0,
          state: body.state ?? "未开始",
          note: body.note ?? "",
          resources,
        } satisfies AgentStoredCommand,
        summary: `创建执行阶段“${body.name}”`,
      }
    }

    if (body.action === "update_execution_stage") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const schedule = await this.productionService.listExecutionSchedule(
        actorId,
        body.projectId,
      )
      const stageName = body.stageName?.normalize("NFKC").trim().toLocaleLowerCase()
      const matching = body.stageId
        ? schedule.items.filter((item) => item.id === body.stageId)
        : stageName
          ? schedule.items.filter(
              (item) =>
                item.name.normalize("NFKC").trim().toLocaleLowerCase() === stageName,
            )
          : []
      const stage = matching.length === 1 ? matching[0] : null
      if (!stage) {
        throw new AppError(
          "AGENT_EXECUTION_STAGE_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个执行阶段，请提供阶段 ID"
            : "未找到唯一匹配的执行阶段，请明确阶段名称或 ID",
          400,
        )
      }
      const hasUpdate = [
        body.name,
        body.startsAt,
        body.endsAt,
        body.originalTimezone,
        body.progress,
        body.owner,
        body.state,
        body.note,
        body.resources,
      ].some((value) => value !== undefined)
      if (!hasUpdate) {
        throw new AppError(
          "AGENT_EXECUTION_STAGE_UPDATE_REQUIRED",
          "请至少提供一项要更新的执行阶段内容",
          400,
        )
      }
      const resources = body.resources?.map((resource) => {
        const existing = schedule.items
          .flatMap((item) => item.resources)
          .find(
            (candidate) =>
              candidate.type === resource.type &&
              candidate.name.normalize("NFKC").toLocaleLowerCase() ===
                resource.name.normalize("NFKC").toLocaleLowerCase(),
          )
        return existing ?? resource
      })
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          itemId: stage.id,
          name: body.name,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          originalTimezone: body.originalTimezone,
          progress: body.progress,
          owner: body.owner,
          state: body.state,
          note: body.note,
          resources,
          expectedRevision: stage.revision,
        } satisfies AgentStoredCommand,
        summary: `更新执行阶段“${stage.name}”`,
      }
    }

    if (body.action === "update_breakdown") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const breakdown = await this.productionService.listBreakdown(
        actorId,
        body.projectId,
      )
      const itemName = body.itemName?.normalize("NFKC").trim().toLocaleLowerCase()
      const matching = body.itemId
        ? breakdown.items.filter((item) => item.id === body.itemId)
        : itemName
          ? breakdown.items.filter(
              (item) =>
                item.item.normalize("NFKC").trim().toLocaleLowerCase() === itemName,
            )
          : []
      const selected = matching.length === 1 ? matching[0] : null
      if (!selected) {
        throw new AppError(
          "AGENT_BREAKDOWN_ITEM_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个拆解项，请提供拆解项 ID"
            : "未找到唯一匹配的拆解项，请明确候选内容或 ID",
          400,
        )
      }
      if (
        [
          body.item,
          body.requirementType,
          body.specification,
          body.quantity,
          body.preparation,
          body.department,
          body.state,
          body.supplierIds,
          body.responsibleAccountId,
          body.taskIds,
          body.contactRefs,
          body.shootingDayIds,
          body.callSheetIds,
        ].every((value) => value === undefined)
      ) {
        throw new AppError(
          "AGENT_BREAKDOWN_UPDATE_REQUIRED",
          "请至少提供一项要更新的拆解内容",
          400,
        )
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          itemId: selected.id,
          item: body.item,
          requirementType: body.requirementType,
          specification: body.specification,
          quantity: body.quantity,
          preparation: body.preparation,
          department: body.department,
          state: body.state,
          supplierIds: body.supplierIds,
          responsibleAccountId: body.responsibleAccountId,
          taskIds: body.taskIds,
          contactRefs: body.contactRefs,
          shootingDayIds: body.shootingDayIds,
          callSheetIds: body.callSheetIds,
          expectedRevision: selected.revision,
        } satisfies AgentStoredCommand,
        summary: `更新制片拆解项“${selected.item}”`,
      }
    }

    if (body.action === "confirm_breakdown") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const breakdown = await this.productionService.listBreakdown(
        actorId,
        body.projectId,
      )
      const category = body.category.normalize("NFKC").trim()
      const requestedIds = body.itemIds ? new Set(body.itemIds) : null
      const items = breakdown.items
        .filter(
          (item) =>
            item.state === "待确认" &&
            item.category.normalize("NFKC").trim() === category &&
            (!requestedIds || requestedIds.has(item.id)),
        )
        .sort((left, right) => left.id.localeCompare(right.id))
      if (!items.length || (requestedIds && items.length !== requestedIds.size)) {
        throw new AppError(
          "AGENT_BREAKDOWN_SELECTION_REQUIRED",
          requestedIds
            ? "部分拆解项不存在、已确认或不属于所选分类"
            : `“${category}”分类当前没有待确认拆解项`,
          400,
        )
      }
      return {
        risk: "high" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          category,
          items: items.map((item) => ({
            itemId: item.id,
            expectedRevision: item.revision,
          })),
        } satisfies AgentStoredCommand,
        summary: `确认“${category}”分类的 ${items.length} 项制片拆解候选`,
      }
    }

    if (body.action === "publish_call_sheet") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const { items } = await this.productionService.listCallSheets(
        actorId,
        body.projectId,
      )
      const candidates = items.filter((item) => item.status !== "已发布")
      const title = body.title?.trim()
      const matching = body.callSheetId
        ? candidates.filter((item) => item.id === body.callSheetId)
        : title
          ? candidates.filter(
              (item) =>
                item.title === title ||
                item.title.includes(title) ||
                title.includes(item.title),
            )
          : candidates
      const callSheet = matching.length === 1 ? matching[0] : null
      if (!callSheet) {
        const message = !candidates.length
          ? "当前没有可发布的通告表"
          : (body.callSheetId || title) && !matching.length
            ? "未找到匹配的待发布通告表"
            : "当前有多个待发布通告表，请明确通告表标题"
        throw new AppError("AGENT_CALL_SHEET_SELECTION_REQUIRED", message, 400)
      }
      return {
        risk: "high" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          itemId: callSheet.id,
          expectedRevision: callSheet.revision,
        } satisfies AgentStoredCommand,
        summary: `正式发布通告表“${callSheet.title}”`,
      }
    }

    if (body.action === "list_review_feedback") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const { items } = await this.productionService.listReviewFiles(
        actorId,
        body.projectId,
      )
      const candidates = items.filter((item) => item.type === "video")
      const selectFile = (fileId?: string, fileName?: string) => {
        const name = fileName?.trim()
        const matching = fileId
          ? candidates.filter((item) => item.id === fileId)
          : name
            ? candidates.filter((item) => {
                const label = `${item.name} ${item.version}`
                return (
                  item.name === name ||
                  label === name ||
                  label.includes(name) ||
                  name.includes(label)
                )
              })
            : []
        return matching.length === 1 ? matching[0] : null
      }
      const hasPrimary = Boolean(body.primaryFileId || body.primaryFileName?.trim())
      const hasCompare = Boolean(body.compareFileId || body.compareFileName?.trim())
      if (hasCompare && !hasPrimary) {
        throw new AppError(
          "AGENT_REVIEW_FILE_SELECTION_REQUIRED",
          "对比审片反馈前请先指定主版本",
          400,
        )
      }
      const primaryFile = hasPrimary
        ? selectFile(body.primaryFileId, body.primaryFileName)
        : null
      if (hasPrimary && !primaryFile) {
        throw new AppError(
          "AGENT_REVIEW_FILE_SELECTION_REQUIRED",
          "未找到唯一匹配的主审片版本",
          400,
        )
      }
      const compareFile = hasCompare
        ? selectFile(body.compareFileId, body.compareFileName)
        : null
      if (hasCompare && !compareFile) {
        throw new AppError(
          "AGENT_REVIEW_FILE_SELECTION_REQUIRED",
          "未找到唯一匹配的对比审片版本",
          400,
        )
      }
      if (
        primaryFile &&
        compareFile &&
        (primaryFile.id === compareFile.id || primaryFile.version === compareFile.version)
      ) {
        throw new AppError("REVIEW_FILES_MUST_DIFFER", "请选择两个不同的审片版本", 400)
      }
      const label = (file: (typeof candidates)[number]) =>
        file.name.includes(file.version) ? file.name : `${file.name} ${file.version}`
      return {
        risk: "read" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          primaryFileId: primaryFile?.id,
          compareFileId: compareFile?.id,
        } satisfies AgentStoredCommand,
        summary:
          primaryFile && compareFile
            ? `对比审片版本“${label(primaryFile)}”与“${label(compareFile)}”的反馈`
            : primaryFile
              ? `整理审片版本“${label(primaryFile)}”的反馈`
              : `查看当前项目的 ${candidates.length} 个审片版本`,
      }
    }

    if (body.action === "create_review_file") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          assetId: body.assetId,
          name: body.name.trim(),
          version: body.version.trim(),
          duration: body.duration?.trim(),
        } satisfies AgentStoredCommand,
        summary: `从团队素材创建审片版本“${body.name.trim()} ${body.version.trim()}”`,
      }
    }

    if (body.action === "create_review_comment") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const { items } = await this.productionService.listReviewFiles(
        actorId,
        body.projectId,
      )
      const candidates = items.filter((item) => item.type === "video")
      const fileName = body.fileName?.trim()
      const matching = body.fileId
        ? candidates.filter((item) => item.id === body.fileId)
        : fileName
          ? candidates.filter((item) => {
              const label = `${item.name} ${item.version}`
              return (
                item.name === fileName ||
                label === fileName ||
                label.includes(fileName) ||
                fileName.includes(label)
              )
            })
          : candidates
      const file = matching.length === 1 ? matching[0] : null
      if (!file) {
        const message = !candidates.length
          ? "当前项目没有可评论的审片视频"
          : (body.fileId || fileName) && !matching.length
            ? "未找到匹配的审片视频"
            : "当前有多个审片视频，请明确文件名称"
        throw new AppError("AGENT_REVIEW_FILE_SELECTION_REQUIRED", message, 400)
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          fileId: file.id,
          version: file.version,
          timecode: body.timecode,
          text: body.text,
        } satisfies AgentStoredCommand,
        summary: `在审片视频“${file.name}”的 ${body.timecode} 添加意见`,
      }
    }

    if (body.action === "update_review_comment") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const { items } = await this.productionService.listReviewFiles(
        actorId,
        body.projectId,
      )
      const candidates = items.filter((item) => item.type === "video")
      const fileName = body.fileName?.trim()
      const matchingFiles = body.fileId
        ? candidates.filter((item) => item.id === body.fileId)
        : fileName
          ? candidates.filter(
              (item) =>
                item.name === fileName || `${item.name} ${item.version}` === fileName,
            )
          : candidates
      const file = matchingFiles.length === 1 ? matchingFiles[0] : null
      if (!file) {
        throw new AppError(
          "AGENT_REVIEW_FILE_SELECTION_REQUIRED",
          matchingFiles.length > 1
            ? "当前有多个审片视频，请明确文件名称"
            : "未找到唯一匹配的审片视频",
          400,
        )
      }
      const comments = await this.productionService.listReviewComments(
        actorId,
        body.projectId,
        file.id,
      )
      const commentText = body.commentText?.trim()
      const matchingComments = comments.items.filter(
        (item) =>
          item.state !== body.state &&
          (body.commentId ? item.id === body.commentId : true) &&
          (body.timecode ? item.timecode === body.timecode : true) &&
          (commentText ? item.text === commentText : true),
      )
      const comment = matchingComments.length === 1 ? matchingComments[0] : null
      if (!comment) {
        throw new AppError(
          "AGENT_REVIEW_COMMENT_SELECTION_REQUIRED",
          matchingComments.length > 1
            ? "匹配到多条审片意见，请补充时间码或完整意见内容"
            : "未找到可更新的唯一审片意见",
          400,
        )
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          commentId: comment.id,
          state: body.state,
          expectedRevision: comment.revision,
        } satisfies AgentStoredCommand,
        summary: `${body.state === "resolved" ? "解决" : "重新打开"} ${comment.timecode} 的审片意见`,
      }
    }

    if (body.action === "create_review_link") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const { items } = await this.productionService.listReviewFiles(
        actorId,
        body.projectId,
      )
      const candidates = items.filter((item) => item.type === "video" && item.mediaReady)
      const fileName = body.fileName?.trim()
      const matching = body.fileId
        ? candidates.filter((item) => item.id === body.fileId)
        : fileName
          ? candidates.filter((item) => {
              const label = `${item.name} ${item.version}`
              return (
                item.name === fileName ||
                label === fileName ||
                label.includes(fileName) ||
                fileName.includes(label)
              )
            })
          : candidates
      const file = matching.length === 1 ? matching[0] : null
      if (!file) {
        const message = !candidates.length
          ? "当前项目没有可分享的审片视频"
          : (body.fileId || fileName) && !matching.length
            ? "未找到匹配的可分享审片视频"
            : "当前有多个可分享审片视频，请明确文件名称"
        throw new AppError("AGENT_REVIEW_FILE_SELECTION_REQUIRED", message, 400)
      }
      const expiresAt =
        body.expiresAt ??
        new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const fileLabel = file.name.includes(file.version)
        ? file.name
        : `${file.name} ${file.version}`
      return {
        risk: "high" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          fileId: file.id,
          expiresAt,
        } satisfies AgentStoredCommand,
        summary: `为审片视频“${fileLabel}”创建客户链接`,
      }
    }

    if (body.action === "approve_review_file") {
      await this.assertProjectScope(actorId, body.teamId, body.projectId)
      const { items } = await this.productionService.listReviewFiles(
        actorId,
        body.projectId,
      )
      const candidates = items.filter(
        (item) =>
          item.type === "video" && item.status !== "处理中" && item.status !== "已通过",
      )
      const fileName = body.fileName?.trim()
      const matching = body.fileId
        ? candidates.filter((item) => item.id === body.fileId)
        : fileName
          ? candidates.filter(
              (item) =>
                item.name === fileName || `${item.name} ${item.version}` === fileName,
            )
          : candidates
      const file = matching.length === 1 ? matching[0] : null
      if (!file) {
        const message = !candidates.length
          ? "当前项目没有可批准的审片视频"
          : (body.fileId || fileName) && !matching.length
            ? "未找到匹配的可批准审片视频"
            : "当前有多个可批准审片视频，请明确文件名称"
        throw new AppError("AGENT_REVIEW_FILE_SELECTION_REQUIRED", message, 400)
      }
      const fileLabel = file.name.includes(file.version)
        ? file.name
        : `${file.name} ${file.version}`
      return {
        risk: "high" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          projectId: body.projectId,
          fileId: file.id,
          expectedRevision: file.revision,
        } satisfies AgentStoredCommand,
        summary: `批准审片视频“${fileLabel}”`,
      }
    }

    if (body.action === "create_portfolio") {
      await this.portfolioService.listPortfolios(actorId, body.teamId)
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          title: body.title,
          category: body.category ?? "未分类",
          year: body.year ?? String(this.now().getFullYear()),
          description: body.description ?? "",
        } satisfies AgentStoredCommand,
        summary: `创建团队可见作品集草稿“${body.title}”`,
      }
    }

    if (body.action === "add_portfolio_content") {
      const portfolios = await this.portfolioService.listPortfolios(actorId, body.teamId)
      const candidates = portfolios.items.filter((item) => item.state !== "已公开")
      const portfolioTitle = body.portfolioTitle?.trim()
      const matchingPortfolios = body.portfolioId
        ? candidates.filter((item) => item.id === body.portfolioId)
        : portfolioTitle
          ? candidates.filter((item) => item.title === portfolioTitle)
          : candidates
      const portfolio = matchingPortfolios.length === 1 ? matchingPortfolios[0] : null
      if (!portfolio) {
        throw new AppError(
          "AGENT_PORTFOLIO_SELECTION_REQUIRED",
          matchingPortfolios.length > 1
            ? "当前有多个作品集草稿，请明确作品集名称"
            : "未找到可添加内容的作品集草稿",
          400,
        )
      }
      const approved = await this.portfolioService.listApprovedCandidates(
        actorId,
        body.teamId,
      )
      const fileName = body.fileName?.trim()
      const matchingContent = body.reviewFileId
        ? approved.items.filter((item) => item.reviewFileId === body.reviewFileId)
        : fileName
          ? approved.items.filter(
              (item) =>
                item.title === fileName || `${item.title} ${item.version}` === fileName,
            )
          : approved.items
      const content = matchingContent.length === 1 ? matchingContent[0] : null
      if (!content) {
        throw new AppError(
          "AGENT_PORTFOLIO_CONTENT_SELECTION_REQUIRED",
          matchingContent.length > 1
            ? "当前有多个已通过成片，请明确文件名称和版本"
            : "未找到可加入作品集的已通过成片",
          400,
        )
      }
      return {
        risk: "write" as const,
        command: {
          action: body.action,
          teamId: body.teamId,
          portfolioId: portfolio.id,
          assetId: content.assetId,
          reviewFileId: content.reviewFileId,
          caption: body.caption ?? "",
          featured: body.featured ?? false,
          expectedRevision: portfolio.revision,
        } satisfies AgentStoredCommand,
        summary: `将“${content.title} ${content.version}”加入作品集“${portfolio.title}”`,
      }
    }

    const portfolios = await this.portfolioService.listPortfolios(actorId, body.teamId)
    const candidates = portfolios.items.filter((item) => item.state !== "已公开")
    const portfolio = body.portfolioId
      ? candidates.find((item) => item.id === body.portfolioId)
      : candidates.length === 1
        ? candidates[0]
        : null
    if (!portfolio) {
      throw new AppError(
        "AGENT_PORTFOLIO_SELECTION_REQUIRED",
        candidates.length
          ? "当前有多个待发布作品集，请明确选择作品集"
          : "当前没有可发布的作品集",
        400,
      )
    }
    return {
      risk: "high" as const,
      command: {
        action: body.action,
        teamId: body.teamId,
        portfolioId: portfolio.id,
        expectedRevision: portfolio.revision,
      } satisfies AgentStoredCommand,
      summary: `公开发布作品集“${portfolio.title}”`,
    }
  }

  private async executeCommand(actorId: string, intent: AgentCommandIntent) {
    const command = intent.command
    if (command.action === "list_audit_logs") {
      const result = await this.workspaceService.listAuditLogs(
        actorId,
        command.teamId,
        command.query,
      )
      return {
        result: { kind: "audit_log_list" as const, ...result },
        replayed: false,
      }
    }
    if (command.action === "list_tasks") {
      const result = await this.workspaceService.listTasks(actorId, command.teamId)
      return {
        result: { kind: "task_list" as const, items: result.items },
        replayed: false,
      }
    }
    if (command.action === "list_execution_schedule") {
      await this.assertProjectScope(actorId, command.teamId, command.projectId)
      const [schedule, shootingDays] = await Promise.all([
        this.productionService.listExecutionSchedule(actorId, command.projectId),
        this.productionService.listShootingDays(actorId, command.projectId),
      ])
      return {
        result: {
          kind: "execution_schedule_list" as const,
          stages: schedule.items,
          conflicts: schedule.conflicts,
          shootingDays: shootingDays.items,
        },
        replayed: false,
      }
    }
    if (command.action === "list_team_resources") {
      const result = await this.listTeamResources(actorId, command)
      return {
        result: { kind: "team_resources_list" as const, ...result },
        replayed: false,
      }
    }
    if (command.action === "semantic_search_assets") {
      const items = await this.assetService.semanticSearchText({
        actorId,
        teamId: command.teamId,
        projectId: command.projectId,
        query: command.query,
        limit: command.limit,
      })
      return {
        result: { kind: "asset_semantic_search" as const, items },
        replayed: false,
      }
    }
    if (command.action === "list_personal_contacts") {
      await this.assertTeamScope(actorId, command.teamId)
      const result = await this.contactService.listPersonalContacts(actorId)
      return {
        result: { kind: "personal_contact_list" as const, items: result.items },
        replayed: false,
      }
    }
    if (command.action === "create_personal_contact") {
      await this.assertTeamScope(actorId, command.teamId)
      const result = await this.contactService.createPersonalContact({
        actorId,
        name: command.name,
        role: command.role,
        company: command.company,
        phone: command.phone,
        email: command.email,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "personal_contact_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_personal_contact") {
      const item = await this.contactService.updatePersonalContact({
        actorId,
        contactId: command.itemId,
        name: command.name,
        role: command.role,
        company: command.company,
        phone: command.phone,
        email: command.email,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "personal_contact_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "share_personal_contact") {
      const item = await this.contactService.setContactShare({
        actorId,
        teamId: command.teamId,
        contactId: command.itemId,
        fields: command.fields,
        allowProjectLink: command.allowProjectLink,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "personal_contact_shared" as const, item },
        replayed: false,
      }
    }
    if (command.action === "unshare_personal_contact") {
      const item = await this.contactService.deleteContactShare({
        actorId,
        teamId: command.teamId,
        contactId: command.itemId,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "personal_contact_unshared" as const, item },
        replayed: false,
      }
    }
    if (command.action === "delete_personal_contact") {
      const item = await this.contactService.deletePersonalContact({
        actorId,
        contactId: command.itemId,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "personal_contact_deleted" as const, id: item.id },
        replayed: false,
      }
    }
    if (command.action === "restore_personal_contact") {
      const item = await this.contactService.restorePersonalContact({
        actorId,
        contactId: command.itemId,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "personal_contact_restored" as const, item },
        replayed: false,
      }
    }
    if (command.action === "create_team_contact") {
      const result = await this.contactService.createTeamContact({
        actorId,
        ...command,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "team_contact_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "create_team_supplier") {
      const result = await this.contactService.createTeamSupplier({
        actorId,
        ...command,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "team_supplier_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "create_task") {
      const result = await this.workspaceService.createTask({
        actorId,
        teamId: command.teamId,
        projectId: command.projectId,
        title: command.title,
        status: "待开始",
        target: "tasks",
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "task_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_task") {
      const item = await this.workspaceService.updateTask({
        actorId,
        teamId: command.teamId,
        itemId: command.itemId,
        title: command.title,
        dueDate: command.dueDate,
        status: command.status,
        target: command.target,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "task_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "create_note") {
      const result = await this.workspaceService.createNote({
        actorId,
        teamId: command.teamId,
        projectId: command.projectId,
        title: command.title,
        body: command.body,
        kind: command.projectId ? "note" : "sticky",
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "note_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_note") {
      const item = await this.workspaceService.updateNote({
        actorId,
        teamId: command.teamId,
        itemId: command.itemId,
        title: command.title,
        body: command.body,
        pinned: command.pinned,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "note_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "create_calendar_event") {
      const result = await this.workspaceService.createCalendarEvent({
        actorId,
        teamId: command.teamId,
        projectId: command.projectId,
        title: command.title,
        startsAt: command.startsAt,
        endsAt: command.endsAt,
        timezone: command.timezone,
        allDay: command.allDay,
        visibility: command.visibility,
        target: "calendar",
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "calendar_event_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_calendar_event") {
      const item = await this.workspaceService.updateCalendarEvent({
        actorId,
        teamId: command.teamId,
        itemId: command.itemId,
        startsAt: command.startsAt,
        endsAt: command.endsAt,
        timezone: command.timezone,
        allDay: command.allDay,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "calendar_event_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "create_script_version") {
      const result = await this.scriptService.createVersion({
        actorId,
        projectId: command.projectId,
        documentId: command.documentId,
        content: command.content,
        meta: command.meta,
        expectedVersionId: command.expectedVersionId,
        expectedRevision: command.expectedRevision,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: {
          kind: "script_version_created" as const,
          projectId: command.projectId,
          documentId: result.documentId,
          item: result.version,
        },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_script_version") {
      const result = await this.scriptService.updateVersion({
        actorId,
        projectId: command.projectId,
        documentId: command.documentId,
        versionId: command.versionId,
        content: command.content,
        expectedRevision: command.expectedRevision,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: {
          kind: "script_version_updated" as const,
          projectId: command.projectId,
          documentId: result.documentId,
          item: result.version,
        },
        replayed: result.replayed,
      }
    }
    if (command.action === "create_script_breakdown_analysis") {
      const result = await this.analysisService.createScriptBreakdown(
        actorId,
        command.projectId,
        {
          documentId: command.documentId,
          versionId: command.versionId,
          sourceRevision: command.sourceRevision,
          idempotencyKey: `agent-${intent.id}`,
        },
      )
      return {
        result: {
          kind: "script_breakdown_analysis_created" as const,
          item: result.job,
        },
        replayed: result.replayed,
      }
    }
    if (command.action === "create_media_analysis") {
      const result = await this.assetService.createMediaAnalysis(
        actorId,
        command.teamId,
        command.assetId,
        {
          expectedRevision: command.expectedRevision,
          idempotencyKey: `agent-${intent.id}`,
        },
      )
      return {
        result: { kind: "media_analysis_created" as const, item: result.job },
        replayed: result.replayed,
      }
    }
    if (command.action === "create_call_sheet") {
      const result = await this.productionService.createCallSheet({
        actorId,
        projectId: command.projectId,
        date: command.date,
        title: command.title,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "call_sheet_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "create_shooting_day") {
      const result = await this.productionService.createShootingDay({
        actorId,
        projectId: command.projectId,
        shootDate: command.shootDate,
        dayNumber: command.dayNumber,
        title: command.title,
        originalTimezone: command.originalTimezone,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "shooting_day_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_shooting_day") {
      const item = await this.productionService.updateShootingDay({
        actorId,
        projectId: command.projectId,
        itemId: command.itemId,
        shootDate: command.shootDate,
        dayNumber: command.dayNumber,
        title: command.title,
        status: command.status,
        originalTimezone: command.originalTimezone,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "shooting_day_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "create_execution_stage") {
      const result = await this.productionService.createExecutionStage({
        actorId,
        projectId: command.projectId,
        name: command.name,
        startsAt: command.startsAt,
        endsAt: command.endsAt,
        originalTimezone: command.originalTimezone,
        progress: command.progress,
        owner: command.owner,
        state: command.state,
        note: command.note,
        resources: command.resources,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "execution_stage_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_execution_stage") {
      const item = await this.productionService.updateExecutionStage({
        actorId,
        projectId: command.projectId,
        itemId: command.itemId,
        name: command.name,
        startsAt: command.startsAt,
        endsAt: command.endsAt,
        originalTimezone: command.originalTimezone,
        progress: command.progress,
        owner: command.owner,
        state: command.state,
        note: command.note,
        resources: command.resources,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "execution_stage_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "confirm_breakdown") {
      const result = await this.productionService.confirmBreakdown({
        actorId,
        projectId: command.projectId,
        category: command.category,
        items: command.items,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "breakdown_confirmed" as const, items: result.items },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_breakdown") {
      const item = await this.productionService.updateBreakdown({
        actorId,
        projectId: command.projectId,
        itemId: command.itemId,
        item: command.item,
        requirementType: command.requirementType,
        specification: command.specification,
        quantity: command.quantity,
        preparation: command.preparation,
        department: command.department,
        state: command.state,
        supplierIds: command.supplierIds,
        responsibleAccountId: command.responsibleAccountId,
        taskIds: command.taskIds,
        contactRefs: command.contactRefs,
        shootingDayIds: command.shootingDayIds,
        callSheetIds: command.callSheetIds,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "breakdown_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "publish_call_sheet") {
      const result = await this.productionService.publishCallSheet({
        actorId,
        projectId: command.projectId,
        itemId: command.itemId,
        expectedRevision: command.expectedRevision,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: {
          kind: "call_sheet_published" as const,
          item: result.item,
          publication: result.publication,
        },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_call_sheet") {
      const item = await this.productionService.updateCallSheet({
        actorId,
        projectId: command.projectId,
        itemId: command.itemId,
        date: command.date,
        day: command.day,
        title: command.title,
        status: command.status,
        crewCall: command.crewCall,
        firstShot: command.firstShot,
        wrap: command.wrap,
        weather: command.weather,
        sunrise: command.sunrise,
        sunset: command.sunset,
        basecamp: command.basecamp,
        location: command.location,
        hospital: command.hospital,
        scenes: command.scenes,
        cast: command.cast,
        departments: command.departments,
        equipment: command.equipment,
        safety: command.safety,
        transport: command.transport,
        catering: command.catering,
        keyContacts: command.keyContacts,
        nextDayPreview: command.nextDayPreview,
        changeSummary: command.changeSummary,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "call_sheet_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "list_review_feedback") {
      const { items: files } = await this.productionService.listReviewFiles(
        actorId,
        command.projectId,
      )
      if (!command.primaryFileId) {
        return {
          result: {
            kind: "review_feedback_list" as const,
            files,
            primaryFileId: null,
            primaryComments: [],
            compareFileId: null,
            compareComments: [],
            correspondence: null,
          },
          replayed: false,
        }
      }
      const primaryFile = files.find((item) => item.id === command.primaryFileId)
      if (!primaryFile) throw new AppError("RESOURCE_NOT_FOUND", "审片文件不存在", 404)
      const { items: primaryComments } = await this.productionService.listReviewComments(
        actorId,
        command.projectId,
        primaryFile.id,
      )
      if (!command.compareFileId) {
        return {
          result: {
            kind: "review_feedback_list" as const,
            files,
            primaryFileId: primaryFile.id,
            primaryComments,
            compareFileId: null,
            compareComments: [],
            correspondence: null,
          },
          replayed: false,
        }
      }
      const compareFile = files.find((item) => item.id === command.compareFileId)
      if (!compareFile) throw new AppError("RESOURCE_NOT_FOUND", "审片文件不存在", 404)
      const [{ items: compareComments }, correspondence] = await Promise.all([
        this.productionService.listReviewComments(
          actorId,
          command.projectId,
          compareFile.id,
        ),
        this.productionService.listReviewCommentCorrespondence(
          actorId,
          command.projectId,
          primaryFile.id,
          compareFile.id,
        ),
      ])
      return {
        result: {
          kind: "review_feedback_list" as const,
          files,
          primaryFileId: primaryFile.id,
          primaryComments,
          compareFileId: compareFile.id,
          compareComments,
          correspondence,
        },
        replayed: false,
      }
    }
    if (command.action === "create_review_file") {
      const result = await this.productionService.createReviewFile({
        actorId,
        projectId: command.projectId,
        assetId: command.assetId,
        name: command.name,
        version: command.version,
        duration: command.duration,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "review_file_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "create_review_comment") {
      const result = await this.productionService.createReviewComment({
        actorId,
        projectId: command.projectId,
        fileId: command.fileId,
        version: command.version,
        timecode: command.timecode,
        text: command.text,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "review_comment_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "update_review_comment") {
      const item = await this.productionService.updateReviewComment({
        actorId,
        projectId: command.projectId,
        commentId: command.commentId,
        state: command.state,
        expectedRevision: command.expectedRevision,
      })
      return {
        result: { kind: "review_comment_updated" as const, item },
        replayed: false,
      }
    }
    if (command.action === "create_review_link") {
      const result = await this.reviewLinkService.createLink({
        actorId,
        projectId: command.projectId,
        fileIds: [command.fileId],
        scope: {
          canComment: true,
          canCompare: true,
          canDownload: false,
          canApprove: true,
        },
        expiresAt: command.expiresAt,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "review_link_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "approve_review_file") {
      const result = await this.productionService.approveReviewFile({
        actorId,
        projectId: command.projectId,
        fileId: command.fileId,
        expectedRevision: command.expectedRevision,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "review_file_approved" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "create_portfolio") {
      const result = await this.portfolioService.createPortfolio({
        actorId,
        teamId: command.teamId,
        title: command.title,
        category: command.category,
        year: command.year,
        description: command.description,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "portfolio_created" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    if (command.action === "add_portfolio_content") {
      const result = await this.portfolioService.addContent({
        actorId,
        teamId: command.teamId,
        portfolioId: command.portfolioId,
        assetId: command.assetId,
        reviewFileId: command.reviewFileId,
        caption: command.caption,
        featured: command.featured,
        expectedRevision: command.expectedRevision,
        idempotencyKey: `agent-${intent.id}`,
      })
      return {
        result: { kind: "portfolio_content_added" as const, item: result.item },
        replayed: result.replayed,
      }
    }
    const result = await this.portfolioService.publishPortfolio({
      actorId,
      teamId: command.teamId,
      portfolioId: command.portfolioId,
      expectedRevision: command.expectedRevision,
      idempotencyKey: `agent-${intent.id}`,
    })
    return {
      result: { kind: "portfolio_published" as const, item: result.item },
      replayed: result.replayed,
    }
  }

  private async assertProjectScope(actorId: string, teamId: string, projectId: string) {
    const context = await this.workspaceService.getContext(actorId)
    const project = context.teams
      .find((team) => team.id === teamId)
      ?.projects.find((item) => item.id === projectId)
    if (!project) throw new AppError("PROJECT_ACCESS_DENIED", "无权访问所选项目", 403)
  }

  private async listTeamResources(
    actorId: string,
    command: Extract<AgentStoredCommand, { action: "list_team_resources" }>,
  ) {
    if (command.projectId) {
      await this.assertProjectScope(actorId, command.teamId, command.projectId)
    }
    const { items: contacts } = await this.contactService.listTeamContacts(
      actorId,
      command.teamId,
    )
    const { items: suppliers } = await this.contactService.listTeamSuppliers(
      actorId,
      command.teamId,
    )
    const { items: assets } = await this.assetService.listAssets(actorId, command.teamId)
    const keyword = command.keyword?.toLocaleLowerCase()
    const matches = (...values: Array<string | null>) =>
      !keyword ||
      values.some((value) =>
        value?.normalize("NFKC").toLocaleLowerCase().includes(keyword),
      )
    const scopedContacts = contacts.filter(
      (item) =>
        (!command.projectId || item.projectIds.includes(command.projectId)) &&
        matches(item.name, item.role, item.company, item.phone, item.email),
    )
    const visibleContacts = new Set(contacts.map((item) => `${item.source}:${item.id}`))
    return {
      contacts: scopedContacts,
      suppliers: suppliers
        .filter(
          (item) =>
            (!command.projectId || item.projectIds.includes(command.projectId)) &&
            matches(item.name, item.category, item.services, item.phone, item.email),
        )
        .map((item) => ({
          ...item,
          contactRefs: item.contactRefs.filter((contact) =>
            visibleContacts.has(`${contact.source}:${contact.contactId}`),
          ),
        })),
      assets: assets.filter(
        (item) =>
          !item.archived &&
          (!command.projectId || item.projectId === command.projectId) &&
          matches(item.name, item.projectName, item.note, ...item.tags),
      ),
    }
  }

  private async assertTeamScope(actorId: string, teamId: string) {
    const context = await this.workspaceService.getContext(actorId)
    if (!context.teams.some((team) => team.id === teamId)) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队", 403)
    }
  }

  private async selectPersonalContact(
    actorId: string,
    selector: { contactId?: string; contactName?: string },
    deleted = false,
  ): Promise<PersonalContact> {
    const { items } = deleted
      ? await this.contactService.listDeletedPersonalContacts(actorId)
      : await this.contactService.listPersonalContacts(actorId)
    const name = selector.contactName?.normalize("NFKC").trim().toLocaleLowerCase()
    const matching = selector.contactId
      ? items.filter((item) => item.id === selector.contactId)
      : name
        ? items.filter(
            (item) => item.name.normalize("NFKC").trim().toLocaleLowerCase() === name,
          )
        : []
    if (matching.length !== 1) {
      throw new AppError(
        "AGENT_PERSONAL_CONTACT_SELECTION_REQUIRED",
        matching.length > 1
          ? "匹配到多个个人联系人，请提供联系人 ID"
          : "未找到唯一匹配的个人联系人，请明确姓名或 ID",
        400,
      )
    }
    return matching[0]
  }

  private async resolveScriptVersionTarget(
    actorId: string,
    teamId: string,
    projectId: string,
    documentId?: string,
    documentTitle?: string,
  ) {
    await this.assertProjectScope(actorId, teamId, projectId)
    let selectedDocumentId = documentId
    if (!selectedDocumentId && documentTitle) {
      const title = documentTitle.normalize("NFKC").trim().toLocaleLowerCase()
      const { documents } = await this.scriptService.listDocuments(actorId, projectId)
      const matching = documents.filter(
        (document) =>
          document.title.normalize("NFKC").trim().toLocaleLowerCase() === title,
      )
      if (matching.length !== 1) {
        throw new AppError(
          "AGENT_SCRIPT_DOCUMENT_SELECTION_REQUIRED",
          matching.length > 1
            ? "匹配到多个脚本文档，请提供文档 ID"
            : "未找到唯一匹配的脚本文档，请明确标题或 ID",
          400,
        )
      }
      selectedDocumentId = matching[0].id
    }
    const workspace = await this.scriptService.getWorkspace(
      actorId,
      projectId,
      selectedDocumentId,
    )
    if (!workspace.permissions.canWrite) {
      throw new AppError("PROJECT_ACCESS_DENIED", "无权修改当前项目脚本", 403)
    }
    const version = workspace.versions.find(
      (item) => item.id === workspace.document.currentVersionId && item.isCurrent,
    )
    if (!version) {
      throw new AppError("SCRIPT_CURRENT_VERSION_NOT_FOUND", "当前脚本版本不存在", 409)
    }
    return {
      document: workspace.document,
      documentId: workspace.document.id,
      version,
      versions: workspace.versions,
    }
  }

  private async requireIntent(actorId: string, commandId: string) {
    const intent = await this.repository.get(actorId, commandId)
    if (!intent) throw new AppError("AGENT_COMMAND_NOT_FOUND", "Agent 命令不存在", 404)
    if (intent.status !== "consumed" && intent.expiresAt <= this.now()) {
      throw new AppError("AGENT_COMMAND_EXPIRED", "Agent 命令已过期，请重新预览", 410)
    }
    return intent
  }

  private toPreview(intent: AgentCommandIntent): AgentPreviewResponse {
    return {
      commandId: intent.id,
      action: intent.action,
      risk: intent.risk,
      summary: intent.summary,
      scope: { teamId: intent.teamId, projectId: intent.projectId },
      requiresConfirmation: intent.risk === "high",
      expiresAt: intent.expiresAt.toISOString(),
    }
  }
}
