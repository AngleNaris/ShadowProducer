import { describe, expect, it, vi } from "vitest"

import {
  allowDevHeaderFromEnvironment,
  authTrustedOriginsFromEnvironment,
  createAuthGateway,
} from "./auth"

function createGateway({
  session,
  account,
  allowDevHeader = false,
}: {
  session: { user: { email: string } } | null
  account?: { id: string }
  allowDevHeader?: boolean
}) {
  const executeTakeFirst = vi.fn().mockResolvedValue(account)
  const query = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst,
  }
  const database = { selectFrom: vi.fn(() => query) }
  const auth = {
    api: { getSession: vi.fn().mockResolvedValue(session) },
    handler: vi.fn(),
  }

  return {
    gateway: createAuthGateway({
      auth: auth as never,
      database: database as never,
      baseURL: "http://127.0.0.1:3211",
      allowDevHeader,
    }),
    query,
  }
}

describe("authentication gateway", () => {
  it("keeps configured browser origins explicit and unique", () => {
    expect(
      authTrustedOriginsFromEnvironment(
        "https://api.shadowproducer.example",
        " https://app.shadowproducer.example,https://api.shadowproducer.example ",
      ),
    ).toEqual([
      "https://api.shadowproducer.example",
      "https://app.shadowproducer.example",
    ])
  })

  it("never enables the development identity header in production", () => {
    expect(allowDevHeaderFromEnvironment("production", "true")).toBe(false)
    expect(allowDevHeaderFromEnvironment("development", "true")).toBe(true)
  })

  it("maps the session email to the domain account and ignores a spoofed header", async () => {
    const { gateway, query } = createGateway({
      session: { user: { email: "FANXING@SHADOWPRODUCER.LOCAL" } },
      account: { id: "account-fanxing" },
    })

    await expect(
      gateway.resolveActorId({ "x-shadow-account-id": "account-outsider" }),
    ).resolves.toBe("account-fanxing")
    expect(query.where).toHaveBeenCalledWith("email", "=", "fanxing@shadowproducer.local")
  })

  it("rejects requests without a session", async () => {
    const { gateway } = createGateway({ session: null })

    await expect(gateway.resolveActorId({})).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      statusCode: 401,
    })
  })

  it("rejects authenticated users without a provisioned domain account", async () => {
    const { gateway } = createGateway({
      session: { user: { email: "unknown@example.com" } },
    })

    await expect(gateway.resolveActorId({})).rejects.toMatchObject({
      code: "ACCOUNT_NOT_PROVISIONED",
      statusCode: 403,
    })
  })

  it("accepts the development header only when explicitly enabled", async () => {
    const { gateway } = createGateway({ session: null, allowDevHeader: true })

    await expect(
      gateway.resolveActorId({ "x-shadow-account-id": "account-fanxing" }),
    ).resolves.toBe("account-fanxing")
  })
})
