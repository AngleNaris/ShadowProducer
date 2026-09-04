"use client"

import type {
  AgentExecutionResponse,
  AgentPreviewResponse,
  NotificationPreferences,
  WorkspaceContext,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Bell,
  Bot,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  LoaderCircle,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Send,
  Settings2,
  UserRound,
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { forwardRef, useEffect, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { commandFromAgentRequest } from "@/lib/agent-request"
import { ApiError, agentApi, workspaceApi } from "@/lib/api-client"
import { cn } from "@/lib/utils"

import { IconButton } from "./icon-button"
import {
  getViewScope,
  type ProjectId,
  type WorkspaceNavItem,
  type WorkspaceView,
  workspaceNavGroups,
} from "./workspace-data"

type WorkspaceTeam = WorkspaceContext["teams"][number]
type WorkspaceProject = WorkspaceTeam["projects"][number]

type WorkspaceShellProps = {
  activeView: WorkspaceView
  currentTeam: WorkspaceTeam
  currentProject: WorkspaceProject | null
  accountName: string
  accountEmail: string
  onNavigate: (view: WorkspaceView) => void
  onOpenTeamSelect: () => void
  onProjectChange: (projectId: ProjectId) => void
  onOpenProjectView: (projectId: ProjectId, view: WorkspaceView) => void
  onSignOut: () => void
  children: ReactNode
}

const viewAgentCopy: Record<
  WorkspaceView,
  { label: string; summary: string; actions: string[] }
> = {
  dashboard: {
    label: "看板",
    summary: "可查询当前团队中的任务，也可创建任务、便签与日程。",
    actions: [
      "查看当前任务",
      "创建便签：记录今天需要整理的事项",
      "请帮我创建日程 明天 9:00 项目跟进",
    ],
  },
  calendar: {
    label: "我的日历",
    summary: "可创建或调整个人日程，并读取当前团队任务与操作记录。",
    actions: [
      "请帮我创建日程 明天 9:00 项目跟进",
      "查看当前任务",
      "查看最近 10 条操作记录",
    ],
  },
  notes: {
    label: "便签 / 笔记",
    summary: "可创建或更新个人记录，并将明确事项创建为任务。",
    actions: [
      "创建便签：记录今天需要整理的事项",
      "查看当前任务",
      "查看最近 10 条操作记录",
    ],
  },
  "personal-contacts": {
    label: "个人联系人",
    summary: "可查询和维护个人联系人；共享字段仍按当前账号权限执行。",
    actions: [
      "查看个人通讯录",
      "团队有哪些联系人和供应商",
      "查询当前团队审计记录；最近 10 条",
    ],
  },
  team: {
    label: "团队概览",
    summary: "可查询当前团队任务、资源与有权查看的审计记录。",
    actions: [
      "团队有哪些联系人和供应商",
      "查询当前团队审计记录；最近 10 条",
      "查看当前任务",
    ],
  },
  resources: {
    label: "资源库",
    summary: "可查询团队资源或在当前权限范围内发起素材语义检索。",
    actions: [
      "团队有哪些联系人和供应商",
      "查询项目资源；关键词：灯光",
      "在资源库语义搜索“雨夜车站”，返回 8 条",
    ],
  },
  portfolio: {
    label: "作品集",
    summary: "可创建团队作品集草稿；公开发布仍会进入高风险确认。",
    actions: [
      "创建团队作品集草稿：项目成片精选；分类：商业；年份：2026",
      "发布作品集",
      "查询当前团队审计记录；动作：portfolio；最近 10 条",
    ],
  },
  permissions: {
    label: "权限",
    summary: "可查询权限相关审计与团队资源；权限调整仍在页面内完成。",
    actions: [
      "查询当前团队审计记录；动作：permission；最近 10 条",
      "团队有哪些联系人和供应商",
      "查看当前任务",
    ],
  },
  audit: {
    label: "审计记录",
    summary: "可按当前账号的可见范围查询团队或项目操作记录。",
    actions: [
      "查询当前团队审计记录；最近 10 条",
      "查看最近 5 条操作记录",
      "查询当前团队审计记录；动作：call-sheet；最近 10 条",
    ],
  },
  "recycle-bin": {
    label: "回收站",
    summary: "可查询删除相关审计；恢复与永久删除仍在回收站页面内完成。",
    actions: ["查询当前团队审计记录；最近 10 条", "查看个人通讯录", "查看当前任务"],
  },
  project: {
    label: "项目概览",
    summary: "可读取当前项目的执行计划、审片反馈与项目资源。",
    actions: [
      "查看项目执行计划和拍摄日",
      "查看当前项目的审片反馈",
      "查询项目资源；关键词：灯光",
    ],
  },
  scripts: {
    label: "脚本 / 分镜",
    summary: "可发起脚本拆解分析，并查询当前项目的资源与操作记录。",
    actions: [
      "分析脚本生成制片拆解",
      "查看最近 10 条操作记录",
      "查询项目资源；关键词：脚本",
    ],
  },
  reviews: {
    label: "审片",
    summary: "可读取或整理版本反馈，并为明确的审片文件创建受控链接。",
    actions: [
      "查看当前项目的审片反馈",
      "整理审片反馈；主版本：主片 v12；对比版本：主片 v11",
      "为审片文件“主片 v11”生成客户审片链接",
    ],
  },
  breakdown: {
    label: "制片拆解",
    summary: "可确认明确分类的候选，并查询关联资源与项目计划。",
    actions: [
      "确认制片拆解分类“演员与角色”",
      "查询项目资源；关键词：道具",
      "查看项目执行计划和拍摄日",
    ],
  },
  schedule: {
    label: "拍摄与通告",
    summary: "可读取执行计划，并查询通告相关审计与当前任务。",
    actions: [
      "查看项目执行计划和拍摄日",
      "查询当前团队审计记录；动作：call-sheet；最近 10 条",
      "查看当前任务",
    ],
  },
}

const ScopeSwitcherTrigger = forwardRef<
  HTMLButtonElement,
  {
    compact: boolean
    icon: ReactNode
    eyebrow: string
    label: string
    ariaLabel: string
  } & Omit<ComponentProps<typeof Button>, "children">
>(function ScopeSwitcherTrigger(
  { compact, icon, eyebrow, label, ariaLabel, className, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      {...props}
      variant="ghost"
      aria-label={ariaLabel}
      className={cn(
        "h-full min-w-0 gap-2 border-r border-border px-3 font-normal hover:bg-muted",
        compact ? "max-w-24 gap-1.5 px-2" : "min-w-40 justify-between",
        className,
      )}
    >
      {icon}
      <span className={cn("min-w-0 text-left", compact && "max-w-14")}>
        {compact ? null : (
          <span className="block truncate text-xs text-muted-foreground">{eyebrow}</span>
        )}
        <span className="block truncate text-sm font-semibold" title={label}>
          {label}
        </span>
      </span>
      <ChevronDown
        className={cn("size-3.5 shrink-0 text-muted-foreground", compact && "hidden")}
      />
    </Button>
  )
})

function ScopeOptionRow({
  value,
  initial,
  name,
  meta,
  selected,
  onSelect,
}: {
  value: string
  initial: string
  name: string
  meta: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem value={value} onSelect={onSelect} className="min-h-11 py-2.5">
      <span className="grid size-8 place-items-center border border-border bg-muted text-xs font-semibold">
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium" title={name}>
          {name}
        </span>
        <span className="block truncate text-xs text-muted-foreground" title={meta}>
          {meta}
        </span>
      </span>
      {selected ? <Check className="size-4 text-primary" /> : null}
    </CommandItem>
  )
}

function TeamSwitcher({
  compact = false,
  currentTeam,
  onOpenTeamSelect,
}: {
  compact?: boolean
  currentTeam: WorkspaceTeam
  onOpenTeamSelect: () => void
}) {
  return (
    <ScopeSwitcherTrigger
      compact={compact}
      eyebrow="当前团队"
      label={currentTeam.name}
      ariaLabel={`打开团队选择，当前团队：${currentTeam.name}`}
      icon={<Building2 className="size-4 shrink-0 text-primary" />}
      onClick={onOpenTeamSelect}
    />
  )
}

function ProjectSwitcher({
  compact = false,
  team,
  currentProject,
  onProjectChange,
}: {
  compact?: boolean
  team: WorkspaceTeam
  currentProject: WorkspaceProject
  onProjectChange: (projectId: ProjectId) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<"all" | "active" | "archived">("all")
  const filteredProjects = team.projects.filter((project) => {
    if (filter === "archived") return project.status === "已归档"
    if (filter === "active") return project.status !== "已归档"
    return true
  })
  const recentProjects = filteredProjects.slice(0, 2)
  const remainingProjects = filteredProjects.slice(2)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ScopeSwitcherTrigger
          compact={compact}
          eyebrow="当前项目"
          label={currentProject.name}
          ariaLabel={`切换当前项目：${currentProject.name}`}
          icon={<Clapperboard className="size-4 shrink-0 text-primary" />}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(340px,calc(100vw-16px))] border-border p-0"
      >
        <Command>
          <CommandInput aria-label="搜索项目" placeholder="搜索项目、状态或角色" />
          <fieldset className="grid grid-cols-3 border-b border-border p-1">
            <legend className="sr-only">按项目状态筛选</legend>
            {[
              { id: "all", label: "全部" },
              { id: "active", label: "进行中" },
              { id: "archived", label: "已归档" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id as typeof filter)}
                className={cn(
                  "h-11 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                  filter === item.id && "bg-primary/8 font-medium text-primary",
                )}
              >
                {item.label}
              </button>
            ))}
          </fieldset>
          <CommandList>
            <CommandEmpty>没有找到项目</CommandEmpty>
            <CommandGroup heading="最近访问">
              {recentProjects.map((project) => (
                <ScopeOptionRow
                  key={project.id}
                  value={`${project.name} ${project.status} ${project.role} ${team.name}`}
                  initial={project.name.slice(0, 1)}
                  name={project.name}
                  meta={`${project.status} · ${project.role}`}
                  selected={project.id === currentProject.id}
                  onSelect={() => {
                    onProjectChange(project.id)
                    setOpen(false)
                  }}
                />
              ))}
            </CommandGroup>
            {remainingProjects.length ? (
              <CommandGroup heading={`全部项目 · ${filteredProjects.length}`}>
                {remainingProjects.map((project) => (
                  <ScopeOptionRow
                    key={project.id}
                    value={`${project.name} ${project.status} ${project.role} ${team.name}`}
                    initial={project.name.slice(0, 1)}
                    name={project.name}
                    meta={`${project.status} · ${project.role}`}
                    selected={project.id === currentProject.id}
                    onSelect={() => {
                      onProjectChange(project.id)
                      setOpen(false)
                    }}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function NavItemContent({ item }: { item: WorkspaceNavItem }) {
  const Icon = item.icon

  return (
    <>
      <Icon className="size-4" />
      <span className="flex-1">{item.label}</span>
    </>
  )
}

function NavigationItems({
  activeView,
  items,
  onNavigate,
  mobile = false,
}: {
  activeView: WorkspaceView
  items: WorkspaceNavItem[]
  onNavigate: (view: WorkspaceView) => void
  mobile?: boolean
}) {
  return items.map((item) => {
    const active = item.id === activeView

    if (mobile) {
      return (
        <DropdownMenuItem
          key={item.id}
          onSelect={() => onNavigate(item.id)}
          aria-current={active ? "page" : undefined}
          className={cn("h-11", active && "bg-primary/8 font-medium text-primary")}
        >
          <NavItemContent item={item} />
        </DropdownMenuItem>
      )
    }

    return (
      <button
        key={item.id}
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={() => onNavigate(item.id)}
        className={cn(
          "relative flex min-h-11 w-full items-center gap-2.5 border-l-2 px-2.5 text-left text-sm transition-colors",
          active
            ? "border-primary bg-primary/8 font-medium text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <NavItemContent item={item} />
      </button>
    )
  })
}

function AppSidebar({
  activeView,
  accountName,
  accountEmail,
  onNavigate,
  onSignOut,
}: {
  activeView: WorkspaceView
  accountName: string
  accountEmail: string
  onNavigate: (view: WorkspaceView) => void
  onSignOut: () => void
}) {
  return (
    <aside className="hidden min-h-0 border-r border-border bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <div className="grid size-7 place-items-center bg-primary text-xs font-black text-primary-foreground">
          SP
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">ShadowProducer</div>
          <div className="truncate text-xs text-muted-foreground">制片协作工作台</div>
        </div>
      </div>

      <nav
        data-scroll-owner
        className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
        aria-label="工作空间导航"
      >
        {workspaceNavGroups.map((group) => (
          <div key={group.scope} className="mb-4 last:mb-0">
            <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">
              {group.label}
            </div>
            <NavigationItems
              activeView={activeView}
              items={group.items}
              onNavigate={onNavigate}
            />
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-12 w-full justify-start gap-3 px-2">
              <Avatar className="size-8 shrink-0 rounded-none">
                <AvatarFallback className="rounded-none bg-foreground text-xs font-semibold text-background">
                  {accountName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{accountName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {accountEmail}
                </span>
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-52">
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

function Topbar({
  activeView,
  currentTeam,
  currentProject,
  onNavigate,
  onOpenTeamSelect,
  onProjectChange,
  onOpenProjectView,
  onSignOut,
}: {
  activeView: WorkspaceView
  currentTeam: WorkspaceTeam
  currentProject: WorkspaceProject | null
  onNavigate: (view: WorkspaceView) => void
  onOpenTeamSelect: () => void
  onProjectChange: (projectId: ProjectId) => void
  onOpenProjectView: (projectId: ProjectId, view: WorkspaceView) => void
  onSignOut: () => void
}) {
  const projectSpaceActive = getViewScope(activeView) === "project"
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  const projects = currentTeam.projects
  const navItems = workspaceNavGroups.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupLabel: group.label })),
  )

  return (
    <>
      <header className="flex h-14 min-w-0 items-center border-b border-border bg-background">
        <div className="flex h-full min-w-0 flex-1 items-stretch">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="打开项目导航"
                className="h-full w-11 border-r border-border md:hidden"
              >
                <Menu />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem
                className="h-11 sm:hidden"
                onSelect={() => setSearchOpen(true)}
              >
                <Search />
                全局搜索
              </DropdownMenuItem>
              {workspaceNavGroups.map((group) => (
                <div key={group.scope}>
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  <NavigationItems
                    activeView={activeView}
                    items={group.items}
                    onNavigate={onNavigate}
                    mobile
                  />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden sm:block">
            <TeamSwitcher currentTeam={currentTeam} onOpenTeamSelect={onOpenTeamSelect} />
          </div>
          <div className="h-full min-w-0 sm:hidden">
            <TeamSwitcher
              compact
              currentTeam={currentTeam}
              onOpenTeamSelect={onOpenTeamSelect}
            />
          </div>
          {projectSpaceActive && currentProject ? (
            <>
              <div className="hidden sm:block">
                <ProjectSwitcher
                  team={currentTeam}
                  currentProject={currentProject}
                  onProjectChange={onProjectChange}
                />
              </div>
              <div className="h-full min-w-0 sm:hidden">
                <ProjectSwitcher
                  compact
                  team={currentTeam}
                  currentProject={currentProject}
                  onProjectChange={onProjectChange}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="flex h-full items-center border-l border-border px-1">
          <IconButton
            label="全局搜索"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:inline-flex"
          >
            <Search />
          </IconButton>
          <NotificationPopover
            teamId={currentTeam.id}
            projects={currentTeam.projects}
            onNavigate={onNavigate}
            onOpenProjectView={onOpenProjectView}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="退出登录"
            title="退出登录"
            className="md:hidden"
            onClick={onSignOut}
          >
            <UserRound />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="打开 ShadowProducer Agent"
                  className="h-11 w-11 gap-2 px-0 text-muted-foreground hover:bg-primary/8 hover:text-primary lg:w-auto lg:px-2.5"
                >
                  <Bot className="size-4" />
                  <span className="hidden lg:inline">Agent</span>
                </Button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>打开 Agent</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="全局搜索"
        description="搜索当前团队中的页面与项目"
        className="sm:max-w-lg"
      >
        <Command>
          <CommandInput aria-label="全局搜索" placeholder="搜索页面、项目或状态" />
          <CommandList>
            <CommandEmpty>没有找到匹配内容</CommandEmpty>
            <CommandGroup heading="页面">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.groupLabel}`}
                    onSelect={() => {
                      onNavigate(item.id)
                      setSearchOpen(false)
                    }}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {item.groupLabel}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandGroup heading="项目">
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`${project.name} ${project.status} ${project.role}`}
                  onSelect={() => {
                    onProjectChange(project.id)
                    setSearchOpen(false)
                  }}
                >
                  <Clapperboard className="size-4 text-muted-foreground" />
                  <span>{project.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {project.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}

function NotificationPopover({
  teamId,
  projects,
  onNavigate,
  onOpenProjectView,
}: {
  teamId: string
  projects: WorkspaceProject[]
  onNavigate: (view: WorkspaceView) => void
  onOpenProjectView: (projectId: ProjectId, view: WorkspaceView) => void
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const notificationsKey = ["workspace-notifications", teamId] as const
  const preferencesKey = ["notification-preferences", teamId] as const
  const notificationsQuery = useQuery({
    queryKey: notificationsKey,
    queryFn: () => workspaceApi.listNotifications(teamId),
  })
  const preferencesQuery = useQuery({
    queryKey: preferencesKey,
    queryFn: () => workspaceApi.getNotificationPreferences(teamId),
    enabled: open,
  })
  const refreshNotifications = () =>
    queryClient.invalidateQueries({ queryKey: notificationsKey })
  const stateMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "read" | "acknowledge" }) =>
      workspaceApi.updateNotification(teamId, id, { action }),
    onSuccess: refreshNotifications,
  })
  const readAllMutation = useMutation({
    mutationFn: () => workspaceApi.markAllNotificationsRead(teamId),
    onSuccess: refreshNotifications,
  })
  const preferencesMutation = useMutation({
    mutationFn: (preferences: NotificationPreferences) =>
      workspaceApi.updateNotificationPreferences(teamId, preferences),
    onSuccess: (preferences) => {
      queryClient.setQueryData(preferencesKey, preferences)
    },
  })
  const unread = (notificationsQuery.data?.unreadCount ?? 0) > 0
  const error = stateMutation.error ?? readAllMutation.error ?? preferencesMutation.error

  const openNotification = (notification: {
    id: string
    kind: string
    projectId: string | null
  }) => {
    stateMutation.mutate({ id: notification.id, action: "read" })
    if (
      notification.kind === "team_permission_assigned" ||
      notification.kind === "project_permission_assigned"
    ) {
      onNavigate("permissions")
      setOpen(false)
      return
    }
    if (
      notification.kind === "portfolio_published" ||
      notification.kind === "portfolio_unpublished"
    ) {
      onNavigate("portfolio")
      setOpen(false)
      return
    }
    if (
      notification.kind === "contact_share_updated" ||
      notification.kind === "contact_share_revoked"
    ) {
      onNavigate("resources")
      setOpen(false)
      return
    }
    if (
      notification.kind === "review_comment_created" ||
      notification.kind === "review_comment_replied" ||
      notification.kind === "review_file_approved"
    ) {
      const project = projects.find(
        (candidate) => candidate.id === notification.projectId,
      )
      if (project) onOpenProjectView(project.id, "reviews")
      else onNavigate("reviews")
      setOpen(false)
      return
    }
    const project = projects.find((candidate) => candidate.id === notification.projectId)
    if (project) onOpenProjectView(project.id, "schedule")
    else onNavigate("schedule")
    setOpen(false)
  }

  const updatePreference = (key: keyof NotificationPreferences, checked: boolean) => {
    const current = preferencesQuery.data
    if (!current) return
    preferencesMutation.mutate({ ...current, [key]: checked })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) void notificationsQuery.refetch()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={unread ? "通知，有未读消息" : "通知"}
          title={unread ? "通知，有未读消息" : "通知"}
          className={cn(unread && "text-primary", "hover:text-foreground")}
        >
          <Bell className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-16px))] p-0">
        <div className="flex min-h-12 items-center gap-2 border-b border-border px-3">
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold">通知</span>
            {unread ? (
              <span className="ml-2 text-xs text-muted-foreground">
                {notificationsQuery.data?.unreadCount} 条未读
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 px-2 text-xs"
            disabled={!unread || readAllMutation.isPending}
            onClick={() => readAllMutation.mutate()}
          >
            全部已读
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="通知设置"
                title="通知设置"
              >
                <Settings2 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>通知偏好</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={preferencesQuery.data?.publishedCallSheets ?? true}
                disabled={preferencesQuery.isPending || preferencesMutation.isPending}
                onCheckedChange={(checked) =>
                  updatePreference("publishedCallSheets", checked === true)
                }
              >
                通告正式发布
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferencesQuery.data?.importantCallSheetChanges ?? true}
                disabled={preferencesQuery.isPending || preferencesMutation.isPending}
                onCheckedChange={(checked) =>
                  updatePreference("importantCallSheetChanges", checked === true)
                }
              >
                已发布通告的重要变更
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferencesQuery.data?.permissionAssignments ?? true}
                disabled={preferencesQuery.isPending || preferencesMutation.isPending}
                onCheckedChange={(checked) =>
                  updatePreference("permissionAssignments", checked === true)
                }
              >
                团队与项目权限变更
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferencesQuery.data?.portfolioPublications ?? true}
                disabled={preferencesQuery.isPending || preferencesMutation.isPending}
                onCheckedChange={(checked) =>
                  updatePreference("portfolioPublications", checked === true)
                }
              >
                作品集发布与下架
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferencesQuery.data?.reviewActivity ?? true}
                disabled={preferencesQuery.isPending || preferencesMutation.isPending}
                onCheckedChange={(checked) =>
                  updatePreference("reviewActivity", checked === true)
                }
              >
                审片评论与批准
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={preferencesQuery.data?.contactSharing ?? true}
                disabled={preferencesQuery.isPending || preferencesMutation.isPending}
                onCheckedChange={(checked) =>
                  updatePreference("contactSharing", checked === true)
                }
              >
                联系人共享与撤销
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-h-48 max-h-[min(420px,calc(100vh-96px))] overflow-y-auto">
          {notificationsQuery.isPending ? (
            <div className="grid min-h-48 place-items-center text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" />
                正在加载通知
              </span>
            </div>
          ) : notificationsQuery.isError ? (
            <div className="grid min-h-48 place-items-center gap-2 px-4 text-center text-xs text-muted-foreground">
              <span>通知暂时无法加载</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => notificationsQuery.refetch()}
              >
                <RefreshCw />
                重试
              </Button>
            </div>
          ) : notificationsQuery.data.items.length === 0 ? (
            <div className="grid min-h-48 place-items-center px-4 text-center text-xs text-muted-foreground">
              暂无通知
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notificationsQuery.data.items.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-stretch",
                    !notification.readAt && "bg-primary/[0.035]",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-col items-start justify-center gap-1 px-3 py-2.5 text-left hover:bg-muted/45"
                    onClick={() => openNotification(notification)}
                  >
                    <span
                      className={cn(
                        "line-clamp-2 text-xs",
                        !notification.readAt && "font-semibold",
                      )}
                    >
                      {notification.title}
                    </span>
                    <span className="line-clamp-2 text-xs leading-4 text-muted-foreground">
                      {notification.body}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {notification.projectName ? `${notification.projectName} · ` : ""}
                      {notification.sourceActorName} ·{" "}
                      {new Intl.DateTimeFormat("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(notification.createdAt))}
                    </span>
                  </button>
                  <div className="flex w-20 items-center justify-center border-l border-border px-1">
                    {notification.acknowledgedAt ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCheck className="size-3.5" />
                        已确认
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 px-2 text-xs"
                        disabled={stateMutation.isPending}
                        onClick={() =>
                          stateMutation.mutate({
                            id: notification.id,
                            action: "acknowledge",
                          })
                        }
                      >
                        确认收到
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {error ? (
          <div
            role="alert"
            className="border-t border-border px-3 py-2 text-xs text-destructive"
          >
            {error instanceof ApiError ? error.message : "操作失败，请重试"}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function AgentPanel({
  activeView,
  team,
  project,
  accountName,
}: {
  activeView: WorkspaceView
  team: WorkspaceTeam
  project: WorkspaceProject | null
  accountName: string
}) {
  const queryClient = useQueryClient()
  const copy = viewAgentCopy[activeView]
  const scope = getViewScope(activeView)
  const [input, setInput] = useState("")
  const [pendingCommand, setPendingCommand] = useState<AgentPreviewResponse | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [messages, setMessages] = useState<
    { id: string; role: "user" | "agent"; text: string }[]
  >([])

  const appendMessage = (role: "user" | "agent", text: string) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, text }])
  }

  const executionText = (execution: AgentExecutionResponse) => {
    if (execution.result.kind === "audit_log_list") {
      const recent = execution.result.items
        .slice(0, 3)
        .map((item) => `${item.actorName}：${item.action}`)
      return recent.length
        ? `找到 ${execution.result.total} 条审计记录，最近操作：${recent.join("、")}。`
        : "没有符合筛选条件的审计记录。"
    }
    if (execution.result.kind === "team_resources_list") {
      const names = [
        ...execution.result.contacts.map((item) => item.name).filter(Boolean),
        ...execution.result.suppliers.map((item) => item.name),
        ...execution.result.assets.map((item) => item.name),
      ].slice(0, 5)
      const counts = `${execution.result.contacts.length} 位联系人、${execution.result.suppliers.length} 家供应商、${execution.result.assets.length} 项素材`
      return names.length ? `找到 ${counts}：${names.join("、")}。` : `找到 ${counts}。`
    }
    if (execution.result.kind === "asset_semantic_search") {
      const matches = execution.result.items
        .slice(0, 5)
        .map(
          (match) =>
            `${match.item.name}（${Math.max(0, Math.round(match.score * 100))}%）`,
        )
      return matches.length
        ? `找到 ${execution.result.items.length} 项语义匹配：${matches.join("、")}。`
        : "没有找到语义相近的素材。"
    }
    if (execution.result.kind === "personal_contact_list") {
      const names = execution.result.items.slice(0, 5).map((item) => item.name)
      return names.length
        ? `个人通讯录有 ${execution.result.items.length} 位联系人：${names.join("、")}。`
        : "个人通讯录中还没有联系人。"
    }
    if (execution.result.kind === "personal_contact_created") {
      return `个人联系人“${execution.result.item.name}”已创建。`
    }
    if (execution.result.kind === "personal_contact_updated") {
      return `个人联系人“${execution.result.item.name}”已更新。`
    }
    if (execution.result.kind === "personal_contact_shared") {
      return `个人联系人“${execution.result.item.name}”已共享给当前团队。`
    }
    if (execution.result.kind === "personal_contact_unshared") {
      return `个人联系人“${execution.result.item.name}”已停止向当前团队共享。`
    }
    if (execution.result.kind === "personal_contact_deleted") {
      return "个人联系人已移入回收站。"
    }
    if (execution.result.kind === "personal_contact_restored") {
      return `个人联系人“${execution.result.item.name}”已恢复。`
    }
    if (execution.result.kind === "team_contact_created") {
      return `团队联系人“${execution.result.item.name}”已创建。`
    }
    if (execution.result.kind === "team_supplier_created") {
      return `团队供应商“${execution.result.item.name}”已创建。`
    }
    if (execution.result.kind === "execution_schedule_list") {
      const stages = execution.result.stages.slice(0, 3).map((item) => item.name)
      const summary = `${execution.result.stages.length} 个执行阶段、${execution.result.shootingDays.length} 个拍摄日、${execution.result.conflicts.length} 项资源冲突`
      return stages.length
        ? `当前项目有 ${summary}：${stages.join("、")}。`
        : `当前项目有 ${summary}。`
    }
    if (execution.result.kind === "task_created") {
      return `已创建任务“${execution.result.item.title}”，刷新后仍可在任务列表中查看。`
    }
    if (execution.result.kind === "task_updated") {
      return `任务“${execution.result.item.title}”已更新。`
    }
    if (execution.result.kind === "portfolio_published") {
      return `作品集“${execution.result.item.title}”已公开发布。`
    }
    if (execution.result.kind === "portfolio_created") {
      return `作品集草稿“${execution.result.item.title}”已创建，当前仅团队可见。`
    }
    if (execution.result.kind === "portfolio_content_added") {
      return `已向作品集“${execution.result.item.title}”添加内容。`
    }
    if (execution.result.kind === "note_created") {
      return `${execution.result.item.kind === "note" ? "笔记" : "便签"}“${execution.result.item.title}”已创建。`
    }
    if (execution.result.kind === "note_updated") {
      return `${execution.result.item.kind === "note" ? "笔记" : "便签"}“${execution.result.item.title}”已更新。`
    }
    if (execution.result.kind === "calendar_event_created") {
      return `日程“${execution.result.item.title}”已创建。`
    }
    if (execution.result.kind === "calendar_event_updated") {
      return `日程“${execution.result.item.title}”的时间已更新。`
    }
    if (execution.result.kind === "execution_stage_created") {
      return `执行阶段“${execution.result.item.name}”已创建。`
    }
    if (execution.result.kind === "execution_stage_updated") {
      return `执行阶段“${execution.result.item.name}”已更新。`
    }
    if (execution.result.kind === "breakdown_updated") {
      return `制片拆解项“${execution.result.item.item}”已更新。`
    }
    if (execution.result.kind === "breakdown_confirmed") {
      return `已确认 ${execution.result.items.length} 项制片拆解候选。`
    }
    if (execution.result.kind === "shooting_day_created") {
      return `已创建 ${execution.result.item.shootDate} 的第 ${execution.result.item.dayNumber} 拍摄日“${execution.result.item.title}”。`
    }
    if (execution.result.kind === "shooting_day_updated") {
      return `拍摄日“${execution.result.item.title}”已更新。`
    }
    if (execution.result.kind === "call_sheet_created") {
      return `已创建 ${execution.result.item.date} 的通告表“${execution.result.item.title}”。`
    }
    if (execution.result.kind === "call_sheet_updated") {
      return `通告表“${execution.result.item.title}”已更新。`
    }
    if (execution.result.kind === "call_sheet_published") {
      return `通告表“${execution.result.item.title}”已正式发布为 v${execution.result.publication.version}。`
    }
    if (execution.result.kind === "script_version_created") {
      return `脚本版本 ${execution.result.item.id} 已创建，当前版本说明为“${execution.result.item.meta}”。`
    }
    if (execution.result.kind === "script_version_updated") {
      return `脚本版本 ${execution.result.item.id} 的协作正文已更新。`
    }
    if (execution.result.kind === "script_breakdown_analysis_created") {
      return `已提交脚本文档“${execution.result.item.sourceDocumentTitle}”的 ${execution.result.item.sourceVersionId} 版本进行制片拆解分析，结果将进入待确认清单。`
    }
    if (execution.result.kind === "media_analysis_created") {
      return `已提交视频素材“${execution.result.item.sourceAssetName}”进行镜头分析，结果将在资源库中持续更新。`
    }
    if (execution.result.kind === "review_feedback_list") {
      if (!execution.result.primaryFileId) {
        const names = execution.result.files.slice(0, 5).map((item) => item.name)
        return names.length
          ? `当前项目有 ${execution.result.files.length} 个审片版本：${names.join("、")}。`
          : "当前项目还没有审片版本。"
      }
      const comments = [
        ...execution.result.primaryComments,
        ...execution.result.compareComments,
      ].filter((item) => item.parentCommentId === null)
      const highlights = comments
        .filter((item) => item.state === "open")
        .slice(0, 3)
        .map((item) => `${item.timecode} ${item.text}`)
      const mapping = execution.result.correspondence
        ? `，${execution.result.correspondence.links.length} 组已确认对应、${execution.result.correspondence.suggestions.length} 组建议对应`
        : ""
      return `已整理 ${comments.length} 条根反馈${mapping}${highlights.length ? `。待处理重点：${highlights.join("；")}` : "。"}`
    }
    if (execution.result.kind === "review_file_created") {
      return `审片版本“${execution.result.item.name} ${execution.result.item.version}”已创建。`
    }
    if (execution.result.kind === "review_comment_created") {
      return `已在 ${execution.result.item.timecode} 添加审片意见。`
    }
    if (execution.result.kind === "review_comment_updated") {
      return `${execution.result.item.timecode} 的审片意见已${execution.result.item.state === "resolved" ? "解决" : "重新打开"}。`
    }
    if (execution.result.kind === "review_link_created") {
      return `客户审片链接已创建，有效期至 ${new Date(execution.result.item.expiresAt).toLocaleString("zh-CN")}：${execution.result.item.url}`
    }
    if (execution.result.kind === "review_file_approved") {
      return `审片版本“${execution.result.item.name}”已批准。`
    }
    const titles = execution.result.items.slice(0, 3).map((item) => item.title)
    return titles.length
      ? `当前团队共有 ${execution.result.items.length} 项任务，优先查看：${titles.join("、")}。`
      : "当前团队没有待处理任务。"
  }

  const execute = async (command: AgentPreviewResponse) => {
    const execution = await agentApi.execute(command.commandId)
    const scopedProjectId = command.scope.projectId ?? project?.id ?? ""
    appendMessage("agent", executionText(execution))
    if (execution.action === "create_task" || execution.action === "update_task") {
      void queryClient.invalidateQueries({
        queryKey: ["workspace-tasks", team.id],
      })
    }
    if (
      execution.action === "create_portfolio" ||
      execution.action === "add_portfolio_content" ||
      execution.action === "publish_portfolio"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["team-portfolios", team.id],
      })
    }
    if (execution.action === "create_team_contact") {
      void queryClient.invalidateQueries({
        queryKey: ["team-contacts", team.id],
      })
    }
    if (
      execution.action === "create_personal_contact" ||
      execution.action === "update_personal_contact" ||
      execution.action === "share_personal_contact" ||
      execution.action === "unshare_personal_contact" ||
      execution.action === "delete_personal_contact" ||
      execution.action === "restore_personal_contact"
    ) {
      void queryClient.invalidateQueries({ queryKey: ["personal-contacts"] })
      void queryClient.invalidateQueries({ queryKey: ["deleted-personal-contacts"] })
      void queryClient.invalidateQueries({ queryKey: ["team-contacts", team.id] })
    }
    if (execution.action === "create_team_supplier") {
      void queryClient.invalidateQueries({
        queryKey: ["team-suppliers", team.id],
      })
    }
    if (execution.action === "create_note" || execution.action === "update_note") {
      void queryClient.invalidateQueries({
        queryKey: ["workspace-notes", team.id],
      })
    }
    if (
      execution.action === "create_calendar_event" ||
      execution.action === "update_calendar_event"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["calendar-events", team.id],
      })
    }
    if (
      execution.action === "create_execution_stage" ||
      execution.action === "update_execution_stage"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["production-execution-schedule", scopedProjectId],
      })
    }
    if (
      execution.action === "update_breakdown" ||
      execution.action === "confirm_breakdown"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["production-breakdown", scopedProjectId],
      })
    }
    if (
      execution.action === "create_shooting_day" ||
      execution.action === "update_shooting_day"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["production-shooting-days", scopedProjectId],
      })
    }
    if (
      execution.action === "create_call_sheet" ||
      execution.action === "update_call_sheet" ||
      execution.action === "publish_call_sheet"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["production-call-sheets", scopedProjectId],
      })
      if (
        execution.action === "update_call_sheet" ||
        execution.action === "publish_call_sheet"
      ) {
        void queryClient.invalidateQueries({
          queryKey: ["production-call-sheet-history", scopedProjectId],
        })
      }
    }
    if (
      execution.action === "create_script_version" ||
      execution.action === "update_script_version"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["script-workspace", scopedProjectId],
      })
    }
    if (execution.action === "create_script_breakdown_analysis") {
      void queryClient.invalidateQueries({
        queryKey: ["analysis-jobs", scopedProjectId],
      })
    }
    if (
      execution.action === "create_media_analysis" &&
      execution.result.kind === "media_analysis_created"
    ) {
      void queryClient.invalidateQueries({
        queryKey: ["media-analysis", team.id, execution.result.item.assetId],
      })
    }
    if (
      (execution.action === "create_review_comment" ||
        execution.action === "update_review_comment") &&
      (execution.result.kind === "review_comment_created" ||
        execution.result.kind === "review_comment_updated")
    ) {
      void queryClient.invalidateQueries({
        queryKey: [
          "production-review-comments",
          scopedProjectId,
          execution.result.item.fileId,
        ],
      })
      void queryClient.invalidateQueries({
        queryKey: ["production-review-files", scopedProjectId],
      })
    }
    if (execution.action === "create_review_link") {
      void queryClient.invalidateQueries({
        queryKey: ["review-links", scopedProjectId],
      })
    }
    if (execution.action === "create_review_file") {
      void queryClient.invalidateQueries({
        queryKey: ["production-review-files", scopedProjectId],
      })
    }
    if (execution.action === "approve_review_file") {
      void queryClient.invalidateQueries({
        queryKey: ["production-review-files", scopedProjectId],
      })
      void queryClient.invalidateQueries({ queryKey: ["portfolio-candidates"] })
    }
  }

  const errorText = (error: unknown) =>
    error instanceof ApiError ? error.message : "Agent 暂时无法完成此命令，请稍后重试。"

  const submit = async () => {
    const request = input.trim()
    if (!request || isBusy) return
    setInput("")
    appendMessage("user", request)
    const command = commandFromAgentRequest(request, {
      teamId: team.id,
      projectId: project?.id ?? "",
      projectScoped: scope === "project" && Boolean(project),
    })
    if (!command) {
      appendMessage(
        "agent",
        "我没能可靠识别这条业务命令。请明确要查询审计记录或团队资源，创建团队联系人或供应商，查看、创建或更新任务，或创建笔记、日程、确认制片拆解、创建或更新执行计划、通告、脚本版本、审片意见、批准审片版本、客户审片链接或作品集草稿；我不会擅自改成其他操作。",
      )
      return
    }
    setIsBusy(true)
    try {
      const preview = await agentApi.preview(command)
      if (preview.requiresConfirmation) {
        setPendingCommand(preview)
      } else {
        await execute(preview)
      }
    } catch (error) {
      appendMessage("agent", errorText(error))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <SheetContent className="w-full gap-0 p-0 sm:max-w-[380px]">
      <SheetHeader className="shrink-0 border-b border-border p-4 text-left">
        <SheetTitle className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          ShadowProducer Agent
        </SheetTitle>
        <SheetDescription>
          当前作用域：{team.name}
          {scope === "project" && project ? ` · ${project.name}` : ""} · {copy.label}
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="flex-1 p-4">
          <div className="border-l-2 border-primary bg-primary/6 p-3">
            <div className="text-xs font-semibold">{copy.label}摘要</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.summary}</p>
          </div>
          <div className="mt-4 space-y-2">
            {copy.actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => setInput(action)}
                className="flex min-h-11 w-full items-center gap-2 border border-border p-3 text-left text-xs hover:border-primary hover:bg-primary/5"
              >
                <ChevronRight className="size-3 text-primary" />
                {action}
              </button>
            ))}
          </div>
          {messages.length ? (
            <div className="mt-5 divide-y divide-border border border-border">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "p-3 text-xs leading-5",
                    message.role === "user" ? "bg-muted/45" : "bg-background",
                  )}
                >
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                    {message.role === "user" ? accountName : "Agent"}
                  </div>
                  <div className="break-all">{message.text}</div>
                </div>
              ))}
            </div>
          ) : null}
        </ScrollArea>
        <div className="border-t border-border p-3">
          <div className="relative">
            <Textarea
              aria-label="向 Agent 提问"
              placeholder="询问当前项目，或发起一个需要确认的操作"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  void submit()
                }
              }}
              disabled={isBusy}
              className="min-h-24 resize-none pr-12"
            />
            <IconButton
              label="发送"
              onClick={() => void submit()}
              disabled={isBusy || !input.trim()}
              className="absolute right-2 bottom-2 bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground"
            >
              <Send />
            </IconButton>
          </div>
        </div>
      </div>
      <Dialog
        open={Boolean(pendingCommand)}
        onOpenChange={(open) => !open && setPendingCommand(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>高风险操作确认</DialogTitle>
            <DialogDescription>
              Agent 将以{accountName}的账号权限，在下列范围内执行此操作。
            </DialogDescription>
          </DialogHeader>
          <div className="border border-border">
            <div className="border-b border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
              操作请求
            </div>
            <div className="p-3 text-sm leading-6">{pendingCommand?.summary}</div>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-2">
            <div className="bg-background p-3">
              <div className="text-xs text-muted-foreground">授权主体</div>
              <div className="mt-1 text-sm font-medium">{accountName}</div>
            </div>
            <div className="bg-background p-3">
              <div className="text-xs text-muted-foreground">执行范围</div>
              <div className="mt-1 text-sm font-medium">
                {team.name} ·{" "}
                {pendingCommand?.scope.projectId
                  ? (project?.name ?? pendingCommand.scope.projectId)
                  : "团队范围"}
              </div>
            </div>
            <div className="bg-background p-3 sm:col-span-2">
              <div className="text-xs text-muted-foreground">确认有效期</div>
              <div className="mt-1 text-sm font-medium">
                {pendingCommand
                  ? new Intl.DateTimeFormat("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }).format(new Date(pendingCommand.expiresAt))
                  : "-"}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => setPendingCommand(null)}
            >
              取消
            </Button>
            <Button
              disabled={isBusy}
              onClick={async () => {
                if (!pendingCommand || isBusy) return
                setIsBusy(true)
                try {
                  await agentApi.confirm(pendingCommand.commandId)
                  await execute(pendingCommand)
                  setPendingCommand(null)
                } catch (error) {
                  appendMessage("agent", errorText(error))
                } finally {
                  setIsBusy(false)
                }
              }}
            >
              {isBusy ? "正在执行" : "确认并执行"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SheetContent>
  )
}

export function WorkspaceShell({
  activeView,
  currentTeam,
  currentProject,
  accountName,
  accountEmail,
  onNavigate,
  onOpenTeamSelect,
  onProjectChange,
  onOpenProjectView,
  onSignOut,
  children,
}: WorkspaceShellProps) {
  return (
    <Sheet>
      <div className="grid h-svh grid-cols-1 overflow-hidden bg-workspace md:grid-cols-[216px_minmax(0,1fr)]">
        <AppSidebar
          activeView={activeView}
          accountName={accountName}
          accountEmail={accountEmail}
          onNavigate={onNavigate}
          onSignOut={onSignOut}
        />
        <div className="flex min-h-0 min-w-0 flex-col">
          <Topbar
            activeView={activeView}
            currentTeam={currentTeam}
            currentProject={currentProject}
            onNavigate={onNavigate}
            onOpenTeamSelect={onOpenTeamSelect}
            onProjectChange={onProjectChange}
            onOpenProjectView={onOpenProjectView}
            onSignOut={onSignOut}
          />
          <main className="flex min-h-0 flex-1 p-0 lg:p-3">
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
              {children}
            </div>
          </main>
        </div>
      </div>
      <AgentPanel
        activeView={activeView}
        team={currentTeam}
        project={currentProject}
        accountName={accountName}
      />
    </Sheet>
  )
}
