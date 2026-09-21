"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, LoaderCircle, UserRoundPlus } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { PersonalContacts } from "@/components/personal-contacts"
import {
  PersonalCalendar,
  PersonalDashboard,
  PersonalNotes,
} from "@/components/personal-productivity"
import {
  ProductionBreakdown,
  ProductionSchedule,
} from "@/components/production-workspace"
import { ProjectOverview } from "@/components/project-overview"
import { PublicPortfolioPage } from "@/components/public-portfolio-page"
import { PublicReviewPage } from "@/components/public-review-page"
import { ResourceLibrary } from "@/components/resource-library"
import { ReviewStudio } from "@/components/review-studio"
import { ScriptsStoryboard } from "@/components/scripts-storyboard"
import { SignIn } from "@/components/sign-in"
import { TeamAudit } from "@/components/team-audit"
import { TeamPermissions } from "@/components/team-permissions"
import { TeamPortfolio } from "@/components/team-portfolio"
import { TeamRecycleBin } from "@/components/team-recycle-bin"
import { TeamOnboarding, TeamSelect } from "@/components/team-select"
import { TeamOverview } from "@/components/team-workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, StatusBadge } from "@/components/workspace/page-elements"
import {
  getViewScope,
  type ProjectId,
  type TeamId,
  type WorkspaceView,
} from "@/components/workspace/workspace-data"
import { WorkspaceShell } from "@/components/workspace/workspace-shell"
import { onboardingApi, workspaceApi } from "@/lib/api-client"
import { authClient } from "@/lib/auth-client"
import {
  type AcceptInvitationResponse,
  type CreateTeamWithProjectOutcome,
  extractInvitationToken,
  isAccountNotProvisionedError,
  isInvitationUnavailableError,
  isOnboardingFeatureUnavailableError,
  onboardingErrorMessage,
  parseInvitationReference,
  stripInvitationFromHash,
  stripInvitationFromSearch,
} from "@/lib/onboarding"
import {
  findWorkspaceProject,
  hashForRoute,
  routeForTeam,
  routeFromHash,
  type WorkspaceRoute,
} from "@/lib/workspace-route"

const selectedTeamStorageKey = "shadowproducer:selected-team"

function AuthenticatedWorkspace({
  accountName,
  accountEmail,
}: {
  accountName: string
  accountEmail: string
}) {
  const contextQuery = useQuery({
    queryKey: ["workspace-context"],
    queryFn: workspaceApi.getContext,
  })
  const context = contextQuery.data
  const [route, setRoute] = useState<WorkspaceRoute | null>(null)
  const [pendingRoute, setPendingRoute] = useState<WorkspaceRoute | null>(null)
  const [selectingTeam, setSelectingTeam] = useState(true)
  const selectedTeamRef = useRef<TeamId | null>(null)

  useEffect(() => {
    if (!context) return
    const sync = () => {
      const nextRoute = routeFromHash(window.location.hash, context)
      const selectedTeam =
        selectedTeamRef.current ?? window.sessionStorage.getItem(selectedTeamStorageKey)

      if (!nextRoute) {
        setSelectingTeam(true)
        return
      }

      if (
        !context.teams.some((team) => team.id === selectedTeam) ||
        selectedTeam !== nextRoute.teamId
      ) {
        setPendingRoute(nextRoute)
        setSelectingTeam(true)
        if (window.location.hash !== "#/team-select") {
          window.history.replaceState(null, "", "#/team-select")
        }
        return
      }

      setRoute(nextRoute)
      setSelectingTeam(false)
    }
    sync()
    const syncFrame = window.requestAnimationFrame(sync)
    const syncTimer = window.setTimeout(sync, 100)
    window.addEventListener("hashchange", sync)
    window.addEventListener("pageshow", sync)
    return () => {
      window.cancelAnimationFrame(syncFrame)
      window.clearTimeout(syncTimer)
      window.removeEventListener("hashchange", sync)
      window.removeEventListener("pageshow", sync)
    }
  }, [context])

  const commitRoute = useCallback((next: WorkspaceRoute) => {
    const hash = hashForRoute(next)
    if (window.location.hash === hash) setRoute(next)
    else window.location.hash = hash
  }, [])

  const navigate = (view: WorkspaceView) => {
    if (!route) return
    commitRoute({ ...route, view })
  }

  const selectTeam = (teamId: TeamId) => {
    const team = context?.teams.find((candidate) => candidate.id === teamId)
    if (!team) return
    const nextRoute = pendingRoute?.teamId === teamId ? pendingRoute : routeForTeam(team)
    selectedTeamRef.current = teamId
    window.sessionStorage.setItem(selectedTeamStorageKey, teamId)
    setPendingRoute(null)
    setSelectingTeam(false)
    commitRoute(nextRoute)
  }

  const openTeamSelect = () => {
    selectedTeamRef.current = null
    window.sessionStorage.removeItem(selectedTeamStorageKey)
    setPendingRoute(null)
    setSelectingTeam(true)
    if (window.location.hash === "#/team-select") return
    window.location.hash = "#/team-select"
  }

  const signOut = async () => {
    await authClient.signOut()
    selectedTeamRef.current = null
    window.sessionStorage.removeItem(selectedTeamStorageKey)
    window.location.hash = "#/team-select"
    window.location.reload()
  }

  const changeProject = (projectId: ProjectId) => {
    if (!context || !route) return
    const target = findWorkspaceProject(context, projectId)
    if (!target) return
    commitRoute({
      ...route,
      teamId: target.team.id,
      projectId,
      view: getViewScope(route.view) === "project" ? route.view : "project",
    })
  }

  const openProjectView = (projectId: ProjectId, view: WorkspaceView = "project") => {
    if (!context) return
    const target = findWorkspaceProject(context, projectId)
    if (!target) return
    commitRoute({
      teamId: target.team.id,
      projectId,
      view,
    })
  }

  if (contextQuery.isPending) {
    return (
      <main className="grid min-h-svh place-items-center bg-workspace text-sm text-muted-foreground">
        正在载入可访问工作区
      </main>
    )
  }
  if (contextQuery.isError || !context) {
    if (contextQuery.isError && isAccountNotProvisionedError(contextQuery.error)) {
      return (
        <AccountOnboarding
          error={contextQuery.error}
          onSignOut={signOut}
          onReload={() => void contextQuery.refetch()}
        />
      )
    }
    return (
      <main className="grid min-h-svh place-items-center bg-workspace p-4">
        <EmptyState
          title="工作区暂时无法载入"
          detail={contextQuery.error?.message ?? "请确认 API 服务可用后重试。"}
          action={
            <Button variant="outline" onClick={() => void contextQuery.refetch()}>
              重新载入
            </Button>
          }
        />
      </main>
    )
  }
  const currentTeam = route
    ? (context.teams.find((team) => team.id === route.teamId) ?? null)
    : null
  const currentProject =
    currentTeam && route
      ? (currentTeam.projects.find((project) => project.id === route.projectId) ?? null)
      : null
  const currentWorkspaceProject =
    currentProject && currentTeam ? { ...currentProject, teamId: currentTeam.id } : null

  return (
    <AnimatePresence mode="wait" initial={false}>
      {selectingTeam || !route || !currentTeam ? (
        <motion.div
          key="team-select"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <TeamSelect
            accountName={accountName}
            teams={context.teams}
            onSelect={selectTeam}
            onSignOut={signOut}
          />
        </motion.div>
      ) : (
        <motion.div
          key="workspace-shell"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex min-h-svh min-w-0"
        >
          <WorkspaceShell
            activeView={route.view}
            currentTeam={currentTeam}
            currentProject={currentProject}
            projectOnly={currentTeam.role === null}
            accountName={accountName}
            accountEmail={accountEmail}
            onNavigate={navigate}
            onOpenTeamSelect={openTeamSelect}
            onProjectChange={changeProject}
            onOpenProjectView={openProjectView}
            onSignOut={signOut}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${route.teamId}:${route.projectId}:${route.view}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex min-h-0 min-w-0 flex-1"
              >
                {route.view === "dashboard" ? (
                  <PersonalDashboard
                    teamId={route.teamId}
                    projects={currentTeam.projects}
                    onNavigate={navigate}
                    onOpenProjectView={openProjectView}
                  />
                ) : null}
                {route.view === "calendar" ? (
                  <PersonalCalendar
                    teamId={route.teamId}
                    projects={currentTeam.projects}
                    onNavigate={navigate}
                  />
                ) : null}
                {route.view === "notes" ? (
                  <PersonalNotes teamId={route.teamId} projects={currentTeam.projects} />
                ) : null}
                {route.view === "personal-contacts" ? (
                  <PersonalContacts team={currentTeam} />
                ) : null}
                {route.view === "team" ? (
                  <TeamOverview
                    team={currentTeam}
                    onProjectChange={(projectId) => openProjectView(projectId)}
                  />
                ) : null}
                {route.view === "resources" ? (
                  <ResourceLibrary team={currentTeam} />
                ) : null}
                {route.view === "portfolio" ? (
                  <TeamPortfolio teamId={route.teamId} />
                ) : null}
                {route.view === "permissions" ? (
                  <TeamPermissions teamId={route.teamId} />
                ) : null}
                {route.view === "audit" ? <TeamAudit team={currentTeam} /> : null}
                {route.view === "recycle-bin" ? (
                  <TeamRecycleBin teamId={route.teamId} />
                ) : null}
                {route.view === "project" ? (
                  <ProjectOverview
                    teamId={route.teamId}
                    projectId={route.projectId}
                    onNavigate={navigate}
                  />
                ) : null}
                {route.view === "scripts" && currentWorkspaceProject ? (
                  <ScriptsStoryboard project={currentWorkspaceProject} />
                ) : null}
                {route.view === "breakdown" && currentWorkspaceProject ? (
                  <ProductionBreakdown project={currentWorkspaceProject} />
                ) : null}
                {route.view === "schedule" && currentWorkspaceProject ? (
                  <ProductionSchedule project={currentWorkspaceProject} />
                ) : null}
                {route.view === "reviews" && currentWorkspaceProject ? (
                  <ReviewStudio project={currentWorkspaceProject} />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </WorkspaceShell>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FullPageStatus({ children }: { children: string }) {
  return (
    <main
      role="status"
      className="grid min-h-svh place-items-center bg-workspace text-sm text-muted-foreground"
    >
      {children}
    </main>
  )
}

function invitationRouteActive(hash: string, search: string): boolean {
  const hashPath = hash.split("?")[0]
  if (hashPath === "#/invite" || hashPath.startsWith("#/invite/")) return true
  return new URLSearchParams(search.replace(/^\?/, "")).has("inviteToken")
}

// Moves an `?inviteToken=` page query into the URL fragment so the token is
// never re-sent to the web server on reloads or shared via referrer.
function normalizeInvitationLocation() {
  const { pathname, search, hash } = window.location
  if (!new URLSearchParams(search.replace(/^\?/, "")).has("inviteToken")) return
  const token = extractInvitationToken({ hash, search })
  const nextSearch = stripInvitationFromSearch(search)
  const nextHash = token
    ? `#/invite/${encodeURIComponent(token)}`
    : stripInvitationFromHash(hash) || "#/invite"
  window.history.replaceState(null, "", `${pathname}${nextSearch}${nextHash}`)
}

// Removes the invitation token from the current history entry after it has
// been consumed, so it does not linger in browser history.
function clearInvitationFromLocation() {
  const { pathname, search, hash } = window.location
  const nextSearch = stripInvitationFromSearch(search)
  const nextHash = stripInvitationFromHash(hash)
  window.history.replaceState(null, "", `${pathname}${nextSearch}${nextHash}`)
}

function exitInvitationRoute() {
  window.location.hash = "#/team-select"
}

function formatInvitationExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "未设置有效期"
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return expiresAt
  return `有效期至 ${date.toLocaleDateString("zh-CN")}`
}

export function WorkspaceApp() {
  const [publicReviewToken, setPublicReviewToken] = useState<string | null>(null)
  const [publicPortfolioSlug, setPublicPortfolioSlug] = useState<string | null>(null)
  const [inviteRoute, setInviteRoute] = useState(false)
  const [invitationToken, setInvitationToken] = useState<string | null>(null)
  const [routeReady, setRouteReady] = useState(false)

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash
      const search = window.location.search
      normalizeInvitationLocation()
      const active = invitationRouteActive(hash, search)
      setInviteRoute(active)
      setInvitationToken(active ? extractInvitationToken({ hash, search }) : null)
      const match = /^#\/review\/([^/?#]+)$/.exec(hash)
      const portfolioMatch = /^#\/portfolio\/([^/?#]+)$/.exec(hash)
      try {
        setPublicReviewToken(match ? decodeURIComponent(match[1]) : null)
        setPublicPortfolioSlug(
          portfolioMatch ? decodeURIComponent(portfolioMatch[1]) : null,
        )
      } catch {
        setPublicReviewToken(null)
        setPublicPortfolioSlug(null)
      }
      setRouteReady(true)
    }
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  if (!routeReady) {
    return <FullPageStatus>正在载入</FullPageStatus>
  }
  if (publicReviewToken) return <PublicReviewPage token={publicReviewToken} />
  if (publicPortfolioSlug) return <PublicPortfolioPage slug={publicPortfolioSlug} />
  if (inviteRoute) return <InvitationAcceptRoute token={invitationToken} />

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const session = authClient.useSession()

  if (session.isPending) {
    return <FullPageStatus>正在载入工作区</FullPageStatus>
  }
  if (!session.data) return <SignIn />

  return (
    <AuthenticatedWorkspace
      accountName={session.data.user.name}
      accountEmail={session.data.user.email}
    />
  )
}

function AccountOnboarding({
  error,
  onSignOut,
  onReload,
}: {
  error: unknown
  onSignOut: () => void
  onReload: () => void
}) {
  const queryClient = useQueryClient()
  const createTeamMutation = useMutation({
    mutationFn: async (input: {
      teamName: string
      projectName: string | null
    }): Promise<CreateTeamWithProjectOutcome> => {
      const team = await onboardingApi.createTeam({
        name: input.teamName,
        idempotencyKey: crypto.randomUUID(),
      })
      if (!input.projectName) return { teamCreated: true, projectError: null }
      try {
        await onboardingApi.createProject(team.item.id, {
          name: input.projectName,
          idempotencyKey: crypto.randomUUID(),
        })
        return { teamCreated: true, projectError: null }
      } catch (projectError) {
        return {
          teamCreated: true,
          projectError: onboardingErrorMessage(projectError, "服务暂时不可用"),
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace-context"] }),
  })

  return (
    <main className="min-h-svh bg-workspace px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-3xl flex-col border border-border bg-background sm:min-h-[calc(100svh-5rem)]">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-8 shrink-0 place-items-center bg-primary text-xs font-black text-primary-foreground">
              SP
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">ShadowProducer</div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onSignOut}>
            退出登录
          </Button>
        </header>
        <section className="flex flex-1 flex-col justify-center gap-6 px-4 py-10 sm:px-8">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold">账号尚未加入工作区</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {onboardingErrorMessage(error, "你的登录账号还没有可用的团队空间。")}
            </p>
          </div>
          <TeamOnboarding
            onCreateTeam={createTeamMutation.mutateAsync}
            pending={createTeamMutation.isPending}
            title="开通团队空间"
            description="创建团队后即可开始协作；如果受邀加入已有团队，也可以在下方使用邀请链接。"
            successDetail="团队创建成功。重新载入后即可进入工作区。"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.hash = "#/invite"
              }}
            >
              <UserRoundPlus />
              使用邀请链接加入
            </Button>
            <Button type="button" variant="ghost" onClick={onReload}>
              重新载入
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}

function InvitationAcceptRoute({ token }: { token: string | null }) {
  const session = authClient.useSession()

  if (session.isPending) return <FullPageStatus>正在载入邀请</FullPageStatus>
  if (!session.data) return <SignIn notice="登录后即可接受邀请并加入团队" />
  return <InvitationAccept token={token} accountName={session.data.user.name} />
}

function InvitationPasteForm({
  onUse,
  onCancel,
}: {
  onUse: (token: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState("")

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = parseInvitationReference(value)
    if (!token) {
      setError("无法识别邀请链接或邀请码，请确认内容后重试")
      return
    }
    setError("")
    onUse(token)
  }

  return (
    <main className="grid min-h-svh place-items-center bg-workspace px-4 py-10">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        aria-label="使用邀请链接"
        className="w-full max-w-md border border-border bg-background p-6"
      >
        <h1 className="text-xl font-semibold">使用邀请链接</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          粘贴收到的邀请链接或邀请码。邀请信息只保留在当前页面地址中，接受后即从地址中移除。
        </p>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label
            htmlFor="invitation-reference"
            className="block space-y-2 text-sm font-medium"
          >
            <span>邀请链接或邀请码</span>
            <Input
              id="invitation-reference"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
              autoFocus
            />
          </label>
          {error ? (
            <div role="alert" className="border-l-2 border-destructive px-3 text-sm">
              {error}
            </div>
          ) : null}
          <div className="flex gap-3">
            <Button type="submit" className="flex-1">
              继续
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              返回工作区
            </Button>
          </div>
        </form>
      </motion.section>
    </main>
  )
}

function InvitationAccept({
  token,
  accountName,
}: {
  token: string | null
  accountName: string
}) {
  const queryClient = useQueryClient()
  const [activeToken, setActiveToken] = useState(token)
  const [accepted, setAccepted] = useState<AcceptInvitationResponse | null>(null)

  useEffect(() => {
    setActiveToken(token)
    setAccepted(null)
  }, [token])

  const previewQuery = useQuery({
    queryKey: ["invitation-preview", activeToken],
    queryFn: () => onboardingApi.getInvitation(activeToken as string),
    enabled: Boolean(activeToken) && !accepted,
    staleTime: 0,
    refetchOnMount: "always",
  })

  const acceptMutation = useMutation({
    mutationFn: () => onboardingApi.acceptInvitation(activeToken as string),
    onSuccess: async (data) => {
      setAccepted(data)
      if (activeToken) {
        queryClient.removeQueries({ queryKey: ["invitation-preview", activeToken] })
      }
      clearInvitationFromLocation()
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] })
    },
  })

  const useToken = (nextToken: string) => {
    setActiveToken(nextToken)
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${stripInvitationFromSearch(window.location.search)}#/invite/${encodeURIComponent(nextToken)}`,
    )
  }

  if (accepted) {
    return (
      <main className="grid min-h-svh place-items-center bg-workspace px-4 py-10">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          aria-label="邀请已接受"
          className="w-full max-w-md border border-border bg-background p-6 text-center"
        >
          <h1 className="text-xl font-semibold">
            {accepted.scope === "project" ? "已加入项目" : "已加入团队"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {accepted.scope === "project"
              ? `你已加入项目「${accepted.projectName ?? accepted.teamName}」。`
              : `你已加入团队「${accepted.teamName}」。`}
          </p>
          <Button type="button" className="mt-6" autoFocus onClick={exitInvitationRoute}>
            进入工作区
            <ArrowRight />
          </Button>
        </motion.section>
      </main>
    )
  }

  if (!activeToken) {
    return <InvitationPasteForm onUse={useToken} onCancel={exitInvitationRoute} />
  }

  if (previewQuery.isPending) {
    return <FullPageStatus>正在载入邀请信息</FullPageStatus>
  }

  if (previewQuery.isError || !previewQuery.data) {
    const unavailable = isOnboardingFeatureUnavailableError(previewQuery.error)
    const invalid = isInvitationUnavailableError(previewQuery.error)
    return (
      <main className="grid min-h-svh place-items-center bg-workspace p-4">
        <EmptyState
          title={
            invalid
              ? "邀请已失效或已被使用"
              : unavailable
                ? "邀请服务暂未开放"
                : "无法载入邀请信息"
          }
          detail={
            invalid
              ? "请联系团队管理员重新生成邀请链接。"
              : unavailable
                ? "核心服务尚未提供邀请接口，暂时无法接受邀请。"
                : onboardingErrorMessage(previewQuery.error)
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void previewQuery.refetch()}>
                重试
              </Button>
              <Button variant="ghost" onClick={exitInvitationRoute}>
                返回工作区
              </Button>
            </div>
          }
        />
      </main>
    )
  }

  const preview = previewQuery.data
  if (preview.status !== "pending") {
    return (
      <main className="grid min-h-svh place-items-center bg-workspace p-4">
        <EmptyState
          title="邀请已失效或已被使用"
          detail="请联系团队管理员重新生成邀请链接。"
          action={
            <Button variant="outline" onClick={exitInvitationRoute}>
              返回工作区
            </Button>
          }
        />
      </main>
    )
  }

  return (
    <main className="grid min-h-svh place-items-center bg-workspace px-4 py-10">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        aria-label="接受邀请"
        className="w-full max-w-md border border-border bg-background p-6"
      >
        <StatusBadge tone="primary">可加入</StatusBadge>
        <h1 className="mt-4 text-xl font-semibold">{`加入「${preview.teamName}」`}</h1>
        <dl className="mt-5 space-y-3 border-y border-border py-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">邀请人</dt>
            <dd>{preview.invitedByName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">受邀邮箱</dt>
            <dd className="min-w-0 truncate">{preview.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">当前账号</dt>
            <dd className="min-w-0 truncate">{accountName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">有效期</dt>
            <dd>{formatInvitationExpiry(preview.expiresAt)}</dd>
          </div>
        </dl>
        {acceptMutation.isError ? (
          <div role="alert" className="mt-4 border-l-2 border-destructive px-3 text-sm">
            {onboardingErrorMessage(acceptMutation.error)}
          </div>
        ) : null}
        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            className="flex-1"
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <UserRoundPlus aria-hidden="true" />
            )}
            {acceptMutation.isPending ? "正在接受邀请" : "接受邀请"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={exitInvitationRoute}
            disabled={acceptMutation.isPending}
          >
            暂不
          </Button>
        </div>
      </motion.section>
    </main>
  )
}
