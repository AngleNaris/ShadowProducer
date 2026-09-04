import type {
  CreatePersonalContactBody,
  CreateTeamContactBody,
  CreateTeamSupplierBody,
  DeletedPersonalContact,
  ImportTeamContactsBody,
  ImportTeamSuppliersBody,
  PermanentlyDeleteRecycleItemBody,
  PersonalContact,
  TeamContact,
  TeamContactImportMutation,
  TeamSupplier,
  TeamSupplierImportMutation,
  UpdateContactShareBody,
  UpdatePersonalContactBody,
  UpdateTeamContactBody,
  UpdateTeamSupplierBody,
} from "@shadowproducer/contracts"
import { accessAllows } from "./access"
import { AppError } from "./script-service"
import type {
  CreateResult,
  TeamAccess,
  UpdateResult,
  WorkspaceProjectAccess,
} from "./workspace-service"

export type CreatePersonalContactCommand = { actorId: string } & CreatePersonalContactBody
export type UpdatePersonalContactCommand = {
  actorId: string
  contactId: string
} & UpdatePersonalContactBody
export type DeletePersonalContactCommand = {
  actorId: string
  contactId: string
  expectedRevision: number
}
export type RestorePersonalContactCommand = DeletePersonalContactCommand
export type PermanentlyDeletePersonalContactCommand = {
  actorId: string
  contactId: string
} & PermanentlyDeleteRecycleItemBody
export type UpdateContactShareCommand = {
  actorId: string
  contactId: string
  teamId: string
} & UpdateContactShareBody
export type DeleteContactShareCommand = {
  actorId: string
  contactId: string
  teamId: string
  expectedRevision: number
}
export type CreateTeamContactCommand = {
  actorId: string
  teamId: string
} & CreateTeamContactBody
export type ImportTeamContactsCommand = {
  actorId: string
  teamId: string
} & ImportTeamContactsBody
export type UpdateTeamContactCommand = {
  actorId: string
  teamId: string
  contactId: string
} & UpdateTeamContactBody
export type DeleteTeamContactCommand = {
  actorId: string
  teamId: string
  contactId: string
  expectedRevision: number
}
export type CreateTeamSupplierCommand = {
  actorId: string
  teamId: string
} & CreateTeamSupplierBody
export type ImportTeamSuppliersCommand = {
  actorId: string
  teamId: string
} & ImportTeamSuppliersBody
export type UpdateTeamSupplierCommand = {
  actorId: string
  teamId: string
  supplierId: string
} & UpdateTeamSupplierBody
export type DeleteTeamSupplierCommand = {
  actorId: string
  teamId: string
  supplierId: string
  expectedRevision: number
}

export interface ContactRepository {
  getTeamAccess(actorId: string, teamId: string): Promise<TeamAccess | null>
  getProjectAccess(
    actorId: string,
    teamId: string,
    projectId: string,
  ): Promise<WorkspaceProjectAccess | null>
  listPersonalContacts(actorId: string): Promise<PersonalContact[]>
  listDeletedPersonalContacts(actorId: string): Promise<DeletedPersonalContact[]>
  createPersonalContact(
    command: CreatePersonalContactCommand,
  ): Promise<CreateResult<PersonalContact>>
  updatePersonalContact(
    command: UpdatePersonalContactCommand,
  ): Promise<UpdateResult<PersonalContact>>
  deletePersonalContact(
    command: DeletePersonalContactCommand,
  ): Promise<UpdateResult<{ id: string }>>
  restorePersonalContact(
    command: RestorePersonalContactCommand,
  ): Promise<UpdateResult<PersonalContact>>
  permanentlyDeletePersonalContact(
    command: PermanentlyDeletePersonalContactCommand,
  ): Promise<UpdateResult<{ id: string }>>
  setContactShare(
    command: UpdateContactShareCommand,
  ): Promise<UpdateResult<PersonalContact>>
  deleteContactShare(
    command: DeleteContactShareCommand,
  ): Promise<UpdateResult<PersonalContact>>
  listTeamContacts(actorId: string, teamId: string): Promise<TeamContact[]>
  createTeamContact(command: CreateTeamContactCommand): Promise<CreateResult<TeamContact>>
  importTeamContacts(
    command: ImportTeamContactsCommand,
  ): Promise<TeamContactImportMutation>
  updateTeamContact(command: UpdateTeamContactCommand): Promise<UpdateResult<TeamContact>>
  deleteTeamContact(
    command: DeleteTeamContactCommand,
  ): Promise<UpdateResult<{ id: string }>>
  listTeamSuppliers(teamId: string): Promise<TeamSupplier[]>
  createTeamSupplier(
    command: CreateTeamSupplierCommand,
  ): Promise<CreateResult<TeamSupplier>>
  importTeamSuppliers(
    command: ImportTeamSuppliersCommand,
  ): Promise<TeamSupplierImportMutation>
  updateTeamSupplier(
    command: UpdateTeamSupplierCommand,
  ): Promise<UpdateResult<TeamSupplier>>
  deleteTeamSupplier(
    command: DeleteTeamSupplierCommand,
  ): Promise<UpdateResult<{ id: string }>>
}

export class ContactService {
  constructor(private readonly repository: ContactRepository) {}

  async listPersonalContacts(actorId: string) {
    return { items: await this.repository.listPersonalContacts(actorId) }
  }

  async listDeletedPersonalContacts(actorId: string) {
    return { items: await this.repository.listDeletedPersonalContacts(actorId) }
  }

  createPersonalContact(command: CreatePersonalContactCommand) {
    return this.repository.createPersonalContact(command)
  }

  async updatePersonalContact(command: UpdatePersonalContactCommand) {
    return this.unwrap(await this.repository.updatePersonalContact(command), "联系人")
  }

  async deletePersonalContact(command: DeletePersonalContactCommand) {
    return this.unwrap(await this.repository.deletePersonalContact(command), "联系人")
  }

  async restorePersonalContact(command: RestorePersonalContactCommand) {
    return this.unwrap(await this.repository.restorePersonalContact(command), "联系人")
  }

  async permanentlyDeletePersonalContact(
    command: PermanentlyDeletePersonalContactCommand,
  ) {
    return this.unwrap(
      await this.repository.permanentlyDeletePersonalContact(command),
      "联系人",
    )
  }

  async setContactShare(command: UpdateContactShareCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "read")
    return this.unwrap(await this.repository.setContactShare(command), "联系人")
  }

  async deleteContactShare(command: DeleteContactShareCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "read")
    return this.unwrap(await this.repository.deleteContactShare(command), "联系人")
  }

  async listTeamContacts(actorId: string, teamId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    return { items: await this.repository.listTeamContacts(actorId, teamId) }
  }

  async createTeamContact(command: CreateTeamContactCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    await this.assertProjects(command.actorId, command.teamId, command.projectIds ?? [])
    return this.repository.createTeamContact(command)
  }

  async importTeamContacts(command: ImportTeamContactsCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    const seen = new Set<string>()
    const items = command.items.map((item, index) => {
      const normalized = {
        name: item.name.trim(),
        role: item.role?.trim() ?? "",
        company: item.company?.trim() ?? "",
        phone: item.phone?.trim() ?? "",
        email: item.email?.trim() ?? "",
      }
      if (!normalized.name) {
        throw new AppError(
          "CONTACT_IMPORT_INVALID",
          `第 ${index + 1} 行联系人姓名不能为空`,
          400,
        )
      }
      const key = JSON.stringify(Object.values(normalized))
      if (seen.has(key)) {
        throw new AppError(
          "CONTACT_IMPORT_DUPLICATE",
          `第 ${index + 1} 行与文件内其他联系人完全重复`,
          400,
        )
      }
      seen.add(key)
      return normalized
    })
    return this.repository.importTeamContacts({ ...command, items })
  }

  async updateTeamContact(command: UpdateTeamContactCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    await this.assertProjects(command.actorId, command.teamId, command.projectIds ?? [])
    return this.unwrap(await this.repository.updateTeamContact(command), "团队联系人")
  }

  async deleteTeamContact(command: DeleteTeamContactCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.unwrap(await this.repository.deleteTeamContact(command), "团队联系人")
  }

  async listTeamSuppliers(actorId: string, teamId: string) {
    await this.assertTeamAccess(actorId, teamId, "read")
    return { items: await this.repository.listTeamSuppliers(teamId) }
  }

  async createTeamSupplier(command: CreateTeamSupplierCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    await this.assertProjects(command.actorId, command.teamId, command.projectIds ?? [])
    const contactRefs = await this.assertContactRefs(
      command.actorId,
      command.teamId,
      command.contactRefs ?? [],
    )
    return this.repository.createTeamSupplier({
      ...command,
      ...this.normalizeSupplier(command),
      contactRefs,
    })
  }

  async importTeamSuppliers(command: ImportTeamSuppliersCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    const seen = new Set<string>()
    const items = command.items.map((item, index) => {
      const name = item.name.trim()
      if (!name) {
        throw new AppError(
          "SUPPLIER_IMPORT_INVALID",
          `第 ${index + 1} 行供应商名称不能为空`,
          400,
        )
      }
      const normalized = { ...this.normalizeSupplier(item), name }
      const key = JSON.stringify(Object.values(normalized))
      if (seen.has(key)) {
        throw new AppError(
          "SUPPLIER_IMPORT_DUPLICATE",
          `第 ${index + 1} 行与文件内其他供应商完全重复`,
          400,
        )
      }
      seen.add(key)
      return normalized
    })
    return this.repository.importTeamSuppliers({ ...command, items })
  }

  async updateTeamSupplier(command: UpdateTeamSupplierCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    await this.assertProjects(command.actorId, command.teamId, command.projectIds ?? [])
    const contactRefs =
      command.contactRefs === undefined
        ? undefined
        : await this.assertContactRefs(
            command.actorId,
            command.teamId,
            command.contactRefs,
          )
    const normalized = this.normalizeSupplier(command, true)
    return this.unwrap(
      await this.repository.updateTeamSupplier({
        ...command,
        ...normalized,
        ...(contactRefs === undefined ? {} : { contactRefs }),
      }),
      "供应商",
    )
  }

  async deleteTeamSupplier(command: DeleteTeamSupplierCommand) {
    await this.assertTeamAccess(command.actorId, command.teamId, "write")
    return this.unwrap(await this.repository.deleteTeamSupplier(command), "供应商")
  }

  private async assertTeamAccess(
    actorId: string,
    teamId: string,
    operation: "read" | "write",
  ) {
    const access = await this.repository.getTeamAccess(actorId, teamId)
    const allowed = accessAllows(
      access,
      operation === "read" ? "team.read" : "team.write",
      operation,
    )
    if (!access || !allowed) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权访问当前团队", 403)
    }
  }

  private async assertProjects(actorId: string, teamId: string, projectIds: string[]) {
    for (const projectId of projectIds) {
      const access = await this.repository.getProjectAccess(actorId, teamId, projectId)
      if (!access?.canRead) {
        throw new AppError("PROJECT_ACCESS_DENIED", "无权关联所选项目", 403)
      }
    }
  }

  private async assertContactRefs(
    actorId: string,
    teamId: string,
    contactRefs: { contactId: string; source: "team" | "member-shared" }[],
  ) {
    const unique = new Map(
      contactRefs.map((contact) => [`${contact.source}:${contact.contactId}`, contact]),
    )
    if (unique.size !== contactRefs.length) {
      throw new AppError("SUPPLIER_CONTACT_DUPLICATE", "不能重复关联同一联系人", 400)
    }
    const visible = await this.repository.listTeamContacts(actorId, teamId)
    const allowed = new Set(visible.map((contact) => `${contact.source}:${contact.id}`))
    for (const key of unique.keys()) {
      if (!allowed.has(key)) {
        throw new AppError(
          "SUPPLIER_CONTACT_UNAVAILABLE",
          "所选联系人不存在、未共享或不属于当前团队",
          400,
        )
      }
    }
    return [...unique.values()]
  }

  private normalizeSupplier(
    value: {
      name?: string
      category?: string
      services?: string
      phone?: string
      email?: string
      address?: string
    },
    partial = false,
  ) {
    const normalized = {
      ...(value.name === undefined ? {} : { name: value.name.trim() }),
      ...(value.category === undefined
        ? partial
          ? {}
          : { category: "服务组织" }
        : { category: value.category.trim() || "服务组织" }),
      ...(value.services === undefined ? {} : { services: value.services.trim() }),
      ...(value.phone === undefined ? {} : { phone: value.phone.trim() }),
      ...(value.email === undefined ? {} : { email: value.email.trim() }),
      ...(value.address === undefined ? {} : { address: value.address.trim() }),
    }
    if ("name" in normalized && !normalized.name) {
      throw new AppError("SUPPLIER_NAME_REQUIRED", "供应商名称不能为空", 400)
    }
    return normalized
  }

  private unwrap<T>(result: UpdateResult<T>, label: string) {
    if (result.kind === "not_found") {
      throw new AppError("RESOURCE_NOT_FOUND", `${label}不存在或已被删除`, 404)
    }
    if (result.kind === "conflict") {
      throw new AppError(
        "RESOURCE_CONFLICT",
        `${label}已在其他位置更新，请重新载入后再试`,
        409,
      )
    }
    return result.item
  }
}
