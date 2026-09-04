import {
  type BreakdownItem,
  type CreateScriptCommentBody,
  type CreateScriptCommentResponse,
  type CreateScriptDocumentBody,
  type CreateScriptDocumentResponse,
  type CreateScriptVersionBody,
  type CreateScriptVersionResponse,
  parseStoryboardContentJson,
  type ScriptDocument,
  type ScriptDocumentList,
  type ScriptVersionImpact,
  type ScriptWorkspace,
  type UpdateScriptCommentBody,
  type UpdateScriptCommentResponse,
  type UpdateScriptVersionBody,
  type UpdateScriptVersionResponse,
} from "@shadowproducer/contracts"

import { accessAllows } from "./access"

export type ProjectAccess = {
  canRead: boolean
  canWrite: boolean
}

export type UpdateVersionCommand = UpdateScriptVersionBody & {
  actorId: string
  projectId: string
  versionId: string
}

export type CreateDocumentCommand = CreateScriptDocumentBody & {
  actorId: string
  projectId: string
}

export type CreateVersionCommand = CreateScriptVersionBody & {
  actorId: string
  projectId: string
}

export type CreateCommentCommand = CreateScriptCommentBody & {
  actorId: string
  projectId: string
}

export type UpdateCommentCommand = UpdateScriptCommentBody & {
  actorId: string
  projectId: string
  commentId: string
}

export type ScriptWorkspaceData = Omit<
  ScriptWorkspace,
  "currentAccountId" | "permissions"
>

type RawLineChange = {
  fromStart: number
  fromEnd: number
  toStart: number
  toEnd: number
}

const maxDiffCells = 2_000_000

function parseSourceLineRange(sourceLocation: string) {
  const match = sourceLocation.match(/^\s*第\s*(\d+)\s*(?:[-–—至~～]\s*(\d+)\s*)?行\s*$/)
  if (!match) return null
  const startLine = Number(match[1])
  const endLine = Number(match[2] ?? match[1])
  return startLine <= endLine ? { startLine, endLine } : null
}

function diffScriptLines(fromContent: string, toContent: string) {
  const fromLines = fromContent.split(/\r?\n/)
  const toLines = toContent.split(/\r?\n/)
  if (
    fromLines.length === toLines.length &&
    fromLines.every((line, index) => line === toLines[index])
  ) {
    return { changes: [] as ScriptVersionImpact["changes"], limited: false }
  }

  let prefix = 0
  while (
    prefix < fromLines.length &&
    prefix < toLines.length &&
    fromLines[prefix] === toLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < fromLines.length - prefix &&
    suffix < toLines.length - prefix &&
    fromLines[fromLines.length - suffix - 1] === toLines[toLines.length - suffix - 1]
  ) {
    suffix += 1
  }

  const fromMiddle = fromLines.slice(prefix, fromLines.length - suffix)
  const toMiddle = toLines.slice(prefix, toLines.length - suffix)
  const broadChange: RawLineChange = {
    fromStart: prefix,
    fromEnd: fromLines.length - suffix,
    toStart: prefix,
    toEnd: toLines.length - suffix,
  }
  let rawChanges: RawLineChange[]
  let limited = false

  if (!fromMiddle.length || !toMiddle.length) {
    rawChanges = [broadChange]
  } else if ((fromMiddle.length + 1) * (toMiddle.length + 1) > maxDiffCells) {
    // ponytail: quadratic LCS is capped; use a proven diff engine if real scripts exceed it.
    rawChanges = [broadChange]
    limited = true
  } else {
    const width = toMiddle.length + 1
    const table = new Uint32Array((fromMiddle.length + 1) * width)
    for (let fromIndex = fromMiddle.length - 1; fromIndex >= 0; fromIndex -= 1) {
      for (let toIndex = toMiddle.length - 1; toIndex >= 0; toIndex -= 1) {
        const index = fromIndex * width + toIndex
        table[index] =
          fromMiddle[fromIndex] === toMiddle[toIndex]
            ? table[(fromIndex + 1) * width + toIndex + 1] + 1
            : Math.max(table[(fromIndex + 1) * width + toIndex], table[index + 1])
      }
    }

    rawChanges = []
    let fromIndex = 0
    let toIndex = 0
    let active: RawLineChange | null = null
    const flush = () => {
      if (!active) return
      rawChanges.push(active)
      active = null
    }

    while (fromIndex < fromMiddle.length || toIndex < toMiddle.length) {
      if (
        fromIndex < fromMiddle.length &&
        toIndex < toMiddle.length &&
        fromMiddle[fromIndex] === toMiddle[toIndex]
      ) {
        flush()
        fromIndex += 1
        toIndex += 1
        continue
      }

      active ??= {
        fromStart: prefix + fromIndex,
        fromEnd: prefix + fromIndex,
        toStart: prefix + toIndex,
        toEnd: prefix + toIndex,
      }
      if (
        toIndex < toMiddle.length &&
        (fromIndex === fromMiddle.length ||
          table[fromIndex * width + toIndex + 1] >=
            table[(fromIndex + 1) * width + toIndex])
      ) {
        toIndex += 1
        active.toEnd = prefix + toIndex
      } else {
        fromIndex += 1
        active.fromEnd = prefix + fromIndex
      }
    }
    flush()
  }

  return {
    limited,
    changes: rawChanges.map((change, index) => {
      const hasFrom = change.fromStart < change.fromEnd
      const hasTo = change.toStart < change.toEnd
      return {
        id: `change-${index + 1}`,
        kind: hasFrom && hasTo ? "modified" : hasTo ? "added" : "removed",
        from: {
          startLine: hasFrom ? change.fromStart + 1 : null,
          endLine: hasFrom ? change.fromEnd : null,
          text: fromLines.slice(change.fromStart, change.fromEnd).join("\n"),
        },
        to: {
          startLine: hasTo ? change.toStart + 1 : null,
          endLine: hasTo ? change.toEnd : null,
          text: toLines.slice(change.toStart, change.toEnd).join("\n"),
        },
      } satisfies ScriptVersionImpact["changes"][number]
    }),
  }
}

export interface ScriptRepository {
  getProjectAccess(actorId: string, projectId: string): Promise<ProjectAccess | null>
  listDocuments(projectId: string): Promise<ScriptDocument[]>
  getWorkspace(
    projectId: string,
    documentId?: string,
  ): Promise<ScriptWorkspaceData | null>
  createDocument(command: CreateDocumentCommand): Promise<CreateScriptDocumentResponse>
  updateVersion(
    command: UpdateVersionCommand,
  ): Promise<UpdateScriptVersionResponse | null>
  createVersion(
    command: CreateVersionCommand,
  ): Promise<CreateScriptVersionResponse | null>
  createComment(
    command: CreateCommentCommand,
  ): Promise<CreateScriptCommentResponse | null>
  updateComment(
    command: UpdateCommentCommand,
  ): Promise<UpdateScriptCommentResponse | null>
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly retryable = false,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class ScriptService {
  constructor(private readonly repository: ScriptRepository) {}

  async listDocuments(actorId: string, projectId: string): Promise<ScriptDocumentList> {
    const access = await this.assertAccess(actorId, projectId, "read")
    return {
      projectId,
      documents: await this.repository.listDocuments(projectId),
      permissions: { canWrite: access.canWrite },
    }
  }

  async getWorkspace(actorId: string, projectId: string, documentId?: string) {
    const access = await this.assertAccess(actorId, projectId, "read")
    const workspace = await this.repository.getWorkspace(projectId, documentId)
    if (!workspace) {
      throw new AppError("SCRIPT_DOCUMENT_NOT_FOUND", "脚本文档不存在", 404)
    }
    return {
      ...workspace,
      currentAccountId: actorId,
      permissions: { canWrite: access.canWrite },
    }
  }

  async createDocument(command: CreateDocumentCommand) {
    await this.assertAccess(command.actorId, command.projectId, "write")
    const title = command.title.trim()
    if (!title)
      throw new AppError("SCRIPT_DOCUMENT_TITLE_REQUIRED", "请输入文档标题", 400)
    return this.repository.createDocument({ ...command, title })
  }

  async getVersionImpact(
    actorId: string,
    projectId: string,
    fromVersionId: string,
    toVersionId: string,
    breakdownItems: BreakdownItem[],
    documentId?: string,
  ): Promise<ScriptVersionImpact> {
    if (fromVersionId === toVersionId) {
      throw new AppError("SCRIPT_VERSION_PAIR_REQUIRED", "请选择两个不同的脚本版本", 400)
    }
    const workspace = await this.getWorkspace(actorId, projectId, documentId)
    const fromVersion = workspace.versions.find((item) => item.id === fromVersionId)
    const toVersion = workspace.versions.find((item) => item.id === toVersionId)
    if (!fromVersion || !toVersion) {
      throw new AppError("SCRIPT_VERSION_NOT_FOUND", "脚本版本不存在", 404)
    }

    const diff = diffScriptLines(fromVersion.content, toVersion.content)
    const changedBaselineRanges = diff.changes.flatMap((change) =>
      change.from.startLine === null || change.from.endLine === null
        ? []
        : [{ startLine: change.from.startLine, endLine: change.from.endLine }],
    )
    const formalBaselineItems = breakdownItems.filter(
      (item) =>
        item.projectId === projectId &&
        item.sourceVersion === fromVersionId &&
        item.state !== "待确认" &&
        item.state !== "已取消",
    )
    const affectedBreakdownItems: BreakdownItem[] = []
    const manualReviewBreakdownItems: BreakdownItem[] = []
    for (const item of formalBaselineItems) {
      const sourceRange = parseSourceLineRange(item.sourceLocation)
      if (!sourceRange) {
        manualReviewBreakdownItems.push(item)
      } else if (
        changedBaselineRanges.some(
          (change) =>
            sourceRange.startLine <= change.endLine &&
            sourceRange.endLine >= change.startLine,
        )
      ) {
        affectedBreakdownItems.push(item)
      }
    }
    return {
      fromVersion: {
        id: fromVersion.id,
        meta: fromVersion.meta,
        updatedAt: fromVersion.updatedAt,
      },
      toVersion: {
        id: toVersion.id,
        meta: toVersion.meta,
        updatedAt: toVersion.updatedAt,
      },
      generatedAt: new Date().toISOString(),
      processingStatus:
        diff.limited || manualReviewBreakdownItems.length ? "limited" : "complete",
      changes: diff.changes,
      affectedBreakdownItems,
      manualReviewBreakdownItems,
      affectedShootingDayIds: [
        ...new Set(affectedBreakdownItems.flatMap((item) => item.shootingDayIds)),
      ],
      affectedCallSheetIds: [
        ...new Set(affectedBreakdownItems.flatMap((item) => item.callSheetIds)),
      ],
      coverageLimitations: [
        "仅使用基线版本的结构化来源行与逐行变更重叠关系，不使用关键词或语义推断。",
        "无法解析来源行的正式拆解项单列人工核对，不计入确定受影响结果。",
        "拍摄日与通告仅通过受影响拆解项的现有关联汇总；分镜镜头仍缺少稳定来源锚点。",
      ],
    }
  }

  async updateVersion(command: UpdateVersionCommand) {
    await this.assertAccess(command.actorId, command.projectId, "write")
    const documentId = await this.resolveWritableDocument(
      command.projectId,
      command.documentId,
      command.content,
    )
    const result = await this.repository.updateVersion({ ...command, documentId })
    if (!result) {
      throw new AppError(
        "VERSION_CONFLICT",
        "脚本已被其他协作者更新，请重新载入后再继续编辑",
        409,
      )
    }
    return result
  }

  async createVersion(command: CreateVersionCommand) {
    await this.assertAccess(command.actorId, command.projectId, "write")
    if (!command.meta.trim()) {
      throw new AppError("VERSION_META_REQUIRED", "请填写版本说明", 400)
    }
    const documentId = await this.resolveWritableDocument(
      command.projectId,
      command.documentId,
      command.content,
    )
    const result = await this.repository.createVersion({ ...command, documentId })
    if (!result) {
      throw new AppError(
        "VERSION_CONFLICT",
        "当前协作稿已发生变化，请基于最新版本重新创建",
        409,
      )
    }
    return result
  }

  async createComment(command: CreateCommentCommand) {
    await this.assertAccess(command.actorId, command.projectId, "write")
    if (!command.text.trim()) {
      throw new AppError("COMMENT_TEXT_REQUIRED", "请输入评论内容", 400)
    }
    const documentId = await this.resolveDocumentId(command.projectId, command.documentId)
    const result = await this.repository.createComment({
      ...command,
      documentId,
      parentId: command.parentId ?? null,
      text: command.text.trim(),
    })
    if (!result) {
      throw new AppError("SCRIPT_VERSION_NOT_FOUND", "脚本版本不存在", 404)
    }
    return result
  }

  async updateComment(command: UpdateCommentCommand) {
    await this.assertAccess(command.actorId, command.projectId, "write")
    const documentId = await this.resolveDocumentId(command.projectId, command.documentId)
    const result = await this.repository.updateComment({ ...command, documentId })
    if (!result) {
      throw new AppError(
        "COMMENT_CONFLICT",
        "评论状态已被其他协作者更新，请刷新后重试",
        409,
      )
    }
    return result
  }

  private async resolveDocumentId(projectId: string, documentId?: string) {
    const workspace = await this.repository.getWorkspace(projectId, documentId)
    if (!workspace) {
      throw new AppError("SCRIPT_DOCUMENT_NOT_FOUND", "脚本文档不存在", 404)
    }
    return workspace.document.id
  }

  private async resolveWritableDocument(
    projectId: string,
    documentId: string | undefined,
    content: string,
  ) {
    const workspace = await this.repository.getWorkspace(projectId, documentId)
    if (!workspace) {
      throw new AppError("SCRIPT_DOCUMENT_NOT_FOUND", "脚本文档不存在", 404)
    }
    if (
      workspace.document.type === "storyboard" &&
      !parseStoryboardContentJson(content)
    ) {
      throw new AppError("STORYBOARD_CONTENT_INVALID", "分镜数据格式无效", 400)
    }
    return workspace.document.id
  }

  private async assertAccess(
    actorId: string,
    projectId: string,
    operation: "read" | "write",
  ) {
    const access = await this.repository.getProjectAccess(actorId, projectId)
    const allowed = accessAllows(
      access,
      operation === "read" ? "project.read" : "script.write",
      operation,
    )
    if (!access || !allowed) {
      throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
    }
    return access
  }
}
