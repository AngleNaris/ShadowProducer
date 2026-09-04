import type { IncomingHttpHeaders } from "node:http"
import { AppError } from "@shadowproducer/application"
import { betterAuth } from "better-auth"
import { fromNodeHeaders } from "better-auth/node"
import type { FastifyRequest } from "fastify"
import type { Kysely } from "kysely"
import type { Pool } from "pg"

import type { Database } from "./database"

const localAuthSecret = "shadowproducer-local-auth-secret-change-before-production"

export type AuthGateway = {
  handle(request: FastifyRequest): Promise<Response>
  resolveActorId(headers: IncomingHttpHeaders): Promise<string>
}

type CreateShadowAuthOptions = {
  pool: Pool
  baseURL: string
  secret: string
  trustedOrigins?: string[]
  disableSignUp?: boolean
  autoSignIn?: boolean
}

type AuthUserSnapshot = {
  id: string
  name?: string | null
  email?: string | null
}

export function authBaseURLFromEnvironment() {
  return process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3211"
}

export function authSecretFromEnvironment() {
  const secret =
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : localAuthSecret)
  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters")
  }
  return secret
}

export function authTrustedOriginsFromEnvironment(
  baseURL: string,
  configuredOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS,
) {
  return [
    ...new Set(
      [baseURL, ...(configuredOrigins ?? "").split(",")]
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ]
}

export function allowDevHeaderFromEnvironment(
  nodeEnvironment = process.env.NODE_ENV,
  configuredValue = process.env.AUTH_ALLOW_DEV_HEADER,
) {
  return nodeEnvironment !== "production" && configuredValue === "true"
}

export function authAllowSignUpFromEnvironment(
  nodeEnvironment = process.env.NODE_ENV,
  configuredValue = process.env.AUTH_ALLOW_SIGN_UP,
) {
  if (nodeEnvironment === "production") {
    return configuredValue === "true"
  }
  return configuredValue !== "false"
}

export function createShadowAuth({
  pool,
  baseURL,
  secret,
  trustedOrigins = [baseURL],
  disableSignUp = true,
  autoSignIn = true,
}: CreateShadowAuthOptions) {
  return betterAuth({
    database: pool,
    baseURL,
    basePath: "/api/auth",
    secret,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp,
      autoSignIn,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await provisionAuthUserAccount(pool, user)
          },
        },
      },
    },
    user: { modelName: "auth_user" },
    session: { modelName: "auth_session" },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
  })
}

export function normalizeAuthAccountEmail(email: string) {
  return email.trim().toLowerCase()
}

/**
 * Mirrors a Better Auth user into the domain `accounts` table so
 * `resolveActorId` can map a session email to an actor id.
 *
 * The upsert keys on the partial unique index `accounts_email_uidx`
 * (`WHERE email IS NOT NULL`): a new auth user inserts an account row keyed by
 * the auth user id, while an already existing account keeps its stable id and
 * only refreshes the display name. Safe to run repeatedly for the same user.
 */
export async function provisionAuthUserAccount(pool: Pool, user: AuthUserSnapshot) {
  const email = user.email ? normalizeAuthAccountEmail(user.email) : ""
  if (!email) {
    return
  }
  const displayName = user.name?.trim() || email
  await pool.query(
    `INSERT INTO accounts (id, display_name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) WHERE email IS NOT NULL
     DO UPDATE SET display_name = EXCLUDED.display_name`,
    [user.id, displayName, email],
  )
}

export function createAuthGateway({
  auth,
  database,
  baseURL,
  allowDevHeader = false,
}: {
  auth: ReturnType<typeof createShadowAuth>
  database: Kysely<Database>
  baseURL: string
  allowDevHeader?: boolean
}): AuthGateway {
  return {
    async handle(request) {
      const headers = fromNodeHeaders(request.headers)
      headers.delete("content-length")
      const method = request.method.toUpperCase()
      const body =
        method === "GET" || method === "HEAD" || request.body == null
          ? undefined
          : typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body)
      return auth.handler(
        new Request(new URL(request.url, baseURL), {
          method,
          headers,
          body,
        }),
      )
    },
    async resolveActorId(headers) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
      if (!session) {
        const developmentActorId = headers["x-shadow-account-id"]
        if (
          allowDevHeader &&
          typeof developmentActorId === "string" &&
          developmentActorId.trim()
        ) {
          return developmentActorId.trim()
        }
        throw new AppError("AUTH_REQUIRED", "请先登录", 401)
      }

      const account = await database
        .selectFrom("accounts")
        .select("id")
        .where("email", "=", session.user.email.toLowerCase())
        .executeTakeFirst()
      if (!account) {
        throw new AppError("ACCOUNT_NOT_PROVISIONED", "账号尚未加入 ShadowProducer", 403)
      }
      return account.id
    },
  }
}
