import { expect, type Page, test } from "@playwright/test"

// Workspace flows driven through real GUI actions against the deterministic
// seed (fanxing@shadowproducer.local / AUTH_SEED_PASSWORD, default
// "shadowproducer-local"). Observed contract notes:
// - Team creation, project creation, and member invitation are covered in
//   onboarding.spec.ts through the real registration and workspace forms; this
//   suite focuses on entering seeded teams/projects and the remaining workspace
//   flows (workspace tasks and client review links).
// - The client review-link acceptance path uses the on-screen development
//   verification code (no SMTP) and is skipped with an annotation when the
//   seed provides no media-ready review versions.

const seedEmail = process.env.E2E_SEED_EMAIL ?? "fanxing@shadowproducer.local"
const seedPassword =
  process.env.E2E_SEED_PASSWORD ??
  process.env.AUTH_SEED_PASSWORD ??
  "shadowproducer-local"

async function signInFromHome(page: Page) {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible()
  await page.locator("#sign-in-email").fill(seedEmail)
  await page.locator("#sign-in-password").fill(seedPassword)
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await expect(page.getByRole("heading", { name: "选择团队" })).toBeVisible()
}

async function enterTeam(page: Page, teamName: string, teamId: string) {
  await page.getByRole("button", { name: `进入${teamName}` }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/team\\/${teamId}\\/dashboard$`))
  await expect(page.getByRole("button", { name: "新建任务" })).toBeVisible()
}

async function enterNorthTeam(page: Page) {
  await signInFromHome(page)
  await enterTeam(page, "北岸影像", "north")
}

// Desktop uses the persistent sidebar; below the md breakpoint the same views
// live in the compact topbar menu.
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

test.describe("principal workspace navigation", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 768,
    "the persistent sidebar is only rendered from the md breakpoint up",
  )

  test("navigates personal, team, and project spaces from the sidebar", async ({
    page,
  }) => {
    await enterNorthTeam(page)
    const nav = page.getByRole("navigation", { name: "工作空间导航" })
    const views = [
      ["我的日历", /#\/team\/north\/calendar$/],
      ["便签 / 笔记", /#\/team\/north\/notes$/],
      ["个人联系人", /#\/team\/north\/personal-contacts$/],
      ["团队概览", /#\/team\/north\/team$/],
      ["资源库", /#\/team\/north\/resources$/],
      ["作品集", /#\/team\/north\/portfolio$/],
      ["权限", /#\/team\/north\/permissions$/],
      ["审计记录", /#\/team\/north\/audit$/],
      ["回收站", /#\/team\/north\/recycle-bin$/],
      ["项目概览", /#\/project\/north\/winter-coffee\/project$/],
      ["脚本 / 分镜", /#\/project\/north\/winter-coffee\/scripts$/],
      ["拍摄与通告", /#\/project\/north\/winter-coffee\/schedule$/],
      ["审片", /#\/project\/north\/winter-coffee\/reviews$/],
    ] as const
    for (const [label, hash] of views) {
      await nav.getByRole("button", { name: label, exact: true }).click()
      await expect(page).toHaveURL(hash)
    }
    await expect(nav.getByRole("button", { name: "审片", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  test("switches the current project from the project switcher", async ({ page }) => {
    await enterNorthTeam(page)
    await page
      .getByRole("navigation", { name: "工作空间导航" })
      .getByRole("button", { name: "项目概览", exact: true })
      .click()
    await expect(page).toHaveURL(/#\/project\/north\/winter-coffee\/project$/)
    await page.getByRole("button", { name: "切换当前项目：冬夜咖啡" }).click()
    await page.getByRole("option", { name: /城市慢行/ }).click()
    await expect(page).toHaveURL(/#\/project\/north\/city-walk\/project$/)
    await expect(
      page.getByRole("button", { name: "切换当前项目：城市慢行" }),
    ).toBeVisible()
  })

  test("switches teams through team selection", async ({ page }) => {
    await enterNorthTeam(page)
    await page.getByRole("button", { name: "打开团队选择，当前团队：北岸影像" }).click()
    await expect(page.getByRole("heading", { name: "选择团队" })).toBeVisible()
    await enterTeam(page, "午夜制作", "midnight")
  })

  test("falls back to team selection for an unknown team hash", async ({ page }) => {
    await enterNorthTeam(page)
    await page.goto("/#/team/ghost-team/dashboard")
    await expect(page.getByRole("heading", { name: "选择团队" })).toBeVisible()
    await expect(page.getByRole("button", { name: "进入北岸影像" })).toBeVisible()
  })
})

test.describe("workspace create flow", () => {
  test("creates a workspace task from the dashboard", async ({ page }) => {
    await enterNorthTeam(page)
    const taskTitle = `E2E 冒烟任务 ${Date.now()}`
    await page.getByRole("button", { name: "新建任务" }).click()
    const dialog = page.getByRole("dialog", { name: "新建任务" })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel("任务名称").fill(taskTitle)
    await dialog.getByRole("button", { name: "保存", exact: true }).click()
    await expect(page.getByText("任务已创建")).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(taskTitle).first()).toBeVisible()
  })
})

test.describe("client review link invite", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("shares a review link and accepts it as an unauthenticated guest", async ({
    page,
    browser,
  }) => {
    await enterNorthTeam(page)
    await navigateToView(page, "审片")
    await expect(page).toHaveURL(/#\/project\/north\/winter-coffee\/reviews$/)
    await page.getByRole("button", { name: "分享审片" }).click()
    const dialog = page.getByRole("dialog", { name: "分享客户审片" })
    await expect(dialog).toBeVisible()
    const shareableVersions = dialog
      .locator("fieldset")
      .filter({ hasText: "分享版本" })
      .locator("input[type=checkbox]")

    let linkUrl: string
    if ((await shareableVersions.count()) > 0) {
      // Primary path: create the invite link entirely through the GUI.
      await shareableVersions.first().check()
      await dialog.getByRole("button", { name: "创建并复制" }).click()
      await expect(
        dialog.getByRole("button", { name: "已复制", exact: true }).first(),
      ).toBeVisible()
      linkUrl = await page.evaluate(() => navigator.clipboard.readText())
      expect(linkUrl).toMatch(/#\/review\//)
      await dialog.getByRole("button", { name: "关闭", exact: true }).click()
      await expect(dialog).toBeHidden()
    } else {
      // The deterministic seed ships review files without uploaded media
      // (team_assets.object_key is null), and the review-link repository rejects
      // fileIds whose backing asset is not ready, so no invite link can exist
      // through the GUI or the API. Skip with the observed empty-state contract
      // until the seed provides a media-ready review version.
      await expect(dialog.getByText("暂无可分享版本")).toBeVisible()
      test.skip(
        true,
        "the deterministic seed ships review files without uploaded media (team_assets.object_key is null), so no shareable review version exists to turn into an invite link",
      )
    }

    const guestContext = await browser.newContext()
    const guestPage = await guestContext.newPage()
    try {
      await guestPage.goto(linkUrl)
      await expect(guestPage.getByRole("heading", { name: "客户审片" })).toBeVisible()
      await guestPage.getByLabel("你的名字").fill("E2E 审片来宾")
      await guestPage
        .getByLabel("邮箱", { exact: true })
        .fill("guest@shadowproducer.local")
      await guestPage.getByRole("button", { name: "发送验证码" }).click()
      const developmentCode = guestPage.getByText(/本地验证码 \d{6}/)
      if (!(await developmentCode.isVisible())) {
        test.skip(
          true,
          "review identity delivery is configured through a webhook (REVIEW_IDENTITY_WEBHOOK_URL), so no development code is shown; the SMTP delivery path is out of scope for this governed suite",
        )
      }
      const code = (await developmentCode.textContent())?.match(/\d{6}/)?.[0]
      expect(code).toBeDefined()
      await guestPage.getByLabel("邮箱验证码").fill(code as string)
      await guestPage.getByRole("button", { name: "验证并进入" }).click()
      await expect(guestPage.getByText("冬夜咖啡")).toBeVisible()
      await expect(guestPage.getByText("冬夜咖啡_主片").first()).toBeVisible()
    } finally {
      await guestContext.close()
    }
  })
})

test.describe("compact topbar navigation", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= 768,
    "the hamburger topbar navigation only renders below the md breakpoint",
  )

  test("navigates through the compact topbar menu", async ({ page }) => {
    await enterNorthTeam(page)
    const sidebar = page.getByRole("navigation", { name: "工作空间导航" })
    await expect(sidebar).toBeHidden()
    await page.getByRole("button", { name: "打开项目导航" }).click()
    await page.getByRole("menuitem", { name: "团队概览" }).click()
    await expect(page).toHaveURL(/#\/team\/north\/team$/)
    await expect(
      page.getByRole("button", { name: "打开团队选择，当前团队：北岸影像" }),
    ).toBeVisible()
  })
})
