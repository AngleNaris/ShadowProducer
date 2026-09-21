import type { WorkspaceContext } from "@shadowproducer/contracts"

import {
  getViewScope,
  isWorkspaceView,
  type ProjectId,
  type TeamId,
  type WorkspaceView,
} from "../components/workspace/workspace-data.ts"

export type WorkspaceRoute = {
  teamId: TeamId
  projectId: ProjectId
  view: WorkspaceView
}

type WorkspaceTeam = WorkspaceContext["teams"][number]

export function routeForTeam(team: WorkspaceTeam): WorkspaceRoute {
  return {
    teamId: team.id,
    projectId: team.projects[0]?.id ?? "",
    view: team.role === null && team.projects[0] ? "project" : "dashboard",
  }
}

export function findWorkspaceProject(context: WorkspaceContext, projectId: string) {
  for (const team of context.teams) {
    const project = team.projects.find((candidate) => candidate.id === projectId)
    if (project) return { team, project }
  }
  return null
}

export function routeFromHash(
  hash: string,
  context: WorkspaceContext,
): WorkspaceRoute | null {
  const hashPath = hash.split("?")[0]
  const parts = hashPath.replace(/^#\/?/, "").split("/").filter(Boolean)
  if (!parts.length || parts[0] === "team-select") return null

  if (parts[0] === "team" && parts.length >= 3) {
    const team = context.teams.find((candidate) => candidate.id === parts[1])
    const candidate =
      parts[2] === "contacts" || parts[2] === "assets" ? "resources" : parts[2]
    if (
      team &&
      team.role !== null &&
      isWorkspaceView(candidate) &&
      getViewScope(candidate) !== "project"
    ) {
      return {
        teamId: team.id,
        projectId: team.projects[0]?.id ?? "",
        view: candidate,
      }
    }
  }

  if (
    parts[0] === "project" &&
    parts.length >= 4 &&
    isWorkspaceView(parts[3]) &&
    getViewScope(parts[3]) === "project"
  ) {
    const team = context.teams.find((candidate) => candidate.id === parts[1])
    const project = team?.projects.find((candidate) => candidate.id === parts[2])
    if (team && project) {
      return {
        teamId: team.id,
        projectId: project.id,
        view: parts[3],
      }
    }
  }

  return null
}

export function hashForRoute(route: WorkspaceRoute) {
  if (getViewScope(route.view) === "project") {
    return `#/project/${route.teamId}/${route.projectId}/${route.view}`
  }
  return `#/team/${route.teamId}/${route.view}`
}
