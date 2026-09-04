import { type Static, Type } from "@sinclair/typebox"

export const ContactFieldSchema = Type.Union([
  Type.Literal("name"),
  Type.Literal("role"),
  Type.Literal("company"),
  Type.Literal("phone"),
  Type.Literal("email"),
])

export const ContactParamsSchema = Type.Object({
  contactId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const ContactShareParamsSchema = Type.Object({
  contactId: Type.String({ minLength: 1, maxLength: 100 }),
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const TeamContactParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  contactId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const TeamSupplierParamsSchema = Type.Object({
  teamId: Type.String({ minLength: 1, maxLength: 100 }),
  supplierId: Type.String({ minLength: 1, maxLength: 100 }),
})

export const PersonalContactShareSchema = Type.Object({
  teamId: Type.String(),
  teamName: Type.String(),
  fields: Type.Array(ContactFieldSchema),
  allowProjectLink: Type.Boolean(),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const PersonalContactSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  role: Type.String(),
  company: Type.String(),
  phone: Type.String(),
  email: Type.String(),
  shares: Type.Array(PersonalContactShareSchema),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const DeletedPersonalContactSchema = Type.Intersect([
  PersonalContactSchema,
  Type.Object({ deletedAt: Type.String() }),
])

export const CreatePersonalContactBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  role: Type.Optional(Type.String({ maxLength: 200 })),
  company: Type.Optional(Type.String({ maxLength: 300 })),
  phone: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ maxLength: 320 })),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdatePersonalContactBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  role: Type.Optional(Type.String({ maxLength: 200 })),
  company: Type.Optional(Type.String({ maxLength: 300 })),
  phone: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ maxLength: 320 })),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const UpdateContactShareBodySchema = Type.Object({
  fields: Type.Array(ContactFieldSchema, { minItems: 1, uniqueItems: true }),
  allowProjectLink: Type.Optional(Type.Boolean()),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const TeamContactSchema = Type.Object({
  id: Type.String(),
  source: Type.Union([Type.Literal("team"), Type.Literal("member-shared")]),
  ownerName: Type.String(),
  name: Type.Union([Type.String(), Type.Null()]),
  role: Type.Union([Type.String(), Type.Null()]),
  company: Type.Union([Type.String(), Type.Null()]),
  phone: Type.Union([Type.String(), Type.Null()]),
  email: Type.Union([Type.String(), Type.Null()]),
  sharedFields: Type.Array(ContactFieldSchema),
  projectIds: Type.Array(Type.String()),
  allowProjectLink: Type.Boolean(),
  editable: Type.Boolean(),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

export const CreateTeamContactBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  role: Type.Optional(Type.String({ maxLength: 200 })),
  company: Type.Optional(Type.String({ maxLength: 300 })),
  phone: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ maxLength: 320 })),
  projectIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 100 }))),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const TeamContactImportItemSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  role: Type.Optional(Type.String({ maxLength: 200 })),
  company: Type.Optional(Type.String({ maxLength: 300 })),
  phone: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ maxLength: 320 })),
})

export const ImportTeamContactsBodySchema = Type.Object({
  items: Type.Array(TeamContactImportItemSchema, { minItems: 1, maxItems: 500 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateTeamContactBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  role: Type.Optional(Type.String({ maxLength: 200 })),
  company: Type.Optional(Type.String({ maxLength: 300 })),
  phone: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ maxLength: 320 })),
  projectIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 100 }))),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const PersonalContactListSchema = Type.Object({
  items: Type.Array(PersonalContactSchema),
})
export const DeletedPersonalContactListSchema = Type.Object({
  items: Type.Array(DeletedPersonalContactSchema),
})
export const TeamContactListSchema = Type.Object({ items: Type.Array(TeamContactSchema) })
export const PersonalContactMutationSchema = Type.Object({
  item: PersonalContactSchema,
  replayed: Type.Boolean(),
})
export const TeamContactMutationSchema = Type.Object({
  item: TeamContactSchema,
  replayed: Type.Boolean(),
})
export const TeamContactImportMutationSchema = Type.Object({
  items: Type.Array(TeamContactSchema),
  replayed: Type.Boolean(),
})

export const ContactRefSchema = Type.Object({
  contactId: Type.String({ minLength: 1, maxLength: 100 }),
  source: Type.Union([Type.Literal("team"), Type.Literal("member-shared")]),
})

export const SupplierContactRefSchema = ContactRefSchema

export const TeamSupplierSchema = Type.Object({
  id: Type.String(),
  teamId: Type.String(),
  name: Type.String(),
  category: Type.String(),
  services: Type.String(),
  phone: Type.String(),
  email: Type.String(),
  address: Type.String(),
  contactRefs: Type.Array(SupplierContactRefSchema),
  projectIds: Type.Array(Type.String()),
  revision: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(),
})

const SupplierFieldsSchema = {
  name: Type.String({ minLength: 1, maxLength: 300 }),
  category: Type.Optional(Type.String({ maxLength: 120 })),
  services: Type.Optional(Type.String({ maxLength: 1_000 })),
  phone: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ maxLength: 320 })),
  address: Type.Optional(Type.String({ maxLength: 500 })),
}

export const CreateTeamSupplierBodySchema = Type.Object({
  ...SupplierFieldsSchema,
  contactRefs: Type.Optional(Type.Array(SupplierContactRefSchema, { maxItems: 100 })),
  projectIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 }),
  ),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const TeamSupplierImportItemSchema = Type.Object(SupplierFieldsSchema)

export const ImportTeamSuppliersBodySchema = Type.Object({
  items: Type.Array(TeamSupplierImportItemSchema, { minItems: 1, maxItems: 500 }),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 100 }),
})

export const UpdateTeamSupplierBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  category: Type.Optional(Type.String({ maxLength: 120 })),
  services: Type.Optional(Type.String({ maxLength: 1_000 })),
  phone: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ maxLength: 320 })),
  address: Type.Optional(Type.String({ maxLength: 500 })),
  contactRefs: Type.Optional(Type.Array(SupplierContactRefSchema, { maxItems: 100 })),
  projectIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 }),
  ),
  expectedRevision: Type.Integer({ minimum: 1 }),
})

export const TeamSupplierListSchema = Type.Object({
  items: Type.Array(TeamSupplierSchema),
})
export const TeamSupplierMutationSchema = Type.Object({
  item: TeamSupplierSchema,
  replayed: Type.Boolean(),
})
export const TeamSupplierImportMutationSchema = Type.Object({
  items: Type.Array(TeamSupplierSchema),
  replayed: Type.Boolean(),
})

export type ContactField = Static<typeof ContactFieldSchema>
export type ContactParams = Static<typeof ContactParamsSchema>
export type ContactShareParams = Static<typeof ContactShareParamsSchema>
export type TeamContactParams = Static<typeof TeamContactParamsSchema>
export type TeamSupplierParams = Static<typeof TeamSupplierParamsSchema>
export type PersonalContactShare = Static<typeof PersonalContactShareSchema>
export type PersonalContact = Static<typeof PersonalContactSchema>
export type DeletedPersonalContact = Static<typeof DeletedPersonalContactSchema>
export type CreatePersonalContactBody = Static<typeof CreatePersonalContactBodySchema>
export type UpdatePersonalContactBody = Static<typeof UpdatePersonalContactBodySchema>
export type UpdateContactShareBody = Static<typeof UpdateContactShareBodySchema>
export type TeamContact = Static<typeof TeamContactSchema>
export type CreateTeamContactBody = Static<typeof CreateTeamContactBodySchema>
export type TeamContactImportItem = Static<typeof TeamContactImportItemSchema>
export type ImportTeamContactsBody = Static<typeof ImportTeamContactsBodySchema>
export type UpdateTeamContactBody = Static<typeof UpdateTeamContactBodySchema>
export type TeamContactImportMutation = Static<typeof TeamContactImportMutationSchema>
export type ContactRef = Static<typeof ContactRefSchema>
export type SupplierContactRef = ContactRef
export type TeamSupplier = Static<typeof TeamSupplierSchema>
export type CreateTeamSupplierBody = Static<typeof CreateTeamSupplierBodySchema>
export type TeamSupplierImportItem = Static<typeof TeamSupplierImportItemSchema>
export type ImportTeamSuppliersBody = Static<typeof ImportTeamSuppliersBodySchema>
export type UpdateTeamSupplierBody = Static<typeof UpdateTeamSupplierBodySchema>
export type TeamSupplierImportMutation = Static<typeof TeamSupplierImportMutationSchema>
