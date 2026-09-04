"use client"

import type { WorkspaceContext } from "@shadowproducer/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, LoaderCircle, Users } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  EmptyState,
  workspaceCardGridClassName,
  workspaceInteractiveCardClassName,
} from "@/components/workspace/page-elements"
import type { TeamId } from "@/components/workspace/workspace-data"
import { onboardingApi } from "@/lib/api-client"
import {
  type CreateTeamWithProjectOutcome,
  onboardingErrorMessage,
  validateTeamDraft,
} from "@/lib/onboarding"
import { cn } from "@/lib/utils"

function OnboardingFieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return (
    <span role="alert" className="text-xs text-destructive">
      {messages[0]}
    </span>
  )
}

/**
 * Shared create-team onboarding panel. Calls the real API through
 * `onCreateTeam` and never fabricates success: the success view only appears
 * when the promise resolves.
 */
export function TeamOnboarding({
  onCreateTeam,
  successDetail = "团队创建成功，正在刷新可访问工作区。",
  title = "创建团队",
  description = "创建后即可开始协作，并通过邀请链接邀请成员加入。",
}: {
  onCreateTeam: (input: {
    teamName: string
    projectName: string | null
  }) => Promise<CreateTeamWithProjectOutcome>
  successDetail?: string
  title?: string
  description?: string
}) {
  const [teamName, setTeamName] = useState("")
  const [projectName, setProjectName] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{
    teamName?: string[]
    projectName?: string[]
  }>({})
  const [error, setError] = useState("")
  const [outcome, setOutcome] = useState<CreateTeamWithProjectOutcome | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    const validation = validateTeamDraft({ teamName, projectName })
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors)
      return
    }
    setFieldErrors({})
    try {
      const result = await onCreateTeam({
        teamName: validation.teamName,
        projectName: validation.projectName,
      })
      setOutcome(result)
    } catch (submitError) {
      setError(onboardingErrorMessage(submitError))
    }
  }

  if (outcome) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        aria-label="团队创建结果"
        className="max-w-xl border border-border bg-background p-6"
      >
        <h2 className="text-lg font-semibold">团队已创建</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{successDetail}</p>
        {outcome.projectError ? (
          <p
            role="alert"
            className="mt-3 border-l-2 border-support bg-support/8 px-3 py-2 text-xs leading-5"
          >
            {`首个项目创建失败：${outcome.projectError}。可稍后在团队内重试。`}
          </p>
        ) : null}
      </motion.section>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      aria-label={title}
      className="max-w-xl border border-border bg-background p-6"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <form className="mt-6 space-y-5" onSubmit={submit}>
        <label
          htmlFor="onboarding-team-name"
          className="block space-y-2 text-sm font-medium"
        >
          <span>团队名称</span>
          <Input
            id="onboarding-team-name"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            maxLength={80}
            required
            aria-invalid={fieldErrors.teamName ? true : undefined}
            autoFocus
          />
          <OnboardingFieldError messages={fieldErrors.teamName} />
        </label>
        <label
          htmlFor="onboarding-project-name"
          className="block space-y-2 text-sm font-medium"
        >
          <span>首个项目（可选）</span>
          <Input
            id="onboarding-project-name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            maxLength={80}
            placeholder="留空表示稍后再创建项目"
            aria-invalid={fieldErrors.projectName ? true : undefined}
          />
          <OnboardingFieldError messages={fieldErrors.projectName} />
        </label>
        {error ? (
          <div role="alert" className="border-l-2 border-destructive px-3 text-sm">
            {error}
          </div>
        ) : null}
        <Button type="submit" className="w-full sm:w-auto">
          创建团队
        </Button>
      </form>
    </motion.section>
  )
}

function TeamSelectOnboarding() {
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
    <div className="relative">
      {createTeamMutation.isPending ? (
        <div
          role="status"
          className="absolute inset-0 z-10 grid place-items-center bg-background/70"
        >
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            正在创建团队
          </span>
        </div>
      ) : null}
      <TeamOnboarding onCreateTeam={createTeamMutation.mutateAsync} />
    </div>
  )
}

export function TeamSelect({
  accountName,
  teams,
  onSelect,
  onSignOut,
}: {
  accountName: string
  teams: WorkspaceContext["teams"]
  onSelect: (teamId: TeamId) => void
  onSignOut?: () => void
}) {
  return (
    <main className="min-h-svh bg-workspace px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-6xl flex-col border border-border bg-background sm:min-h-[calc(100svh-5rem)]">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-8 shrink-0 place-items-center bg-primary text-xs font-black text-primary-foreground">
              SP
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">ShadowProducer</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="grid size-6 place-items-center border border-border bg-muted font-semibold text-foreground">
                {accountName.slice(0, 2)}
              </span>
              {accountName}
            </div>
            {onSignOut ? (
              <Button type="button" variant="ghost" size="sm" onClick={onSignOut}>
                退出登录
              </Button>
            ) : null}
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="mb-6 max-w-2xl">
            <h1 className="text-2xl font-semibold sm:text-3xl">选择团队</h1>
          </div>

          {teams.length ? (
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                layout
                className={cn(workspaceCardGridClassName, "md:grid-cols-3")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {teams.map((team, index) => {
                  const projects = team.projects
                  return (
                    <motion.button
                      key={team.id}
                      type="button"
                      aria-label={`进入${team.name}`}
                      onClick={() => onSelect(team.id)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.2, delay: index * 0.04 }}
                      className={cn(
                        workspaceInteractiveCardClassName,
                        "group flex min-h-64 flex-col p-5 text-left hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="grid size-11 place-items-center border border-border bg-sidebar text-sm font-bold">
                          {team.name.slice(0, 1)}
                        </div>
                        <span className="border border-primary/25 bg-primary/6 px-2 py-1 text-xs font-medium text-primary">
                          {team.role}
                        </span>
                      </div>
                      <h2 className="mt-6 text-lg font-semibold">{team.name}</h2>
                      <div className="mt-5 grid grid-cols-2 border-y border-border py-3 text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="size-3.5" />
                          {team.memberCount} 位成员
                        </span>
                        <span className="text-right text-muted-foreground">
                          {projects.length} 个项目
                        </span>
                      </div>
                      <span className="mt-auto flex min-h-11 w-full items-center justify-between border-t border-border pt-3 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                        进入团队
                        <ArrowRight />
                      </span>
                    </motion.button>
                  )
                })}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="space-y-6">
              <EmptyState
                title="尚未加入团队"
                detail="创建一个团队开始协作，或使用邀请链接加入已有团队。"
                className="min-h-0 px-0 py-0 text-left"
              />
              <TeamSelectOnboarding />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
