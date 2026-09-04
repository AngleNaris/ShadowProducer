"use client"

import type { AuditLog } from "@shadowproducer/contracts"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  ScrollText,
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  DataTableViewport,
  EmptyState,
  PageBody,
  PageFrame,
  WorkspaceHeader,
} from "@/components/workspace/page-elements"
import type { WorkspaceTeam } from "@/components/workspace/workspace-data"
import { workspaceApi } from "@/lib/api-client"

const pageSize = 25
const allProjects = "all"
const teamScope = "team"

function dateBoundary(value: string, end = false) {
  if (!value) return undefined
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`).toISOString()
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
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

export function TeamAudit({ team }: { team: WorkspaceTeam }) {
  const teamId = team.id
  const projects = team.projects
  const [projectFilter, setProjectFilter] = useState(allProjects)
  const [action, setAction] = useState("")
  const [actor, setActor] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [isExporting, setIsExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState<{
    kind: "success" | "error"
    message: string
  } | null>(null)

  const auditQuery = useQuery({
    queryKey: ["team-audit", teamId, projectFilter, action, actor, from, to, page],
    queryFn: () =>
      workspaceApi.listAuditLogs(teamId, {
        page,
        pageSize,
        projectId:
          projectFilter !== allProjects && projectFilter !== teamScope
            ? projectFilter
            : undefined,
        scope: projectFilter === teamScope ? "team" : undefined,
        action: action.trim() || undefined,
        actor: actor.trim() || undefined,
        from: dateBoundary(from),
        to: dateBoundary(to, true),
      }),
    placeholderData: (previous) => previous,
  })

  const projectLabel =
    projectFilter === allProjects
      ? "全部可见范围"
      : projectFilter === teamScope
        ? "仅团队范围"
        : (projects.find((project) => project.id === projectFilter)?.name ?? "项目")
  const total = auditQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const changeProject = (value: string) => {
    setProjectFilter(value)
    setPage(1)
  }

  const resetFilters = () => {
    setProjectFilter(allProjects)
    setAction("")
    setActor("")
    setFrom("")
    setTo("")
    setPage(1)
  }

  const exportData = async () => {
    setIsExporting(true)
    setExportNotice(null)
    try {
      const download = await workspaceApi.downloadDataExport(teamId)
      const url = URL.createObjectURL(download.blob)
      const link = document.createElement("a")
      link.href = url
      link.download = download.fileName
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setExportNotice({ kind: "success", message: `已下载 ${download.fileName}` })
    } catch (error) {
      setExportNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "业务数据导出失败",
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <PageFrame>
      <WorkspaceHeader
        title="审计记录"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={isExporting}
            title="导出当前账号在本团队可见的完整业务数据"
            onClick={() => void exportData()}
          >
            <Download />
            {isExporting ? "正在导出" : "导出可见数据"}
          </Button>
        }
      />
      <PageBody scroll="auto">
        {exportNotice ? (
          <div
            role={exportNotice.kind === "error" ? "alert" : "status"}
            className={
              exportNotice.kind === "error"
                ? "border-b border-destructive/35 bg-destructive/5 px-4 py-2 text-xs text-destructive"
                : "border-b border-border bg-muted/25 px-4 py-2 text-xs text-muted-foreground"
            }
          >
            {exportNotice.message}
          </div>
        ) : null}
        <section
          aria-label="审计筛选"
          className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_160px_160px_44px]"
        >
          <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            <span id="audit-project-filter-label">项目范围</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between text-foreground"
                  aria-labelledby="audit-project-filter-label"
                >
                  <span className="truncate">{projectLabel}</span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                <DropdownMenuRadioGroup
                  value={projectFilter}
                  onValueChange={changeProject}
                >
                  <DropdownMenuRadioItem value={allProjects}>
                    全部可见范围
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={teamScope}>
                    仅团队范围
                  </DropdownMenuRadioItem>
                  {projects.map((project) => (
                    <DropdownMenuRadioItem key={project.id} value={project.id}>
                      {project.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            <label htmlFor="audit-action-filter">动作</label>
            <Input
              id="audit-action-filter"
              value={action}
              onChange={(event) => {
                setAction(event.target.value)
                setPage(1)
              }}
              placeholder="动作名称"
            />
          </div>
          <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            <label htmlFor="audit-actor-filter">操作者</label>
            <Input
              id="audit-actor-filter"
              value={actor}
              onChange={(event) => {
                setActor(event.target.value)
                setPage(1)
              }}
              placeholder="姓名或账号"
            />
          </div>
          <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            <label htmlFor="audit-from-filter">开始日期</label>
            <Input
              id="audit-from-filter"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            <label htmlFor="audit-to-filter">结束日期</label>
            <Input
              id="audit-to-filter"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="重置筛选"
              title="重置筛选"
              onClick={resetFilters}
            >
              <RotateCcw />
            </Button>
          </div>
        </section>

        {auditQuery.isLoading ? (
          <EmptyState title="正在载入审计记录" />
        ) : auditQuery.isError ? (
          <EmptyState
            title="审计记录载入失败"
            detail={auditQuery.error.message}
            action={
              <Button variant="outline" onClick={() => auditQuery.refetch()}>
                重试
              </Button>
            }
          />
        ) : !auditQuery.data?.items.length ? (
          <EmptyState
            icon={<ScrollText className="size-5" />}
            title="没有符合条件的审计记录"
          />
        ) : (
          <DataTableViewport label="团队审计记录" axis="x">
            <table className="w-full min-w-[960px] table-fixed border-collapse text-left">
              <caption className="sr-only">团队审计记录</caption>
              <colgroup>
                <col className="w-[240px]" />
                <col className="w-[190px]" />
                <col className="w-[250px]" />
                <col className="w-[180px]" />
                <col className="w-[190px]" />
              </colgroup>
              <thead>
                <tr className="h-10 border-b border-border bg-muted/35 text-xs text-muted-foreground">
                  <th scope="col" className="px-4 font-medium">
                    动作
                  </th>
                  <th scope="col" className="px-4 font-medium">
                    操作者
                  </th>
                  <th scope="col" className="px-4 font-medium">
                    对象
                  </th>
                  <th scope="col" className="px-4 font-medium">
                    来源范围
                  </th>
                  <th scope="col" className="px-4 font-medium">
                    时间
                  </th>
                </tr>
              </thead>
              <tbody>
                {auditQuery.data.items.map((item) => (
                  <tr key={item.id} className="h-14 border-b border-border text-sm">
                    <td className="truncate px-4 font-mono text-xs" title={item.action}>
                      {item.action}
                    </td>
                    <td className="px-4">
                      <span className="block truncate font-medium">{item.actorName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.actorAccountId ?? item.actorType}
                      </span>
                    </td>
                    <td className="px-4">
                      <span
                        className="block truncate font-medium"
                        title={subjectLabel(item)}
                      >
                        {subjectLabel(item)}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {item.subjectId}
                      </span>
                    </td>
                    <td className="truncate px-4" title={item.projectName ?? "团队范围"}>
                      {item.projectName ?? "团队范围"}
                    </td>
                    <td className="px-4 text-xs text-muted-foreground">
                      {dateTimeFormatter.format(new Date(item.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableViewport>
        )}

        <footer className="flex min-h-14 items-center justify-between gap-3 border-t border-border px-4 text-xs text-muted-foreground">
          <span>{auditQuery.isFetching ? "正在更新" : `共 ${total} 条`}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="上一页"
              title="上一页"
              disabled={page <= 1 || auditQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-16 text-center text-foreground">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="下一页"
              title="下一页"
              disabled={page >= totalPages || auditQuery.isFetching}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </footer>
      </PageBody>
    </PageFrame>
  )
}
