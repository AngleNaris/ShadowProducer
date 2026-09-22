"use client"

import type { AuditLog, WorkspaceContext } from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowUpRight, Film, LoaderCircle, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  EmptyState,
  PageFrame,
  SectionHeader,
  WorkspaceHeader,
  workspaceCardGridClassName,
  workspaceInteractiveCardClassName,
} from "@/components/workspace/page-elements"
import type { ProjectId } from "@/components/workspace/workspace-data"
import { onboardingApi, workspaceApi } from "@/lib/api-client"
import { onboardingErrorMessage } from "@/lib/onboarding"
import { cn } from "@/lib/utils"

type WorkspaceTeam = WorkspaceContext["teams"][number]

const activityTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function subjectLabel(item: AuditLog) {
  for (const key of ["title", "name", "label", "fileName"]) {
    const value = item.metadata[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return item.subjectId
}

export function TeamOverview({
  team,
  onProjectChange,
}: {
  team: WorkspaceTeam
  onProjectChange: (projectId: ProjectId) => void
}) {
  const permissionsQuery = useQuery({
    queryKey: ["team-permissions", team.id],
    queryFn: () => workspaceApi.getPermissions(team.id),
  })
  const activitiesQuery = useQuery({
    queryKey: ["team-overview-activities", team.id],
    queryFn: () => workspaceApi.listAuditLogs(team.id, { pageSize: 8 }),
  })
  const projects = team.projects

  const [createOpen, setCreateOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [createError, setCreateError] = useState("")
  const queryClient = useQueryClient()
  const createProjectMutation = useMutation({
    mutationFn: () => {
      const name = projectName.trim()
      if (!name) throw new Error("请输入项目名称")
      return onboardingApi.createProject(team.id, {
        name,
        idempotencyKey: crypto.randomUUID(),
      })
    },
    onSuccess: async ({ item }) => {
      setCreateOpen(false)
      setProjectName("")
      setCreateError("")
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] })
      onProjectChange(item.id)
    },
  })

  const submitCreateProject = () => {
    setCreateError(projectName.trim() ? "" : "请输入项目名称")
    if (!projectName.trim() || createProjectMutation.isPending) return
    createProjectMutation.mutate()
  }

  const openCreateProject = () => {
    setCreateError("")
    setProjectName("")
    setCreateOpen(true)
  }

  const createButton = (
    <Button type="button" onClick={openCreateProject}>
      <Plus />
      新建项目
    </Button>
  )

  return (
    <PageFrame>
      <WorkspaceHeader title="团队概览" />
      <div data-scroll-owner className="min-h-0 flex-1 overflow-auto">
        <section className="border-b border-border">
          <SectionHeader
            title="项目概览"
            detail={`${team.name} · ${projects.length} 个项目`}
            action={createButton}
          />
          <div
            className={cn(
              workspaceCardGridClassName,
              "px-3 pb-4 sm:grid-cols-2 lg:grid-cols-4",
            )}
          >
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onProjectChange(project.id)}
                className={cn(
                  workspaceInteractiveCardClassName,
                  "group p-3 text-left hover:bg-muted/30",
                )}
              >
                <div className="grid aspect-[16/7] place-items-center border border-border bg-muted/45 text-muted-foreground transition-colors group-hover:bg-muted group-focus-visible:bg-muted">
                  <span className="flex items-center gap-2 text-xs">
                    <Film className="size-4" aria-hidden="true" />
                    暂无项目封面
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-semibold">
                      {project.name}
                    </strong>
                    <span className="block truncate text-xs text-muted-foreground">
                      我的角色 · {project.role}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                </div>
              </button>
            ))}
            {!projects.length ? (
              <EmptyState
                title="这个团队还没有项目"
                detail="点击上方「新建项目」立即创建；或等待项目授权后显示在这里。"
                className="sm:col-span-2 lg:col-span-4"
                action={createButton}
              />
            ) : null}
          </div>
        </section>

        <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
          <section className="border-r border-border">
            <SectionHeader
              title="团队中的所有动态"
              detail="每条动态标明项目与业务模块来源"
            />
            <div className="divide-y divide-border">
              {activitiesQuery.isPending ? (
                <EmptyState title="正在载入团队动态" />
              ) : activitiesQuery.isError ? (
                <EmptyState
                  title="团队动态载入失败"
                  detail={activitiesQuery.error.message}
                  action={
                    <Button variant="outline" onClick={() => activitiesQuery.refetch()}>
                      重试
                    </Button>
                  }
                />
              ) : !activitiesQuery.data.items.length ? (
                <EmptyState title="还没有团队动态" />
              ) : null}
              {activitiesQuery.data?.items.map((activity) => (
                <div
                  key={activity.id}
                  className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {subjectLabel(activity)}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {activity.projectName ?? "团队范围"} · {activity.action}
                    </div>
                  </div>
                  <div className="text-left text-xs text-muted-foreground sm:text-right">
                    <div>{activity.actorName}</div>
                    <div>
                      {activityTimeFormatter.format(new Date(activity.createdAt))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <SectionHeader title="团队成员" detail={`${team.memberCount} 位成员`} />
            <div className="divide-y divide-border">
              {permissionsQuery.isPending ? (
                <EmptyState title="正在载入团队成员" />
              ) : permissionsQuery.isError ? (
                <EmptyState
                  title="团队成员载入失败"
                  detail={permissionsQuery.error.message}
                  action={
                    <Button variant="outline" onClick={() => permissionsQuery.refetch()}>
                      重试
                    </Button>
                  }
                />
              ) : !permissionsQuery.data.members.length ? (
                <EmptyState title="还没有团队成员" />
              ) : null}
              {permissionsQuery.data?.members.map((member) => (
                <div key={member.accountId} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-8 place-items-center border border-border bg-muted text-xs font-semibold">
                    {member.displayName.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {member.displayName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {member.role}
                    </span>
                  </span>
                  <span className="max-w-24 truncate text-xs text-muted-foreground">
                    {member.permissionTemplateName ?? `${member.projects.length} 个项目`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && createProjectMutation.isPending) return
          setCreateOpen(open)
          if (open) openCreateProject()
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!createProjectMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>
              项目会创建在当前团队下，创建后你将以项目负责人身份进入项目空间。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="new-project-name" className="text-xs font-medium">
              项目名称
            </label>
            <Input
              id="new-project-name"
              autoFocus
              value={projectName}
              maxLength={80}
              aria-invalid={createError ? true : undefined}
              aria-describedby={createError ? "new-project-name-error" : undefined}
              disabled={createProjectMutation.isPending}
              onChange={(event) => {
                setProjectName(event.target.value)
                if (createError) setCreateError("")
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitCreateProject()
              }}
              placeholder="例如：冬夜咖啡"
            />
            {createError ? (
              <span
                id="new-project-name-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {createError}
              </span>
            ) : null}
            {createProjectMutation.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {onboardingErrorMessage(createProjectMutation.error, "项目创建失败")}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={createProjectMutation.isPending}
              >
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={createProjectMutation.isPending || !projectName.trim()}
              onClick={submitCreateProject}
            >
              {createProjectMutation.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : null}
              {createProjectMutation.isPending ? "正在创建" : "创建项目"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
