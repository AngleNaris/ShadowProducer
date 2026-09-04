import type { PermissionCapability } from "@shadowproducer/contracts"

export type PermissionAccess = {
  canRead: boolean
  canWrite: boolean
  capabilities?: readonly PermissionCapability[]
}

export function accessAllows(
  access: PermissionAccess | null | undefined,
  capability: PermissionCapability,
  legacyOperation: "read" | "write",
) {
  if (!access) return false
  if (access.capabilities) return access.capabilities.includes(capability)
  return legacyOperation === "read" ? access.canRead : access.canWrite
}
