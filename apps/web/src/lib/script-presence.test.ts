import assert from "node:assert/strict"
import test from "node:test"

import { remoteScriptCursors } from "./script-presence.ts"

test("returns only current-version remote editors and clamps stale offsets", () => {
  const result = remoteScriptCursors(
    [
      {
        collaboratorId: "me",
        versionId: "v7",
        cursorStart: 1,
        cursorEnd: 1,
        editing: true,
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
      {
        collaboratorId: "remote",
        versionId: "v7",
        cursorStart: 3,
        cursorEnd: 99,
        editing: true,
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
      {
        collaboratorId: "other-version",
        versionId: "v6",
        cursorStart: 0,
        cursorEnd: 0,
        editing: true,
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
    ],
    [
      { id: "me", displayName: "繁星", initials: "FX", role: "制片" },
      { id: "remote", displayName: "林乔", initials: "LQ", role: "导演" },
      { id: "other-version", displayName: "周弥", initials: "ZM", role: "摄影" },
    ],
    "me",
    "v7",
    8,
  )

  assert.deepEqual(result, [
    {
      collaboratorId: "remote",
      displayName: "林乔",
      start: 3,
      end: 8,
    },
  ])
})
