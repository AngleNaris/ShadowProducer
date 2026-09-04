"use client"

import type {
  ApprovedPortfolioCandidate,
  PortfolioContent,
  PortfolioThemePreset,
  TeamPortfolio as TeamPortfolioModel,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  FolderOpen,
  Globe2,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Image from "next/image"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  EmptyState,
  PageFrame,
  WorkspaceHeader,
  workspaceCardGridClassName,
  workspaceInteractiveCardClassName,
} from "@/components/workspace/page-elements"
import type { TeamId } from "@/components/workspace/workspace-data"
import { ApiError, assetApi, portfolioApi } from "@/lib/api-client"
import { cn } from "@/lib/utils"

type PortfolioList = { items: TeamPortfolioModel[] }

const themeOptions: { id: PortfolioThemePreset; label: string; detail: string }[] = [
  { id: "editorial", label: "编辑部", detail: "克制的浅色叙事版式" },
  { id: "gallery", label: "画廊", detail: "明亮的作品优先版式" },
  { id: "screening", label: "放映室", detail: "深色沉浸观看版式" },
]

function messageFrom(error: unknown) {
  return error instanceof ApiError ? error.message : "操作失败，请稍后重试"
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function PortfolioVisual({
  src,
  alt,
  eager = false,
}: {
  src: string | null
  alt: string
  eager?: boolean
}) {
  if (!src) {
    return (
      <div className="grid size-full place-items-center bg-muted/60 text-muted-foreground">
        <Film className="size-8" aria-hidden="true" />
      </div>
    )
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
      loading={eager ? "eager" : "lazy"}
      className="object-cover transition-transform duration-300 group-hover:scale-[1.018] group-focus-visible:scale-[1.018]"
    />
  )
}

function replacePortfolio(current: PortfolioList | undefined, item: TeamPortfolioModel) {
  if (!current) return { items: [item] }
  const exists = current.items.some((portfolio) => portfolio.id === item.id)
  return {
    items: exists
      ? current.items.map((portfolio) => (portfolio.id === item.id ? item : portfolio))
      : [item, ...current.items],
  }
}

function removePortfolio(current: PortfolioList | undefined, id: string) {
  return { items: current?.items.filter((portfolio) => portfolio.id !== id) ?? [] }
}

export function TeamPortfolio({ teamId }: { teamId: TeamId }) {
  const queryClient = useQueryClient()
  const queryKey = ["team-portfolios", teamId] as const
  const archivedQueryKey = ["team-portfolios", teamId, "archived"] as const
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<TeamPortfolioModel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamPortfolioModel | null>(null)
  const [previewContent, setPreviewContent] = useState<PortfolioContent | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [candidateOpen, setCandidateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [publicationAction, setPublicationAction] = useState<
    "publish" | "unpublish" | null
  >(null)
  const [draftPortfolio, setDraftPortfolio] = useState({
    title: "",
    category: "",
    year: "2026",
    description: "",
  })
  const [settingsDraft, setSettingsDraft] = useState<{
    themePreset: PortfolioThemePreset
    seoTitle: string
    seoDescription: string
    domain: string
  }>({
    themePreset: "editorial",
    seoTitle: "",
    seoDescription: "",
    domain: "",
  })

  const portfolioQuery = useQuery({
    queryKey,
    queryFn: () => portfolioApi.list(teamId),
  })
  const archivedPortfolioQuery = useQuery({
    queryKey: archivedQueryKey,
    queryFn: () => portfolioApi.list(teamId, true),
    enabled: showArchived,
  })
  const candidateQuery = useQuery({
    queryKey: ["portfolio-candidates", teamId],
    queryFn: () => portfolioApi.listCandidates(teamId),
    enabled: candidateOpen,
  })
  const portfolios = portfolioQuery.data?.items ?? []
  const archivedPortfolios = archivedPortfolioQuery.data?.items ?? []
  const visiblePortfolios = showArchived ? archivedPortfolios : portfolios
  const visibleQuery = showArchived ? archivedPortfolioQuery : portfolioQuery
  const activePortfolio =
    portfolios.find((portfolio) => portfolio.id === activePortfolioId) ?? null
  const analyticsQuery = useQuery({
    queryKey: ["portfolio-analytics", teamId, activePortfolioId],
    queryFn: () => portfolioApi.analytics(teamId, activePortfolioId ?? ""),
    enabled: settingsOpen && Boolean(activePortfolioId),
  })

  function openSettings() {
    if (!activePortfolio) return
    setSettingsDraft({
      themePreset: activePortfolio.themePreset,
      seoTitle: activePortfolio.seoTitle,
      seoDescription: activePortfolio.seoDescription,
      domain: activePortfolio.customDomain?.domain ?? "",
    })
    setSettingsOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      portfolioApi.create(teamId, {
        title: draftPortfolio.title.trim(),
        category: draftPortfolio.category.trim() || "未分类",
        year: draftPortfolio.year.trim(),
        description: draftPortfolio.description.trim(),
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<PortfolioList>(queryKey, (current) =>
        replacePortfolio(current, item),
      )
      setDraftPortfolio({ title: "", category: "", year: "2026", description: "" })
      setCreateOpen(false)
      setActivePortfolioId(item.id)
    },
  })

  const addContentMutation = useMutation({
    mutationFn: (candidate: ApprovedPortfolioCandidate) => {
      if (!activePortfolio) throw new Error("No active portfolio")
      return portfolioApi.addContent(teamId, activePortfolio.id, {
        assetId: candidate.assetId,
        reviewFileId: candidate.reviewFileId,
        caption: "审片已通过版本",
        featured: activePortfolio.contents.length === 0,
        expectedRevision: activePortfolio.revision,
        idempotencyKey: crypto.randomUUID(),
      })
    },
    onSuccess: ({ item }) => {
      queryClient.setQueryData<PortfolioList>(queryKey, (current) =>
        replacePortfolio(current, item),
      )
      setCandidateOpen(false)
    },
  })

  const publicationMutation = useMutation({
    mutationFn: () => {
      if (!activePortfolio || !publicationAction) throw new Error("No portfolio action")
      const body = {
        expectedRevision: activePortfolio.revision,
        idempotencyKey: crypto.randomUUID(),
      }
      return publicationAction === "publish"
        ? portfolioApi.publish(teamId, activePortfolio.id, body)
        : portfolioApi.unpublish(teamId, activePortfolio.id, body)
    },
    onSuccess: ({ item }) => {
      queryClient.setQueryData<PortfolioList>(queryKey, (current) =>
        replacePortfolio(current, item),
      )
      if (item.publicSlug) {
        queryClient.removeQueries({
          queryKey: ["public-portfolio", item.publicSlug],
          exact: true,
        })
      }
      setPublicationAction(null)
    },
  })

  const settingsMutation = useMutation({
    mutationFn: () => {
      if (!activePortfolio) throw new Error("No active portfolio")
      return portfolioApi.updateSettings(teamId, activePortfolio.id, {
        themePreset: settingsDraft.themePreset,
        seoTitle: settingsDraft.seoTitle.trim(),
        seoDescription: settingsDraft.seoDescription.trim(),
        expectedRevision: activePortfolio.revision,
        idempotencyKey: crypto.randomUUID(),
      })
    },
    onSuccess: ({ item }) => {
      queryClient.setQueryData<PortfolioList>(queryKey, (current) =>
        replacePortfolio(current, item),
      )
    },
  })

  const domainMutation = useMutation({
    mutationFn: (action: "bind" | "verify" | "unbind") => {
      if (!activePortfolio) throw new Error("No active portfolio")
      const revisionBody = {
        expectedRevision: activePortfolio.revision,
        idempotencyKey: crypto.randomUUID(),
      }
      if (action === "bind") {
        return portfolioApi.bindDomain(teamId, activePortfolio.id, {
          ...revisionBody,
          domain: settingsDraft.domain.trim(),
        })
      }
      return action === "verify"
        ? portfolioApi.verifyDomain(teamId, activePortfolio.id, revisionBody)
        : portfolioApi.unbindDomain(teamId, activePortfolio.id, revisionBody)
    },
    onSuccess: ({ item }) => {
      queryClient.setQueryData<PortfolioList>(queryKey, (current) =>
        replacePortfolio(current, item),
      )
      setSettingsDraft((current) => ({
        ...current,
        domain: item.customDomain?.domain ?? "",
      }))
    },
  })
  const archiveMutation = useMutation({
    mutationFn: (portfolio: TeamPortfolioModel) =>
      portfolioApi.archive(teamId, portfolio.id, {
        expectedRevision: portfolio.revision,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<PortfolioList>(queryKey, (current) =>
        removePortfolio(current, item.id),
      )
      queryClient.setQueryData<PortfolioList>(archivedQueryKey, (current) =>
        replacePortfolio(current, item),
      )
      if (item.publicSlug) {
        queryClient.removeQueries({
          queryKey: ["public-portfolio", item.publicSlug],
          exact: true,
        })
      }
      setActivePortfolioId(null)
      setArchiveTarget(null)
    },
  })
  const restoreMutation = useMutation({
    mutationFn: (portfolio: TeamPortfolioModel) =>
      portfolioApi.restore(teamId, portfolio.id, {
        expectedRevision: portfolio.revision,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<PortfolioList>(archivedQueryKey, (current) =>
        removePortfolio(current, item.id),
      )
      queryClient.setQueryData<PortfolioList>(queryKey, (current) =>
        replacePortfolio(current, item),
      )
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (portfolio: TeamPortfolioModel) =>
      portfolioApi.permanentlyDelete(teamId, portfolio.id, {
        expectedRevision: portfolio.revision,
        confirmation: "permanent-delete",
      }),
    onSuccess: ({ id }) => {
      queryClient.setQueryData<PortfolioList>(archivedQueryKey, (current) =>
        removePortfolio(current, id),
      )
      setDeleteTarget(null)
    },
  })
  const maxDailyViews = Math.max(
    1,
    ...(analyticsQuery.data?.days.map((day) => day.views) ?? []),
  )
  const settingsError = settingsMutation.error ?? domainMutation.error

  return (
    <PageFrame>
      <WorkspaceHeader
        title="作品集"
        actions={
          activePortfolio ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openSettings}>
                <Settings2 />
                发布设置
              </Button>
              {activePortfolio.state === "已公开" && activePortfolio.publicSlug ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/portfolio/${encodeURIComponent(activePortfolio.publicSlug ?? "")}`,
                      "_blank",
                    )
                  }
                >
                  <ExternalLink />
                  查看公开页
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                title={
                  activePortfolio.contents.length &&
                  activePortfolio.contents.every((content) => content.downloadAvailable)
                    ? undefined
                    : "需要至少一个源文件可用的已通过成片"
                }
                disabled={
                  activePortfolio.state !== "已公开" &&
                  (!activePortfolio.contents.length ||
                    activePortfolio.contents.some(
                      (content) => !content.downloadAvailable,
                    ))
                }
                onClick={() =>
                  setPublicationAction(
                    activePortfolio.state === "已公开" ? "unpublish" : "publish",
                  )
                }
              >
                <Globe2 />
                {activePortfolio.state === "已公开" ? "撤回公开" : "发布作品集"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCandidateOpen(true)}>
                <Plus />
                添加已通过成片
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setArchiveTarget(activePortfolio)}
              >
                <Archive />
                移入回收站
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActivePortfolioId(null)
                  setShowArchived((current) => !current)
                }}
              >
                {showArchived ? <ArrowLeft /> : <Archive />}
                {showArchived ? "返回作品集" : "回收站"}
              </Button>
              {!showArchived ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  新建作品集
                </Button>
              ) : null}
            </div>
          )
        }
      />

      <div data-scroll-owner className="min-h-0 flex-1 overflow-y-auto">
        {visibleQuery.isPending ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              正在载入作品集
            </span>
          </div>
        ) : visibleQuery.isError ? (
          <EmptyState
            className="mx-3 my-6 min-h-72 border border-dashed border-border"
            icon={<RefreshCw />}
            title="作品集载入失败"
            detail={messageFrom(visibleQuery.error)}
            action={
              <Button size="sm" variant="outline" onClick={() => visibleQuery.refetch()}>
                <RefreshCw />
                重新载入
              </Button>
            }
          />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {activePortfolio ? (
              <motion.div
                key={activePortfolio.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActivePortfolioId(null)}
                  >
                    <ArrowLeft />
                    返回
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold">
                      {activePortfolio.title}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {activePortfolio.category} · {activePortfolio.contents.length}{" "}
                      项已通过内容
                    </p>
                  </div>
                  <span className="border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                    {activePortfolio.state}
                  </span>
                </div>

                <section className="border-b border-border px-4 py-5 sm:px-5">
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {activePortfolio.description || "尚未填写作品集简介。"}
                  </p>
                </section>

                {activePortfolio.contents.length ? (
                  <div className="grid auto-rows-[minmax(160px,auto)] grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-12">
                    {activePortfolio.contents.map((content, index) => (
                      <button
                        key={content.id}
                        type="button"
                        onClick={() => setPreviewContent(content)}
                        className={cn(
                          "group relative min-h-48 overflow-hidden border border-border bg-background text-left outline-none transition-colors hover:border-foreground/35 focus-visible:ring-2 focus-visible:ring-primary",
                          content.featured
                            ? "sm:col-span-2 xl:col-span-8 xl:row-span-2 xl:min-h-[430px]"
                            : "xl:col-span-4",
                        )}
                      >
                        <div className="absolute inset-0">
                          <PortfolioVisual
                            src={content.thumbnailUrl}
                            alt={`${content.title}预览`}
                            eager={index === 0}
                          />
                        </div>
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 border-t border-border bg-background/94 p-3">
                          <span className="min-w-0">
                            <strong className="block truncate text-sm font-semibold">
                              {content.title}
                            </strong>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {content.projectName} · {content.version}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Film className="size-3.5" />
                            {content.duration ?? content.kind}
                          </span>
                        </div>
                        {content.featured ? (
                          <span className="absolute top-3 left-3 grid size-11 place-items-center border border-white/40 bg-black/45 text-white">
                            <Play className="size-5 fill-current" />
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    className="mx-3 my-6 min-h-72 border border-dashed border-border"
                    icon={<Film />}
                    title="这个作品集还没有成片"
                    detail="从审片已通过的具体版本中选择内容，作品集会保留项目、版本与素材来源。"
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCandidateOpen(true)}
                      >
                        <Plus />
                        添加已通过成片
                      </Button>
                    }
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="portfolio-index"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="p-3"
              >
                {visiblePortfolios.length ? (
                  <div
                    className={cn(
                      workspaceCardGridClassName,
                      "sm:grid-cols-2 lg:grid-cols-4",
                    )}
                  >
                    {visiblePortfolios.map((portfolio, index) => {
                      const cover =
                        portfolio.contents.find((content) => content.featured) ??
                        portfolio.contents[0]
                      return (
                        <article
                          key={portfolio.id}
                          className="group border border-border bg-background"
                        >
                          <button
                            type="button"
                            disabled={showArchived}
                            onClick={() => setActivePortfolioId(portfolio.id)}
                            className={cn(
                              workspaceInteractiveCardClassName,
                              "block w-full border-0 text-left disabled:pointer-events-none disabled:opacity-100",
                            )}
                          >
                            <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-muted">
                              <PortfolioVisual
                                src={cover?.thumbnailUrl ?? null}
                                alt={`${portfolio.title}作品集封面`}
                                eager={index === 0}
                              />
                              <span className="absolute top-2 left-2 border border-white/35 bg-black/55 px-2 py-1 text-xs font-medium text-white">
                                {showArchived ? "已归档" : portfolio.state}
                              </span>
                              <span className="absolute right-2 bottom-2 flex items-center gap-1 bg-background/92 px-2 py-1 text-xs font-medium">
                                <FolderOpen className="size-3" />
                                {portfolio.contents.length}
                              </span>
                            </div>
                            <div className="p-3">
                              <h2 className="truncate text-sm font-semibold">
                                {portfolio.title}
                              </h2>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {portfolio.category} · {portfolio.year}
                              </p>
                              <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                                {portfolio.description || "尚未填写作品集简介。"}
                              </p>
                              <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                                <span>{portfolio.contents.length} 项内容</span>
                                <span>{formatUpdatedAt(portfolio.updatedAt)}</span>
                              </div>
                            </div>
                          </button>
                          {showArchived ? (
                            <div className="flex items-center justify-end gap-1 border-t border-border p-2">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                title={`永久删除 ${portfolio.title}`}
                                aria-label={`永久删除 ${portfolio.title}`}
                                disabled={
                                  deleteMutation.isPending &&
                                  deleteMutation.variables?.id === portfolio.id
                                }
                                onClick={() => setDeleteTarget(portfolio)}
                              >
                                {deleteMutation.isPending &&
                                deleteMutation.variables?.id === portfolio.id ? (
                                  <LoaderCircle className="animate-spin" />
                                ) : (
                                  <Trash2 />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  (restoreMutation.isPending &&
                                    restoreMutation.variables?.id === portfolio.id) ||
                                  (deleteMutation.isPending &&
                                    deleteMutation.variables?.id === portfolio.id)
                                }
                                onClick={() => restoreMutation.mutate(portfolio)}
                              >
                                {restoreMutation.isPending &&
                                restoreMutation.variables?.id === portfolio.id ? (
                                  <LoaderCircle className="animate-spin" />
                                ) : (
                                  <RotateCcw />
                                )}
                                恢复
                              </Button>
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState
                    className="mx-3 my-6 min-h-72 border border-dashed border-border"
                    icon={<FolderOpen />}
                    title={showArchived ? "回收站为空" : "当前团队还没有作品集"}
                    detail={
                      showArchived
                        ? "移入回收站的作品集会保留内容与历史引用。"
                        : "创建团队作品集，再从审片已通过的成片版本中组织内容。"
                    }
                    action={
                      showArchived ? undefined : (
                        <Button size="sm" onClick={() => setCreateOpen(true)}>
                          <Plus />
                          新建作品集
                        </Button>
                      )
                    }
                  />
                )}
                {restoreMutation.isError ? (
                  <p role="alert" className="mt-3 text-xs text-destructive">
                    {messageFrom(restoreMutation.error)}
                  </p>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>发布设置</DialogTitle>
            <DialogDescription>{activePortfolio?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[min(68vh,42rem)] gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1.25fr)_minmax(16rem,.75fr)]">
            <section className="space-y-5 border border-border p-4">
              <div>
                <h3 className="text-xs font-semibold">公开主题</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {themeOptions.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      aria-pressed={settingsDraft.themePreset === theme.id}
                      onClick={() =>
                        setSettingsDraft((current) => ({
                          ...current,
                          themePreset: theme.id,
                        }))
                      }
                      className={cn(
                        "relative min-h-20 border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                        settingsDraft.themePreset === theme.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/45",
                      )}
                    >
                      <strong className="block text-xs font-semibold">
                        {theme.label}
                      </strong>
                      <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                        {theme.detail}
                      </span>
                      {settingsDraft.themePreset === theme.id ? (
                        <Check className="absolute top-2 right-2 size-3.5 text-primary" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold"
                  htmlFor="portfolio-seo-title"
                >
                  搜索标题
                </label>
                <Input
                  id="portfolio-seo-title"
                  value={settingsDraft.seoTitle}
                  maxLength={70}
                  placeholder={activePortfolio?.title}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      seoTitle: event.target.value,
                    }))
                  }
                />
                <label
                  className="block pt-2 text-xs font-semibold"
                  htmlFor="portfolio-seo-description"
                >
                  搜索摘要
                </label>
                <Textarea
                  id="portfolio-seo-description"
                  value={settingsDraft.seoDescription}
                  maxLength={160}
                  placeholder={activePortfolio?.description}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      seoDescription: event.target.value,
                    }))
                  }
                />
              </div>
              <Button
                size="sm"
                disabled={settingsMutation.isPending}
                onClick={() => settingsMutation.mutate()}
              >
                {settingsMutation.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Check />
                )}
                保存发布设置
              </Button>
            </section>

            <div className="space-y-4">
              <section className="border border-border p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold">近 30 天访问</h3>
                </div>
                {analyticsQuery.isPending ? (
                  <LoaderCircle className="mt-4 size-4 animate-spin text-muted-foreground" />
                ) : analyticsQuery.isError ? (
                  <p className="mt-3 text-xs text-destructive">
                    {messageFrom(analyticsQuery.error)}
                  </p>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-2 border-y border-border py-3">
                      <div>
                        <strong className="block text-xl font-semibold tabular-nums">
                          {analyticsQuery.data?.totalViews ?? 0}
                        </strong>
                        <span className="text-xs text-muted-foreground">访问</span>
                      </div>
                      <div className="border-l border-border pl-3">
                        <strong className="block text-xl font-semibold tabular-nums">
                          {analyticsQuery.data?.uniqueVisitors ?? 0}
                        </strong>
                        <span className="text-xs text-muted-foreground">访客</span>
                      </div>
                    </div>
                    <div
                      className="mt-3 flex h-12 items-end gap-1"
                      role="img"
                      aria-label="每日访问趋势"
                    >
                      {(analyticsQuery.data?.days ?? []).slice(-14).map((day) => (
                        <span
                          key={day.date}
                          title={`${day.date} · ${day.views} 次访问`}
                          className="min-h-0.5 flex-1 bg-primary/55"
                          style={{
                            height: `${Math.max(8, (day.views / maxDailyViews) * 100)}%`,
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>

              <section className="border border-border p-4">
                <div className="flex items-center gap-2">
                  <Globe2 className="size-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold">自定义域名</h3>
                </div>
                {activePortfolio?.customDomain ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                      <span className="truncate text-xs font-medium">
                        {activePortfolio.customDomain.domain}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activePortfolio.customDomain.status === "verified"
                          ? "已验证"
                          : "待验证"}
                      </span>
                    </div>
                    {activePortfolio.customDomain.status === "pending" ? (
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <p>在 DNS 中添加 TXT 记录：</p>
                        {[
                          activePortfolio.customDomain.verificationName,
                          activePortfolio.customDomain.verificationValue,
                        ].map((value) => (
                          <div
                            key={value}
                            className="flex min-w-0 items-center gap-1 border border-border bg-muted/35 pl-2"
                          >
                            <code className="min-w-0 flex-1 truncate py-2">{value}</code>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title="复制"
                              aria-label="复制 DNS 记录"
                              onClick={() => navigator.clipboard.writeText(value)}
                            >
                              <Copy />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      {activePortfolio.customDomain.status === "pending" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={domainMutation.isPending}
                          onClick={() => domainMutation.mutate("verify")}
                        >
                          <RefreshCw />
                          检查 DNS
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={domainMutation.isPending}
                        onClick={() => domainMutation.mutate("unbind")}
                      >
                        解除绑定
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <Input
                      aria-label="自定义域名"
                      value={settingsDraft.domain}
                      placeholder="show.example.com"
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          domain: event.target.value,
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!settingsDraft.domain.trim() || domainMutation.isPending}
                      onClick={() => domainMutation.mutate("bind")}
                    >
                      绑定
                    </Button>
                  </div>
                )}
              </section>
            </div>
          </div>
          {settingsError ? (
            <p role="alert" className="text-xs text-destructive">
              {messageFrom(settingsError)}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建作品集</DialogTitle>
            <DialogDescription>
              作品集属于当前团队，可以组织多个项目的已通过成片。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              aria-label="作品集名称"
              value={draftPortfolio.title}
              onChange={(event) =>
                setDraftPortfolio((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="作品集名称"
            />
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Input
                aria-label="作品集类别"
                value={draftPortfolio.category}
                onChange={(event) =>
                  setDraftPortfolio((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                placeholder="类别，如品牌短片"
              />
              <Input
                aria-label="作品集年份"
                value={draftPortfolio.year}
                onChange={(event) =>
                  setDraftPortfolio((current) => ({
                    ...current,
                    year: event.target.value,
                  }))
                }
                placeholder="年份"
              />
            </div>
            <Textarea
              aria-label="作品集简介"
              value={draftPortfolio.description}
              onChange={(event) =>
                setDraftPortfolio((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="一句话说明作品集的创作主题"
            />
            {createMutation.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {messageFrom(createMutation.error)}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                !draftPortfolio.title.trim() ||
                !draftPortfolio.year.trim() ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              创建作品集
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={candidateOpen} onOpenChange={setCandidateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>添加已通过成片</DialogTitle>
            <DialogDescription>
              候选内容来自当前团队审片已通过的具体视频版本。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto pr-1">
            {candidateQuery.isPending ? (
              <div className="grid min-h-32 place-items-center text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
              </div>
            ) : candidateQuery.isError ? (
              <p
                role="alert"
                className="border border-destructive/25 p-3 text-xs text-destructive"
              >
                {messageFrom(candidateQuery.error)}
              </p>
            ) : candidateQuery.data?.items.length ? (
              candidateQuery.data.items.map((candidate) => {
                const exists = activePortfolio?.contents.some(
                  (content) => content.reviewFileId === candidate.reviewFileId,
                )
                return (
                  <button
                    key={candidate.reviewFileId}
                    type="button"
                    disabled={exists || addContentMutation.isPending}
                    onClick={() => addContentMutation.mutate(candidate)}
                    className="flex min-h-16 w-full items-center gap-3 border border-border p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="grid size-10 shrink-0 place-items-center bg-muted text-muted-foreground">
                      <Film className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-medium">
                        {candidate.title}
                      </strong>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {candidate.projectName} · {candidate.version} ·{" "}
                        {candidate.duration ?? "时长待定"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {exists ? "已添加" : "添加"}
                    </span>
                  </button>
                )
              })
            ) : (
              <div className="border border-dashed border-border p-5 text-center text-xs leading-5 text-muted-foreground">
                当前团队还没有同时完成素材入库与审片通过的成片版本。
              </div>
            )}
          </div>
          {addContentMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {messageFrom(addContentMutation.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCandidateOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>将作品集移入回收站</DialogTitle>
            <DialogDescription>
              {archiveTarget?.state === "已公开"
                ? "公开页面与媒体链接会立即停止访问；内容和历史引用仍会保留。"
                : "作品集内容和历史引用会保留，可从回收站恢复。"}
            </DialogDescription>
          </DialogHeader>
          {archiveMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {messageFrom(archiveMutation.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              取消
            </Button>
            <Button
              disabled={archiveMutation.isPending || !archiveTarget}
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget)}
            >
              {archiveMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Archive />
              )}
              确认归档
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) =>
          !open && !deleteMutation.isPending && setDeleteTarget(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>永久删除作品集</DialogTitle>
            <DialogDescription>
              将永久删除“{deleteTarget?.title}
              ”、内容编排与访问统计；素材库和审片源文件不受影响。此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {messageFrom(deleteMutation.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              {deleteMutation.isPending ? "正在永久删除" : "确认永久删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={publicationAction !== null}
        onOpenChange={(open) => !open && setPublicationAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {publicationAction === "publish" ? "发布作品集" : "撤回公开"}
            </DialogTitle>
            <DialogDescription>
              {publicationAction === "publish"
                ? "发布后，任何获得公开链接的人都可以查看其中的成片。"
                : "撤回后，现有公开链接将立即停止访问。"}
            </DialogDescription>
          </DialogHeader>
          {publicationMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {messageFrom(publicationMutation.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublicationAction(null)}>
              取消
            </Button>
            <Button
              disabled={publicationMutation.isPending}
              onClick={() => publicationMutation.mutate()}
            >
              {publicationMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Globe2 />
              )}
              {publicationAction === "publish" ? "确认发布" : "确认撤回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewContent !== null}
        onOpenChange={(open) => !open && setPreviewContent(null)}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewContent?.title}</DialogTitle>
            <DialogDescription>
              {previewContent?.projectName} · {previewContent?.version} · 已通过
            </DialogDescription>
          </DialogHeader>
          <div className="relative aspect-video overflow-hidden border border-border bg-muted">
            <PortfolioVisual
              src={previewContent?.thumbnailUrl ?? null}
              alt={`${previewContent?.title ?? "成片"}预览`}
              eager
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-14 place-items-center border border-white/45 bg-black/45 text-white">
                <Play className="size-6 fill-current" />
              </span>
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewContent(null)}>
              关闭
            </Button>
            <Button
              variant="outline"
              disabled={!previewContent?.downloadAvailable}
              onClick={() => {
                if (previewContent?.downloadAvailable) {
                  window.open(
                    assetApi.contentUrl(teamId, previewContent.assetId),
                    "_blank",
                  )
                }
              }}
            >
              <Download />
              {previewContent?.downloadAvailable ? "下载成片" : "源文件未入库"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
