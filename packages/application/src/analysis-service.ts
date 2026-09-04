import type {
  AnalysisJob,
  AnalysisWorkflow,
  CreateScriptBreakdownAnalysisBody,
  PermissionCapability,
  UpdateAnalysisJobBody,
  UpdateAnalysisWorkflowBody,
} from "@shadowproducer/contracts"

import { accessAllows } from "./access"
import { AppError, type ScriptService } from "./script-service"

type AnalysisProjectAccess = { canRead: boolean; canWrite: boolean }
type AnalysisMutation = { job: AnalysisJob; replayed: boolean }
type AnalysisMutationFailure = "not_found" | "conflict" | "invalid_state"
type AnalysisWorkflowMutation = { workflow: AnalysisWorkflow; replayed: boolean }

export type CreateAnalysisJobCommand = CreateScriptBreakdownAnalysisBody & {
  actorId: string
  projectId: string
  sourceDocumentTitle: string
  sourceVersionMeta: string
  sourceContent: string
}

export type UpdateAnalysisJobCommand = UpdateAnalysisJobBody & {
  actorId: string
  projectId: string
  jobId: string
}

export type UpdateAnalysisWorkflowCommand = UpdateAnalysisWorkflowBody & {
  actorId: string
  projectId: string
}

export interface AnalysisJobRepository {
  getProjectAccess(
    actorId: string,
    projectId: string,
  ): Promise<AnalysisProjectAccess | null>
  listJobs(projectId: string): Promise<AnalysisJob[]>
  getWorkflow(projectId: string): Promise<AnalysisWorkflow | null>
  updateWorkflow(
    command: UpdateAnalysisWorkflowCommand,
  ): Promise<AnalysisWorkflowMutation | { kind: "conflict" }>
  createJob(command: CreateAnalysisJobCommand): Promise<AnalysisMutation>
  retryJob(
    command: UpdateAnalysisJobCommand,
  ): Promise<AnalysisMutation | { kind: AnalysisMutationFailure }>
  cancelJob(
    command: UpdateAnalysisJobCommand,
  ): Promise<AnalysisMutation | { kind: AnalysisMutationFailure }>
}

export class AnalysisService {
  constructor(
    private readonly repository: AnalysisJobRepository,
    private readonly scriptService: ScriptService,
  ) {}

  async listJobs(actorId: string, projectId: string) {
    await this.assertProjectAccess(actorId, projectId, "project.read", "read")
    return { items: await this.repository.listJobs(projectId) }
  }

  async getWorkflow(actorId: string, projectId: string): Promise<AnalysisWorkflow> {
    await this.assertProjectAccess(actorId, projectId, "project.read", "read")
    return (
      (await this.repository.getWorkflow(projectId)) ?? {
        projectId,
        enabled: false,
        sourceDocumentId: null,
        triggerKind: "script_version_updated",
        approvalPolicy: "manual_confirmation",
        approvalThreshold: 90,
        configuredByAccountId: null,
        revision: 0,
        createdAt: null,
        updatedAt: null,
      }
    )
  }

  async updateWorkflow(
    actorId: string,
    projectId: string,
    body: UpdateAnalysisWorkflowBody,
  ) {
    await this.assertProjectAccess(actorId, projectId, "production.write", "write")
    if (body.sourceDocumentId) {
      const workspace = await this.scriptService.getWorkspace(
        actorId,
        projectId,
        body.sourceDocumentId,
      )
      if (workspace.document.type !== "script") {
        throw new AppError("ANALYSIS_SCRIPT_REQUIRED", "只能选择脚本文档", 400)
      }
    }
    const result = await this.repository.updateWorkflow({
      actorId,
      projectId,
      ...body,
    })
    if ("kind" in result) {
      throw new AppError(
        "ANALYSIS_WORKFLOW_CONFLICT",
        "自动分析设置已发生变化，请刷新后重试",
        409,
      )
    }
    return result
  }

  async createScriptBreakdown(
    actorId: string,
    projectId: string,
    body: CreateScriptBreakdownAnalysisBody,
  ) {
    await this.assertProjectAccess(actorId, projectId, "production.write", "write")
    const workspace = await this.scriptService.getWorkspace(
      actorId,
      projectId,
      body.documentId,
    )
    if (workspace.document.type !== "script") {
      throw new AppError("ANALYSIS_SCRIPT_REQUIRED", "只能分析脚本文档", 400)
    }
    const version = workspace.versions.find((item) => item.id === body.versionId)
    if (!version) {
      throw new AppError("SCRIPT_VERSION_NOT_FOUND", "脚本版本不存在", 404)
    }
    if (version.revision !== body.sourceRevision) {
      throw new AppError(
        "ANALYSIS_SOURCE_CONFLICT",
        "脚本版本已发生变化，请重新选择分析来源",
        409,
      )
    }
    if (!version.content.trim()) {
      throw new AppError("ANALYSIS_SOURCE_EMPTY", "脚本正文为空，无法开始分析", 400)
    }
    return this.repository.createJob({
      actorId,
      projectId,
      ...body,
      sourceDocumentTitle: workspace.document.title,
      sourceVersionMeta: version.meta,
      sourceContent: version.content,
    })
  }

  async retryJob(command: UpdateAnalysisJobCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "production.write",
      "write",
    )
    return this.unwrapMutation(await this.repository.retryJob(command), "重试")
  }

  async cancelJob(command: UpdateAnalysisJobCommand) {
    await this.assertProjectAccess(
      command.actorId,
      command.projectId,
      "production.write",
      "write",
    )
    return this.unwrapMutation(await this.repository.cancelJob(command), "取消")
  }

  private unwrapMutation(
    result: AnalysisMutation | { kind: AnalysisMutationFailure },
    action: string,
  ) {
    if (!("kind" in result)) return result
    if (result.kind === "not_found") {
      throw new AppError("ANALYSIS_JOB_NOT_FOUND", "分析任务不存在", 404)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "ANALYSIS_JOB_CONFLICT",
        `分析任务已发生变化，请刷新后再${action}`,
        409,
      )
    }
    throw new AppError("ANALYSIS_JOB_INVALID_STATE", `当前任务状态不能${action}`, 409)
  }

  private async assertProjectAccess(
    actorId: string,
    projectId: string,
    capability: PermissionCapability,
    operation: "read" | "write",
  ) {
    const access = await this.repository.getProjectAccess(actorId, projectId)
    if (!access || !accessAllows(access, capability, operation)) {
      throw new AppError("PROJECT_ACCESS_DENIED", "无权访问当前项目", 403)
    }
  }
}
