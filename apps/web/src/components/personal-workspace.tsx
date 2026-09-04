"use client"

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ContactRound,
  FileText,
  Link2,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Share2,
  StickyNote,
  UserRound,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
  StatusBadge,
  WorkspaceHeader,
  WorkspaceListPane,
} from "@/components/workspace/page-elements"
import {
  getProjectsForTeam,
  getTeam,
  type ProjectId,
  type TeamId,
  type WorkspaceView,
} from "@/components/workspace/workspace-data"
import { cn } from "@/lib/utils"

type DashboardTask = {
  id: string
  title: string
  project: string
  projectId: ProjectId
  due: string
  assignee: string
  status: "待开始" | "进行中" | "等待他人" | "已完成"
  target: WorkspaceView
}

const dashboardTasks: DashboardTask[] = [
  {
    id: "t1",
    title: "确认车站夜戏演员与供应商",
    project: "冬夜咖啡",
    projectId: "winter-coffee",
    due: "今天",
    assignee: "繁星",
    status: "进行中",
    target: "breakdown",
  },
  {
    id: "t2",
    title: "锁定拍摄稿 v7",
    project: "冬夜咖啡",
    projectId: "winter-coffee",
    due: "今天",
    assignee: "林乔",
    status: "等待他人",
    target: "scripts",
  },
  {
    id: "t3",
    title: "发布车站夜戏通告",
    project: "冬夜咖啡",
    projectId: "winter-coffee",
    due: "8 月 25 日",
    assignee: "繁星",
    status: "待开始",
    target: "schedule",
  },
  {
    id: "t4",
    title: "路线勘景候选确认",
    project: "城市慢行",
    projectId: "city-walk",
    due: "8 月 26 日",
    assignee: "周弥",
    status: "进行中",
    target: "breakdown",
  },
  {
    id: "t5",
    title: "整理主片 v12 审片意见",
    project: "水星香氛",
    projectId: "mercury-perfume",
    due: "8 月 27 日",
    assignee: "繁星",
    status: "待开始",
    target: "reviews",
  },
  {
    id: "t6",
    title: "车站段落分镜 v4",
    project: "冬夜咖啡",
    projectId: "winter-coffee",
    due: "昨天",
    assignee: "顾遥",
    status: "已完成",
    target: "scripts",
  },
  {
    id: "t7",
    title: "外景场地授权回收",
    project: "城市慢行",
    projectId: "city-walk",
    due: "8 月 29 日",
    assignee: "繁星",
    status: "待开始",
    target: "resources",
  },
  {
    id: "t8",
    title: "车站夜戏设备清单",
    project: "冬夜咖啡",
    projectId: "winter-coffee",
    due: "8 月 24 日",
    assignee: "崔岚",
    status: "已完成",
    target: "breakdown",
  },
]

const ganttRows = [
  {
    label: "拍摄稿锁定",
    projectId: "winter-coffee" as ProjectId,
    project: "冬夜咖啡",
    startDate: "2026-08-24",
    duration: 2,
    tone: "border-primary/25 bg-primary/8 text-primary",
  },
  {
    label: "车站夜戏执行",
    projectId: "winter-coffee" as ProjectId,
    project: "冬夜咖啡",
    startDate: "2026-08-26",
    duration: 3,
    tone: "border-support/25 bg-support/8 text-support",
  },
  {
    label: "路线勘景",
    projectId: "city-walk" as ProjectId,
    project: "城市慢行",
    startDate: "2026-08-25",
    duration: 4,
    tone: "border-positive/25 bg-positive/8 text-positive",
  },
  {
    label: "主片内审",
    projectId: "mercury-perfume" as ProjectId,
    project: "水星香氛",
    startDate: "2026-08-28",
    duration: 4,
    tone: "border-muted-foreground/25 bg-muted text-foreground",
  },
  {
    label: "主片剪辑与调色",
    projectId: "mercury-perfume" as ProjectId,
    project: "水星香氛",
    startDate: "2026-08-31",
    duration: 12,
    tone: "border-primary/20 bg-primary/6 text-primary",
  },
  {
    label: "城市路线拍摄",
    projectId: "city-walk" as ProjectId,
    project: "城市慢行",
    startDate: "2026-09-07",
    duration: 6,
    tone: "border-support/20 bg-support/6 text-support",
  },
]

const fixtureToday = new Date(2026, 7, 27)
const timelineStartDate = new Date(2026, 7, 10)
const timelineDayCount = 42
const timelineZoomLevels = [48, 64, 80, 104] as const
const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

function getDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

const todayDateKey = getDateKey(fixtureToday)

const timelineDays = Array.from({ length: timelineDayCount }, (_, index) => {
  const date = new Date(
    timelineStartDate.getFullYear(),
    timelineStartDate.getMonth(),
    timelineStartDate.getDate() + index,
  )
  const key = getDateKey(date)
  return {
    key,
    date,
    dateLabel: `${date.getMonth() + 1}/${date.getDate()}`,
    weekday: weekdayLabels[date.getDay()],
    today: key === todayDateKey,
    weekend: date.getDay() === 0 || date.getDay() === 6,
  }
})

const todayTimelineIndex = timelineDays.findIndex((day) => day.today)
const timelineEndDay = timelineDays[timelineDays.length - 1]

export function PersonalDashboard({
  teamId,
  onNavigate,
  onOpenProjectView,
}: {
  teamId: TeamId
  onNavigate: (view: WorkspaceView) => void
  onOpenProjectView: (projectId: ProjectId, view: WorkspaceView) => void
}) {
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const timelineDayWidthRef = useRef<(typeof timelineZoomLevels)[number]>(64)
  const lastWheelZoomAtRef = useRef(0)
  const timelineDraggedRef = useRef(false)
  const timelineDragRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    axis: null as "pending" | "horizontal" | null,
  })
  const [dayWidth, setDayWidth] = useState<(typeof timelineZoomLevels)[number]>(64)
  const [isTimelineDragging, setIsTimelineDragging] = useState(false)
  const statuses = ["待开始", "进行中", "等待他人", "已完成"] as const
  const teamProjects = getProjectsForTeam(teamId)
  const visibleTasks = dashboardTasks.filter((task) =>
    teamProjects.some((project) => project.id === task.projectId),
  )
  const visibleGanttRows = ganttRows.filter((row) =>
    teamProjects.some((project) => project.id === row.projectId),
  )
  const visibleRange = `${timelineDays[0].date.getMonth() + 1} 月 ${timelineDays[0].date.getDate()} 日至 ${timelineEndDay.date.getMonth() + 1} 月 ${timelineEndDay.date.getDate()} 日`

  const changeTimelineZoom = (direction: -1 | 1, pointerClientX?: number) => {
    const currentWidth = timelineDayWidthRef.current
    const currentIndex = timelineZoomLevels.indexOf(currentWidth)
    const nextIndex = Math.min(
      timelineZoomLevels.length - 1,
      Math.max(0, currentIndex + direction),
    )
    const nextWidth = timelineZoomLevels[nextIndex]
    if (nextWidth === currentWidth) return

    const viewport = timelineScrollRef.current
    const viewportRect = viewport?.getBoundingClientRect()
    const pointerX =
      viewport && viewportRect && pointerClientX !== undefined
        ? Math.min(viewport.clientWidth, Math.max(0, pointerClientX - viewportRect.left))
        : (viewport?.clientWidth ?? 0) / 2
    const axisX = Math.max(0, pointerX - 148)
    const anchorDay = viewport
      ? (viewport.scrollLeft + axisX) / currentWidth
      : todayTimelineIndex

    timelineDayWidthRef.current = nextWidth
    setDayWidth(nextWidth)
    requestAnimationFrame(() => {
      if (!viewport) return
      viewport.scrollLeft = Math.max(0, anchorDay * nextWidth - axisX)
    })
  }

  useEffect(() => {
    const viewport = timelineScrollRef.current
    if (!viewport) return
    viewport.scrollLeft = Math.max(
      0,
      todayTimelineIndex * timelineZoomLevels[1] - viewport.clientWidth / 3,
    )
  }, [])

  return (
    <PageFrame className="bg-workspace">
      <ScrollArea
        type="always"
        className="min-h-0 min-w-0 flex-1"
        viewportClassName="[&>div]:!block [&>div]:w-full [&>div]:min-w-0"
      >
        <div className="space-y-3">
          <WorkspaceHeader title="繁星，下午好" variant="compact" />
          <section className="border border-border bg-background">
            <SectionHeader
              title="我的任务"
              detail={`${visibleTasks.length} 项与当前团队相关的工作`}
            />
            <ScrollArea type="always" scrollbars="horizontal" className="min-w-0 w-full">
              <div className="grid min-h-[17rem] min-w-[900px] grid-cols-4 divide-x divide-border">
                {statuses.map((status) => {
                  const tasks = visibleTasks.filter((task) => task.status === status)
                  return (
                    <div key={status} className="flex min-h-0 flex-col bg-muted/20 p-3">
                      <div className="mb-3 flex shrink-0 items-center justify-between text-xs font-semibold">
                        <span>{status}</span>
                        <span className="text-muted-foreground">{tasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {tasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => onOpenProjectView(task.projectId, task.target)}
                            className="w-full border border-border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/4"
                          >
                            <strong className="block text-sm font-medium leading-5">
                              {task.title}
                            </strong>
                            <span className="mt-2 block text-xs text-muted-foreground">
                              {task.project}
                            </span>
                            <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{task.assignee}</span>
                              <span className="flex items-center gap-1">
                                <Clock3 className="size-3" />
                                {task.due}
                              </span>
                            </span>
                          </button>
                        ))}
                        {!tasks.length ? (
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
          </section>

          <section className="border border-border bg-background">
            <SectionHeader title="我的排期" detail={`${visibleRange} · 42 天`} />
            <ScrollArea
              type="always"
              scrollbars="horizontal"
              className="min-w-0 w-full"
              viewportRef={timelineScrollRef}
              viewportProps={{
                "aria-label": "项目排期时间轴",
                tabIndex: 0,
              }}
              viewportClassName={cn(
                "overscroll-x-contain select-none",
                isTimelineDragging ? "cursor-grabbing" : "cursor-grab",
              )}
              onWheel={(event) => {
                const zoomModifier = event.ctrlKey || event.metaKey

                if (
                  !zoomModifier ||
                  Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
                  event.deltaY === 0
                ) {
                  return
                }
                event.preventDefault()
                const now = performance.now()
                if (now - lastWheelZoomAtRef.current < 140) return
                lastWheelZoomAtRef.current = now
                changeTimelineZoom(event.deltaY > 0 ? -1 : 1, event.clientX)
              }}
              onKeyDown={(event) => {
                const viewport = timelineScrollRef.current
                if (!viewport) return
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault()
                  viewport.scrollBy({
                    left: (event.key === "ArrowLeft" ? -1 : 1) * dayWidth * 3,
                    behavior: "auto",
                  })
                } else if (
                  (event.ctrlKey || event.metaKey) &&
                  (event.key === "+" || event.key === "=")
                ) {
                  event.preventDefault()
                  changeTimelineZoom(1)
                } else if ((event.ctrlKey || event.metaKey) && event.key === "-") {
                  event.preventDefault()
                  changeTimelineZoom(-1)
                }
              }}
            >
              <div
                className="min-w-full touch-pan-y"
                style={{ width: 148 + timelineDays.length * dayWidth }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || !event.isPrimary) return
                  const viewport = timelineScrollRef.current
                  if (!viewport) return
                  viewport.focus({ preventScroll: true })
                  timelineDraggedRef.current = false
                  timelineDragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startScrollLeft: viewport.scrollLeft,
                    axis: "pending",
                  }
                }}
                onPointerMove={(event) => {
                  const drag = timelineDragRef.current
                  const viewport = timelineScrollRef.current
                  if (drag.pointerId !== event.pointerId || !viewport) return
                  const deltaX = event.clientX - drag.startX
                  const deltaY = event.clientY - drag.startY

                  if (drag.axis === "pending") {
                    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 7) return
                    if (Math.abs(deltaY) >= Math.abs(deltaX)) {
                      timelineDragRef.current.pointerId = null
                      timelineDragRef.current.axis = null
                      return
                    }
                    timelineDragRef.current.axis = "horizontal"
                    timelineDraggedRef.current = true
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setIsTimelineDragging(true)
                  }

                  if (timelineDragRef.current.axis !== "horizontal") return
                  event.preventDefault()
                  viewport.scrollLeft = drag.startScrollLeft - deltaX
                }}
                onPointerUp={(event) => {
                  if (timelineDragRef.current.pointerId !== event.pointerId) return
                  timelineDragRef.current.pointerId = null
                  timelineDragRef.current.axis = null
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }
                  setIsTimelineDragging(false)
                  window.setTimeout(() => {
                    timelineDraggedRef.current = false
                  }, 0)
                }}
                onPointerCancel={(event) => {
                  if (timelineDragRef.current.pointerId !== event.pointerId) return
                  timelineDragRef.current.pointerId = null
                  timelineDragRef.current.axis = null
                  setIsTimelineDragging(false)
                }}
                onClickCapture={(event) => {
                  if (!timelineDraggedRef.current) return
                  event.preventDefault()
                  event.stopPropagation()
                  timelineDraggedRef.current = false
                }}
              >
                <div className="grid grid-cols-[148px_auto] border-b border-border bg-muted/35 text-xs text-muted-foreground">
                  <div className="sticky left-0 z-20 flex items-center border-r border-border bg-muted px-3">
                    事项
                  </div>
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(${timelineDays.length}, ${dayWidth}px)`,
                    }}
                  >
                    {timelineDays.map((day) => (
                      <div
                        key={day.key}
                        className={cn(
                          "flex h-11 flex-col items-center justify-center border-r border-border px-1 text-center last:border-r-0",
                          day.weekend && "bg-muted/25",
                          day.today && "bg-primary/6 font-medium text-primary",
                        )}
                      >
                        <span className="whitespace-nowrap">
                          {day.today ? "今天" : day.weekday}
                        </span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {day.dateLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {visibleGanttRows.map((row) => {
                  const startIndex = timelineDays.findIndex(
                    (day) => day.key === row.startDate,
                  )
                  return (
                    <div
                      key={row.label}
                      className="grid h-11 grid-cols-[148px_auto] border-b border-border last:border-b-0"
                    >
                      <div className="sticky left-0 z-10 flex min-w-0 items-center border-r border-border bg-background px-3">
                        <div
                          className="truncate text-xs font-medium"
                          title={`${row.label} · ${row.project}`}
                        >
                          {row.label}
                          <span className="ml-1 font-normal text-muted-foreground">
                            · {row.project}
                          </span>
                        </div>
                      </div>
                      <div
                        className="relative grid"
                        style={{
                          gridTemplateColumns: `repeat(${timelineDays.length}, ${dayWidth}px)`,
                        }}
                      >
                        {timelineDays.map((day) => (
                          <div
                            key={day.key}
                            className={cn(
                              "border-r border-border last:border-r-0",
                              day.weekend && "bg-muted/20",
                              day.today && "bg-primary/[0.03]",
                            )}
                          />
                        ))}
                        {startIndex >= 0 ? (
                          <button
                            type="button"
                            aria-label={`${row.label}，${row.project}，${row.startDate} 起，共 ${row.duration} 天`}
                            onClick={() =>
                              onNavigate(
                                row.label.includes("审") || row.label.includes("剪辑")
                                  ? "reviews"
                                  : "schedule",
                              )
                            }
                            className="absolute top-0 flex h-11 items-center text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                            style={{
                              left: startIndex * dayWidth,
                              width: row.duration * dayWidth,
                            }}
                            title={`${row.label} · ${row.project}`}
                          >
                            <span
                              className={cn(
                                "block h-7 w-full truncate border px-2 py-1.5",
                                row.tone,
                              )}
                            >
                              {row.label}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </section>
        </div>
      </ScrollArea>
    </PageFrame>
  )
}

type CalendarEvent = {
  id: string
  projectId: ProjectId
  date: string
  title: string
  time: string
  target: WorkspaceView
  tone: string
}

const initialEvents: CalendarEvent[] = [
  {
    id: "e1",
    projectId: "winter-coffee",
    date: "2026-08-14",
    title: "演员与供应商确认",
    time: "10:00",
    target: "breakdown",
    tone: "border-primary/30 bg-primary/8 text-primary",
  },
  {
    id: "e2",
    projectId: "winter-coffee",
    date: "2026-08-14",
    title: "车站夜戏通告协同",
    time: "16:30",
    target: "schedule",
    tone: "border-support/35 bg-support/8 text-support",
  },
  {
    id: "e3",
    projectId: "winter-coffee",
    date: "2026-08-14",
    title: "拍摄稿 v7 确认",
    time: "19:00",
    target: "scripts",
    tone: "border-positive/35 bg-positive/8 text-positive",
  },
  {
    id: "e4",
    projectId: "city-walk",
    date: "2026-08-20",
    title: "路线勘景",
    time: "09:30",
    target: "breakdown",
    tone: "border-muted-foreground/30 bg-muted text-foreground",
  },
  {
    id: "e5",
    projectId: "mercury-perfume",
    date: "2026-08-24",
    title: "主片内部审阅",
    time: "15:00",
    target: "reviews",
    tone: "border-primary/30 bg-primary/8 text-primary",
  },
]

export function PersonalCalendar({
  teamId,
  onNavigate,
}: {
  teamId: TeamId
  onNavigate: (view: WorkspaceView) => void
}) {
  const calendarScrollRef = useRef<HTMLElement>(null)
  const [monthOffset, setMonthOffset] = useState(0)
  const [events, setEvents] = useState(initialEvents)
  const [dialog, setDialog] = useState<"create" | "day" | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayDateKey)
  const [draftTitle, setDraftTitle] = useState("")
  const baseMonth = new Date(
    fixtureToday.getFullYear(),
    fixtureToday.getMonth() + monthOffset,
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
      key: [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-"),
      day: date.getDate(),
      current: raw >= 1 && raw <= daysInMonth,
    }
  })
  const selectedDateValue = new Date(`${selectedDate}T00:00:00`)
  const selectedDateLabel = `${selectedDateValue.getMonth() + 1} 月 ${selectedDateValue.getDate()} 日`
  const teamProjects = getProjectsForTeam(teamId)
  const visibleEvents = events.filter((event) =>
    teamProjects.some((project) => project.id === event.projectId),
  )
  const selectedEvents = visibleEvents.filter((event) => event.date === selectedDate)

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

  const createEvent = () => {
    if (!draftTitle.trim()) return
    setEvents((current) => [
      ...current,
      {
        id: `event-${Date.now()}`,
        projectId: teamProjects[0]?.id ?? "winter-coffee",
        date: selectedDate,
        title: draftTitle.trim(),
        time: "待定",
        target: "schedule",
        tone: "border-border bg-muted text-foreground",
      },
    ])
    setDraftTitle("")
    setDialog(null)
  }

  return (
    <PageFrame>
      <WorkspaceHeader
        title="我的日历"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => {
                setMonthOffset(0)
                setSelectedDate(todayDateKey)
              }}
            >
              今天
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
          <div className="grid auto-rows-[8rem] grid-cols-7">
            {cells.map((cell) => {
              const cellDateValue = new Date(`${cell.key}T00:00:00`)
              const dayEvents = visibleEvents.filter((event) => event.date === cell.key)
              const today = cell.key === todayDateKey
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
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            setSelectedDate(cell.key)
                            setDialog("day")
                          }
                        }}
                        onDoubleClick={() => {
                          setSelectedDate(cell.key)
                          setDialog("day")
                        }}
                        className="grid size-8 shrink-0 place-items-center text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span
                          className={cn(
                            "grid size-7 place-items-center transition-colors hover:bg-muted",
                            today && "bg-primary font-semibold text-primary-foreground",
                          )}
                        >
                          {cell.day}
                        </span>
                      </button>
                      <div className="mt-1 min-h-0 space-y-1 overflow-hidden">
                        {dayEvents.slice(0, 2).map((eventItem) => (
                          <button
                            key={eventItem.id}
                            type="button"
                            onClick={() => onNavigate(eventItem.target)}
                            onDoubleClick={(event) => event.stopPropagation()}
                            className="group flex h-6 w-full items-center text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            title={eventItem.title}
                          >
                            <span
                              className={cn(
                                "block w-full truncate border px-1.5 py-0.5 transition-colors group-hover:border-primary",
                                eventItem.tone,
                              )}
                            >
                              {eventItem.title}
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
                            className="block h-5 w-full truncate px-1 text-left text-xs leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            另有 {dayEvents.length - 2} 项
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onSelect={() => {
                        setSelectedDate(cell.key)
                        setDialog("create")
                      }}
                    >
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

      <Dialog
        open={dialog === "create"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建 {selectedDateLabel}日程</DialogTitle>
            <DialogDescription>
              日程默认保存在当前团队范围，可在创建后关联项目。
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
            <Input defaultValue="待定" aria-label="日程时间" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button onClick={createEvent}>创建日程</Button>
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
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  setDialog(null)
                  onNavigate(event.target)
                }}
                className="flex w-full items-center gap-3 p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span className="w-12 text-xs text-muted-foreground">{event.time}</span>
                <span
                  className="min-w-0 flex-1 truncate text-sm font-medium"
                  title={event.title}
                >
                  {event.title}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
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
            <Button
              onClick={() => {
                setDialog("create")
              }}
            >
              <Plus />
              新建日程
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}

type NoteItem = {
  id: string
  title: string
  body: string
  kind: "个人便签" | "项目笔记"
  project?: string
  pinned: boolean
  updatedAt: string
}

const initialNotes: NoteItem[] = [
  {
    id: "n1",
    title: "车站雨效执行提醒",
    body: "确认雨车覆盖范围，现场准备两套防水方案。演员鞋底与轨道区域需要额外防滑。",
    kind: "项目笔记",
    project: "冬夜咖啡",
    pinned: true,
    updatedAt: "今天 09:40",
  },
  {
    id: "n2",
    title: "导演反馈整理",
    body: "开场需要更安静，镜头 12-03 的停顿可以再延长半秒，保留环境声。",
    kind: "项目笔记",
    project: "冬夜咖啡",
    pinned: false,
    updatedAt: "昨天 20:18",
  },
  {
    id: "n3",
    title: "下周需要联系",
    body: "补充一位夜景灯光师候选，并确认城市慢行的交通协管窗口。",
    kind: "个人便签",
    pinned: false,
    updatedAt: "8 月 21 日",
  },
  {
    id: "n4",
    title: "外景勘察问题",
    body: "确认早高峰的人流方向、附近可用停车位，以及器材车能否从西侧入口临时停靠。还需要补拍一组阴天参考照片。",
    kind: "个人便签",
    pinned: true,
    updatedAt: "8 月 20 日",
  },
  {
    id: "n5",
    title: "器材归还",
    body: "雨罩和无线跟焦周五前归还。",
    kind: "个人便签",
    pinned: false,
    updatedAt: "8 月 18 日",
  },
  {
    id: "n6",
    title: "临时音乐方向",
    body: "车站段落先尝试低频环境铺底，不要过早进入旋律。人物走出雨幕之后再让主题动机出现，给对白留出呼吸。",
    kind: "个人便签",
    pinned: false,
    updatedAt: "8 月 16 日",
  },
  {
    id: "n7",
    title: "慢行路线采访提纲",
    body: "补充沿线店主对拍摄时间的限制，确认骑行段是否需要交通协管，并记录每个候选机位的日照方向。",
    kind: "项目笔记",
    project: "城市慢行",
    pinned: false,
    updatedAt: "8 月 15 日",
  },
  {
    id: "n8",
    title: "场记备份",
    body: "收工前同步两份场记表。",
    kind: "个人便签",
    pinned: false,
    updatedAt: "8 月 15 日",
  },
  {
    id: "n9",
    title: "后期交接清单",
    body: "整理代理文件命名规则，确认声音素材与画面素材的时间码一致。交接前补齐镜头备注、现场收音问题和导演选择条目，避免剪辑师重新翻查群聊。",
    kind: "个人便签",
    pinned: false,
    updatedAt: "8 月 14 日",
  },
  {
    id: "n10",
    title: "咖啡店许可",
    body: "确认门头是否允许入镜，营业时段内只使用轻型灯具，并把最终拍摄时间发给店长。",
    kind: "个人便签",
    pinned: false,
    updatedAt: "8 月 13 日",
  },
]

export function PersonalNotes({ teamId }: { teamId: TeamId }) {
  const [noteItems, setNoteItems] = useState(initialNotes)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"笔记" | "便签">("笔记")
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState(
    initialNotes.find((note) => note.kind === "项目笔记")?.id ?? "",
  )
  const [selectedStickyNote, setSelectedStickyNote] = useState<NoteItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftBody, setDraftBody] = useState("")
  const teamProjectNames = new Set<string>(
    getProjectsForTeam(teamId).map((project) => project.name),
  )
  const visibleItems = noteItems.filter((note) => {
    const matchesView =
      view === "笔记" ? note.kind === "项目笔记" : note.kind === "个人便签"
    const matchesTeam =
      note.kind === "个人便签" || teamProjectNames.has(note.project ?? "")
    const matchesQuery = `${note.title}${note.body}${note.project ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
    return matchesView && matchesTeam && matchesQuery && (!pinnedOnly || note.pinned)
  })
  const selectedNote =
    visibleItems.find((note) => note.id === selectedNoteId) ?? visibleItems[0] ?? null

  const updateNote = (id: string, updates: Partial<NoteItem>) => {
    setNoteItems((current) =>
      current.map((note) =>
        note.id === id ? { ...note, ...updates, updatedAt: "刚刚" } : note,
      ),
    )
    setSelectedStickyNote((current) =>
      current?.id === id ? { ...current, ...updates, updatedAt: "刚刚" } : current,
    )
  }

  const togglePinned = (note: NoteItem) => {
    updateNote(note.id, { pinned: !note.pinned })
  }

  return (
    <PageFrame>
      <WorkspaceHeader
        title="便签 / 笔记"
        actions={
          <Button size="sm" className="min-h-11" onClick={() => setCreateOpen(true)}>
            <Plus />
            新建{view}
          </Button>
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
        {view === "笔记" ? (
          <WorkspaceListPane
            listWidth="300px"
            listLabel="笔记列表"
            detailLabel={selectedNote ? `${selectedNote.title} 笔记内容` : "笔记内容"}
            className="flex-1"
            listHeader={
              <SectionHeader
                title="笔记"
                detail={`${visibleItems.length} 篇符合当前条件`}
              />
            }
            list={
              visibleItems.length ? (
                visibleItems.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    aria-current={note.id === selectedNote?.id ? "true" : undefined}
                    onClick={() => setSelectedNoteId(note.id)}
                    className={cn(
                      "w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/45",
                      note.id === selectedNote?.id && "bg-primary/6",
                    )}
                  >
                    <span className="flex items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-medium">
                          {note.title}
                        </strong>
                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                          {note.body}
                        </span>
                      </span>
                      {note.pinned ? (
                        <Pin className="mt-0.5 size-3.5 shrink-0 fill-primary text-primary" />
                      ) : null}
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="truncate">{note.project ?? "未关联项目"}</span>
                      <span className="shrink-0">{note.updatedAt}</span>
                    </span>
                  </button>
                ))
              ) : (
                <EmptyState
                  title="没有符合当前条件的笔记"
                  detail="调整搜索词或取消置顶筛选后再试。"
                  className="min-h-56"
                />
              )
            }
            detail={
              selectedNote ? (
                <>
                  <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {selectedNote.project ?? "未关联项目"} · {selectedNote.updatedAt}
                    </span>
                    <IconButton
                      label={selectedNote.pinned ? "取消置顶" : "置顶笔记"}
                      aria-pressed={selectedNote.pinned}
                      onClick={() => togglePinned(selectedNote)}
                    >
                      <Pin className={cn(selectedNote.pinned && "fill-current")} />
                    </IconButton>
                    <Button variant="outline" size="sm">
                      交给 Agent 整理
                    </Button>
                  </div>
                  <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-5 sm:p-7">
                    <Input
                      aria-label="笔记标题"
                      value={selectedNote.title}
                      onChange={(event) =>
                        updateNote(selectedNote.id, { title: event.target.value })
                      }
                      className="h-auto border-0 bg-transparent px-0 py-1 text-xl font-semibold shadow-none focus-visible:ring-0"
                    />
                    <Textarea
                      aria-label="笔记正文"
                      value={selectedNote.body}
                      onChange={(event) =>
                        updateNote(selectedNote.id, { body: event.target.value })
                      }
                      className="min-h-[420px] resize-none border-0 bg-transparent p-0 text-sm leading-7 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<FileText className="size-5" />}
                  title="选择一篇笔记"
                  detail="左侧列表中的笔记会在这里打开。"
                  className="min-h-72"
                />
              )
            }
          />
        ) : (
          <div data-scroll-owner className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {visibleItems.length ? (
              <div className="columns-1 gap-3 md:columns-2 lg:columns-3 2xl:columns-4">
                {visibleItems.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setSelectedStickyNote(note)}
                    className="mb-3 inline-block w-full break-inside-avoid border border-border bg-background p-4 text-left align-top transition-colors hover:bg-muted/35"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <strong className="min-w-0 flex-1 text-sm font-semibold">
                        {note.title}
                      </strong>
                      {note.pinned ? (
                        <Pin className="size-3.5 shrink-0 fill-primary text-primary" />
                      ) : null}
                    </span>
                    <span className="mt-3 block whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {note.body}
                    </span>
                    <span className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>仅个人可见</span>
                      <span className="shrink-0">{note.updatedAt}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<StickyNote className="size-5" />}
                title="没有符合当前条件的便签"
                detail="调整搜索词或取消置顶筛选后再试。"
                className="min-h-72"
              />
            )}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(selectedStickyNote)}
        onOpenChange={(open) => !open && setSelectedStickyNote(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selectedStickyNote?.title}</DialogTitle>
            <DialogDescription>
              个人便签 · 仅个人可见 · {selectedStickyNote?.updatedAt}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="便签正文"
            value={selectedStickyNote?.body ?? ""}
            onChange={(event) => {
              if (selectedStickyNote) {
                updateNote(selectedStickyNote.id, { body: event.target.value })
              }
            }}
            className="min-h-48 leading-6"
          />
          <DialogFooter>
            {selectedStickyNote ? (
              <Button variant="outline" onClick={() => togglePinned(selectedStickyNote)}>
                <Pin className={cn(selectedStickyNote.pinned && "fill-current")} />
                {selectedStickyNote.pinned ? "取消置顶" : "置顶便签"}
              </Button>
            ) : null}
            <Button onClick={() => setSelectedStickyNote(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建{view}</DialogTitle>
            <DialogDescription>
              {view === "笔记"
                ? "新笔记会关联到当前项目，并显示在笔记列表中。"
                : "便签默认仅繁星与个人 Agent 可见。"}
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
              disabled={!draftTitle.trim()}
              onClick={() => {
                setNoteItems((current) => [
                  {
                    id: `note-${Date.now()}`,
                    title: draftTitle.trim(),
                    body: draftBody.trim() || "暂无正文",
                    kind: view === "笔记" ? "项目笔记" : "个人便签",
                    project: view === "笔记" ? "冬夜咖啡" : undefined,
                    pinned: false,
                    updatedAt: "刚刚",
                  },
                  ...current,
                ])
                setDraftTitle("")
                setDraftBody("")
                setCreateOpen(false)
              }}
            >
              创建{view}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}

type Contact = {
  id: string
  name: string
  role: string
  company: string
  phone: string
  email: string
  projects: string[]
  sharedFields: string[]
}

const initialContacts: Contact[] = [
  {
    id: "lin",
    name: "林乔",
    role: "导演",
    company: "自由职业",
    phone: "138 0000 1288",
    email: "linqiao@example.com",
    projects: ["冬夜咖啡"],
    sharedFields: ["name", "role", "phone"],
  },
  {
    id: "lu",
    name: "陆川",
    role: "灯光师",
    company: "光域器材",
    phone: "139 0000 6731",
    email: "luchuan@example.com",
    projects: ["冬夜咖啡", "城市慢行"],
    sharedFields: [],
  },
  {
    id: "sun",
    name: "孙苇",
    role: "场地经理",
    company: "城际场务",
    phone: "136 0000 9054",
    email: "sunwei@example.com",
    projects: ["城市慢行"],
    sharedFields: ["name", "role", "company", "phone"],
  },
]

export function PersonalContacts({ teamId }: { teamId: TeamId }) {
  const team = getTeam(teamId)
  const [contacts, setContacts] = useState(initialContacts)
  const [selectedId, setSelectedId] = useState(initialContacts[0].id)
  const [query, setQuery] = useState("")
  const [dialog, setDialog] = useState<"edit" | "share" | null>(null)
  const [draftContact, setDraftContact] = useState({
    name: "",
    role: "",
    company: "",
    phone: "",
    email: "",
  })
  const selected = contacts.find((contact) => contact.id === selectedId) ?? contacts[0]
  const filtered = contacts.filter((contact) =>
    `${contact.name}${contact.role}${contact.company}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

  const toggleSharedField = (field: string) => {
    setContacts((current) =>
      current.map((contact) =>
        contact.id === selected.id
          ? {
              ...contact,
              sharedFields: contact.sharedFields.includes(field)
                ? contact.sharedFields.filter((item) => item !== field)
                : [...contact.sharedFields, field],
            }
          : contact,
      ),
    )
  }

  return (
    <PageFrame>
      <WorkspaceHeader
        title="个人联系人"
        actions={
          <Button size="sm" className="min-h-11" onClick={() => setDialog("edit")}>
            <Plus />
            新建联系人
          </Button>
        }
      />
      <WorkspaceListPane
        listWidth="320px"
        listLabel="个人联系人列表"
        detailLabel={`${selected.name} 联系人详情`}
        listHeader={
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索个人联系人"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索姓名、职业或公司"
                className="pl-8"
              />
            </div>
          </div>
        }
        list={filtered.map((contact) => (
          <button
            key={contact.id}
            type="button"
            aria-current={contact.id === selected.id ? "true" : undefined}
            onClick={() => setSelectedId(contact.id)}
            className={cn(
              "flex w-full items-center gap-3 border-b border-border p-3 text-left hover:bg-muted",
              contact.id === selected.id && "bg-primary/6",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center border border-border bg-muted text-xs font-semibold">
              {contact.name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" title={contact.name}>
                {contact.name}
              </span>
              <span
                className="block truncate text-xs text-muted-foreground"
                title={`${contact.role} · ${contact.company}`}
              >
                {contact.role} · {contact.company}
              </span>
            </span>
            {contact.sharedFields.length ? (
              <Share2 className="size-3.5 text-primary" aria-label="已共享部分字段" />
            ) : null}
          </button>
        ))}
        detailHeader={
          <SectionHeader
            title={selected.name}
            detail="归繁星个人所有"
            action={
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setDialog("share")}>
                  <Share2 />
                  共享到团队
                </Button>
                <IconButton label="更多操作">
                  <MoreHorizontal />
                </IconButton>
              </div>
            }
          />
        }
        detail={
          <>
            <div className="grid gap-px bg-border sm:grid-cols-2">
              {[
                ["职业", selected.role, UserRound],
                ["公司", selected.company, ContactRound],
                ["电话", selected.phone, Link2],
                ["邮箱", selected.email, FileText],
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="bg-background p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="size-3.5" />
                    {label as string}
                  </div>
                  <div className="mt-2 text-sm font-medium">{value as string}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-4">
              <h3 className="text-xs font-semibold">项目关联</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.projects.map((project) => (
                  <StatusBadge key={project} tone="primary">
                    {project}
                  </StatusBadge>
                ))}
              </div>
            </div>
            <div className="border-t border-border p-4">
              <h3 className="text-xs font-semibold">当前共享状态</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {selected.sharedFields.length
                  ? `已向当前团队共享 ${selected.sharedFields.length} 个字段。未共享字段仍只对繁星和个人 Agent 可见。`
                  : "尚未共享到当前团队，记录仅繁星与个人 Agent 可见。"}
              </p>
            </div>
          </>
        }
      />

      <Dialog open={dialog === "share"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>共享 {selected.name} 到当前团队</DialogTitle>
            <DialogDescription>
              仅勾选字段会进入 {team.name} 资源库；取消共享不会删除历史项目引用。
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border border border-border">
            {[
              ["name", "姓名"],
              ["role", "职业"],
              ["company", "公司"],
              ["phone", "电话"],
              ["email", "邮箱"],
            ].map(([field, label]) => (
              <label key={field} className="flex h-11 items-center gap-3 px-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.sharedFields.includes(field)}
                  onChange={() => toggleSharedField(field)}
                  className="size-4 accent-primary"
                />
                <span className="flex-1">{label}</span>
                {selected.sharedFields.includes(field) ? (
                  <Check className="size-3.5 text-primary" />
                ) : null}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button onClick={() => setDialog(null)}>
              <Share2 />
              更新共享
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "edit"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建个人联系人</DialogTitle>
            <DialogDescription>
              新记录默认仅个人可见，创建后可按字段共享。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["name", "姓名"],
              ["role", "职业"],
              ["company", "公司"],
              ["phone", "电话"],
              ["email", "邮箱"],
            ].map(([field, placeholder]) => (
              <Input
                key={field}
                aria-label={placeholder}
                value={draftContact[field as keyof typeof draftContact]}
                onChange={(event) =>
                  setDraftContact((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                placeholder={placeholder}
                className={field === "email" ? "sm:col-span-2" : undefined}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              disabled={!draftContact.name.trim()}
              onClick={() => {
                const contact: Contact = {
                  id: `contact-${Date.now()}`,
                  name: draftContact.name.trim(),
                  role: draftContact.role.trim() || "未填写",
                  company: draftContact.company.trim() || "未填写",
                  phone: draftContact.phone.trim() || "未填写",
                  email: draftContact.email.trim() || "未填写",
                  projects: [],
                  sharedFields: [],
                }
                setContacts((current) => [contact, ...current])
                setSelectedId(contact.id)
                setDraftContact({ name: "", role: "", company: "", phone: "", email: "" })
                setDialog(null)
              }}
            >
              创建联系人
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
