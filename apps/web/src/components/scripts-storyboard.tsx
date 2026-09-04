"use client"

import type {
  ScriptPresence,
  ScriptPresenceSnapshot,
  ScriptVersionImpact,
  ScriptWorkspace,
  StoryboardShot,
  TeamAsset,
  UpdateScriptPresenceBody,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Bold,
  Check,
  ChevronDown,
  Columns3,
  FileImage,
  FileText,
  GitBranchPlus,
  GitCompareArrows,
  GitMerge,
  Grid2X2,
  History,
  Italic,
  Link2,
  List,
  LoaderCircle,
  MessageSquarePlus,
  Pause,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Reply,
  RotateCcw,
  SkipBack,
  SkipForward,
  Undo2,
  Unlink,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { IconButton } from "@/components/workspace/icon-button"
import {
  DataTableViewport,
  PaneHeader,
  StatusBadge,
  workspaceCardGridClassName,
  workspaceInteractiveCardClassName,
} from "@/components/workspace/page-elements"
import type { WorkspaceScopedProject } from "@/components/workspace/workspace-data"
import { ApiError, assetApi, scriptApi } from "@/lib/api-client"
import {
  createScriptMergePlan,
  resolveScriptMergePlan,
  type ScriptMergeChoice,
} from "@/lib/script-merge"
import { remoteScriptCursors } from "@/lib/script-presence"
import {
  nextStoryboardShotId,
  parseStoryboardContent,
  type SequencedStoryboardShot as SequencedShot,
  sequenceStoryboardShots,
  serializeStoryboardContent,
  storyboardShotAtTime,
} from "@/lib/storyboard-document"
import { cn } from "@/lib/utils"

type ScriptsStoryboardProps = {
  project: WorkspaceScopedProject
}

type WorkspaceTab = "script" | "storyboard"
type StoryboardView = "cards" | "table" | "layout"

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const remainder = safe - minutes * 60
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`
}

function ShotThumbnail({
  shot,
  asset,
  teamId,
  sizes,
  priority = false,
}: {
  shot: StoryboardShot
  asset?: TeamAsset
  teamId: string
  sizes: string
  priority?: boolean
}) {
  const source =
    asset?.thumbnailUrl ?? (asset ? assetApi.contentUrl(teamId, asset.id) : null)

  return (
    <div className="relative h-full w-full overflow-hidden bg-media-panel">
      {source ? (
        <Image
          src={source}
          alt={`${shot.id} 分镜画面：${asset?.name ?? "素材"}`}
          fill
          priority={priority}
          sizes={sizes}
          unoptimized
          className="object-cover"
          style={{ objectPosition: shot.objectPosition }}
        />
      ) : (
        <div className="grid size-full place-items-center bg-muted/35 text-muted-foreground">
          <span className="flex flex-col items-center gap-2 text-xs">
            <FileImage className="size-7 stroke-[1.4]" />
            {shot.assetId ? "画面素材不可用" : "未关联画面"}
          </span>
        </div>
      )}
      <span className="absolute top-2 left-2 bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
        {shot.id}
      </span>
    </div>
  )
}

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict"
type RealtimeState = "connecting" | "online" | "offline"

type PendingSave = {
  projectId: string
  documentId: string
  versionId: string
  baseContent: string
  content: string
  expectedRevision: number
  idempotencyKey: string
}

type ScriptConflict = {
  pending: PendingSave
  localContent: string
  serverWorkspace: ScriptWorkspace | null
  loadError: string | null
}

type NewVersionDraft = {
  projectId: string
  documentId: string
  content: string
  expectedVersionId: string
  expectedRevision: number
}

const saveStateLabels: Record<SaveState, string> = {
  saved: "已自动保存",
  dirty: "有未保存修改",
  saving: "正在保存",
  error: "保存失败",
  conflict: "检测到新版本",
}

function collaboratorRoleLabel(role: string) {
  return (
    {
      editor: "可编辑",
      producer: "制片",
      director: "导演",
      viewer: "只读",
    }[role] ?? role
  )
}

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function cursorPositionLabel(content: string, position: number) {
  const beforeCursor = content.slice(0, Math.min(Math.max(position, 0), content.length))
  const lines = beforeCursor.split("\n")
  return `第 ${lines.length} 行 · ${(lines.at(-1)?.length ?? 0) + 1} 列`
}

function ScriptVersionPicker({
  label,
  value,
  versions,
  disabledValue,
  onValueChange,
}: {
  label: string
  value: string
  versions: ScriptWorkspace["versions"]
  disabledValue: string
  onValueChange: (value: string) => void
}) {
  const selected = versions.find((item) => item.id === value)
  return (
    <div className="min-w-0 space-y-2">
      <span className="block text-xs font-semibold">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            aria-label={`${label}：${selected?.id ?? "未选择"}`}
          >
            <span className="min-w-0 truncate">
              {selected ? `${selected.id} · ${selected.meta}` : "选择版本"}
            </span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-72">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
            {versions.map((item) => (
              <DropdownMenuRadioItem
                key={item.id}
                value={item.id}
                disabled={item.id === disabledValue}
              >
                <span className="min-w-0">
                  <strong className="block text-xs">{item.id}</strong>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.meta}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function impactRangeLabel(
  versionId: string,
  range: ScriptVersionImpact["changes"][number]["from"],
) {
  if (range.startLine === null || range.endLine === null) return `${versionId} · 无对应行`
  return `${versionId} · 第 ${range.startLine}${range.endLine === range.startLine ? "" : `-${range.endLine}`} 行`
}

function ScriptEditor({
  project,
  documentId,
}: {
  project: WorkspaceScopedProject
  documentId: string
}) {
  const projectId = project.id
  const queryClient = useQueryClient()
  const queryKey = ["script-workspace", projectId, documentId] as const
  const workspaceQuery = useQuery({
    queryKey,
    queryFn: () => scriptApi.getWorkspace(projectId, documentId),
  })
  const [impactFromVersionId, setImpactFromVersionId] = useState("")
  const [impactToVersionId, setImpactToVersionId] = useState("")
  const [editorScopeId, setEditorScopeId] = useState<string | null>(null)
  const [version, setVersion] = useState("")
  const [revision, setRevision] = useState(0)
  const [history, setHistory] = useState({ entries: [""], index: 0 })
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [activeFormat, setActiveFormat] = useState<"bold" | "italic" | null>(null)
  const [overlay, setOverlay] = useState<
    "comment" | "conflict" | "history" | "impact" | "new-version" | null
  >(null)
  const [conflict, setConflict] = useState<ScriptConflict | null>(null)
  const [mergeChoices, setMergeChoices] = useState<Record<string, ScriptMergeChoice>>({})
  const [newVersion, setNewVersion] = useState<NewVersionDraft | null>(null)
  const [newVersionMeta, setNewVersionMeta] = useState("新协作版本")
  const [selection, setSelection] = useState("")
  const [commentDraft, setCommentDraft] = useState("")
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting")
  const [presence, setPresence] = useState<ScriptPresence[]>([])
  const [editorScroll, setEditorScroll] = useState({ left: 0, top: 0 })
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const conflictTriggerRef = useRef<HTMLButtonElement>(null)
  const impactTriggerRef = useRef<HTMLButtonElement>(null)
  const baseContentRef = useRef("")
  const mergePlanKeyRef = useRef<string | null>(null)
  const pendingSaveRef = useRef<PendingSave | null>(null)
  const pendingCommentKeyRef = useRef<string | null>(null)
  const pendingVersionKeyRef = useRef<string | null>(null)
  const activeScopeRef = useRef(`${projectId}:${documentId}`)
  const currentVersionIdRef = useRef<string | null>(null)
  const realtimeStateRef = useRef<RealtimeState>("connecting")
  const presencePayloadRef = useRef<UpdateScriptPresenceBody | null>(null)
  const presenceTimerRef = useRef<number | null>(null)
  const scopeId = `${projectId}:${documentId}`
  activeScopeRef.current = scopeId
  const impactQuery = useQuery({
    queryKey: [
      "script-version-impact",
      projectId,
      documentId,
      impactFromVersionId,
      impactToVersionId,
    ],
    queryFn: () =>
      scriptApi.getVersionImpact(
        projectId,
        impactFromVersionId,
        impactToVersionId,
        documentId,
      ),
    enabled:
      overlay === "impact" &&
      Boolean(impactFromVersionId) &&
      Boolean(impactToVersionId) &&
      impactFromVersionId !== impactToVersionId,
  })

  const workspace = workspaceQuery.data
  const currentVersion = workspace?.versions.find((item) => item.isCurrent)
  const selectedVersion = workspace?.versions.find((item) => item.id === version)
  const isCurrent = version === workspace?.document.currentVersionId
  const canEdit = Boolean(isCurrent && workspace?.permissions.canWrite)
  const draft = history.entries[history.index] ?? ""
  const draftRef = useRef(draft)
  draftRef.current = draft
  const visibleContent = isCurrent ? draft : (selectedVersion?.content ?? "")
  const canUndo = canEdit && history.index > 0
  const canRedo = canEdit && history.index < history.entries.length - 1
  const versionComments =
    workspace?.comments.filter((comment) => comment.versionId === version) ?? []
  const visibleComments = versionComments.filter((comment) => comment.parentId === null)
  const openCommentCount = visibleComments.filter((comment) => !comment.resolved).length
  const replyTo = workspace?.comments.find((comment) => comment.id === replyToId) ?? null
  const conflictServerVersion = conflict?.serverWorkspace?.versions.find(
    (item) => item.isCurrent,
  )
  const mergePlan = useMemo(
    () =>
      conflict && conflictServerVersion
        ? createScriptMergePlan(
            conflict.pending.baseContent,
            conflict.localContent,
            conflictServerVersion.content,
          )
        : null,
    [conflict, conflictServerVersion],
  )
  const mergeConflicts = mergePlan?.filter((segment) => segment.kind === "conflict") ?? []
  const automaticMergeCount =
    mergePlan?.filter((segment) => segment.kind === "automatic").length ?? 0
  const mergePlanKey =
    conflict && conflictServerVersion
      ? `${conflict.pending.idempotencyKey}:${conflictServerVersion.id}:${conflictServerVersion.revision}`
      : null

  const presenceByCollaborator = useMemo(
    () => new Map(presence.map((item) => [item.collaboratorId, item])),
    [presence],
  )
  const remoteCursors = useMemo(
    () =>
      workspace
        ? remoteScriptCursors(
            presence,
            workspace.collaborators,
            workspace.currentAccountId,
            version,
            visibleContent.length,
          )
        : [],
    [presence, version, visibleContent.length, workspace],
  )

  const updateRealtimeState = useCallback((state: RealtimeState) => {
    realtimeStateRef.current = state
    setRealtimeState(state)
  }, [])

  const flushPresence = useCallback(async () => {
    const payload = presencePayloadRef.current
    if (!payload || realtimeStateRef.current !== "online") return
    try {
      const snapshot = await scriptApi.updatePresence(projectId, {
        ...payload,
        documentId,
      })
      setPresence(snapshot.participants)
    } catch {
      // EventSource owns connection recovery; the next local cursor change retries the update.
    }
  }, [documentId, projectId])

  const queuePresence = useCallback(
    (payload: UpdateScriptPresenceBody, delay = 140) => {
      presencePayloadRef.current = payload
      if (presenceTimerRef.current !== null) {
        window.clearTimeout(presenceTimerRef.current)
        presenceTimerRef.current = null
      }
      if (realtimeStateRef.current !== "online") return
      if (delay === 0) {
        void flushPresence()
        return
      }
      presenceTimerRef.current = window.setTimeout(() => {
        presenceTimerRef.current = null
        void flushPresence()
      }, delay)
    },
    [flushPresence],
  )

  useEffect(() => {
    if (
      !conflict ||
      !mergePlan ||
      !mergePlanKey ||
      mergePlanKeyRef.current === mergePlanKey
    ) {
      return
    }
    mergePlanKeyRef.current = mergePlanKey
    setMergeChoices({})
    const content = resolveScriptMergePlan(mergePlan)
    setConflict((current) =>
      current?.pending.idempotencyKey === conflict.pending.idempotencyKey
        ? { ...current, pending: { ...current.pending, content } }
        : current,
    )
  }, [conflict, mergePlan, mergePlanKey])

  const loadConflict = async (pending: PendingSave) => {
    const pendingScope = `${pending.projectId}:${pending.documentId}`
    if (activeScopeRef.current !== pendingScope) return
    setMergeChoices({})
    mergePlanKeyRef.current = null
    setConflict({
      pending,
      localContent: pending.content,
      serverWorkspace: null,
      loadError: null,
    })
    setOverlay("conflict")

    try {
      const latestWorkspace = await scriptApi.getWorkspace(
        pending.projectId,
        pending.documentId,
      )
      queryClient.setQueryData<ScriptWorkspace>(
        ["script-workspace", pending.projectId, pending.documentId],
        latestWorkspace,
      )
      if (activeScopeRef.current !== pendingScope) return
      setConflict((current) =>
        current?.pending.idempotencyKey === pending.idempotencyKey
          ? { ...current, serverWorkspace: latestWorkspace }
          : current,
      )
    } catch (error) {
      if (activeScopeRef.current !== pendingScope) return
      setConflict((current) =>
        current?.pending.idempotencyKey === pending.idempotencyKey
          ? {
              ...current,
              loadError: error instanceof Error ? error.message : "服务器版本读取失败",
            }
          : current,
      )
    }
  }

  const saveMutation = useMutation({
    mutationFn: (payload: PendingSave) =>
      scriptApi.updateVersion(payload.projectId, payload.versionId, {
        documentId: payload.documentId,
        content: payload.content,
        expectedRevision: payload.expectedRevision,
        idempotencyKey: payload.idempotencyKey,
      }),
    onSuccess: (result, payload) => {
      pendingSaveRef.current = null
      queryClient.setQueryData<ScriptWorkspace>(
        ["script-workspace", payload.projectId, payload.documentId],
        (current) =>
          current
            ? {
                ...current,
                versions: current.versions.map((item) =>
                  item.id === result.version.id ? result.version : item,
                ),
              }
            : current,
      )
      if (activeScopeRef.current !== `${payload.projectId}:${payload.documentId}`) return
      baseContentRef.current = result.version.content
      setConflict(null)
      setOverlay((current) => (current === "conflict" ? null : current))
      setRevision(result.version.revision)
      setSaveState(draftRef.current === payload.content ? "saved" : "dirty")
    },
    onError: (error, payload) => {
      if (activeScopeRef.current !== `${payload.projectId}:${payload.documentId}`) return
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        setSaveState("conflict")
        void loadConflict(payload)
        return
      }
      setSaveState("error")
    },
  })

  const commentMutation = useMutation({
    mutationFn: (payload: {
      projectId: string
      documentId: string
      versionId: string
      parentId: string | null
      text: string
      excerpt: string
      idempotencyKey: string
    }) =>
      scriptApi.createComment(payload.projectId, {
        documentId: payload.documentId,
        versionId: payload.versionId,
        parentId: payload.parentId,
        text: payload.text,
        excerpt: payload.excerpt,
        idempotencyKey: payload.idempotencyKey,
      }),
    onSuccess: (result, payload) => {
      pendingCommentKeyRef.current = null
      queryClient.setQueryData<ScriptWorkspace>(
        ["script-workspace", payload.projectId, payload.documentId],
        (current) =>
          current && !current.comments.some((item) => item.id === result.comment.id)
            ? { ...current, comments: [...current.comments, result.comment] }
            : current,
      )
      setCommentDraft("")
      setReplyToId(null)
      setOverlay(null)
    },
  })

  const commentStateMutation = useMutation({
    mutationFn: (payload: {
      projectId: string
      documentId: string
      commentId: string
      resolved: boolean
      expectedRevision: number
      idempotencyKey: string
    }) =>
      scriptApi.updateComment(payload.projectId, payload.commentId, {
        documentId: payload.documentId,
        resolved: payload.resolved,
        expectedRevision: payload.expectedRevision,
        idempotencyKey: payload.idempotencyKey,
      }),
    onSuccess: (result, payload) => {
      queryClient.setQueryData<ScriptWorkspace>(
        ["script-workspace", payload.projectId, payload.documentId],
        (current) =>
          current
            ? {
                ...current,
                comments: current.comments.map((comment) =>
                  comment.id === result.comment.id ? result.comment : comment,
                ),
              }
            : current,
      )
    },
    onError: (error, payload) => {
      if (error instanceof ApiError && error.code === "COMMENT_CONFLICT") {
        void queryClient.invalidateQueries({
          queryKey: ["script-workspace", payload.projectId, payload.documentId],
        })
      }
    },
  })

  const createVersionMutation = useMutation({
    mutationFn: (payload: NewVersionDraft & { meta: string; idempotencyKey: string }) =>
      scriptApi.createVersion(payload.projectId, {
        documentId: payload.documentId,
        content: payload.content,
        meta: payload.meta,
        expectedVersionId: payload.expectedVersionId,
        expectedRevision: payload.expectedRevision,
        idempotencyKey: payload.idempotencyKey,
      }),
    onSuccess: (result, payload) => {
      pendingVersionKeyRef.current = null
      queryClient.setQueryData<ScriptWorkspace>(
        ["script-workspace", payload.projectId, payload.documentId],
        (current) =>
          current
            ? {
                ...current,
                document: {
                  ...current.document,
                  currentVersionId: result.version.id,
                },
                versions: [
                  result.version,
                  ...current.versions
                    .filter((item) => item.id !== result.version.id)
                    .map((item) => ({
                      ...item,
                      badge: "历史" as const,
                      isCurrent: false,
                    })),
                ],
              }
            : current,
      )
      if (activeScopeRef.current !== `${payload.projectId}:${payload.documentId}`) return
      setVersion(result.version.id)
      setRevision(result.version.revision)
      setHistory({ entries: [result.version.content], index: 0 })
      draftRef.current = result.version.content
      baseContentRef.current = result.version.content
      setSaveState("saved")
      setConflict(null)
      setNewVersion(null)
      pendingSaveRef.current = null
      setOverlay(null)
    },
  })

  useEffect(() => {
    if (!workspace || !currentVersion || editorScopeId === scopeId) return
    setEditorScopeId(scopeId)
    setVersion(workspace.document.currentVersionId)
    setRevision(currentVersion.revision)
    setHistory({ entries: [currentVersion.content], index: 0 })
    baseContentRef.current = currentVersion.content
    setSaveState("saved")
    setConflict(null)
    setNewVersion(null)
    setOverlay(null)
    setReplyToId(null)
    currentVersionIdRef.current = workspace.document.currentVersionId
    pendingSaveRef.current = null
    pendingVersionKeyRef.current = null
  }, [currentVersion, editorScopeId, scopeId, workspace])

  useEffect(() => {
    updateRealtimeState("connecting")
    setPresence([])
    const events = new EventSource(
      `/api/v1/projects/${encodeURIComponent(projectId)}/script-events?${new URLSearchParams({ documentId })}`,
    )
    const refreshWorkspace = () => {
      void queryClient.invalidateQueries({
        queryKey: ["script-workspace", projectId, documentId],
      })
    }
    const refreshPresence = (event: Event) => {
      try {
        const snapshot = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as ScriptPresenceSnapshot
        if (snapshot.projectId === projectId && snapshot.documentId === documentId) {
          setPresence(snapshot.participants)
        }
      } catch {
        updateRealtimeState("offline")
      }
    }
    events.onopen = () => {
      refreshWorkspace()
      updateRealtimeState("online")
      void flushPresence()
    }
    events.onerror = () => updateRealtimeState("offline")
    events.addEventListener("script.version.updated", refreshWorkspace)
    events.addEventListener("script.comment.updated", refreshWorkspace)
    events.addEventListener("script.presence.updated", refreshPresence)
    return () => {
      events.close()
      if (presenceTimerRef.current !== null) {
        window.clearTimeout(presenceTimerRef.current)
        presenceTimerRef.current = null
      }
    }
  }, [documentId, flushPresence, projectId, queryClient, updateRealtimeState])

  useEffect(() => {
    if (!version) return
    const editor = editorRef.current
    queuePresence(
      {
        versionId: version,
        cursorStart: editor?.selectionStart ?? 0,
        cursorEnd: editor?.selectionEnd ?? 0,
        editing: Boolean(canEdit && editor && document.activeElement === editor),
      },
      0,
    )
  }, [canEdit, queuePresence, version])

  useEffect(() => {
    if (!workspace || !currentVersion || editorScopeId !== scopeId) return
    const previousCurrentVersionId = currentVersionIdRef.current
    currentVersionIdRef.current = workspace.document.currentVersionId
    if (
      !previousCurrentVersionId ||
      previousCurrentVersionId === workspace.document.currentVersionId ||
      version !== previousCurrentVersionId ||
      saveState !== "saved"
    ) {
      return
    }
    setVersion(currentVersion.id)
    setRevision(currentVersion.revision)
    setHistory({ entries: [currentVersion.content], index: 0 })
    baseContentRef.current = currentVersion.content
    pendingSaveRef.current = null
  }, [currentVersion, editorScopeId, saveState, scopeId, version, workspace])

  useEffect(() => {
    if (
      !currentVersion ||
      version !== currentVersion.id ||
      saveState !== "saved" ||
      currentVersion.revision <= revision
    ) {
      return
    }
    setRevision(currentVersion.revision)
    setHistory({ entries: [currentVersion.content], index: 0 })
    baseContentRef.current = currentVersion.content
  }, [currentVersion, revision, saveState, version])

  useEffect(() => {
    if (
      !workspace ||
      !currentVersion ||
      !version ||
      version === currentVersion.id ||
      (saveState !== "dirty" && saveState !== "saving")
    ) {
      return
    }
    const selected = workspace.versions.find((item) => item.id === version)
    const content = draftRef.current
    if (!content.trim() || content === selected?.content) return

    const pending = pendingSaveRef.current ?? {
      projectId,
      documentId,
      versionId: version,
      baseContent: baseContentRef.current,
      content,
      expectedRevision: revision,
      idempotencyKey: crypto.randomUUID(),
    }
    pendingSaveRef.current = pending
    setMergeChoices({})
    mergePlanKeyRef.current = null
    setConflict({
      pending,
      localContent: pending.content,
      serverWorkspace: workspace,
      loadError: null,
    })
    setSaveState("conflict")
    setOverlay("conflict")
  }, [currentVersion, documentId, projectId, revision, saveState, version, workspace])

  useEffect(() => {
    if (saveState !== "dirty" || !canEdit || !revision || saveMutation.isPending) {
      return
    }
    const timeout = window.setTimeout(() => {
      const payload: PendingSave = {
        projectId,
        documentId,
        versionId: version,
        baseContent: baseContentRef.current,
        content: draft,
        expectedRevision: revision,
        idempotencyKey: crypto.randomUUID(),
      }
      pendingSaveRef.current = payload
      setSaveState("saving")
      saveMutation.mutate(payload)
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [canEdit, documentId, draft, projectId, revision, saveMutation, saveState, version])

  const updateDraft = (value: string) => {
    if (!canEdit) return
    setHistory((current) => {
      const entries = [...current.entries.slice(0, current.index + 1), value]
      return { entries, index: entries.length - 1 }
    })
    setSaveState("dirty")
  }

  const syncEditorPresence = (editor: HTMLTextAreaElement, editing: boolean) => {
    if (!version) return
    queuePresence({
      versionId: version,
      cursorStart: editor.selectionStart,
      cursorEnd: editor.selectionEnd,
      editing: editing && canEdit,
    })
  }

  const moveHistory = (direction: -1 | 1) => {
    if (!canEdit) return
    setHistory((current) => {
      const index = Math.min(
        current.entries.length - 1,
        Math.max(0, current.index + direction),
      )
      return { ...current, index }
    })
    setSaveState("dirty")
  }

  const openCommentDialog = () => {
    const editor = editorRef.current
    const excerpt =
      editor && editor.selectionEnd > editor.selectionStart
        ? draft.slice(editor.selectionStart, editor.selectionEnd)
        : ""
    setSelection(excerpt)
    setReplyToId(null)
    setCommentDraft("")
    pendingCommentKeyRef.current = null
    commentMutation.reset()
    setOverlay("comment")
  }

  const openReplyDialog = (commentId: string) => {
    setSelection("")
    setReplyToId(commentId)
    setCommentDraft("")
    pendingCommentKeyRef.current = null
    commentMutation.reset()
    setOverlay("comment")
  }

  const resetEditor = (nextWorkspace: ScriptWorkspace) => {
    const nextCurrent = nextWorkspace.versions.find((item) => item.isCurrent)
    if (!nextCurrent) return
    setVersion(nextWorkspace.document.currentVersionId)
    setRevision(nextCurrent.revision)
    setHistory({ entries: [nextCurrent.content], index: 0 })
    baseContentRef.current = nextCurrent.content
    setSaveState("saved")
    setConflict(null)
    pendingSaveRef.current = null
  }

  const retrySave = () => {
    const pending = pendingSaveRef.current
    if (!pending || saveMutation.isPending) return
    setSaveState("saving")
    saveMutation.mutate(pending)
  }

  const useServerVersion = () => {
    if (!conflict?.serverWorkspace) return
    resetEditor(conflict.serverWorkspace)
    setOverlay(null)
  }

  const chooseMergeSide = (conflictId: string, choice: ScriptMergeChoice) => {
    if (!mergePlan || !conflict) return
    const choices = { ...mergeChoices, [conflictId]: choice }
    const content = resolveScriptMergePlan(mergePlan, choices)
    setMergeChoices(choices)
    setConflict((current) =>
      current ? { ...current, pending: { ...current.pending, content } } : current,
    )
  }

  const saveConflictDraft = () => {
    const latestVersion = conflict?.serverWorkspace?.versions.find(
      (item) => item.isCurrent,
    )
    const content = conflict?.pending.content ?? ""
    if (!conflict || !latestVersion || !content.trim() || saveMutation.isPending) return

    const payload: PendingSave = {
      projectId: conflict.pending.projectId,
      documentId: conflict.pending.documentId,
      versionId: latestVersion.id,
      baseContent: latestVersion.content,
      content,
      expectedRevision: latestVersion.revision,
      idempotencyKey: crypto.randomUUID(),
    }
    setVersion(latestVersion.id)
    setRevision(latestVersion.revision)
    setHistory({ entries: [content], index: 0 })
    draftRef.current = content
    pendingSaveRef.current = payload
    setSaveState("saving")
    setOverlay(null)
    saveMutation.mutate(payload)
  }

  const openNewVersion = (draft: NewVersionDraft, meta = "新协作版本") => {
    setNewVersion(draft)
    setNewVersionMeta(meta)
    pendingVersionKeyRef.current = null
    createVersionMutation.reset()
    setOverlay("new-version")
  }

  const openImpactDialog = () => {
    if (!workspace || !currentVersion) return
    const baseline =
      (!isCurrent ? selectedVersion : null) ??
      workspace.versions.find((item) => !item.isCurrent)
    if (!baseline) return
    setImpactFromVersionId(baseline.id)
    setImpactToVersionId(currentVersion.id)
    setOverlay("impact")
  }

  const refreshNewVersionBase = async () => {
    if (!newVersion || createVersionMutation.isPending) return
    try {
      const latest = await scriptApi.getWorkspace(
        newVersion.projectId,
        newVersion.documentId,
      )
      queryClient.setQueryData<ScriptWorkspace>(
        ["script-workspace", newVersion.projectId, newVersion.documentId],
        latest,
      )
      const latestVersion = latest.versions.find((item) => item.isCurrent)
      if (!latestVersion) return
      setNewVersion((current) =>
        current
          ? {
              ...current,
              expectedVersionId: latestVersion.id,
              expectedRevision: latestVersion.revision,
            }
          : current,
      )
      pendingVersionKeyRef.current = null
      createVersionMutation.reset()
    } catch {
      // The mutation error remains visible until a fresh base can be loaded.
    }
  }

  if (workspaceQuery.isPending) {
    return (
      <motion.section
        key="script-loading"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
        aria-busy="true"
      >
        <LoaderCircle className="size-4 animate-spin" />
        正在载入脚本文档
      </motion.section>
    )
  }

  if (workspaceQuery.isError || !workspace || !currentVersion) {
    return (
      <motion.section
        key="script-error"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <AlertTriangle className="size-5 text-support" />
        <div>
          <strong className="block text-sm">脚本文档暂时无法载入</strong>
          <span className="mt-1 block text-xs text-muted-foreground">
            {workspaceQuery.error instanceof Error
              ? workspaceQuery.error.message
              : "请检查 API 服务状态"}
          </span>
        </div>
        <Button variant="outline" onClick={() => workspaceQuery.refetch()}>
          <RefreshCw />
          重新载入
        </Button>
      </motion.section>
    )
  }

  const saveLabel = !isCurrent
    ? "历史版本 · 只读"
    : !workspace.permissions.canWrite
      ? "当前权限 · 只读"
      : saveStateLabels[saveState]

  return (
    <>
      <motion.section
        key="script"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto md:grid md:grid-cols-[176px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto] md:overflow-hidden xl:grid-cols-[176px_minmax(0,1fr)_280px] xl:grid-rows-1"
        aria-label="多人协作脚本编辑器"
      >
        <aside className="min-w-0 border-b border-border bg-muted/20 md:border-r md:border-b-0">
          <div className="border-b border-border p-3">
            <strong className="block truncate text-sm" title={workspace.document.title}>
              {workspace.document.title}
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              场景 12 / 18 · {openCommentCount} 条未解决评论
            </span>
          </div>
          <div className="flex min-w-0 max-w-full overflow-x-auto p-2 md:block">
            {workspace.versions.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={version === item.id}
                onClick={() => setVersion(item.id)}
                className={cn(
                  "flex min-h-11 min-w-40 items-center gap-3 border-l-2 px-3 py-2 text-left text-xs transition-colors md:min-w-0 md:w-full",
                  version === item.id
                    ? "border-primary bg-primary/8 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.id}</span>
                  <span className="mt-0.5 block truncate text-xs" title={item.meta}>
                    {item.meta}
                  </span>
                </span>
                <StatusBadge tone={item.badge === "当前" ? "primary" : "neutral"}>
                  {item.badge}
                </StatusBadge>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[680px] min-w-0 max-w-full shrink-0 flex-col md:min-h-0 md:shrink">
          <div className="flex min-h-11 min-w-0 shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1">
            <div className="flex min-w-0 max-w-full items-center overflow-x-auto">
              <IconButton
                label="撤销"
                disabled={!canUndo}
                onClick={() => moveHistory(-1)}
              >
                <Undo2 />
              </IconButton>
              <IconButton label="重做" disabled={!canRedo} onClick={() => moveHistory(1)}>
                <Redo2 />
              </IconButton>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <IconButton
                label="粗体"
                disabled={!canEdit}
                aria-pressed={activeFormat === "bold"}
                onClick={() => setActiveFormat(activeFormat === "bold" ? null : "bold")}
                className={cn(activeFormat === "bold" && "bg-primary/10 text-primary")}
              >
                <Bold />
              </IconButton>
              <IconButton
                label="斜体"
                disabled={!canEdit}
                aria-pressed={activeFormat === "italic"}
                onClick={() =>
                  setActiveFormat(activeFormat === "italic" ? null : "italic")
                }
                className={cn(activeFormat === "italic" && "bg-primary/10 text-primary")}
              >
                <Italic />
              </IconButton>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <IconButton
                label="添加选区评论"
                disabled={!canEdit}
                onClick={openCommentDialog}
              >
                <MessageSquarePlus />
              </IconButton>
              <IconButton label="版本记录" onClick={() => setOverlay("history")}>
                <History />
              </IconButton>
              <IconButton
                ref={impactTriggerRef}
                label="版本影响分析"
                disabled={workspace.versions.length < 2}
                onClick={openImpactDialog}
              >
                <GitCompareArrows />
              </IconButton>
              <IconButton
                label="另存为新版本"
                disabled={
                  !canEdit ||
                  saveMutation.isPending ||
                  saveState === "saving" ||
                  saveState === "conflict"
                }
                onClick={() =>
                  openNewVersion({
                    projectId,
                    documentId,
                    content: draft,
                    expectedVersionId: currentVersion.id,
                    expectedRevision: revision,
                  })
                }
              >
                <GitBranchPlus />
              </IconButton>
            </div>
            <div className="ml-auto flex min-h-8 items-center gap-2">
              <span
                aria-live="polite"
                className={cn(
                  "text-xs text-muted-foreground",
                  saveState === "dirty" && isCurrent && "text-support",
                  (saveState === "error" || saveState === "conflict") &&
                    isCurrent &&
                    "text-destructive",
                )}
              >
                {saveLabel}
              </span>
              {isCurrent && saveState === "error" ? (
                <Button size="xs" variant="outline" onClick={retrySave}>
                  <RefreshCw />
                  重试
                </Button>
              ) : null}
              {isCurrent && saveState === "conflict" ? (
                <Button
                  ref={conflictTriggerRef}
                  size="xs"
                  variant="outline"
                  onClick={() => setOverlay("conflict")}
                >
                  <GitCompareArrows />
                  处理冲突
                </Button>
              ) : null}
              <StatusBadge
                tone={
                  realtimeState === "online"
                    ? "success"
                    : realtimeState === "offline"
                      ? "warning"
                      : "neutral"
                }
              >
                {realtimeState === "online" ? (
                  <Wifi className="size-3" />
                ) : (
                  <WifiOff className="size-3" />
                )}
                {realtimeState === "online"
                  ? "实时已连接"
                  : realtimeState === "offline"
                    ? "正在重连"
                    : "正在连接"}
              </StatusBadge>
              <fieldset className="flex -space-x-px">
                <legend className="sr-only">
                  {workspace.collaborators.length} 名文档参与者
                </legend>
                {workspace.collaborators.slice(0, 3).map((collaborator) => (
                  <Avatar
                    key={collaborator.id}
                    className="size-7 rounded-none border border-background"
                  >
                    <AvatarFallback
                      className={cn(
                        "rounded-none text-xs",
                        presenceByCollaborator.has(collaborator.id)
                          ? "bg-positive/10 text-positive"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {collaborator.initials}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </fieldset>
            </div>
          </div>

          <div
            data-scroll-owner
            className="min-h-0 flex-1 bg-workspace p-3 sm:p-6 md:overflow-auto"
          >
            <article className="mx-auto min-h-full w-full max-w-[760px] border border-border bg-background px-5 py-5 shadow-sm sm:px-10 sm:py-8">
              <header className="mb-7 flex items-center justify-between gap-4 border-b border-border pb-3 text-xs text-muted-foreground">
                <span>{project.name} / 场 12</span>
                <span>{version} · 中文拍摄稿</span>
              </header>
              <div className="relative">
                {remoteCursors.map((cursor, index) => {
                  const selected = visibleContent.slice(cursor.start, cursor.end)
                  const tone = index % 2 === 0 ? "primary" : "support"
                  return (
                    <div
                      key={cursor.collaboratorId}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-1 left-0 z-10 overflow-hidden"
                    >
                      <div
                        className="min-h-[560px] whitespace-pre-wrap break-words font-mono text-[15px] leading-8 text-transparent"
                        style={{
                          transform: `translate(${-editorScroll.left}px, ${-editorScroll.top}px)`,
                        }}
                      >
                        {visibleContent.slice(0, cursor.start)}
                        <span
                          className={cn(
                            "relative",
                            selected &&
                              (tone === "primary" ? "bg-primary/12" : "bg-support/12"),
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0 left-0 h-8 border-l-2",
                              tone === "primary" ? "border-primary" : "border-support",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute bottom-full left-0 z-20 translate-y-1 whitespace-nowrap px-1 py-0.5 font-sans text-xs leading-3 font-semibold text-white",
                                tone === "primary"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-support text-support-foreground",
                              )}
                            >
                              {cursor.displayName}
                            </span>
                          </span>
                          {selected || "\u200b"}
                        </span>
                        {visibleContent.slice(cursor.end)}
                      </div>
                    </div>
                  )
                })}
                <textarea
                  ref={editorRef}
                  aria-label="脚本正文"
                  readOnly={!canEdit}
                  value={visibleContent}
                  onChange={(event) => {
                    updateDraft(event.target.value)
                    syncEditorPresence(event.currentTarget, true)
                  }}
                  onSelect={(event) => syncEditorPresence(event.currentTarget, true)}
                  onFocus={(event) => syncEditorPresence(event.currentTarget, true)}
                  onBlur={(event) => syncEditorPresence(event.currentTarget, false)}
                  onScroll={(event) =>
                    setEditorScroll({
                      left: event.currentTarget.scrollLeft,
                      top: event.currentTarget.scrollTop,
                    })
                  }
                  onKeyDown={(event) => {
                    if (!canEdit || !(event.ctrlKey || event.metaKey)) return
                    if (event.key.toLowerCase() === "z") {
                      event.preventDefault()
                      moveHistory(event.shiftKey ? 1 : -1)
                    }
                    if (event.key.toLowerCase() === "y") {
                      event.preventDefault()
                      moveHistory(1)
                    }
                  }}
                  className={cn(
                    "relative min-h-[560px] w-full resize-none bg-transparent font-mono text-[15px] leading-8 outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    !canEdit && "cursor-default text-muted-foreground",
                    activeFormat === "bold" && "font-bold",
                    activeFormat === "italic" && "italic",
                  )}
                />
              </div>
            </article>
          </div>
        </section>

        <aside className="min-w-0 max-w-full border-t border-border bg-background md:col-span-2 xl:col-span-1 xl:min-h-0 xl:overflow-y-auto xl:border-t-0 xl:border-l">
          <div className="divide-y divide-border">
            <section className="p-3">
              <div className="mb-3 flex items-center">
                <span className="text-xs font-semibold">参与者</span>
                <StatusBadge
                  tone={presence.length ? "success" : "neutral"}
                  className="ml-auto"
                >
                  {presence.length} 人在线
                </StatusBadge>
              </div>
              {workspace.collaborators.map((collaborator) => {
                const activePresence = presenceByCollaborator.get(collaborator.id)
                const presenceVersion = workspace.versions.find(
                  (item) => item.id === activePresence?.versionId,
                )
                const location =
                  activePresence?.cursorEnd !== null &&
                  activePresence?.cursorEnd !== undefined &&
                  presenceVersion
                    ? cursorPositionLabel(
                        presenceVersion.content,
                        activePresence.cursorEnd,
                      )
                    : null
                return (
                  <div key={collaborator.id} className="flex items-center gap-2 py-2">
                    <Avatar className="size-7 rounded-none">
                      <AvatarFallback
                        className={cn(
                          "rounded-none text-xs",
                          activePresence
                            ? "bg-positive/10 text-positive"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {collaborator.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium">
                        {collaborator.displayName}
                        {collaborator.id === workspace.currentAccountId ? " · 你" : ""}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {activePresence
                          ? `${activePresence.editing ? "正在编辑" : "在线"}${activePresence.versionId ? ` ${activePresence.versionId}` : ""}${location ? ` · ${location}` : ""}`
                          : collaboratorRoleLabel(collaborator.role)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>

            <section className="p-3">
              <div className="mb-2 flex items-center text-xs font-semibold">
                评论
                <span className="ml-auto font-normal text-muted-foreground">
                  {openCommentCount} 未解决
                </span>
              </div>
              {visibleComments.length ? (
                visibleComments.map((comment) => (
                  <article
                    key={comment.id}
                    className={cn(
                      "mb-2 w-full border-l-2 p-2 text-left",
                      comment.resolved
                        ? "border-border bg-muted/25 text-muted-foreground"
                        : "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex min-w-0 items-baseline gap-2">
                      <strong className="truncate text-xs">{comment.authorName}</strong>
                      <time
                        dateTime={comment.createdAt}
                        className="ml-auto shrink-0 text-xs text-muted-foreground"
                      >
                        {formatCommentTime(comment.createdAt)}
                      </time>
                    </div>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {comment.text}
                    </span>
                    <span
                      className="mt-1 block truncate text-xs text-muted-foreground/75"
                      title={comment.excerpt}
                    >
                      {comment.excerpt || "场 12"}
                    </span>
                    {versionComments
                      .filter((reply) => reply.parentId === comment.id)
                      .map((reply) => (
                        <div key={reply.id} className="mt-2 border-l border-border pl-2">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <strong className="truncate text-xs">
                              {reply.authorName}
                            </strong>
                            <time
                              dateTime={reply.createdAt}
                              className="ml-auto shrink-0 text-xs text-muted-foreground"
                            >
                              {formatCommentTime(reply.createdAt)}
                            </time>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {reply.text}
                          </p>
                        </div>
                      ))}
                    {canEdit ? (
                      <div className="mt-2 flex items-center gap-1 border-t border-border/70 pt-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => openReplyDialog(comment.id)}
                        >
                          <Reply />
                          回复
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={commentStateMutation.isPending}
                          onClick={() =>
                            commentStateMutation.mutate({
                              projectId,
                              documentId,
                              commentId: comment.id,
                              resolved: !comment.resolved,
                              expectedRevision: comment.revision,
                              idempotencyKey: crypto.randomUUID(),
                            })
                          }
                        >
                          {comment.resolved ? <RotateCcw /> : <Check />}
                          {comment.resolved ? "恢复" : "解决"}
                        </Button>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <span className="block py-3 text-xs text-muted-foreground">
                  当前版本没有评论
                </span>
              )}
              {commentStateMutation.isError ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {commentStateMutation.error instanceof Error
                    ? commentStateMutation.error.message
                    : "评论状态更新失败"}
                </p>
              ) : null}
            </section>

            <section className="p-3">
              <div className="mb-3 flex items-center text-xs font-semibold">
                来源与状态
                <Check className="ml-auto size-4 text-positive" />
              </div>
              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="font-medium">不可变来源</dt>
                  <dd className="mt-1 text-muted-foreground">
                    {project.name}_导演稿.docx · 8 月 12 日
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">结构化草稿</dt>
                  <dd className="mt-1 text-muted-foreground">
                    当前 {workspace.document.currentVersionId} · 修订 {revision}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </aside>
      </motion.section>

      <Dialog
        open={overlay === "comment"}
        onOpenChange={(open) => {
          if (open) return
          setReplyToId(null)
          setOverlay(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{replyTo ? "回复脚本评论" : "添加脚本评论"}</DialogTitle>
            <DialogDescription>
              {replyTo
                ? `回复 ${replyTo.authorName}：“${replyTo.text.slice(0, 48)}${replyTo.text.length > 48 ? "…" : ""}”`
                : selection
                  ? `评论将绑定选区：“${selection.slice(0, 48)}${selection.length > 48 ? "…" : ""}”`
                  : "当前没有选中文本，评论将绑定到场 12。"}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={commentDraft}
            onChange={(event) => {
              setCommentDraft(event.target.value)
              pendingCommentKeyRef.current = null
              commentMutation.reset()
            }}
            placeholder="输入评论，可使用 @ 提及协作者"
            className="min-h-28"
          />
          {commentMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {commentMutation.error instanceof Error
                ? commentMutation.error.message
                : "评论提交失败"}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReplyToId(null)
                setOverlay(null)
              }}
            >
              取消
            </Button>
            <Button
              disabled={!commentDraft.trim() || commentMutation.isPending}
              onClick={() => {
                const idempotencyKey = pendingCommentKeyRef.current ?? crypto.randomUUID()
                pendingCommentKeyRef.current = idempotencyKey
                commentMutation.mutate({
                  projectId,
                  documentId,
                  versionId: version,
                  parentId: replyToId,
                  text: commentDraft.trim(),
                  excerpt: replyTo?.excerpt || selection || "场 12",
                  idempotencyKey,
                })
              }}
            >
              {commentMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : null}
              {replyTo ? "发送回复" : "添加评论"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overlay === "conflict"}
        onOpenChange={(open) => !open && setOverlay(null)}
      >
        <DialogContent
          className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-4xl"
          onCloseAutoFocus={(event) => {
            const target = conflictTriggerRef.current?.isConnected
              ? conflictTriggerRef.current
              : editorRef.current
            if (!target) return
            event.preventDefault()
            target.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>处理脚本保存冲突</DialogTitle>
            <DialogDescription>
              基于冲突前修订比较本地与服务器修改，不重叠内容已自动合并。
            </DialogDescription>
          </DialogHeader>

          {conflict?.serverWorkspace && mergePlan ? (
            <>
              <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2 border-y border-border px-1 text-xs">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <GitCompareArrows className="size-4" />
                  三方比较
                </span>
                <span className="text-muted-foreground">
                  基线修订 {conflict.pending.expectedRevision}
                </span>
                <span className="text-muted-foreground">
                  自动合并 {automaticMergeCount} 处
                </span>
                <span className={cn(mergeConflicts.length > 0 && "text-primary")}>
                  待确认 {mergeConflicts.length} 处
                </span>
              </div>

              <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
                <section className="min-w-0">
                  <div className="mb-2 flex min-h-5 items-baseline justify-between gap-3">
                    <label
                      htmlFor="script-conflict-merged-draft"
                      className="text-xs font-semibold"
                    >
                      合并稿
                    </label>
                    <span className="text-xs text-muted-foreground">可继续编辑</span>
                  </div>
                  <Textarea
                    id="script-conflict-merged-draft"
                    autoFocus
                    value={conflict.pending.content}
                    onChange={(event) =>
                      setConflict((current) =>
                        current
                          ? {
                              ...current,
                              pending: {
                                ...current.pending,
                                content: event.target.value,
                              },
                            }
                          : current,
                      )
                    }
                    className="h-52 resize-none font-mono text-xs leading-6 lg:h-80"
                  />
                </section>

                <section className="min-w-0">
                  <div className="mb-2 flex min-h-5 items-baseline justify-between gap-3">
                    <span className="text-xs font-semibold">重叠修改</span>
                    <span className="text-xs text-muted-foreground">
                      服务器修订 {conflictServerVersion?.revision}
                    </span>
                  </div>
                  {mergeConflicts.length === 0 ? (
                    <div
                      role="status"
                      className="flex h-52 items-center gap-2 border-y border-border px-3 text-xs text-muted-foreground lg:h-80"
                    >
                      <Check className="size-4" />
                      没有重叠修改
                    </div>
                  ) : (
                    <div className="h-52 overflow-y-auto border-y border-border lg:h-80">
                      {mergeConflicts.map((item) => (
                        <article
                          key={item.id}
                          className="border-b border-border p-3 last:border-b-0"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="font-mono text-xs text-muted-foreground">
                              第 {item.lineStart}-{item.lineEnd} 行
                            </span>
                            <StatusBadge tone="warning">待确认</StatusBadge>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="min-w-0">
                              <span className="text-xs font-semibold">基线</span>
                              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap border-l border-border pl-2 font-mono text-xs text-muted-foreground">
                                {item.baseLines.join("\n") || "（空）"}
                              </pre>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold">本地</span>
                              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap border-l border-border pl-2 font-mono text-xs">
                                {item.localLines.join("\n") || "（删除）"}
                              </pre>
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "mt-2 w-full",
                                  mergeChoices[item.id] !== "server" &&
                                    "border-primary/60 bg-primary/5 text-primary",
                                )}
                                aria-pressed={mergeChoices[item.id] !== "server"}
                                onClick={() => chooseMergeSide(item.id, "local")}
                              >
                                采用本地
                              </Button>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold">服务器</span>
                              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap border-l border-border pl-2 font-mono text-xs">
                                {item.serverLines.join("\n") || "（删除）"}
                              </pre>
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "mt-2 w-full",
                                  mergeChoices[item.id] === "server" &&
                                    "border-primary/60 bg-primary/5 text-primary",
                                )}
                                aria-pressed={mergeChoices[item.id] === "server"}
                                onClick={() => chooseMergeSide(item.id, "server")}
                              >
                                采用服务器
                              </Button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : (
            <div
              role="status"
              className="flex h-52 items-center justify-center gap-2 border-y border-border text-xs text-muted-foreground"
            >
              <LoaderCircle className="size-4 animate-spin" />
              正在读取服务器版本
            </div>
          )}

          {conflict?.loadError ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2"
              role="alert"
            >
              <p className="text-xs text-destructive">{conflict.loadError}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadConflict(conflict.pending)}
              >
                <RefreshCw />
                重新读取
              </Button>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverlay(null)}>
              暂不处理
            </Button>
            <Button
              variant="outline"
              disabled={!conflict?.serverWorkspace || createVersionMutation.isPending}
              onClick={() => {
                const latest = conflict?.serverWorkspace?.versions.find(
                  (item) => item.isCurrent,
                )
                if (!conflict || !latest) return
                openNewVersion(
                  {
                    projectId: conflict.pending.projectId,
                    documentId: conflict.pending.documentId,
                    content: conflict.pending.content,
                    expectedVersionId: latest.id,
                    expectedRevision: latest.revision,
                  },
                  "冲突合并稿",
                )
              }}
            >
              <GitBranchPlus />
              另存为新版本
            </Button>
            <Button
              variant="outline"
              disabled={!conflict?.serverWorkspace || saveMutation.isPending}
              onClick={useServerVersion}
            >
              <Check />
              使用服务器版本
            </Button>
            <Button
              disabled={
                !conflict?.serverWorkspace ||
                !conflict.pending.content.trim() ||
                saveMutation.isPending
              }
              onClick={saveConflictDraft}
            >
              {saveMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <GitMerge />
              )}
              保存合并稿
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overlay === "new-version"}
        onOpenChange={(open) =>
          !open && !createVersionMutation.isPending && setOverlay(null)
        }
      >
        <DialogContent
          className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl"
          showCloseButton={!createVersionMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>另存为新版本</DialogTitle>
            <DialogDescription>
              当前协作稿会成为只读历史；新版本从修订 1 开始继续协作。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label htmlFor="script-version-meta" className="block space-y-2">
              <span className="text-xs font-semibold">版本说明</span>
              <Input
                id="script-version-meta"
                value={newVersionMeta}
                maxLength={120}
                onChange={(event) => {
                  setNewVersionMeta(event.target.value)
                  pendingVersionKeyRef.current = null
                  createVersionMutation.reset()
                }}
                placeholder="例如：导演确认稿"
              />
            </label>
            <label htmlFor="script-version-content" className="block space-y-2">
              <span className="text-xs font-semibold">新版本正文</span>
              <Textarea
                id="script-version-content"
                value={newVersion?.content ?? ""}
                onChange={(event) => {
                  setNewVersion((current) =>
                    current ? { ...current, content: event.target.value } : current,
                  )
                  pendingVersionKeyRef.current = null
                  createVersionMutation.reset()
                }}
                className="h-64 resize-none font-mono text-xs leading-6"
              />
            </label>
          </div>

          {createVersionMutation.isError ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2"
              role="alert"
            >
              <p className="text-xs text-destructive">
                {createVersionMutation.error instanceof Error
                  ? createVersionMutation.error.message
                  : "新版本创建失败，请重试"}
              </p>
              {createVersionMutation.error instanceof ApiError &&
              createVersionMutation.error.code === "VERSION_CONFLICT" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshNewVersionBase()}
                >
                  <RefreshCw />
                  载入最新基线
                </Button>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={createVersionMutation.isPending}
              onClick={() => setOverlay(null)}
            >
              取消
            </Button>
            <Button
              disabled={
                !newVersion ||
                !newVersionMeta.trim() ||
                !newVersion.content.trim() ||
                createVersionMutation.isPending
              }
              onClick={() => {
                if (!newVersion) return
                const idempotencyKey = pendingVersionKeyRef.current ?? crypto.randomUUID()
                pendingVersionKeyRef.current = idempotencyKey
                createVersionMutation.mutate({
                  ...newVersion,
                  meta: newVersionMeta.trim(),
                  idempotencyKey,
                })
              }}
            >
              {createVersionMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <GitBranchPlus />
              )}
              创建版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overlay === "impact"}
        onOpenChange={(open) => !open && setOverlay(null)}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
          onCloseAutoFocus={(event) => {
            const target = impactTriggerRef.current
            if (!target?.isConnected) return
            event.preventDefault()
            target.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>脚本版本影响分析</DialogTitle>
            <DialogDescription>
              对比逐行变化，并沿结构化来源行追踪正式拆解、拍摄日与通告。
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ScriptVersionPicker
              label="基线版本"
              value={impactFromVersionId}
              versions={workspace.versions}
              disabledValue={impactToVersionId}
              onValueChange={setImpactFromVersionId}
            />
            <ScriptVersionPicker
              label="目标版本"
              value={impactToVersionId}
              versions={workspace.versions}
              disabledValue={impactFromVersionId}
              onValueChange={setImpactToVersionId}
            />
          </div>

          {impactQuery.isPending ? (
            <div
              role="status"
              className="flex min-h-40 items-center justify-center gap-2 border-y border-border text-xs text-muted-foreground"
            >
              <LoaderCircle className="size-4 animate-spin" />
              正在比较脚本版本
            </div>
          ) : impactQuery.isError ? (
            <div
              role="alert"
              className="flex min-h-32 flex-col items-center justify-center gap-3 border-y border-border text-center"
            >
              <p className="text-xs text-destructive">
                {impactQuery.error instanceof Error
                  ? impactQuery.error.message
                  : "版本影响分析失败"}
              </p>
              <Button variant="outline" onClick={() => void impactQuery.refetch()}>
                <RefreshCw />
                重新分析
              </Button>
            </div>
          ) : impactQuery.data ? (
            <div className="min-w-0 space-y-5">
              <div className="flex min-w-0 flex-wrap items-center gap-2 border-y border-border py-3 text-xs text-muted-foreground">
                <StatusBadge
                  tone={
                    impactQuery.data.processingStatus === "limited"
                      ? "warning"
                      : "neutral"
                  }
                >
                  {impactQuery.data.processingStatus === "limited"
                    ? "范围分析"
                    : "分析完成"}
                </StatusBadge>
                <span>
                  {impactQuery.data.fromVersion.id} → {impactQuery.data.toVersion.id}
                </span>
                <span className="ml-auto">
                  生成于 {formatCommentTime(impactQuery.data.generatedAt)}
                </span>
              </div>

              <section aria-labelledby="script-impact-changes-title">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 id="script-impact-changes-title" className="text-sm font-semibold">
                    逐行变化
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {impactQuery.data.changes.length} 处
                  </span>
                </div>
                <div className="divide-y divide-border border border-border">
                  {impactQuery.data.changes.length ? (
                    impactQuery.data.changes.map((change) => (
                      <article
                        key={change.id}
                        className="grid min-w-0 gap-3 p-3 sm:grid-cols-2"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {impactRangeLabel(
                              impactQuery.data.fromVersion.id,
                              change.from,
                            )}
                          </span>
                          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap border-l border-border pl-2 font-mono text-xs leading-5">
                            {change.from.text || "（新增内容）"}
                          </pre>
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {impactRangeLabel(impactQuery.data.toVersion.id, change.to)}
                          </span>
                          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap border-l border-border pl-2 font-mono text-xs leading-5">
                            {change.to.text || "（内容已移除）"}
                          </pre>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="p-4 text-center text-xs text-muted-foreground">
                      两个版本正文没有逐行差异
                    </p>
                  )}
                </div>
              </section>

              <section aria-labelledby="script-impact-breakdown-title">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3
                    id="script-impact-breakdown-title"
                    className="text-sm font-semibold"
                  >
                    受影响的正式拆解项
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {impactQuery.data.affectedBreakdownItems.length} 项
                  </span>
                </div>
                <div className="divide-y divide-border border border-border">
                  {impactQuery.data.affectedBreakdownItems.length ? (
                    impactQuery.data.affectedBreakdownItems.map((item) => (
                      <div key={item.id} className="flex min-w-0 items-start gap-3 p-3">
                        <span className="min-w-0 flex-1">
                          <strong className="block text-xs">{item.item}</strong>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {item.sourceDocument} {item.sourceVersion} ·{" "}
                            {item.sourceLocation}
                          </span>
                        </span>
                        <StatusBadge tone="neutral">{item.state}</StatusBadge>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-center text-xs text-muted-foreground">
                      没有结构化来源行与本次变更重叠的正式拆解项
                    </p>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  关联 {impactQuery.data.affectedShootingDayIds.length} 个拍摄日 ·{" "}
                  {impactQuery.data.affectedCallSheetIds.length} 份通告
                </p>
              </section>

              {impactQuery.data.manualReviewBreakdownItems.length ? (
                <section aria-labelledby="script-impact-manual-title">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 id="script-impact-manual-title" className="text-sm font-semibold">
                      需要人工核对
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {impactQuery.data.manualReviewBreakdownItems.length} 项
                    </span>
                  </div>
                  <div className="divide-y divide-border border border-border">
                    {impactQuery.data.manualReviewBreakdownItems.map((item) => (
                      <div key={item.id} className="flex min-w-0 items-start gap-3 p-3">
                        <span className="min-w-0 flex-1">
                          <strong className="block text-xs">{item.item}</strong>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {item.sourceDocument} {item.sourceVersion} ·{" "}
                            {item.sourceLocation}
                          </span>
                        </span>
                        <StatusBadge tone="warning">来源行待补充</StatusBadge>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section aria-labelledby="script-impact-limitations-title">
                <h3
                  id="script-impact-limitations-title"
                  className="text-sm font-semibold"
                >
                  覆盖限制
                </h3>
                <ul className="mt-2 space-y-1 border-l border-border pl-3 text-xs leading-5 text-muted-foreground">
                  {impactQuery.data.coverageLimitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverlay(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overlay === "history"}
        onOpenChange={(open) => !open && setOverlay(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>版本记录</DialogTitle>
            <DialogDescription>
              版本为只读快照；当前协作稿会继续自动保存。
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border border border-border">
            {workspace.versions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setVersion(item.id)
                  setOverlay(null)
                }}
                className="flex w-full items-center gap-3 p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <History className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">{item.id}</strong>
                  <span
                    className="block truncate text-xs text-muted-foreground"
                    title={item.meta}
                  >
                    {item.meta}
                  </span>
                </span>
                <StatusBadge tone={item.badge === "当前" ? "primary" : "neutral"}>
                  {item.badge}
                </StatusBadge>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverlay(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StoryboardInspector({
  shot,
  asset,
  assets,
  teamId,
  assetsPending,
  assetsError,
  editable,
  onChange,
  onRetryAssets,
}: {
  shot: StoryboardShot
  asset?: TeamAsset
  assets: TeamAsset[]
  teamId: string
  assetsPending: boolean
  assetsError: boolean
  editable: boolean
  onChange: (patch: Partial<StoryboardShot>) => void
  onRetryAssets: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <>
      <aside
        aria-label={`${shot.id} 镜头详情`}
        className="border-t border-border bg-background xl:min-h-0 xl:overflow-auto xl:border-t-0 xl:border-l"
      >
        <div className="aspect-video border-b border-border">
          <ShotThumbnail
            shot={shot}
            asset={asset}
            teamId={teamId}
            sizes="(max-width: 1280px) 100vw, 280px"
            priority
          />
        </div>
        <dl className="divide-y divide-border text-xs">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 p-3">
            <dt className="text-muted-foreground">画面素材</dt>
            <dd className="min-w-0">
              <span className="block truncate font-medium" title={asset?.name}>
                {asset?.name ?? (shot.assetId ? "素材不可用" : "未关联")}
              </span>
              {editable ? (
                <span className="mt-2 flex flex-wrap gap-2">
                  <Button size="xs" variant="outline" onClick={() => setPickerOpen(true)}>
                    <Link2 />
                    {shot.assetId ? "更换" : "选择"}
                  </Button>
                  {shot.assetId ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onChange({ assetId: undefined })}
                    >
                      <Unlink />
                      解除
                    </Button>
                  ) : null}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 p-3">
            <dt className="text-muted-foreground">镜头</dt>
            <dd className="font-medium">{shot.id}</dd>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 p-3">
            <dt className="text-muted-foreground">景别</dt>
            <dd>
              {editable ? (
                <Input
                  aria-label={`${shot.id} 景别`}
                  value={shot.type}
                  onChange={(event) => onChange({ type: event.target.value })}
                />
              ) : (
                shot.type
              )}
            </dd>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 p-3">
            <dt className="text-muted-foreground">镜头时长</dt>
            <dd>
              {editable ? (
                <label
                  htmlFor={`duration-${shot.id}`}
                  className="flex min-h-11 items-center gap-2"
                >
                  <Input
                    id={`duration-${shot.id}`}
                    type="number"
                    min={0.5}
                    max={300}
                    step={0.5}
                    value={shot.seconds}
                    onChange={(event) =>
                      onChange({
                        seconds: Math.min(
                          300,
                          Math.max(0.5, Number(event.target.value) || 0.5),
                        ),
                      })
                    }
                    aria-label={`${shot.id} 镜头时长`}
                    className="w-20"
                  />
                  秒
                </label>
              ) : (
                `${shot.seconds} 秒`
              )}
            </dd>
          </div>
          {[
            ["镜头参数", "lens", shot.lens],
            ["运动", "movement", shot.movement],
            ["脚本来源", "source", shot.source],
          ].map(([label, field, value]) => (
            <div key={field} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 p-3">
              <dt className="pt-2 text-muted-foreground">{label}</dt>
              <dd className="leading-5">
                {editable ? (
                  <Input
                    aria-label={`${shot.id} ${label}`}
                    value={value}
                    onChange={(event) => onChange({ [field]: event.target.value })}
                  />
                ) : (
                  value || "未填写"
                )}
              </dd>
            </div>
          ))}
          {[
            ["画面内容", "content", shot.content],
            ["台词", "dialogue", shot.dialogue],
            ["创作备注", "note", shot.note],
          ].map(([label, field, value]) => (
            <div key={field} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 p-3">
              <dt className="pt-2 text-muted-foreground">{label}</dt>
              <dd className="leading-5">
                {editable ? (
                  <Textarea
                    aria-label={`${shot.id} ${label}`}
                    value={value}
                    onChange={(event) => onChange({ [field]: event.target.value })}
                    className="min-h-20 resize-y"
                  />
                ) : (
                  value || "未填写"
                )}
              </dd>
            </div>
          ))}
        </dl>
      </aside>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border p-4 pb-3">
            <DialogTitle>选择分镜画面</DialogTitle>
            <DialogDescription>当前项目与团队公共资源中的可用图片</DialogDescription>
          </DialogHeader>
          <Command className="p-0">
            <CommandInput
              placeholder="搜索名称、项目或标签"
              aria-label="搜索分镜画面素材"
            />
            <CommandList className="max-h-96">
              {assetsPending ? (
                <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="animate-spin" />
                  正在载入资源
                </div>
              ) : assetsError ? (
                <div className="flex min-h-28 flex-col items-center justify-center gap-3 p-4 text-sm">
                  <span className="text-muted-foreground">资源库暂时无法读取</span>
                  <Button size="sm" variant="outline" onClick={onRetryAssets}>
                    <RefreshCw />
                    重新载入
                  </Button>
                </div>
              ) : (
                <>
                  <CommandEmpty>没有可关联的图片素材</CommandEmpty>
                  {assets.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.name} ${item.projectName ?? "团队公共"} ${item.tags.join(" ")}`}
                      data-checked={item.id === shot.assetId}
                      onSelect={() => {
                        onChange({ assetId: item.id })
                        setPickerOpen(false)
                      }}
                      className="min-h-16"
                    >
                      <span className="relative h-11 w-20 shrink-0 overflow-hidden border border-border bg-muted">
                        <Image
                          src={item.thumbnailUrl ?? assetApi.contentUrl(teamId, item.id)}
                          alt=""
                          fill
                          sizes="80px"
                          unoptimized
                          className="object-cover"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{item.name}</strong>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.projectName ?? "团队公共"}
                          {item.tags.length ? ` · ${item.tags.join(" · ")}` : ""}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StoryboardCards({
  shots,
  assetsById,
  teamId,
  selectedId,
  onSelect,
}: {
  shots: StoryboardShot[]
  assetsById: ReadonlyMap<string, TeamAsset>
  teamId: string
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className={cn(workspaceCardGridClassName, "p-3 sm:grid-cols-2 2xl:grid-cols-3")}>
      {shots.map((shot, index) => (
        <button
          key={shot.id}
          type="button"
          onClick={() => onSelect(shot.id)}
          className={cn(
            workspaceInteractiveCardClassName,
            "group text-left",
            selectedId === shot.id && "border-primary bg-primary/6",
          )}
        >
          <div className="aspect-video border-b border-border">
            <ShotThumbnail
              shot={shot}
              asset={shot.assetId ? assetsById.get(shot.assetId) : undefined}
              teamId={teamId}
              sizes="(max-width: 640px) 100vw, (max-width: 1536px) 50vw, 33vw"
              priority={index === 0}
            />
          </div>
          <span className="block p-3">
            <span className="flex items-center gap-2">
              <strong className="font-mono text-xs">{shot.id}</strong>
              <Badge variant="outline">{shot.type}</Badge>
            </span>
            <span className="mt-2 block min-h-10 text-xs leading-5 text-muted-foreground">
              {shot.content}
            </span>
            <span className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
              <span>{shot.seconds} 秒</span>
              <span className="truncate" title={`${shot.lens} · ${shot.movement}`}>
                {shot.lens} · {shot.movement}
              </span>
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

function StoryboardTable({
  shots,
  assetsById,
  teamId,
  selectedId,
  onSelect,
}: {
  shots: StoryboardShot[]
  assetsById: ReadonlyMap<string, TeamAsset>
  teamId: string
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <DataTableViewport label="分镜镜头表格">
      <table className="w-full min-w-[680px] border-collapse text-xs">
        <caption className="sr-only">
          分镜镜头的画面、镜号、景别、内容、时长、运动与脚本来源
        </caption>
        <thead>
          <tr className="h-10 border-b border-border bg-muted/60 text-left text-muted-foreground">
            <th scope="col" className="w-32 px-3 font-medium">
              画面
            </th>
            <th scope="col" className="px-3 font-medium">
              镜号
            </th>
            <th scope="col" className="px-3 font-medium">
              景别
            </th>
            <th scope="col" className="px-3 font-medium">
              画面内容
            </th>
            <th scope="col" className="px-3 font-medium">
              时长
            </th>
            <th scope="col" className="hidden px-3 font-medium md:table-cell">
              镜头 / 运动
            </th>
            <th scope="col" className="hidden px-3 font-medium lg:table-cell">
              来源
            </th>
          </tr>
        </thead>
        <tbody>
          {shots.map((shot) => (
            <tr
              key={shot.id}
              className={cn(
                "h-20 border-b border-border hover:bg-muted/45",
                selectedId === shot.id && "bg-primary/6",
              )}
            >
              <td className="p-2">
                <button
                  type="button"
                  onClick={() => onSelect(shot.id)}
                  className="block aspect-video min-h-11 w-28 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  aria-label={`打开分镜 ${shot.id}`}
                >
                  <ShotThumbnail
                    shot={shot}
                    asset={shot.assetId ? assetsById.get(shot.assetId) : undefined}
                    teamId={teamId}
                    sizes="112px"
                  />
                </button>
              </td>
              <td className="px-3 font-mono font-semibold">{shot.id}</td>
              <td className="px-3">{shot.type}</td>
              <td className="max-w-80 px-3 leading-5">{shot.content}</td>
              <td className="px-3">{shot.seconds} 秒</td>
              <td className="hidden px-3 md:table-cell">
                {shot.lens}
                <br />
                <span className="text-muted-foreground">{shot.movement}</span>
              </td>
              <td className="hidden px-3 text-muted-foreground lg:table-cell">
                {shot.source}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableViewport>
  )
}

function AnimaticLayout({
  sequence,
  assetsById,
  teamId,
  current,
  time,
  playing,
  onToggle,
  onStep,
  onSeek,
  onSelect,
}: {
  sequence: SequencedShot[]
  assetsById: ReadonlyMap<string, TeamAsset>
  teamId: string
  current: SequencedShot
  time: number
  playing: boolean
  onToggle: () => void
  onStep: (direction: number) => void
  onSeek: (time: number) => void
  onSelect: (shot: SequencedShot) => void
}) {
  const total = sequence.at(-1)?.end ?? 0
  const localTime = Math.min(current.seconds, Math.max(0, time - current.start))

  return (
    <div className="flex min-h-[560px] flex-col bg-media-base text-white">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-media-base p-3 sm:p-6">
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="relative aspect-video w-full max-w-4xl overflow-hidden border border-white/15"
        >
          <ShotThumbnail
            shot={current}
            asset={current.assetId ? assetsById.get(current.assetId) : undefined}
            teamId={teamId}
            sizes="(max-width: 1280px) 100vw, 900px"
            priority
          />
          <div className="absolute inset-x-0 bottom-0 bg-black/72 p-3 sm:p-4">
            {current.dialogue ? (
              <div className="mb-2 text-center text-sm font-medium">
                {current.dialogue}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <strong>{current.content}</strong>
              <span className="font-mono text-white/70">
                镜内 {formatTime(localTime)} / {formatTime(current.seconds)}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="border-t border-white/10 bg-media-panel">
        <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-white/10 px-2 py-1">
          <div className="flex items-center">
            <IconButton
              label="上一个镜头"
              onClick={() => onStep(-1)}
              className="text-white/75 hover:bg-white/10 hover:text-white"
            >
              <SkipBack />
            </IconButton>
            <IconButton
              label={playing ? "暂停" : "播放"}
              onClick={onToggle}
              className="bg-primary text-white hover:bg-primary/80 hover:text-white"
            >
              {playing ? <Pause /> : <Play />}
            </IconButton>
            <IconButton
              label="下一个镜头"
              onClick={() => onStep(1)}
              className="text-white/75 hover:bg-white/10 hover:text-white"
            >
              <SkipForward />
            </IconButton>
          </div>
          <span className="w-28 font-mono text-xs text-white/70">
            {formatTime(time)} / {formatTime(total)}
          </span>
          <label className="flex min-h-11 min-w-40 flex-1 items-center">
            <span className="sr-only">分镜播放位置</span>
            <input
              type="range"
              min={0}
              max={total}
              step={0.1}
              value={time}
              onChange={(event) => onSeek(Number(event.target.value))}
              className="w-full accent-support"
            />
          </label>
          <span className="text-xs text-white/50">分镜节奏预演</span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[680px] p-2">
            <div className="grid grid-cols-[54px_minmax(0,1fr)] text-xs">
              <div className="border-r border-white/10 text-white/45">
                <div className="h-6 border-b border-white/10 px-2 pt-1">时间</div>
                <div className="h-11 border-b border-white/10 px-2 pt-3.5">画面</div>
                <div className="h-11 px-2 pt-3.5">台词</div>
              </div>
              <div className="relative min-w-0">
                <div className="flex h-6 border-b border-white/10">
                  {sequence.map((shot) => (
                    <span
                      key={shot.id}
                      className="border-r border-white/10 px-1 pt-1 text-white/35"
                      style={{ width: `${(shot.seconds / total) * 100}%` }}
                    >
                      {formatTime(shot.start)}
                    </span>
                  ))}
                </div>
                <div className="flex h-11 border-b border-white/10">
                  {sequence.map((shot) => (
                    <button
                      key={shot.id}
                      type="button"
                      onClick={() => onSelect(shot)}
                      className={cn(
                        "min-w-0 border-r border-media-panel bg-white/10 px-2 text-left hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-support",
                        current.id === shot.id && "bg-primary hover:bg-primary",
                      )}
                      style={{ width: `${(shot.seconds / total) * 100}%` }}
                    >
                      <strong className="block truncate" title={shot.id}>
                        {shot.id}
                      </strong>
                      <span
                        className="block truncate text-white/55"
                        title={`${shot.type} · ${shot.seconds} 秒`}
                      >
                        {shot.type} · {shot.seconds} 秒
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex h-11">
                  {sequence.map((shot) => (
                    <button
                      key={shot.id}
                      type="button"
                      onClick={() => onSelect(shot)}
                      className={cn(
                        "min-w-0 border-r border-media-panel bg-media-surface px-2 text-left text-white/55 hover:bg-media-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-support",
                        !shot.dialogue && "text-white/25",
                        current.id === shot.id && "bg-media-active",
                      )}
                      style={{ width: `${(shot.seconds / total) * 100}%` }}
                    >
                      <span className="block truncate" title={shot.dialogue || "无台词"}>
                        {shot.dialogue || "—"}
                      </span>
                    </button>
                  ))}
                </div>
                <span
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-support"
                  style={{ left: `${total ? (time / total) * 100 : 0}%` }}
                >
                  <span className="absolute -left-1 top-0 size-2 bg-support" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Storyboard({
  project,
  documentId,
}: {
  project: WorkspaceScopedProject
  documentId: string
}) {
  const projectId = project.id
  const queryClient = useQueryClient()
  const queryKey = ["script-workspace", projectId, documentId] as const
  const workspaceQuery = useQuery({
    queryKey,
    queryFn: () => scriptApi.getWorkspace(projectId, documentId),
  })
  const assetsQuery = useQuery({
    queryKey: ["team-assets", project.teamId],
    queryFn: () => assetApi.list(project.teamId),
  })
  const [view, setView] = useState<StoryboardView>("cards")
  const [selectedId, setSelectedId] = useState("")
  const [shots, setShots] = useState<StoryboardShot[]>([])
  const [revision, setRevision] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting")
  const [playbackTime, setPlaybackTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const loadedScopeRef = useRef("")
  const draftContentRef = useRef("")
  const pendingSaveRef = useRef<PendingSave | null>(null)
  const workspace = workspaceQuery.data
  const currentVersion = workspace?.versions.find(
    (item) => item.id === workspace.document.currentVersionId && item.isCurrent,
  )
  const parsedShots = useMemo(
    () => (currentVersion ? parseStoryboardContent(currentVersion.content) : []),
    [currentVersion],
  )
  const storyboardAssets = useMemo(
    () =>
      (assetsQuery.data?.items ?? []).filter(
        (asset) =>
          asset.kind === "图片" &&
          asset.status === "ready" &&
          !asset.archived &&
          (asset.projectId === projectId || asset.projectId === null),
      ),
    [assetsQuery.data?.items, projectId],
  )
  const assetsById = useMemo(
    () => new Map(storyboardAssets.map((asset) => [asset.id, asset])),
    [storyboardAssets],
  )
  const draftContent = useMemo(() => serializeStoryboardContent(shots), [shots])
  draftContentRef.current = draftContent

  const resetEditor = useCallback((nextWorkspace: ScriptWorkspace) => {
    const version = nextWorkspace.versions.find(
      (item) => item.id === nextWorkspace.document.currentVersionId && item.isCurrent,
    )
    const nextShots = version ? parseStoryboardContent(version.content) : null
    if (!version || !nextShots) return false
    setShots(nextShots)
    setSelectedId((current) =>
      nextShots.some((shot) => shot.id === current) ? current : (nextShots[0]?.id ?? ""),
    )
    setRevision(version.revision)
    setPlaybackTime(0)
    setPlaying(false)
    setSaveState("saved")
    pendingSaveRef.current = null
    loadedScopeRef.current = `${nextWorkspace.document.id}:${version.id}`
    return true
  }, [])

  const saveMutation = useMutation({
    mutationFn: (payload: PendingSave) =>
      scriptApi.updateVersion(payload.projectId, payload.versionId, {
        documentId: payload.documentId,
        content: payload.content,
        expectedRevision: payload.expectedRevision,
        idempotencyKey: payload.idempotencyKey,
      }),
    onSuccess: (result, payload) => {
      queryClient.setQueryData<ScriptWorkspace>(queryKey, (current) =>
        current
          ? {
              ...current,
              versions: current.versions.map((item) =>
                item.id === result.version.id ? result.version : item,
              ),
            }
          : current,
      )
      setRevision(result.version.revision)
      pendingSaveRef.current = null
      setSaveState(draftContentRef.current === payload.content ? "saved" : "dirty")
    },
    onError: (error) => {
      setSaveState(
        error instanceof ApiError && error.code === "VERSION_CONFLICT"
          ? "conflict"
          : "error",
      )
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        void queryClient.invalidateQueries({ queryKey })
      }
    },
  })

  useEffect(() => {
    if (!workspace || !currentVersion || parsedShots === null) return
    const scope = `${workspace.document.id}:${currentVersion.id}`
    if (
      loadedScopeRef.current !== scope ||
      (saveState === "saved" && currentVersion.revision > revision)
    ) {
      resetEditor(workspace)
    }
  }, [currentVersion, parsedShots, resetEditor, revision, saveState, workspace])

  useEffect(() => {
    setRealtimeState("connecting")
    const events = new EventSource(
      `/api/v1/projects/${encodeURIComponent(projectId)}/script-events?${new URLSearchParams({ documentId })}`,
    )
    events.onopen = () => setRealtimeState("online")
    events.onerror = () => setRealtimeState("offline")
    events.addEventListener("script.version.updated", () => {
      void queryClient.invalidateQueries({
        queryKey: ["script-workspace", projectId, documentId],
      })
    })
    return () => events.close()
  }, [documentId, projectId, queryClient])

  useEffect(() => {
    if (
      saveState !== "dirty" ||
      !workspace?.permissions.canWrite ||
      !currentVersion ||
      saveMutation.isPending
    ) {
      return
    }
    const timeout = window.setTimeout(() => {
      const payload: PendingSave = {
        projectId,
        documentId,
        versionId: currentVersion.id,
        baseContent: currentVersion.content,
        content: draftContent,
        expectedRevision: revision,
        idempotencyKey: crypto.randomUUID(),
      }
      pendingSaveRef.current = payload
      setSaveState("saving")
      saveMutation.mutate(payload)
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [
    currentVersion,
    documentId,
    draftContent,
    projectId,
    revision,
    saveMutation,
    saveState,
    workspace?.permissions.canWrite,
  ])

  const sequence = useMemo(() => sequenceStoryboardShots(shots), [shots])

  const total = sequence.at(-1)?.end ?? 0
  const current = storyboardShotAtTime(sequence, playbackTime, selectedId)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setPlaybackTime((value) => {
        const next = value + 0.1
        if (next >= total) {
          setPlaying(false)
          return total
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [playing, total])

  useEffect(() => {
    if (current) setSelectedId(current.id)
  }, [current])

  const selectShot = (shot: SequencedShot | StoryboardShot) => {
    const sequenced = sequence.find((item) => item.id === shot.id)
    if (!sequenced) return
    setPlaying(false)
    setSelectedId(sequenced.id)
    setPlaybackTime(sequenced.start)
  }

  const stepShot = (direction: number) => {
    if (!current) return
    const index = Math.max(
      0,
      sequence.findIndex((shot) => shot.id === current.id),
    )
    selectShot(sequence[Math.min(sequence.length - 1, Math.max(0, index + direction))])
  }

  const changeCurrentShot = (patch: Partial<StoryboardShot>) => {
    if (!current || !workspace?.permissions.canWrite) return
    setPlaying(false)
    setPlaybackTime(current.start)
    setShots((items) =>
      items.map((shot) => (shot.id === current.id ? { ...shot, ...patch } : shot)),
    )
    setSaveState("dirty")
  }

  const addShot = () => {
    if (!workspace?.permissions.canWrite) return
    const shot: StoryboardShot = {
      id: nextStoryboardShotId(shots),
      type: "中景",
      seconds: 3,
      dialogue: "",
      lens: "50mm",
      movement: "固定",
      content: "",
      note: "",
      source: "",
      objectPosition: "center",
    }
    setShots((items) => [...items, shot])
    setSelectedId(shot.id)
    setPlaybackTime(total)
    setPlaying(false)
    setSaveState("dirty")
  }

  const reloadServerVersion = async () => {
    const latest = await scriptApi.getWorkspace(projectId, documentId)
    queryClient.setQueryData(queryKey, latest)
    resetEditor(latest)
  }

  const retrySave = () => {
    const pending = pendingSaveRef.current
    if (!pending || saveMutation.isPending) return
    setSaveState("saving")
    saveMutation.mutate(pending)
  }

  if (workspaceQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="animate-spin" />
        正在载入分镜
      </div>
    )
  }

  if (
    workspaceQuery.isError ||
    !workspace ||
    !currentVersion ||
    workspace.document.type !== "storyboard" ||
    parsedShots === null
  ) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-5 text-support" />
        <strong className="text-sm">分镜数据暂时无法读取</strong>
        <Button variant="outline" onClick={() => workspaceQuery.refetch()}>
          <RefreshCw />
          重新载入
        </Button>
      </div>
    )
  }

  return (
    <motion.section
      key={`storyboard-${projectId}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="flex min-h-0 flex-1 flex-col"
      aria-label="分镜工作区"
    >
      <PaneHeader
        title={`${workspace.document.title} · ${currentVersion.id}`}
        description={`${project.name} · ${shots.length} 个镜头 · 总时长 ${total} 秒`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span aria-live="polite" className="text-xs text-muted-foreground">
              {saveStateLabels[saveState]}
            </span>
            {saveState === "error" ? (
              <Button size="xs" variant="outline" onClick={retrySave}>
                <RefreshCw />
                重试
              </Button>
            ) : null}
            {saveState === "conflict" ? (
              <Button size="xs" variant="outline" onClick={reloadServerVersion}>
                <GitCompareArrows />
                载入服务器版本
              </Button>
            ) : null}
            <StatusBadge
              tone={
                realtimeState === "online"
                  ? "success"
                  : realtimeState === "offline"
                    ? "warning"
                    : "neutral"
              }
            >
              {realtimeState === "online" ? <Wifi /> : <WifiOff />}
              {realtimeState === "online" ? "实时已连接" : "正在重连"}
            </StatusBadge>
            {workspace.permissions.canWrite ? (
              <Button size="xs" variant="outline" onClick={addShot}>
                <Plus />
                新增镜头
              </Button>
            ) : null}
            <Tabs
              value={view}
              onValueChange={(value) => {
                setPlaying(false)
                setView(value as StoryboardView)
              }}
            >
              <TabsList>
                <TabsTrigger value="cards" aria-label="卡片视图" className="gap-1.5 px-2">
                  <Grid2X2 />
                  <span className="hidden sm:inline">卡片</span>
                </TabsTrigger>
                <TabsTrigger value="table" aria-label="表格视图" className="gap-1.5 px-2">
                  <List />
                  <span className="hidden sm:inline">表格</span>
                </TabsTrigger>
                <TabsTrigger
                  value="layout"
                  aria-label="Layout 节奏预演"
                  className="gap-1.5 px-2"
                >
                  <Columns3 />
                  <span className="hidden sm:inline">Layout</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      />

      {!current ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Columns3 className="size-5 text-muted-foreground" />
          <strong className="text-sm">这份分镜还没有镜头</strong>
          {workspace.permissions.canWrite ? (
            <Button variant="outline" onClick={addShot}>
              <Plus />
              添加首个镜头
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_320px] xl:overflow-hidden">
          <div data-scroll-owner className="min-h-0 min-w-0 xl:overflow-auto">
            <AnimatePresence mode="wait" initial={false}>
              {view === "cards" ? (
                <motion.div
                  key="cards"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <StoryboardCards
                    shots={shots}
                    assetsById={assetsById}
                    teamId={project.teamId}
                    selectedId={selectedId}
                    onSelect={(id) => {
                      const shot = sequence.find((item) => item.id === id)
                      if (shot) selectShot(shot)
                    }}
                  />
                </motion.div>
              ) : null}
              {view === "table" ? (
                <motion.div
                  key="table"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <StoryboardTable
                    shots={shots}
                    assetsById={assetsById}
                    teamId={project.teamId}
                    selectedId={selectedId}
                    onSelect={(id) => {
                      const shot = sequence.find((item) => item.id === id)
                      if (shot) selectShot(shot)
                    }}
                  />
                </motion.div>
              ) : null}
              {view === "layout" ? (
                <motion.div
                  key="layout"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <AnimaticLayout
                    sequence={sequence}
                    assetsById={assetsById}
                    teamId={project.teamId}
                    current={current}
                    time={playbackTime}
                    playing={playing}
                    onToggle={() => {
                      if (playbackTime >= total) setPlaybackTime(0)
                      setPlaying((value) => !value)
                    }}
                    onStep={stepShot}
                    onSeek={(time) => {
                      setPlaying(false)
                      setPlaybackTime(time)
                    }}
                    onSelect={selectShot}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <StoryboardInspector
            shot={current}
            asset={current.assetId ? assetsById.get(current.assetId) : undefined}
            assets={storyboardAssets}
            teamId={project.teamId}
            assetsPending={assetsQuery.isPending}
            assetsError={assetsQuery.isError}
            editable={workspace.permissions.canWrite}
            onChange={changeCurrentShot}
            onRetryAssets={() => void assetsQuery.refetch()}
          />
        </div>
      )}
    </motion.section>
  )
}

function scriptHashState() {
  if (typeof window === "undefined") {
    return { tab: "script" as WorkspaceTab, documentId: "" }
  }
  const query = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  return {
    tab: query.get("tab") === "storyboard" ? "storyboard" : "script",
    documentId: query.get("document") ?? "",
  } as const
}

function replaceScriptHashState(tab: WorkspaceTab, documentId: string) {
  if (typeof window === "undefined") return
  const path = window.location.hash.split("?")[0]
  const query = new URLSearchParams()
  if (documentId) query.set("document", documentId)
  if (tab !== "script") query.set("tab", tab)
  const hash = `${path}${query.size ? `?${query}` : ""}`
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${hash}`,
  )
}

export function ScriptsStoryboard({ project }: ScriptsStoryboardProps) {
  const projectId = project.id
  const initialState = scriptHashState()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<WorkspaceTab>(initialState.tab)
  const [documentId, setDocumentId] = useState(initialState.documentId)
  const [createOpen, setCreateOpen] = useState(false)
  const [documentTitle, setDocumentTitle] = useState("")
  const pendingDocumentKeyRef = useRef<string | null>(null)
  const documentsQuery = useQuery({
    queryKey: ["script-documents", projectId],
    queryFn: () => scriptApi.listDocuments(projectId),
  })
  const createDocumentMutation = useMutation({
    mutationFn: (payload: {
      title: string
      type: WorkspaceTab
      idempotencyKey: string
    }) => scriptApi.createDocument(projectId, payload),
    onSuccess: (result) => {
      pendingDocumentKeyRef.current = null
      queryClient.setQueryData(
        ["script-documents", projectId],
        documentsQuery.data
          ? {
              ...documentsQuery.data,
              documents: [...documentsQuery.data.documents, result.document],
            }
          : undefined,
      )
      void queryClient.invalidateQueries({ queryKey: ["script-documents", projectId] })
      setDocumentId(result.document.id)
      replaceScriptHashState(result.document.type, result.document.id)
      setTab(result.document.type)
      setDocumentTitle("")
      setCreateOpen(false)
    },
  })
  const documents = documentsQuery.data?.documents ?? []
  const activeDocuments = documents.filter((item) => item.type === tab)
  const selectedDocument = activeDocuments.find((item) => item.id === documentId)

  useEffect(() => {
    if (!documentsQuery.data || selectedDocument) return
    const next = activeDocuments.find((item) => item.isDefault) ?? activeDocuments[0]
    setDocumentId(next?.id ?? "")
    replaceScriptHashState(tab, next?.id ?? "")
  }, [activeDocuments, documentsQuery.data, selectedDocument, tab])

  useEffect(() => {
    const sync = () => {
      const next = scriptHashState()
      setTab(next.tab)
      if (next.documentId) setDocumentId(next.documentId)
    }
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const selectTab = (value: string) => {
    const next = value as WorkspaceTab
    const candidates = documents.filter((item) => item.type === next)
    const nextDocument =
      (selectedDocument?.type === next ? selectedDocument : null) ??
      candidates.find((item) => item.isDefault) ??
      candidates[0]
    setTab(next)
    setDocumentId(nextDocument?.id ?? "")
    replaceScriptHashState(next, nextDocument?.id ?? "")
  }

  const selectDocument = (value: string) => {
    setDocumentId(value)
    replaceScriptHashState(tab, value)
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-end border-b border-border px-3 sm:px-4">
        <Tabs value={tab} onValueChange={selectTab}>
          <TabsList variant="line" className="h-11 gap-5 p-0">
            <TabsTrigger value="script" className="h-10 gap-2 px-1">
              <Users />
              脚本
            </TabsTrigger>
            <TabsTrigger value="storyboard" className="h-10 gap-2 px-1">
              <Columns3 />
              分镜
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex h-full min-w-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="max-w-48 gap-1.5"
                disabled={documentsQuery.isPending || !activeDocuments.length}
              >
                {documentsQuery.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : tab === "script" ? (
                  <FileText />
                ) : (
                  <Columns3 />
                )}
                <span className="truncate">
                  {selectedDocument?.title ??
                    (tab === "script" ? "选择脚本文档" : "选择分镜文档")}
                </span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-72 min-w-64 overflow-y-auto"
            >
              <DropdownMenuLabel>
                {tab === "script" ? "项目脚本文档" : "项目分镜文档"}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={documentId} onValueChange={selectDocument}>
                {activeDocuments.map((document) => (
                  <DropdownMenuRadioItem key={document.id} value={document.id}>
                    <span className="min-w-0">
                      <strong className="block truncate text-xs">{document.title}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {document.currentVersionId}
                        {document.isDefault ? " · 默认" : ""}
                      </span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {documentsQuery.data?.permissions.canWrite ? (
            <IconButton
              label={tab === "script" ? "新建脚本文档" : "新建分镜文档"}
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
            </IconButton>
          ) : null}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === "script" ? (
          documentId ? (
            <ScriptEditor
              key={`${projectId}:${documentId}`}
              project={project}
              documentId={documentId}
            />
          ) : (
            <motion.div
              key="script-documents-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              {documentsQuery.isError ? (
                <>
                  <AlertTriangle className="text-support" />
                  脚本文档列表载入失败
                </>
              ) : (
                <>
                  <LoaderCircle className="animate-spin" />
                  正在载入脚本文档
                </>
              )}
            </motion.div>
          )
        ) : documentId ? (
          <Storyboard
            key={`${projectId}:${documentId}`}
            project={project}
            documentId={documentId}
          />
        ) : (
          <motion.div
            key="storyboard-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <Columns3 className="size-5 text-muted-foreground" />
            <strong className="text-sm">当前项目还没有分镜文档</strong>
            {documentsQuery.data?.permissions.canWrite ? (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus />
                新建分镜文档
              </Button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            pendingDocumentKeyRef.current = null
            createDocumentMutation.reset()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tab === "script" ? "新建脚本文档" : "新建分镜文档"}
            </DialogTitle>
            <DialogDescription>
              {tab === "script"
                ? "为当前项目创建独立的脚本、版本与协作评论空间。"
                : "为当前项目创建独立的镜头列表、版本与 Layout 节奏预演空间。"}
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="script-document-title" className="space-y-2">
            <span className="text-xs font-semibold">文档标题</span>
            <Input
              id="script-document-title"
              autoFocus
              value={documentTitle}
              onChange={(event) => {
                setDocumentTitle(event.target.value)
                pendingDocumentKeyRef.current = null
                createDocumentMutation.reset()
              }}
              placeholder={tab === "script" ? "例如：导演修改稿" : "例如：车站段落分镜"}
            />
          </label>
          {createDocumentMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {createDocumentMutation.error instanceof Error
                ? createDocumentMutation.error.message
                : "脚本文档创建失败"}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!documentTitle.trim() || createDocumentMutation.isPending}
              onClick={() => {
                const idempotencyKey =
                  pendingDocumentKeyRef.current ?? crypto.randomUUID()
                pendingDocumentKeyRef.current = idempotencyKey
                createDocumentMutation.mutate({
                  title: documentTitle.trim(),
                  type: tab,
                  idempotencyKey,
                })
              }}
            >
              {createDocumentMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              创建文档
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
