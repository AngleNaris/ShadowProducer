import assert from "node:assert/strict"
import test from "node:test"

import type {
  AuditLog,
  CallSheet,
  ExecutionStage,
  ShootingDay,
  WorkspaceContext,
} from "@shadowproducer/contracts"

import { buildProjectOverview } from "./project-overview.ts"

const project: WorkspaceContext["teams"][number]["projects"][number] = {
  id: "project-1",
  name: "真实项目",
  role: "制片",
  status: "拍摄中",
  updatedAt: "2026-09-01T08:00:00.000Z",
}

const stages: ExecutionStage[] = [
  {
    id: "stage-2",
    projectId: project.id,
    name: "拍摄执行",
    startsAt: "2026-09-02T00:00:00.000Z",
    endsAt: "2026-09-05T00:00:00.000Z",
    originalTimezone: "Asia/Shanghai",
    progress: 50,
    owner: "繁星",
    state: "进行中",
    note: "夜戏执行",
    resources: [],
    revision: 1,
    updatedAt: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "stage-1",
    projectId: project.id,
    name: "前期筹备",
    startsAt: "2026-08-20T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z",
    originalTimezone: "Asia/Shanghai",
    progress: 100,
    owner: "繁星",
    state: "已完成",
    note: "",
    resources: [],
    revision: 2,
    updatedAt: "2026-09-01T08:30:00.000Z",
  },
]

const shootingDay: ShootingDay = {
  id: "shoot-1",
  projectId: project.id,
  shootDate: "2026-09-03",
  dayNumber: 1,
  title: "车站夜戏",
  status: "拍摄中",
  originalTimezone: "Asia/Shanghai",
  revision: 1,
  updatedAt: "2026-09-01T09:10:00.000Z",
}

const callSheet: CallSheet = {
  id: "call-1",
  projectId: project.id,
  shootingDayId: shootingDay.id,
  date: "2026-09-03",
  day: "DAY 1 OF 1",
  title: "车站夜戏通告",
  status: "待确认",
  crewCall: "16:30",
  firstShot: "19:00",
  wrap: "23:30",
  weather: "晴",
  sunrise: "05:30",
  sunset: "18:20",
  basecamp: "停车场",
  location: "车站",
  hospital: "市医院",
  scenes: [],
  cast: [],
  departments: [],
  equipment: [],
  safety: [],
  transport: [],
  catering: [],
  keyContacts: [],
  nextDayPreview: { date: "", title: "", scenes: "", cast: "", note: "" },
  revision: 1,
  updatedAt: "2026-09-01T09:20:00.000Z",
}

const auditLogs: AuditLog[] = [
  {
    id: "1",
    actorAccountId: "account-1",
    actorName: "繁星",
    actorType: "user",
    teamId: "north",
    projectId: project.id,
    projectName: project.name,
    action: "execution-stage.updated",
    subjectId: "stage-2",
    metadata: {},
    createdAt: "2026-09-01T09:30:00.000Z",
  },
  {
    id: "2",
    actorAccountId: "account-2",
    actorName: "林乔",
    actorType: "user",
    teamId: "north",
    projectId: project.id,
    projectName: project.name,
    action: "script-version.updated",
    subjectId: "version-7",
    metadata: { title: "拍摄稿 v7" },
    createdAt: "2026-09-01T10:00:00.000Z",
  },
]

test("derives project progress, shooting milestone and latest activity from persisted data", () => {
  const overview = buildProjectOverview({
    project,
    stages,
    shootingDays: [shootingDay],
    callSheets: [callSheet],
    auditLogs,
  })

  assert.equal(overview.percent, 75)
  assert.equal(overview.currentStage, "拍摄执行")
  assert.deepEqual(
    overview.stages.map((item) => item.label),
    ["前期筹备", "拍摄执行"],
  )
  assert.deepEqual(overview.milestones[0], {
    id: "shooting-day:shoot-1",
    title: "拍摄日 1 · 车站夜戏",
    detail: "拍摄中 · 通告待确认",
    date: "9 月 3 日",
    state: "拍摄中",
    target: "schedule",
    sortAt: Date.parse("2026-09-03"),
  })
  assert.equal(overview.activities[0]?.title, "已更新 · 拍摄稿 v7")
  assert.equal(overview.activities[0]?.module, "脚本与分镜")
  assert.equal(overview.activities[1]?.title, "已更新 · 拍摄执行")
})

test("does not invent progress or milestones when no persisted plan exists", () => {
  const overview = buildProjectOverview({
    project,
    stages: [],
    shootingDays: [],
    callSheets: [],
    auditLogs: [],
  })

  assert.equal(overview.percent, null)
  assert.equal(overview.currentStage, project.status)
  assert.match(overview.summary, /尚未建立执行计划/)
  assert.deepEqual(overview.milestones, [])
  assert.deepEqual(overview.activities, [])
})
