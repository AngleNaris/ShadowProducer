import { ContactService } from "@shadowproducer/application"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { PostgresContactRepository } from "./postgres-contact-repository"

const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl
const pool = new Pool({ connectionString: databaseUrl, max: 4 })
const database = createDatabase(databaseUrl, pool)
const service = new ContactService(new PostgresContactRepository(database))
const runId = `pg-contact-${process.pid}-${Date.now().toString(36)}`
const teamId = `${runId}-team`
const writerId = `${runId}-writer`
const otherId = `${runId}-other`
const projectId = `${runId}-project`

async function counts() {
  const [contacts, receipts, audits] = await Promise.all([
    database
      .selectFrom("team_contacts")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("team_id", "=", teamId)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("command_receipts")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("actor_account_id", "=", writerId)
      .where("domain", "=", `team-contact.import:${teamId}`)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("audit_logs")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("team_id", "=", teamId)
      .where("action", "=", "team-contact.created")
      .executeTakeFirstOrThrow(),
  ])
  return {
    contacts: Number(contacts.count),
    receipts: Number(receipts.count),
    audits: Number(audits.count),
  }
}

async function supplierCounts() {
  const [suppliers, receipts, audits] = await Promise.all([
    database
      .selectFrom("suppliers")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("team_id", "=", teamId)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("command_receipts")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("actor_account_id", "=", writerId)
      .where("domain", "=", `team-supplier.import:${teamId}`)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("audit_logs")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("team_id", "=", teamId)
      .where("action", "=", "team-supplier.created")
      .executeTakeFirstOrThrow(),
  ])
  return {
    suppliers: Number(suppliers.count),
    receipts: Number(receipts.count),
    audits: Number(audits.count),
  }
}

beforeAll(async () => {
  await database
    .insertInto("accounts")
    .values([
      { id: writerId, display_name: "Contact Import Writer", email: null },
      { id: otherId, display_name: "Other Contact Owner", email: null },
    ])
    .execute()
  await database.insertInto("teams").values({ id: teamId, name: runId }).execute()
  await database
    .insertInto("team_memberships")
    .values([
      { team_id: teamId, account_id: writerId, role: "owner" },
      { team_id: teamId, account_id: otherId, role: "viewer" },
    ])
    .execute()
  await database
    .insertInto("projects")
    .values({ id: projectId, team_id: teamId, name: runId })
    .execute()
  await database
    .insertInto("project_memberships")
    .values({ project_id: projectId, account_id: writerId, role: "producer" })
    .execute()
})

afterAll(async () => {
  await database
    .deleteFrom("audit_logs")
    .where("actor_account_id", "in", [writerId, otherId])
    .execute()
  await database
    .deleteFrom("command_receipts")
    .where("actor_account_id", "in", [writerId, otherId])
    .execute()
  await database.deleteFrom("teams").where("id", "=", teamId).execute()
  await database.deleteFrom("accounts").where("id", "in", [writerId, otherId]).execute()
  await database.destroy()
})

describe("Postgres personal contact restore", () => {
  it("notifies team members when a personal contact share changes", async () => {
    const created = await service.createPersonalContact({
      actorId: writerId,
      name: "通知测试联系人",
      idempotencyKey: `${runId}-notification-contact-create`,
    })
    const shared = await service.setContactShare({
      actorId: writerId,
      contactId: created.item.id,
      teamId,
      fields: ["name", "phone"],
      expectedRevision: 1,
    })
    const revoked = await service.deleteContactShare({
      actorId: writerId,
      contactId: created.item.id,
      teamId,
      expectedRevision: shared.revision,
    })

    await database
      .insertInto("notification_preferences")
      .values({
        account_id: otherId,
        team_id: teamId,
        published_call_sheets: true,
        important_call_sheet_changes: true,
        permission_assignments: true,
        portfolio_publications: true,
        review_activity: true,
        contact_sharing: false,
      })
      .onConflict((conflict) =>
        conflict.columns(["account_id", "team_id"]).doUpdateSet({
          contact_sharing: false,
        }),
      )
      .execute()
    const suppressed = await service.setContactShare({
      actorId: writerId,
      contactId: created.item.id,
      teamId,
      fields: ["name"],
      expectedRevision: revoked.revision,
    })

    expect(
      await database
        .selectFrom("notifications")
        .select(["recipient_account_id", "kind", "subject_id", "dedup_key", "metadata"])
        .where("subject_id", "=", created.item.id)
        .orderBy("created_at")
        .execute(),
    ).toEqual([
      {
        recipient_account_id: otherId,
        kind: "contact_share_updated",
        subject_id: created.item.id,
        dedup_key: `contact_share_updated:${teamId}:${created.item.id}:2`,
        metadata: { fields: ["name", "phone"], revision: 2 },
      },
      {
        recipient_account_id: otherId,
        kind: "contact_share_revoked",
        subject_id: created.item.id,
        dedup_key: `contact_share_revoked:${teamId}:${created.item.id}:3`,
        metadata: { fields: [], revision: 3 },
      },
    ])

    await service.deletePersonalContact({
      actorId: writerId,
      contactId: created.item.id,
      expectedRevision: suppressed.revision,
    })
  })

  it("restores only for the owner and preserves field shares", async () => {
    const created = await service.createPersonalContact({
      actorId: writerId,
      name: "恢复测试联系人",
      role: "演员",
      phone: "13800000002",
      idempotencyKey: `${runId}-personal-create`,
    })
    const shared = await service.setContactShare({
      actorId: writerId,
      contactId: created.item.id,
      teamId,
      fields: ["name", "phone"],
      allowProjectLink: false,
      expectedRevision: 1,
    })
    await service.deletePersonalContact({
      actorId: writerId,
      contactId: created.item.id,
      expectedRevision: shared.revision,
    })

    expect(await service.listPersonalContacts(writerId)).toEqual({ items: [] })
    expect(await service.listDeletedPersonalContacts(otherId)).toEqual({ items: [] })
    expect(
      (await service.listTeamContacts(writerId, teamId)).items.some(
        (contact) => contact.id === created.item.id,
      ),
    ).toBe(false)
    await expect(
      service.restorePersonalContact({
        actorId: otherId,
        contactId: created.item.id,
        expectedRevision: shared.revision,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", statusCode: 404 })
    await expect(
      service.restorePersonalContact({
        actorId: writerId,
        contactId: created.item.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })

    const deleted = await service.listDeletedPersonalContacts(writerId)
    const restored = await service.restorePersonalContact({
      actorId: writerId,
      contactId: created.item.id,
      expectedRevision: shared.revision,
    })
    const audit = await database
      .selectFrom("audit_logs")
      .select(["action", "subject_id"])
      .where("actor_account_id", "=", writerId)
      .where("action", "=", "contact.restored")
      .where("subject_id", "=", created.item.id)
      .executeTakeFirst()

    expect(deleted.items[0]).toMatchObject({
      id: created.item.id,
      revision: 2,
      shares: [{ teamId, fields: ["name", "phone"], allowProjectLink: false }],
    })
    expect(deleted.items[0].deletedAt).toBeTruthy()
    expect(restored).toMatchObject({
      id: created.item.id,
      revision: 3,
      shares: [{ teamId, fields: ["name", "phone"], allowProjectLink: false }],
    })
    expect(
      (await service.listTeamContacts(writerId, teamId)).items.find(
        (contact) => contact.id === created.item.id,
      ),
    ).toMatchObject({ name: "恢复测试联系人", phone: "13800000002" })
    expect(audit).toEqual({ action: "contact.restored", subject_id: created.item.id })
  })

  it("permanently deletes a recycled personal contact and its shared references", async () => {
    const created = await service.createPersonalContact({
      actorId: writerId,
      name: "永久删除测试联系人",
      idempotencyKey: `${runId}-personal-permanent-create`,
    })
    const shared = await service.setContactShare({
      actorId: writerId,
      contactId: created.item.id,
      teamId,
      fields: ["name"],
      expectedRevision: 1,
    })
    const supplierId = `${runId}-personal-permanent-supplier`
    await database
      .insertInto("suppliers")
      .values({
        id: supplierId,
        team_id: teamId,
        created_by_account_id: writerId,
        name: "永久删除引用供应商",
        category: "服务组织",
        services: "",
        phone: "",
        email: "",
        address: "",
      })
      .execute()
    await database
      .insertInto("supplier_contacts")
      .values({
        supplier_id: supplierId,
        contact_source: "member-shared",
        contact_id: created.item.id,
      })
      .execute()
    await service.deletePersonalContact({
      actorId: writerId,
      contactId: created.item.id,
      expectedRevision: shared.revision,
    })

    await expect(
      service.permanentlyDeletePersonalContact({
        actorId: otherId,
        contactId: created.item.id,
        expectedRevision: shared.revision,
        confirmation: "permanent-delete",
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", statusCode: 404 })
    await expect(
      service.permanentlyDeletePersonalContact({
        actorId: writerId,
        contactId: created.item.id,
        expectedRevision: 1,
        confirmation: "permanent-delete",
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    const deleted = await service.permanentlyDeletePersonalContact({
      actorId: writerId,
      contactId: created.item.id,
      expectedRevision: shared.revision,
      confirmation: "permanent-delete",
    })
    const [contact, shares, supplierReferences, audit] = await Promise.all([
      database
        .selectFrom("personal_contacts")
        .select("id")
        .where("id", "=", created.item.id)
        .executeTakeFirst(),
      database
        .selectFrom("contact_team_shares")
        .select("contact_id")
        .where("contact_id", "=", created.item.id)
        .execute(),
      database
        .selectFrom("supplier_contacts")
        .select("contact_id")
        .where("supplier_id", "=", supplierId)
        .where("contact_source", "=", "member-shared")
        .execute(),
      database
        .selectFrom("audit_logs")
        .select(["action", "subject_id"])
        .where("actor_account_id", "=", writerId)
        .where("action", "=", "contact.permanently-deleted")
        .where("subject_id", "=", created.item.id)
        .executeTakeFirst(),
    ])
    await database.deleteFrom("suppliers").where("id", "=", supplierId).execute()

    expect(deleted).toEqual({ id: created.item.id })
    expect(contact).toBeUndefined()
    expect(shares).toEqual([])
    expect(supplierReferences).toEqual([])
    expect(audit).toEqual({
      action: "contact.permanently-deleted",
      subject_id: created.item.id,
    })
  })
})

describe("Postgres team contact import", () => {
  it("writes one receipt and one audit per imported contact", async () => {
    const command = {
      actorId: writerId,
      teamId,
      items: [
        { name: "林霜", role: "演员" },
        { name: "沈岸", company: "北城器材" },
      ],
      idempotencyKey: `${runId}-batch-1`,
    }
    const first = await service.importTeamContacts(command)
    const replay = await service.importTeamContacts(command)

    expect(first.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    expect(replay.items).toEqual(first.items)
    expect(await counts()).toEqual({ contacts: 2, receipts: 1, audits: 2 })
  })

  it("rejects reuse of the batch key with a different payload", async () => {
    const idempotencyKey = `${runId}-batch-2`
    await service.importTeamContacts({
      actorId: writerId,
      teamId,
      items: [{ name: "许闻" }],
      idempotencyKey,
    })

    await expect(
      service.importTeamContacts({
        actorId: writerId,
        teamId,
        items: [{ name: "不同联系人" }],
        idempotencyKey,
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409,
    })
    expect(await counts()).toEqual({ contacts: 3, receipts: 2, audits: 3 })
  })
})

describe("Postgres team supplier import", () => {
  it("writes one receipt and one audit per imported supplier", async () => {
    const command = {
      actorId: writerId,
      teamId,
      items: [
        { name: "远景现场特效", category: "服务组织", services: "人工雨" },
        { name: "北站运营处", category: "场地", services: "站台协调" },
      ],
      idempotencyKey: `${runId}-supplier-batch-1`,
    }
    const first = await service.importTeamSuppliers(command)
    const replay = await service.importTeamSuppliers(command)

    expect(first.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    expect(replay.items).toEqual(first.items)
    expect(await supplierCounts()).toEqual({ suppliers: 2, receipts: 1, audits: 2 })
  })

  it("rejects supplier batch key reuse with a different payload", async () => {
    const idempotencyKey = `${runId}-supplier-batch-2`
    await service.importTeamSuppliers({
      actorId: writerId,
      teamId,
      items: [{ name: "城际场务" }],
      idempotencyKey,
    })
    await expect(
      service.importTeamSuppliers({
        actorId: writerId,
        teamId,
        items: [{ name: "不同供应商" }],
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 })
    expect(await supplierCounts()).toEqual({ suppliers: 3, receipts: 2, audits: 3 })
  })

  it("persists supplier contacts and projects and protects revisions", async () => {
    const contact = await service.createTeamContact({
      actorId: writerId,
      teamId,
      name: "赵衡",
      idempotencyKey: `${runId}-supplier-contact`,
    })
    const created = await service.createTeamSupplier({
      actorId: writerId,
      teamId,
      name: "关联测试供应商",
      contactRefs: [{ contactId: contact.item.id, source: "team" }],
      projectIds: [projectId],
      idempotencyKey: `${runId}-supplier-create`,
    })
    const updated = await service.updateTeamSupplier({
      actorId: writerId,
      teamId,
      supplierId: created.item.id,
      services: "雨效与安全保障",
      expectedRevision: 1,
    })

    await expect(
      service.updateTeamSupplier({
        actorId: writerId,
        teamId,
        supplierId: created.item.id,
        services: "过期修改",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", statusCode: 409 })
    expect(updated).toMatchObject({
      services: "雨效与安全保障",
      contactRefs: [{ contactId: contact.item.id, source: "team" }],
      projectIds: [projectId],
      revision: 2,
    })
  })
})
