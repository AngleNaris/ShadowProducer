import assert from "node:assert/strict"
import test from "node:test"

import {
  buildInvitationUrl,
  extractInvitationToken,
  isAccountNotProvisionedError,
  isInvitationUnavailableError,
  isOnboardingFeatureUnavailableError,
  onboardingErrorMessage,
  parseInvitationReference,
  stripInvitationFromHash,
  stripInvitationFromSearch,
  validateTeamDraft,
} from "./onboarding.ts"

test("invitation tokens are read from hash path, hash query, and page query", () => {
  assert.equal(
    extractInvitationToken({ hash: "#/invite/token-123", search: "" }),
    "token-123",
  )
  assert.equal(
    extractInvitationToken({ hash: "#/invite?token=token-123", search: "" }),
    "token-123",
  )
  assert.equal(
    extractInvitationToken({ hash: "#/team-select", search: "?inviteToken=token-123" }),
    "token-123",
  )
  assert.equal(
    extractInvitationToken({
      hash: `#/invite/${encodeURIComponent("secret/值")}`,
      search: "",
    }),
    "secret/值",
  )
})

test("invitation token extraction stays conservative", () => {
  assert.equal(extractInvitationToken({ hash: "#/team-select", search: "" }), null)
  assert.equal(extractInvitationToken({ hash: "#/invite", search: "" }), null)
  assert.equal(extractInvitationToken({ hash: "#/invite/", search: "" }), null)
  assert.equal(
    extractInvitationToken({ hash: "#/team/a/calendar", search: "?token=nope" }),
    null,
  )
  assert.equal(extractInvitationToken({ hash: "#/invite/%E5%80%BC", search: "" }), "值")
  assert.equal(extractInvitationToken({ hash: "#/invite/%ZZ", search: "" }), null)
})

test("strip helpers remove invitation tokens without disturbing other state", () => {
  assert.equal(stripInvitationFromHash("#/invite/token-123"), "#/invite")
  assert.equal(stripInvitationFromHash("#/invite"), "#/invite")
  assert.equal(stripInvitationFromHash("#/team/a/calendar"), "#/team/a/calendar")
  assert.equal(stripInvitationFromSearch("?inviteToken=token-123"), "")
  assert.equal(stripInvitationFromSearch("?inviteToken=a&tab=1"), "?tab=1")
  assert.equal(stripInvitationFromSearch("?tab=1"), "?tab=1")
  assert.equal(stripInvitationFromSearch(""), "")
})

test("invitation links encode the token and paste input is parsed", () => {
  assert.equal(
    buildInvitationUrl("https://app.example.com/", "token-123"),
    "https://app.example.com/#/invite/token-123",
  )
  assert.equal(
    parseInvitationReference("https://app.example.com/#/invite/token-123"),
    "token-123",
  )
  assert.equal(
    parseInvitationReference("https://app.example.com/?inviteToken=token-123"),
    "token-123",
  )
  assert.equal(parseInvitationReference("token-123"), "token-123")
  assert.equal(parseInvitationReference("  token-123  "), "token-123")
  assert.equal(parseInvitationReference(""), null)
  assert.equal(parseInvitationReference("short"), null)
  assert.equal(parseInvitationReference("无效 token 文本"), null)
})

test("team drafts require a team name and treat the first project as optional", () => {
  const valid = validateTeamDraft({ teamName: " 北岸影像 ", projectName: " 冬夜咖啡 " })
  assert.deepEqual(valid, {
    ok: true,
    teamName: "北岸影像",
    projectName: "冬夜咖啡",
  })

  const skippedProject = validateTeamDraft({ teamName: "北岸影像", projectName: "   " })
  assert.deepEqual(skippedProject, {
    ok: true,
    teamName: "北岸影像",
    projectName: null,
  })

  const missingName = validateTeamDraft({ teamName: "   " })
  assert.equal(missingName.ok, false)
  assert.deepEqual(missingName.ok ? null : missingName.fieldErrors.teamName, [
    "请输入团队名称",
  ])

  const tooLong = validateTeamDraft({
    teamName: "团".repeat(81),
    projectName: "项".repeat(81),
  })
  assert.equal(tooLong.ok, false)
  assert.deepEqual(tooLong.ok ? null : tooLong.fieldErrors.teamName, [
    "团队名称不能超过 80 个字符",
  ])
  assert.deepEqual(tooLong.ok ? null : tooLong.fieldErrors.projectName, [
    "项目名称不能超过 80 个字符",
  ])
})

test("onboarding errors are classified without importing the api client", () => {
  const notProvisioned = Object.assign(new Error("账号尚未加入 ShadowProducer"), {
    code: "ACCOUNT_NOT_PROVISIONED",
    status: 403,
  })
  assert.equal(isAccountNotProvisionedError(notProvisioned), true)
  assert.equal(isAccountNotProvisionedError(new Error("其他错误")), false)
  assert.equal(isAccountNotProvisionedError("字符串错误"), false)

  const notFound = Object.assign(new Error("Route POST:/v1/teams not found"), {
    code: "NETWORK_ERROR",
    status: 404,
  })
  assert.equal(isOnboardingFeatureUnavailableError(notFound), true)
  assert.equal(
    isOnboardingFeatureUnavailableError(
      Object.assign(new Error("无权限"), { code: "FORBIDDEN", status: 403 }),
    ),
    false,
  )

  assert.equal(isInvitationUnavailableError(new Error("其他错误")), false)
  assert.equal(
    isInvitationUnavailableError(
      Object.assign(new Error("邀请已被接受"), {
        code: "INVITATION_ALREADY_ACCEPTED",
        status: 410,
      }),
    ),
    true,
  )

  assert.equal(onboardingErrorMessage(notProvisioned), "账号尚未加入 ShadowProducer")
  assert.equal(onboardingErrorMessage(undefined, "默认提示"), "默认提示")
  assert.equal(onboardingErrorMessage(new Error("  ")), "服务暂时不可用，请稍后重试")
})
