"use client"

import type {
  CalendarEvent,
  TaskStatus,
  UpdateWorkspaceNoteBody,
  WorkspaceNote,
  WorkspaceTask,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  StickyNote,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { IconButton } from "@/components/workspace/icon-button"
import {
  DataTableViewport,
  EmptyState,
  PageFrame,
  SectionHeader,
  WorkspaceHeader,
  WorkspaceListPane,
} from "@/components/workspace/page-elements"
import {
  isWorkspaceView,
  type ProjectId,
  type TeamId,
  type WorkspaceProject,
  type WorkspaceView,
} from "@/components/workspace/workspace-data"
import { ApiError, workspaceApi } from "@/lib/api-client"
import { cn } from "@/lib/utils"

const taskStatuses: TaskStatus[] = ["待开始", "进行中", "等待他人", "已完成"]
const workspaceTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"

function requestKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function dateKey(date: Date, timeZone = workspaceTimeZone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function timeLabel(date: Date, allDay: boolean, timeZone = workspaceTimeZone) {
  if (allDay) return "全天"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
}

function mutationError(error: unknown) {
  return error instanceof ApiError ? error.message : "操作失败，请稍后重试"
}

function updateCachedItem<T extends { id: string }>(
  queryClient: ReturnType<typeof useQueryClient>,
  key: readonly string[],
  item: T,
) {
  queryClient.setQueryData<{ items: T[] }>(key, (current) => ({
    items: current?.items.map((candidate) =>
      candidate.id === item.id ? item : candidate,
    ) ?? [item],
  }))
}

function removeCachedItem<T extends { id: string }>(
  queryClient: ReturnType<typeof useQueryClient>,
  key: readonly string[],
  id: string,
) {
  queryClient.setQueryData<{ items: T[] }>(key, (current) => ({
    items: current?.items.filter((candidate) => candidate.id !== id) ?? [],
  }))
}

function DataLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      title="数据暂时无法载入"
      detail={message}
      action={
        <Button variant="outline" onClick={onRetry}>
          重新载入
        </Button>
      }
    />
  )
}

function TaskEditorDialog({
  open,
  onOpenChange,
  task,
  teamId,
  projects,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: WorkspaceTask | null
  teamId: TeamId
  projects: WorkspaceProject[]
  onSaved: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ["workspace-tasks", teamId] as const
  const [title, setTitle] = useState("")
  const [projectId, setProjectId] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [status, setStatus] = useState<TaskStatus>("待开始")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? "")
    setProjectId(task?.projectId ?? projects[0]?.id ?? "")
    setDueDate(task?.dueDate ?? "")
    setStatus(task?.status ?? "待开始")
    setError("")
  }, [open, task, projects])

  const mutation = useMutation({
    mutationFn: async () => {
      if (task) {
        return workspaceApi.updateTask(teamId, task.id, {
          title: title.trim(),
          dueDate: dueDate || null,
          status,
          expectedRevision: task.revision,
        })
      }
      const result = await workspaceApi.createTask(teamId, {
        title: title.trim(),
        projectId: projectId || undefined,
        dueDate: dueDate || null,
        status,
        target: "project",
        idempotencyKey: requestKey("task"),
      })
      return result.item
    },
    onSuccess: (item) => {
      if (task) updateCachedItem(queryClient, queryKey, item)
      else {
        queryClient.setQueryData<{ items: WorkspaceTask[] }>(queryKey, (current) => ({
          items: [item, ...(current?.items ?? [])],
        }))
      }
      onSaved(task ? "任务已更新" : "任务已创建")
      onOpenChange(false)
    },
    onError: (cause) => {
      setError(mutationError(cause))
      if (cause instanceof ApiError && cause.code === "RESOURCE_CONFLICT") {
        void queryClient.invalidateQueries({ queryKey })
      }
    },
  })

  const selectedProject = projects.find((project) => project.id === projectId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "编辑任务" : "新建任务"}</DialogTitle>
          <DialogDescription>
            任务只显示在当前团队与当前账号的工作台中。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            aria-label="任务名称"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="任务名称"
          />
          {!task ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {selectedProject?.name ?? "不关联项目"}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={() => setProjectId(project.id)}
                  >
                    {projectId === project.id ? <Check /> : <span className="size-4" />}
                    {project.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Input
            type="date"
            aria-label="任务截止日期"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {status}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
              {taskStatuses.map((candidate) => (
                <DropdownMenuItem key={candidate} onSelect={() => setStatus(candidate)}>
                  {candidate === status ? <Check /> : <span className="size-4" />}
                  {candidate}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!title.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "保存中" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PersonalDashboard({
  teamId,
  projects,
  onNavigate,
  onOpenProjectView,
}: {
  teamId: TeamId
  projects: WorkspaceProject[]
  onNavigate: (view: WorkspaceView) => void
  onOpenProjectView: (projectId: ProjectId, view: WorkspaceView) => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ["workspace-tasks", teamId] as const
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<WorkspaceTask | null>(null)
  const [feedback, setFeedback] = useState("")
  const [deleteTask, setDeleteTask] = useState<WorkspaceTask | null>(null)
  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => workspaceApi.listTasks(teamId),
  })

  const updateMutation = useMutation({
    mutationFn: ({ task, status }: { task: WorkspaceTask; status: TaskStatus }) =>
      workspaceApi.updateTask(teamId, task.id, {
        status,
        expectedRevision: task.revision,
      }),
    onSuccess: (item) => {
      updateCachedItem(queryClient, queryKey, item)
      setFeedback(`任务已移至“${item.status}”`)
    },
    onError: (cause) => {
      setFeedback(mutationError(cause))
      if (cause instanceof ApiError && cause.code === "RESOURCE_CONFLICT") {
        void tasksQuery.refetch()
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (task: WorkspaceTask) =>
      workspaceApi.deleteTask(teamId, task.id, task.revision),
    onSuccess: ({ id }) => {
      removeCachedItem<WorkspaceTask>(queryClient, queryKey, id)
      setDeleteTask(null)
      setFeedback("任务已删除")
    },
    onError: (cause) => setFeedback(mutationError(cause)),
  })

  const tasks = tasksQuery.data?.items ?? []

  const openTaskTarget = (task: WorkspaceTask) => {
    const target = isWorkspaceView(task.target) ? task.target : "project"
    if (task.projectId) {
      onOpenProjectView(task.projectId, target)
    } else {
      onNavigate(target)
    }
  }

  return (
    <PageFrame className="bg-workspace">
      <ScrollArea
        type="always"
        className="min-h-0 min-w-0 flex-1"
        viewportClassName="[&>div]:!block [&>div]:w-full [&>div]:min-w-0"
      >
        <div className="space-y-3">
          <WorkspaceHeader
            title="繁星，下午好"
            variant="compact"
            actions={
              <Button
                size="sm"
                onClick={() => {
                  setEditingTask(null)
                  setEditorOpen(true)
                }}
              >
                <Plus />
                新建任务
              </Button>
            }
          />
          <section className="border border-border bg-background">
            <SectionHeader
              title="我的任务"
              detail={`${tasks.length} 项与当前团队相关的工作`}
              action={
                feedback ? (
                  <span role="status" className="text-xs text-muted-foreground">
                    {feedback}
                  </span>
                ) : undefined
              }
            />
            {tasksQuery.isError ? (
              <DataLoadError
                message={mutationError(tasksQuery.error)}
                onRetry={() => void tasksQuery.refetch()}
              />
            ) : (
              <ScrollArea
                type="always"
                scrollbars="horizontal"
                className="min-w-0 w-full"
              >
                <div className="grid min-h-[17rem] min-w-[900px] grid-cols-4 divide-x divide-border">
                  {taskStatuses.map((status) => {
                    const laneTasks = tasks.filter((task) => task.status === status)
                    return (
                      <div key={status} className="flex min-h-0 flex-col bg-muted/20 p-3">
                        <div className="mb-3 flex shrink-0 items-center justify-between text-xs font-semibold">
                          <span>{status}</span>
                          <span className="text-muted-foreground">
                            {tasksQuery.isLoading ? "…" : laneTasks.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {laneTasks.map((task) => (
                            <article
                              key={task.id}
                              className="group relative border border-border bg-background transition-colors hover:border-primary hover:bg-primary/4"
                            >
                              <button
                                type="button"
                                onClick={() => openTaskTarget(task)}
                                className="w-full p-3 pr-12 text-left"
                              >
                                <strong className="block text-sm font-medium leading-5">
                                  {task.title}
                                </strong>
                                <span className="mt-2 block text-xs text-muted-foreground">
                                  {task.projectName ?? "个人任务"}
                                </span>
                                <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span>{task.assigneeName}</span>
                                  <span className="flex items-center gap-1">
                                    <Clock3 className="size-3" />
                                    {task.dueDate ?? "未排期"}
                                  </span>
                                </span>
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <IconButton
                                    label={`管理任务：${task.title}`}
                                    className="absolute top-1 right-1 opacity-70 group-hover:opacity-100"
                                  >
                                    <MoreHorizontal />
                                  </IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setEditingTask(task)
                                      setEditorOpen(true)
                                    }}
                                  >
                                    <Pencil />
                                    编辑任务
                                  </DropdownMenuItem>
                                  {taskStatuses
                                    .filter((candidate) => candidate !== task.status)
                                    .map((candidate) => (
                                      <DropdownMenuItem
                                        key={candidate}
                                        onSelect={() =>
                                          updateMutation.mutate({
                                            task,
                                            status: candidate,
                                          })
                                        }
                                      >
                                        <ChevronRight />
                                        移至{candidate}
                                      </DropdownMenuItem>
                                    ))}
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setDeleteTask(task)}
                                  >
                                    <Trash2 />
                                    删除任务
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </article>
                          ))}
                          {!tasksQuery.isLoading && !laneTasks.length ? (
                            <EmptyState
                              title="当前泳道没有任务"
                              detail="任务状态变化后会自动进入这里。"
                              className="min-h-28 border border-dashed border-border px-3 py-4"
                            />
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </section>
        </div>
      </ScrollArea>

      <TaskEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        task={editingTask}
        teamId={teamId}
        projects={projects}
        onSaved={setFeedback}
      />
      <Dialog
        open={Boolean(deleteTask)}
        onOpenChange={(open) => !open && setDeleteTask(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除任务</DialogTitle>
            <DialogDescription>
              “{deleteTask?.title}”将从当前工作台移除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTask(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteTask || deleteMutation.isPending}
              onClick={() => deleteTask && deleteMutation.mutate(deleteTask)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}

type CalendarDialog = "create" | "edit" | "day" | null

export function PersonalCalendar({
  teamId,
  projects,
  onNavigate,
}: {
  teamId: TeamId
  projects: WorkspaceProject[]
  onNavigate: (view: WorkspaceView) => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ["calendar-events", teamId] as const
  const calendarScrollRef = useRef<HTMLElement>(null)
  const today = dateKey(new Date())
  const [monthOffset, setMonthOffset] = useState(0)
  const [dialog, setDialog] = useState<CalendarDialog>(null)
  const [selectedDate, setSelectedDate] = useState(today)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftTime, setDraftTime] = useState("09:00")
  const [draftProjectId, setDraftProjectId] = useState("")
  const [feedback, setFeedback] = useState("")
  const [formError, setFormError] = useState("")
  const baseToday = new Date(`${today}T00:00:00`)
  const baseMonth = new Date(
    baseToday.getFullYear(),
    baseToday.getMonth() + monthOffset,
    1,
  )
  const year = baseMonth.getFullYear()
  const month = baseMonth.getMonth()
  const calendarViewKey = `${year}-${month + 1}`
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const start = (baseMonth.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, index) => {
    const raw = index - start + 1
    const date = new Date(year, month, raw)
    return {
      key: dateKey(date),
      day: date.getDate(),
      current: raw >= 1 && raw <= daysInMonth,
    }
  })
  const selectedDateValue = new Date(`${selectedDate}T00:00:00`)
  const selectedDateLabel = `${selectedDateValue.getMonth() + 1} 月 ${selectedDateValue.getDate()} 日`
  const eventsQuery = useQuery({
    queryKey,
    queryFn: () => workspaceApi.listCalendarEvents(teamId),
  })
  const events = eventsQuery.data?.items ?? []
  const eventDate = useCallback(
    (event: CalendarEvent) => dateKey(new Date(event.startsAt), event.timezone),
    [],
  )
  const selectedEvents = events.filter((event) => eventDate(event) === selectedDate)

  useEffect(() => {
    const viewport = calendarScrollRef.current
    const selectedCell = viewport?.querySelector<HTMLElement>(
      `[data-calendar-view="${calendarViewKey}"][data-calendar-date="${selectedDate}"]`,
    )
    if (!viewport || !selectedCell) return
    const viewportRect = viewport.getBoundingClientRect()
    const cellRect = selectedCell.getBoundingClientRect()
    const targetLeft =
      viewport.scrollLeft +
      cellRect.left -
      viewportRect.left -
      (viewport.clientWidth - cellRect.width) / 2
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    viewport.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: reducedMotion ? "auto" : "smooth",
    })
  }, [calendarViewKey, selectedDate])

  const openCreate = (day = selectedDate) => {
    setEditingEvent(null)
    setSelectedDate(day)
    setDraftTitle("")
    setDraftTime("09:00")
    setDraftProjectId(projects[0]?.id ?? "")
    setFormError("")
    setDialog("create")
  }

  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event)
    setSelectedDate(eventDate(event))
    setDraftTitle(event.title)
    setDraftTime(timeLabel(new Date(event.startsAt), event.allDay, event.timezone))
    setDraftProjectId(event.projectId ?? "")
    setFormError("")
    setDialog("edit")
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const startsAt = new Date(`${selectedDate}T${draftTime}:00`).toISOString()
      if (editingEvent) {
        return workspaceApi.updateCalendarEvent(teamId, editingEvent.id, {
          title: draftTitle.trim(),
          startsAt,
          timezone: workspaceTimeZone,
          expectedRevision: editingEvent.revision,
        })
      }
      const result = await workspaceApi.createCalendarEvent(teamId, {
        title: draftTitle.trim(),
        projectId: draftProjectId || undefined,
        startsAt,
        timezone: workspaceTimeZone,
        visibility: "private",
        target: "schedule",
        idempotencyKey: requestKey("calendar"),
      })
      return result.item
    },
    onSuccess: (item) => {
      if (editingEvent) updateCachedItem(queryClient, queryKey, item)
      else {
        queryClient.setQueryData<{ items: CalendarEvent[] }>(queryKey, (current) => ({
          items: [...(current?.items ?? []), item],
        }))
      }
      setFeedback(editingEvent ? "日程已更新" : "日程已创建")
      setDialog(null)
    },
    onError: (cause) => {
      setFormError(mutationError(cause))
      if (cause instanceof ApiError && cause.code === "RESOURCE_CONFLICT") {
        void eventsQuery.refetch()
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (event: CalendarEvent) =>
      workspaceApi.deleteCalendarEvent(teamId, event.id, event.revision),
    onSuccess: ({ id }) => {
      removeCachedItem<CalendarEvent>(queryClient, queryKey, id)
      setFeedback("日程已删除")
    },
    onError: (cause) => setFeedback(mutationError(cause)),
  })

  const openEventTarget = (event: CalendarEvent) => {
    setDialog(null)
    onNavigate(isWorkspaceView(event.target) ? event.target : "calendar")
  }

  return (
    <PageFrame>
      <WorkspaceHeader
        title="我的日历"
        actions={
          <>
            {feedback ? (
              <span role="status" className="text-xs text-muted-foreground">
                {feedback}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMonthOffset(0)
                setSelectedDate(today)
              }}
            >
              今天
            </Button>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus />
              新建日程
            </Button>
            <div className="flex border border-border">
              <IconButton
                label="上个月"
                onClick={() => setMonthOffset((value) => value - 1)}
              >
                <ChevronLeft />
              </IconButton>
              <div className="grid min-w-28 place-items-center border-x border-border px-3 text-sm font-semibold">
                {year} 年 {month + 1} 月
              </div>
              <IconButton
                label="下个月"
                onClick={() => setMonthOffset((value) => value + 1)}
              >
                <ChevronRight />
              </IconButton>
            </div>
          </>
        }
      />
      {eventsQuery.isError ? (
        <DataLoadError
          message={mutationError(eventsQuery.error)}
          onRetry={() => void eventsQuery.refetch()}
        />
      ) : (
        <DataTableViewport
          ref={calendarScrollRef}
          label={`${year} 年 ${month + 1} 月日历`}
          axis="both"
          className="min-h-0 flex-1"
        >
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 border-b border-border bg-muted/30">
              {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => (
                <div
                  key={day}
                  className="border-r border-border px-3 py-2 text-xs text-muted-foreground last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid auto-rows-[13rem] grid-cols-7">
              {cells.map((cell) => {
                const cellDateValue = new Date(`${cell.key}T00:00:00`)
                const dayEvents = events.filter((event) => eventDate(event) === cell.key)
                const isToday = cell.key === today
                return (
                  <ContextMenu key={cell.key}>
                    <ContextMenuTrigger
                      asChild
                      onDoubleClick={() => {
                        setSelectedDate(cell.key)
                        setDialog("day")
                      }}
                    >
                      <div
                        data-calendar-view={calendarViewKey}
                        data-calendar-date={cell.key}
                        className={cn(
                          "flex min-h-0 flex-col overflow-hidden border-r border-b border-border p-2 text-left align-top transition-colors hover:bg-muted/40",
                          !cell.current && "bg-muted/20 text-muted-foreground",
                          selectedDate === cell.key && "bg-primary/4",
                        )}
                      >
                        <button
                          type="button"
                          aria-label={`${cellDateValue.getMonth() + 1} 月 ${cell.day} 日，${dayEvents.length} 项日程；双击打开当天列表`}
                          onClick={() => setSelectedDate(cell.key)}
                          onDoubleClick={() => {
                            setSelectedDate(cell.key)
                            setDialog("day")
                          }}
                          className="grid size-11 shrink-0 place-items-center text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span
                            className={cn(
                              "grid size-9 place-items-center transition-colors hover:bg-muted",
                              isToday &&
                                "bg-primary font-semibold text-primary-foreground",
                            )}
                          >
                            {cell.day}
                          </span>
                        </button>
                        <div className="mt-1 min-h-0 space-y-1 overflow-hidden">
                          {dayEvents.slice(0, 2).map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => openEventTarget(event)}
                              onDoubleClick={(pointerEvent) =>
                                pointerEvent.stopPropagation()
                              }
                              className="group flex min-h-11 w-full items-center text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              title={event.title}
                            >
                              <span className="block w-full truncate border border-primary/25 bg-primary/6 px-1.5 py-0.5 text-primary transition-colors group-hover:border-primary">
                                {event.title}
                              </span>
                            </button>
                          ))}
                          {dayEvents.length > 2 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(cell.key)
                                setDialog("day")
                              }}
                              className="block min-h-11 w-full truncate px-1 text-left text-xs leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              另有 {dayEvents.length - 2} 项
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => openCreate(cell.key)}>
                        <Plus />
                        新建日程
                      </ContextMenuItem>
                      <ContextMenuItem
                        onSelect={() => {
                          setSelectedDate(cell.key)
                          setDialog("day")
                        }}
                      >
                        <CalendarDays />
                        打开当天列表
                        <span className="ml-auto text-xs text-muted-foreground">
                          {dayEvents.length}
                        </span>
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
            </div>
          </div>
        </DataTableViewport>
      )}

      <Dialog
        open={dialog === "create" || dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "编辑" : "新建"} {selectedDateLabel}日程
            </DialogTitle>
            <DialogDescription>
              个人日程默认仅当前账号可见，项目只用于工作上下文关联。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              aria-label="日程名称"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="日程名称"
            />
            <Input
              type="time"
              value={draftTime}
              onChange={(event) => setDraftTime(event.target.value)}
              aria-label="日程时间"
            />
            {!editingEvent ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {projects.find((project) => project.id === draftProjectId)?.name ??
                      "不关联项目"}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  {projects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onSelect={() => setDraftProjectId(project.id)}
                    >
                      {project.id === draftProjectId ? (
                        <Check />
                      ) : (
                        <span className="size-4" />
                      )}
                      {project.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {formError ? (
              <p role="alert" className="text-xs text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              disabled={!draftTitle.trim() || !draftTime || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "保存中" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "day"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedDateLabel}任务与日程</DialogTitle>
            <DialogDescription>{selectedEvents.length} 项安排</DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border border border-border">
            {selectedEvents.map((event) => (
              <div key={event.id} className="flex min-h-14 items-center gap-2 p-2">
                <button
                  type="button"
                  onClick={() => openEventTarget(event)}
                  className="flex min-w-0 flex-1 items-center gap-3 p-1 text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="w-12 text-xs text-muted-foreground">
                    {timeLabel(new Date(event.startsAt), event.allDay, event.timezone)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {event.title}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton label={`管理日程：${event.title}`}>
                      <MoreHorizontal />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openEdit(event)}>
                      <Pencil />
                      编辑日程
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => deleteMutation.mutate(event)}
                    >
                      <Trash2 />
                      删除日程
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {!selectedEvents.length ? (
              <EmptyState
                icon={<CalendarDays className="size-5" />}
                title="这一天还没有安排"
                detail="可以从日历右键菜单或下方按钮新建日程。"
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => openCreate(selectedDate)}>
              <Plus />
              新建日程
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}

function NoteEditor({
  note,
  onSave,
  onDelete,
  compact = false,
}: {
  note: WorkspaceNote
  onSave: (
    note: WorkspaceNote,
    update: Omit<UpdateWorkspaceNoteBody, "expectedRevision">,
  ) => Promise<WorkspaceNote>
  onDelete: (note: WorkspaceNote) => void
  compact?: boolean
}) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setTitle(note.title)
    setBody(note.body)
    setDirty(false)
    setError("")
  }, [note.title, note.body])

  useEffect(() => {
    if (!dirty || saving || !title.trim()) return
    const timer = window.setTimeout(async () => {
      setSaving(true)
      setError("")
      try {
        await onSave(note, { title: title.trim(), body })
        setDirty(false)
      } catch (cause) {
        setError(mutationError(cause))
      } finally {
        setSaving(false)
      }
    }, 650)
    return () => window.clearTimeout(timer)
  }, [body, dirty, note, onSave, saving, title])

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "gap-3" : "h-full")}>
      <div
        className={cn(
          "flex items-center gap-2",
          !compact && "border-b border-border p-4",
        )}
      >
        <Input
          aria-label="笔记标题"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setDirty(true)
          }}
          className="border-0 px-0 text-base font-semibold shadow-none focus-visible:ring-0"
        />
        <span role="status" className="shrink-0 text-xs text-muted-foreground">
          {saving ? "保存中" : dirty ? "等待保存" : "已保存"}
        </span>
        <IconButton label={`删除：${note.title}`} onClick={() => onDelete(note)}>
          <Trash2 />
        </IconButton>
      </div>
      <Textarea
        aria-label="笔记正文"
        value={body}
        onChange={(event) => {
          setBody(event.target.value)
          setDirty(true)
        }}
        className={cn(
          "resize-none border-0 leading-7 shadow-none focus-visible:ring-0",
          compact ? "min-h-52" : "min-h-0 flex-1 p-5",
        )}
      />
      {error ? (
        <p role="alert" className="px-4 pb-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function PersonalNotes({
  teamId,
  projects,
}: {
  teamId: TeamId
  projects: WorkspaceProject[]
}) {
  const queryClient = useQueryClient()
  const queryKey = ["workspace-notes", teamId] as const
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"笔记" | "便签">("笔记")
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState("")
  const [selectedStickyId, setSelectedStickyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteNote, setDeleteNote] = useState<WorkspaceNote | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftBody, setDraftBody] = useState("")
  const [feedback, setFeedback] = useState("")
  const notesQuery = useQuery({
    queryKey,
    queryFn: () => workspaceApi.listNotes(teamId),
  })
  const notes = notesQuery.data?.items ?? []
  const visibleItems = useMemo(
    () =>
      notes.filter((note) => {
        const matchesView =
          view === "笔记" ? note.kind === "note" : note.kind === "sticky"
        const matchesQuery = `${note.title}${note.body}${note.projectName ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
        return matchesView && matchesQuery && (!pinnedOnly || note.pinned)
      }),
    [notes, pinnedOnly, query, view],
  )
  const selectedNote =
    visibleItems.find((note) => note.id === selectedNoteId) ?? visibleItems[0] ?? null
  const selectedStickyNote =
    notes.find((note) => note.id === selectedStickyId && note.kind === "sticky") ?? null

  const saveNote = useCallback(
    async (
      note: WorkspaceNote,
      update: Omit<UpdateWorkspaceNoteBody, "expectedRevision">,
    ) => {
      const item = await workspaceApi.updateNote(teamId, note.id, {
        ...update,
        expectedRevision: note.revision,
      })
      updateCachedItem(queryClient, queryKey, item)
      return item
    },
    [queryClient, queryKey, teamId],
  )

  const createMutation = useMutation({
    mutationFn: async () => {
      const projectId = view === "笔记" ? projects[0]?.id : undefined
      const result = await workspaceApi.createNote(teamId, {
        title: draftTitle.trim(),
        body: draftBody,
        kind: view === "笔记" ? "note" : "sticky",
        projectId,
        idempotencyKey: requestKey("note"),
      })
      return result.item
    },
    onSuccess: (item) => {
      queryClient.setQueryData<{ items: WorkspaceNote[] }>(queryKey, (current) => ({
        items: [item, ...(current?.items ?? [])],
      }))
      setSelectedNoteId(item.id)
      setDraftTitle("")
      setDraftBody("")
      setCreateOpen(false)
      setFeedback(`${view}已创建`)
    },
    onError: (cause) => setFeedback(mutationError(cause)),
  })

  const deleteMutation = useMutation({
    mutationFn: (note: WorkspaceNote) =>
      workspaceApi.deleteNote(teamId, note.id, note.revision),
    onSuccess: ({ id }) => {
      removeCachedItem<WorkspaceNote>(queryClient, queryKey, id)
      setSelectedStickyId(null)
      setDeleteNote(null)
      setFeedback("记录已删除")
    },
    onError: (cause) => setFeedback(mutationError(cause)),
  })

  const togglePinned = async (note: WorkspaceNote) => {
    try {
      await saveNote(note, { pinned: !note.pinned })
      setFeedback(note.pinned ? "已取消置顶" : "已置顶")
    } catch (cause) {
      setFeedback(mutationError(cause))
      if (cause instanceof ApiError && cause.code === "RESOURCE_CONFLICT") {
        void notesQuery.refetch()
      }
    }
  }

  return (
    <PageFrame>
      <WorkspaceHeader
        title="便签 / 笔记"
        actions={
          <>
            {feedback ? (
              <span role="status" className="text-xs text-muted-foreground">
                {feedback}
              </span>
            ) : null}
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              新建{view}
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
            <TabsList>
              <TabsTrigger value="笔记">
                <FileText />
                笔记
              </TabsTrigger>
              <TabsTrigger value="便签">
                <StickyNote />
                便签
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative min-w-52 flex-1 sm:max-w-sm">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={`搜索${view}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜索${view}`}
              className="pl-8"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant={pinnedOnly ? "secondary" : "ghost"}
            aria-pressed={pinnedOnly}
            onClick={() => setPinnedOnly((current) => !current)}
          >
            <Pin />
            只看置顶
          </Button>
        </div>
        {notesQuery.isError ? (
          <DataLoadError
            message={mutationError(notesQuery.error)}
            onRetry={() => void notesQuery.refetch()}
          />
        ) : view === "笔记" ? (
          <WorkspaceListPane
            listWidth="300px"
            listLabel="笔记列表"
            detailLabel={selectedNote ? `${selectedNote.title} 笔记内容` : "笔记内容"}
            className="flex-1"
            list={
              <div className="divide-y divide-border">
                {visibleItems.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setSelectedNoteId(note.id)}
                    className={cn(
                      "w-full p-4 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                      selectedNote?.id === note.id && "bg-primary/6",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm font-medium">
                        {note.title}
                      </strong>
                      {note.pinned ? (
                        <Pin className="size-3.5 fill-current text-primary" />
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {note.projectName ?? "未关联项目"}
                    </span>
                    <span className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {note.body || "暂无正文"}
                    </span>
                  </button>
                ))}
                {!notesQuery.isLoading && !visibleItems.length ? (
                  <EmptyState
                    title="没有符合当前条件的笔记"
                    detail="调整搜索或筛选条件。"
                  />
                ) : null}
              </div>
            }
            detail={
              selectedNote ? (
                <NoteEditor
                  key={selectedNote.id}
                  note={selectedNote}
                  onSave={saveNote}
                  onDelete={setDeleteNote}
                />
              ) : (
                <EmptyState
                  icon={<FileText className="size-5" />}
                  title={notesQuery.isLoading ? "正在载入笔记" : "选择一条笔记"}
                />
              )
            }
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="columns-1 gap-3 md:columns-2 lg:columns-3 2xl:columns-4">
              {visibleItems.map((note) => (
                <article
                  key={note.id}
                  className="mb-3 break-inside-avoid border border-border bg-background p-4 transition-colors hover:border-primary"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedStickyId(note.id)}
                    className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <strong className="text-sm font-semibold">{note.title}</strong>
                      {note.pinned ? (
                        <Pin className="size-3.5 fill-current text-primary" />
                      ) : null}
                    </span>
                    <span className="mt-3 block whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                      {note.body || "暂无正文"}
                    </span>
                  </button>
                  <div className="mt-3 flex justify-end border-t border-border pt-2">
                    <IconButton
                      label={note.pinned ? "取消置顶" : "置顶便签"}
                      onClick={() => void togglePinned(note)}
                    >
                      <Pin className={cn(note.pinned && "fill-current")} />
                    </IconButton>
                  </div>
                </article>
              ))}
            </div>
            {!notesQuery.isLoading && !visibleItems.length ? (
              <EmptyState
                icon={<StickyNote className="size-5" />}
                title="没有符合当前条件的便签"
                detail="调整搜索词或取消置顶筛选后再试。"
                className="min-h-72"
              />
            ) : null}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(selectedStickyNote)}
        onOpenChange={(open) => !open && setSelectedStickyId(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selectedStickyNote?.title}</DialogTitle>
            <DialogDescription>个人便签 · 仅个人可见</DialogDescription>
          </DialogHeader>
          {selectedStickyNote ? (
            <NoteEditor
              key={selectedStickyNote.id}
              note={selectedStickyNote}
              onSave={saveNote}
              onDelete={setDeleteNote}
              compact
            />
          ) : null}
          <DialogFooter>
            {selectedStickyNote ? (
              <Button
                variant="outline"
                onClick={() => void togglePinned(selectedStickyNote)}
              >
                <Pin className={cn(selectedStickyNote.pinned && "fill-current")} />
                {selectedStickyNote.pinned ? "取消置顶" : "置顶便签"}
              </Button>
            ) : null}
            <Button onClick={() => setSelectedStickyId(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建{view}</DialogTitle>
            <DialogDescription>
              {view === "笔记"
                ? "新笔记会关联当前团队的首个可访问项目。"
                : "便签默认仅当前账号和同权个人 Agent 可见。"}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label={`${view}标题`}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="标题"
          />
          <Textarea
            aria-label={`${view}内容`}
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            placeholder="记录内容"
            className="min-h-36"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!draftTitle.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "创建中" : `创建${view}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteNote)}
        onOpenChange={(open) => !open && setDeleteNote(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除记录</DialogTitle>
            <DialogDescription>“{deleteNote?.title}”将从个人空间移除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNote(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteNote || deleteMutation.isPending}
              onClick={() => deleteNote && deleteMutation.mutate(deleteNote)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
