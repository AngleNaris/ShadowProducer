import { readdir, readFile } from "node:fs/promises"

import {
  assetFolderFixtures,
  breakdownFixtures,
  calendarEventFixtures,
  callSheetFixtures,
  contactShareFixtures,
  createScriptFixture,
  createWinterCoffeeStoryboardFixture,
  executionStageFixtures,
  fixtureAccounts,
  fixtureProjects,
  fixtureTeams,
  personalContactFixtures,
  portfolioFixtures,
  reviewCommentFixtures,
  reviewFileFixtures,
  reviewFolderFixtures,
  shootingDayFixtures,
  supplierFixtures,
  teamAssetFixtures,
  teamContactFixtures,
  winterCoffeeComments,
  workspaceNoteFixtures,
  workspaceTaskFixtures,
} from "@shadowproducer/test-fixtures"
import { Pool } from "pg"

import {
  authBaseURLFromEnvironment,
  authSecretFromEnvironment,
  createShadowAuth,
} from "./auth"
import { createDatabase, defaultDatabaseUrl } from "./database"

const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl })
const migrationsDirectory = new URL("../../../migrations/", import.meta.url)
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
for (const migrationFile of migrationFiles) {
  const migration = await readFile(new URL(migrationFile, migrationsDirectory), "utf8")
  await pool.query(migration)
}

const database = createDatabase(databaseUrl, pool)
try {
  await database
    .insertInto("accounts")
    .values(
      fixtureAccounts.map((account) => ({
        id: account.id,
        display_name: account.displayName,
        email: account.email,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  for (const account of fixtureAccounts) {
    await database
      .updateTable("accounts")
      .set({ display_name: account.displayName, email: account.email })
      .where("id", "=", account.id)
      .execute()
  }

  await database
    .insertInto("teams")
    .values(fixtureTeams.map((team) => ({ id: team.id, name: team.name })))
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  const permissionTemplateSeeds = fixtureTeams.flatMap((team) => [
    {
      id: `${team.id}:team-admin`,
      team_id: team.id,
      scope: "team" as const,
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
      created_by_account_id: null,
    },
    {
      id: `${team.id}:team-member`,
      team_id: team.id,
      scope: "team" as const,
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
      created_by_account_id: null,
    },
    {
      id: `${team.id}:team-viewer`,
      team_id: team.id,
      scope: "team" as const,
      key: "team-viewer",
      name: "团队访客",
      permissions: JSON.stringify(["team.read"]),
      is_system: true,
      created_by_account_id: null,
    },
    {
      id: `${team.id}:project-manager`,
      team_id: team.id,
      scope: "project" as const,
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
      created_by_account_id: null,
    },
    {
      id: `${team.id}:project-contributor`,
      team_id: team.id,
      scope: "project" as const,
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
      created_by_account_id: null,
    },
    {
      id: `${team.id}:project-viewer`,
      team_id: team.id,
      scope: "project" as const,
      key: "project-viewer",
      name: "项目查看者",
      permissions: JSON.stringify(["project.read"]),
      is_system: true,
      created_by_account_id: null,
    },
  ])
  await database
    .insertInto("permission_templates")
    .values(permissionTemplateSeeds)
    .onConflict((conflict) => conflict.columns(["team_id", "scope", "key"]).doNothing())
    .execute()

  await database
    .insertInto("team_memberships")
    .values([
      ...fixtureTeams.map((team) => ({
        team_id: team.id,
        account_id: "account-fanxing",
        role: team.role,
        permission_template_id: `${team.id}:${
          team.role === "viewer" ? "team-viewer" : "team-admin"
        }`,
      })),
      {
        team_id: "north",
        account_id: "account-guyao",
        role: "director",
        permission_template_id: "north:team-admin",
      },
      {
        team_id: "north",
        account_id: "account-songlan",
        role: "producer",
        permission_template_id: "north:team-admin",
      },
    ])
    .onConflict((conflict) => conflict.columns(["team_id", "account_id"]).doNothing())
    .execute()

  await database
    .insertInto("projects")
    .values(fixtureProjects.map(([id, teamId, name]) => ({ id, team_id: teamId, name })))
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  const projectStates = new Map<string, string>([
    ["winter-coffee", "拍摄中"],
    ["city-walk", "筹备中"],
    ["summer-station", "后期"],
    ["harbor-morning", "已归档"],
    ["paper-moon", "已归档"],
    ["mercury-perfume", "后期"],
    ["neon-hotel", "拍摄中"],
    ["silent-product", "已归档"],
    ["river-doc", "后期"],
  ])
  for (const [projectId] of fixtureProjects) {
    await database
      .updateTable("projects")
      .set({ status: projectStates.get(projectId) ?? "筹备中" })
      .where("id", "=", projectId)
      .execute()
  }

  await database
    .insertInto("project_memberships")
    .values([
      ...fixtureProjects.map(([projectId, teamId]) => ({
        project_id: projectId,
        account_id: "account-fanxing",
        role: teamId === "external" ? "viewer" : "editor",
        permission_template_id: `${teamId}:${
          teamId === "external" ? "project-viewer" : "project-manager"
        }`,
      })),
      {
        project_id: "winter-coffee",
        account_id: "account-guyao",
        role: "editor",
        permission_template_id: "north:project-manager",
      },
      {
        project_id: "winter-coffee",
        account_id: "account-songlan",
        role: "editor",
        permission_template_id: "north:project-manager",
      },
    ])
    .onConflict((conflict) => conflict.columns(["project_id", "account_id"]).doNothing())
    .execute()

  await database
    .insertInto("workspace_tasks")
    .values(
      workspaceTaskFixtures.map((task) => ({
        id: task.id,
        team_id: task.teamId,
        project_id: task.projectId,
        assignee_account_id: "account-fanxing",
        created_by_account_id: "account-fanxing",
        title: task.title,
        due_date: task.dueDate,
        status: task.status,
        target_view: task.target,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("calendar_events")
    .values(
      calendarEventFixtures.map((event) => ({
        id: event.id,
        team_id: event.teamId,
        project_id: event.projectId,
        owner_account_id: "account-fanxing",
        title: event.title,
        starts_at: event.startsAt,
        ends_at: null,
        original_timezone: "Asia/Shanghai",
        all_day: false,
        visibility: "private" as const,
        target_view: event.target,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("workspace_notes")
    .values(
      workspaceNoteFixtures.map((note) => ({
        id: note.id,
        team_id: note.teamId,
        project_id: note.projectId,
        owner_account_id: "account-fanxing",
        title: note.title,
        body: note.body,
        kind: note.kind,
        pinned: note.pinned,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("personal_contacts")
    .values(
      personalContactFixtures.map((contact) => ({
        id: contact.id,
        owner_account_id: contact.ownerAccountId,
        name: contact.name,
        role: contact.role,
        company: contact.company,
        phone: contact.phone,
        email: contact.email,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("contact_team_shares")
    .values(
      contactShareFixtures.map((share) => ({
        contact_id: share.contactId,
        team_id: share.teamId,
        shared_fields: [...share.fields],
        allow_project_link: share.allowProjectLink,
      })),
    )
    .onConflict((conflict) => conflict.columns(["contact_id", "team_id"]).doNothing())
    .execute()

  await database
    .insertInto("team_contacts")
    .values(
      teamContactFixtures.map((contact) => ({
        id: contact.id,
        team_id: contact.teamId,
        created_by_account_id: "account-fanxing",
        name: contact.name,
        role: contact.role,
        company: contact.company,
        phone: contact.phone,
        email: contact.email,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("team_contact_projects")
    .values(
      teamContactFixtures.flatMap((contact) =>
        contact.projectIds.map((projectId) => ({
          contact_id: contact.id,
          project_id: projectId,
        })),
      ),
    )
    .onConflict((conflict) => conflict.columns(["contact_id", "project_id"]).doNothing())
    .execute()

  await database
    .insertInto("suppliers")
    .values(
      supplierFixtures.map((supplier) => ({
        id: supplier.id,
        team_id: supplier.teamId,
        created_by_account_id: "account-fanxing",
        name: supplier.name,
        category: supplier.category,
        services: supplier.services,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
      })),
    )
    .onConflict((conflict) =>
      conflict.column("id").doUpdateSet((expression) => ({
        name: expression.ref("excluded.name"),
        category: expression.ref("excluded.category"),
        services: expression.ref("excluded.services"),
        phone: expression.ref("excluded.phone"),
        email: expression.ref("excluded.email"),
        address: expression.ref("excluded.address"),
      })),
    )
    .execute()

  await database
    .insertInto("supplier_projects")
    .values(
      supplierFixtures.flatMap((supplier) =>
        supplier.projectIds.map((projectId) => ({
          supplier_id: supplier.id,
          project_id: projectId,
        })),
      ),
    )
    .onConflict((conflict) => conflict.columns(["supplier_id", "project_id"]).doNothing())
    .execute()

  await database
    .insertInto("supplier_contacts")
    .values(
      supplierFixtures.flatMap((supplier) =>
        supplier.contactRefs.map((contact) => ({
          supplier_id: supplier.id,
          contact_source: contact.source,
          contact_id: contact.contactId,
        })),
      ),
    )
    .onConflict((conflict) =>
      conflict.columns(["supplier_id", "contact_source", "contact_id"]).doNothing(),
    )
    .execute()

  await database
    .insertInto("asset_folders")
    .values(
      assetFolderFixtures.map(([id, teamId, name]) => ({
        id,
        team_id: teamId,
        parent_id: null,
        name,
        created_by_account_id: "account-fanxing",
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("team_assets")
    .values(
      teamAssetFixtures.map((asset) => ({
        id: asset.id,
        team_id: asset.teamId,
        project_id: asset.projectId,
        folder_id: asset.folderId,
        name: asset.name,
        kind: asset.kind,
        mime_type: asset.mimeType,
        size_bytes: asset.sizeBytes,
        object_key: null,
        status: "ready" as const,
        favorite: asset.favorite,
        rating: asset.rating,
        tags: [...asset.tags],
        note: asset.note,
        thumbnail_url: asset.thumbnailUrl,
        created_by_account_id: asset.ownerId,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("breakdown_items")
    .values(
      breakdownFixtures.map(
        ([
          id,
          category,
          item,
          requirementType,
          specification,
          quantity,
          preparation,
          department,
          agentAssessment,
          sourceDocument,
          sourceVersion,
          sourceLocation,
          excerpt,
          confidence,
        ]) => ({
          id,
          project_id: "winter-coffee",
          category,
          item,
          requirement_type: requirementType,
          specification,
          quantity,
          preparation,
          department,
          agent_assessment: agentAssessment,
          source_document: sourceDocument,
          source_version: sourceVersion,
          source_location: sourceLocation,
          source: `${sourceDocument} ${sourceVersion} · ${sourceLocation}`,
          excerpt,
          confidence,
          state: "待确认" as const,
        }),
      ),
    )
    .onConflict((conflict) =>
      conflict.column("id").doUpdateSet((expression) => ({
        requirement_type: expression.ref("excluded.requirement_type"),
        specification: expression.ref("excluded.specification"),
        quantity: expression.ref("excluded.quantity"),
        preparation: expression.ref("excluded.preparation"),
        department: expression.ref("excluded.department"),
        agent_assessment: expression.ref("excluded.agent_assessment"),
        source_document: expression.ref("excluded.source_document"),
        source_version: expression.ref("excluded.source_version"),
        source_location: expression.ref("excluded.source_location"),
        source: expression.ref("excluded.source"),
        excerpt: expression.ref("excluded.excerpt"),
        confidence: expression.ref("excluded.confidence"),
      })),
    )
    .execute()

  await database
    .insertInto("shooting_days")
    .values(
      shootingDayFixtures.map((day) => ({
        id: day.id,
        project_id: "winter-coffee",
        shoot_date: day.shootDate,
        day_number: day.dayNumber,
        title: day.title,
        status: day.status,
        original_timezone: day.originalTimezone,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("call_sheets")
    .values(
      callSheetFixtures.map((sheet) => ({
        id: sheet.id,
        project_id: "winter-coffee",
        shooting_day_id: sheet.shootingDayId,
        date_label: sheet.date,
        day_label: sheet.day,
        title: sheet.title,
        status: sheet.status,
        crew_call: sheet.crewCall,
        first_shot: sheet.firstShot,
        wrap_time: sheet.wrap,
        weather: sheet.weather,
        sunrise: sheet.sunrise,
        sunset: sheet.sunset,
        basecamp: sheet.basecamp,
        location: sheet.location,
        hospital: sheet.hospital,
        scenes: JSON.stringify(sheet.scenes),
        cast_members: JSON.stringify(sheet.cast),
        departments: JSON.stringify(sheet.departments),
        equipment: JSON.stringify(sheet.equipment),
        safety: JSON.stringify(sheet.safety),
        transport: JSON.stringify(sheet.transport),
        catering: JSON.stringify(sheet.catering),
        key_contacts: JSON.stringify(sheet.keyContacts),
        next_day_preview: JSON.stringify(sheet.nextDayPreview),
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  for (const sheet of callSheetFixtures) {
    await database
      .updateTable("call_sheets")
      .set({
        shooting_day_id: sheet.shootingDayId,
        departments: JSON.stringify(sheet.departments),
        equipment: JSON.stringify(sheet.equipment),
        safety: JSON.stringify(sheet.safety),
        transport: JSON.stringify(sheet.transport),
        catering: JSON.stringify(sheet.catering),
        key_contacts: JSON.stringify(sheet.keyContacts),
        next_day_preview: JSON.stringify(sheet.nextDayPreview),
      })
      .where("id", "=", sheet.id)
      .where("project_id", "=", "winter-coffee")
      .execute()
  }

  await database
    .insertInto("breakdown_item_shooting_days")
    .columns(["breakdown_item_id", "shooting_day_id"])
    .expression((expression) =>
      expression
        .selectFrom("breakdown_item_call_sheets as link")
        .innerJoin("call_sheets as sheet", "sheet.id", "link.call_sheet_id")
        .select(["link.breakdown_item_id", "sheet.shooting_day_id"])
        .where("sheet.shooting_day_id", "is not", null),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute()

  await database
    .insertInto("execution_schedule_items")
    .values(
      executionStageFixtures.map((stage) => ({
        id: stage.id,
        project_id: "winter-coffee",
        name: stage.name,
        starts_at: stage.startsAt,
        ends_at: stage.endsAt,
        original_timezone: stage.originalTimezone,
        progress: stage.progress,
        owner_name: stage.owner,
        state: stage.state,
        note: stage.note,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("execution_schedule_resources")
    .values(
      executionStageFixtures.flatMap((stage) =>
        stage.resources.map((resource) => ({
          schedule_item_id: stage.id,
          resource_type: resource.type,
          resource_id: resource.id,
          resource_name: resource.name,
        })),
      ),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute()

  await database
    .insertInto("review_folders")
    .values(
      reviewFolderFixtures.map(([id, name]) => ({
        id,
        project_id: "winter-coffee",
        name,
        created_by_account_id: "account-fanxing",
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("review_files")
    .values(
      reviewFileFixtures.map(([id, name, version, type, status, duration]) => ({
        id,
        project_id: "winter-coffee",
        name,
        version,
        type,
        status,
        duration,
        asset_id: null,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .updateTable("review_files")
    .set({ status: "已通过", asset_id: "asset-winter-main-v11" })
    .where("id", "=", "main-v11")
    .where("project_id", "=", "winter-coffee")
    .execute()

  await database
    .insertInto("team_portfolios")
    .values(
      portfolioFixtures.map((portfolio) => ({
        id: portfolio.id,
        team_id: portfolio.teamId,
        title: portfolio.title,
        category: portfolio.category,
        year: portfolio.year,
        description: portfolio.description,
        state: portfolio.state,
        created_by_account_id: portfolio.ownerId,
        published_by_account_id: null,
        published_at: null,
        archived_at: null,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("portfolio_items")
    .values(
      portfolioFixtures.flatMap((portfolio) =>
        portfolio.contents.map((content) => ({
          id: content.id,
          portfolio_id: portfolio.id,
          asset_id: content.assetId,
          review_file_id: content.reviewFileId,
          title: content.title,
          kind: "主片" as const,
          caption: content.caption,
          featured: content.featured,
          sort_order: content.sortOrder,
        })),
      ),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  await database
    .insertInto("review_comments")
    .values(
      reviewCommentFixtures.map(([id, fileId, actorId, timecode, text, state]) => ({
        id,
        project_id: "winter-coffee",
        file_id: fileId,
        version: "v12",
        author_account_id: actorId,
        timecode,
        text,
        state,
        idempotency_key: `seed-${id}`,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  for (const [projectId, , projectName] of fixtureProjects) {
    const fixture = createScriptFixture(projectId, projectName)
    await database
      .insertInto("script_documents")
      .values({
        id: fixture.document.id,
        project_id: projectId,
        title: fixture.document.title,
        document_type: fixture.document.type,
        current_version_id: fixture.document.currentVersionId,
        is_default: fixture.document.isDefault,
        created_at: fixture.document.createdAt,
      })
      .onConflict((conflict) => conflict.column("id").doNothing())
      .execute()
    await database
      .insertInto("script_versions")
      .values(
        fixture.versions.map((version) => ({
          project_id: projectId,
          id: version.id,
          document_id: fixture.document.id,
          meta: version.meta,
          badge: version.badge,
          content: version.content,
          revision: version.revision,
          is_current: version.isCurrent,
        })),
      )
      .onConflict((conflict) => conflict.columns(["project_id", "id"]).doNothing())
      .execute()
  }

  const storyboardFixture = createWinterCoffeeStoryboardFixture()
  await database
    .insertInto("script_documents")
    .values({
      id: storyboardFixture.document.id,
      project_id: "winter-coffee",
      title: storyboardFixture.document.title,
      document_type: storyboardFixture.document.type,
      current_version_id: storyboardFixture.document.currentVersionId,
      is_default: storyboardFixture.document.isDefault,
      created_at: storyboardFixture.document.createdAt,
    })
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()
  await database
    .insertInto("script_versions")
    .values({
      project_id: "winter-coffee",
      id: storyboardFixture.version.id,
      document_id: storyboardFixture.document.id,
      meta: storyboardFixture.version.meta,
      badge: storyboardFixture.version.badge,
      content: storyboardFixture.version.content,
      revision: storyboardFixture.version.revision,
      is_current: storyboardFixture.version.isCurrent,
    })
    .onConflict((conflict) => conflict.columns(["project_id", "id"]).doNothing())
    .execute()

  await database
    .insertInto("script_comments")
    .values(
      winterCoffeeComments.map((comment) => ({
        id: comment.id,
        project_id: "winter-coffee",
        version_id: comment.versionId,
        author_account_id: comment.actorId,
        text: comment.text,
        excerpt: comment.excerpt,
        idempotency_key: `seed-${comment.id}`,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute()

  const authSeedPassword =
    process.env.AUTH_SEED_PASSWORD ??
    (process.env.NODE_ENV === "production" ? "" : "shadowproducer-local")
  if (authSeedPassword) {
    const auth = createShadowAuth({
      pool,
      baseURL: authBaseURLFromEnvironment(),
      secret: authSecretFromEnvironment(),
      disableSignUp: false,
      autoSignIn: false,
    })
    for (const account of fixtureAccounts) {
      const existing = await pool.query<{ id: string }>(
        "SELECT id FROM auth_user WHERE email = $1",
        [account.email],
      )
      if (!existing.rowCount) {
        await auth.api.signUpEmail({
          body: {
            name: account.displayName,
            email: account.email,
            password: authSeedPassword,
          },
        })
      }
    }
  }
} finally {
  await database.destroy()
}

console.log("ShadowProducer database migration and deterministic seed completed.")
