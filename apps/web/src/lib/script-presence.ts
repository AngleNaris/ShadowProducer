import type { ScriptCollaborator, ScriptPresence } from "@shadowproducer/contracts"

export type RemoteScriptCursor = {
  collaboratorId: string
  displayName: string
  start: number
  end: number
}

export function remoteScriptCursors(
  presence: ScriptPresence[],
  collaborators: ScriptCollaborator[],
  currentAccountId: string,
  versionId: string,
  contentLength: number,
) {
  const collaboratorById = new Map(collaborators.map((item) => [item.id, item]))
  return presence
    .filter(
      (item) =>
        item.collaboratorId !== currentAccountId &&
        item.editing &&
        item.versionId === versionId &&
        item.cursorStart !== null &&
        item.cursorEnd !== null,
    )
    .flatMap((item): RemoteScriptCursor[] => {
      const collaborator = collaboratorById.get(item.collaboratorId)
      if (!collaborator || item.cursorStart === null || item.cursorEnd === null) return []
      return [
        {
          collaboratorId: item.collaboratorId,
          displayName: collaborator.displayName,
          start: Math.min(item.cursorStart, contentLength),
          end: Math.min(item.cursorEnd, contentLength),
        },
      ]
    })
    .sort((left, right) => left.collaboratorId.localeCompare(right.collaboratorId))
}
