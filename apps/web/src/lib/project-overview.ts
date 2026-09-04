import type {
  AuditLog,
  CallSheet,
  ExecutionStage,
  ShootingDay,
  WorkspaceContext,
} from "@shadowproducer/contracts"

export type ProjectOverviewTarget =
  | "dashboard"
  | "scripts"
  | "breakdown"
  | "schedule"
  | "reviews"
  | "resources"
  | "portfolio"

export type ProjectOverviewStage = {
  id: string
  label: string
  note: string
  state: "completed" | "active" | "pending" | "paused"
}

export type ProjectOverviewMilestone = {
  id: string
  title: string
  detail: string
  date: string
  state: string
  target: ProjectOverviewTarget
  sortAt: number
}

export type ProjectOverviewActivity = {
  id: string
  title: string
  module: string
  actor: string
  time: string
  target?: ProjectOverviewTarget
}

export type ProjectOverviewModel = {
  projectName: string
  projectStatus: string
  percent: number | null
  currentStage: string
  summary: string
  updatedAt: string
  stages: ProjectOverviewStage[]
  milestones: ProjectOverviewMilestone[]
  activities: ProjectOverviewActivity[]
}

type ProjectRecord = WorkspaceContext["teams"][number]["projects"][number]

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function timestamp(value: string) {
  const result = Date.parse(value)
  return Number.isFinite(result) ? result : 0
}

function formatDateTime(value: string) {
  const valueTime = timestamp(value)
  return valueTime ? dateTimeFormatter.format(new Date(valueTime)) : value
}

function formatCalendarDate(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (parts) return `${Number(parts[2])} 月 ${Number(parts[3])} 日`
  return formatDateTime(value)
}

function stageState(stage: ExecutionStage): ProjectOverviewStage["state"] {
  if (stage.state === "已完成") return "completed"
  if (stage.state === "进行中") return "active"
  if (stage.state === "已暂停") return "paused"
  return "pending"
}

function subjectLabel(item: AuditLog, subjects: Map<string, string>) {
  for (const key of ["title", "name", "label", "fileName", "summary"]) {
    const value = item.metadata[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return subjects.get(item.subjectId) ?? item.subjectId
}

function actionLabel(action: string) {
  const suffix = action.split(".").at(-1)
  const labels: Record<string, string> = {
    created: "已创建",
    updated: "已更新",
    published: "已发布",
    confirmed: "已确认",
    approved: "已批准",
    revoked: "已撤销",
    archived: "已归档",
    restored: "已恢复",
    removed: "已移除",
    moved: "已移动",
    assigned: "已分配",
    processed: "处理完成",
    failed: "处理失败",
    exported: "已导出",
    requested: "已发起",
    verified: "已验证",
  }
  return (suffix && labels[suffix]) || action
}

function activitySource(action: string): {
  module: string
  target?: ProjectOverviewTarget
} {
  if (action.includes("script") || action.includes("storyboard")) {
    return { module: "脚本与分镜", target: "scripts" }
  }
  if (action.includes("breakdown") || action.includes("analysis-job")) {
    return { module: "制片拆解", target: "breakdown" }
  }
  if (
    action.includes("execution-stage") ||
    action.includes("shooting-day") ||
    action.includes("call-sheet")
  ) {
    return { module: "拍摄与通告", target: "schedule" }
  }
  if (action.includes("review")) return { module: "审片", target: "reviews" }
  if (action.includes("asset")) return { module: "团队资源库", target: "resources" }
  if (action.includes("portfolio")) return { module: "作品集", target: "portfolio" }
  if (action.includes("task")) return { module: "任务", target: "dashboard" }
  return { module: "项目" }
}

function shootingMilestones(shootingDays: ShootingDay[], callSheets: CallSheet[]) {
  const sheetsByDay = new Map(
    callSheets
      .filter((item) => item.shootingDayId)
      .map((item) => [item.shootingDayId as string, item]),
  )
  const linkedSheetIds = new Set([...sheetsByDay.values()].map((item) => item.id))
  const days: ProjectOverviewMilestone[] = shootingDays.map((item) => {
    const sheet = sheetsByDay.get(item.id)
    return {
      id: `shooting-day:${item.id}`,
      title: `拍摄日 ${item.dayNumber} · ${item.title}`,
      detail: sheet
        ? `${item.status} · 通告${sheet.status}`
        : `${item.status} · 尚未创建通告`,
      date: formatCalendarDate(item.shootDate),
      state: item.status,
      target: "schedule",
      sortAt: timestamp(item.shootDate),
    }
  })
  const unlinkedSheets: ProjectOverviewMilestone[] = callSheets
    .filter((item) => !linkedSheetIds.has(item.id))
    .map((item) => ({
      id: `call-sheet:${item.id}`,
      title: `通告 · ${item.title}`,
      detail: item.crewCall ? `${item.status} · 集合 ${item.crewCall}` : item.status,
      date: formatCalendarDate(item.date),
      state: item.status,
      target: "schedule",
      sortAt: timestamp(item.date),
    }))
  return [...days, ...unlinkedSheets]
}

function stageMilestones(stages: ExecutionStage[]): ProjectOverviewMilestone[] {
  return stages.map((item) => ({
    id: `execution-stage:${item.id}`,
    title: `执行阶段 · ${item.name}`,
    detail: item.note || `${item.owner}负责 · ${item.progress}%`,
    date: formatCalendarDate(item.endsAt),
    state: item.state,
    target: "schedule",
    sortAt: timestamp(item.endsAt),
  }))
}

export function buildProjectOverview(input: {
  project: ProjectRecord
  stages: ExecutionStage[]
  shootingDays: ShootingDay[]
  callSheets: CallSheet[]
  auditLogs: AuditLog[]
}): ProjectOverviewModel {
  const stages = [...input.stages].sort(
    (left, right) => timestamp(left.startsAt) - timestamp(right.startsAt),
  )
  const activeStage = stages.find((item) => item.state === "进行中")
  const nextStage = stages.find((item) => item.state !== "已完成")
  const completedStages = stages.filter((item) => item.state === "已完成").length
  const pendingShootingDays = input.shootingDays.filter(
    (item) => item.status !== "已完成" && item.status !== "已取消",
  ).length
  const unpublishedCallSheets = input.callSheets.filter(
    (item) => item.status !== "已发布",
  ).length
  const percent = stages.length
    ? Math.round(stages.reduce((total, item) => total + item.progress, 0) / stages.length)
    : null
  const milestones = shootingMilestones(input.shootingDays, input.callSheets)
  const milestoneSource = milestones.length ? milestones : stageMilestones(stages)
  const subjects = new Map<string, string>([
    ...stages.map((item) => [item.id, item.name] as const),
    ...input.shootingDays.map((item) => [item.id, item.title] as const),
    ...input.callSheets.map((item) => [item.id, item.title] as const),
  ])
  const updates = [
    input.project.updatedAt,
    ...stages.map((item) => item.updatedAt),
    ...input.shootingDays.map((item) => item.updatedAt),
    ...input.callSheets.map((item) => item.updatedAt),
    ...input.auditLogs.map((item) => item.createdAt),
  ]
  const latestUpdate = updates.reduce((latest, item) =>
    timestamp(item) > timestamp(latest) ? item : latest,
  )

  return {
    projectName: input.project.name,
    projectStatus: input.project.status,
    percent,
    currentStage:
      activeStage?.name ??
      nextStage?.name ??
      (stages.length ? "执行计划已完成" : input.project.status),
    summary: stages.length
      ? `${completedStages} / ${stages.length} 个执行阶段已完成，${pendingShootingDays} 个拍摄日待执行，${unpublishedCallSheets} 份通告待发布。`
      : `项目状态为${input.project.status}，尚未建立执行计划。`,
    updatedAt: formatDateTime(latestUpdate),
    stages: stages.map((item) => ({
      id: item.id,
      label: item.name,
      note: `${item.state} · ${item.progress}%`,
      state: stageState(item),
    })),
    milestones: milestoneSource
      .sort((left, right) => left.sortAt - right.sortAt)
      .slice(0, 8),
    activities: [...input.auditLogs]
      .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
      .slice(0, 12)
      .map((item) => {
        const source = activitySource(item.action)
        return {
          id: item.id,
          title: `${actionLabel(item.action)} · ${subjectLabel(item, subjects)}`,
          module: source.module,
          actor: item.actorName,
          time: formatDateTime(item.createdAt),
          target: source.target,
        }
      }),
  }
}
