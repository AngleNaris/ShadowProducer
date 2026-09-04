import type { PermissionAccess } from "@shadowproducer/application"
import type { PermissionCapability } from "@shadowproducer/contracts"
import type { Kysely, Transaction } from "kysely"

import type { Database } from "./database"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>

const teamCapabilities = new Set<PermissionCapability>([
  "team.read",
  "team.write",
  "team.permissions.manage",
  "asset.write",
  "portfolio.write",
  "portfolio.publish",
])

const projectCapabilities = new Set<PermissionCapability>([
  "project.read",
  "project.write",
  "script.write",
  "production.write",
  "call_sheet.publish",
  "review.write",
  "review.manage",
])

function legacyCapabilities(role: string, scope: "team" | "project") {
  if (scope === "team") {
    if (role === "viewer") return ["team.read"] satisfies PermissionCapability[]
    const permissions: PermissionCapability[] = [
      "team.read",
      "team.write",
      "asset.write",
      "portfolio.write",
      "portfolio.publish",
    ]
    if (["owner", "admin", "producer", "director"].includes(role)) {
      permissions.push("team.permissions.manage")
    }
    return permissions
  }
  if (role === "viewer") return ["project.read"] satisfies PermissionCapability[]
  return [
    "project.read",
    "project.write",
    "script.write",
    "production.write",
    "call_sheet.publish",
    "review.write",
    "review.manage",
  ] satisfies PermissionCapability[]
}

function normalizedCapabilities(
  value: readonly string[] | null,
  role: string,
  scope: "team" | "project",
) {
  if (!value) return legacyCapabilities(role, scope)
  const allowed = scope === "team" ? teamCapabilities : projectCapabilities
  return value.filter((item): item is PermissionCapability =>
    allowed.has(item as PermissionCapability),
  )
}

function access(capabilities: PermissionCapability[], scope: "team" | "project") {
  const read = scope === "team" ? "team.read" : "project.read"
  const write = scope === "team" ? "team.write" : "project.write"
  return {
    canRead: capabilities.includes(read),
    canWrite: capabilities.includes(write),
    capabilities,
  } satisfies PermissionAccess
}

export async function resolveTeamAccess(
  database: DatabaseExecutor,
  actorId: string,
  teamId: string,
) {
  const row = await database
    .selectFrom("team_memberships as membership")
    .leftJoin("permission_templates as template", (join) =>
      join
        .onRef("template.id", "=", "membership.permission_template_id")
        .onRef("template.team_id", "=", "membership.team_id")
        .on("template.scope", "=", "team"),
    )
    .select(["membership.role", "template.permissions"])
    .where("membership.account_id", "=", actorId)
    .where("membership.team_id", "=", teamId)
    .executeTakeFirst()
  if (!row) return null
  return access(normalizedCapabilities(row.permissions, row.role, "team"), "team")
}

export async function resolveProjectAccess(
  database: DatabaseExecutor,
  actorId: string,
  projectId: string,
  expectedTeamId?: string,
) {
  let query = database
    .selectFrom("projects as project")
    .innerJoin("team_memberships as team_membership", (join) =>
      join
        .onRef("team_membership.team_id", "=", "project.team_id")
        .on("team_membership.account_id", "=", actorId),
    )
    .innerJoin("project_memberships as project_membership", (join) =>
      join
        .onRef("project_membership.project_id", "=", "project.id")
        .on("project_membership.account_id", "=", actorId),
    )
    .leftJoin("permission_templates as team_template", (join) =>
      join
        .onRef("team_template.id", "=", "team_membership.permission_template_id")
        .onRef("team_template.team_id", "=", "project.team_id")
        .on("team_template.scope", "=", "team"),
    )
    .leftJoin("permission_templates as project_template", (join) =>
      join
        .onRef("project_template.id", "=", "project_membership.permission_template_id")
        .onRef("project_template.team_id", "=", "project.team_id")
        .on("project_template.scope", "=", "project"),
    )
    .select([
      "team_membership.role as team_role",
      "team_template.permissions as team_permissions",
      "project_membership.role as project_role",
      "project_template.permissions as project_permissions",
    ])
    .where("project.id", "=", projectId)
  if (expectedTeamId) query = query.where("project.team_id", "=", expectedTeamId)
  const row = await query.executeTakeFirst()
  if (!row) return null

  const teamAccess = access(
    normalizedCapabilities(row.team_permissions, row.team_role, "team"),
    "team",
  )
  const project = normalizedCapabilities(
    row.project_permissions,
    row.project_role,
    "project",
  )
  const effective = teamAccess.canRead
    ? project.filter((permission) => permission === "project.read" || teamAccess.canWrite)
    : []
  return access(effective, "project")
}

export async function listProjectMemberAccesses(
  database: DatabaseExecutor,
  projectId: string,
) {
  const rows = await database
    .selectFrom("project_memberships as project_membership")
    .innerJoin("projects as project", "project.id", "project_membership.project_id")
    .innerJoin("team_memberships as team_membership", (join) =>
      join
        .onRef("team_membership.team_id", "=", "project.team_id")
        .onRef("team_membership.account_id", "=", "project_membership.account_id"),
    )
    .leftJoin("permission_templates as team_template", (join) =>
      join
        .onRef("team_template.id", "=", "team_membership.permission_template_id")
        .onRef("team_template.team_id", "=", "project.team_id")
        .on("team_template.scope", "=", "team"),
    )
    .leftJoin("permission_templates as project_template", (join) =>
      join
        .onRef("project_template.id", "=", "project_membership.permission_template_id")
        .onRef("project_template.team_id", "=", "project.team_id")
        .on("project_template.scope", "=", "project"),
    )
    .select([
      "project_membership.account_id",
      "team_membership.role as team_role",
      "team_template.permissions as team_permissions",
      "project_membership.role as project_role",
      "project_template.permissions as project_permissions",
    ])
    .where("project_membership.project_id", "=", projectId)
    .execute()

  return rows.map((row) => {
    const teamAccess = access(
      normalizedCapabilities(row.team_permissions, row.team_role, "team"),
      "team",
    )
    const projectCapabilities = normalizedCapabilities(
      row.project_permissions,
      row.project_role,
      "project",
    )
    return {
      accountId: row.account_id,
      access: access(
        teamAccess.canRead
          ? projectCapabilities.filter(
              (capability) => capability === "project.read" || teamAccess.canWrite,
            )
          : [],
        "project",
      ),
    }
  })
}
