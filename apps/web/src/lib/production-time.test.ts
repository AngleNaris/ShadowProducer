import assert from "node:assert/strict"
import test from "node:test"

import {
  formatTimeZoneOffset,
  toLocalInput,
  zonedLocalCandidates,
  zonedLocalToIso,
} from "./production-time.ts"

test("converts ordinary zoned local times to a stable UTC instant", () => {
  const iso = zonedLocalToIso("2026-08-19T16:30", "Asia/Shanghai")
  assert.equal(iso, "2026-08-19T08:30:00.000Z")
  assert.equal(toLocalInput(iso, "Asia/Shanghai"), "2026-08-19T16:30")
  assert.equal(formatTimeZoneOffset("Asia/Shanghai", iso), "UTC+08:00")
})

test("rejects nonexistent spring-forward local times", () => {
  assert.throws(() => zonedLocalToIso("2026-03-08T02:30", "America/New_York"), /不存在/)
})

test("requires an explicit choice for repeated fall-back local times", () => {
  const candidates = zonedLocalCandidates("2026-11-01T01:30", "America/New_York")
  assert.deepEqual(candidates, ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"])
  assert.throws(
    () => zonedLocalToIso("2026-11-01T01:30", "America/New_York"),
    /第一次或第二次/,
  )
  assert.equal(
    zonedLocalToIso("2026-11-01T01:30", "America/New_York", "earlier"),
    candidates[0],
  )
  assert.equal(
    zonedLocalToIso("2026-11-01T01:30", "America/New_York", "later"),
    candidates[1],
  )
})
