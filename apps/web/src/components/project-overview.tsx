"use client"

import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  Circle,
  Clock3,
  FileText,
  MessageSquare,
  Pause,
  ScrollText,
} from "lucide-react"
import { motion } from "motion/react"

import { Button } from "@/components/ui/button"
import {
  EmptyState,
  PageBody,
  PaneHeader,
  StatusBadge,
  type StatusTone,
} from "@/components/workspace/page-elements"
import type {
  ProjectId,
  TeamId,
  WorkspaceView,
} from "@/components/workspace/workspace-data"
import { productionApi, workspaceApi } from "@/lib/api-client"
import { buildProjectOverview, type ProjectOverviewTarget } from "@/lib/project-overview"
import { cn } from "@/lib/utils"

type ProjectOverviewProps = {
  teamId: TeamId
  projectId: ProjectId
  onNavigate: (view: WorkspaceView) => void
}

const stateTone: Record<string, StatusTone> = {
  已完成: "success",
  已发布: "success",
  进行中: "primary",
  拍摄中: "primary",
  待确认: "warning",
  草稿: "warning",
  已暂停: "warning",
  已取消: "danger",
  未开始: "neutral",
}

function sourceIcon(target?: ProjectOverviewTarget) {
  if (target === "reviews") return MessageSquare
  if (target === "scripts") return FileText
  if (target === "schedule") return CalendarDays
  return Circle
}

export function ProjectOverview({ teamId, projectId, onNavigate }: ProjectOverviewProps) {
  const overviewQuery = useQuery({
    queryKey: ["project-overview", teamId, projectId],
    queryFn: async () => {
      const [context, execution, shootingDays, callSheets, auditLogs] = await Promise.all(
        [
          workspaceApi.getContext(),
          productionApi.listExecutionSchedule(projectId),
          productionApi.listShootingDays(projectId),
          productionApi.listCallSheets(projectId),
          workspaceApi.listAuditLogs(teamId, { projectId, page: 1, pageSize: 12 }),
        ],
      )
      const project = context.teams
        .find((team) => team.id === teamId)
        ?.projects.find((item) => item.id === projectId)
      if (!project) throw new Error("当前账号无权访问该项目，或项目已不存在。")
      return buildProjectOverview({
        project,
        stages: execution.items,
        shootingDays: shootingDays.items,
        callSheets: callSheets.items,
        auditLogs: auditLogs.items,
      })
    },
  })

  if (overviewQuery.isLoading) {
    return (
      <motion.section key={projectId} className="flex min-h-0 min-w-0 flex-1">
        <PageBody scroll="y">
          <EmptyState title="正在载入项目进度与动态" className="min-h-full" />
        </PageBody>
      </motion.section>
    )
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <motion.section key={projectId} className="flex min-h-0 min-w-0 flex-1">
        <PageBody scroll="y">
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="项目概览载入失败"
            detail={overviewQuery.error?.message ?? "未能读取项目数据"}
            className="min-h-full"
            action={
              <Button variant="outline" onClick={() => overviewQuery.refetch()}>
                重试
              </Button>
            }
          />
        </PageBody>
      </motion.section>
    )
  }

  const profile = overviewQuery.data

  return (
    <motion.section
      key={projectId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="flex min-h-0 min-w-0 flex-1"
    >
      <PageBody
        scroll="y"
        className="grid lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)] lg:overflow-hidden"
      >
        <section
          aria-labelledby="project-progress-title"
          data-scroll-owner
          className="min-w-0 border-b border-border lg:overflow-y-auto lg:border-r lg:border-b-0"
        >
          <PaneHeader
            title="项目进度"
            titleId="project-progress-title"
            description={`最近更新 · ${profile.updatedAt}`}
            action={
              <StatusBadge tone="primary" className="text-xs">
                {profile.currentStage}
              </StatusBadge>
            }
          />

          <div className="border-b border-border p-4 sm:p-5">
            <div className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-end">
              <div>
                <div className="font-mono text-4xl font-semibold text-primary">
                  {profile.percent === null ? "--" : `${profile.percent}%`}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">整体完成度</div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium">当前阶段 · {profile.currentStage}</span>
                  <span className="text-muted-foreground">
                    {profile.percent === null ? "尚未设置" : `${profile.percent} / 100`}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden bg-muted"
                  role="progressbar"
                  aria-label="项目整体完成度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={profile.percent ?? undefined}
                  aria-valuetext={profile.percent === null ? "尚未设置" : undefined}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${profile.percent ?? 0}%` }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="h-full bg-primary"
                  />
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {profile.summary}
                </p>
              </div>
            </div>
          </div>

          <div className="border-b border-border">
            <div className="flex h-11 items-center px-4 text-xs font-semibold sm:px-5">
              阶段链
            </div>
            {profile.stages.length ? (
              <div className="overflow-x-auto px-4 pb-5 sm:px-5">
                <div
                  className="grid min-w-max border-y border-border"
                  style={{
                    gridTemplateColumns: `repeat(${profile.stages.length}, minmax(148px, 1fr))`,
                  }}
                >
                  {profile.stages.map((stage, index) => (
                    <div
                      key={stage.id}
                      className={cn(
                        "relative min-h-24 border-r border-border p-3 last:border-r-0",
                        stage.state === "active" && "bg-primary/6",
                      )}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <span
                          className={cn(
                            "grid size-5 place-items-center border text-xs",
                            stage.state === "completed" &&
                              "border-positive bg-positive text-positive-foreground",
                            stage.state === "active" &&
                              "border-primary bg-primary text-primary-foreground",
                            stage.state === "paused" &&
                              "border-support bg-support/10 text-support",
                            stage.state === "pending" &&
                              "border-border bg-background text-muted-foreground",
                          )}
                        >
                          {stage.state === "completed" ? (
                            <Check className="size-3" />
                          ) : stage.state === "paused" ? (
                            <Pause className="size-3" />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="text-xs font-semibold">{stage.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{stage.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<CalendarDays className="size-5" />}
                title="尚未建立执行计划"
                detail="在拍摄与通告中创建阶段后，这里会显示真实进度。"
              />
            )}
          </div>

          <div>
            <div className="flex h-11 items-center px-4 text-xs font-semibold sm:px-5">
              关键节点
            </div>
            {profile.milestones.length ? (
              <div className="divide-y divide-border border-t border-border">
                {profile.milestones.map((milestone) => (
                  <button
                    key={milestone.id}
                    type="button"
                    onClick={() => onNavigate(milestone.target)}
                    className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:grid-cols-[minmax(0,1fr)_100px_84px_24px] sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium">
                        {milestone.title}
                      </span>
                      <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                        {milestone.detail}
                      </span>
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {milestone.date}
                    </span>
                    <StatusBadge
                      tone={stateTone[milestone.state] ?? "neutral"}
                      className="justify-self-end"
                    >
                      {milestone.state}
                    </StatusBadge>
                    <ArrowUpRight className="hidden size-4 text-muted-foreground sm:block" />
                    <span className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
                      <Clock3 className="size-3" />
                      {milestone.date}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<CalendarDays className="size-5" />}
                title="暂无关键节点"
                detail="拍摄日、通告或执行阶段会在这里按日期汇总。"
              />
            )}
          </div>
        </section>

        <section
          aria-labelledby="project-activity-title"
          data-scroll-owner
          className="min-w-0 bg-muted/20 lg:overflow-y-auto"
        >
          <PaneHeader
            title="动态追踪"
            titleId="project-activity-title"
            description="每条动态均保留来源、操作者与时间"
          />

          {profile.activities.length ? (
            <div className="divide-y divide-border bg-background">
              {profile.activities.map((activity) => {
                const SourceIcon = sourceIcon(activity.target)
                return (
                  <button
                    key={activity.id}
                    type="button"
                    disabled={!activity.target}
                    onClick={() => activity.target && onNavigate(activity.target)}
                    className={cn(
                      "grid min-h-24 w-full grid-cols-[32px_minmax(0,1fr)] gap-3 px-4 py-4 text-left sm:px-5",
                      activity.target
                        ? "hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                        : "cursor-default",
                    )}
                  >
                    <span className="grid size-8 place-items-center border border-border bg-muted text-muted-foreground">
                      <SourceIcon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-5">
                        {activity.title}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-primary">
                          来源 / {activity.module}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{activity.actor}</span>
                        <span aria-hidden="true">·</span>
                        <span>{activity.time}</span>
                        {activity.target ? (
                          <ArrowUpRight className="ml-auto size-3.5" />
                        ) : null}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={<ScrollText className="size-5" />}
              title="暂无项目动态"
              detail="项目中的写操作会在这里保留来源、操作者与时间。"
            />
          )}
        </section>
      </PageBody>
    </motion.section>
  )
}
