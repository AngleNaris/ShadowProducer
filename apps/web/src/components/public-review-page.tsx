"use client"

import type {
  PublicReviewFile,
  PublicReviewWorkspace,
  ReviewComment,
  ReviewIdentityChallenge,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Download,
  Film,
  LoaderCircle,
  Mail,
  MessageSquare,
  Pause,
  Play,
  Reply,
  Send,
  ShieldCheck,
  SplitSquareHorizontal,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { MediaPlayer } from "@/components/media-player"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, reviewLinkApi } from "@/lib/api-client"
import { cn } from "@/lib/utils"

function formatTime(value: number) {
  const seconds = Math.max(0, value)
  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60
  const milliseconds = Math.floor((seconds - wholeSeconds) * 1000)
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
}

function timecodeToSeconds(value: string) {
  const seconds = value.split(":").reduce((total, part) => total * 60 + Number(part), 0)
  return Number.isFinite(seconds) ? seconds : 0
}

function PublicReviewEntry({
  token,
  onOpen,
}: {
  token: string
  onOpen: (workspace: PublicReviewWorkspace) => void
}) {
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [challenge, setChallenge] = useState<ReviewIdentityChallenge | null>(null)
  const requestMutation = useMutation({
    mutationFn: () =>
      reviewLinkApi.requestIdentity(token, {
        displayName: displayName.trim(),
        email: email.trim(),
        password: password || undefined,
      }),
    onSuccess: setChallenge,
  })
  const openMutation = useMutation({
    mutationFn: () =>
      reviewLinkApi.openSession(token, challenge?.challengeId ?? "", code),
    onSuccess: onOpen,
  })

  return (
    <main className="dark grid min-h-svh place-items-center bg-media-base p-4 text-foreground">
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm border border-border bg-media-panel p-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (challenge) openMutation.mutate()
          else requestMutation.mutate()
        }}
      >
        <Film className="mb-5 size-6 text-primary" />
        <h1 className="text-lg font-semibold">客户审片</h1>
        <div className="mt-5 grid gap-4">
          {challenge ? (
            <>
              <div className="flex items-center gap-3 border border-white/10 px-3 py-2.5">
                <Mail className="size-4 text-support" />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {challenge.emailMasked}
                </span>
                <button
                  type="button"
                  className="text-xs text-white/55 hover:text-white"
                  onClick={() => {
                    setChallenge(null)
                    setCode("")
                    requestMutation.reset()
                    openMutation.reset()
                  }}
                >
                  更换
                </button>
              </div>
              <label
                htmlFor="review-identity-code"
                className="grid gap-1.5 text-xs font-medium"
              >
                邮箱验证码
                <Input
                  id="review-identity-code"
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
              </label>
              {challenge.developmentCode ? (
                <p className="border-l-2 border-support px-3 font-mono text-xs text-white/65">
                  本地验证码 {challenge.developmentCode}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <label
                htmlFor="review-guest-name"
                className="grid gap-1.5 text-xs font-medium"
              >
                你的名字
                <Input
                  id="review-guest-name"
                  autoComplete="name"
                  autoFocus
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <label
                htmlFor="review-guest-email"
                className="grid gap-1.5 text-xs font-medium"
              >
                邮箱
                <Input
                  id="review-guest-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label
                htmlFor="review-guest-password"
                className="grid gap-1.5 text-xs font-medium"
              >
                访问密码
                <Input
                  id="review-guest-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            </>
          )}
          {requestMutation.isError || openMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {(requestMutation.error ?? openMutation.error)?.message}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={
              challenge
                ? code.length !== 6 || openMutation.isPending
                : !displayName.trim() || !email.trim() || requestMutation.isPending
            }
          >
            {openMutation.isPending || requestMutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : challenge ? (
              <ShieldCheck />
            ) : (
              <Mail />
            )}
            {challenge
              ? openMutation.isPending
                ? "正在验证"
                : "验证并进入"
              : requestMutation.isPending
                ? "正在发送"
                : "发送验证码"}
          </Button>
        </div>
      </motion.form>
    </main>
  )
}

function ReviewFileList({
  workspace,
  selectedId,
  compareId,
  onSelect,
  onCompare,
}: {
  workspace: PublicReviewWorkspace
  selectedId: string
  compareId: string | null
  onSelect: (file: PublicReviewFile) => void
  onCompare: (file: PublicReviewFile | null) => void
}) {
  return (
    <aside className="flex min-h-0 flex-col border-b border-white/10 bg-media-panel lg:border-r lg:border-b-0">
      <div className="flex min-h-14 items-center border-b border-white/10 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{workspace.projectName}</h2>
          <p className="truncate text-xs text-white/50">
            {workspace.files.length} 个版本
          </p>
        </div>
      </div>
      <div data-scroll-owner className="min-h-0 flex-1 overflow-y-auto p-2">
        {workspace.files.map((file) => {
          const selected = file.id === selectedId
          const compared = file.id === compareId
          return (
            <div
              key={file.id}
              className={cn(
                "mb-1 flex min-h-14 items-center border border-transparent",
                selected && "border-primary/60 bg-primary/12",
                compared && "border-support/60 bg-support/10",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(file)}
                className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-white/5"
              >
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="mt-0.5 block text-xs text-white/50">
                  {file.version} · {file.status}
                </span>
              </button>
              {workspace.scope.canCompare && file.id !== selectedId ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={compared ? "取消对比" : `对比 ${file.version}`}
                  className="mr-1 text-white/60 hover:bg-white/10 hover:text-white"
                  onClick={() => onCompare(compared ? null : file)}
                >
                  <SplitSquareHorizontal />
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function PublicReviewWorkspaceView({ workspace }: { workspace: PublicReviewWorkspace }) {
  const queryClient = useQueryClient()
  const primaryVideoRef = useRef<HTMLVideoElement>(null)
  const compareVideoRef = useRef<HTMLVideoElement>(null)
  const [selectedId, setSelectedId] = useState(workspace.files[0]?.id ?? "")
  const [compareId, setCompareId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [replyingTo, setReplyingTo] = useState<ReviewComment | null>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const selected = workspace.files.find((file) => file.id === selectedId)
  const compared = workspace.files.find((file) => file.id === compareId) ?? null

  const commentsQuery = useQuery({
    queryKey: ["public-review-comments", workspace.linkId, selectedId],
    queryFn: () => reviewLinkApi.listComments(workspace.linkId, selectedId),
    enabled: Boolean(selectedId),
  })
  const mediaQuery = useQuery({
    queryKey: ["public-review-media", workspace.linkId, selectedId],
    queryFn: () => reviewLinkApi.getContentUrl(workspace.linkId, selectedId),
    enabled: Boolean(selectedId),
    staleTime: 4 * 60 * 1000,
  })
  const compareMediaQuery = useQuery({
    queryKey: ["public-review-media", workspace.linkId, compareId],
    queryFn: () => reviewLinkApi.getContentUrl(workspace.linkId, compareId ?? ""),
    enabled: Boolean(compareId),
    staleTime: 4 * 60 * 1000,
  })
  const reviewComments = commentsQuery.data?.items ?? []
  const rootComments = reviewComments.filter(
    (comment) => comment.parentCommentId === null,
  )
  const repliesFor = (commentId: string) =>
    reviewComments.filter((comment) => comment.parentCommentId === commentId)

  const resetPlayback = () => {
    primaryVideoRef.current?.pause()
    compareVideoRef.current?.pause()
    if (primaryVideoRef.current) primaryVideoRef.current.currentTime = 0
    if (compareVideoRef.current) compareVideoRef.current.currentTime = 0
    setPlaying(false)
    setTime(0)
    setDuration(primaryVideoRef.current?.duration || 0)
  }

  const createCommentMutation = useMutation({
    mutationFn: () =>
      reviewLinkApi.createComment(workspace.linkId, selectedId, {
        version: selected?.version ?? "",
        timecode: replyingTo?.timecode ?? formatTime(time),
        text: draft.trim(),
        parentCommentId: replyingTo?.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<{ items: ReviewComment[] }>(
        ["public-review-comments", workspace.linkId, selectedId],
        (current) => ({ items: [...(current?.items ?? []), item] }),
      )
      setDraft("")
      setReplyingTo(null)
    },
  })
  const approveMutation = useMutation({
    mutationFn: () =>
      reviewLinkApi.approve(workspace.linkId, selectedId, {
        expectedRevision: selected?.revision ?? 1,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (item) => {
      queryClient.setQueryData<PublicReviewWorkspace>(
        ["public-review-workspace", workspace.linkId],
        (current) =>
          current
            ? {
                ...current,
                files: current.files.map((file) => (file.id === item.id ? item : file)),
              }
            : current,
      )
    },
  })
  const downloadMutation = useMutation({
    mutationFn: () => reviewLinkApi.getContentUrl(workspace.linkId, selectedId, true),
    onSuccess: ({ url }) => window.location.assign(url),
  })

  const seek = (next: number) => {
    const bounded = Math.max(0, Math.min(duration || 0, next))
    if (primaryVideoRef.current) primaryVideoRef.current.currentTime = bounded
    if (compareVideoRef.current) compareVideoRef.current.currentTime = bounded
    setTime(bounded)
  }
  const togglePlayback = () => {
    const primary = primaryVideoRef.current
    if (!primary) return
    const videos = [primary, compareVideoRef.current].filter(
      (video): video is HTMLVideoElement => Boolean(video),
    )
    if (playing) {
      videos.forEach((video) => {
        video.pause()
      })
      setPlaying(false)
      return
    }
    void Promise.allSettled(videos.map((video) => video.play())).then(() =>
      setPlaying(!primary.paused && !primary.ended),
    )
  }

  if (!selected) {
    return (
      <main className="dark grid min-h-svh place-items-center bg-media-base text-white/60">
        当前链接没有可审阅版本
      </main>
    )
  }

  return (
    <main className="dark flex min-h-svh flex-col bg-media-base text-white">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-media-panel px-4 py-2">
        <Film className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{selected.name}</h1>
          <p className="truncate text-xs text-white/50">
            {selected.version} · {workspace.displayName} ·{" "}
            {workspace.verifiedIdentity.emailMasked}
          </p>
        </div>
        {downloadMutation.isError ? (
          <span role="alert" className="text-xs text-destructive">
            {downloadMutation.error.message}
          </span>
        ) : null}
        {workspace.scope.canDownload ? (
          <Button
            variant="outline"
            size="sm"
            disabled={downloadMutation.isPending}
            className="border-white/15 bg-transparent text-white hover:bg-white/10"
            onClick={() => downloadMutation.mutate()}
          >
            {downloadMutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Download />
            )}
            下载
          </Button>
        ) : null}
        {workspace.scope.canApprove ? (
          <Button
            size="sm"
            variant={selected.status === "已通过" ? "secondary" : "outline"}
            disabled={selected.status === "已通过" || approveMutation.isPending}
            className="border-white/15 bg-transparent text-white hover:bg-white/10"
            onClick={() => approveMutation.mutate()}
          >
            {approveMutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CheckCircle2 />
            )}
            {selected.status === "已通过" ? "已确认" : "确认成片"}
          </Button>
        ) : null}
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[220px_minmax(0,1fr)_320px] lg:overflow-hidden">
        <ReviewFileList
          workspace={workspace}
          selectedId={selectedId}
          compareId={compareId}
          onSelect={(file) => {
            resetPlayback()
            setReplyingTo(null)
            setSelectedId(file.id)
            if (compareId === file.id) setCompareId(null)
          }}
          onCompare={(file) => {
            resetPlayback()
            setCompareId(file?.id ?? null)
          }}
        />

        <section
          className="flex min-h-[22rem] min-w-0 flex-col bg-black"
          aria-label="审片播放器"
        >
          <div className={cn("grid min-h-0 flex-1", compared && "md:grid-cols-2")}>
            <div className="relative grid min-h-64 place-items-center border-white/10 md:border-r">
              {mediaQuery.isPending ? (
                <LoaderCircle className="size-5 animate-spin text-white/50" />
              ) : mediaQuery.isError ? (
                <p className="px-5 text-center text-xs text-destructive">
                  {mediaQuery.error.message}
                </p>
              ) : (
                <MediaPlayer
                  mediaRef={primaryVideoRef}
                  src={mediaQuery.data.url}
                  label={`审片 A ${selected.version}`}
                  controls={false}
                  className="aspect-video w-full"
                  onLoadedMetadata={(video) => setDuration(video.duration || 0)}
                  onTimeUpdate={(video) => {
                    const next = video.currentTime
                    setTime(next)
                    const compareVideo = compareVideoRef.current
                    if (
                      compareVideo &&
                      Math.abs(compareVideo.currentTime - next) > 0.25
                    ) {
                      compareVideo.currentTime = next
                    }
                  }}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                />
              )}
              <span className="absolute left-2 top-2 bg-media-panel/90 px-2 py-1 text-xs">
                A · {selected.version}
              </span>
            </div>
            {compared ? (
              <div className="relative grid min-h-64 place-items-center">
                {compareMediaQuery.isPending ? (
                  <LoaderCircle className="size-5 animate-spin text-white/50" />
                ) : compareMediaQuery.isError ? (
                  <p className="px-5 text-center text-xs text-destructive">
                    {compareMediaQuery.error.message}
                  </p>
                ) : (
                  <MediaPlayer
                    mediaRef={compareVideoRef}
                    src={compareMediaQuery.data.url}
                    label={`审片 B ${compared.version}`}
                    controls={false}
                    muted
                    startTime={time}
                    autoPlay={playing}
                    className="aspect-video w-full"
                  />
                )}
                <span className="absolute left-2 top-2 bg-media-panel/90 px-2 py-1 text-xs">
                  B · {compared.version}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-t border-white/10 bg-media-panel lg:border-t-0 lg:border-l">
          <div className="flex min-h-14 items-center gap-2 border-b border-white/10 px-4">
            <MessageSquare className="size-4 text-white/60" />
            <h2 className="text-sm font-semibold">审阅意见</h2>
            <span className="ml-auto text-xs text-white/45">
              {commentsQuery.data?.items.length ?? 0}
            </span>
          </div>
          <div
            data-scroll-owner
            className="min-h-52 flex-1 overflow-y-auto p-3 lg:min-h-0"
          >
            {commentsQuery.isPending ? (
              <div className="grid min-h-24 place-items-center">
                <LoaderCircle className="size-4 animate-spin text-white/50" />
              </div>
            ) : commentsQuery.isError ? (
              <p className="text-xs text-destructive">{commentsQuery.error.message}</p>
            ) : rootComments.length ? (
              <div className="space-y-2">
                {rootComments.map((comment) => (
                  <article key={comment.id} className="border border-white/10">
                    <div className="flex items-start gap-1 p-1">
                      <button
                        type="button"
                        className="min-w-0 flex-1 p-2 text-left hover:bg-white/5"
                        onClick={() => seek(timecodeToSeconds(comment.timecode))}
                      >
                        <span className="flex items-center gap-2 text-xs font-medium">
                          {comment.author}
                          <time className="ml-auto font-mono text-xs text-primary">
                            {comment.timecode}
                          </time>
                        </span>
                        <span className="mt-2 block text-xs leading-5 text-white/75">
                          {comment.text}
                        </span>
                      </button>
                      {workspace.scope.canComment ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`回复 ${comment.author}`}
                          className="shrink-0 text-white/55 hover:bg-white/10 hover:text-white"
                          onClick={() => {
                            setReplyingTo(comment)
                            setDraft("")
                          }}
                        >
                          <Reply />
                        </Button>
                      ) : null}
                    </div>
                    {repliesFor(comment.id).map((reply) => (
                      <button
                        key={reply.id}
                        type="button"
                        className="ml-6 block w-[calc(100%-1.5rem)] border-l border-white/10 px-3 py-2 text-left hover:bg-white/5"
                        onClick={() => seek(timecodeToSeconds(reply.timecode))}
                      >
                        <span className="flex items-center gap-2 text-xs font-medium">
                          {reply.author}
                          <time className="ml-auto font-mono text-primary">
                            {reply.timecode}
                          </time>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-white/65">
                          {reply.text}
                        </span>
                      </button>
                    ))}
                  </article>
                ))}
              </div>
            ) : (
              <p className="p-4 text-center text-xs text-white/45">暂无意见</p>
            )}
          </div>
        </aside>
      </section>

      <footer className="grid shrink-0 gap-3 border-t border-white/10 bg-media-panel p-3 lg:grid-cols-[minmax(18rem,1fr)_minmax(20rem,32rem)]">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={playing ? "暂停" : "播放"}
            className="text-white hover:bg-white/10"
            disabled={!mediaQuery.data}
            onClick={togglePlayback}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <span className="w-24 shrink-0 font-mono text-xs text-white/65">
            {formatTime(time)}
          </span>
          <input
            type="range"
            aria-label="播放位置"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(time, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            className="min-w-0 flex-1 accent-primary"
          />
        </div>
        {workspace.scope.canComment ? (
          <div className="min-w-0">
            {replyingTo ? (
              <div className="mb-2 flex min-w-0 items-start gap-2 border-l-2 border-primary bg-white/5 px-2 py-1.5">
                <Reply className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">回复 {replyingTo.author}</p>
                  <p className="truncate text-xs text-white/50">{replyingTo.text}</p>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="取消回复"
                  className="text-white/55 hover:bg-white/10 hover:text-white"
                  onClick={() => setReplyingTo(null)}
                >
                  <X />
                </Button>
              </div>
            ) : null}
            <div className="flex min-w-0 items-end gap-2">
              <Textarea
                aria-label={replyingTo ? "回复审阅意见" : "添加审阅意见"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  replyingTo
                    ? `${replyingTo.timecode} 回复 ${replyingTo.author}`
                    : `${formatTime(time)} 添加意见`
                }
                className="min-h-11 resize-none border-white/15 bg-black/15 text-white"
              />
              <Button
                type="button"
                size="icon-sm"
                aria-label={replyingTo ? "发送回复" : "发送审阅意见"}
                disabled={!draft.trim() || createCommentMutation.isPending}
                onClick={() => createCommentMutation.mutate()}
              >
                {createCommentMutation.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Send />
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </footer>
    </main>
  )
}

export function PublicReviewPage({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const storageKey = `shadowproducer:review:${token}`
  const [hydrated, setHydrated] = useState(false)
  const [linkId, setLinkId] = useState<string | null>(null)
  const workspaceQuery = useQuery({
    queryKey: ["public-review-workspace", linkId],
    queryFn: () => reviewLinkApi.getWorkspace(linkId ?? ""),
    enabled: hydrated && Boolean(linkId),
    retry: false,
  })

  useEffect(() => {
    setLinkId(window.sessionStorage.getItem(storageKey))
    setHydrated(true)
  }, [storageKey])

  useEffect(() => {
    if (
      !(workspaceQuery.error instanceof ApiError) ||
      workspaceQuery.error.status !== 401
    )
      return
    window.sessionStorage.removeItem(storageKey)
    setLinkId(null)
  }, [storageKey, workspaceQuery.error])

  if (!hydrated || (linkId && workspaceQuery.isPending)) {
    return (
      <main className="dark grid min-h-svh place-items-center bg-media-base text-white/55">
        <LoaderCircle className="size-5 animate-spin" />
      </main>
    )
  }

  if (!linkId || workspaceQuery.isError) {
    return (
      <PublicReviewEntry
        token={token}
        onOpen={(workspace) => {
          window.sessionStorage.setItem(storageKey, workspace.linkId)
          queryClient.setQueryData(
            ["public-review-workspace", workspace.linkId],
            workspace,
          )
          setLinkId(workspace.linkId)
        }}
      />
    )
  }

  return workspaceQuery.data ? (
    <PublicReviewWorkspaceView workspace={workspaceQuery.data} />
  ) : null
}
