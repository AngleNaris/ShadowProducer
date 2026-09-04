import type {
  ContactRepository,
  CreatePersonalContactCommand,
  CreateTeamContactCommand,
  CreateTeamSupplierCommand,
  DeleteContactShareCommand,
  DeletePersonalContactCommand,
  DeleteTeamContactCommand,
  DeleteTeamSupplierCommand,
  ImportTeamContactsCommand,
  ImportTeamSuppliersCommand,
  PermanentlyDeletePersonalContactCommand,
  RestorePersonalContactCommand,
  ScriptRepository,
  UpdateContactShareCommand,
  UpdatePersonalContactCommand,
  UpdateResult,
  UpdateTeamContactCommand,
  UpdateTeamSupplierCommand,
} from "@shadowproducer/application"
import { ContactService, ScriptService } from "@shadowproducer/application"
import type {
  ContactField,
  DeletedPersonalContact,
  PersonalContact,
  PersonalContactShare,
  TeamContact,
  TeamSupplier,
} from "@shadowproducer/contracts"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"

const now = "2026-08-28T08:00:00.000Z"

class MemoryContactRepository implements ContactRepository {
  readonly personalContacts: PersonalContact[] = []
  readonly teamContacts: TeamContact[] = []
  readonly teamSuppliers: TeamSupplier[] = []
  private readonly personalOwners = new Map<string, string>()
  private readonly personalDeletedAt = new Map<string, string>()
  private readonly personalReceipts = new Map<string, PersonalContact>()
  private readonly teamReceipts = new Map<string, TeamContact>()
  private readonly teamImportReceipts = new Map<string, TeamContact[]>()
  private readonly supplierReceipts = new Map<string, TeamSupplier>()
  private readonly supplierImportReceipts = new Map<string, TeamSupplier[]>()

  async getTeamAccess(actorId: string, teamId: string) {
    if (teamId !== "north") return null
    if (actorId === "account-fanxing") return { canRead: true, canWrite: true }
    if (actorId === "account-viewer") return { canRead: true, canWrite: false }
    return null
  }

  async getProjectAccess(actorId: string, teamId: string, projectId: string) {
    const teamAccess = await this.getTeamAccess(actorId, teamId)
    return teamAccess && projectId === "winter-coffee"
      ? { canRead: true, canWrite: teamAccess.canWrite }
      : null
  }

  async listPersonalContacts(actorId: string) {
    return structuredClone(
      this.personalContacts.filter(
        (contact) =>
          this.personalOwners.get(contact.id) === actorId &&
          !this.personalDeletedAt.has(contact.id),
      ),
    )
  }

  async listDeletedPersonalContacts(actorId: string) {
    return structuredClone(
      this.personalContacts.flatMap((contact): DeletedPersonalContact[] => {
        const deletedAt = this.personalDeletedAt.get(contact.id)
        return deletedAt && this.personalOwners.get(contact.id) === actorId
          ? [{ ...contact, deletedAt }]
          : []
      }),
    )
  }

  async createPersonalContact(command: CreatePersonalContactCommand) {
    const receipt = this.personalReceipts.get(command.idempotencyKey)
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const item: PersonalContact = {
      id: `personal-contact-${this.personalContacts.length + 1}`,
      name: command.name,
      role: command.role ?? "",
      company: command.company ?? "",
      phone: command.phone ?? "",
      email: command.email ?? "",
      shares: [],
      revision: 1,
      updatedAt: now,
    }
    this.personalContacts.push(item)
    this.personalOwners.set(item.id, command.actorId)
    this.personalReceipts.set(command.idempotencyKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async updatePersonalContact(
    command: UpdatePersonalContactCommand,
  ): Promise<UpdateResult<PersonalContact>> {
    const item = this.personalContacts.find(
      (contact) =>
        contact.id === command.contactId &&
        this.personalOwners.get(contact.id) === command.actorId &&
        !this.personalDeletedAt.has(contact.id),
    )
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (command.name !== undefined) item.name = command.name
    if (command.role !== undefined) item.role = command.role
    if (command.company !== undefined) item.company = command.company
    if (command.phone !== undefined) item.phone = command.phone
    if (command.email !== undefined) item.email = command.email
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async deletePersonalContact(command: DeletePersonalContactCommand) {
    return this.deletePersonal(command)
  }

  async restorePersonalContact(
    command: RestorePersonalContactCommand,
  ): Promise<UpdateResult<PersonalContact>> {
    const item = this.personalContacts.find(
      (contact) =>
        contact.id === command.contactId &&
        this.personalOwners.get(contact.id) === command.actorId &&
        this.personalDeletedAt.has(contact.id),
    )
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    this.personalDeletedAt.delete(item.id)
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async permanentlyDeletePersonalContact(
    command: PermanentlyDeletePersonalContactCommand,
  ) {
    const index = this.personalContacts.findIndex(
      (contact) =>
        contact.id === command.contactId &&
        this.personalOwners.get(contact.id) === command.actorId &&
        this.personalDeletedAt.has(contact.id),
    )
    if (index < 0) return { kind: "not_found" } as const
    if (this.personalContacts[index].revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    const [deleted] = this.personalContacts.splice(index, 1)
    this.personalOwners.delete(deleted.id)
    this.personalDeletedAt.delete(deleted.id)
    return { kind: "ok", item: { id: deleted.id } } as const
  }

  async setContactShare(
    command: UpdateContactShareCommand,
  ): Promise<UpdateResult<PersonalContact>> {
    const item = this.personalContacts.find(
      (contact) =>
        contact.id === command.contactId &&
        this.personalOwners.get(contact.id) === command.actorId &&
        !this.personalDeletedAt.has(contact.id),
    )
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    const share: PersonalContactShare = {
      teamId: command.teamId,
      teamName: "北岸影像",
      fields: [...command.fields],
      allowProjectLink: command.allowProjectLink ?? true,
      revision:
        (item.shares.find((entry) => entry.teamId === command.teamId)?.revision ?? 0) + 1,
      updatedAt: now,
    }
    item.shares = [
      ...item.shares.filter((entry) => entry.teamId !== command.teamId),
      share,
    ]
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async deleteContactShare(command: DeleteContactShareCommand) {
    const item = this.personalContacts.find(
      (contact) =>
        contact.id === command.contactId &&
        this.personalOwners.get(contact.id) === command.actorId &&
        !this.personalDeletedAt.has(contact.id),
    )
    if (!item?.shares.some((share) => share.teamId === command.teamId)) {
      return { kind: "not_found" } as const
    }
    if (item.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    item.shares = item.shares.filter((share) => share.teamId !== command.teamId)
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) } as const
  }

  async listTeamContacts(_actorId: string, teamId: string) {
    const shared = this.personalContacts.flatMap((contact) => {
      if (this.personalDeletedAt.has(contact.id)) return []
      const share = contact.shares.find((entry) => entry.teamId === teamId)
      if (!share) return []
      const has = (field: ContactField) => share.fields.includes(field)
      return [
        {
          id: contact.id,
          source: "member-shared" as const,
          ownerName: "繁星",
          name: has("name") ? contact.name : null,
          role: has("role") ? contact.role : null,
          company: has("company") ? contact.company : null,
          phone: has("phone") ? contact.phone : null,
          email: has("email") ? contact.email : null,
          sharedFields: [...share.fields],
          projectIds: [],
          allowProjectLink: share.allowProjectLink,
          editable: false,
          revision: contact.revision,
          updatedAt: now,
        },
      ]
    })
    return structuredClone([
      ...this.teamContacts.filter((contact) => contact.ownerName === "北岸影像"),
      ...shared,
    ])
  }

  async createTeamContact(command: CreateTeamContactCommand) {
    const receipt = this.teamReceipts.get(command.idempotencyKey)
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const item: TeamContact = {
      id: `team-contact-${this.teamContacts.length + 1}`,
      source: "team",
      ownerName: "北岸影像",
      name: command.name,
      role: command.role ?? "",
      company: command.company ?? "",
      phone: command.phone ?? "",
      email: command.email ?? "",
      sharedFields: ["name", "role", "company", "phone", "email"],
      projectIds: command.projectIds ?? [],
      allowProjectLink: true,
      editable: true,
      revision: 1,
      updatedAt: now,
    }
    this.teamContacts.push(item)
    this.teamReceipts.set(command.idempotencyKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async importTeamContacts(command: ImportTeamContactsCommand) {
    const receipt = this.teamImportReceipts.get(command.idempotencyKey)
    if (receipt) return { items: structuredClone(receipt), replayed: true }
    const items = command.items.map((entry) => ({
      id: `team-contact-${this.teamContacts.length + 1}`,
      source: "team" as const,
      ownerName: "北岸影像",
      name: entry.name,
      role: entry.role ?? "",
      company: entry.company ?? "",
      phone: entry.phone ?? "",
      email: entry.email ?? "",
      sharedFields: ["name", "role", "company", "phone", "email"] as ContactField[],
      projectIds: [],
      allowProjectLink: true,
      editable: true,
      revision: 1,
      updatedAt: now,
    }))
    this.teamContacts.push(...items)
    this.teamImportReceipts.set(command.idempotencyKey, items)
    return { items: structuredClone(items), replayed: false }
  }

  async updateTeamContact(
    command: UpdateTeamContactCommand,
  ): Promise<UpdateResult<TeamContact>> {
    const item = this.teamContacts.find((contact) => contact.id === command.contactId)
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (command.name !== undefined) item.name = command.name
    if (command.role !== undefined) item.role = command.role
    if (command.company !== undefined) item.company = command.company
    if (command.phone !== undefined) item.phone = command.phone
    if (command.email !== undefined) item.email = command.email
    if (command.projectIds !== undefined) item.projectIds = command.projectIds
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async deleteTeamContact(command: DeleteTeamContactCommand) {
    const index = this.teamContacts.findIndex(
      (contact) => contact.id === command.contactId,
    )
    if (index < 0) return { kind: "not_found" } as const
    if (this.teamContacts[index].revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    const [deleted] = this.teamContacts.splice(index, 1)
    return { kind: "ok", item: { id: deleted.id } } as const
  }

  async listTeamSuppliers(teamId: string) {
    return structuredClone(
      this.teamSuppliers.filter((supplier) => supplier.teamId === teamId),
    )
  }

  async createTeamSupplier(command: CreateTeamSupplierCommand) {
    const receipt = this.supplierReceipts.get(command.idempotencyKey)
    if (receipt) return { item: structuredClone(receipt), replayed: true }
    const item: TeamSupplier = {
      id: `supplier-${this.teamSuppliers.length + 1}`,
      teamId: command.teamId,
      name: command.name,
      category: command.category ?? "服务组织",
      services: command.services ?? "",
      phone: command.phone ?? "",
      email: command.email ?? "",
      address: command.address ?? "",
      contactRefs: command.contactRefs ?? [],
      projectIds: command.projectIds ?? [],
      revision: 1,
      updatedAt: now,
    }
    this.teamSuppliers.push(item)
    this.supplierReceipts.set(command.idempotencyKey, item)
    return { item: structuredClone(item), replayed: false }
  }

  async importTeamSuppliers(command: ImportTeamSuppliersCommand) {
    const receipt = this.supplierImportReceipts.get(command.idempotencyKey)
    if (receipt) return { items: structuredClone(receipt), replayed: true }
    const items = command.items.map(
      (entry): TeamSupplier => ({
        id: `supplier-${this.teamSuppliers.length + 1}`,
        teamId: command.teamId,
        name: entry.name,
        category: entry.category ?? "服务组织",
        services: entry.services ?? "",
        phone: entry.phone ?? "",
        email: entry.email ?? "",
        address: entry.address ?? "",
        contactRefs: [],
        projectIds: [],
        revision: 1,
        updatedAt: now,
      }),
    )
    this.teamSuppliers.push(...items)
    this.supplierImportReceipts.set(command.idempotencyKey, items)
    return { items: structuredClone(items), replayed: false }
  }

  async updateTeamSupplier(
    command: UpdateTeamSupplierCommand,
  ): Promise<UpdateResult<TeamSupplier>> {
    const item = this.teamSuppliers.find(
      (supplier) =>
        supplier.id === command.supplierId && supplier.teamId === command.teamId,
    )
    if (!item) return { kind: "not_found" }
    if (item.revision !== command.expectedRevision) return { kind: "conflict" }
    if (command.name !== undefined) item.name = command.name
    if (command.category !== undefined) item.category = command.category
    if (command.services !== undefined) item.services = command.services
    if (command.phone !== undefined) item.phone = command.phone
    if (command.email !== undefined) item.email = command.email
    if (command.address !== undefined) item.address = command.address
    if (command.contactRefs !== undefined) item.contactRefs = command.contactRefs
    if (command.projectIds !== undefined) item.projectIds = command.projectIds
    item.revision += 1
    return { kind: "ok", item: structuredClone(item) }
  }

  async deleteTeamSupplier(command: DeleteTeamSupplierCommand) {
    const index = this.teamSuppliers.findIndex(
      (supplier) =>
        supplier.id === command.supplierId && supplier.teamId === command.teamId,
    )
    if (index < 0) return { kind: "not_found" } as const
    if (this.teamSuppliers[index].revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    const [deleted] = this.teamSuppliers.splice(index, 1)
    return { kind: "ok", item: { id: deleted.id } } as const
  }

  private async deletePersonal(command: DeletePersonalContactCommand) {
    const item = this.personalContacts.find(
      (contact) =>
        contact.id === command.contactId &&
        this.personalOwners.get(contact.id) === command.actorId &&
        !this.personalDeletedAt.has(contact.id),
    )
    if (!item) return { kind: "not_found" } as const
    if (item.revision !== command.expectedRevision) {
      return { kind: "conflict" } as const
    }
    this.personalDeletedAt.set(item.id, now)
    return { kind: "ok", item: { id: item.id } } as const
  }
}

const unusedScriptRepository: ScriptRepository = {
  async getProjectAccess() {
    return null
  },
  async listDocuments() {
    return []
  },
  async createDocument() {
    throw new Error("unused")
  },
  async getWorkspace() {
    return null
  },
  async updateVersion() {
    return null
  },
  async createVersion() {
    return null
  },
  async createComment() {
    return null
  },
  async updateComment() {
    return null
  },
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
const writerHeaders = { "x-shadow-account-id": "account-fanxing" }

async function createTestApp() {
  const repository = new MemoryContactRepository()
  const app = await buildApp({
    scriptService: new ScriptService(unusedScriptRepository),
    contactService: new ContactService(repository),
    logger: false,
  })
  apps.push(app)
  return { app, repository }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("contact API", () => {
  it("creates personal contacts idempotently and protects revisions", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/contacts",
      headers: writerHeaders,
      payload: {
        name: "陈锋",
        role: "场务",
        phone: "13800000000",
        idempotencyKey: "personal-contact-command-1",
      },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)
    const conflict = await app.inject({
      method: "PATCH",
      url: `/v1/contacts/${first.json().item.id}`,
      headers: writerHeaders,
      payload: { role: "场务主管", expectedRevision: 9 },
    })

    expect(first.statusCode).toBe(201)
    expect(replay.json().replayed).toBe(true)
    expect(repository.personalContacts).toHaveLength(1)
    expect(conflict.statusCode).toBe(409)
  })

  it("projects only explicitly shared personal fields into the team library", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: writerHeaders,
      payload: {
        name: "周岚",
        role: "制片协调",
        company: "远光制片",
        phone: "13900000000",
        email: "zhou@example.com",
        idempotencyKey: "personal-contact-command-2",
      },
    })
    const shared = await app.inject({
      method: "PUT",
      url: `/v1/contacts/${created.json().item.id}/team-shares/north`,
      headers: writerHeaders,
      payload: {
        fields: ["name", "role"],
        allowProjectLink: false,
        expectedRevision: 1,
      },
    })
    const teamList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/contacts",
      headers: writerHeaders,
    })
    const projection = teamList.json().items[0]

    expect(shared.statusCode).toBe(200)
    expect(projection.name).toBe("周岚")
    expect(projection.role).toBe("制片协调")
    expect(projection.phone).toBeNull()
    expect(projection.email).toBeNull()
    expect(projection.allowProjectLink).toBe(false)
  })

  it("lets only the owner restore a deleted personal contact with its shares intact", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: writerHeaders,
      payload: {
        name: "恢复验收联系人",
        role: "演员",
        phone: "13800000001",
        idempotencyKey: "personal-contact-restore-1",
      },
    })
    const contactId = created.json().item.id as string
    const shared = await app.inject({
      method: "PUT",
      url: `/v1/contacts/${contactId}/team-shares/north`,
      headers: writerHeaders,
      payload: {
        fields: ["name", "phone"],
        allowProjectLink: false,
        expectedRevision: 1,
      },
    })
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/contacts/${contactId}`,
      headers: writerHeaders,
      payload: { expectedRevision: shared.json().revision },
    })

    const [active, teamContacts, ownerDeleted, otherDeleted] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/contacts", headers: writerHeaders }),
      app.inject({
        method: "GET",
        url: "/v1/teams/north/contacts",
        headers: writerHeaders,
      }),
      app.inject({
        method: "GET",
        url: "/v1/contacts/deleted",
        headers: writerHeaders,
      }),
      app.inject({
        method: "GET",
        url: "/v1/contacts/deleted",
        headers: { "x-shadow-account-id": "account-viewer" },
      }),
    ])
    const forbiddenRestore = await app.inject({
      method: "POST",
      url: `/v1/contacts/${contactId}/restore`,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { expectedRevision: 2 },
    })
    const staleRestore = await app.inject({
      method: "POST",
      url: `/v1/contacts/${contactId}/restore`,
      headers: writerHeaders,
      payload: { expectedRevision: 1 },
    })
    const restored = await app.inject({
      method: "POST",
      url: `/v1/contacts/${contactId}/restore`,
      headers: writerHeaders,
      payload: { expectedRevision: 2 },
    })
    const teamAfterRestore = await app.inject({
      method: "GET",
      url: "/v1/teams/north/contacts",
      headers: writerHeaders,
    })

    expect(deleted.statusCode).toBe(200)
    expect(active.json().items).toEqual([])
    expect(teamContacts.json().items).toEqual([])
    expect(ownerDeleted.json().items[0]).toMatchObject({
      id: contactId,
      revision: 2,
      shares: [{ teamId: "north", fields: ["name", "phone"] }],
    })
    expect(ownerDeleted.json().items[0].deletedAt).toBe(now)
    expect(otherDeleted.json().items).toEqual([])
    expect(forbiddenRestore.statusCode).toBe(404)
    expect(staleRestore.statusCode).toBe(409)
    expect(restored.json()).toMatchObject({ id: contactId, revision: 3 })
    expect(teamAfterRestore.json().items[0]).toMatchObject({
      id: contactId,
      name: "恢复验收联系人",
      phone: "13800000001",
      allowProjectLink: false,
    })
  })

  it("permanently deletes only an owned contact already in the recycle bin", async () => {
    const { app } = await createTestApp()
    const created = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: writerHeaders,
      payload: {
        name: "永久删除验收联系人",
        idempotencyKey: "personal-contact-permanent-delete-1",
      },
    })
    const contactId = created.json().item.id as string
    await app.inject({
      method: "DELETE",
      url: `/v1/contacts/${contactId}`,
      headers: writerHeaders,
      payload: { expectedRevision: 1 },
    })

    const missingConfirmation = await app.inject({
      method: "DELETE",
      url: `/v1/contacts/${contactId}/permanent`,
      headers: writerHeaders,
      payload: { expectedRevision: 1 },
    })
    const wrongOwner = await app.inject({
      method: "DELETE",
      url: `/v1/contacts/${contactId}/permanent`,
      headers: { "x-shadow-account-id": "account-viewer" },
      payload: { expectedRevision: 1, confirmation: "permanent-delete" },
    })
    const stale = await app.inject({
      method: "DELETE",
      url: `/v1/contacts/${contactId}/permanent`,
      headers: writerHeaders,
      payload: { expectedRevision: 9, confirmation: "permanent-delete" },
    })
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/contacts/${contactId}/permanent`,
      headers: writerHeaders,
      payload: { expectedRevision: 1, confirmation: "permanent-delete" },
    })
    const recycled = await app.inject({
      method: "GET",
      url: "/v1/contacts/deleted",
      headers: writerHeaders,
    })

    expect(missingConfirmation.statusCode).toBe(400)
    expect(wrongOwner.statusCode).toBe(404)
    expect(stale.statusCode).toBe(409)
    expect(deleted.json()).toEqual({ id: contactId })
    expect(recycled.json().items).toEqual([])
  })

  it("allows team readers to browse but not create team contacts", async () => {
    const { app } = await createTestApp()
    const viewerHeaders = { "x-shadow-account-id": "account-viewer" }
    const list = await app.inject({
      method: "GET",
      url: "/v1/teams/north/contacts",
      headers: viewerHeaders,
    })
    const create = await app.inject({
      method: "POST",
      url: "/v1/teams/north/contacts",
      headers: viewerHeaders,
      payload: {
        name: "只读用户创建",
        idempotencyKey: "team-contact-viewer-1",
      },
    })
    const imported = await app.inject({
      method: "POST",
      url: "/v1/teams/north/contacts/import",
      headers: viewerHeaders,
      payload: {
        items: [{ name: "只读导入" }],
        idempotencyKey: "team-contact-viewer-import-1",
      },
    })

    expect(list.statusCode).toBe(200)
    expect(create.statusCode).toBe(403)
    expect(create.json().code).toBe("TEAM_ACCESS_DENIED")
    expect(imported.statusCode).toBe(403)
    expect(imported.json().code).toBe("TEAM_ACCESS_DENIED")
  })

  it("imports a validated team contact batch idempotently", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/teams/north/contacts/import",
      headers: writerHeaders,
      payload: {
        items: [
          { name: "  林霜  ", role: "演员" },
          { name: "沈岸", company: "北城器材" },
        ],
        idempotencyKey: "team-contact-import-1",
      },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)

    expect(first.statusCode).toBe(201)
    expect(first.json().items.map((item: TeamContact) => item.name)).toEqual([
      "林霜",
      "沈岸",
    ])
    expect(replay.json().replayed).toBe(true)
    expect(repository.teamContacts).toHaveLength(2)
  })

  it("rejects blank names and duplicate rows before importing anything", async () => {
    const { app, repository } = await createTestApp()
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/teams/north/contacts/import",
      headers: writerHeaders,
      payload: {
        items: [
          { name: "林霜", phone: "13800000000" },
          { name: " 林霜 ", phone: "13800000000 " },
        ],
        idempotencyKey: "team-contact-import-duplicate",
      },
    })
    const blank = await app.inject({
      method: "POST",
      url: "/v1/teams/north/contacts/import",
      headers: writerHeaders,
      payload: {
        items: [{ name: "   " }],
        idempotencyKey: "team-contact-import-blank",
      },
    })

    expect(duplicate.statusCode).toBe(400)
    expect(duplicate.json().code).toBe("CONTACT_IMPORT_DUPLICATE")
    expect(blank.statusCode).toBe(400)
    expect(blank.json().code).toBe("CONTACT_IMPORT_INVALID")
    expect(repository.teamContacts).toHaveLength(0)
  })

  it("enforces supplier permissions and validates contact and project relations", async () => {
    const { app } = await createTestApp()
    const viewerHeaders = { "x-shadow-account-id": "account-viewer" }
    const viewerList = await app.inject({
      method: "GET",
      url: "/v1/teams/north/suppliers",
      headers: viewerHeaders,
    })
    const viewerCreate = await app.inject({
      method: "POST",
      url: "/v1/teams/north/suppliers",
      headers: viewerHeaders,
      payload: { name: "只读创建", idempotencyKey: "supplier-viewer-1" },
    })
    const invalidContact = await app.inject({
      method: "POST",
      url: "/v1/teams/north/suppliers",
      headers: writerHeaders,
      payload: {
        name: "越界联系人供应商",
        contactRefs: [{ contactId: "missing", source: "team" }],
        idempotencyKey: "supplier-invalid-contact-1",
      },
    })
    const invalidProject = await app.inject({
      method: "POST",
      url: "/v1/teams/north/suppliers",
      headers: writerHeaders,
      payload: {
        name: "越界项目供应商",
        projectIds: ["other-project"],
        idempotencyKey: "supplier-invalid-project-1",
      },
    })

    expect(viewerList.statusCode).toBe(200)
    expect(viewerCreate.statusCode).toBe(403)
    expect(invalidContact.statusCode).toBe(400)
    expect(invalidContact.json().code).toBe("SUPPLIER_CONTACT_UNAVAILABLE")
    expect(invalidProject.statusCode).toBe(403)
    expect(invalidProject.json().code).toBe("PROJECT_ACCESS_DENIED")
  })

  it("imports suppliers idempotently and rejects invalid batches", async () => {
    const { app, repository } = await createTestApp()
    const request = {
      method: "POST" as const,
      url: "/v1/teams/north/suppliers/import",
      headers: writerHeaders,
      payload: {
        items: [
          { name: "  远景现场特效  ", category: " 服务组织 " },
          { name: "北站运营处", services: " 场地协调 " },
        ],
        idempotencyKey: "supplier-import-1",
      },
    }
    const first = await app.inject(request)
    const replay = await app.inject(request)
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/teams/north/suppliers/import",
      headers: writerHeaders,
      payload: {
        items: [{ name: "雨效" }, { name: " 雨效 " }],
        idempotencyKey: "supplier-import-duplicate",
      },
    })
    const blank = await app.inject({
      method: "POST",
      url: "/v1/teams/north/suppliers/import",
      headers: writerHeaders,
      payload: {
        items: [{ name: "   " }],
        idempotencyKey: "supplier-import-blank",
      },
    })

    expect(first.statusCode).toBe(201)
    expect(first.json().items[0]).toMatchObject({
      name: "远景现场特效",
      category: "服务组织",
    })
    expect(replay.json().replayed).toBe(true)
    expect(duplicate.json().code).toBe("SUPPLIER_IMPORT_DUPLICATE")
    expect(blank.json().code).toBe("SUPPLIER_IMPORT_INVALID")
    expect(repository.teamSuppliers).toHaveLength(2)
  })

  it("creates and updates a supplier with team contacts and projects", async () => {
    const { app } = await createTestApp()
    const contact = await app.inject({
      method: "POST",
      url: "/v1/teams/north/contacts",
      headers: writerHeaders,
      payload: { name: "赵衡", idempotencyKey: "supplier-contact-1" },
    })
    const created = await app.inject({
      method: "POST",
      url: "/v1/teams/north/suppliers",
      headers: writerHeaders,
      payload: {
        name: "远景现场特效",
        category: "服务组织",
        contactRefs: [{ contactId: contact.json().item.id, source: "team" }],
        projectIds: ["winter-coffee"],
        idempotencyKey: "supplier-create-1",
      },
    })
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/suppliers/${created.json().item.id}`,
      headers: writerHeaders,
      payload: { services: " 人工雨与雨车 ", expectedRevision: 1 },
    })
    const conflict = await app.inject({
      method: "PATCH",
      url: `/v1/teams/north/suppliers/${created.json().item.id}`,
      headers: writerHeaders,
      payload: { services: "过期修改", expectedRevision: 1 },
    })

    expect(created.statusCode).toBe(201)
    expect(updated.json()).toMatchObject({ services: "人工雨与雨车", revision: 2 })
    expect(conflict.statusCode).toBe(409)
  })
})
