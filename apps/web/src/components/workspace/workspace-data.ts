import type { WorkspaceContext } from "@shadowproducer/contracts"
import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  Clapperboard,
  ClipboardList,
  ContactRound,
  FileText,
  FolderKanban,
  GalleryVerticalEnd,
  LayoutDashboard,
  Library,
  ListChecks,
  ScrollText,
  ShieldCheck,
  StickyNote,
  Trash2,
  UsersRound,
} from "lucide-react"

export type TeamId = string
export type WorkspaceTeam = WorkspaceContext["teams"][number]
export type WorkspaceProject = WorkspaceTeam["projects"][number]
export type WorkspaceScopedProject = WorkspaceProject & { teamId: TeamId }
export type WorkspaceScope = "personal" | "team" | "project"
export type WorkspaceView =
  | "dashboard"
  | "calendar"
  | "notes"
  | "personal-contacts"
  | "team"
  | "resources"
  | "portfolio"
  | "permissions"
  | "audit"
  | "recycle-bin"
  | "project"
  | "scripts"
  | "breakdown"
  | "schedule"
  | "reviews"

export type TeamOption = {
  id: TeamId
  name: string
  shortName: string
  role: string
  description: string
  memberCount: number
}

export type ProjectStatus = "筹备中" | "拍摄中" | "后期" | "已归档"

export type ProjectOption = {
  id: string
  teamId: TeamId
  name: string
  status: ProjectStatus
  role: string
  updatedAt: string
}

export type ProjectId = string

export type WorkspaceNavItem = {
  id: WorkspaceView
  label: string
  icon: LucideIcon
  scope: WorkspaceScope
  count?: number
}

export const teamOptions: TeamOption[] = [
  {
    id: "north",
    name: "北岸影像",
    shortName: "北",
    role: "制片",
    description: "商业广告与叙事短片制作团队",
    memberCount: 12,
  },
  {
    id: "midnight",
    name: "午夜制作",
    shortName: "午",
    role: "制片",
    description: "品牌影像与后期制作协作团队",
    memberCount: 8,
  },
  {
    id: "external",
    name: "外部协作",
    shortName: "外",
    role: "访客",
    description: "跨团队联合项目与受限协作空间",
    memberCount: 5,
  },
]

export const projectOptions = [
  {
    id: "winter-coffee",
    teamId: "north",
    name: "冬夜咖啡",
    status: "拍摄中",
    role: "制片",
    updatedAt: "今天 10:20",
  },
  {
    id: "city-walk",
    teamId: "north",
    name: "城市慢行",
    status: "筹备中",
    role: "导演",
    updatedAt: "8 月 23 日",
  },
  {
    id: "north-brand-film",
    teamId: "north",
    name: "北岸品牌片",
    status: "筹备中",
    role: "制片",
    updatedAt: "8 月 22 日",
  },
  {
    id: "summer-station",
    teamId: "north",
    name: "夏末车站",
    status: "后期",
    role: "监制",
    updatedAt: "8 月 21 日",
  },
  {
    id: "mountain-letter",
    teamId: "north",
    name: "山中来信",
    status: "筹备中",
    role: "制片",
    updatedAt: "8 月 19 日",
  },
  {
    id: "blue-hour",
    teamId: "north",
    name: "蓝调时刻",
    status: "拍摄中",
    role: "联合制片",
    updatedAt: "8 月 18 日",
  },
  {
    id: "old-theater",
    teamId: "north",
    name: "旧剧场",
    status: "后期",
    role: "制片",
    updatedAt: "8 月 16 日",
  },
  {
    id: "harbor-morning",
    teamId: "north",
    name: "港口清晨",
    status: "已归档",
    role: "制片",
    updatedAt: "7 月 30 日",
  },
  {
    id: "paper-moon",
    teamId: "north",
    name: "纸月亮",
    status: "已归档",
    role: "监制",
    updatedAt: "7 月 12 日",
  },
  {
    id: "mercury-perfume",
    teamId: "midnight",
    name: "水星香氛",
    status: "后期",
    role: "制片",
    updatedAt: "今天 14:10",
  },
  {
    id: "neon-hotel",
    teamId: "midnight",
    name: "霓虹旅店",
    status: "拍摄中",
    role: "后期制片",
    updatedAt: "8 月 22 日",
  },
  {
    id: "after-rain",
    teamId: "midnight",
    name: "雨后",
    status: "筹备中",
    role: "制片",
    updatedAt: "8 月 18 日",
  },
  {
    id: "silent-product",
    teamId: "midnight",
    name: "静物计划",
    status: "已归档",
    role: "后期制片",
    updatedAt: "7 月 8 日",
  },
  {
    id: "river-doc",
    teamId: "external",
    name: "河流纪事",
    status: "后期",
    role: "访客",
    updatedAt: "8 月 20 日",
  },
  {
    id: "island-archive",
    teamId: "external",
    name: "岛屿档案",
    status: "筹备中",
    role: "审阅者",
    updatedAt: "8 月 17 日",
  },
] as const satisfies readonly ProjectOption[]

export const workspaceNavGroups: {
  scope: WorkspaceScope
  label: string
  items: WorkspaceNavItem[]
}[] = [
  {
    scope: "personal",
    label: "个人空间",
    items: [
      {
        id: "dashboard",
        label: "看板",
        icon: LayoutDashboard,
        scope: "personal",
        count: 8,
      },
      { id: "calendar", label: "我的日历", icon: CalendarDays, scope: "personal" },
      {
        id: "notes",
        label: "便签 / 笔记",
        icon: StickyNote,
        scope: "personal",
        count: 3,
      },
      {
        id: "personal-contacts",
        label: "个人联系人",
        icon: ContactRound,
        scope: "personal",
        count: 3,
      },
    ],
  },
  {
    scope: "team",
    label: "团队空间",
    items: [
      { id: "team", label: "团队概览", icon: UsersRound, scope: "team" },
      { id: "resources", label: "资源库", icon: Library, scope: "team", count: 8 },
      { id: "portfolio", label: "作品集", icon: GalleryVerticalEnd, scope: "team" },
      { id: "permissions", label: "权限", icon: ShieldCheck, scope: "team" },
      { id: "audit", label: "审计记录", icon: ScrollText, scope: "team" },
      { id: "recycle-bin", label: "回收站", icon: Trash2, scope: "team" },
    ],
  },
  {
    scope: "project",
    label: "项目空间",
    items: [
      { id: "project", label: "项目概览", icon: FolderKanban, scope: "project" },
      { id: "scripts", label: "脚本 / 分镜", icon: FileText, scope: "project", count: 2 },
      {
        id: "breakdown",
        label: "制片拆解",
        icon: ListChecks,
        scope: "project",
        count: 6,
      },
      { id: "schedule", label: "拍摄与通告", icon: ClipboardList, scope: "project" },
      { id: "reviews", label: "审片", icon: Clapperboard, scope: "project", count: 11 },
    ],
  },
]

export const workspaceNavItems = workspaceNavGroups.flatMap((group) => group.items)

export const personalViews: WorkspaceView[] = [
  "dashboard",
  "calendar",
  "notes",
  "personal-contacts",
]
export const teamViews: WorkspaceView[] = [
  "team",
  "resources",
  "portfolio",
  "permissions",
  "audit",
  "recycle-bin",
]
export const projectViews: WorkspaceView[] = [
  "project",
  "scripts",
  "breakdown",
  "schedule",
  "reviews",
]

export function getTeam(teamId: TeamId) {
  return teamOptions.find((team) => team.id === teamId) ?? teamOptions[0]
}

export function getProjectsForTeam(teamId: TeamId) {
  return projectOptions.filter((project) => project.teamId === teamId)
}

export function getProject(projectId: ProjectId) {
  return projectOptions.find((project) => project.id === projectId) ?? projectOptions[0]
}

export function isTeamId(value: string): value is TeamId {
  return teamOptions.some((team) => team.id === value)
}

export function isProjectId(value: string): value is ProjectId {
  return projectOptions.some((project) => project.id === value)
}

export function getViewScope(view: WorkspaceView): WorkspaceScope {
  if (personalViews.includes(view)) return "personal"
  if (teamViews.includes(view)) return "team"
  return "project"
}

export function isWorkspaceView(value: string): value is WorkspaceView {
  return workspaceNavItems.some((item) => item.id === value)
}
