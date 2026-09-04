import { describe, expect, it, vi } from "vitest"

import {
  authAllowSignUpFromEnvironment,
  createAuthGateway,
  createShadowAuth,
  provisionAuthUserAccount,
} from "./auth"

const localAuthSecret = "shadowproducer-local-auth-secret-change-before-production"
const localBaseURL = "http://127.0.0.1:3211"

function createPoolMock() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 })
  return { pool: { connect: vi.fn(), query } as never, query }
}

function createGateway({
  session,
  account,
}: {
  session: { user: { email: string } } | null
  account?: { id: string }
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
      baseURL: localBaseURL,
    }),
    query,
  }
}

describe("sign-up onboarding", () => {
  it("gates email and password sign-up behind AUTH_ALLOW_SIGN_UP", () => {
    expect(authAllowSignUpFromEnvironment("development", undefined)).toBe(true)
    expect(authAllowSignUpFromEnvironment("test", "true")).toBe(true)
    expect(authAllowSignUpFromEnvironment("development", "false")).toBe(false)
    expect(authAllowSignUpFromEnvironment("production", undefined)).toBe(false)
    expect(authAllowSignUpFromEnvironment("production", "false")).toBe(false)
    expect(authAllowSignUpFromEnvironment("production", "true")).toBe(true)
  })

  it("keeps createShadowAuth sign-up opt-out as the default and honors the governed flag", () => {
    const { pool } = createPoolMock()
    const defaultAuth = createShadowAuth({
      pool,
      baseURL: localBaseURL,
      secret: localAuthSecret,
    })
    expect(defaultAuth.options.emailAndPassword?.disableSignUp).toBe(true)

    const openAuth = createShadowAuth({
      pool,
      baseURL: localBaseURL,
      secret: localAuthSecret,
      disableSignUp: false,
    })
    expect(openAuth.options.emailAndPassword?.disableSignUp).toBe(false)
  })

  it("provisions a normalized domain account after Better Auth creates a user", async () => {
    const { pool, query } = createPoolMock()
    const auth = createShadowAuth({
      pool,
      baseURL: localBaseURL,
      secret: localAuthSecret,
    })

    const hook = auth.options.databaseHooks?.user?.create?.after
    expect(hook).toBeTypeOf("function")
    await hook?.({
      id: "auth-user-1",
      name: "范星",
      email: "FanXing@ShadowProducer.Local",
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(query).toHaveBeenCalledTimes(1)
    const [statement, values] = query.mock.calls[0]
    expect(statement).toContain("ON CONFLICT (email) WHERE email IS NOT NULL")
    expect(statement).toContain("DO UPDATE SET display_name = EXCLUDED.display_name")
    expect(values).toEqual(["auth-user-1", "范星", "fanxing@shadowproducer.local"])
  })

  it("re-provisions the same account idempotently with trimmed values", async () => {
    const { pool, query } = createPoolMock()
    const user = {
      id: "auth-user-1",
      name: "  范 星  ",
      email: "  FanXing@Example.COM ",
    }

    await provisionAuthUserAccount(pool, user)
    await provisionAuthUserAccount(pool, user)

    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0][1]).toEqual([
      "auth-user-1",
      "范 星",
      "fanxing@example.com",
    ])
    expect(query.mock.calls[1]).toEqual(query.mock.calls[0])
  })

  it("skips provisioning when the auth user has no usable email", async () => {
    const { pool, query } = createPoolMock()

    await provisionAuthUserAccount(pool, {
      id: "auth-user-1",
      name: "范星",
      email: "   ",
    })

    expect(query).not.toHaveBeenCalled()
  })

  it("still rejects authenticated users whose domain account is missing", async () => {
    const { gateway } = createGateway({
      session: { user: { email: "stranger@example.com" } },
    })

    await expect(gateway.resolveActorId({})).rejects.toMatchObject({
      code: "ACCOUNT_NOT_PROVISIONED",
      statusCode: 403,
    })
  })

  it("maps a provisioned account email to the actor id after onboarding", async () => {
    const { gateway, query } = createGateway({
      session: { user: { email: "fanxing@shadowproducer.local" } },
      account: { id: "account-fanxing" },
    })

    await expect(gateway.resolveActorId({})).resolves.toBe("account-fanxing")
    expect(query.where).toHaveBeenCalledWith("email", "=", "fanxing@shadowproducer.local")
  })
})
