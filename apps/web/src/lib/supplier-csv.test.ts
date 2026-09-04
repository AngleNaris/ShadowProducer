import assert from "node:assert/strict"
import test from "node:test"

import type { TeamSupplier } from "@shadowproducer/contracts"

import {
  exportTeamSuppliersCsv,
  parseTeamSupplierCsv,
  SupplierCsvError,
} from "./supplier-csv.ts"

test("parses supplier CSV aliases, BOM, CRLF, commas and escaped quotes", () => {
  const items = parseTeamSupplierCsv(
    '\uFEFFname,type,services,phone,email,address\r\n"远景,现场特效",服务组织,"雨车与""人工雨""",021,dispatch@example.com,松江\r\n',
  )
  assert.deepEqual(items, [
    {
      name: "远景,现场特效",
      category: "服务组织",
      services: '雨车与"人工雨"',
      phone: "021",
      email: "dispatch@example.com",
      address: "松江",
    },
  ])
})

test("rejects duplicate supplier rows after trimming", () => {
  assert.throws(
    () => parseTeamSupplierCsv("供应商名称,电话\n远景雨效,021\n 远景雨效 , 021 \n"),
    SupplierCsvError,
  )
})

test("exports suppliers as an importable UTF-8 CSV", () => {
  const supplier: TeamSupplier = {
    id: "supplier-1",
    teamId: "north",
    name: "远景现场特效",
    category: "服务组织",
    services: "人工雨, 雨车",
    phone: "021 6820 1138",
    email: "dispatch@example.com",
    address: "松江影视路 18 号",
    contactRefs: [{ contactId: "contact-1", source: "team" }],
    projectIds: ["winter-coffee"],
    revision: 1,
    updatedAt: "2026-08-30T00:00:00.000Z",
  }
  const csv = exportTeamSuppliersCsv([supplier])
  assert.ok(csv.startsWith("\uFEFF"))
  assert.deepEqual(parseTeamSupplierCsv(csv), [
    {
      name: supplier.name,
      category: supplier.category,
      services: supplier.services,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
    },
  ])
})
