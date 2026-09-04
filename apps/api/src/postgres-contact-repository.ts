import { createHash, randomUUID } from "node:crypto"

import {
  AppError,
  type ContactRepository,
  type CreatePersonalContactCommand,
  type CreateTeamContactCommand,
  type CreateTeamSupplierCommand,
  type DeleteContactShareCommand,
  type DeletePersonalContactCommand,
  type DeleteTeamContactCommand,
  type DeleteTeamSupplierCommand,
  type ImportTeamContactsCommand,
  type ImportTeamSuppliersCommand,
  type PermanentlyDeletePersonalContactCommand,
  type RestorePersonalContactCommand,
  type UpdateContactShareCommand,
  type UpdatePersonalContactCommand,
  type UpdateResult,
  type UpdateTeamContactCommand,
  type UpdateTeamSupplierCommand,
} from "@shadowproducer/application"
import type {
  ContactField,
  PersonalContact,
  PersonalContactShare,
  SupplierContactRef,
  TeamContact,
  TeamSupplier,
} from "@shadowproducer/contracts"
import type { Kysely, Transaction } from "kysely"

import type { Database } from "./database"
import { resolveProjectAccess, resolveTeamAccess } from "./postgres-access"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function requestHash(value: object) {
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "idempotencyKey")
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

function clean(value: string | undefined) {
  return value?.trim() ?? ""
}

export class PostgresContactRepository implements ContactRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getTeamAccess(actorId: string, teamId: string) {
    return resolveTeamAccess(this.database, actorId, teamId)
  }

  async getProjectAccess(actorId: string, teamId: string, projectId: string) {
    return resolveProjectAccess(this.database, actorId, projectId, teamId)
  }

  async listPersonalContacts(actorId: string) {
    const rows = await this.database
      .selectFrom("personal_contacts")
      .selectAll()
      .where("owner_account_id", "=", actorId)
      .where("deleted_at", "is", null)
      .orderBy("updated_at", "desc")
      .execute()
    const shares = await this.listShares(
      this.database,
      rows.map((row) => row.id),
    )
    return rows.map((row) => this.mapPersonalContact(row, shares.get(row.id) ?? []))
  }

  async listDeletedPersonalContacts(actorId: string) {
    const rows = await this.database
      .selectFrom("personal_contacts")
      .selectAll()
      .where("owner_account_id", "=", actorId)
      .where("deleted_at", "is not", null)
      .orderBy("deleted_at", "desc")
      .execute()
    const shares = await this.listShares(
      this.database,
      rows.map((row) => row.id),
    )
    return rows.map((row) => ({
      ...this.mapPersonalContact(row, shares.get(row.id) ?? []),
      deletedAt: toIso(row.deleted_at as Date | string),
    }))
  }

  async createPersonalContact(command: CreatePersonalContactCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const replay = await this.getReceipt<PersonalContact>(
        transaction,
        command.actorId,
        "personal-contact.create",
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }

      const id = randomUUID()
      await transaction
        .insertInto("personal_contacts")
        .values({
          id,
          owner_account_id: command.actorId,
          name: command.name.trim(),
          role: clean(command.role),
          company: clean(command.company),
          phone: clean(command.phone),
          email: clean(command.email),
        })
        .execute()
      const item = await this.findPersonalContact(transaction, command.actorId, id)
      if (!item) throw new Error("Created personal contact could not be read")
      await this.writeReceipt(
        transaction,
        command.actorId,
        "personal-contact.create",
        command.idempotencyKey,
        hash,
        item,
      )
      await this.writeAudit(transaction, command.actorId, null, "contact.created", id, {})
      return { item, replayed: false }
    })
  }

  async updatePersonalContact(
    command: UpdatePersonalContactCommand,
  ): Promise<UpdateResult<PersonalContact>> {
    return this.database.transaction().execute(async (transaction) => {
      const values: Record<string, string | Date> = { updated_at: new Date() }
      if (command.name !== undefined) values.name = command.name.trim()
      if (command.role !== undefined) values.role = clean(command.role)
      if (command.company !== undefined) values.company = clean(command.company)
      if (command.phone !== undefined) values.phone = clean(command.phone)
      if (command.email !== undefined) values.email = clean(command.email)
      const updated = await transaction
        .updateTable("personal_contacts")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.contactId)
        .where("owner_account_id", "=", command.actorId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.personalMissingOrConflict(transaction, command)
      const item = await this.findPersonalContact(
        transaction,
        command.actorId,
        updated.id,
      )
      if (!item) return { kind: "not_found" }
      await this.writeAudit(
        transaction,
        command.actorId,
        null,
        "contact.updated",
        item.id,
        { revision: item.revision },
      )
      return { kind: "ok", item }
    })
  }

  async deletePersonalContact(command: DeletePersonalContactCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const deleted = await transaction
        .updateTable("personal_contacts")
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where("id", "=", command.contactId)
        .where("owner_account_id", "=", command.actorId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!deleted) return this.personalMissingOrConflict(transaction, command)
      await this.writeAudit(
        transaction,
        command.actorId,
        null,
        "contact.deleted",
        deleted.id,
        {},
      )
      return { kind: "ok", item: { id: deleted.id } } as const
    })
  }

  async restorePersonalContact(
    command: RestorePersonalContactCommand,
  ): Promise<UpdateResult<PersonalContact>> {
    return this.database.transaction().execute(async (transaction) => {
      const restored = await transaction
        .updateTable("personal_contacts")
        .set({ deleted_at: null, updated_at: new Date() })
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.contactId)
        .where("owner_account_id", "=", command.actorId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is not", null)
        .returning("id")
        .executeTakeFirst()
      if (!restored) {
        const current = await transaction
          .selectFrom("personal_contacts")
          .select("revision")
          .where("id", "=", command.contactId)
          .where("owner_account_id", "=", command.actorId)
          .where("deleted_at", "is not", null)
          .executeTakeFirst()
        return current ? { kind: "conflict" } : { kind: "not_found" }
      }
      const item = await this.findPersonalContact(
        transaction,
        command.actorId,
        restored.id,
      )
      if (!item) return { kind: "not_found" }
      await this.writeAudit(
        transaction,
        command.actorId,
        null,
        "contact.restored",
        item.id,
        { revision: item.revision },
      )
      return { kind: "ok", item }
    })
  }

  async permanentlyDeletePersonalContact(
    command: PermanentlyDeletePersonalContactCommand,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const existing = await transaction
        .selectFrom("personal_contacts")
        .select("revision")
        .where("id", "=", command.contactId)
        .where("owner_account_id", "=", command.actorId)
        .where("deleted_at", "is not", null)
        .executeTakeFirst()
      if (!existing) return { kind: "not_found" } as const
      if (existing.revision !== command.expectedRevision) {
        return { kind: "conflict" } as const
      }
      await Promise.all([
        transaction
          .deleteFrom("breakdown_item_contacts")
          .where("contact_source", "=", "member-shared")
          .where("contact_id", "=", command.contactId)
          .execute(),
        transaction
          .deleteFrom("supplier_contacts")
          .where("contact_source", "=", "member-shared")
          .where("contact_id", "=", command.contactId)
          .execute(),
      ])
      const deleted = await transaction
        .deleteFrom("personal_contacts")
        .where("id", "=", command.contactId)
        .where("owner_account_id", "=", command.actorId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is not", null)
        .returning("id")
        .executeTakeFirst()
      if (!deleted) return { kind: "conflict" } as const
      await this.writeAudit(
        transaction,
        command.actorId,
        null,
        "contact.permanently-deleted",
        deleted.id,
        { revision: command.expectedRevision },
      )
      return { kind: "ok", item: { id: deleted.id } } as const
    })
  }

  async setContactShare(command: UpdateContactShareCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const updated = await this.bumpPersonalContact(transaction, command)
      if (!updated) return this.personalMissingOrConflict(transaction, command)
      const existingShare = await transaction
        .selectFrom("contact_team_shares")
        .select("contact_id")
        .where("contact_id", "=", command.contactId)
        .where("team_id", "=", command.teamId)
        .executeTakeFirst()
      if (existingShare) {
        await transaction
          .updateTable("contact_team_shares")
          .set({
            shared_fields: command.fields,
            allow_project_link: command.allowProjectLink ?? true,
            updated_at: new Date(),
          })
          .set((expression) => ({ revision: expression("revision", "+", 1) }))
          .where("contact_id", "=", command.contactId)
          .where("team_id", "=", command.teamId)
          .execute()
      } else {
        await transaction
          .insertInto("contact_team_shares")
          .values({
            contact_id: command.contactId,
            team_id: command.teamId,
            shared_fields: command.fields,
            allow_project_link: command.allowProjectLink ?? true,
          })
          .execute()
      }
      const item = await this.findPersonalContact(
        transaction,
        command.actorId,
        command.contactId,
      )
      if (!item) return { kind: "not_found" } as const
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "contact.share.updated",
        command.contactId,
        { fields: command.fields, allowProjectLink: command.allowProjectLink ?? true },
      )
      await this.writeContactShareNotifications(transaction, {
        actorId: command.actorId,
        teamId: command.teamId,
        contactId: command.contactId,
        contactName: item.name,
        revision: item.revision,
        kind: "contact_share_updated",
        fields: command.fields,
      })
      return { kind: "ok", item } as const
    })
  }

  async deleteContactShare(command: DeleteContactShareCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const share = await transaction
        .selectFrom("contact_team_shares")
        .select("contact_id")
        .where("contact_id", "=", command.contactId)
        .where("team_id", "=", command.teamId)
        .executeTakeFirst()
      if (!share) return { kind: "not_found" } as const
      const updated = await this.bumpPersonalContact(transaction, command)
      if (!updated) return this.personalMissingOrConflict(transaction, command)
      await transaction
        .deleteFrom("contact_team_shares")
        .where("contact_id", "=", command.contactId)
        .where("team_id", "=", command.teamId)
        .execute()
      const item = await this.findPersonalContact(
        transaction,
        command.actorId,
        command.contactId,
      )
      if (!item) return { kind: "not_found" } as const
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "contact.share.revoked",
        command.contactId,
        {},
      )
      await this.writeContactShareNotifications(transaction, {
        actorId: command.actorId,
        teamId: command.teamId,
        contactId: command.contactId,
        contactName: item.name,
        revision: item.revision,
        kind: "contact_share_revoked",
        fields: [],
      })
      return { kind: "ok", item } as const
    })
  }

  private async writeContactShareNotifications(
    database: DatabaseExecutor,
    input: {
      actorId: string
      teamId: string
      contactId: string
      contactName: string
      revision: number
      kind: "contact_share_updated" | "contact_share_revoked"
      fields: ContactField[]
    },
  ) {
    const recipients = await database
      .selectFrom("team_memberships as membership")
      .leftJoin("notification_preferences as preference", (join) =>
        join
          .onRef("preference.account_id", "=", "membership.account_id")
          .on("preference.team_id", "=", input.teamId),
      )
      .select(["membership.account_id", "preference.contact_sharing"])
      .where("membership.team_id", "=", input.teamId)
      .where("membership.account_id", "!=", input.actorId)
      .execute()
    const enabledRecipients = recipients.filter(
      (recipient) => recipient.contact_sharing ?? true,
    )
    if (!enabledRecipients.length) return

    const shared = input.kind === "contact_share_updated"
    await database
      .insertInto("notifications")
      .values(
        enabledRecipients.map((recipient) => ({
          id: randomUUID(),
          recipient_account_id: recipient.account_id,
          source_actor_account_id: input.actorId,
          team_id: input.teamId,
          project_id: null,
          kind: input.kind,
          subject_id: input.contactId,
          dedup_key: `${input.kind}:${input.teamId}:${input.contactId}:${input.revision}`,
          title: shared
            ? `联系人共享已更新：${input.contactName}`
            : `联系人共享已撤销：${input.contactName}`,
          body: shared
            ? `团队现在可查看：${input.fields.join("、")}`
            : "该联系人已不再向当前团队共享",
          metadata: JSON.stringify({
            fields: input.fields,
            revision: input.revision,
          }),
        })),
      )
      .onConflict((conflict) =>
        conflict.columns(["recipient_account_id", "dedup_key"]).doNothing(),
      )
      .execute()
  }

  async listTeamContacts(_actorId: string, teamId: string) {
    const [teamRows, sharedRows, team] = await Promise.all([
      this.database
        .selectFrom("team_contacts")
        .selectAll()
        .where("team_id", "=", teamId)
        .where("deleted_at", "is", null)
        .orderBy("updated_at", "desc")
        .execute(),
      this.database
        .selectFrom("contact_team_shares as share")
        .innerJoin("personal_contacts as contact", "contact.id", "share.contact_id")
        .innerJoin("accounts as owner", "owner.id", "contact.owner_account_id")
        .select([
          "contact.id",
          "contact.name",
          "contact.role",
          "contact.company",
          "contact.phone",
          "contact.email",
          "contact.revision",
          "contact.updated_at",
          "owner.display_name as owner_name",
          "share.shared_fields",
          "share.allow_project_link",
        ])
        .where("share.team_id", "=", teamId)
        .where("contact.deleted_at", "is", null)
        .orderBy("share.updated_at", "desc")
        .execute(),
      this.database
        .selectFrom("teams")
        .select("name")
        .where("id", "=", teamId)
        .executeTakeFirstOrThrow(),
    ])
    const projects = await this.listTeamContactProjects(
      this.database,
      teamRows.map((row) => row.id),
    )
    return [
      ...teamRows.map((row) =>
        this.mapTeamContact(row, team.name, projects.get(row.id) ?? []),
      ),
      ...sharedRows.map((row) => this.mapSharedContact(row)),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async createTeamContact(command: CreateTeamContactCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `team-contact.create:${command.teamId}`
      const replay = await this.getReceipt<TeamContact>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }
      const item = await this.insertTeamContact(transaction, command)
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
        command.actorId,
        command.teamId,
        "team-contact.created",
        item.id,
        {},
      )
      return { item, replayed: false }
    })
  }

  async importTeamContacts(command: ImportTeamContactsCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `team-contact.import:${command.teamId}`
      const replay = await this.getReceipt<TeamContact[]>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { items: replay, replayed: true }

      const items: TeamContact[] = []
      for (const [index, entry] of command.items.entries()) {
        const item = await this.insertTeamContact(transaction, {
          actorId: command.actorId,
          teamId: command.teamId,
          ...entry,
        })
        items.push(item)
        await this.writeAudit(
          transaction,
          command.actorId,
          command.teamId,
          "team-contact.created",
          item.id,
          { source: "csv", batchId: command.idempotencyKey, row: index + 1 },
        )
      }
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        items,
      )
      return { items, replayed: false }
    })
  }

  async updateTeamContact(command: UpdateTeamContactCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const values: Record<string, string | Date> = { updated_at: new Date() }
      if (command.name !== undefined) values.name = command.name.trim()
      if (command.role !== undefined) values.role = clean(command.role)
      if (command.company !== undefined) values.company = clean(command.company)
      if (command.phone !== undefined) values.phone = clean(command.phone)
      if (command.email !== undefined) values.email = clean(command.email)
      const updated = await transaction
        .updateTable("team_contacts")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.contactId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.teamMissingOrConflict(transaction, command)
      if (command.projectIds !== undefined) {
        await this.replaceTeamContactProjects(
          transaction,
          command.contactId,
          command.projectIds,
        )
      }
      const item = await this.findTeamContact(
        transaction,
        command.teamId,
        command.contactId,
      )
      if (!item) return { kind: "not_found" } as const
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "team-contact.updated",
        item.id,
        { revision: item.revision },
      )
      return { kind: "ok", item } as const
    })
  }

  async deleteTeamContact(command: DeleteTeamContactCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const deleted = await transaction
        .updateTable("team_contacts")
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where("id", "=", command.contactId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!deleted) return this.teamMissingOrConflict(transaction, command)
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "team-contact.deleted",
        deleted.id,
        {},
      )
      return { kind: "ok", item: { id: deleted.id } } as const
    })
  }

  async listTeamSuppliers(teamId: string) {
    const rows = await this.database
      .selectFrom("suppliers")
      .selectAll()
      .where("team_id", "=", teamId)
      .where("deleted_at", "is", null)
      .orderBy("updated_at", "desc")
      .execute()
    const [projects, contacts] = await Promise.all([
      this.listSupplierProjects(
        this.database,
        rows.map((row) => row.id),
      ),
      this.listSupplierContacts(
        this.database,
        rows.map((row) => row.id),
      ),
    ])
    return rows.map((row) =>
      this.mapTeamSupplier(row, projects.get(row.id) ?? [], contacts.get(row.id) ?? []),
    )
  }

  async createTeamSupplier(command: CreateTeamSupplierCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `team-supplier.create:${command.teamId}`
      const replay = await this.getReceipt<TeamSupplier>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { item: replay, replayed: true }
      const item = await this.insertTeamSupplier(transaction, command)
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
        command.actorId,
        command.teamId,
        "team-supplier.created",
        item.id,
        {},
      )
      return { item, replayed: false }
    })
  }

  async importTeamSuppliers(command: ImportTeamSuppliersCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const hash = requestHash(command)
      const domain = `team-supplier.import:${command.teamId}`
      const replay = await this.getReceipt<TeamSupplier[]>(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
      )
      if (replay) return { items: replay, replayed: true }
      const items: TeamSupplier[] = []
      for (const [index, entry] of command.items.entries()) {
        const item = await this.insertTeamSupplier(transaction, {
          actorId: command.actorId,
          teamId: command.teamId,
          ...entry,
        })
        items.push(item)
        await this.writeAudit(
          transaction,
          command.actorId,
          command.teamId,
          "team-supplier.created",
          item.id,
          { source: "csv", batchId: command.idempotencyKey, row: index + 1 },
        )
      }
      await this.writeReceipt(
        transaction,
        command.actorId,
        domain,
        command.idempotencyKey,
        hash,
        items,
      )
      return { items, replayed: false }
    })
  }

  async updateTeamSupplier(command: UpdateTeamSupplierCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const values: Record<string, string | Date> = { updated_at: new Date() }
      for (const [field, column] of [
        ["name", "name"],
        ["category", "category"],
        ["services", "services"],
        ["phone", "phone"],
        ["email", "email"],
        ["address", "address"],
      ] as const) {
        if (command[field] !== undefined) values[column] = command[field]
      }
      const updated = await transaction
        .updateTable("suppliers")
        .set(values)
        .set((expression) => ({ revision: expression("revision", "+", 1) }))
        .where("id", "=", command.supplierId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return this.supplierMissingOrConflict(transaction, command)
      if (command.projectIds !== undefined) {
        await this.replaceSupplierProjects(
          transaction,
          command.supplierId,
          command.projectIds,
        )
      }
      if (command.contactRefs !== undefined) {
        await this.replaceSupplierContacts(
          transaction,
          command.supplierId,
          command.contactRefs,
        )
      }
      const item = await this.findTeamSupplier(
        transaction,
        command.teamId,
        command.supplierId,
      )
      if (!item) return { kind: "not_found" } as const
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "team-supplier.updated",
        item.id,
        { revision: item.revision },
      )
      return { kind: "ok", item } as const
    })
  }

  async deleteTeamSupplier(command: DeleteTeamSupplierCommand) {
    return this.database.transaction().execute(async (transaction) => {
      const deleted = await transaction
        .updateTable("suppliers")
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where("id", "=", command.supplierId)
        .where("team_id", "=", command.teamId)
        .where("revision", "=", command.expectedRevision)
        .where("deleted_at", "is", null)
        .returning("id")
        .executeTakeFirst()
      if (!deleted) return this.supplierMissingOrConflict(transaction, command)
      await this.writeAudit(
        transaction,
        command.actorId,
        command.teamId,
        "team-supplier.deleted",
        deleted.id,
        {},
      )
      return { kind: "ok", item: { id: deleted.id } } as const
    })
  }

  private async findPersonalContact(
    database: DatabaseExecutor,
    actorId: string,
    contactId: string,
  ) {
    const row = await database
      .selectFrom("personal_contacts")
      .selectAll()
      .where("id", "=", contactId)
      .where("owner_account_id", "=", actorId)
      .where("deleted_at", "is", null)
      .executeTakeFirst()
    if (!row) return null
    const shares = await this.listShares(database, [contactId])
    return this.mapPersonalContact(row, shares.get(contactId) ?? [])
  }

  private async listShares(database: DatabaseExecutor, contactIds: string[]) {
    const result = new Map<string, PersonalContactShare[]>()
    if (!contactIds.length) return result
    const rows = await database
      .selectFrom("contact_team_shares as share")
      .innerJoin("teams as team", "team.id", "share.team_id")
      .select([
        "share.contact_id",
        "share.team_id",
        "team.name as team_name",
        "share.shared_fields",
        "share.allow_project_link",
        "share.revision",
        "share.updated_at",
      ])
      .where("share.contact_id", "in", contactIds)
      .execute()
    for (const row of rows) {
      const current = result.get(row.contact_id) ?? []
      current.push({
        teamId: row.team_id,
        teamName: row.team_name,
        fields: row.shared_fields as ContactField[],
        allowProjectLink: row.allow_project_link,
        revision: row.revision,
        updatedAt: toIso(row.updated_at),
      })
      result.set(row.contact_id, current)
    }
    return result
  }

  private mapPersonalContact(
    row: {
      id: string
      name: string
      role: string
      company: string
      phone: string
      email: string
      revision: number
      updated_at: Date | string
    },
    shares: PersonalContactShare[],
  ): PersonalContact {
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      company: row.company,
      phone: row.phone,
      email: row.email,
      shares,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private async findTeamContact(
    database: DatabaseExecutor,
    teamId: string,
    contactId: string,
  ) {
    const [row, team] = await Promise.all([
      database
        .selectFrom("team_contacts")
        .selectAll()
        .where("id", "=", contactId)
        .where("team_id", "=", teamId)
        .where("deleted_at", "is", null)
        .executeTakeFirst(),
      database
        .selectFrom("teams")
        .select("name")
        .where("id", "=", teamId)
        .executeTakeFirst(),
    ])
    if (!row || !team) return null
    const projects = await this.listTeamContactProjects(database, [contactId])
    return this.mapTeamContact(row, team.name, projects.get(contactId) ?? [])
  }

  private async findTeamSupplier(
    database: DatabaseExecutor,
    teamId: string,
    supplierId: string,
  ) {
    const row = await database
      .selectFrom("suppliers")
      .selectAll()
      .where("id", "=", supplierId)
      .where("team_id", "=", teamId)
      .where("deleted_at", "is", null)
      .executeTakeFirst()
    if (!row) return null
    const [projects, contacts] = await Promise.all([
      this.listSupplierProjects(database, [supplierId]),
      this.listSupplierContacts(database, [supplierId]),
    ])
    return this.mapTeamSupplier(
      row,
      projects.get(supplierId) ?? [],
      contacts.get(supplierId) ?? [],
    )
  }

  private async insertTeamSupplier(
    database: DatabaseExecutor,
    command: {
      actorId: string
      teamId: string
      name: string
      category?: string
      services?: string
      phone?: string
      email?: string
      address?: string
      contactRefs?: SupplierContactRef[]
      projectIds?: string[]
    },
  ) {
    const id = randomUUID()
    await database
      .insertInto("suppliers")
      .values({
        id,
        team_id: command.teamId,
        created_by_account_id: command.actorId,
        name: command.name,
        category: clean(command.category) || "服务组织",
        services: clean(command.services),
        phone: clean(command.phone),
        email: clean(command.email),
        address: clean(command.address),
      })
      .execute()
    await Promise.all([
      this.replaceSupplierProjects(database, id, command.projectIds ?? []),
      this.replaceSupplierContacts(database, id, command.contactRefs ?? []),
    ])
    const item = await this.findTeamSupplier(database, command.teamId, id)
    if (!item) throw new Error("Created team supplier could not be read")
    return item
  }

  private mapTeamSupplier(
    row: {
      id: string
      team_id: string
      name: string
      category: string
      services: string
      phone: string
      email: string
      address: string
      revision: number
      updated_at: Date | string
    },
    projectIds: string[],
    contactRefs: SupplierContactRef[],
  ): TeamSupplier {
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      category: row.category,
      services: row.services,
      phone: row.phone,
      email: row.email,
      address: row.address,
      contactRefs,
      projectIds,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private async listSupplierProjects(database: DatabaseExecutor, ids: string[]) {
    const result = new Map<string, string[]>()
    if (!ids.length) return result
    const rows = await database
      .selectFrom("supplier_projects")
      .select(["supplier_id", "project_id"])
      .where("supplier_id", "in", ids)
      .execute()
    for (const row of rows) {
      result.set(row.supplier_id, [
        ...(result.get(row.supplier_id) ?? []),
        row.project_id,
      ])
    }
    return result
  }

  private async listSupplierContacts(database: DatabaseExecutor, ids: string[]) {
    const result = new Map<string, SupplierContactRef[]>()
    if (!ids.length) return result
    const rows = await database
      .selectFrom("supplier_contacts")
      .select(["supplier_id", "contact_source", "contact_id"])
      .where("supplier_id", "in", ids)
      .execute()
    for (const row of rows) {
      result.set(row.supplier_id, [
        ...(result.get(row.supplier_id) ?? []),
        { source: row.contact_source, contactId: row.contact_id },
      ])
    }
    return result
  }

  private async replaceSupplierProjects(
    database: DatabaseExecutor,
    supplierId: string,
    projectIds: string[],
  ) {
    await database
      .deleteFrom("supplier_projects")
      .where("supplier_id", "=", supplierId)
      .execute()
    const unique = [...new Set(projectIds)]
    if (unique.length) {
      await database
        .insertInto("supplier_projects")
        .values(
          unique.map((projectId) => ({ supplier_id: supplierId, project_id: projectId })),
        )
        .execute()
    }
  }

  private async replaceSupplierContacts(
    database: DatabaseExecutor,
    supplierId: string,
    contacts: SupplierContactRef[],
  ) {
    await database
      .deleteFrom("supplier_contacts")
      .where("supplier_id", "=", supplierId)
      .execute()
    const unique = [
      ...new Map(
        contacts.map((contact) => [`${contact.source}:${contact.contactId}`, contact]),
      ).values(),
    ]
    if (unique.length) {
      await database
        .insertInto("supplier_contacts")
        .values(
          unique.map((contact) => ({
            supplier_id: supplierId,
            contact_source: contact.source,
            contact_id: contact.contactId,
          })),
        )
        .execute()
    }
  }

  private async insertTeamContact(
    database: DatabaseExecutor,
    command: {
      actorId: string
      teamId: string
      name: string
      role?: string
      company?: string
      phone?: string
      email?: string
      projectIds?: string[]
    },
  ) {
    const id = randomUUID()
    await database
      .insertInto("team_contacts")
      .values({
        id,
        team_id: command.teamId,
        created_by_account_id: command.actorId,
        name: command.name.trim(),
        role: clean(command.role),
        company: clean(command.company),
        phone: clean(command.phone),
        email: clean(command.email),
      })
      .execute()
    await this.replaceTeamContactProjects(database, id, command.projectIds ?? [])
    const item = await this.findTeamContact(database, command.teamId, id)
    if (!item) throw new Error("Created team contact could not be read")
    return item
  }

  private mapTeamContact(
    row: {
      id: string
      name: string
      role: string
      company: string
      phone: string
      email: string
      revision: number
      updated_at: Date | string
    },
    teamName: string,
    projectIds: string[],
  ): TeamContact {
    return {
      id: row.id,
      source: "team",
      ownerName: teamName,
      name: row.name,
      role: row.role,
      company: row.company,
      phone: row.phone,
      email: row.email,
      sharedFields: ["name", "role", "company", "phone", "email"],
      projectIds,
      allowProjectLink: true,
      editable: true,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private mapSharedContact(row: {
    id: string
    name: string
    role: string
    company: string
    phone: string
    email: string
    revision: number
    updated_at: Date | string
    owner_name: string
    shared_fields: string[]
    allow_project_link: boolean
  }): TeamContact {
    const fields = row.shared_fields as ContactField[]
    const visible = (field: ContactField, value: string) =>
      fields.includes(field) ? value : null
    return {
      id: row.id,
      source: "member-shared",
      ownerName: row.owner_name,
      name: visible("name", row.name),
      role: visible("role", row.role),
      company: visible("company", row.company),
      phone: visible("phone", row.phone),
      email: visible("email", row.email),
      sharedFields: fields,
      projectIds: [],
      allowProjectLink: row.allow_project_link,
      editable: false,
      revision: row.revision,
      updatedAt: toIso(row.updated_at),
    }
  }

  private async listTeamContactProjects(database: DatabaseExecutor, ids: string[]) {
    const result = new Map<string, string[]>()
    if (!ids.length) return result
    const rows = await database
      .selectFrom("team_contact_projects")
      .select(["contact_id", "project_id"])
      .where("contact_id", "in", ids)
      .execute()
    for (const row of rows) {
      result.set(row.contact_id, [...(result.get(row.contact_id) ?? []), row.project_id])
    }
    return result
  }

  private async replaceTeamContactProjects(
    database: DatabaseExecutor,
    contactId: string,
    projectIds: string[],
  ) {
    await database
      .deleteFrom("team_contact_projects")
      .where("contact_id", "=", contactId)
      .execute()
    if (projectIds.length) {
      await database
        .insertInto("team_contact_projects")
        .values(
          [...new Set(projectIds)].map((projectId) => ({
            contact_id: contactId,
            project_id: projectId,
          })),
        )
        .execute()
    }
  }

  private async bumpPersonalContact(
    database: DatabaseExecutor,
    command: { actorId: string; contactId: string; expectedRevision: number },
  ) {
    return database
      .updateTable("personal_contacts")
      .set({ updated_at: new Date() })
      .set((expression) => ({ revision: expression("revision", "+", 1) }))
      .where("id", "=", command.contactId)
      .where("owner_account_id", "=", command.actorId)
      .where("revision", "=", command.expectedRevision)
      .where("deleted_at", "is", null)
      .returning("id")
      .executeTakeFirst()
  }

  private async personalMissingOrConflict(
    database: DatabaseExecutor,
    command: { actorId: string; contactId: string; expectedRevision: number },
  ) {
    const current = await database
      .selectFrom("personal_contacts")
      .select("revision")
      .where("id", "=", command.contactId)
      .where("owner_account_id", "=", command.actorId)
      .where("deleted_at", "is", null)
      .executeTakeFirst()
    return current ? ({ kind: "conflict" } as const) : ({ kind: "not_found" } as const)
  }

  private async teamMissingOrConflict(
    database: DatabaseExecutor,
    command: { teamId: string; contactId: string; expectedRevision: number },
  ) {
    const current = await database
      .selectFrom("team_contacts")
      .select("revision")
      .where("id", "=", command.contactId)
      .where("team_id", "=", command.teamId)
      .where("deleted_at", "is", null)
      .executeTakeFirst()
    return current ? ({ kind: "conflict" } as const) : ({ kind: "not_found" } as const)
  }

  private async supplierMissingOrConflict(
    database: DatabaseExecutor,
    command: { teamId: string; supplierId: string; expectedRevision: number },
  ) {
    const current = await database
      .selectFrom("suppliers")
      .select("revision")
      .where("id", "=", command.supplierId)
      .where("team_id", "=", command.teamId)
      .where("deleted_at", "is", null)
      .executeTakeFirst()
    return current ? ({ kind: "conflict" } as const) : ({ kind: "not_found" } as const)
  }

  private async getReceipt<T>(
    database: DatabaseExecutor,
    actorId: string,
    domain: string,
    key: string,
    hash: string,
  ) {
    const row = await database
      .selectFrom("command_receipts")
      .select(["response", "request_hash"])
      .where("actor_account_id", "=", actorId)
      .where("domain", "=", domain)
      .where("idempotency_key", "=", key)
      .executeTakeFirst()
    if (row?.request_hash && row.request_hash !== hash) {
      throw new AppError(
        "IDEMPOTENCY_KEY_REUSED",
        "幂等键已用于不同请求，请重新提交",
        409,
      )
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
      | PersonalContact
      | TeamContact
      | TeamContact[]
      | TeamSupplier
      | TeamSupplier[],
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
    actorId: string,
    teamId: string | null,
    action: string,
    subjectId: string,
    metadata: Record<string, unknown>,
  ) {
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: actorId,
        team_id: teamId,
        project_id: null,
        action,
        subject_id: subjectId,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }
}
