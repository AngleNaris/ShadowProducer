import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { TeamContact } from "@shadowproducer/contracts"

import {
  ContactCsvError,
  exportTeamContactsCsv,
  parseTeamContactCsv,
} from "./contact-csv.ts"

describe("team contact CSV", () => {
  it("parses BOM, aliases, CRLF, commas and escaped quotes", () => {
    const contacts = parseTeamContactCsv(
      '\uFEFFName,Type,Company,Phone,Email\r\n"林,霜",演员,"北城""影业",13800000000,lin@example.com\r\n',
    )

    assert.deepEqual(contacts, [
      {
        name: "林,霜",
        role: "演员",
        company: '北城"影业',
        phone: "13800000000",
        email: "lin@example.com",
      },
    ])
  })

  it("rejects duplicate rows before they can be imported", () => {
    assert.throws(
      () => parseTeamContactCsv("姓名,电话\n林霜,13800000000\n 林霜 , 13800000000 "),
      (error) => error instanceof ContactCsvError && error.message.includes("完全重复"),
    )
  })

  it("exports only team-owned contacts and remains importable", () => {
    const base = {
      ownerName: "北岸影像",
      role: "演员",
      company: "北城,影业",
      phone: "13800000000",
      email: "lin@example.com",
      sharedFields: ["name", "role", "company", "phone", "email"],
      projectIds: [],
      allowProjectLink: true,
      revision: 1,
      updatedAt: "2026-08-30T12:00:00.000Z",
    } satisfies Omit<TeamContact, "id" | "source" | "name" | "editable">
    const csv = exportTeamContactsCsv([
      { ...base, id: "team-1", source: "team", name: "林霜", editable: true },
      {
        ...base,
        id: "shared-1",
        source: "member-shared",
        name: "私人联系人",
        editable: false,
      },
    ])

    assert.ok(csv.startsWith("\uFEFF姓名,职务/类型,公司,电话,邮箱\r\n"))
    assert.equal(csv.includes("私人联系人"), false)
    assert.deepEqual(
      parseTeamContactCsv(csv).map(({ name }) => name),
      ["林霜"],
    )
  })
})
