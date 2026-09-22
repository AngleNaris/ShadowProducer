import { createHash, randomUUID } from "node:crypto"

import {
  AppError,
  type ConfirmBreakdownCommand,
  type CreateCallSheetCommand,
  type CreateExecutionStageCommand,
  type CreateReviewCommentCommand,
  type CreateReviewCommentLinkCommand,
  type CreateReviewFileCommand,
  type CreateReviewFolderCommand,
  type CreateShootingDayCommand,
  type GeneratedCallSheetDraft,
  type MergeBreakdownCommand,
  type MoveReviewFileCommand,
  type PermanentlyDeleteReviewFileCommand,
  type ProductionRepository,
  type PublishCallSheetCommand,
  type ReviewFileApprovalCommand,
  type SplitBreakdownCommand,
  type UnlinkReviewCommentLinkCommand,
  type UpdateBreakdownCommand,
  type UpdateCallSheetCommand,
  type UpdateExecutionStageCommand,
  type UpdateReviewCommentCommand,
  type UpdateReviewFileArchiveCommand,
  type UpdateReviewFolderCommand,
  type UpdateShootingDayCommand,
} from "@shadowproducer/application"
import type {
  BreakdownItem,
  BreakdownRelationOptions,
  CallSheet,
  CallSheetChange,
  CallSheetPublication,
  CallSheetPublicationRecipient,
  ContactRef,
  ExecutionConflict,
  ExecutionResource,
  ExecutionStage,
  ReviewComment,
  ReviewCommentLink,
  ReviewFile,
  ReviewFolder,
  ShootingDay,
} from "@shadowproducer/contracts"
import { type Kysely, type Selectable, sql, type Transaction } from "kysely"

import type { Database } from "./database"
import { resolveProjectAccess } from "./postgres-access"
import { writeReviewActivityNotifications } from "./postgres-review-notifications"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>
type CallSheetPublishReceipt = {
  item: CallSheet
  publication: CallSheetPublication
}

type DeliveredCallSheetRecipient = {
  id: string
  notificationId: string
  accountId: string
  displayName: string
  email: string | null
  projectRole: string
  deliveredAt: Date
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toDateOnly(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function requestHash(value: object) {
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "idempotencyKey")
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

export class PostgresProductionRepository implements ProductionRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getProjectAccess(actorId: string, projectId: string) {
    return resolveProjectAccess(this.database, actorId, projectId)
  }

  async listBreakdown(projectId: string) {
    const rows = await this.database
      .selectFrom("breakdown_items as item")
      .leftJoin(
        "accounts as responsible",
        "responsible.id",
        "item.responsible_account_id",
      )
      .selectAll("item")
      .select("responsible.display_name as responsible_name")
      .where("item.project_id", "=", projectId)
      .orderBy("item.category", "asc")
      .orderBy("item.created_at", "asc")
      .execute()
    const itemIds = rows.map((row) => row.id)
    const [suppliers, tasks, contacts, callSheets, shootingDays] = await Promise.all([
      this.listBreakdownSuppliers(this.database, itemIds),
      this.listBreakdownTasks(this.database, itemIds),
      this.listBreakdownContacts(this.database, itemIds),
      this.listBreakdownCallSheets(this.database, itemIds),
      this.listBreakdownShootingDays(this.database, itemIds),
    ])
    return rows.map((row) =>
      this.mapBreakdown(
        row,
        suppliers.get(row.id) ?? [],
        row.responsible_name,
        tasks.get(row.id) ?? [],
        contacts.get(row.id) ?? [],
        callSheets.get(row.id) ?? [],
        shootingDays.get(row.id) ?? [],
      ),
    )
  }

  async listBreakdownRelationOptions(
    projectId: string,
  ): Promise<BreakdownRelationOptions> {
    const [members, tasks, contacts, shootingDays, callSheets] = await Promise.all([
      this.database
        .selectFrom("project_memberships as membership")
        .innerJoin("accounts as account", "account.id", "membership.account_id")
        .select([
          "membership.account_id as accountId",
          "account.display_name as displayName",
          "membership.role",
        ])
        .where("membership.project_id", "=", projectId)
        .orderBy("account.display_name", "asc")
        .execute(),
      this.database
        .selectFrom("workspace_tasks as task")
        .innerJoin("accounts as assignee", "assignee.id", "task.assignee_account_id")
        .select([
          "task.id",
          "task.title",
          "task.status",
          "assignee.display_name as assigneeName",
        ])
        .where("task.project_id", "=", projectId)
        .where("task.deleted_at", "is", null)
        .orderBy("task.status", "asc")
        .orderBy("task.title", "asc")
        .execute(),
      this.listBreakdownContactOptions(this.database, projectId),
      this.database
        .selectFrom("shooting_days")
        .select([
          "id",
          "shoot_date as shootDate",
          "day_number as dayNumber",
          "title",
          "status",
        ])
        .where("project_id", "=", projectId)
        .orderBy("shoot_date", "asc")
        .execute(),
      this.database
        .selectFrom("call_sheets")
        .select(["id", "date_label as date", "day_label as day", "title", "status"])
        .where("project_id", "=", projectId)
        .orderBy("created_at", "asc")
        .execute(),
    ])
    return {
      members,
      tasks,
      contacts,
      shootingDays: shootingDays.map((day) => ({
        ...day,
        shootDate: toDateOnly(day.shootDate),
      })),
      callSheets,
    }
  }

  async updateBreakdown(command: UpdateBreakdownCommand) {
    return this.database.transaction().execute(async (transaction) => {
      if (
        command.supplierIds !== undefined ||
        command.responsibleAccountId !== undefined ||
        command.taskIds !== undefined ||
        command.contactRefs !== undefined ||
        command.shootingDayIds !== undefined ||
        command.callSheetIds !== undefined
      ) {
        const current = await transaction
          .selectFrom("breakdown_items")
          .select(["revision", "state"])
          .where("id", "=", command.itemId)
          .where("project_id", "=", command.projectId)
          .forUpdate()
          .executeTakeFirst()
        if (!current) return { kind: "not_found" } as const
        if (current.revision !== command.expectedRevision)
          return { kind: "conflict" } as const
        if (current.state !== "已确认") return { kind: "invalid_state" } as const
        const supplierIds = [...new Set(command.supplierIds ?? [])]
        if (command.supplierIds !== undefined && supplierIds.length) {
          const valid = await transaction
            .selectFrom("suppliers as supplier")
            .innerJoin("supplier_projects as link", "link.supplier_id", "supplier.id")
            .innerJoin("projects as project", "project.id", "link.project_id")
            .select("supplier.id")
            .where("supplier.id", "in", supplierIds)
            .where("link.project_id", "=", command.projectId)
            .whereRef("supplier.team_id", "=", "project.team_id")
            .where("supplier.deleted_at", "is", null)
            .execute()
          if (valid.length !== supplierIds.length)
            return { kind: "invalid_supplier" } as const
        }
        if (command.responsibleAccountId) {
          const responsible = await transaction
            .selectFrom("project_memberships as membership")
            .innerJoin("projects as project", "project.id", "membership.project_id")
            .innerJoin("team_memberships as team_member", (join) =>
              join
                .onRef("team_member.team_id", "=", "project.team_id")
                .onRef("team_member.account_id", "=", "membership.account_id"),
            )
            .select("membership.account_id")
            .where("membership.project_id", "=", command.projectId)
            .where("membership.account_id", "=", command.responsibleAccountId)
            .executeTakeFirst()
          if (!responsible) return { kind: "invalid_responsible" } as const
        }
        const taskIds = [...new Set(command.taskIds ?? [])]
        if (command.taskIds !== undefined && taskIds.length) {
          const valid = await transaction
            .selectFrom("workspace_tasks as task")
            .innerJoin("projects as project", "project.id", "task.project_id")
            .select("task.id")
            .where("task.id", "in", taskIds)
            .where("task.project_id", "=", command.projectId)
            .whereRef("task.team_id", "=", "project.team_id")
            .where("task.deleted_at", "is", null)
            .execute()
          if (valid.length !== taskIds.length) return { kind: "invalid_task" } as const
        }
        const contactRefs = [
          ...new Map(
            (command.contactRefs ?? []).map((contact) => [
              `${contact.source}:${contact.contactId}`,
              contact,
            ]),
          ).values(),
        ]
        if (command.contactRefs !== undefined && contactRefs.length) {
          const available = await this.listBreakdownContactOptions(
            transaction,
            command.projectId,
          )
          const allowed = new Set(
            available.map((contact) => `${contact.source}:${contact.id}`),
          )
          if (
            contactRefs.some(
              (contact) => !allowed.has(`${contact.source}:${contact.contactId}`),
            )
          ) {
            return { kind: "invalid_contact" } as const
          }
        }
        const callSheetIds = [...new Set(command.callSheetIds ?? [])]
        if (command.callSheetIds !== undefined && callSheetIds.length) {
          const valid = await transaction
            .selectFrom("call_sheets")
            .select("id")
            .where("id", "in", callSheetIds)
            .where("project_id", "=", command.projectId)
            .execute()
          if (valid.length !== callSheetIds.length) {
            return { kind: "invalid_call_sheet" } as const
          }
        }
        const shootingDayIds = [...new Set(command.shootingDayIds ?? [])]
        if (command.shootingDayIds !== undefined && shootingDayIds.length) {
          const valid = await transaction
            .selectFrom("shooting_days")
            .select("id")
            .where("id", "in", shootingDayIds)
            .where("project_id", "=", command.projectId)
            .execute()
          if (valid.length !== shootingDayIds.length) {
            return { kind: "invalid_shooting_day" } as const
          }
        }
      }
      const values: Record<string, unknown> = { updated_at: new Date() }
      if (command.item !== undefined) values.item = command.item
      if (command.requirementType !== undefined) {
        values.requirement_type = command.requirementType
      }
      if (command.specification !== undefined)
        values.specification = command.specification
      if (command.quantity !== undefined) values.quantity = command.quantity
      if (command.preparation !== undefined) values.preparation = command.preparation
      if (command.department !== undefined) values.department = command.department
      if (command.state !== undefined) values.state = command.state
      if (command.responsibleAccountId !== undefined) {
        values.responsible_account_id = command.responsibleAccountId
      }
      const updated = await transaction
        .updateTable("breakdown_items")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .returningAll()
        .executeTakeFirst()
      if (!updated) {
        return this.productionMissingOrConflict(
          transaction,
          "breakdown_items",
          command.projectId,
          command.itemId,
        )
      }
      if (command.supplierIds !== undefined) {
        await this.replaceBreakdownSuppliers(
          transaction,
          command.itemId,
          command.supplierIds,
        )
      }
      if (command.taskIds !== undefined) {
        await this.replaceBreakdownTasks(transaction, command.itemId, command.taskIds)
      }
      if (command.contactRefs !== undefined) {
        await this.replaceBreakdownContacts(
          transaction,
          command.itemId,
          command.contactRefs,
        )
      }
      if (command.callSheetIds !== undefined) {
        await this.replaceBreakdownCallSheets(
          transaction,
          command.itemId,
          command.callSheetIds,
        )
      }
      if (command.shootingDayIds !== undefined) {
        await this.replaceBreakdownShootingDays(
          transaction,
          command.itemId,
          command.shootingDayIds,
        )
      }
      const supplierIds =
        command.supplierIds ??
        (await this.listBreakdownSuppliers(transaction, [command.itemId])).get(
          command.itemId,
        ) ??
        []
      const taskIds =
        command.taskIds ??
        (await this.listBreakdownTasks(transaction, [command.itemId])).get(
          command.itemId,
        ) ??
        []
      const contactRefs =
        command.contactRefs ??
        (await this.listBreakdownContacts(transaction, [command.itemId])).get(
          command.itemId,
        ) ??
        []
      const callSheetIds =
        command.callSheetIds ??
        (await this.listBreakdownCallSheets(transaction, [command.itemId])).get(
          command.itemId,
        ) ??
        []
      const shootingDayIds =
        command.shootingDayIds ??
        (await this.listBreakdownShootingDays(transaction, [command.itemId])).get(
          command.itemId,
        ) ??
        []
      const responsibleName = updated.responsible_account_id
        ? ((
            await transaction
              .selectFrom("accounts")
              .select("display_name")
              .where("id", "=", updated.responsible_account_id)
              .executeTakeFirst()
          )?.display_name ?? null)
        : null
      const item = this.mapBreakdown(
        updated,
        supplierIds,
        responsibleName,
        taskIds,
        contactRefs,
        callSheetIds,
        shootingDayIds,
      )
      await this.writeAudit(transaction, command, "breakdown.updated", item.id, {
        fields: Object.keys(command).filter(
          (key) => !["actorId", "projectId", "itemId", "expectedRevision"].includes(key),
        ),
        state: item.state,
        revision: item.revision,
      })
      return { kind: "ok", item } as const
    })
  }

  async confirmBreakdown(command: ConfirmBreakdownCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `breakdown.confirm:${command.projectId}`
      const replay = await this.getReceipt<BreakdownItem[]>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { items: replay, replayed: true }

      const ids = command.items.map((item) => item.itemId)
      const rows = await transaction
        .selectFrom("breakdown_items")
        .selectAll()
        .where("project_id", "=", command.projectId)
        .where("id", "in", ids)
        .orderBy("id", "asc")
        .forUpdate()
        .execute()

      const replayAfterLock = await this.getReceipt<BreakdownItem[]>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replayAfterLock) return { items: replayAfterLock, replayed: true }
      if (rows.length !== ids.length) return { kind: "not_found" } as const

      const expectedRevisions = new Map(
        command.items.map((item) => [item.itemId, item.expectedRevision]),
      )
      if (
        rows.some((row) => row.category !== command.category || row.state !== "待确认")
      ) {
        return { kind: "invalid_selection" } as const
      }
      if (rows.some((row) => row.revision !== expectedRevisions.get(row.id))) {
        return { kind: "conflict" } as const
      }

      const updatedRows = await transaction
        .updateTable("breakdown_items")
        .set({ state: "已确认", updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("project_id", "=", command.projectId)
        .where("id", "in", ids)
        .returningAll()
        .execute()
      if (updatedRows.length !== ids.length) {
        throw new AppError(
          "RESOURCE_CONFLICT",
          "所选拆解项已在其他位置更新，请重新载入后再试",
          409,
        )
      }

      const updatedById = new Map(
        updatedRows.map((row) => [row.id, this.mapBreakdown(row)]),
      )
      const items = ids.map((id) => updatedById.get(id) as BreakdownItem)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        items,
      )
      await this.writeAudit(
        transaction,
        command,
        "breakdown.batch-confirmed",
        `${command.projectId}:${command.category}`,
        {
          category: command.category,
          items: items.map((item) => ({ id: item.id, revision: item.revision })),
        },
      )
      return { items, replayed: false }
    })
  }

  async mergeBreakdown(command: MergeBreakdownCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `breakdown.merge:${command.projectId}`
      const replay = await this.getReceipt<BreakdownItem[]>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { items: replay, replayed: true }

      const ids = command.items.map((item) => item.itemId)
      const rows = await transaction
        .selectFrom("breakdown_items")
        .selectAll()
        .where("project_id", "=", command.projectId)
        .where("id", "in", ids)
        .orderBy("id", "asc")
        .forUpdate()
        .execute()
      const replayAfterLock = await this.getReceipt<BreakdownItem[]>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replayAfterLock) return { items: replayAfterLock, replayed: true }
      if (rows.length !== ids.length) return { kind: "not_found" } as const

      const expectedRevisions = new Map(
        command.items.map((item) => [item.itemId, item.expectedRevision]),
      )
      const primary = rows.find((row) => row.id === command.primaryItemId)
      if (
        !primary ||
        rows.some((row) => row.category !== command.category || row.state !== "待确认")
      ) {
        return { kind: "invalid_selection" } as const
      }
      if (rows.some((row) => row.revision !== expectedRevisions.get(row.id))) {
        return { kind: "conflict" } as const
      }

      const resultId = randomUUID()
      const resultRow = await transaction
        .insertInto("breakdown_items")
        .values({
          id: resultId,
          project_id: command.projectId,
          category: command.category,
          item: command.result.item,
          requirement_type: command.result.requirementType,
          specification: command.result.specification,
          quantity: command.result.quantity,
          preparation: command.result.preparation,
          department: command.result.department,
          agent_assessment: primary.agent_assessment,
          source_document: primary.source_document,
          source_version: primary.source_version,
          source_location: primary.source_location,
          source: primary.source,
          excerpt: primary.excerpt,
          confidence: primary.confidence,
          state: "待确认",
          parent_item_id: null,
          merged_into_item_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const updatedRows = await transaction
        .updateTable("breakdown_items")
        .set({
          state: "已取消",
          merged_into_item_id: resultId,
          updated_at: new Date(),
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("project_id", "=", command.projectId)
        .where("id", "in", ids)
        .returningAll()
        .execute()
      if (updatedRows.length !== ids.length) {
        throw new AppError("RESOURCE_CONFLICT", "所选拆解项已发生变化", 409)
      }

      const updatedById = new Map(updatedRows.map((row) => [row.id, row]))
      const sourceRows = ids.map((id) => {
        const row = updatedById.get(id)
        if (!row) throw new AppError("RESOURCE_CONFLICT", "所选拆解项已发生变化", 409)
        return row
      })
      const items = [
        this.mapBreakdown(resultRow),
        ...sourceRows.map((row) => this.mapBreakdown(row)),
      ]
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        items,
      )
      await this.writeAudit(transaction, command, "breakdown.merged", resultId, {
        primaryItemId: command.primaryItemId,
        sourceItems: sourceRows.map((row) => ({
          id: row.id,
          revision: row.revision,
        })),
        resultRevision: resultRow.revision,
      })
      return { items, replayed: false }
    })
  }

  async splitBreakdown(command: SplitBreakdownCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `breakdown.split:${command.projectId}`
      const replay = await this.getReceipt<BreakdownItem[]>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { items: replay, replayed: true }

      const parent = await transaction
        .selectFrom("breakdown_items")
        .selectAll()
        .where("project_id", "=", command.projectId)
        .where("id", "=", command.itemId)
        .forUpdate()
        .executeTakeFirst()
      const replayAfterLock = await this.getReceipt<BreakdownItem[]>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replayAfterLock) return { items: replayAfterLock, replayed: true }
      if (!parent) return { kind: "not_found" } as const
      if (parent.state !== "待确认") return { kind: "invalid_selection" } as const
      if (parent.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }

      const childRows = await transaction
        .insertInto("breakdown_items")
        .values(
          command.items.map((item) => ({
            id: randomUUID(),
            project_id: command.projectId,
            category: parent.category,
            item: item.item,
            requirement_type: item.requirementType,
            specification: item.specification,
            quantity: item.quantity,
            preparation: item.preparation,
            department: item.department,
            agent_assessment: parent.agent_assessment,
            source_document: parent.source_document,
            source_version: parent.source_version,
            source_location: parent.source_location,
            source: parent.source,
            excerpt: parent.excerpt,
            confidence: parent.confidence,
            state: "待确认" as const,
            parent_item_id: parent.id,
            merged_into_item_id: null,
          })),
        )
        .returningAll()
        .execute()
      const updatedParent = await transaction
        .updateTable("breakdown_items")
        .set({ state: "已取消", updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("project_id", "=", command.projectId)
        .where("id", "=", command.itemId)
        .returningAll()
        .executeTakeFirstOrThrow()
      const items = [
        this.mapBreakdown(updatedParent),
        ...childRows.map((row) => this.mapBreakdown(row)),
      ]
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        items,
      )
      await this.writeAudit(transaction, command, "breakdown.split", parent.id, {
        parentRevision: updatedParent.revision,
        childItems: childRows.map((row) => ({ id: row.id, revision: row.revision })),
      })
      return { items, replayed: false }
    })
  }

  async listExecutionSchedule(actorId: string, projectId: string) {
    const rows = await this.database
      .selectFrom("execution_schedule_items")
      .selectAll()
      .where("project_id", "=", projectId)
      .orderBy("starts_at", "asc")
      .execute()
    const resources = rows.length
      ? await this.database
          .selectFrom("execution_schedule_resources")
          .selectAll()
          .where(
            "schedule_item_id",
            "in",
            rows.map((row) => row.id),
          )
          .execute()
      : []
    const resourceMap = new Map<string, ExecutionResource[]>()
    for (const resource of resources) {
      const entries = resourceMap.get(resource.schedule_item_id) ?? []
      entries.push({
        id: resource.resource_id,
        type: resource.resource_type,
        name: resource.resource_name,
      })
      resourceMap.set(resource.schedule_item_id, entries)
    }

    const conflicts = await sql<{
      item_id: string
      item_name: string
      other_item_id: string
      other_item_name: string
      other_project_id: string
      overlap_starts_at: Date | string
      overlap_ends_at: Date | string
      resource_type: ExecutionResource["type"]
      resource_id: string
      resource_name: string
      visible_project_id: string | null
    }>`
      SELECT
        own.id AS item_id,
        own.name AS item_name,
        other.id AS other_item_id,
        other.name AS other_item_name,
        other.project_id AS other_project_id,
        GREATEST(own.starts_at, other.starts_at) AS overlap_starts_at,
        LEAST(own.ends_at, other.ends_at) AS overlap_ends_at,
        own_resource.resource_type,
        own_resource.resource_id,
        own_resource.resource_name,
        visible.project_id AS visible_project_id
      FROM execution_schedule_items own
      JOIN projects own_project ON own_project.id = own.project_id
      JOIN execution_schedule_resources own_resource
        ON own_resource.schedule_item_id = own.id
      JOIN execution_schedule_resources other_resource
        ON other_resource.resource_type = own_resource.resource_type
       AND other_resource.resource_id = own_resource.resource_id
       AND other_resource.schedule_item_id <> own.id
      JOIN execution_schedule_items other
        ON other.id = other_resource.schedule_item_id
       AND own.starts_at < other.ends_at
       AND other.starts_at < own.ends_at
      JOIN projects other_project
        ON other_project.id = other.project_id
       AND other_project.team_id = own_project.team_id
      LEFT JOIN project_memberships visible
        ON visible.project_id = other.project_id
       AND visible.account_id = ${actorId}
      WHERE own.project_id = ${projectId}
    `.execute(this.database)
    const seen = new Set<string>()
    const mappedConflicts: ExecutionConflict[] = []
    for (const row of conflicts.rows) {
      const pair = [row.item_id, row.other_item_id].sort().join(":")
      const key = `${pair}:${row.resource_type}:${row.resource_id}`
      if (seen.has(key)) continue
      seen.add(key)
      const redacted = row.other_project_id !== projectId && !row.visible_project_id
      mappedConflicts.push({
        key,
        resource: {
          id: row.resource_id,
          type: row.resource_type,
          name: row.resource_name,
        },
        itemId: row.item_id,
        itemName: row.item_name,
        conflictingItemId: redacted ? null : row.other_item_id,
        conflictingProjectId: redacted ? null : row.other_project_id,
        conflictingItemName: redacted ? "其他项目占用" : row.other_item_name,
        startsAt: toIso(row.overlap_starts_at),
        endsAt: toIso(row.overlap_ends_at),
        crossProject: row.other_project_id !== projectId,
        redacted,
      })
    }
    return {
      items: rows.map((row) =>
        this.mapExecutionStage(row, resourceMap.get(row.id) ?? []),
      ),
      conflicts: mappedConflicts,
    }
  }

  async createExecutionStage(command: CreateExecutionStageCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `execution-stage.create:${command.projectId}`
      const replay = await this.getReceipt<ExecutionStage>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }
      const id = randomUUID()
      await transaction
        .insertInto("execution_schedule_items")
        .values({
          id,
          project_id: command.projectId,
          name: command.name,
          starts_at: command.startsAt,
          ends_at: command.endsAt,
          original_timezone: command.originalTimezone,
          progress: command.progress,
          owner_name: command.owner,
          state: command.state,
          note: command.note,
        })
        .execute()
      await this.replaceExecutionResources(transaction, id, command.resources)
      const item = await this.findExecutionStage(transaction, command.projectId, id)
      if (!item) throw new Error("Created execution stage could not be read")
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(transaction, command, "execution-stage.created", id, {
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        resourceCount: item.resources.length,
      })
      return { item, replayed: false }
    })
  }

  async updateExecutionStage(command: UpdateExecutionStageCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const values: Record<string, unknown> = { updated_at: new Date() }
      if (command.name !== undefined) values.name = command.name
      if (command.startsAt !== undefined) values.starts_at = command.startsAt
      if (command.endsAt !== undefined) values.ends_at = command.endsAt
      if (command.originalTimezone !== undefined) {
        values.original_timezone = command.originalTimezone
      }
      if (command.progress !== undefined) values.progress = command.progress
      if (command.owner !== undefined) values.owner_name = command.owner
      if (command.state !== undefined) values.state = command.state
      if (command.note !== undefined) values.note = command.note
      const updated = await transaction
        .updateTable("execution_schedule_items")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .returning("id")
        .executeTakeFirst()
      if (!updated) {
        return this.productionMissingOrConflict(
          transaction,
          "execution_schedule_items",
          command.projectId,
          command.itemId,
        )
      }
      if (command.resources !== undefined) {
        await this.replaceExecutionResources(
          transaction,
          command.itemId,
          command.resources,
        )
      }
      const item = await this.findExecutionStage(
        transaction,
        command.projectId,
        command.itemId,
      )
      if (!item) return { kind: "not_found" } as const
      await this.writeAudit(transaction, command, "execution-stage.updated", item.id, {
        revision: item.revision,
        resourceCount: item.resources.length,
      })
      return { kind: "ok", item } as const
    })
  }

  async listShootingDays(projectId: string) {
    const rows = await this.database
      .selectFrom("shooting_days")
      .selectAll()
      .where("project_id", "=", projectId)
      .orderBy("shoot_date", "asc")
      .orderBy("day_number", "asc")
      .execute()
    return rows.map((row) => this.mapShootingDay(row))
  }

  async createShootingDay(command: CreateShootingDayCommand) {
    try {
      return await this.database.transaction().execute(async (transaction) => {
        const hash = requestHash(command)
        const domain = `shooting-day.create:${command.projectId}`
        const replay = await this.getReceipt<ShootingDay>(
          transaction,
          command.actorId,
          domain,
          command.idempotencyKey,
          hash,
        )
        if (replay) return { item: replay, replayed: true }
        const duplicate = await transaction
          .selectFrom("shooting_days")
          .select("id")
          .where("project_id", "=", command.projectId)
          .where((expression) =>
            expression.or([
              expression("shoot_date", "=", command.shootDate),
              expression("day_number", "=", command.dayNumber),
            ]),
          )
          .executeTakeFirst()
        if (duplicate) return { kind: "duplicate" } as const
        const id = randomUUID()
        await transaction
          .insertInto("shooting_days")
          .values({
            id,
            project_id: command.projectId,
            shoot_date: command.shootDate,
            day_number: command.dayNumber,
            title: command.title,
            status: "草稿",
            original_timezone: command.originalTimezone,
          })
          .execute()
        const row = await transaction
          .selectFrom("shooting_days")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
        const item = this.mapShootingDay(row)
        await this.writeReceipt(
          transaction,
          command.actorId,
          domain,
          command.idempotencyKey,
          hash,
          item,
        )
        await this.writeAudit(transaction, command, "shooting-day.created", id, {
          shootDate: item.shootDate,
          dayNumber: item.dayNumber,
        })
        return { item, replayed: false }
      })
    } catch (error) {
      if (this.isShootingDayUniqueViolation(error)) return { kind: "duplicate" } as const
      throw error
    }
  }

  async updateShootingDay(command: UpdateShootingDayCommand) {
    try {
      return await this.database.transaction().execute(async (transaction) => {
        const current = await transaction
          .selectFrom("shooting_days")
          .selectAll()
          .where("id", "=", command.itemId)
          .where("project_id", "=", command.projectId)
          .forUpdate()
          .executeTakeFirst()
        if (!current) return { kind: "not_found" } as const
        if (current.revision !== command.expectedRevision) {
          return { kind: "conflict" } as const
        }
        if (command.shootDate !== undefined || command.dayNumber !== undefined) {
          const duplicate = await transaction
            .selectFrom("shooting_days")
            .select("id")
            .where("project_id", "=", command.projectId)
            .where("id", "!=", command.itemId)
            .where((expression) =>
              expression.or([
                expression("shoot_date", "=", command.shootDate ?? current.shoot_date),
                expression("day_number", "=", command.dayNumber ?? current.day_number),
              ]),
            )
            .executeTakeFirst()
          if (duplicate) return { kind: "duplicate" } as const
        }
        const values: Record<string, unknown> = { updated_at: new Date() }
        if (command.shootDate !== undefined) values.shoot_date = command.shootDate
        if (command.dayNumber !== undefined) values.day_number = command.dayNumber
        if (command.title !== undefined) values.title = command.title
        if (command.status !== undefined) values.status = command.status
        if (command.originalTimezone !== undefined) {
          values.original_timezone = command.originalTimezone
        }
        const updated = await transaction
          .updateTable("shooting_days")
          .set(values)
          .set((expression) => ({ revision: expression("revision", "+", 1) }))
          .where("id", "=", command.itemId)
          .where("project_id", "=", command.projectId)
          .where("revision", "=", command.expectedRevision)
          .returningAll()
          .executeTakeFirst()
        if (!updated) {
          return this.productionMissingOrConflict(
            transaction,
            "shooting_days",
            command.projectId,
            command.itemId,
          )
        }
        const item = this.mapShootingDay(updated)
        await this.writeAudit(
          transaction,
          command,
          "shooting-day.updated",
          command.itemId,
          {
            fields: Object.keys(command).filter(
              (key) =>
                !["actorId", "projectId", "itemId", "expectedRevision"].includes(key),
            ),
            status: item.status,
            revision: item.revision,
          },
        )
        return { kind: "ok", item } as const
      })
    } catch (error) {
      if (this.isShootingDayUniqueViolation(error)) return { kind: "duplicate" } as const
      throw error
    }
  }

  async listCallSheets(projectId: string) {
    const rows = await this.database
      .selectFrom("call_sheets")
      .selectAll()
      .where("project_id", "=", projectId)
      .orderBy("created_at", "asc")
      .execute()
    return rows.map((row) => this.mapCallSheet(row))
  }

  async listCallSheetHistory(projectId: string, itemId: string, actorId: string) {
    const sheet = await this.database
      .selectFrom("call_sheets")
      .select("id")
      .where("id", "=", itemId)
      .where("project_id", "=", projectId)
      .executeTakeFirst()
    if (!sheet) return null
    const [publicationRows, changeRows, recipientRows] = await Promise.all([
      this.database
        .selectFrom("call_sheet_publications as publication")
        .leftJoin("accounts as actor", "actor.id", "publication.published_by_account_id")
        .select([
          "publication.id",
          "publication.call_sheet_id",
          "publication.version",
          "publication.snapshot",
          "publication.published_at",
          "actor.display_name as actor_name",
        ])
        .where("publication.call_sheet_id", "=", itemId)
        .where("publication.project_id", "=", projectId)
        .orderBy("publication.version", "desc")
        .execute(),
      this.database
        .selectFrom("call_sheet_changes as change")
        .innerJoin("accounts as actor", "actor.id", "change.changed_by_account_id")
        .select([
          "change.id",
          "change.call_sheet_id",
          "change.base_publication_version",
          "change.summary",
          "change.before_snapshot",
          "change.after_snapshot",
          "change.changed_at",
          "actor.display_name as actor_name",
        ])
        .where("change.call_sheet_id", "=", itemId)
        .where("change.project_id", "=", projectId)
        .orderBy("change.changed_at", "desc")
        .execute(),
      this.database
        .selectFrom("call_sheet_publication_recipients as recipient")
        .leftJoin(
          "notifications as notification",
          "notification.id",
          "recipient.notification_id",
        )
        .select([
          "recipient.id",
          "recipient.publication_id",
          "recipient.recipient_account_id",
          "recipient.notification_id",
          "recipient.recipient_snapshot",
          "recipient.delivered_at",
          "notification.acknowledged_at",
        ])
        .where("recipient.call_sheet_id", "=", itemId)
        .where("recipient.project_id", "=", projectId)
        .orderBy("recipient.created_at", "asc")
        .execute(),
    ])
    const recipientsByPublication = new Map<string, CallSheetPublicationRecipient[]>()
    for (const row of recipientRows) {
      const recipients = recipientsByPublication.get(row.publication_id) ?? []
      recipients.push({
        id: row.id,
        notificationId: row.notification_id,
        displayName: row.recipient_snapshot.displayName,
        email: row.recipient_snapshot.email,
        projectRole: row.recipient_snapshot.projectRole,
        deliveredAt: toIso(row.delivered_at),
        acknowledgedAt: row.acknowledged_at ? toIso(row.acknowledged_at) : null,
        canAcknowledge:
          row.recipient_account_id === actorId &&
          row.notification_id !== null &&
          row.acknowledged_at === null,
      })
      recipientsByPublication.set(row.publication_id, recipients)
    }
    return {
      publications: publicationRows.map((row) => ({
        id: row.id,
        callSheetId: row.call_sheet_id,
        version: row.version,
        snapshot: row.snapshot,
        publishedBy: row.actor_name ?? "历史迁移",
        publishedAt: toIso(row.published_at),
        recipients: recipientsByPublication.get(row.id) ?? [],
      })),
      changes: changeRows.map(
        (row): CallSheetChange => ({
          id: row.id,
          callSheetId: row.call_sheet_id,
          basePublicationVersion: row.base_publication_version,
          summary: row.summary,
          beforeSnapshot: row.before_snapshot,
          afterSnapshot: row.after_snapshot,
          changedBy: row.actor_name,
          changedAt: toIso(row.changed_at),
        }),
      ),
    }
  }

  async createCallSheet(
    command: CreateCallSheetCommand,
    draft?: GeneratedCallSheetDraft,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `call-sheet.create:${command.projectId}`
      const replay = await this.getReceipt<CallSheet>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }
      const shootingDay = command.shootingDayId
        ? await transaction
            .selectFrom("shooting_days")
            .selectAll()
            .where("id", "=", command.shootingDayId)
            .where("project_id", "=", command.projectId)
            .executeTakeFirst()
        : null
      if (command.shootingDayId && !shootingDay) {
        throw new AppError(
          "CALL_SHEET_SHOOTING_DAY_UNAVAILABLE",
          "所选拍摄日不属于当前项目",
          400,
        )
      }
      const id = randomUUID()
      await transaction
        .insertInto("call_sheets")
        .values({
          id,
          project_id: command.projectId,
          shooting_day_id: shootingDay?.id ?? null,
          date_label: shootingDay
            ? toDateOnly(shootingDay.shoot_date)
            : (command.date?.trim() ?? "待安排"),
          day_label: shootingDay ? `拍摄第 ${shootingDay.day_number} 天` : "待安排",
          title: command.title?.trim() || shootingDay?.title || "未命名通告",
          status: "草稿",
          crew_call: "待定",
          first_shot: "待定",
          wrap_time: "待定",
          weather: "待更新",
          sunrise: "待更新",
          sunset: "待更新",
          basecamp: "待安排",
          location: draft?.location ?? "待安排",
          hospital: "待更新",
          scenes: JSON.stringify(draft?.scenes ?? []),
          cast_members: JSON.stringify(draft?.cast ?? []),
          departments: JSON.stringify(draft?.departments ?? []),
          equipment: JSON.stringify(draft?.equipment ?? []),
          safety: JSON.stringify(draft?.safety ?? []),
          transport: JSON.stringify([]),
          catering: JSON.stringify([]),
          key_contacts: JSON.stringify(draft?.keyContacts ?? []),
          next_day_preview: JSON.stringify({
            date: "",
            title: "",
            scenes: "",
            cast: "",
            note: "",
          }),
        })
        .execute()
      if (draft?.breakdownItemIds.length) {
        await transaction
          .insertInto("breakdown_item_call_sheets")
          .values(
            draft.breakdownItemIds.map((breakdownItemId) => ({
              breakdown_item_id: breakdownItemId,
              call_sheet_id: id,
            })),
          )
          .execute()
      }
      const item = await this.findCallSheet(transaction, command.projectId, id)
      if (!item) throw new Error("Created call sheet could not be read")
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(transaction, command, "call-sheet.created", id, {
        status: item.status,
      })
      return { item, replayed: false }
    })
  }

  async updateCallSheet(command: UpdateCallSheetCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const currentRow = await transaction
        .selectFrom("call_sheets")
        .selectAll()
        .where("id", "=", command.itemId)
        .where("project_id", "=", command.projectId)
        .forUpdate()
        .executeTakeFirst()
      if (!currentRow) return { kind: "not_found" } as const
      if (currentRow.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      const before = this.mapCallSheet(currentRow)
      const values: Record<string, unknown> = { updated_at: new Date() }
      if (command.date !== undefined) values.date_label = command.date.trim()
      if (command.day !== undefined) values.day_label = command.day.trim()
      if (command.title !== undefined) values.title = command.title.trim()
      if (command.status !== undefined) values.status = command.status
      if (command.crewCall !== undefined) values.crew_call = command.crewCall.trim()
      if (command.firstShot !== undefined) values.first_shot = command.firstShot.trim()
      if (command.wrap !== undefined) values.wrap_time = command.wrap.trim()
      if (command.weather !== undefined) values.weather = command.weather.trim()
      if (command.sunrise !== undefined) values.sunrise = command.sunrise.trim()
      if (command.sunset !== undefined) values.sunset = command.sunset.trim()
      if (command.basecamp !== undefined) values.basecamp = command.basecamp.trim()
      if (command.location !== undefined) values.location = command.location.trim()
      if (command.hospital !== undefined) values.hospital = command.hospital.trim()
      if (command.scenes !== undefined) values.scenes = JSON.stringify(command.scenes)
      if (command.cast !== undefined) values.cast_members = JSON.stringify(command.cast)
      if (command.departments !== undefined) {
        values.departments = JSON.stringify(command.departments)
      }
      if (command.equipment !== undefined)
        values.equipment = JSON.stringify(command.equipment)
      if (command.safety !== undefined) values.safety = JSON.stringify(command.safety)
      if (command.transport !== undefined)
        values.transport = JSON.stringify(command.transport)
      if (command.catering !== undefined)
        values.catering = JSON.stringify(command.catering)
      if (command.keyContacts !== undefined) {
        values.key_contacts = JSON.stringify(command.keyContacts)
      }
      if (command.nextDayPreview !== undefined) {
        values.next_day_preview = JSON.stringify(command.nextDayPreview)
      }
      if (before.status === "已发布" && command.status === undefined) {
        values.status = "待确认"
      }
      const updated = await transaction
        .updateTable("call_sheets")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .returning("id")
        .executeTakeFirst()
      if (!updated) {
        return this.productionMissingOrConflict(
          transaction,
          "call_sheets",
          command.projectId,
          command.itemId,
        )
      }
      const item = await this.findCallSheet(transaction, command.projectId, updated.id)
      if (!item) return { kind: "not_found" } as const
      let changeId: string | null = null
      let basePublicationVersion: number | null = null
      if (before.status === "已发布") {
        const basePublication = await transaction
          .selectFrom("call_sheet_publications")
          .select(["id", "version"])
          .where("call_sheet_id", "=", item.id)
          .orderBy("version", "desc")
          .executeTakeFirst()
        changeId = randomUUID()
        basePublicationVersion = basePublication?.version ?? null
        const summary = command.changeSummary?.trim() || "已发布通告内容更新"
        await transaction
          .insertInto("call_sheet_changes")
          .values({
            id: changeId,
            call_sheet_id: item.id,
            project_id: command.projectId,
            base_publication_id: basePublication?.id ?? null,
            base_publication_version: basePublicationVersion,
            summary,
            before_snapshot: JSON.stringify(before),
            after_snapshot: JSON.stringify(item),
            changed_by_account_id: command.actorId,
          })
          .execute()
        await this.writeCallSheetNotifications(transaction, {
          actorId: command.actorId,
          projectId: command.projectId,
          kind: "call_sheet_changed",
          subjectId: item.id,
          dedupKey: `call-sheet-change:${changeId}`,
          title: `通告有重要变更：${item.title}`,
          body: summary,
          metadata: { changeId, basePublicationVersion },
        })
      }
      await this.writeAudit(transaction, command, "call-sheet.updated", item.id, {
        status: item.status,
        revision: item.revision,
        changeId,
        basePublicationVersion,
      })
      return { kind: "ok", item } as const
    })
  }

  async publishCallSheet(command: PublishCallSheetCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `call-sheet.publish:${command.itemId}`
      const replay = await this.getReceipt<CallSheetPublishReceipt>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) {
        return {
          ...replay,
          publication: {
            ...replay.publication,
            recipients: replay.publication.recipients ?? [],
          },
          replayed: true,
        }
      }
      const current = await transaction
        .selectFrom("call_sheets")
        .selectAll()
        .where("id", "=", command.itemId)
        .where("project_id", "=", command.projectId)
        .forUpdate()
        .executeTakeFirst()
      if (!current) return { kind: "not_found" } as const
      if (current.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      if (current.status === "已发布") {
        return { kind: "already_published" } as const
      }
      await transaction
        .updateTable("call_sheets")
        .set({ status: "已发布", updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.itemId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .executeTakeFirstOrThrow()
      const item = await this.findCallSheet(
        transaction,
        command.projectId,
        command.itemId,
      )
      if (!item) return { kind: "not_found" } as const
      const latest = await transaction
        .selectFrom("call_sheet_publications")
        .select("version")
        .where("call_sheet_id", "=", item.id)
        .orderBy("version", "desc")
        .executeTakeFirst()
      const actor = await transaction
        .selectFrom("accounts")
        .select("display_name")
        .where("id", "=", command.actorId)
        .executeTakeFirstOrThrow()
      const publicationRow = await transaction
        .insertInto("call_sheet_publications")
        .values({
          id: randomUUID(),
          call_sheet_id: item.id,
          project_id: command.projectId,
          version: (latest?.version ?? 0) + 1,
          snapshot: JSON.stringify(item),
          published_by_account_id: command.actorId,
        })
        .returning(["id", "version", "published_at"])
        .executeTakeFirstOrThrow()
      const publicationBase = {
        id: publicationRow.id,
        callSheetId: item.id,
        version: publicationRow.version,
        snapshot: item,
        publishedBy: actor.display_name,
        publishedAt: toIso(publicationRow.published_at),
      }
      const deliveredRecipients = await this.writeCallSheetNotifications(transaction, {
        actorId: command.actorId,
        projectId: command.projectId,
        kind: "call_sheet_published",
        subjectId: item.id,
        dedupKey: `call-sheet-publication:${publicationRow.id}`,
        title: `通告已发布：${item.title}`,
        body: `${item.date} · ${item.crewCall} 集合 · v${publicationRow.version}`,
        metadata: {
          publicationId: publicationRow.id,
          publicationVersion: publicationRow.version,
        },
      })
      if (deliveredRecipients.length) {
        await transaction
          .insertInto("call_sheet_publication_recipients")
          .values(
            deliveredRecipients.map((recipient) => ({
              id: recipient.id,
              publication_id: publicationRow.id,
              call_sheet_id: item.id,
              project_id: command.projectId,
              recipient_account_id: recipient.accountId,
              notification_id: recipient.notificationId,
              recipient_snapshot: JSON.stringify({
                displayName: recipient.displayName,
                email: recipient.email,
                projectRole: recipient.projectRole,
              }),
              delivered_at: recipient.deliveredAt,
            })),
          )
          .execute()
      }
      const publication: CallSheetPublication = {
        ...publicationBase,
        recipients: deliveredRecipients.map((recipient) => ({
          id: recipient.id,
          notificationId: recipient.notificationId,
          displayName: recipient.displayName,
          email: recipient.email,
          projectRole: recipient.projectRole,
          deliveredAt: recipient.deliveredAt.toISOString(),
          acknowledgedAt: null,
          canAcknowledge: false,
        })),
      }
      const receipt = { item, publication }
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        receipt,
      )
      await this.writeAudit(transaction, command, "call-sheet.published", item.id, {
        publicationId: publication.id,
        version: publication.version,
        revision: item.revision,
      })
      return { ...receipt, replayed: false }
    })
  }

  async listReviewFiles(projectId: string, archived = false) {
    const [rows, counts] = await Promise.all([
      this.database
        .selectFrom("review_files as file")
        .leftJoin(
          "accounts as member_approver",
          "member_approver.id",
          "file.approved_by_account_id",
        )
        .leftJoin(
          "review_sessions as guest_approver",
          "guest_approver.id",
          "file.approved_by_review_session_id",
        )
        .leftJoin("team_assets as asset", "asset.id", "file.asset_id")
        .selectAll("file")
        .select([
          "member_approver.display_name as member_approver_name",
          "guest_approver.display_name as guest_approver_name",
          "asset.status as asset_status",
          "asset.object_key as asset_object_key",
        ])
        .where("file.project_id", "=", projectId)
        .where("file.archived_at", archived ? "is not" : "is", null)
        .orderBy("file.updated_at", "desc")
        .execute(),
      this.database
        .selectFrom("review_comments")
        .select(["file_id"])
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("project_id", "=", projectId)
        .groupBy("file_id")
        .execute(),
    ])
    const countMap = new Map(counts.map((row) => [row.file_id, Number(row.count)]))
    return rows.map((row) =>
      this.mapReviewFile(
        row,
        countMap.get(row.id) ?? 0,
        row.asset_status === "ready" && Boolean(row.asset_object_key),
      ),
    )
  }

  async listReviewFolders(projectId: string, archived = false) {
    const rows = await this.database
      .selectFrom("review_folders")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("archived_at", archived ? "is not" : "is", null)
      .orderBy("name", "asc")
      .execute()
    return rows.map((row) => this.mapReviewFolder(row))
  }

  async createReviewFolder(command: CreateReviewFolderCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `review-folder.create:${command.projectId}`
      const replay = await this.getReceipt<ReviewFolder>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const existing = await transaction
        .selectFrom("review_folders")
        .select("id")
        .where("project_id", "=", command.projectId)
        .where("name", "ilike", command.name)
        .where("archived_at", "is", null)
        .executeTakeFirst()
      if (existing) return { kind: "already_exists" } as const

      const row = await transaction
        .insertInto("review_folders")
        .values({
          id: randomUUID(),
          project_id: command.projectId,
          name: command.name,
          created_by_account_id: command.actorId,
        })
        .onConflict((conflict) => conflict.doNothing())
        .returningAll()
        .executeTakeFirst()
      if (!row) return { kind: "already_exists" } as const

      const item = this.mapReviewFolder(row)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(transaction, command, "review-folder.created", item.id, {
        name: item.name,
        revision: item.revision,
      })
      return { item, replayed: false }
    })
  }

  async updateReviewFolder(command: UpdateReviewFolderCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const current = await transaction
        .selectFrom("review_folders")
        .selectAll()
        .where("id", "=", command.folderId)
        .where("project_id", "=", command.projectId)
        .forUpdate()
        .executeTakeFirst()
      const restoring = command.archived === false
      if (!current || (current.archived_at !== null) !== restoring) {
        return { kind: "not_found" } as const
      }
      if (current.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }

      if (command.archived) {
        const file = await transaction
          .selectFrom("review_files")
          .select("id")
          .where("project_id", "=", command.projectId)
          .where("folder_id", "=", command.folderId)
          .executeTakeFirst()
        if (file) {
          throw new AppError("REVIEW_FOLDER_NOT_EMPTY", "仅空文件夹可以移入回收站", 409)
        }
      } else {
        const activeMatch = await transaction
          .selectFrom("review_folders")
          .select("id")
          .where("project_id", "=", command.projectId)
          .where("name", "ilike", current.name)
          .where("archived_at", "is", null)
          .where("id", "!=", current.id)
          .executeTakeFirst()
        if (activeMatch) {
          throw new AppError("REVIEW_FOLDER_EXISTS", "当前项目已存在同名文件夹", 409)
        }
      }

      const row = await transaction
        .updateTable("review_folders")
        .set({
          archived_at: command.archived ? sql<Date>`now()` : null,
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.folderId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", restoring ? "is not" : "is", null)
        .returningAll()
        .executeTakeFirst()
      if (!row) return { kind: "conflict" } as const

      const item = this.mapReviewFolder(row)
      await this.writeAudit(
        transaction,
        command,
        command.archived ? "review-folder.archived" : "review-folder.restored",
        item.id,
        { name: item.name, revision: item.revision },
      )
      return { kind: "ok", item } as const
    })
  }

  async moveReviewFile(command: MoveReviewFileCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `review-file.move:${command.projectId}:${command.fileId}`
      const replay = await this.getReceipt<ReviewFile>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      if (command.folderId) {
        const folder = await transaction
          .selectFrom("review_folders")
          .select("id")
          .where("id", "=", command.folderId)
          .where("project_id", "=", command.projectId)
          .where("archived_at", "is", null)
          .executeTakeFirst()
        if (!folder) return { kind: "invalid_folder" } as const
      }

      const current = await transaction
        .selectFrom("review_files as file")
        .leftJoin(
          "accounts as member_approver",
          "member_approver.id",
          "file.approved_by_account_id",
        )
        .leftJoin(
          "review_sessions as guest_approver",
          "guest_approver.id",
          "file.approved_by_review_session_id",
        )
        .leftJoin("team_assets as asset", "asset.id", "file.asset_id")
        .selectAll("file")
        .select([
          "member_approver.display_name as member_approver_name",
          "guest_approver.display_name as guest_approver_name",
          "asset.status as asset_status",
          "asset.object_key as asset_object_key",
        ])
        .where("file.id", "=", command.fileId)
        .where("file.project_id", "=", command.projectId)
        .where("file.archived_at", "is", null)
        .executeTakeFirst()
      if (!current) return { kind: "not_found" } as const
      if (current.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }

      const count = await transaction
        .selectFrom("review_comments")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("file_id", "=", command.fileId)
        .executeTakeFirst()
      const mediaReady =
        current.asset_status === "ready" && Boolean(current.asset_object_key)

      if (current.folder_id === command.folderId) {
        const item = this.mapReviewFile(current, Number(count?.count ?? 0), mediaReady)
        await this.writeReceipt(
          transaction,
          command.actorId,
          domain,
          command.idempotencyKey,
          hash,
          item,
        )
        return { item, replayed: false }
      }

      const updated = await transaction
        .updateTable("review_files")
        .set({ folder_id: command.folderId, updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.fileId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .returningAll()
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" } as const

      const item = this.mapReviewFile(
        {
          ...updated,
          member_approver_name: current.member_approver_name,
          guest_approver_name: current.guest_approver_name,
        },
        Number(count?.count ?? 0),
        mediaReady,
      )
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(transaction, command, "review-file.moved", item.id, {
        fromFolderId: current.folder_id,
        toFolderId: item.folderId,
        revision: item.revision,
      })
      return { item, replayed: false }
    })
  }

  async updateReviewFileArchive(command: UpdateReviewFileArchiveCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const action = command.archived ? "archive" : "restore"
      const domain = `review-file.${action}:${command.projectId}:${command.fileId}`
      const replay = await this.getReceipt<ReviewFile>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const restoring = command.archived === false
      const current = await transaction
        .selectFrom("review_files as file")
        .leftJoin(
          "accounts as member_approver",
          "member_approver.id",
          "file.approved_by_account_id",
        )
        .leftJoin(
          "review_sessions as guest_approver",
          "guest_approver.id",
          "file.approved_by_review_session_id",
        )
        .leftJoin("team_assets as asset", "asset.id", "file.asset_id")
        .selectAll("file")
        .select([
          "member_approver.display_name as member_approver_name",
          "guest_approver.display_name as guest_approver_name",
          "asset.status as asset_status",
          "asset.object_key as asset_object_key",
        ])
        .where("file.id", "=", command.fileId)
        .where("file.project_id", "=", command.projectId)
        .where("file.archived_at", restoring ? "is not" : "is", null)
        .executeTakeFirst()
      if (!current) return { kind: "not_found" } as const
      if (current.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }

      const updated = await transaction
        .updateTable("review_files")
        .set({
          archived_at: command.archived ? sql<Date>`now()` : null,
          updated_at: sql<Date>`now()`,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.fileId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", restoring ? "is not" : "is", null)
        .returningAll()
        .executeTakeFirst()
      if (!updated) return { kind: "conflict" } as const

      const count = await transaction
        .selectFrom("review_comments")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("file_id", "=", command.fileId)
        .executeTakeFirst()
      const item = this.mapReviewFile(
        {
          ...updated,
          member_approver_name: current.member_approver_name,
          guest_approver_name: current.guest_approver_name,
        },
        Number(count?.count ?? 0),
        current.asset_status === "ready" && Boolean(current.asset_object_key),
      )
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        command,
        command.archived ? "review-file.archived" : "review-file.restored",
        item.id,
        { name: item.name, version: item.version, revision: item.revision },
      )
      return { item, replayed: false }
    })
  }

  async permanentlyDeleteReviewFile(command: PermanentlyDeleteReviewFileCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const current = await transaction
        .selectFrom("review_files")
        .select(["id", "asset_id", "name", "version", "revision"])
        .where("id", "=", command.fileId)
        .where("project_id", "=", command.projectId)
        .where("archived_at", "is not", null)
        .forUpdate()
        .executeTakeFirst()
      if (!current) return { kind: "not_found" } as const
      if (current.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }

      const portfolioItem = await transaction
        .selectFrom("portfolio_items")
        .select("id")
        .where("review_file_id", "=", command.fileId)
        .executeTakeFirst()
      if (portfolioItem) return { kind: "in_use" } as const

      const comments = await transaction
        .selectFrom("review_comments")
        .select("id")
        .where("file_id", "=", command.fileId)
        .execute()
      const commentIds = comments.map((comment) => comment.id)
      const commentLinks = commentIds.length
        ? await transaction
            .selectFrom("review_comment_links")
            .select("id")
            .where((expression) =>
              expression.or([
                expression("comment_a_id", "in", commentIds),
                expression("comment_b_id", "in", commentIds),
              ]),
            )
            .execute()
        : []
      const linkIds = commentLinks.map((link) => link.id)

      await transaction
        .deleteFrom("notifications")
        .where("project_id", "=", command.projectId)
        .where("kind", "in", [
          "review_comment_created",
          "review_comment_replied",
          "review_file_approved",
        ])
        .where("subject_id", "in", [command.fileId, ...commentIds])
        .execute()
      await transaction
        .deleteFrom("command_receipts")
        .where("domain", "like", "review-file.%")
        .where(sql<string>`response ->> 'id'`, "=", command.fileId)
        .execute()
      if (linkIds.length) {
        await transaction
          .deleteFrom("command_receipts")
          .where("domain", "like", "review-comment-link.%")
          .where(sql<string>`response ->> 'id'`, "in", linkIds)
          .execute()
      }

      const deleted = await transaction
        .deleteFrom("review_files")
        .where("id", "=", command.fileId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .where("archived_at", "is not", null)
        .returning("id")
        .executeTakeFirst()
      if (!deleted) return { kind: "conflict" } as const

      await this.writeAudit(
        transaction,
        command,
        "review-file.permanently-deleted",
        deleted.id,
        {
          assetId: current.asset_id,
          name: current.name,
          version: current.version,
          revision: current.revision,
        },
      )
      return { kind: "ok", item: { id: deleted.id } } as const
    })
  }

  async createReviewFile(command: CreateReviewFileCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `review-file.create:${command.projectId}`
      const replay = await this.getReceipt<ReviewFile>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const project = await transaction
        .selectFrom("projects")
        .select(["id", "team_id"])
        .where("id", "=", command.projectId)
        .executeTakeFirst()
      if (!project) return { kind: "not_found" } as const

      const source = await transaction
        .selectFrom("team_assets")
        .select(["id", "kind", "status", "object_key"])
        .where("id", "=", command.assetId)
        .where("team_id", "=", project.team_id)
        .where("archived_at", "is", null)
        .where((expression) =>
          expression.or([
            // 项目归属素材
            expression("project_id", "=", command.projectId),
            // 团队资源库素材（未归属项目）：项目成员显式加入审片时可用
            expression("project_id", "is", null),
          ]),
        )
        .executeTakeFirst()
      if (!source) return { kind: "not_found" } as const
      if (source.kind !== "视频" || source.status !== "ready" || !source.object_key) {
        return { kind: "invalid_source" } as const
      }

      if (command.folderId) {
        const folder = await transaction
          .selectFrom("review_folders")
          .select("id")
          .where("id", "=", command.folderId)
          .where("project_id", "=", command.projectId)
          .where("archived_at", "is", null)
          .executeTakeFirst()
        if (!folder) return { kind: "invalid_folder" } as const
      }

      const existing = await transaction
        .selectFrom("review_files")
        .select("id")
        .where("asset_id", "=", command.assetId)
        .where("type", "=", "video")
        .executeTakeFirst()
      if (existing) return { kind: "already_exists" } as const

      const inserted = await transaction
        .insertInto("review_files")
        .values({
          id: randomUUID(),
          project_id: command.projectId,
          asset_id: command.assetId,
          folder_id: command.folderId ?? null,
          name: command.name.trim(),
          version: command.version.trim(),
          type: "video",
          status: "待审阅",
          duration: command.duration?.trim() || null,
        })
        .onConflict((conflict) => conflict.doNothing())
        .returningAll()
        .executeTakeFirst()
      if (!inserted) return { kind: "already_exists" } as const

      const item = this.mapReviewFile(inserted, 0, true)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(transaction, command, "review-file.created", item.id, {
        assetId: command.assetId,
        version: item.version,
        revision: item.revision,
      })
      return { item, replayed: false }
    })
  }

  async updateReviewFileApproval(command: ReviewFileApprovalCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `review-file.${command.action}:${command.projectId}:${command.fileId}`
      const replay = await this.getReceipt<ReviewFile>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const current = await transaction
        .selectFrom("review_files")
        .selectAll()
        .where("id", "=", command.fileId)
        .where("project_id", "=", command.projectId)
        .where("archived_at", "is", null)
        .executeTakeFirst()
      if (!current) return { kind: "not_found" } as const
      if (current.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }

      const targetStatus = command.action === "approve" ? "已通过" : "审阅中"
      const approvedAt = command.action === "approve" ? new Date() : null
      const validTransition =
        current.type === "video" &&
        current.status !== "处理中" &&
        (command.action === "approve"
          ? current.status !== "已通过"
          : current.status === "已通过")
      if (!validTransition) return { kind: "invalid_transition" } as const

      const updated = await transaction
        .updateTable("review_files")
        .set({
          status: targetStatus,
          approved_by_account_id: command.action === "approve" ? command.actorId : null,
          approved_by_review_session_id: null,
          approved_at: approvedAt,
          updated_at: new Date(),
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.fileId)
        .where("project_id", "=", command.projectId)
        .where("revision", "=", command.expectedRevision)
        .returningAll()
        .executeTakeFirst()
      if (!updated) {
        return this.productionMissingOrConflict(
          transaction,
          "review_files",
          command.projectId,
          command.fileId,
        )
      }

      const commentCount = await transaction
        .selectFrom("review_comments")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("file_id", "=", command.fileId)
        .executeTakeFirst()
      const approver =
        command.action === "approve"
          ? await transaction
              .selectFrom("accounts")
              .select("display_name")
              .where("id", "=", command.actorId)
              .executeTakeFirst()
          : null
      const item = this.mapReviewFile(
        {
          ...updated,
          member_approver_name: approver?.display_name ?? null,
          guest_approver_name: null,
        },
        Number(commentCount?.count ?? 0),
        Boolean(updated.asset_id),
      )
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        command,
        command.action === "approve"
          ? "review-file.approved"
          : "review-file.approval-revoked",
        item.id,
        {
          previousStatus: current.status,
          status: item.status,
          revision: item.revision,
        },
      )
      if (command.action === "approve") {
        await writeReviewActivityNotifications(transaction, {
          projectId: command.projectId,
          sourceActorAccountId: command.actorId,
          sourceActorName: approver?.display_name ?? "项目成员",
          kind: "review_file_approved",
          subjectId: item.id,
          dedupKey: `review-file-approved:${item.id}:${item.revision}`,
          title: "审片版本已批准",
          body: `${item.name} · ${item.version}`,
          metadata: { fileId: item.id, version: item.version, revision: item.revision },
        })
      }
      return { item, replayed: false }
    })
  }

  async listReviewComments(projectId: string, fileId: string) {
    const file = await this.database
      .selectFrom("review_files")
      .select("id")
      .where("id", "=", fileId)
      .where("project_id", "=", projectId)
      .where("archived_at", "is", null)
      .executeTakeFirst()
    if (!file) return null
    const rows = await this.reviewCommentQuery(this.database)
      .where("comment.file_id", "=", fileId)
      .where("comment.project_id", "=", projectId)
      .orderBy("comment.created_at", "asc")
      .execute()
    return rows.map((row) => this.mapReviewComment(row))
  }

  async createReviewComment(command: CreateReviewCommentCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const file = await transaction
        .selectFrom("review_files")
        .select(["id", "name", "version"])
        .where("id", "=", command.fileId)
        .where("project_id", "=", command.projectId)
        .where("type", "=", "video")
        .where("archived_at", "is", null)
        .executeTakeFirst()
      if (!file) return null
      const parentCommentId = command.parentCommentId?.trim() || null
      const hash = requestHash({ ...command, parentCommentId, version: file.version })
      if (parentCommentId) {
        const parent = await transaction
          .selectFrom("review_comments")
          .select(["id", "parent_comment_id"])
          .where("id", "=", parentCommentId)
          .where("project_id", "=", command.projectId)
          .where("file_id", "=", command.fileId)
          .where("version", "=", file.version)
          .executeTakeFirst()
        if (!parent) {
          throw new AppError(
            "REVIEW_COMMENT_PARENT_NOT_FOUND",
            "要回复的审片意见不存在",
            404,
          )
        }
        if (parent.parent_comment_id) {
          throw new AppError(
            "REVIEW_COMMENT_REPLY_DEPTH_EXCEEDED",
            "审片意见只支持一级回复",
            400,
          )
        }
      }
      const replay = await this.reviewCommentQuery(transaction)
        .where("comment.file_id", "=", command.fileId)
        .where("comment.author_account_id", "=", command.actorId)
        .where("comment.idempotency_key", "=", command.idempotencyKey)
        .executeTakeFirst()
      if (replay) {
        if (replay.request_hash && replay.request_hash !== hash) {
          throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同审片意见", 409)
        }
        return { item: this.mapReviewComment(replay), replayed: true }
      }
      const id = randomUUID()
      await transaction
        .insertInto("review_comments")
        .values({
          id,
          project_id: command.projectId,
          file_id: command.fileId,
          parent_comment_id: parentCommentId,
          version: file.version,
          author_account_id: command.actorId,
          timecode: command.timecode,
          text: command.text.trim(),
          state: "open",
          idempotency_key: command.idempotencyKey,
          request_hash: hash,
        })
        .execute()
      const item = await this.findReviewComment(transaction, command.projectId, id)
      if (!item) throw new Error("Created review comment could not be read")
      await this.writeAudit(
        transaction,
        command,
        parentCommentId ? "review-comment.replied" : "review-comment.created",
        id,
        {
          fileId: command.fileId,
          timecode: command.timecode,
          parentCommentId,
        },
      )
      await writeReviewActivityNotifications(transaction, {
        projectId: command.projectId,
        sourceActorAccountId: command.actorId,
        sourceActorName: item.author,
        kind: parentCommentId ? "review_comment_replied" : "review_comment_created",
        subjectId: id,
        dedupKey: `review-comment-${parentCommentId ? "replied" : "created"}:${id}`,
        title: parentCommentId ? "新增审片回复" : "新增审片意见",
        body: `${file.name} · ${file.version} · ${command.timecode}`,
        metadata: {
          commentId: id,
          fileId: command.fileId,
          version: file.version,
          timecode: command.timecode,
          parentCommentId,
        },
      })
      return { item, replayed: false }
    })
  }

  async updateReviewComment(command: UpdateReviewCommentCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const target = await transaction
        .selectFrom("review_comments")
        .select(["id", "parent_comment_id"])
        .where("id", "=", command.commentId)
        .where("project_id", "=", command.projectId)
        .executeTakeFirst()
      if (!target) return { kind: "not_found" } as const
      if (target.parent_comment_id) {
        throw new AppError(
          "REVIEW_COMMENT_THREAD_ROOT_REQUIRED",
          "请在主审片意见上更新状态",
          400,
        )
      }
      const updated = await transaction
        .updateTable("review_comments")
        .set({ state: command.state, updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.commentId)
        .where("project_id", "=", command.projectId)
        .where("parent_comment_id", "is", null)
        .where("revision", "=", command.expectedRevision)
        .returning("id")
        .executeTakeFirst()
      if (!updated) {
        return this.productionMissingOrConflict(
          transaction,
          "review_comments",
          command.projectId,
          command.commentId,
        )
      }
      const item = await this.findReviewComment(
        transaction,
        command.projectId,
        command.commentId,
      )
      if (!item) return { kind: "not_found" } as const
      await this.writeAudit(transaction, command, "review-comment.updated", item.id, {
        state: item.state,
        revision: item.revision,
      })
      return { kind: "ok", item } as const
    })
  }

  async listReviewCommentLinks(
    projectId: string,
    primaryFileId: string,
    compareFileId: string,
  ) {
    const rows = await this.reviewCommentLinkQuery(this.database)
      .innerJoin("review_comments as comment_a", "comment_a.id", "link.comment_a_id")
      .innerJoin("review_comments as comment_b", "comment_b.id", "link.comment_b_id")
      .where("link.project_id", "=", projectId)
      .where("link.removed_at", "is", null)
      .where((expression) =>
        expression.or([
          expression.and([
            expression("comment_a.file_id", "=", primaryFileId),
            expression("comment_b.file_id", "=", compareFileId),
          ]),
          expression.and([
            expression("comment_a.file_id", "=", compareFileId),
            expression("comment_b.file_id", "=", primaryFileId),
          ]),
        ]),
      )
      .orderBy("link.created_at", "asc")
      .execute()
    return rows.map((row) => this.mapReviewCommentLink(row))
  }

  async createReviewCommentLink(command: CreateReviewCommentLinkCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const [commentAId, commentBId] = [
        command.commentId,
        command.counterpartCommentId,
      ].sort()
      const hash = requestHash(command)
      const domain = `review-comment-link.create:${command.projectId}`
      const replay = await this.getReceipt<ReviewCommentLink>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const comments = await transaction
        .selectFrom("review_comments as comment")
        .innerJoin("review_files as file", "file.id", "comment.file_id")
        .select([
          "comment.id",
          "comment.file_id",
          "comment.parent_comment_id",
          "file.version",
        ])
        .where("comment.project_id", "=", command.projectId)
        .where("comment.id", "in", [commentAId, commentBId])
        .where("file.archived_at", "is", null)
        .execute()
      if (comments.length !== 2) return { kind: "not_found" } as const
      if (
        comments.some((comment) => comment.parent_comment_id !== null) ||
        comments[0].file_id === comments[1].file_id ||
        comments[0].version === comments[1].version
      ) {
        return { kind: "invalid_pair" } as const
      }

      const existing = await transaction
        .selectFrom("review_comment_links")
        .selectAll()
        .where("project_id", "=", command.projectId)
        .where("comment_a_id", "=", commentAId)
        .where("comment_b_id", "=", commentBId)
        .forUpdate()
        .executeTakeFirst()
      if (existing && !existing.removed_at) {
        const item = this.mapReviewCommentLink(existing)
        await this.writeReceipt(
          transaction,
          command.actorId,
          domain,
          command.idempotencyKey,
          hash,
          item,
        )
        return { item, replayed: true }
      }

      const now = new Date()
      const row = existing
        ? await transaction
            .updateTable("review_comment_links")
            .set({
              created_by_account_id: command.actorId,
              removed_by_account_id: null,
              created_at: now,
              updated_at: now,
              removed_at: null,
            })
            .set((expression) => ({ revision: expression("revision", "+", 1) }))
            .where("id", "=", existing.id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : await transaction
            .insertInto("review_comment_links")
            .values({
              id: randomUUID(),
              project_id: command.projectId,
              comment_a_id: commentAId,
              comment_b_id: commentBId,
              created_by_account_id: command.actorId,
            })
            .returningAll()
            .executeTakeFirstOrThrow()
      const item = this.mapReviewCommentLink(row)
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(
        transaction,
        command,
        "review-comment-link.created",
        item.id,
        {
          commentId: item.commentId,
          counterpartCommentId: item.counterpartCommentId,
          revision: item.revision,
        },
      )
      return { item, replayed: false }
    })
  }

  async unlinkReviewCommentLink(command: UnlinkReviewCommentLinkCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const now = new Date()
      const row = await transaction
        .updateTable("review_comment_links")
        .set({
          removed_by_account_id: command.actorId,
          removed_at: now,
          updated_at: now,
        })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.linkId)
        .where("project_id", "=", command.projectId)
        .where("removed_at", "is", null)
        .where("revision", "=", command.expectedRevision)
        .returningAll()
        .executeTakeFirst()
      if (!row) {
        return this.productionMissingOrConflict(
          transaction,
          "review_comment_links",
          command.projectId,
          command.linkId,
        )
      }
      const item = this.mapReviewCommentLink(row)
      await this.writeAudit(
        transaction,
        command,
        "review-comment-link.removed",
        item.id,
        {
          commentId: item.commentId,
          counterpartCommentId: item.counterpartCommentId,
          revision: item.revision,
        },
      )
      return { kind: "ok", item } as const
    })
  }

  private mapBreakdown(
    row: Selectable<Database["breakdown_items"]>,
    supplierIds: string[] = [],
    responsibleName: string | null = null,
    taskIds: string[] = [],
    contactRefs: ContactRef[] = [],
    callSheetIds: string[] = [],
    shootingDayIds: string[] = [],
  ): BreakdownItem {
    return {
      id: row.id,
      projectId: row.project_id,
      category: row.category,
      item: row.item,
      requirementType: row.requirement_type,
      specification: row.specification,
      quantity: row.quantity,
      preparation: row.preparation,
      department: row.department,
      agentAssessment: row.agent_assessment,
      sourceDocument: row.source_document,
      sourceVersion: row.source_version,
      sourceLocation: row.source_location,
      source: row.source,
      excerpt: row.excerpt,
      confidence: row.confidence,
      state: row.state,
      parentItemId: row.parent_item_id,
      mergedIntoItemId: row.merged_into_item_id,
      supplierIds,
      responsibleAccountId: row.responsible_account_id,
      responsibleName,
      taskIds,
      contactRefs,
      shootingDayIds,
      callSheetIds,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private async listBreakdownSuppliers(database: DatabaseExecutor, itemIds: string[]) {
    const result = new Map<string, string[]>()
    if (!itemIds.length) return result
    const rows = await database
      .selectFrom("breakdown_item_suppliers")
      .select(["breakdown_item_id", "supplier_id"])
      .where("breakdown_item_id", "in", itemIds)
      .execute()
    for (const row of rows) {
      result.set(row.breakdown_item_id, [
        ...(result.get(row.breakdown_item_id) ?? []),
        row.supplier_id,
      ])
    }
    return result
  }

  private async replaceBreakdownSuppliers(
    database: DatabaseExecutor,
    itemId: string,
    supplierIds: string[],
  ) {
    await database
      .deleteFrom("breakdown_item_suppliers")
      .where("breakdown_item_id", "=", itemId)
      .execute()
    const unique = [...new Set(supplierIds)]
    if (unique.length) {
      await database
        .insertInto("breakdown_item_suppliers")
        .values(
          unique.map((supplierId) => ({
            breakdown_item_id: itemId,
            supplier_id: supplierId,
          })),
        )
        .execute()
    }
  }

  private async listBreakdownTasks(database: DatabaseExecutor, itemIds: string[]) {
    const result = new Map<string, string[]>()
    if (!itemIds.length) return result
    const rows = await database
      .selectFrom("breakdown_item_tasks")
      .select(["breakdown_item_id", "task_id"])
      .where("breakdown_item_id", "in", itemIds)
      .orderBy("created_at", "asc")
      .execute()
    for (const row of rows) {
      result.set(row.breakdown_item_id, [
        ...(result.get(row.breakdown_item_id) ?? []),
        row.task_id,
      ])
    }
    return result
  }

  private async replaceBreakdownTasks(
    database: DatabaseExecutor,
    itemId: string,
    taskIds: string[],
  ) {
    await database
      .deleteFrom("breakdown_item_tasks")
      .where("breakdown_item_id", "=", itemId)
      .execute()
    const unique = [...new Set(taskIds)]
    if (unique.length) {
      await database
        .insertInto("breakdown_item_tasks")
        .values(
          unique.map((taskId) => ({
            breakdown_item_id: itemId,
            task_id: taskId,
          })),
        )
        .execute()
    }
  }

  private async listBreakdownContacts(database: DatabaseExecutor, itemIds: string[]) {
    const result = new Map<string, ContactRef[]>()
    if (!itemIds.length) return result
    const rows = await database
      .selectFrom("breakdown_item_contacts")
      .select(["breakdown_item_id", "contact_source", "contact_id"])
      .where("breakdown_item_id", "in", itemIds)
      .orderBy("created_at", "asc")
      .execute()
    for (const row of rows) {
      result.set(row.breakdown_item_id, [
        ...(result.get(row.breakdown_item_id) ?? []),
        { source: row.contact_source, contactId: row.contact_id },
      ])
    }
    return result
  }

  private async replaceBreakdownContacts(
    database: DatabaseExecutor,
    itemId: string,
    contacts: ContactRef[],
  ) {
    await database
      .deleteFrom("breakdown_item_contacts")
      .where("breakdown_item_id", "=", itemId)
      .execute()
    const unique = [
      ...new Map(
        contacts.map((contact) => [`${contact.source}:${contact.contactId}`, contact]),
      ).values(),
    ]
    if (unique.length) {
      await database
        .insertInto("breakdown_item_contacts")
        .values(
          unique.map((contact) => ({
            breakdown_item_id: itemId,
            contact_source: contact.source,
            contact_id: contact.contactId,
          })),
        )
        .execute()
    }
  }

  private async listBreakdownCallSheets(database: DatabaseExecutor, itemIds: string[]) {
    const result = new Map<string, string[]>()
    if (!itemIds.length) return result
    const rows = await database
      .selectFrom("breakdown_item_call_sheets")
      .select(["breakdown_item_id", "call_sheet_id"])
      .where("breakdown_item_id", "in", itemIds)
      .orderBy("created_at", "asc")
      .execute()
    for (const row of rows) {
      result.set(row.breakdown_item_id, [
        ...(result.get(row.breakdown_item_id) ?? []),
        row.call_sheet_id,
      ])
    }
    return result
  }

  private async listBreakdownShootingDays(database: DatabaseExecutor, itemIds: string[]) {
    const result = new Map<string, string[]>()
    if (!itemIds.length) return result
    const rows = await database
      .selectFrom("breakdown_item_shooting_days")
      .select(["breakdown_item_id", "shooting_day_id"])
      .where("breakdown_item_id", "in", itemIds)
      .orderBy("created_at", "asc")
      .execute()
    for (const row of rows) {
      result.set(row.breakdown_item_id, [
        ...(result.get(row.breakdown_item_id) ?? []),
        row.shooting_day_id,
      ])
    }
    return result
  }

  private async replaceBreakdownShootingDays(
    database: DatabaseExecutor,
    itemId: string,
    shootingDayIds: string[],
  ) {
    await database
      .deleteFrom("breakdown_item_shooting_days")
      .where("breakdown_item_id", "=", itemId)
      .execute()
    const unique = [...new Set(shootingDayIds)]
    if (unique.length) {
      await database
        .insertInto("breakdown_item_shooting_days")
        .values(
          unique.map((shootingDayId) => ({
            breakdown_item_id: itemId,
            shooting_day_id: shootingDayId,
          })),
        )
        .execute()
    }
  }

  private async replaceBreakdownCallSheets(
    database: DatabaseExecutor,
    itemId: string,
    callSheetIds: string[],
  ) {
    await database
      .deleteFrom("breakdown_item_call_sheets")
      .where("breakdown_item_id", "=", itemId)
      .execute()
    const unique = [...new Set(callSheetIds)]
    if (unique.length) {
      await database
        .insertInto("breakdown_item_call_sheets")
        .values(
          unique.map((callSheetId) => ({
            breakdown_item_id: itemId,
            call_sheet_id: callSheetId,
          })),
        )
        .execute()
    }
  }

  private async listBreakdownContactOptions(
    database: DatabaseExecutor,
    projectId: string,
  ): Promise<BreakdownRelationOptions["contacts"]> {
    const [teamContacts, sharedContacts] = await Promise.all([
      database
        .selectFrom("team_contact_projects as link")
        .innerJoin("team_contacts as contact", "contact.id", "link.contact_id")
        .innerJoin("projects as project", "project.id", "link.project_id")
        .select(["contact.id", "contact.name", "contact.role", "contact.company"])
        .where("link.project_id", "=", projectId)
        .whereRef("contact.team_id", "=", "project.team_id")
        .where("contact.deleted_at", "is", null)
        .execute(),
      database
        .selectFrom("projects as project")
        .innerJoin("contact_team_shares as share", "share.team_id", "project.team_id")
        .innerJoin("personal_contacts as contact", "contact.id", "share.contact_id")
        .select([
          "contact.id",
          "contact.name",
          "contact.role",
          "contact.company",
          "share.shared_fields",
        ])
        .where("project.id", "=", projectId)
        .where("share.allow_project_link", "=", true)
        .where("contact.deleted_at", "is", null)
        .execute(),
    ])
    return [
      ...teamContacts.map((contact) => ({
        ...contact,
        source: "team" as const,
      })),
      ...sharedContacts.map((contact) => {
        const fields = contact.shared_fields as string[]
        return {
          id: contact.id,
          source: "member-shared" as const,
          name: fields.includes("name") ? contact.name : null,
          role: fields.includes("role") ? contact.role : null,
          company: fields.includes("company") ? contact.company : null,
        }
      }),
    ].sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""))
  }

  private async findCallSheet(database: DatabaseExecutor, projectId: string, id: string) {
    const row = await database
      .selectFrom("call_sheets")
      .selectAll()
      .where("id", "=", id)
      .where("project_id", "=", projectId)
      .executeTakeFirst()
    return row ? this.mapCallSheet(row) : null
  }

  private mapCallSheet(row: Selectable<Database["call_sheets"]>): CallSheet {
    return {
      id: row.id,
      projectId: row.project_id,
      shootingDayId: row.shooting_day_id,
      date: row.date_label,
      day: row.day_label,
      title: row.title,
      status: row.status,
      crewCall: row.crew_call,
      firstShot: row.first_shot,
      wrap: row.wrap_time,
      weather: row.weather,
      sunrise: row.sunrise,
      sunset: row.sunset,
      basecamp: row.basecamp,
      location: row.location,
      hospital: row.hospital,
      scenes: row.scenes,
      cast: row.cast_members,
      departments: row.departments,
      equipment: row.equipment,
      safety: row.safety,
      transport: row.transport,
      catering: row.catering,
      keyContacts: row.key_contacts,
      nextDayPreview: row.next_day_preview,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private mapShootingDay(row: Selectable<Database["shooting_days"]>): ShootingDay {
    return {
      id: row.id,
      projectId: row.project_id,
      shootDate: toDateOnly(row.shoot_date),
      dayNumber: row.day_number,
      title: row.title,
      status: row.status,
      originalTimezone: row.original_timezone,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private isShootingDayUniqueViolation(error: unknown) {
    if (!error || typeof error !== "object") return false
    const value = error as { code?: string; constraint?: string }
    return (
      value.code === "23505" &&
      Boolean(value.constraint?.startsWith("shooting_days_project_id_"))
    )
  }

  private async findExecutionStage(
    database: DatabaseExecutor,
    projectId: string,
    id: string,
  ) {
    const [row, resources] = await Promise.all([
      database
        .selectFrom("execution_schedule_items")
        .selectAll()
        .where("id", "=", id)
        .where("project_id", "=", projectId)
        .executeTakeFirst(),
      database
        .selectFrom("execution_schedule_resources")
        .selectAll()
        .where("schedule_item_id", "=", id)
        .orderBy("resource_type", "asc")
        .orderBy("resource_name", "asc")
        .execute(),
    ])
    return row
      ? this.mapExecutionStage(
          row,
          resources.map((resource) => ({
            id: resource.resource_id,
            type: resource.resource_type,
            name: resource.resource_name,
          })),
        )
      : null
  }

  private mapExecutionStage(
    row: Selectable<Database["execution_schedule_items"]>,
    resources: ExecutionResource[],
  ): ExecutionStage {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      startsAt: toIso(row.starts_at),
      endsAt: toIso(row.ends_at),
      originalTimezone: row.original_timezone,
      progress: row.progress,
      owner: row.owner_name,
      state: row.state,
      note: row.note,
      resources,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private async replaceExecutionResources(
    database: DatabaseExecutor,
    itemId: string,
    resources: ExecutionResource[],
  ) {
    await database
      .deleteFrom("execution_schedule_resources")
      .where("schedule_item_id", "=", itemId)
      .execute()
    if (!resources.length) return
    await database
      .insertInto("execution_schedule_resources")
      .values(
        resources.map((resource) => ({
          schedule_item_id: itemId,
          resource_type: resource.type,
          resource_id: resource.id,
          resource_name: resource.name,
        })),
      )
      .execute()
  }

  private mapReviewFile(
    row: Selectable<Database["review_files"]> & {
      member_approver_name?: string | null
      guest_approver_name?: string | null
    },
    comments: number,
    mediaReady: boolean,
  ): ReviewFile {
    return {
      id: row.id,
      projectId: row.project_id,
      assetId: row.asset_id,
      folderId: row.folder_id,
      name: row.name,
      version: row.version,
      type: row.type,
      status: row.status,
      comments,
      updated: toIso(row.updated_at),
      duration: row.duration,
      approvedBy: row.member_approver_name ?? row.guest_approver_name ?? null,
      approvedAt: row.approved_at ? toIso(row.approved_at) : null,
      mediaReady,
      revision: row.revision,
    }
  }

  private mapReviewFolder(row: Selectable<Database["review_folders"]>): ReviewFolder {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      archived: row.archived_at !== null,
      revision: row.revision,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }
  }

  private reviewCommentQuery(database: DatabaseExecutor) {
    return database
      .selectFrom("review_comments as comment")
      .leftJoin("accounts as author", "author.id", "comment.author_account_id")
      .select([
        "comment.id",
        "comment.file_id",
        "comment.parent_comment_id",
        "comment.version",
        "comment.author_account_id",
        "comment.review_session_id",
        "comment.guest_display_name",
        "author.display_name as author_name",
        "comment.timecode",
        "comment.text",
        "comment.state",
        "comment.idempotency_key",
        "comment.request_hash",
        "comment.revision",
        "comment.created_at",
      ])
  }

  private reviewCommentLinkQuery(database: DatabaseExecutor) {
    return database.selectFrom("review_comment_links as link").selectAll("link")
  }

  private async findReviewComment(
    database: DatabaseExecutor,
    projectId: string,
    id: string,
  ) {
    const row = await this.reviewCommentQuery(database)
      .where("comment.id", "=", id)
      .where("comment.project_id", "=", projectId)
      .executeTakeFirst()
    return row ? this.mapReviewComment(row) : null
  }

  private mapReviewComment(row: {
    id: string
    file_id: string
    parent_comment_id: string | null
    version: string
    author_account_id: string | null
    review_session_id: string | null
    guest_display_name: string | null
    author_name: string | null
    timecode: string
    text: string
    state: "open" | "resolved"
    revision: number
    created_at: Date | string
  }): ReviewComment {
    const author = row.author_name ?? row.guest_display_name ?? "访客"
    return {
      id: row.id,
      fileId: row.file_id,
      parentCommentId: row.parent_comment_id,
      version: row.version,
      author,
      authorId: row.author_account_id ?? `guest:${row.review_session_id}`,
      initials: author.slice(0, 2).toUpperCase(),
      timecode: row.timecode,
      text: row.text,
      state: row.state,
      revision: row.revision,
      createdAt: toIso(row.created_at),
    }
  }

  private mapReviewCommentLink(
    row: Selectable<Database["review_comment_links"]>,
  ): ReviewCommentLink {
    return {
      id: row.id,
      projectId: row.project_id,
      commentId: row.comment_a_id,
      counterpartCommentId: row.comment_b_id,
      createdById: row.created_by_account_id,
      revision: row.revision,
      createdAt: toIso(row.created_at),
      removedAt: row.removed_at ? toIso(row.removed_at) : null,
    }
  }

  private async productionMissingOrConflict(
    database: DatabaseExecutor,
    table:
      | "breakdown_items"
      | "call_sheets"
      | "execution_schedule_items"
      | "shooting_days"
      | "review_files"
      | "review_comments"
      | "review_comment_links",
    projectId: string,
    itemId: string,
  ) {
    const row = await database
      .selectFrom(table)
      .select("id")
      .where("id", "=", itemId)
      .where("project_id", "=", projectId)
      .executeTakeFirst()
    return row ? ({ kind: "conflict" } as const) : ({ kind: "not_found" } as const)
  }

  private async getReceipt<T>(
    database: Transaction<Database>,
    actorId: string,
    domain: string,
    key: string,
    hash: string,
  ) {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${actorId}:${domain}:${key}`}, 0))`.execute(
      database,
    )
    const row = await database
      .selectFrom("command_receipts")
      .select(["response", "request_hash"])
      .where("actor_account_id", "=", actorId)
      .where("domain", "=", domain)
      .where("idempotency_key", "=", key)
      .executeTakeFirst()
    if (row?.request_hash && row.request_hash !== hash) {
      throw new AppError("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求", 409)
    }
    return (row?.response as T | undefined) ?? null
  }

  private async writeReceipt(
    database: DatabaseExecutor,
    actorId: string,
    domain: string,
    key: string,
    hash: string,
    response:
      | CallSheet
      | CallSheetPublishReceipt
      | ExecutionStage
      | ShootingDay
      | ReviewFile
      | ReviewFolder
      | ReviewCommentLink
      | BreakdownItem[],
  ) {
    await database
      .insertInto("command_receipts")
      .values({
        actor_account_id: actorId,
        domain,
        idempotency_key: key,
        request_hash: hash,
        response: JSON.stringify(response),
      })
      .execute()
  }

  private async writeAudit(
    database: DatabaseExecutor,
    command: { actorId: string; projectId: string },
    action: string,
    subjectId: string,
    metadata: Record<string, unknown>,
  ) {
    const project = await database
      .selectFrom("projects")
      .select("team_id")
      .where("id", "=", command.projectId)
      .executeTakeFirstOrThrow()
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: command.actorId,
        team_id: project.team_id,
        project_id: command.projectId,
        action,
        subject_id: subjectId,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }

  private async writeCallSheetNotifications(
    database: DatabaseExecutor,
    input: {
      actorId: string
      projectId: string
      kind: "call_sheet_published" | "call_sheet_changed"
      subjectId: string
      dedupKey: string
      title: string
      body: string
      metadata: Record<string, unknown>
    },
  ): Promise<DeliveredCallSheetRecipient[]> {
    const project = await database
      .selectFrom("projects")
      .select("team_id")
      .where("id", "=", input.projectId)
      .executeTakeFirstOrThrow()
    const recipients = await database
      .selectFrom("project_memberships as membership")
      .innerJoin("accounts as account", "account.id", "membership.account_id")
      .leftJoin("notification_preferences as preference", (join) =>
        join
          .onRef("preference.account_id", "=", "membership.account_id")
          .on("preference.team_id", "=", project.team_id),
      )
      .select([
        "membership.account_id",
        "membership.role",
        "account.display_name",
        "account.email",
        "preference.published_call_sheets",
        "preference.important_call_sheet_changes",
      ])
      .where("membership.project_id", "=", input.projectId)
      .where("membership.account_id", "!=", input.actorId)
      .execute()
    const enabledRecipients = recipients.filter((recipient) =>
      input.kind === "call_sheet_published"
        ? (recipient.published_call_sheets ?? true)
        : (recipient.important_call_sheet_changes ?? true),
    )
    if (!enabledRecipients.length) return []
    const deliveredAt = new Date()
    const deliveredRecipients = enabledRecipients.map((recipient) => ({
      id: randomUUID(),
      notificationId: randomUUID(),
      accountId: recipient.account_id,
      displayName: recipient.display_name,
      email: recipient.email,
      projectRole: recipient.role,
      deliveredAt,
    }))
    await database
      .insertInto("notifications")
      .values(
        deliveredRecipients.map((recipient) => ({
          id: recipient.notificationId,
          recipient_account_id: recipient.accountId,
          source_actor_account_id: input.actorId,
          team_id: project.team_id,
          project_id: input.projectId,
          kind: input.kind,
          subject_id: input.subjectId,
          dedup_key: input.dedupKey,
          title: input.title,
          body: input.body,
          metadata: JSON.stringify(input.metadata),
        })),
      )
      .onConflict((conflict) =>
        conflict.columns(["recipient_account_id", "dedup_key"]).doNothing(),
      )
      .execute()
    return deliveredRecipients
  }
}
