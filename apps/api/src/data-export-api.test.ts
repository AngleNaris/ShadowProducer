import {
  type DataExportRepository,
  DataExportService,
  type ScriptService,
} from "@shadowproducer/application"
import type { TeamDataExport } from "@shadowproducer/contracts"
import { afterEach, describe, expect, it } from "vitest"

import { buildApp } from "./app"

function snapshot(): TeamDataExport {
  return {
    format: "shadowproducer-business-data",
    version: 1,
    generatedAt: "2026-09-01T08:00:00.000Z",
    scope: {
      teamId: "north",
      teamName: "北岸影像",
      projectIds: ["winter-coffee"],
    },
    manifest: {
      sections: [{ name: "projects", count: 1 }],
      exclusions: ["认证凭据"],
    },
    data: { projects: [{ id: "winter-coffee", name: "冬夜咖啡" }] },
  }
}

class MemoryDataExportRepository implements DataExportRepository {
  allowed = true
  exportCalls = 0
  failure: Error | null = null

  async createTeamDataExport() {
    this.exportCalls += 1
    if (this.failure) throw this.failure
    return this.allowed ? snapshot() : null
  }
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

async function createApp(repository: MemoryDataExportRepository) {
  const app = await buildApp({
    scriptService: {} as ScriptService,
    dataExportService: new DataExportService(repository),
    logger: false,
  })
  apps.push(app)
  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe("team business-data export API", () => {
  it("downloads the complete JSON snapshot with no-store headers", async () => {
    const repository = new MemoryDataExportRepository()
    const response = await (await createApp(repository)).inject({
      method: "GET",
      url: "/v1/teams/north/data-export",
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("application/json")
    expect(response.headers["cache-control"]).toBe("no-store")
    expect(response.headers["content-disposition"]).toContain("attachment")
    expect(response.json()).toEqual(snapshot())
    expect(repository.exportCalls).toBe(1)
  })

  it("rejects an actor when the repository cannot create an authorized snapshot", async () => {
    const repository = new MemoryDataExportRepository()
    repository.allowed = false
    const response = await (await createApp(repository)).inject({
      method: "GET",
      url: "/v1/teams/north/data-export",
      headers: { "x-shadow-account-id": "account-outsider" },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: "TEAM_ACCESS_DENIED" })
    expect(response.headers["content-disposition"]).toBeUndefined()
    expect(repository.exportCalls).toBe(1)
  })

  it("returns a regular JSON error instead of a partial download", async () => {
    const repository = new MemoryDataExportRepository()
    repository.failure = new Error("snapshot failed")
    const response = await (await createApp(repository)).inject({
      method: "GET",
      url: "/v1/teams/north/data-export",
      headers: { "x-shadow-account-id": "account-fanxing" },
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ code: "INTERNAL_ERROR", retryable: true })
    expect(response.headers["content-disposition"]).toBeUndefined()
  })
})
