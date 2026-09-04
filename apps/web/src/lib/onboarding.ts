import type {
  CreateInvitationBody,
  CreateProjectBody,
  CreateTeamBody,
  InvitationAcceptance,
  InvitationList,
  InvitationSummary,
  OnboardingProject,
  OnboardingTeam,
} from "@shadowproducer/contracts"

export type {
  CreatedInvitation,
  InvitationAcceptance,
  InvitationSummary,
} from "@shadowproducer/contracts"

export type TeamInvitationStatus = InvitationSummary["status"]
export type TeamInvitation = InvitationSummary
export type TeamInvitationList = InvitationList
export type CreateTeamInvitationBody = Pick<
  CreateInvitationBody,
  | "scope"
  | "email"
  | "projectId"
  | "permissionTemplateId"
  | "expiresInDays"
  | "idempotencyKey"
>
export type InvitationPreview = InvitationSummary
export type AcceptInvitationResponse = InvitationAcceptance
export type { CreateProjectBody, CreateTeamBody, OnboardingProject, OnboardingTeam }

export type CreateTeamResponse = { item: OnboardingTeam; replayed: boolean }
export type CreateProjectResponse = { item: OnboardingProject; replayed: boolean }

export type CreateTeamWithProjectOutcome = {
  teamCreated: true
  projectError: string | null
}

export const TEAM_NAME_MAX_LENGTH = 80
export const PROJECT_NAME_MAX_LENGTH = 80

export const INVITATION_HASH_PREFIX = "#/invite"
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{8,200}$/

type TeamDraftFieldErrors = {
  teamName?: string[]
  projectName?: string[]
}

export type TeamDraftValidation =
  | { ok: true; teamName: string; projectName: string | null }
  | { ok: false; fieldErrors: TeamDraftFieldErrors }

export function validateTeamDraft(draft: {
  teamName: string
  projectName?: string
}): TeamDraftValidation {
  const teamName = draft.teamName.trim()
  const projectName = draft.projectName?.trim() ? draft.projectName.trim() : null
  const fieldErrors: TeamDraftFieldErrors = {}

  if (!teamName) {
    fieldErrors.teamName = ["请输入团队名称"]
  } else if (teamName.length > TEAM_NAME_MAX_LENGTH) {
    fieldErrors.teamName = [`团队名称不能超过 ${TEAM_NAME_MAX_LENGTH} 个字符`]
  }
  if (projectName && projectName.length > PROJECT_NAME_MAX_LENGTH) {
    fieldErrors.projectName = [`项目名称不能超过 ${PROJECT_NAME_MAX_LENGTH} 个字符`]
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors }
  return { ok: true, teamName, projectName }
}

function decodeToken(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const decoded = decodeURIComponent(value).trim()
    return decoded ? decoded : null
  } catch {
    return null
  }
}

function tokenFromQuery(query: string): string | null {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query)
  const explicit = decodeToken(params.get("inviteToken") ?? params.get("token"))
  return explicit
}

/**
 * Reads an invitation token from `#/invite/<token>`, `#/invite?token=...` or a
 * `?inviteToken=...` page query. Tokens only travel in the URL fragment, so
 * they are never sent to the web server; the API path is the only place a
 * token is transmitted, matching the existing public review link convention.
 */
export function extractInvitationToken(input: {
  hash?: string | null
  search?: string | null
}): string | null {
  const hash = input.hash ?? ""
  if (hash.startsWith(INVITATION_HASH_PREFIX)) {
    const rest = hash.slice(INVITATION_HASH_PREFIX.length)
    if (rest.startsWith("/") && !rest.includes("?")) {
      const fromPath = decodeToken(rest.slice(1))
      if (fromPath) return fromPath
    }
    const queryIndex = rest.indexOf("?")
    if (queryIndex >= 0) {
      const fromHashQuery = tokenFromQuery(rest.slice(queryIndex))
      if (fromHashQuery) return fromHashQuery
    }
  }
  const search = input.search ?? ""
  if (search) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    const fromSearch = decodeToken(params.get("inviteToken"))
    if (fromSearch) return fromSearch
  }
  return null
}

/** Returns the invite hash with any token removed, so tokens do not linger in history. */
export function stripInvitationFromHash(hash: string): string {
  if (!hash.startsWith(INVITATION_HASH_PREFIX)) return hash
  return INVITATION_HASH_PREFIX
}

/** Removes the `inviteToken` query parameter from a page search string. */
export function stripInvitationFromSearch(search: string): string {
  if (!search) return search
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  if (!params.has("inviteToken")) return search
  params.delete("inviteToken")
  const rest = params.toString()
  return rest ? `?${rest}` : ""
}

/** Builds the shareable invitation link for the current web origin. */
export function buildInvitationUrl(origin: string, token: string): string {
  const normalizedOrigin = origin.replace(/\/+$/, "")
  return `${normalizedOrigin}/#/invite/${encodeURIComponent(token)}`
}

/**
 * Accepts a pasted invitation link, `#/invite/<token>` fragment, or a raw
 * invitation token, and returns the token when the input is recognizable.
 */
export function parseInvitationReference(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const hashIndex = trimmed.indexOf("#")
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : ""
  const queryIndex = trimmed.indexOf("?")
  const search = queryIndex >= 0 ? trimmed.slice(queryIndex).split("#")[0] : ""
  const fromReference = extractInvitationToken({ hash, search })
  if (fromReference) return fromReference
  if (!hash && !search && INVITATION_TOKEN_PATTERN.test(trimmed)) return trimmed
  return null
}

export function isAccountNotProvisionedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (error as { code?: unknown }).code === "ACCOUNT_NOT_PROVISIONED"
}

export function isInvitationUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const candidate = error as { code?: unknown; status?: unknown }
  return (
    candidate.status === 410 ||
    candidate.code === "INVITATION_EXPIRED" ||
    candidate.code === "INVITATION_REVOKED" ||
    candidate.code === "INVITATION_ALREADY_ACCEPTED"
  )
}

export function isOnboardingFeatureUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const candidate = error as { code?: unknown; status?: unknown }
  if (candidate.status === 404 || candidate.status === 501) return true
  return (
    candidate.code === "NOT_IMPLEMENTED" ||
    candidate.code === "NOT_FOUND" ||
    candidate.code === "ROUTE_NOT_FOUND"
  )
}

export function onboardingErrorMessage(
  error: unknown,
  fallback = "服务暂时不可用，请稍后重试",
): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}
