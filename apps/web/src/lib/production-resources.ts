import type { ExecutionResource, ExecutionResourceType } from "@shadowproducer/contracts"

const resourceTypes: ExecutionResourceType[] = ["cast", "crew", "location", "equipment"]

function normalizedName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase()
}

export function executionResourcesFromNames(
  names: Record<ExecutionResourceType, string>,
  existing: ExecutionResource[] = [],
) {
  return resourceTypes.flatMap((type) =>
    names[type]
      .split(/[、，,]/)
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({
        id:
          existing.find(
            (resource) =>
              resource.type === type &&
              normalizedName(resource.name) === normalizedName(name),
          )?.id ?? normalizedName(name).replace(/\s+/g, "-"),
        type,
        name,
      })),
  )
}
