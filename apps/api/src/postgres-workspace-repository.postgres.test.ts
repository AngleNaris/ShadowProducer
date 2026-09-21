import {
  ContactService,
  ProductionService,
  WorkspaceService,
} from "@shadowproducer/application"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { PostgresAssetRepository } from "./postgres-asset-repository"
import { PostgresContactRepository } from "./postgres-contact-repository"
import { PostgresProductionRepository } from "./postgres-production-repository"
import { PostgresWorkspaceRepository } from "./postgres-workspace-repository"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 4 })
const database = createDatabase(databaseUrl, pool)
const workspaceRepository = new PostgresWorkspaceRepository(database)
const assetRepository = new PostgresAssetRepository(database)
const contactService = new ContactService(new PostgresContactRepository(database))
const productionRepository = new PostgresProductionRepository(database)
const service = new WorkspaceService(workspaceRepository)
const productionService = new ProductionService(productionRepository)
const runId = `pg-workspace-${process.pid}-${Date.now().toString(36)}`
const teamId = `${runId}-team`
const foreignTeamId = `${runId}-foreign-team`
const actorId = `${runId}-actor`
const otherId = `${runId}-other`
const reviewRecipientId = `${runId}-review-recipient`
const visibleProjectId = `${runId}-visible`
const hiddenProjectId = `${runId}-hidden`

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values([
      { id: actorId, display_name: "Audit Viewer", email: null },
      { id: otherId, display_name: "Hidden Project Member", email: null },
    ])
    .execute()
  await database
    .insertInto("teams")
    .values([
      { id: teamId, name: runId },
      { id: foreignTeamId, name: `${runId}-foreign` },
    ])
    .execute()
  await database
    .insertInto("permission_templates")
    .values([
      {
        id: `${teamId}:team-admin`,
        team_id: teamId,
        scope: "team",
        key: "team-admin",
        name: "团队管理员",
        permissions: JSON.stringify([
          "team.read",
          "team.write",
          "team.permissions.manage",
          "team.recycle.manage",
          "asset.write",
          "portfolio.write",
          "portfolio.publish",
        ]),
        is_system: true,
      },
      {
        id: `${teamId}:team-member`,
        team_id: teamId,
        scope: "team",
        key: "team-member",
        name: "团队成员",
        permissions: JSON.stringify([
          "team.read",
          "team.write",
          "asset.write",
          "portfolio.write",
          "portfolio.publish",
        ]),
        is_system: true,
      },
      {
        id: `${teamId}:team-viewer`,
        team_id: teamId,
        scope: "team",
        key: "team-viewer",
        name: "团队访客",
        permissions: JSON.stringify(["team.read"]),
        is_system: true,
      },
      {
        id: `${teamId}:project-manager`,
        team_id: teamId,
        scope: "project",
        key: "project-manager",
        name: "项目负责人",
        permissions: JSON.stringify([
          "project.read",
          "project.write",
          "script.write",
          "production.write",
          "call_sheet.publish",
          "review.write",
          "review.manage",
        ]),
        is_system: true,
      },
      {
        id: `${teamId}:project-contributor`,
        team_id: teamId,
        scope: "project",
        key: "project-contributor",
        name: "项目协作者",
        permissions: JSON.stringify([
          "project.read",
          "project.write",
          "script.write",
          "production.write",
          "review.write",
        ]),
        is_system: true,
      },
      {
        id: `${teamId}:project-viewer`,
        team_id: teamId,
        scope: "project",
        key: "project-viewer",
        name: "项目查看者",
        permissions: JSON.stringify(["project.read"]),
        is_system: true,
      },
      {
        id: `${foreignTeamId}:team-admin`,
        team_id: foreignTeamId,
        scope: "team",
        key: "team-admin",
        name: "外部团队管理员",
        permissions: JSON.stringify(["team.read", "team.write"]),
        is_system: true,
      },
    ])
    .execute()
  await database
    .insertInto("team_memberships")
    .values([
      {
        team_id: teamId,
        account_id: actorId,
        role: "member",
        permission_template_id: `${teamId}:team-admin`,
      },
      {
        team_id: teamId,
        account_id: otherId,
        role: "member",
        permission_template_id: `${teamId}:team-member`,
      },
    ])
    .execute()
  await database
    .insertInto("projects")
    .values([
      { id: visibleProjectId, team_id: teamId, name: "Visible Project" },
      { id: hiddenProjectId, team_id: teamId, name: "Hidden Project" },
    ])
    .execute()
  await database
    .insertInto("project_memberships")
    .values([
      {
        project_id: visibleProjectId,
        account_id: actorId,
        role: "producer",
        permission_template_id: `${teamId}:project-manager`,
      },
      {
        project_id: visibleProjectId,
        account_id: otherId,
        role: "producer",
        permission_template_id: `${teamId}:project-contributor`,
      },
      {
        project_id: hiddenProjectId,
        account_id: otherId,
        role: "producer",
        permission_template_id: `${teamId}:project-manager`,
      },
    ])
    .execute()
  await database
    .insertInto("audit_logs")
    .values([
      {
        actor_account_id: actorId,
        team_id: teamId,
        project_id: null,
        action: "team.settings.updated",
        subject_id: "team-settings",
        metadata: JSON.stringify({ label: "Team settings" }),
        created_at: new Date("2026-08-30T01:00:00.000Z"),
      },
      {
        actor_account_id: actorId,
        team_id: teamId,
        project_id: visibleProjectId,
        action: "script-version.updated",
        subject_id: "visible-v1",
        metadata: JSON.stringify({ label: "Visible version" }),
        created_at: new Date("2026-08-30T02:00:00.000Z"),
      },
      {
        actor_account_id: otherId,
        team_id: teamId,
        project_id: visibleProjectId,
        action: "task.created",
        subject_id: "visible-task",
        metadata: JSON.stringify({ label: "Visible task" }),
        created_at: new Date("2026-08-30T03:00:00.000Z"),
      },
      {
        actor_account_id: otherId,
        team_id: teamId,
        project_id: hiddenProjectId,
        action: "script-version.updated",
        subject_id: "hidden-v1",
        metadata: JSON.stringify({ label: "Hidden version" }),
        created_at: new Date("2026-08-30T04:00:00.000Z"),
      },
    ])
    .execute()
})

afterAll(async () => {
  await database
    .deleteFrom("execution_schedule_items")
    .where("project_id", "in", [visibleProjectId, hiddenProjectId])
    .execute()
  await database.deleteFrom("teams").where("id", "in", [teamId, foreignTeamId]).execute()
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "in", [actorId, otherId, reviewRecipientId])
    .execute()
  await database
    .deleteFrom("accounts")
    .where("id", "in", [actorId, otherId, reviewRecipientId])
    .execute()
  await database.destroy()
})

describe("Postgres workspace audit query", () => {
  it("lists, restores and permanently deletes workspace items with revision checks", async () => {
    const created = await service.createTask({
      actorId,
      teamId,
      projectId: visibleProjectId,
      title: "Recycle bin acceptance task",
      dueDate: "2026-09-03",
      idempotencyKey: `${runId}-recycle-task`,
    })
    await service.deleteTask({
      actorId,
      teamId,
      itemId: created.item.id,
      expectedRevision: created.item.revision,
    })

    expect((await service.listTasks(actorId, teamId)).items).not.toContainEqual(
      expect.objectContaining({ id: created.item.id }),
    )
    const recycled = await service.listDeletedItems(actorId, teamId)
    expect(recycled.items).toContainEqual(
      expect.objectContaining({
        id: created.item.id,
        kind: "task",
        projectId: visibleProjectId,
        revision: created.item.revision,
      }),
    )

    await expect(
      service.restoreDeletedItem({
        actorId,
        teamId,
        kind: "task",
        itemId: created.item.id,
        expectedRevision: created.item.revision + 1,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })

    await service.restoreDeletedItem({
      actorId,
      teamId,
      kind: "task",
      itemId: created.item.id,
      expectedRevision: created.item.revision,
    })
    expect((await service.listDeletedItems(actorId, teamId)).items).not.toContainEqual(
      expect.objectContaining({ id: created.item.id }),
    )
    expect((await service.listTasks(actorId, teamId)).items).toContainEqual(
      expect.objectContaining({ id: created.item.id, revision: 2 }),
    )

    await service.deleteTask({
      actorId,
      teamId,
      itemId: created.item.id,
      expectedRevision: 2,
    })
    await expect(
      service.permanentlyDeleteDeletedItem({
        actorId,
        teamId,
        kind: "task",
        itemId: created.item.id,
        expectedRevision: 3,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    await service.permanentlyDeleteDeletedItem({
      actorId,
      teamId,
      kind: "task",
      itemId: created.item.id,
      expectedRevision: 2,
    })
    expect(
      await database
        .selectFrom("workspace_tasks")
        .select("id")
        .where("id", "=", created.item.id)
        .executeTakeFirst(),
    ).toBeUndefined()

    const actions = await database
      .selectFrom("audit_logs")
      .select("action")
      .where("subject_id", "=", created.item.id)
      .orderBy("id", "asc")
      .execute()
    expect(actions.map((item) => item.action)).toEqual([
      "task.created",
      "task.deleted",
      "task.restored",
      "task.deleted",
      "task.permanently-deleted",
    ])
    await database
      .deleteFrom("audit_logs")
      .where("subject_id", "=", created.item.id)
      .execute()
    await database
      .deleteFrom("command_receipts")
      .where("actor_account_id", "=", actorId)
      .where("domain", "=", "task.create")
      .where("idempotency_key", "=", `${runId}-recycle-task`)
      .execute()
  })

  it("shows team logs and only projects joined by the actor", async () => {
    const firstPage = await service.listAuditLogs(actorId, teamId, {
      page: 1,
      pageSize: 2,
    })
    const secondPage = await service.listAuditLogs(actorId, teamId, {
      page: 2,
      pageSize: 2,
    })

    expect(firstPage).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(firstPage.items.map((item) => item.subjectId)).toEqual([
      "visible-task",
      "visible-v1",
    ])
    expect(secondPage.items.map((item) => item.subjectId)).toEqual(["team-settings"])
    expect([...firstPage.items, ...secondPage.items]).not.toContainEqual(
      expect.objectContaining({ subjectId: "hidden-v1" }),
    )
  })

  it("applies scope, project, actor, action and date filters", async () => {
    const teamOnly = await service.listAuditLogs(actorId, teamId, {
      scope: "team",
      page: 1,
      pageSize: 25,
    })
    const projectOnly = await service.listAuditLogs(actorId, teamId, {
      projectId: visibleProjectId,
      actor: "Audit Viewer",
      action: "script-version",
      from: "2026-08-30T01:30:00.000Z",
      to: "2026-08-30T02:30:00.000Z",
      page: 1,
      pageSize: 25,
    })

    expect(teamOnly.items.map((item) => item.subjectId)).toEqual(["team-settings"])
    expect(projectOnly.items).toMatchObject([
      {
        actorName: "Audit Viewer",
        projectId: visibleProjectId,
        projectName: "Visible Project",
        subjectId: "visible-v1",
      },
    ])
  })

  it("rejects an explicit project the actor has not joined", async () => {
    await expect(
      service.listAuditLogs(actorId, teamId, {
        projectId: hiddenProjectId,
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED", statusCode: 403 })
  })

  it("persists permission templates, assignments and capability enforcement", async () => {
    const initial = await service.listPermissionWorkspace(actorId, teamId)
    expect(initial).toMatchObject({ canManage: true })
    expect(initial.templates).toHaveLength(6)
    expect(
      initial.templates.find((item) => item.id === `${teamId}:project-manager`),
    ).toMatchObject({ assignedCount: 2 })

    const teamCommand = {
      actorId,
      teamId,
      scope: "team" as const,
      name: "只读协作者",
      permissions: ["team.read" as const],
      idempotencyKey: `${runId}-team-template`,
    }
    const customTeam = await service.createPermissionTemplate(teamCommand)
    const teamReplay = await service.createPermissionTemplate(teamCommand)
    expect(customTeam.replayed).toBe(false)
    expect(teamReplay).toMatchObject({ replayed: true, item: customTeam.item })

    const customProject = await service.createPermissionTemplate({
      actorId,
      teamId,
      scope: "project",
      name: "审片协作者",
      permissions: ["project.read", "review.write"],
      idempotencyKey: `${runId}-project-template`,
    })
    const updatedProject = await service.updatePermissionTemplate({
      actorId,
      teamId,
      itemId: customProject.item.id,
      name: "审片批注者",
      expectedRevision: 1,
    })
    expect(updatedProject).toMatchObject({ name: "审片批注者", revision: 2 })

    await expect(
      service.updatePermissionTemplate({
        actorId,
        teamId,
        itemId: customProject.item.id,
        name: "过期修改",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    await expect(
      service.updatePermissionTemplate({
        actorId,
        teamId,
        itemId: `${teamId}:team-admin`,
        name: "不可修改",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "SYSTEM_TEMPLATE_IMMUTABLE", statusCode: 409 })
    await expect(
      service.assignTeamPermissionTemplate({
        actorId,
        teamId,
        accountId: actorId,
        templateId: customTeam.item.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({
      code: "PERMISSION_SELF_ASSIGNMENT_FORBIDDEN",
      statusCode: 409,
    })
    await expect(
      service.assignTeamPermissionTemplate({
        actorId,
        teamId,
        accountId: otherId,
        templateId: customProject.item.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_TEMPLATE_INVALID", statusCode: 400 })
    await expect(
      service.assignTeamPermissionTemplate({
        actorId,
        teamId,
        accountId: otherId,
        templateId: `${foreignTeamId}:team-admin`,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_TEMPLATE_INVALID", statusCode: 400 })

    await service.updateNotificationPreferences({
      actorId: otherId,
      teamId,
      publishedCallSheets: true,
      importantCallSheetChanges: true,
      permissionAssignments: false,
      portfolioPublications: true,
      reviewActivity: true,
      contactSharing: true,
    })
    const teamAssignment = await service.assignTeamPermissionTemplate({
      actorId,
      teamId,
      accountId: otherId,
      templateId: customTeam.item.id,
      expectedRevision: 1,
    })
    const projectAssignment = await service.assignProjectPermissionTemplate({
      actorId,
      teamId,
      projectId: visibleProjectId,
      accountId: otherId,
      templateId: customProject.item.id,
      expectedRevision: 1,
    })
    expect(teamAssignment.permissionRevision).toBe(2)
    expect(projectAssignment.permissionRevision).toBe(2)

    expect(
      (await service.listNotifications(otherId, teamId)).items.filter((item) =>
        ["team_permission_assigned", "project_permission_assigned"].includes(item.kind),
      ),
    ).toHaveLength(0)
    await service.updateNotificationPreferences({
      actorId: otherId,
      teamId,
      publishedCallSheets: true,
      importantCallSheetChanges: true,
      permissionAssignments: true,
      portfolioPublications: true,
      reviewActivity: true,
      contactSharing: true,
    })
    await service.assignTeamPermissionTemplate({
      actorId,
      teamId,
      accountId: otherId,
      templateId: customTeam.item.id,
      expectedRevision: 2,
    })
    await service.assignProjectPermissionTemplate({
      actorId,
      teamId,
      projectId: visibleProjectId,
      accountId: otherId,
      templateId: customProject.item.id,
      expectedRevision: 2,
    })

    const permissionNotifications = await service.listNotifications(otherId, teamId)
    expect(permissionNotifications).toMatchObject({ unreadCount: 2 })
    expect(permissionNotifications.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "team_permission_assigned",
          projectId: null,
          sourceActorName: "Audit Viewer",
          subjectId: customTeam.item.id,
        }),
        expect.objectContaining({
          kind: "project_permission_assigned",
          projectId: visibleProjectId,
          projectName: "Visible Project",
          sourceActorName: "Audit Viewer",
          subjectId: customProject.item.id,
        }),
      ]),
    )

    const afterAssignment = await service.listPermissionWorkspace(actorId, teamId)
    expect(
      afterAssignment.templates.find((item) => item.id === customTeam.item.id),
    ).toMatchObject({ assignedCount: 1 })
    expect(
      afterAssignment.templates.find((item) => item.id === customProject.item.id),
    ).toMatchObject({ assignedCount: 1, revision: 2 })

    const restrictedSheet = await productionRepository.createCallSheet({
      actorId,
      projectId: visibleProjectId,
      date: "2026-09-02",
      title: "Permission check call sheet",
      idempotencyKey: `${runId}-permission-call-sheet`,
    })
    await expect(
      productionService.publishCallSheet({
        actorId: otherId,
        projectId: visibleProjectId,
        itemId: restrictedSheet.item.id,
        expectedRevision: restrictedSheet.item.revision,
        idempotencyKey: `${runId}-permission-publish`,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED", statusCode: 403 })

    const actions = await database
      .selectFrom("audit_logs")
      .select("action")
      .where("team_id", "=", teamId)
      .where("action", "like", "%permission%")
      .orderBy("action", "asc")
      .execute()
    expect(actions.map((item) => item.action)).toEqual([
      "permission-template.created",
      "permission-template.created",
      "permission-template.updated",
      "project-membership.permission-assigned",
      "project-membership.permission-assigned",
      "team-membership.permission-assigned",
      "team-membership.permission-assigned",
    ])
    await database
      .deleteFrom("notifications")
      .where("recipient_account_id", "=", otherId)
      .where("kind", "in", ["team_permission_assigned", "project_permission_assigned"])
      .execute()
  })

  it("persists deduplicated call-sheet notifications and recipient state", async () => {
    const created = await productionRepository.createCallSheet({
      actorId,
      projectId: visibleProjectId,
      date: "2026-08-31",
      title: "Notification call sheet",
      idempotencyKey: `${runId}-call-sheet-1`,
    })
    const prepared = await productionRepository.updateCallSheet({
      actorId,
      projectId: visibleProjectId,
      itemId: created.item.id,
      expectedRevision: created.item.revision,
      departments: [{ name: "摄影组", call: "05:00", note: "先做设备防护" }],
      equipment: [
        { name: "雨车", quantity: "1 台", source: "测试供应商", note: "05:15 试雨" },
      ],
      safety: [{ level: "高", item: "人工雨", owner: "安全员", action: "配置漏电保护" }],
      transport: [
        {
          item: "全组班车",
          time: "04:30",
          route: "基地 → 现场",
          owner: "交通组",
          note: "",
        },
      ],
      catering: [{ meal: "早餐", time: "05:00", location: "基地", note: "热餐" }],
      keyContacts: [
        { name: "现场制片", role: "制片", phone: "138-0000-0000", note: "总协调" },
      ],
      nextDayPreview: {
        date: "2026-09-01",
        title: "次日补景",
        scenes: "14",
        cast: "顾遥",
        note: "04:30 集合",
      },
    })
    if (prepared.kind !== "ok") throw new Error("Prepare failed")
    const publishCommand = {
      actorId,
      projectId: visibleProjectId,
      itemId: created.item.id,
      expectedRevision: prepared.item.revision,
      idempotencyKey: `${runId}-publish-1`,
    }
    const published = await productionRepository.publishCallSheet(publishCommand)
    const replay = await productionRepository.publishCallSheet(publishCommand)
    if ("kind" in published || "kind" in replay) throw new Error("Publish failed")
    expect(replay.replayed).toBe(true)
    expect(published.item).toMatchObject({
      departments: [{ name: "摄影组", call: "05:00", note: "先做设备防护" }],
      equipment: [expect.objectContaining({ name: "雨车", quantity: "1 台" })],
      safety: [expect.objectContaining({ item: "人工雨" })],
      nextDayPreview: expect.objectContaining({ title: "次日补景" }),
    })
    expect(published.publication.recipients).toEqual([
      expect.objectContaining({
        displayName: "Hidden Project Member",
        projectRole: "producer",
        acknowledgedAt: null,
      }),
    ])

    const afterPublish = await service.listNotifications(otherId, teamId)
    expect(afterPublish).toMatchObject({ unreadCount: 1 })
    expect(afterPublish.items).toMatchObject([
      {
        kind: "call_sheet_published",
        projectId: visibleProjectId,
        subjectId: created.item.id,
      },
    ])
    const deliveredHistory = await productionService.listCallSheetHistory(
      otherId,
      visibleProjectId,
      created.item.id,
    )
    expect(deliveredHistory.publications[0].recipients).toEqual([
      expect.objectContaining({
        notificationId: afterPublish.items[0].id,
        canAcknowledge: true,
        acknowledgedAt: null,
      }),
    ])
    expect(deliveredHistory.publications[0].snapshot).toMatchObject({
      departments: [{ name: "摄影组", call: "05:00", note: "先做设备防护" }],
      keyContacts: [expect.objectContaining({ phone: "138-0000-0000" })],
      nextDayPreview: expect.objectContaining({ scenes: "14" }),
    })
    await service.updateNotification({
      actorId: otherId,
      teamId,
      itemId: afterPublish.items[0].id,
      action: "acknowledge",
    })
    const acknowledgedHistory = await productionService.listCallSheetHistory(
      otherId,
      visibleProjectId,
      created.item.id,
    )
    expect(acknowledgedHistory.publications[0].recipients).toEqual([
      expect.objectContaining({ canAcknowledge: false }),
    ])
    expect(
      acknowledgedHistory.publications[0].recipients[0].acknowledgedAt,
    ).not.toBeNull()

    await productionRepository.updateCallSheet({
      actorId,
      projectId: visibleProjectId,
      itemId: created.item.id,
      expectedRevision: published.item.revision,
      crewCall: "05:30",
      changeSummary: "集合时间提前 30 分钟",
    })
    const afterChange = await service.listNotifications(otherId, teamId)
    expect(afterChange.items.map((item) => item.kind)).toEqual([
      "call_sheet_changed",
      "call_sheet_published",
    ])

    await expect(
      service.updateNotification({
        actorId,
        teamId,
        itemId: afterChange.items[0].id,
        action: "read",
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", statusCode: 404 })

    const acknowledged = await service.updateNotification({
      actorId: otherId,
      teamId,
      itemId: afterChange.items[0].id,
      action: "acknowledge",
    })
    expect(acknowledged.item.readAt).not.toBeNull()
    expect(acknowledged.item.acknowledgedAt).not.toBeNull()
    expect(
      (await service.listNotifications(otherId, teamId)).items[0].acknowledgedAt,
    ).toBe(acknowledged.item.acknowledgedAt)

    await service.updateNotificationPreferences({
      actorId: otherId,
      teamId,
      publishedCallSheets: false,
      importantCallSheetChanges: false,
      permissionAssignments: true,
      portfolioPublications: true,
      reviewActivity: true,
      contactSharing: true,
    })
    const suppressed = await productionRepository.createCallSheet({
      actorId,
      projectId: visibleProjectId,
      date: "2026-09-01",
      title: "Suppressed call sheet",
      idempotencyKey: `${runId}-call-sheet-2`,
    })
    const suppressedPublication = await productionRepository.publishCallSheet({
      actorId,
      projectId: visibleProjectId,
      itemId: suppressed.item.id,
      expectedRevision: suppressed.item.revision,
      idempotencyKey: `${runId}-publish-2`,
    })
    if ("kind" in suppressedPublication) throw new Error("Publish failed")
    await productionRepository.updateCallSheet({
      actorId,
      projectId: visibleProjectId,
      itemId: suppressed.item.id,
      expectedRevision: suppressedPublication.item.revision,
      crewCall: "06:00",
      changeSummary: "集合时间调整",
    })
    expect((await service.listNotifications(otherId, teamId)).items).toHaveLength(2)
  })

  it("persists reversible cross-version review comment correspondence", async () => {
    const primaryFileId = `${runId}-review-primary`
    const compareFileId = `${runId}-review-compare`
    const primaryCommentId = `${runId}-comment-primary`
    const compareCommentId = `${runId}-comment-compare`
    await database
      .insertInto("review_files")
      .values([
        {
          id: primaryFileId,
          project_id: visibleProjectId,
          name: "Primary",
          version: "v12",
          type: "video",
          status: "审阅中",
        },
        {
          id: compareFileId,
          project_id: visibleProjectId,
          name: "Compare",
          version: "v13",
          type: "video",
          status: "审阅中",
        },
      ])
      .execute()
    await database
      .insertInto("review_comments")
      .values([
        {
          id: primaryCommentId,
          project_id: visibleProjectId,
          file_id: primaryFileId,
          version: "v12",
          author_account_id: actorId,
          timecode: "00:07.120",
          text: "开场站台空镜需要再留两帧。",
          state: "open",
          idempotency_key: `${runId}-primary-comment`,
          request_hash: null,
        },
        {
          id: compareCommentId,
          project_id: visibleProjectId,
          file_id: compareFileId,
          version: "v13",
          author_account_id: actorId,
          timecode: "00:07.420",
          text: "开场站台空镜再留两帧。",
          state: "open",
          idempotency_key: `${runId}-compare-comment`,
          request_hash: null,
        },
      ])
      .execute()

    const suggested = await productionService.listReviewCommentCorrespondence(
      actorId,
      visibleProjectId,
      primaryFileId,
      compareFileId,
    )
    const command = {
      actorId,
      projectId: visibleProjectId,
      commentId: primaryCommentId,
      counterpartCommentId: compareCommentId,
      idempotencyKey: `${runId}-comment-link`,
    }
    const created = await productionService.createReviewCommentLink(command)
    const replay = await productionService.createReviewCommentLink(command)
    const confirmed = await productionService.listReviewCommentCorrespondence(
      actorId,
      visibleProjectId,
      primaryFileId,
      compareFileId,
    )
    const unlinked = await productionService.unlinkReviewCommentLink({
      actorId,
      projectId: visibleProjectId,
      linkId: created.item.id,
      expectedRevision: created.item.revision,
    })

    expect(suggested).toMatchObject({
      links: [],
      suggestions: [
        { commentId: primaryCommentId, counterpartCommentId: compareCommentId },
      ],
    })
    expect(created.replayed).toBe(false)
    expect(replay).toMatchObject({ replayed: true, item: created.item })
    expect(confirmed.links).toHaveLength(1)
    expect(confirmed.suggestions).toHaveLength(0)
    expect(unlinked).toMatchObject({ revision: 2 })
    await expect(
      productionService.unlinkReviewCommentLink({
        actorId,
        projectId: visibleProjectId,
        linkId: created.item.id,
        expectedRevision: created.item.revision,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    expect(
      await database
        .selectFrom("review_comments")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("id", "in", [primaryCommentId, compareCommentId])
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: "2" })
    expect(
      await database
        .selectFrom("audit_logs")
        .select("action")
        .where("subject_id", "=", created.item.id)
        .orderBy("id", "asc")
        .execute(),
    ).toEqual([
      { action: "review-comment-link.created" },
      { action: "review-comment-link.removed" },
    ])
  })

  it("derives comment versions from review files and rejects same-version links", async () => {
    const primaryFileId = `${runId}-review-version-primary`
    const compareFileId = `${runId}-review-version-compare`
    await database
      .insertInto("review_files")
      .values([
        {
          id: primaryFileId,
          project_id: visibleProjectId,
          name: "Primary v20",
          version: "v20",
          type: "video",
          status: "审阅中",
        },
        {
          id: compareFileId,
          project_id: visibleProjectId,
          name: "Compare v20",
          version: "v20",
          type: "video",
          status: "审阅中",
        },
      ])
      .execute()

    const primary = await productionService.createReviewComment({
      actorId,
      projectId: visibleProjectId,
      fileId: primaryFileId,
      version: "forged-v1",
      timecode: "00:01.000",
      text: "Primary comment",
      idempotencyKey: `${runId}-version-primary-comment`,
    })
    const compare = await productionService.createReviewComment({
      actorId,
      projectId: visibleProjectId,
      fileId: compareFileId,
      version: "forged-v2",
      timecode: "00:01.100",
      text: "Compare comment",
      idempotencyKey: `${runId}-version-compare-comment`,
    })

    expect(primary.item.version).toBe("v20")
    expect(compare.item.version).toBe("v20")
    await expect(
      productionService.listReviewCommentCorrespondence(
        actorId,
        visibleProjectId,
        primaryFileId,
        compareFileId,
      ),
    ).rejects.toMatchObject({ code: "REVIEW_FILES_MUST_DIFFER", statusCode: 400 })
    await expect(
      productionService.createReviewCommentLink({
        actorId,
        projectId: visibleProjectId,
        commentId: primary.item.id,
        counterpartCommentId: compare.item.id,
        idempotencyKey: `${runId}-same-version-comment-link`,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_COMMENT_LINK_INVALID", statusCode: 409 })
  })

  it("notifies review collaborators once and respects actor and preference boundaries", async () => {
    await database
      .insertInto("accounts")
      .values({ id: reviewRecipientId, display_name: "Review Collaborator", email: null })
      .execute()
    await database
      .insertInto("team_memberships")
      .values({
        team_id: teamId,
        account_id: reviewRecipientId,
        role: "member",
        permission_template_id: `${teamId}:team-member`,
      })
      .execute()
    await database
      .insertInto("project_memberships")
      .values({
        project_id: visibleProjectId,
        account_id: reviewRecipientId,
        role: "producer",
        permission_template_id: `${teamId}:project-contributor`,
      })
      .execute()

    const fileId = `${runId}-member-notification-file`
    await database
      .insertInto("review_files")
      .values({
        id: fileId,
        project_id: visibleProjectId,
        name: "Member notification review",
        version: "v1",
        type: "video",
        status: "审阅中",
      })
      .execute()
    const commentCommand = {
      actorId,
      projectId: visibleProjectId,
      fileId,
      version: "forged-version",
      timecode: "00:03.000",
      text: "Tighten this transition",
      idempotencyKey: `${runId}-member-comment-notification`,
    }
    const comment = await productionService.createReviewComment(commentCommand)
    const commentReplay = await productionService.createReviewComment(commentCommand)
    expect(commentReplay).toMatchObject({ replayed: true, item: comment.item })
    expect(comment.item.parentCommentId).toBeNull()
    const replyCommand = {
      ...commentCommand,
      text: "Confirmed; the transition will be tightened",
      parentCommentId: comment.item.id,
      idempotencyKey: `${runId}-member-comment-reply-notification`,
    }
    const reply = await productionService.createReviewComment(replyCommand)
    const replyReplay = await productionService.createReviewComment(replyCommand)
    expect(reply).toMatchObject({
      replayed: false,
      item: { parentCommentId: comment.item.id },
    })
    expect(replyReplay).toMatchObject({ replayed: true, item: reply.item })
    await expect(
      productionService.createReviewComment({
        ...commentCommand,
        parentCommentId: reply.item.id,
        idempotencyKey: `${runId}-member-nested-comment-reply`,
      }),
    ).rejects.toMatchObject({
      code: "REVIEW_COMMENT_REPLY_DEPTH_EXCEEDED",
      statusCode: 400,
    })
    const resolved = await productionService.updateReviewComment({
      actorId,
      projectId: visibleProjectId,
      commentId: comment.item.id,
      state: "resolved",
      expectedRevision: 1,
    })
    expect(resolved).toMatchObject({ state: "resolved", revision: 2 })
    await expect(
      productionService.updateReviewComment({
        actorId,
        projectId: visibleProjectId,
        commentId: reply.item.id,
        state: "resolved",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({
      code: "REVIEW_COMMENT_THREAD_ROOT_REQUIRED",
      statusCode: 400,
    })
    await expect(
      productionService.updateReviewComment({
        actorId,
        projectId: visibleProjectId,
        commentId: comment.item.id,
        state: "open",
        expectedRevision: 2,
      }),
    ).resolves.toMatchObject({ state: "open", revision: 3 })
    await expect(
      productionService.listReviewComments(actorId, visibleProjectId, fileId),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: comment.item.id, parentCommentId: null }),
        expect.objectContaining({
          id: reply.item.id,
          parentCommentId: comment.item.id,
        }),
      ]),
    })

    const approvalCommand = {
      actorId,
      projectId: visibleProjectId,
      fileId,
      action: "approve" as const,
      expectedRevision: 1,
      idempotencyKey: `${runId}-member-approval-notification`,
    }
    const approval = await productionRepository.updateReviewFileApproval(approvalCommand)
    const approvalReplay =
      await productionRepository.updateReviewFileApproval(approvalCommand)
    expect(approvalReplay).toMatchObject({ replayed: true, item: approval.item })

    const notifications = await database
      .selectFrom("notifications")
      .select([
        "recipient_account_id",
        "source_actor_account_id",
        "kind",
        "subject_id",
        "metadata",
      ])
      .where("subject_id", "in", [comment.item.id, reply.item.id, fileId])
      .orderBy("kind", "asc")
      .execute()
    expect(notifications).toEqual([
      {
        recipient_account_id: reviewRecipientId,
        source_actor_account_id: actorId,
        kind: "review_comment_created",
        subject_id: comment.item.id,
        metadata: expect.objectContaining({ parentCommentId: null }),
      },
      {
        recipient_account_id: reviewRecipientId,
        source_actor_account_id: actorId,
        kind: "review_comment_replied",
        subject_id: reply.item.id,
        metadata: expect.objectContaining({ parentCommentId: comment.item.id }),
      },
      {
        recipient_account_id: reviewRecipientId,
        source_actor_account_id: actorId,
        kind: "review_file_approved",
        subject_id: fileId,
        metadata: expect.objectContaining({ fileId, version: "v1", revision: 2 }),
      },
    ])
    expect(notifications.some((item) => item.recipient_account_id === actorId)).toBe(
      false,
    )

    await service.updateNotificationPreferences({
      actorId: reviewRecipientId,
      teamId,
      publishedCallSheets: true,
      importantCallSheetChanges: true,
      permissionAssignments: true,
      portfolioPublications: true,
      reviewActivity: false,
      contactSharing: true,
    })
    const suppressedFileId = `${runId}-member-notification-suppressed`
    await database
      .insertInto("review_files")
      .values({
        id: suppressedFileId,
        project_id: visibleProjectId,
        name: "Suppressed review",
        version: "v1",
        type: "video",
        status: "审阅中",
      })
      .execute()
    const suppressed = await productionService.createReviewComment({
      ...commentCommand,
      fileId: suppressedFileId,
      idempotencyKey: `${runId}-member-comment-suppressed`,
    })
    const suppressedReply = await productionService.createReviewComment({
      ...commentCommand,
      fileId: suppressedFileId,
      parentCommentId: suppressed.item.id,
      idempotencyKey: `${runId}-member-comment-reply-suppressed`,
    })
    expect(
      await database
        .selectFrom("notifications")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("recipient_account_id", "=", reviewRecipientId)
        .where("subject_id", "in", [suppressed.item.id, suppressedReply.item.id])
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: "0" })
  })

  it("persists project review folders and revision-safe file moves", async () => {
    const fileId = `${runId}-review-move-file`
    await database
      .insertInto("review_files")
      .values({
        id: fileId,
        project_id: visibleProjectId,
        name: "Move me",
        version: "v1",
        type: "video",
        status: "待审阅",
      })
      .execute()

    const folderCommand = {
      actorId,
      projectId: visibleProjectId,
      name: "Client delivery",
      idempotencyKey: `${runId}-review-folder`,
    }
    const created = await productionService.createReviewFolder(folderCommand)
    const replay = await productionService.createReviewFolder(folderCommand)
    await expect(
      productionService.createReviewFolder({
        ...folderCommand,
        idempotencyKey: `${runId}-review-folder-duplicate`,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_FOLDER_EXISTS", statusCode: 409 })
    await expect(
      productionService.createReviewFolder({
        ...folderCommand,
        actorId: otherId,
        name: "Contributor folder",
        idempotencyKey: `${runId}-review-folder-contributor`,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED", statusCode: 403 })

    const moveCommand = {
      actorId,
      projectId: visibleProjectId,
      fileId,
      folderId: created.item.id,
      expectedRevision: 1,
      idempotencyKey: `${runId}-review-move`,
    }
    const moved = await productionService.moveReviewFile(moveCommand)
    const moveReplay = await productionService.moveReviewFile(moveCommand)
    await expect(
      productionService.updateReviewFolder({
        actorId,
        projectId: visibleProjectId,
        folderId: created.item.id,
        archived: true,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_FOLDER_NOT_EMPTY", statusCode: 409 })
    await expect(
      productionService.moveReviewFile({
        ...moveCommand,
        idempotencyKey: `${runId}-review-move-stale`,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    const listed = await productionService.listReviewFiles(actorId, visibleProjectId)
    const movedToRoot = await productionService.moveReviewFile({
      ...moveCommand,
      folderId: null,
      expectedRevision: 2,
      idempotencyKey: `${runId}-review-move-root`,
    })
    await expect(
      productionService.updateReviewFolder({
        actorId,
        projectId: visibleProjectId,
        folderId: created.item.id,
        archived: true,
        expectedRevision: 99,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    const archived = await productionService.updateReviewFolder({
      actorId,
      projectId: visibleProjectId,
      folderId: created.item.id,
      archived: true,
      expectedRevision: 1,
    })
    const activeFolders = await productionService.listReviewFolders(
      actorId,
      visibleProjectId,
    )
    const archivedFolders = await productionService.listReviewFolders(
      actorId,
      visibleProjectId,
      true,
    )
    await expect(
      productionService.updateReviewFolder({
        actorId: otherId,
        projectId: visibleProjectId,
        folderId: created.item.id,
        archived: false,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED", statusCode: 403 })
    const restored = await productionService.updateReviewFolder({
      actorId,
      projectId: visibleProjectId,
      folderId: created.item.id,
      archived: false,
      expectedRevision: 2,
    })
    const archivedAgain = await productionService.updateReviewFolder({
      actorId,
      projectId: visibleProjectId,
      folderId: created.item.id,
      archived: true,
      expectedRevision: 3,
    })
    await productionService.createReviewFolder({
      ...folderCommand,
      idempotencyKey: `${runId}-review-folder-replacement`,
    })
    await expect(
      productionService.updateReviewFolder({
        actorId,
        projectId: visibleProjectId,
        folderId: created.item.id,
        archived: false,
        expectedRevision: 4,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_FOLDER_EXISTS", statusCode: 409 })

    expect(created.replayed).toBe(false)
    expect(replay).toMatchObject({ replayed: true, item: created.item })
    expect(moved).toMatchObject({
      replayed: false,
      item: { folderId: created.item.id, revision: 2 },
    })
    expect(moveReplay).toMatchObject({ replayed: true, item: moved.item })
    expect(listed).toMatchObject({
      folders: [expect.objectContaining({ id: created.item.id })],
      items: expect.arrayContaining([
        expect.objectContaining({ id: fileId, folderId: created.item.id }),
      ]),
    })
    expect(movedToRoot.item).toMatchObject({ folderId: null, revision: 3 })
    expect(archived).toMatchObject({ archived: true, revision: 2 })
    expect(activeFolders.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.item.id })]),
    )
    expect(archivedFolders.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.item.id, archived: true, revision: 2 }),
      ]),
    )
    expect(restored).toMatchObject({ archived: false, revision: 3 })
    expect(archivedAgain).toMatchObject({ archived: true, revision: 4 })
    expect(
      await database
        .selectFrom("audit_logs")
        .select("action")
        .where("subject_id", "in", [created.item.id, fileId])
        .orderBy("id", "asc")
        .execute(),
    ).toEqual([
      { action: "review-folder.created" },
      { action: "review-file.moved" },
      { action: "review-file.moved" },
      { action: "review-folder.archived" },
      { action: "review-folder.restored" },
      { action: "review-folder.archived" },
    ])
  })

  it("persists revision-safe review file archive and restore", async () => {
    const fileId = `${runId}-review-archive-file`
    const commentId = `${runId}-review-archive-comment`
    await database
      .insertInto("review_files")
      .values({
        id: fileId,
        project_id: visibleProjectId,
        name: "Archive me",
        version: "v1",
        type: "video",
        status: "审阅中",
      })
      .execute()
    await database
      .insertInto("review_comments")
      .values({
        id: commentId,
        project_id: visibleProjectId,
        file_id: fileId,
        version: "v1",
        author_account_id: actorId,
        review_session_id: null,
        guest_display_name: null,
        timecode: "00:01.000",
        text: "Keep this history",
        state: "open",
        idempotency_key: `${runId}-review-archive-comment`,
        request_hash: null,
      })
      .execute()

    const archiveCommand = {
      actorId,
      projectId: visibleProjectId,
      fileId,
      archived: true,
      expectedRevision: 1,
      idempotencyKey: `${runId}-review-archive`,
    }
    const archived = await productionService.updateReviewFileArchive(archiveCommand)
    const replay = await productionService.updateReviewFileArchive(archiveCommand)
    const active = await productionService.listReviewFiles(actorId, visibleProjectId)
    const recycled = await productionService.listReviewFiles(
      actorId,
      visibleProjectId,
      true,
    )
    await expect(
      productionService.updateReviewFileArchive({
        ...archiveCommand,
        archived: false,
        expectedRevision: 1,
        idempotencyKey: `${runId}-review-restore-stale`,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    await expect(
      productionService.updateReviewFileArchive({
        ...archiveCommand,
        actorId: otherId,
        archived: false,
        expectedRevision: 2,
        idempotencyKey: `${runId}-review-restore-viewer`,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED", statusCode: 403 })
    const restored = await productionService.updateReviewFileArchive({
      ...archiveCommand,
      archived: false,
      expectedRevision: 2,
      idempotencyKey: `${runId}-review-restore`,
    })

    expect(archived).toMatchObject({ replayed: false, item: { revision: 2 } })
    expect(replay).toMatchObject({ replayed: true, item: archived.item })
    expect(active.items).not.toContainEqual(expect.objectContaining({ id: fileId }))
    expect(recycled.items).toContainEqual(
      expect.objectContaining({ id: fileId, comments: 1, revision: 2 }),
    )
    expect(restored).toMatchObject({ replayed: false, item: { revision: 3 } })
    expect(
      await database
        .selectFrom("review_comments")
        .select("id")
        .where("id", "=", commentId)
        .executeTakeFirst(),
    ).toEqual({ id: commentId })
    expect(
      await database
        .selectFrom("audit_logs")
        .select("action")
        .where("subject_id", "=", fileId)
        .orderBy("id", "asc")
        .execute(),
    ).toEqual([{ action: "review-file.archived" }, { action: "review-file.restored" }])

    await database.deleteFrom("audit_logs").where("subject_id", "=", fileId).execute()
    await database
      .deleteFrom("command_receipts")
      .where("actor_account_id", "=", actorId)
      .where("domain", "in", [
        `review-file.archive:${visibleProjectId}:${fileId}`,
        `review-file.restore:${visibleProjectId}:${fileId}`,
      ])
      .execute()
    await database.deleteFrom("review_files").where("id", "=", fileId).execute()
  })

  it("permanently deletes archived review files without deleting shared media", async () => {
    const assetId = `${runId}-review-delete-asset`
    const fileId = `${runId}-review-delete-file`
    const commentId = `${runId}-review-delete-comment`
    const linkId = `${runId}-review-delete-link`
    const portfolioId = `${runId}-review-delete-portfolio`
    const notificationIds = [
      `${runId}-review-delete-comment-notification`,
      `${runId}-review-delete-approval-notification`,
    ]
    await database
      .insertInto("team_assets")
      .values({
        id: assetId,
        team_id: teamId,
        project_id: visibleProjectId,
        folder_id: null,
        name: "Shared review source",
        kind: "视频",
        mime_type: "video/mp4",
        size_bytes: 128,
        object_key: `${runId}/review-delete.mp4`,
        checksum_sha256: null,
        status: "ready",
        favorite: false,
        rating: 0,
        tags: [],
        note: "",
        thumbnail_url: null,
        created_by_account_id: actorId,
        revision: 1,
        created_at: new Date(),
        updated_at: new Date(),
        archived_at: null,
      })
      .execute()
    await database
      .insertInto("review_files")
      .values({
        id: fileId,
        project_id: visibleProjectId,
        asset_id: assetId,
        name: "Delete archived version",
        version: "v1",
        type: "video",
        status: "审阅中",
        archived_at: new Date(),
        revision: 2,
      })
      .execute()
    await database
      .insertInto("review_comments")
      .values({
        id: commentId,
        project_id: visibleProjectId,
        file_id: fileId,
        version: "v1",
        author_account_id: actorId,
        review_session_id: null,
        guest_display_name: null,
        timecode: "00:01.000",
        text: "Delete with the version",
        state: "open",
        idempotency_key: `${runId}-review-delete-comment`,
        request_hash: null,
      })
      .execute()
    await database
      .insertInto("review_links")
      .values({
        id: linkId,
        token_hash: `${runId}-review-delete-token`,
        project_id: visibleProjectId,
        can_comment: true,
        can_compare: false,
        can_download: false,
        can_approve: false,
        expires_at: new Date(Date.now() + 60_000),
        created_by_account_id: actorId,
        idempotency_key: `${runId}-review-delete-link`,
        request_hash: `${runId}-review-delete-request`,
      })
      .execute()
    await database
      .insertInto("review_link_files")
      .values({ link_id: linkId, file_id: fileId, sort_order: 0 })
      .execute()
    await database
      .insertInto("team_portfolios")
      .values({
        id: portfolioId,
        team_id: teamId,
        title: "Blocking portfolio",
        category: "Test",
        year: "2026",
        description: "",
        state: "团队可见",
        public_slug: null,
        published_at: null,
        created_by_account_id: actorId,
        published_by_account_id: null,
        archived_at: null,
      })
      .execute()
    await database
      .insertInto("portfolio_items")
      .values({
        id: `${portfolioId}-item`,
        portfolio_id: portfolioId,
        asset_id: assetId,
        review_file_id: fileId,
        title: "Blocking content",
        kind: "主片",
        caption: "",
        featured: true,
        sort_order: 0,
      })
      .execute()
    await database
      .insertInto("notifications")
      .values([
        {
          id: notificationIds[0],
          recipient_account_id: otherId,
          source_actor_account_id: actorId,
          team_id: teamId,
          project_id: visibleProjectId,
          kind: "review_comment_created",
          subject_id: commentId,
          dedup_key: `${runId}-review-delete-comment`,
          title: "Review comment",
          body: "Delete this notification",
          metadata: JSON.stringify({ fileId }),
        },
        {
          id: notificationIds[1],
          recipient_account_id: otherId,
          source_actor_account_id: actorId,
          team_id: teamId,
          project_id: visibleProjectId,
          kind: "review_file_approved",
          subject_id: fileId,
          dedup_key: `${runId}-review-delete-approval`,
          title: "Review approved",
          body: "Delete this notification",
          metadata: JSON.stringify({ fileId }),
        },
      ])
      .execute()
    await database
      .insertInto("command_receipts")
      .values({
        actor_account_id: actorId,
        domain: `review-file.archive:${visibleProjectId}:${fileId}`,
        idempotency_key: `${runId}-review-delete-receipt`,
        request_hash: `${runId}-review-delete-hash`,
        response: JSON.stringify({ id: fileId }),
      })
      .execute()
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: actorId,
        team_id: teamId,
        project_id: visibleProjectId,
        action: "review-file.archived",
        subject_id: fileId,
        metadata: JSON.stringify({ revision: 2 }),
      })
      .execute()

    await expect(
      productionService.permanentlyDeleteReviewFile({
        actorId: otherId,
        projectId: visibleProjectId,
        fileId,
        expectedRevision: 2,
        confirmation: "permanent-delete",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED", statusCode: 403 })
    await expect(
      productionService.permanentlyDeleteReviewFile({
        actorId,
        projectId: visibleProjectId,
        fileId,
        expectedRevision: 1,
        confirmation: "permanent-delete",
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    await expect(
      productionService.permanentlyDeleteReviewFile({
        actorId,
        projectId: visibleProjectId,
        fileId,
        expectedRevision: 2,
        confirmation: "permanent-delete",
      }),
    ).rejects.toMatchObject({ code: "REVIEW_FILE_IN_USE", statusCode: 409 })

    await database.deleteFrom("team_portfolios").where("id", "=", portfolioId).execute()
    const deleted = await productionService.permanentlyDeleteReviewFile({
      actorId,
      projectId: visibleProjectId,
      fileId,
      expectedRevision: 2,
      confirmation: "permanent-delete",
    })

    expect(deleted).toEqual({ id: fileId })
    expect(
      await database
        .selectFrom("review_files")
        .select("id")
        .where("id", "=", fileId)
        .execute(),
    ).toEqual([])
    expect(
      await database
        .selectFrom("review_comments")
        .select("id")
        .where("id", "=", commentId)
        .execute(),
    ).toEqual([])
    expect(
      await database
        .selectFrom("review_link_files")
        .select("file_id")
        .where("link_id", "=", linkId)
        .execute(),
    ).toEqual([])
    expect(
      await database
        .selectFrom("review_links")
        .select("id")
        .where("id", "=", linkId)
        .execute(),
    ).toEqual([{ id: linkId }])
    expect(
      await database
        .selectFrom("team_assets")
        .select("id")
        .where("id", "=", assetId)
        .execute(),
    ).toEqual([{ id: assetId }])
    expect(
      await database
        .selectFrom("notifications")
        .select("id")
        .where("id", "in", notificationIds)
        .execute(),
    ).toEqual([])
    expect(
      await database
        .selectFrom("command_receipts")
        .select("domain")
        .where("idempotency_key", "=", `${runId}-review-delete-receipt`)
        .execute(),
    ).toEqual([])
    expect(
      await database
        .selectFrom("audit_logs")
        .select("action")
        .where("subject_id", "=", fileId)
        .orderBy("id", "asc")
        .execute(),
    ).toEqual([
      { action: "review-file.archived" },
      { action: "review-file.permanently-deleted" },
    ])

    await database.deleteFrom("audit_logs").where("subject_id", "=", fileId).execute()
    await database.deleteFrom("review_links").where("id", "=", linkId).execute()
    await database.deleteFrom("team_assets").where("id", "=", assetId).execute()
  })

  it("returns exact redacted overlaps from inaccessible same-team projects", async () => {
    const resource = {
      id: `${runId}-camera-package`,
      type: "equipment" as const,
      name: "Camera Package",
    }
    const visible = await productionService.createExecutionStage({
      actorId,
      projectId: visibleProjectId,
      name: "Visible Shoot",
      startsAt: "2026-09-01T01:00:00.000Z",
      endsAt: "2026-09-01T03:00:00.000Z",
      originalTimezone: "UTC",
      progress: 0,
      owner: "Audit Viewer",
      state: "未开始",
      note: "",
      resources: [resource],
      idempotencyKey: `${runId}-visible-schedule`,
    })
    const hiddenItemId = `${runId}-hidden-schedule`
    await database
      .insertInto("execution_schedule_items")
      .values({
        id: hiddenItemId,
        project_id: hiddenProjectId,
        name: "Confidential Shoot",
        starts_at: new Date("2026-09-01T02:00:00.000Z"),
        ends_at: new Date("2026-09-01T04:00:00.000Z"),
        original_timezone: "UTC",
        progress: 0,
        owner_name: "Hidden Project Member",
        state: "未开始",
        note: "",
      })
      .execute()
    await database
      .insertInto("execution_schedule_resources")
      .values({
        schedule_item_id: hiddenItemId,
        resource_type: resource.type,
        resource_id: resource.id,
        resource_name: resource.name,
      })
      .execute()

    const schedule = await productionService.listExecutionSchedule(
      actorId,
      visibleProjectId,
    )

    expect(visible.item.projectId).toBe(visibleProjectId)
    expect(schedule.conflicts).toEqual([
      expect.objectContaining({
        itemId: visible.item.id,
        conflictingItemId: null,
        conflictingProjectId: null,
        conflictingItemName: "其他项目占用",
        startsAt: "2026-09-01T02:00:00.000Z",
        endsAt: "2026-09-01T03:00:00.000Z",
        crossProject: true,
        redacted: true,
      }),
    ])
  })

  it("persists archived asset listing and revision-safe restore", async () => {
    const assetId = `${runId}-trash-asset`
    await database
      .insertInto("team_assets")
      .values({
        id: assetId,
        team_id: teamId,
        project_id: visibleProjectId,
        folder_id: null,
        name: "Recycle me",
        kind: "图片",
        mime_type: "image/png",
        size_bytes: 128,
        object_key: null,
        checksum_sha256: null,
        status: "ready",
        favorite: false,
        rating: 0,
        tags: [],
        note: "",
        thumbnail_url: null,
        created_by_account_id: actorId,
        revision: 1,
        created_at: new Date(),
        updated_at: new Date(),
        archived_at: null,
      })
      .execute()

    const archived = await assetRepository.updateAsset({
      actorId,
      teamId,
      assetId,
      archived: true,
      expectedRevision: 1,
    })
    const activeAfterArchive = await assetRepository.listAssets(teamId, false)
    const trashAfterArchive = await assetRepository.listAssets(teamId, true)
    const staleRestore = await assetRepository.updateAsset({
      actorId,
      teamId,
      assetId,
      archived: false,
      expectedRevision: 1,
    })
    const restored = await assetRepository.updateAsset({
      actorId,
      teamId,
      assetId,
      archived: false,
      expectedRevision: 2,
    })
    const activeAfterRestore = await assetRepository.listAssets(teamId, false)
    const trashAfterRestore = await assetRepository.listAssets(teamId, true)

    expect(archived).toMatchObject({
      kind: "ok",
      item: { id: assetId, archived: true, revision: 2 },
    })
    expect(activeAfterArchive.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: assetId })]),
    )
    expect(trashAfterArchive.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: assetId, archived: true, revision: 2 }),
      ]),
    )
    expect(staleRestore).toEqual({ kind: "conflict" })
    expect(restored).toMatchObject({
      kind: "ok",
      item: { id: assetId, archived: false, revision: 3 },
    })
    expect(activeAfterRestore.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: assetId, archived: false, revision: 3 }),
      ]),
    )
    expect(trashAfterRestore.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: assetId })]),
    )
    expect(
      await database
        .selectFrom("audit_logs")
        .select(["action", "project_id"])
        .where("subject_id", "=", assetId)
        .orderBy("id", "asc")
        .execute(),
    ).toEqual([
      { action: "asset.archived", project_id: visibleProjectId },
      { action: "asset.restored", project_id: visibleProjectId },
    ])
  })

  it("restores team contacts and suppliers without losing relations", async () => {
    const contactKey = `${runId}-recycle-contact`
    const supplierKey = `${runId}-recycle-supplier`
    const contact = await contactService.createTeamContact({
      actorId,
      teamId,
      name: "回收站联系人",
      projectIds: [visibleProjectId],
      idempotencyKey: contactKey,
    })
    const supplier = await contactService.createTeamSupplier({
      actorId,
      teamId,
      name: "回收站供应商",
      contactRefs: [{ contactId: contact.item.id, source: "team" }],
      projectIds: [visibleProjectId],
      idempotencyKey: supplierKey,
    })

    await contactService.deleteTeamSupplier({
      actorId,
      teamId,
      supplierId: supplier.item.id,
      expectedRevision: supplier.item.revision,
    })
    await contactService.deleteTeamContact({
      actorId,
      teamId,
      contactId: contact.item.id,
      expectedRevision: contact.item.revision,
    })

    expect((await service.listDeletedItems(actorId, teamId)).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: contact.item.id,
          kind: "team-contact",
          revision: 1,
        }),
        expect.objectContaining({
          id: supplier.item.id,
          kind: "supplier",
          revision: 1,
        }),
      ]),
    )
    await expect(
      service.restoreDeletedItem({
        actorId,
        teamId,
        kind: "team-contact",
        itemId: contact.item.id,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    await expect(
      service.restoreDeletedItem({
        actorId,
        teamId,
        kind: "supplier",
        itemId: supplier.item.id,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })

    await service.restoreDeletedItem({
      actorId,
      teamId,
      kind: "team-contact",
      itemId: contact.item.id,
      expectedRevision: 1,
    })
    await service.restoreDeletedItem({
      actorId,
      teamId,
      kind: "supplier",
      itemId: supplier.item.id,
      expectedRevision: 1,
    })

    expect((await contactService.listTeamContacts(actorId, teamId)).items).toContainEqual(
      expect.objectContaining({
        id: contact.item.id,
        projectIds: [visibleProjectId],
        revision: 2,
      }),
    )
    expect(
      (await contactService.listTeamSuppliers(actorId, teamId)).items,
    ).toContainEqual(
      expect.objectContaining({
        id: supplier.item.id,
        contactRefs: [{ contactId: contact.item.id, source: "team" }],
        projectIds: [visibleProjectId],
        revision: 2,
      }),
    )
    expect((await service.listDeletedItems(actorId, teamId)).items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: contact.item.id }),
        expect.objectContaining({ id: supplier.item.id }),
      ]),
    )

    await contactService.deleteTeamSupplier({
      actorId,
      teamId,
      supplierId: supplier.item.id,
      expectedRevision: 2,
    })
    await contactService.deleteTeamContact({
      actorId,
      teamId,
      contactId: contact.item.id,
      expectedRevision: 2,
    })
    await service.permanentlyDeleteDeletedItem({
      actorId,
      teamId,
      kind: "team-contact",
      itemId: contact.item.id,
      expectedRevision: 2,
    })
    await service.permanentlyDeleteDeletedItem({
      actorId,
      teamId,
      kind: "supplier",
      itemId: supplier.item.id,
      expectedRevision: 2,
    })
    expect(
      await database
        .selectFrom("team_contacts")
        .select("id")
        .where("id", "=", contact.item.id)
        .executeTakeFirst(),
    ).toBeUndefined()
    expect(
      await database
        .selectFrom("suppliers")
        .select("id")
        .where("id", "=", supplier.item.id)
        .executeTakeFirst(),
    ).toBeUndefined()

    const audits = await database
      .selectFrom("audit_logs")
      .select(["subject_id", "action"])
      .where("subject_id", "in", [contact.item.id, supplier.item.id])
      .orderBy("id", "asc")
      .execute()
    expect(audits).toEqual([
      { subject_id: contact.item.id, action: "team-contact.created" },
      { subject_id: supplier.item.id, action: "team-supplier.created" },
      { subject_id: supplier.item.id, action: "team-supplier.deleted" },
      { subject_id: contact.item.id, action: "team-contact.deleted" },
      { subject_id: contact.item.id, action: "team-contact.restored" },
      { subject_id: supplier.item.id, action: "team-supplier.restored" },
      { subject_id: supplier.item.id, action: "team-supplier.deleted" },
      { subject_id: contact.item.id, action: "team-contact.deleted" },
      { subject_id: contact.item.id, action: "team-contact.permanently-deleted" },
      { subject_id: supplier.item.id, action: "team-supplier.permanently-deleted" },
    ])

    await database
      .deleteFrom("audit_logs")
      .where("subject_id", "in", [contact.item.id, supplier.item.id])
      .execute()
    await database
      .deleteFrom("command_receipts")
      .where("actor_account_id", "=", actorId)
      .where("idempotency_key", "in", [contactKey, supplierKey])
      .execute()
  })
})
