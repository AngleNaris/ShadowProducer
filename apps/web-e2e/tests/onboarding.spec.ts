import { randomUUID } from "node:crypto"

import { expect, type Page, test } from "@playwright/test"

// Deterministic seed contract (apps/api/src/migrate.ts):
// fanxing@shadowproducer.local / AUTH_SEED_PASSWORD (non-production default
// "shadowproducer-local"), provisioned into teams 北岸影像 (north), 午夜制作
// (midnight) and 外部协作 (external). Non-production E2E explicitly enables
// self-serve registration. The tests below drive every step through real,
// visible GUI actions; no auth state is injected.

const seedEmail = process.env.E2E_SEED_EMAIL ?? "fanxing@shadowproducer.local"
const seedDisplayName = process.env.E2E_SEED_DISPLAY_NAME ?? "繁星"
const seedPassword =
  process.env.E2E_SEED_PASSWORD ??
  process.env.AUTH_SEED_PASSWORD ??
  "shadowproducer-local"

const seededTeams = [
  { name: "北岸影像", id: "north" },
  { name: "午夜制作", id: "midnight" },
  { name: "外部协作", id: "external" },
]

type E2EAccount = {
  name: string
  email: string
  password: string
}

function uniqueAccount(label: string): E2EAccount {
  const suffix = randomUUID().slice(0, 12)
  return {
    name: `E2E ${label}`,
    email: `e2e-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}@shadowproducer.local`,
    password: "shadowproducer-e2e-password",
  }
}

function uniqueName(label: string) {
  return `E2E ${label} ${randomUUID().slice(0, 8)}`
}

async function openSignIn(page: Page) {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible()
}

// The app renders auth errors as [role=alert] inside <main>; Next.js also injects
// its own #(__next-route-announcer__)[role=alert] outside <main>, so scope to main.
function signInAlert(page: Page) {
  return page.locator("main [role=alert]")
}

async function submitSignIn(page: Page, email = seedEmail, password = seedPassword) {
  await page.locator("#sign-in-email").fill(email)
  await page.locator("#sign-in-password").fill(password)
  await page.getByRole("button", { name: "登录", exact: true }).click()
}

async function signIn(page: Page, email = seedEmail, password = seedPassword) {
  await submitSignIn(page, email, password)
  await expect(page.getByRole("heading", { name: "选择团队" })).toBeVisible()
}

async function register(page: Page, account: E2EAccount) {
  await openSignIn(page)
  await registerOnCurrentSignIn(page, account)
}

async function registerOnCurrentSignIn(
  page: Page,
  account: E2EAccount,
  expectedHeading: string | RegExp = "选择团队",
) {
  await page.getByRole("button", { name: "还没有账号？注册新账号", exact: true }).click()
  await expect(page.getByRole("heading", { name: "注册新账号" })).toBeVisible()
  await page.locator("#sign-in-name").fill(account.name)
  await page.locator("#sign-in-email").fill(account.email)
  await page.locator("#sign-in-password").fill(account.password)
  await page.getByRole("button", { name: "注册", exact: true }).click()
  await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible()
}

async function enterTeam(page: Page, teamName: string, teamId: string) {
  await page.getByRole("button", { name: `进入${teamName}` }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/team\\/${teamId}\\/dashboard$`))
  await expect(page.getByRole("button", { name: "新建任务" })).toBeVisible()
}

async function navigateToView(page: Page, label: string) {
  const isDesktop = (test.info().project.use.viewport?.width ?? 0) >= 768
  if (isDesktop) {
    await page
      .getByRole("navigation", { name: "工作空间导航" })
      .getByRole("button", { name: label, exact: true })
      .click()
  } else {
    await page.getByRole("button", { name: "打开项目导航" }).click()
    await page.getByRole("menuitem", { name: label, exact: true }).click()
  }
}

async function openTeamInvitations(page: Page) {
  await navigateToView(page, "权限")
  await expect(page).toHaveURL(/#\/team\/north\/permissions$/)
  await page.getByRole("tab", { name: "邀请链接", exact: true }).click()
  await expect(page.getByRole("heading", { name: "邀请链接" })).toBeVisible()
}

test.describe("sign-in surface", () => {
  test("renders the login form and product identity", async ({ page }) => {
    await openSignIn(page)
    await expect(page.getByText("ShadowProducer").first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "影视制片协作工作台" })).toBeVisible()
    await expect(page.locator("#sign-in-email")).toBeVisible()
    await expect(page.locator("#sign-in-password")).toBeVisible()
    const submit = page.getByRole("button", { name: "登录", exact: true })
    await expect(submit).toBeEnabled()
    await expect(signInAlert(page)).toHaveCount(0)
  })

  test("blocks an empty submission with native validation", async ({ page }) => {
    await openSignIn(page)
    await page.getByRole("button", { name: "登录", exact: true }).click()
    await expect(page.locator("#sign-in-email:invalid")).toBeVisible()
    await expect(page.locator("#sign-in-password:invalid")).toBeVisible()
    await expect(signInAlert(page)).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible()
  })

  test("rejects a wrong password with a visible alert", async ({ page }) => {
    await openSignIn(page)
    await page.locator("#sign-in-email").fill(seedEmail)
    await page.locator("#sign-in-password").fill("definitely-not-the-seed-password")
    await page.getByRole("button", { name: "登录", exact: true }).click()
    const alert = signInAlert(page)
    await expect(alert).toBeVisible()
    await expect(alert).toHaveText("邮箱或密码不正确")
    await expect(page.getByRole("button", { name: "登录", exact: true })).toBeEnabled()
    await expect(page.getByRole("heading", { name: "选择团队" })).toHaveCount(0)
  })

  test("rejects an unknown account like a wrong password", async ({ page }) => {
    await openSignIn(page)
    await submitSignIn(page, "nobody@shadowproducer.local", "whatever-password")
    await expect(signInAlert(page)).toBeVisible()
    await expect(signInAlert(page)).toHaveText("邮箱或密码不正确")
  })
})

test.describe("account provisioning contract", () => {
  test("self-serve registration provisions an account and opens team onboarding", async ({
    page,
  }) => {
    const account = uniqueAccount("registration")
    await register(page, account)

    await expect(page.getByRole("heading", { name: "选择团队" })).toBeVisible()
    await expect(page.getByText("尚未加入团队")).toBeVisible()
    await expect(
      page.getByText("创建一个团队开始协作，或使用邀请链接加入已有团队。"),
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "创建团队" })).toBeVisible()
    await expect(page.locator("#onboarding-team-name")).toBeVisible()
    await expect(page.locator("#onboarding-project-name")).toBeVisible()
  })
})

test.describe("empty-team onboarding", () => {
  test("creates a team and its first project from the onboarding form", async ({
    page,
  }) => {
    const account = uniqueAccount("first-project")
    const teamName = uniqueName("首个团队")
    const projectName = uniqueName("首个项目")
    await register(page, account)

    await page.locator("#onboarding-team-name").fill(teamName)
    await page.locator("#onboarding-project-name").fill(projectName)
    await page.getByRole("button", { name: "创建团队", exact: true }).click()

    const teamCard = page.getByRole("button", { name: `进入${teamName}` })
    await expect(teamCard).toBeVisible()
    await expect(teamCard).toContainText("1 个项目")
    await teamCard.click()
    await navigateToView(page, "项目概览")
    await expect(
      page.getByRole("button", { name: `切换当前项目：${projectName}` }),
    ).toBeVisible()
  })

  test("creates a team while skipping the first project", async ({ page }) => {
    const account = uniqueAccount("skip-project")
    const teamName = uniqueName("稍后建项目")
    await register(page, account)

    await page.locator("#onboarding-team-name").fill(teamName)
    await expect(page.locator("#onboarding-project-name")).toHaveValue("")
    await page.getByRole("button", { name: "创建团队", exact: true }).click()

    const teamCard = page.getByRole("button", { name: `进入${teamName}` })
    await expect(teamCard).toBeVisible()
    await expect(teamCard).toContainText("0 个项目")
  })
})

test.describe("onboarding into a team", () => {
  test("signs in with the seeded account and lands on team selection", async ({
    page,
  }) => {
    await openSignIn(page)
    await signIn(page)
    // The account chip in the team-select header is hidden below the sm breakpoint.
    if ((test.info().project.use.viewport?.width ?? 0) >= 640) {
      await expect(page.getByText(seedDisplayName)).toBeVisible()
    }
    for (const team of seededTeams) {
      const card = page.getByRole("button", { name: `进入${team.name}` })
      await expect(card).toBeVisible()
      await expect(card.getByText(/位成员/)).toBeVisible()
      await expect(card.getByText(/个项目/)).toBeVisible()
    }
  })

  test("entering the seeded production team opens its dashboard", async ({ page }) => {
    await openSignIn(page)
    await signIn(page)
    await enterTeam(page, "北岸影像", "north")
    await expect(page.getByText("我的任务")).toBeVisible()
    const isDesktop = test.info().project.name === "desktop"
    if (isDesktop) {
      await expect(page.getByRole("navigation", { name: "工作空间导航" })).toBeVisible()
      await expect(
        page.getByRole("button", { name: "打开团队选择，当前团队：北岸影像" }),
      ).toBeVisible()
    } else {
      await expect(page.getByRole("navigation", { name: "工作空间导航" })).toBeHidden()
      await expect(page.getByRole("button", { name: "打开项目导航" })).toBeVisible()
    }
  })
})

test.describe("team invitation onboarding", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("creates a one-time invite and accepts it with a matching registered account", async ({
    page,
    browser,
  }) => {
    const invitee = uniqueAccount("invitee")
    await openSignIn(page)
    await signIn(page)
    await enterTeam(page, "北岸影像", "north")
    await openTeamInvitations(page)

    await page.getByRole("button", { name: "创建邀请链接", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "创建邀请链接" })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel("受邀邮箱").fill(invitee.email)
    await dialog.getByRole("button", { name: "创建链接", exact: true }).click()
    await expect(dialog.locator("#created-invitation-link")).toBeVisible()

    const linkUrl = await dialog.locator("#created-invitation-link").inputValue()
    expect(linkUrl).toMatch(/#\/invite\/[A-Za-z0-9._~-]+$/)
    await dialog.getByRole("button", { name: "完成", exact: true }).click()
    await expect(dialog).toBeHidden()

    const inviteeContext = await browser.newContext()
    const inviteePage = await inviteeContext.newPage()
    try {
      await inviteePage.goto(linkUrl as string)
      await expect(inviteePage.getByRole("heading", { name: "登录" })).toBeVisible()
      await expect(inviteePage.getByRole("status")).toHaveText(
        "登录后即可接受邀请并加入团队",
      )
      await registerOnCurrentSignIn(inviteePage, invitee, /加入「北岸影像」/)
      await expect(
        inviteePage.getByRole("heading", { name: "加入「北岸影像」" }),
      ).toBeVisible()
      await inviteePage.getByRole("button", { name: "接受邀请", exact: true }).click()
      await expect(inviteePage.getByRole("heading", { name: "已加入团队" })).toBeVisible()
      await inviteePage.getByRole("button", { name: "进入工作区", exact: true }).click()
      await expect(inviteePage.getByRole("heading", { name: "选择团队" })).toBeVisible()
      await expect(
        inviteePage.getByRole("button", { name: "进入北岸影像" }),
      ).toBeVisible()

      await inviteePage.goto(linkUrl as string)
      await inviteePage.reload()
      await expect(inviteePage.getByText("邀请已失效或已被使用")).toBeVisible()
    } finally {
      await inviteeContext.close()
    }
  })
})
test.describe("sign-out", () => {
  test("returns to the login screen and stays signed out", async ({ page }) => {
    await openSignIn(page)
    await signIn(page)
    await enterTeam(page, "北岸影像", "north")
    if (test.info().project.name === "mobile") {
      await page.getByRole("button", { name: "退出登录", exact: true }).click()
    } else {
      await page.getByRole("button", { name: seedEmail }).click()
      await page.getByRole("menuitem", { name: "退出登录" }).click()
    }
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible()
    await page.reload()
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible()
  })
})
