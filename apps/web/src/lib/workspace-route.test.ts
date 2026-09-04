import assert from "node:assert/strict"
import test from "node:test"
import type { WorkspaceContext } from "@shadowproducer/contracts"

import {
  findWorkspaceProject,
  hashForRoute,
  routeForTeam,
  routeFromHash,
} from "./workspace-route.ts"

const context: WorkspaceContext = {
  actor: { id: "account-1", displayName: "繁星" },
  teams: [
    {
      id: "server-team",
      name: "服务端团队",
      role: "制片",
      memberCount: 2,
      projects: [
        {
          id: "server-project",
          name: "服务端项目",
          role: "制片",
          status: "拍摄中",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    },
    {
      id: "empty-team",
      name: "空团队",
      role: "成员",
      memberCount: 1,
      projects: [],
    },
  ],
}

test("workspace routes only accept teams and projects from the authorized context", () => {
  assert.deepEqual(routeFromHash("#/team/server-team/calendar", context), {
    teamId: "server-team",
    projectId: "server-project",
    view: "calendar",
  })
  assert.equal(routeFromHash("#/team/north/calendar", context), null)
  assert.deepEqual(
    routeFromHash("#/project/server-team/server-project/reviews", context),
    {
      teamId: "server-team",
      projectId: "server-project",
      view: "reviews",
    },
  )
  assert.equal(
    routeFromHash("#/project/empty-team/server-project/reviews", context),
    null,
  )
})

test("team and project helpers preserve empty teams and canonical hashes", () => {
  assert.deepEqual(routeForTeam(context.teams[1]), {
    teamId: "empty-team",
    projectId: "",
    view: "dashboard",
  })
  assert.equal(findWorkspaceProject(context, "server-project")?.team.id, "server-team")
  assert.equal(
    hashForRoute({
      teamId: "server-team",
      projectId: "server-project",
      view: "scripts",
    }),
    "#/project/server-team/server-project/scripts",
  )
})
