import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createScriptMergePlan, resolveScriptMergePlan } from "./script-merge.ts"

describe("script three-way merge", () => {
  it("automatically combines edits on different lines", () => {
    const plan = createScriptMergePlan(
      "one\ntwo\nthree",
      "ONE\ntwo\nthree",
      "one\ntwo\nTHREE",
    )

    assert.equal(plan.filter((segment) => segment.kind === "conflict").length, 0)
    assert.equal(resolveScriptMergePlan(plan), "ONE\ntwo\nTHREE")
  })

  it("marks different edits to the same line as a conflict", () => {
    const plan = createScriptMergePlan("one\ntwo", "one\nlocal", "one\nserver")
    const conflict = plan.find((segment) => segment.kind === "conflict")

    assert.ok(conflict?.kind === "conflict")
    assert.equal(resolveScriptMergePlan(plan), "one\nlocal")
    assert.equal(resolveScriptMergePlan(plan, { [conflict.id]: "server" }), "one\nserver")
  })

  it("keeps an adjacent server edit outside the conflict", () => {
    const plan = createScriptMergePlan(
      "one\ntwo\nthree",
      "local\ntwo\nthree",
      "server\nSERVER TWO\nthree",
    )
    const conflict = plan.find((segment) => segment.kind === "conflict")

    assert.ok(conflict?.kind === "conflict")
    assert.deepEqual(conflict.serverLines, ["server"])
    assert.equal(resolveScriptMergePlan(plan), "local\nSERVER TWO\nthree")
  })

  it("accepts the same edit from both collaborators once", () => {
    const plan = createScriptMergePlan("one\ntwo", "one\nshared", "one\nshared")

    assert.equal(plan.filter((segment) => segment.kind === "conflict").length, 0)
    assert.equal(resolveScriptMergePlan(plan), "one\nshared")
  })

  it("preserves non-overlapping insertions", () => {
    const plan = createScriptMergePlan("one\ntwo", "before\none\ntwo", "one\ntwo\nafter")

    assert.equal(plan.filter((segment) => segment.kind === "conflict").length, 0)
    assert.equal(resolveScriptMergePlan(plan), "before\none\ntwo\nafter")
  })
})
