import { defineConfig, devices } from "@playwright/test"

// Governed E2E assumptions (verified against the repository, 2026-09):
// - Infrastructure: Postgres (127.0.0.1:5433) and MinIO (127.0.0.1:9100) from
//   infra/docker-compose.yml must be running: `docker compose -f infra/docker-compose.yml up -d`.
// - Deterministic seed: `pnpm db:migrate` applies migrations and seeds fixture accounts,
//   teams, and projects (idempotent). The API webServer below re-runs it before booting.
// - Seeded login: fanxing@shadowproducer.local with AUTH_SEED_PASSWORD
//   (non-production default "shadowproducer-local"; non-production self-serve
//   registration is enabled unless explicitly disabled).
// - No AI providers and no SMTP are involved: account provisioning is local and
//   the client review-link identity path renders an on-screen development code
//   when REVIEW_IDENTITY_WEBHOOK_URL is unset outside production.

const webPort = Number(process.env.E2E_WEB_PORT ?? 3211)
const apiPort = Number(process.env.E2E_API_PORT ?? 3220)
const webBaseURL = `http://127.0.0.1:${webPort}`
const apiBaseURL = `http://127.0.0.1:${apiPort}`

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: true,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: webBaseURL,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @shadowproducer/api db:migrate && pnpm --filter @shadowproducer/api dev",
      url: `${apiBaseURL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        API_HOST: "127.0.0.1",
        API_PORT: String(apiPort),
        AUTH_ALLOW_SIGN_UP: "true",
        BETTER_AUTH_URL: webBaseURL,
      },
    },
    {
      command: "pnpm --filter @shadowproducer/web dev",
      url: webBaseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        PORT: String(webPort),
        API_INTERNAL_URL: apiBaseURL,
        NEXT_PUBLIC_ENABLE_REGISTRATION: "true",
        PUBLIC_WEB_HOSTS: "localhost,127.0.0.1",
      },
    },
  ],
})
