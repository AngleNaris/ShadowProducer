"use client"

import type {
  ReviewComment,
  ReviewCommentLink,
  ReviewFile,
  ReviewFolder,
  ReviewLink,
  ReviewLinkScope,
  TeamAsset,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  Eye,
  FilePlus2,
  Film,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  Link2,
  List,
  LoaderCircle,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  PanelRightClose,
  Pause,
  PenTool,
  Play,
  Reply,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Unlink2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { IconButton } from "@/components/workspace/icon-button"
import {
  DataTableViewport,
  EmptyState,
  StatusBadge,
  type StatusTone,
  WorkspaceHeader,
  workspaceCardGridClassName,
  workspaceInteractiveCardClassName,
} from "@/components/workspace/page-elements"
import type {
  ProjectId,
  WorkspaceScopedProject,
} from "@/components/workspace/workspace-data"
import { ApiError, assetApi, productionApi, reviewLinkApi } from "@/lib/api-client"
import { cn } from "@/lib/utils"

const timelineSegments = [
  { id: "opening", width: 14 },
  { id: "platform", width: 24 },
  { id: "cup", width: 17 },
  { id: "conversation", width: 20 },
  { id: "closing", width: 25 },
]

function formatAssetSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
  return `${(sizeBytes / 1024 / 1024).toFixed(sizeBytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function reviewDuration(value: string | null) {
  const seconds = value?.split(":").reduce((total, part) => total * 60 + Number(part), 0)
  return seconds && Number.isFinite(seconds) ? seconds : 30
}

function FileStatus({ status }: { status: ReviewFile["status"] }) {
  const tones: Record<ReviewFile["status"], StatusTone> = {
    待审阅: "primary",
    审阅中: "warning",
    已通过: "success",
    处理中: "neutral",
  }

  return <StatusBadge tone={tones[status]}>{status}</StatusBadge>
}

type ReviewFileList = { items: ReviewFile[]; folders: ReviewFolder[] }

function FileActionsMenu({
  file,
  folders,
  moving,
  archiving,
  onMove,
  onArchive,
}: {
  file: ReviewFile
  folders: ReviewFolder[]
  moving: boolean
  archiving: boolean
  onMove: (file: ReviewFile, folderId: string | null) => void
  onArchive: (file: ReviewFile) => void
}) {
  const pending = moving || archiving
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`操作 ${file.name}`} size="icon-sm" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : <MoreHorizontal />}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>移动到</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={file.folderId === null}
          onSelect={() => onMove(file, null)}
        >
          <FolderOpen />
          根目录
        </DropdownMenuItem>
        {folders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            disabled={file.folderId === folder.id}
            onSelect={() => onMove(file, folder.id)}
          >
            <FolderInput />
            {folder.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onArchive(file)}>
          <Archive />
          移入回收站
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const fileTableFeatures = tableFeatures({})
const fileColumnHelper = createColumnHelper<typeof fileTableFeatures, ReviewFile>()
const fileColumns = fileColumnHelper.columns([
  fileColumnHelper.accessor("name", {
    header: "名称",
    cell: ({ row }) => {
      const file = row.original
      return (
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center border border-border bg-primary/6 text-primary">
            <Film className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium" title={file.name}>
              {file.name}
            </div>
            <div
              className="truncate text-xs text-muted-foreground"
              title={`${file.version}${file.duration ? ` · ${file.duration}` : ""}`}
            >
              {file.version}
              {file.duration ? ` · ${file.duration}` : ""}
            </div>
          </div>
        </div>
      )
    },
  }),
  fileColumnHelper.accessor("comments", {
    header: "意见",
    cell: ({ row }) => (row.original.comments ? `${row.original.comments} 条` : "无"),
  }),
  fileColumnHelper.accessor("updated", {
    header: "更新时间",
  }),
  fileColumnHelper.accessor("status", {
    header: "状态",
    cell: ({ row }) => <FileStatus status={row.original.status} />,
  }),
  fileColumnHelper.display({
    id: "actions",
    header: "",
    cell: () => null,
  }),
])

function FileTable({
  data,
  folders,
  movingFileId,
  archivingFileId,
  onMove,
  onArchive,
  onOpen,
}: {
  data: ReviewFile[]
  folders: ReviewFolder[]
  movingFileId: string | null
  archivingFileId: string | null
  onMove: (file: ReviewFile, folderId: string | null) => void
  onArchive: (file: ReviewFile) => void
  onOpen: (file: ReviewFile) => void
}) {
  const table = useTable({
    features: fileTableFeatures,
    data,
    columns: fileColumns,
  })

  return (
    <DataTableViewport label="审片文件列表">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">审片文件、版本、意见数量、更新时间与状态</caption>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              className="h-9 border-b border-border bg-muted/60 text-left text-xs text-muted-foreground"
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className={cn(
                    "px-3 font-medium",
                    ["updated", "status", "actions"].includes(header.column.id) &&
                      "hidden sm:table-cell",
                  )}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="h-14 border-b border-border/80 transition-colors hover:bg-muted/55"
            >
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cn(
                    "px-3",
                    ["updated", "status", "actions"].includes(cell.column.id) &&
                      "hidden sm:table-cell",
                  )}
                >
                  {cell.column.id === "name" ? (
                    <button
                      type="button"
                      onClick={() => onOpen(row.original)}
                      className="flex min-h-11 w-full items-center text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                      aria-label={`打开视频：${row.original.name}`}
                    >
                      <table.FlexRender cell={cell} />
                    </button>
                  ) : cell.column.id === "actions" ? (
                    <div className="flex justify-end">
                      <FileActionsMenu
                        file={row.original}
                        folders={folders}
                        moving={movingFileId === row.original.id}
                        archiving={archivingFileId === row.original.id}
                        onMove={onMove}
                        onArchive={onArchive}
                      />
                    </div>
                  ) : (
                    <table.FlexRender cell={cell} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableViewport>
  )
}

const reviewPermissions: Array<{
  key: keyof ReviewLinkScope
  label: string
}> = [
  { key: "canComment", label: "允许评论" },
  { key: "canCompare", label: "允许版本对比" },
  { key: "canApprove", label: "允许确认成片" },
  { key: "canDownload", label: "允许下载原文件" },
]

function defaultReviewExpiry() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function ShareReviewDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  files,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: ProjectId
  projectName: string
  files: ReviewFile[]
}) {
  const queryClient = useQueryClient()
  const [fileIds, setFileIds] = useState<string[]>([])
  const [scope, setScope] = useState<ReviewLinkScope>({
    canComment: true,
    canCompare: true,
    canDownload: false,
    canApprove: true,
  })
  const [expiresAt, setExpiresAt] = useState(defaultReviewExpiry)
  const [password, setPassword] = useState("")
  const [copiedId, setCopiedId] = useState("")
  const [copyError, setCopyError] = useState("")
  const shareableFiles = files.filter((file) => file.type === "video" && file.mediaReady)
  const linksQuery = useQuery({
    queryKey: ["review-links", projectId],
    queryFn: () => reviewLinkApi.list(projectId),
    enabled: open,
  })

  const copyLink = async (link: ReviewLink) => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopiedId(link.id)
      setCopyError("")
    } catch {
      setCopyError("浏览器未允许复制，请从地址栏打开后复制链接")
    }
  }

  const createMutation = useMutation({
    mutationFn: () =>
      reviewLinkApi.create(projectId, {
        fileIds,
        scope,
        expiresAt: new Date(expiresAt).toISOString(),
        password: password || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<{ items: ReviewLink[] }>(
        ["review-links", projectId],
        (current) => ({ items: [item, ...(current?.items ?? [])] }),
      )
      void copyLink(item)
    },
  })
  const revokeMutation = useMutation({
    mutationFn: (linkId: string) => reviewLinkApi.revoke(projectId, linkId),
    onSuccess: (item) => {
      queryClient.setQueryData<{ items: ReviewLink[] }>(
        ["review-links", projectId],
        (current) => ({
          items: (current?.items ?? []).map((link) =>
            link.id === item.id ? item : link,
          ),
        }),
      )
    },
  })

  const toggleFile = (fileId: string) => {
    setFileIds((current) =>
      current.includes(fileId)
        ? current.filter((candidate) => candidate !== fileId)
        : [...current, fileId],
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88vh,48rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>分享客户审片</DialogTitle>
          <DialogDescription>{projectName}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-semibold">分享版本</legend>
            <div className="max-h-40 overflow-y-auto border border-border">
              {shareableFiles.length ? (
                shareableFiles.map((file) => (
                  <label
                    key={file.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border px-3 last:border-b-0 hover:bg-muted/45"
                  >
                    <input
                      type="checkbox"
                      checked={fileIds.includes(file.id)}
                      onChange={() => toggleFile(file.id)}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{file.version}</span>
                  </label>
                ))
              ) : (
                <p className="p-3 text-xs text-muted-foreground">暂无可分享版本</p>
              )}
            </div>
          </fieldset>

          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 text-xs font-semibold">访客权限</legend>
            {reviewPermissions.map((permission) => (
              <label
                key={permission.key}
                className="flex min-h-11 cursor-pointer items-center gap-3 border border-border px-3 hover:bg-muted/45"
              >
                <input
                  type="checkbox"
                  checked={scope[permission.key]}
                  onChange={(event) =>
                    setScope((current) => ({
                      ...current,
                      [permission.key]: event.target.checked,
                    }))
                  }
                  className="size-4 accent-primary"
                />
                <span className="text-sm">{permission.label}</span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label
              htmlFor="review-link-expiry"
              className="grid gap-1.5 text-xs font-medium"
            >
              有效期
              <Input
                id="review-link-expiry"
                type="datetime-local"
                value={expiresAt}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </label>
            <label
              htmlFor="review-link-password"
              className="grid gap-1.5 text-xs font-medium"
            >
              访问密码（可选）
              <Input
                id="review-link-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
              />
            </label>
          </div>

          {createMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {createMutation.error.message}
            </p>
          ) : null}
          {copyError ? (
            <p role="alert" className="text-xs text-destructive">
              {copyError}
            </p>
          ) : null}

          <section aria-labelledby="active-review-links">
            <h3 id="active-review-links" className="mb-2 text-xs font-semibold">
              已创建链接
            </h3>
            <div className="max-h-52 overflow-y-auto border border-border">
              {linksQuery.isPending ? (
                <div className="grid min-h-20 place-items-center">
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : linksQuery.isError ? (
                <p className="p-3 text-xs text-destructive">{linksQuery.error.message}</p>
              ) : linksQuery.data.items.length ? (
                linksQuery.data.items.map((link) => {
                  const inactive =
                    Boolean(link.revokedAt) || Date.parse(link.expiresAt) <= Date.now()
                  return (
                    <div
                      key={link.id}
                      className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium">
                          {inactive ? "已失效" : `${link.fileIds.length} 个版本`}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          有效至{" "}
                          {new Intl.DateTimeFormat("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          }).format(new Date(link.expiresAt))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={inactive}
                        onClick={() => void copyLink(link)}
                      >
                        {copiedId === link.id ? <Check /> : <Copy />}
                        {copiedId === link.id ? "已复制" : "复制"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={inactive || revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(link.id)}
                      >
                        <Trash2 />
                        撤销
                      </Button>
                    </div>
                  )
                })
              ) : (
                <p className="p-3 text-xs text-muted-foreground">尚未创建分享链接</p>
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            disabled={
              fileIds.length === 0 ||
              !expiresAt ||
              (password.length > 0 && password.length < 6) ||
              createMutation.isPending
            }
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Link2 />
            )}
            {createMutation.isPending ? "正在创建" : "创建并复制"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FileExplorer({
  project,
  folderId,
  onFolderChange,
  onOpen,
}: {
  project: WorkspaceScopedProject
  folderId: string | null
  onFolderChange: (folderId: string | null) => void
  onOpen: (file: ReviewFile) => void
}) {
  const projectId = project.id
  const queryClient = useQueryClient()
  const [view, setView] = useState<"list" | "grid">("list")
  const [query, setQuery] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [shareOpen, setShareOpen] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState("")
  const [reviewName, setReviewName] = useState("")
  const [reviewVersion, setReviewVersion] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<ReviewFile | null>(null)
  const filesQuery = useQuery({
    queryKey: ["production-review-files", projectId],
    queryFn: () => productionApi.listReviewFiles(projectId),
  })
  const projectFiles = filesQuery.data?.items ?? []
  const projectFolders = filesQuery.data?.folders ?? []
  const activeFolder = projectFolders.find((item) => item.id === folderId) ?? null
  const archivedFoldersQuery = useQuery({
    queryKey: ["production-review-folders-archived", projectId],
    queryFn: () => productionApi.listReviewFolders(projectId, true),
  })
  const archivedFolders = archivedFoldersQuery.data?.items ?? []
  const archivedFilesQuery = useQuery({
    queryKey: ["production-review-files-archived", projectId],
    queryFn: () => productionApi.listReviewFiles(projectId, true),
  })
  const archivedFiles = archivedFilesQuery.data?.items ?? []
  const archivedCount = archivedFolders.length + archivedFiles.length
  const assetsQuery = useQuery({
    queryKey: ["team-assets", project.teamId],
    queryFn: () => assetApi.list(project.teamId),
    enabled: createOpen,
  })
  const usedAssetIds = new Set(
    [...projectFiles, ...archivedFiles].flatMap((file) =>
      file.assetId ? [file.assetId] : [],
    ),
  )
  const eligibleAssets = (assetsQuery.data?.items ?? []).filter(
    (asset) =>
      asset.projectId === projectId &&
      asset.kind === "视频" &&
      asset.status === "ready" &&
      !asset.archived &&
      !usedAssetIds.has(asset.id),
  )
  const nextVersion = `v${
    [...projectFiles, ...archivedFiles].reduce((highest, file) => {
      const match = /^v(\d+)$/i.exec(file.version.trim())
      return Math.max(highest, match ? Number(match[1]) : 0)
    }, 0) + 1
  }`

  const selectAsset = (asset: TeamAsset) => {
    const baseName = asset.name.replace(/\.[^.]+$/, "")
    const match = /^(.*?)[\s_-]*(v\d+)$/i.exec(baseName)
    setSelectedAssetId(asset.id)
    setReviewName(match?.[1]?.trim() || baseName)
    setReviewVersion(match?.[2] ?? nextVersion)
  }

  const createReviewMutation = useMutation({
    mutationFn: () =>
      productionApi.createReviewFile(projectId, {
        assetId: selectedAssetId,
        folderId,
        name: reviewName.trim(),
        version: reviewVersion.trim(),
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<ReviewFileList>(
        ["production-review-files", projectId],
        (current) => ({
          items: [item, ...(current?.items ?? [])],
          folders: current?.folders ?? [],
        }),
      )
      setCreateOpen(false)
      setSelectedAssetId("")
      setReviewName("")
      setReviewVersion("")
    },
  })
  const createFolderMutation = useMutation({
    mutationFn: () =>
      productionApi.createReviewFolder(projectId, {
        name: folderName.trim(),
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<ReviewFileList>(
        ["production-review-files", projectId],
        (current) => ({
          items: current?.items ?? [],
          folders: [...(current?.folders ?? []), item].sort((left, right) =>
            left.name.localeCompare(right.name, "zh-CN"),
          ),
        }),
      )
      setCreateFolderOpen(false)
      setFolderName("")
      onFolderChange(item.id)
    },
  })
  const moveFileMutation = useMutation({
    mutationFn: ({
      file,
      targetFolderId,
    }: {
      file: ReviewFile
      targetFolderId: string | null
    }) =>
      productionApi.moveReviewFile(projectId, file.id, {
        folderId: targetFolderId,
        expectedRevision: file.revision,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<ReviewFileList>(
        ["production-review-files", projectId],
        (current) => ({
          folders: current?.folders ?? [],
          items: (current?.items ?? []).map((file) =>
            file.id === item.id ? item : file,
          ),
        }),
      )
    },
  })
  const updateFolderMutation = useMutation({
    mutationFn: ({ folder, archived }: { folder: ReviewFolder; archived: boolean }) =>
      productionApi.updateReviewFolder(projectId, folder.id, {
        archived,
        expectedRevision: folder.revision,
      }),
    onSuccess: async (item, { archived }) => {
      if (archived && folderId === item.id) onFolderChange(null)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["production-review-files", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["production-review-folders-archived", projectId],
        }),
      ])
    },
  })
  const updateFileMutation = useMutation({
    mutationFn: ({ file, archived }: { file: ReviewFile; archived: boolean }) =>
      productionApi.updateReviewFile(projectId, file.id, {
        archived,
        expectedRevision: file.revision,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["production-review-files", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["production-review-files-archived", projectId],
        }),
      ])
    },
  })
  const deleteFileMutation = useMutation({
    mutationFn: (file: ReviewFile) =>
      productionApi.permanentlyDeleteReviewFile(projectId, file.id, {
        expectedRevision: file.revision,
        confirmation: "permanent-delete",
      }),
    onSuccess: ({ id }) => {
      queryClient.setQueryData<ReviewFileList>(
        ["production-review-files-archived", projectId],
        (current) => ({
          items: (current?.items ?? []).filter((file) => file.id !== id),
          folders: current?.folders ?? [],
        }),
      )
      setDeleteTarget(null)
    },
  })
  const visibleFiles = projectFiles.filter((file) => {
    const queryMatch = `${file.name}${file.version}${file.status}`
      .toLowerCase()
      .includes(query.toLowerCase())
    if (!queryMatch) return false
    return file.folderId === folderId
  })

  return (
    <motion.section
      key="explorer"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <WorkspaceHeader
        title="审片"
        description="项目文件与审阅版本"
        actions={
          <>
            <div className="relative min-w-52 flex-1 sm:w-60 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索审片文件"
                autoComplete="off"
                placeholder="搜索文件或版本"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-8"
              />
            </div>
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as "list" | "grid")}
            >
              <TabsList>
                <TabsTrigger value="list" aria-label="列表视图" className="px-2">
                  <List className="size-4" />
                </TabsTrigger>
                <TabsTrigger value="grid" aria-label="网格视图" className="px-2">
                  <Grid2X2 className="size-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <FilePlus2 data-icon="inline-start" />
              添加版本
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
              <Link2 data-icon="inline-start" />
              分享审片
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-muted/25 md:block">
          <div className="flex h-10 items-center justify-between border-b border-border px-3">
            <span className="text-xs font-semibold">文件夹</span>
            <IconButton
              label="新建文件夹"
              size="icon-sm"
              onClick={() => setCreateFolderOpen(true)}
            >
              <FolderPlus />
            </IconButton>
          </div>
          <div className="p-2 text-sm">
            <button
              type="button"
              aria-current={folderId === null ? "true" : undefined}
              onClick={() => {
                setShowArchived(false)
                onFolderChange(null)
              }}
              className={cn(
                "flex h-11 w-full items-center gap-2 px-2 text-left",
                folderId === null && !showArchived
                  ? "bg-primary/8 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <FolderOpen className="size-4" />
              <span className="min-w-0 flex-1 truncate">根目录</span>
              <span className="text-xs tabular-nums">
                {projectFiles.filter((file) => file.folderId === null).length}
              </span>
            </button>
            {projectFolders.map((folder) => {
              const fileCount = projectFiles.filter(
                (file) => file.folderId === folder.id,
              ).length
              const pending =
                updateFolderMutation.isPending &&
                updateFolderMutation.variables?.folder.id === folder.id
              return (
                <div key={folder.id} className="flex items-center">
                  <button
                    type="button"
                    aria-current={folderId === folder.id ? "true" : undefined}
                    onClick={() => {
                      setShowArchived(false)
                      onFolderChange(folder.id)
                    }}
                    className={cn(
                      "flex h-11 min-w-0 flex-1 items-center gap-2 px-2 text-left",
                      folderId === folder.id && !showArchived
                        ? "bg-primary/8 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Folder className="size-4" />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <span className="text-xs tabular-nums">{fileCount}</span>
                  </button>
                  <IconButton
                    label={`将 ${folder.name} 移入回收站`}
                    size="icon-sm"
                    disabled={pending}
                    onClick={() =>
                      updateFolderMutation.mutate({ folder, archived: true })
                    }
                  >
                    {pending ? <LoaderCircle className="animate-spin" /> : <Archive />}
                  </IconButton>
                </div>
              )
            })}
            <button
              type="button"
              aria-current={showArchived ? "true" : undefined}
              onClick={() => setShowArchived(true)}
              className={cn(
                "mt-2 flex h-11 w-full items-center gap-2 border-t border-border px-2 text-left",
                showArchived
                  ? "bg-primary/8 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Trash2 className="size-4" />
              <span className="min-w-0 flex-1 truncate">回收站</span>
              <span className="text-xs tabular-nums">{archivedCount}</span>
            </button>
          </div>
        </aside>

        <div
          data-scroll-owner
          className="min-h-0 overflow-y-auto overflow-x-hidden bg-background"
        >
          <div className="flex h-10 items-center gap-2 border-b border-border px-3 text-xs text-muted-foreground">
            <span>{project.name}</span>
            <ChevronRight className="size-3" />
            <span className="text-foreground">
              {showArchived ? "回收站" : (activeFolder?.name ?? "根目录")}
            </span>
            <span className="ml-auto">
              {showArchived ? archivedCount : visibleFiles.length} 项
            </span>
          </div>
          {moveFileMutation.isError ||
          updateFolderMutation.isError ||
          updateFileMutation.isError ||
          deleteFileMutation.isError ? (
            <p
              role="alert"
              className="border-b border-border px-3 py-2 text-xs text-destructive"
            >
              {
                (
                  moveFileMutation.error ??
                  updateFolderMutation.error ??
                  updateFileMutation.error ??
                  deleteFileMutation.error
                )?.message
              }
            </p>
          ) : null}
          <AnimatePresence mode="wait">
            {showArchived &&
            (archivedFoldersQuery.isLoading || archivedFilesQuery.isLoading) ? (
              <motion.div
                key="archive-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <EmptyState icon={<Trash2 className="size-5" />} title="正在载入回收站" />
              </motion.div>
            ) : showArchived &&
              (archivedFoldersQuery.isError || archivedFilesQuery.isError) ? (
              <motion.div
                key="archive-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <EmptyState
                  icon={<Trash2 className="size-5" />}
                  title={
                    archivedFoldersQuery.error?.message ??
                    archivedFilesQuery.error?.message ??
                    "回收站载入失败"
                  }
                />
              </motion.div>
            ) : showArchived && archivedCount === 0 ? (
              <motion.div
                key="archive-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <EmptyState icon={<Trash2 className="size-5" />} title="回收站为空" />
              </motion.div>
            ) : showArchived ? (
              <motion.div
                key="archive-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="divide-y divide-border"
              >
                {archivedFolders.map((folder) => {
                  const pending =
                    updateFolderMutation.isPending &&
                    updateFolderMutation.variables?.folder.id === folder.id
                  return (
                    <div
                      key={folder.id}
                      className="flex min-h-14 items-center gap-3 px-3"
                    >
                      <div className="grid size-8 shrink-0 place-items-center border border-border bg-muted text-muted-foreground">
                        <Folder className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{folder.name}</div>
                        <div className="text-xs text-muted-foreground">审片文件夹</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          updateFolderMutation.mutate({ folder, archived: false })
                        }
                      >
                        {pending ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <RotateCcw />
                        )}
                        {pending ? "正在恢复" : "恢复"}
                      </Button>
                    </div>
                  )
                })}
                {archivedFiles.map((file) => {
                  const restoring =
                    updateFileMutation.isPending &&
                    updateFileMutation.variables?.file.id === file.id
                  const deleting =
                    deleteFileMutation.isPending &&
                    deleteFileMutation.variables?.id === file.id
                  return (
                    <div key={file.id} className="flex min-h-14 items-center gap-3 px-3">
                      <div className="grid size-8 shrink-0 place-items-center border border-border bg-muted text-muted-foreground">
                        <Film className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{file.name}</div>
                        <div className="text-xs text-muted-foreground">
                          审片版本 · {file.version}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title={`永久删除 ${file.name} ${file.version}`}
                          aria-label={`永久删除 ${file.name} ${file.version}`}
                          disabled={restoring || deleting}
                          onClick={() => setDeleteTarget(file)}
                        >
                          {deleting ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restoring || deleting}
                          onClick={() =>
                            updateFileMutation.mutate({ file, archived: false })
                          }
                        >
                          {restoring ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <RotateCcw />
                          )}
                          {restoring ? "正在恢复" : "恢复"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </motion.div>
            ) : filesQuery.isLoading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <EmptyState icon={<Film className="size-5" />} title="正在载入审片文件" />
              </motion.div>
            ) : filesQuery.isError ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <EmptyState
                  icon={<Film className="size-5" />}
                  title={filesQuery.error.message}
                />
              </motion.div>
            ) : visibleFiles.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <EmptyState
                  icon={<FolderOpen className="size-5" />}
                  title={query ? "没有匹配的审片文件" : "这个文件夹还是空的"}
                />
              </motion.div>
            ) : view === "list" ? (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <FileTable
                  data={visibleFiles}
                  folders={projectFolders}
                  movingFileId={
                    moveFileMutation.isPending
                      ? (moveFileMutation.variables?.file.id ?? null)
                      : null
                  }
                  archivingFileId={
                    updateFileMutation.isPending
                      ? (updateFileMutation.variables?.file.id ?? null)
                      : null
                  }
                  onMove={(file, targetFolderId) =>
                    moveFileMutation.mutate({ file, targetFolderId })
                  }
                  onArchive={(file) =>
                    updateFileMutation.mutate({ file, archived: true })
                  }
                  onOpen={onOpen}
                />
              </motion.div>
            ) : (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(
                  workspaceCardGridClassName,
                  "p-3 sm:grid-cols-2 xl:grid-cols-3",
                )}
              >
                {visibleFiles.map((file) => (
                  <article
                    key={file.id}
                    className={cn(
                      workspaceInteractiveCardClassName,
                      "group relative min-h-44 p-3 text-left hover:bg-muted/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(file)}
                      className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <div className="relative mb-3 grid aspect-video place-items-center overflow-hidden border border-border bg-media-panel text-muted-foreground">
                        <div className="flex flex-col items-center gap-2 text-xs">
                          <Film className="size-6" aria-hidden="true" />
                          <span>暂无视频预览</span>
                        </div>
                        {file.duration ? (
                          <span className="absolute bottom-1.5 right-1.5 bg-foreground/85 px-1.5 py-0.5 text-xs text-background">
                            {file.duration}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-start gap-2 pr-8">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium" title={file.name}>
                            {file.name}
                          </div>
                          <div
                            className="mt-0.5 truncate text-xs text-muted-foreground"
                            title={`${file.version} · ${file.updated}`}
                          >
                            {file.version} · {file.updated}
                          </div>
                        </div>
                        <FileStatus status={file.status} />
                      </div>
                    </button>
                    <div className="absolute bottom-2 right-2">
                      <FileActionsMenu
                        file={file}
                        folders={projectFolders}
                        moving={
                          moveFileMutation.isPending &&
                          moveFileMutation.variables?.file.id === file.id
                        }
                        archiving={
                          updateFileMutation.isPending &&
                          updateFileMutation.variables?.file.id === file.id
                        }
                        onMove={(item, targetFolderId) =>
                          moveFileMutation.mutate({ file: item, targetFolderId })
                        }
                        onArchive={(item) =>
                          updateFileMutation.mutate({ file: item, archived: true })
                        }
                      />
                    </div>
                  </article>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Dialog
        open={createFolderOpen}
        onOpenChange={(open) => {
          setCreateFolderOpen(open)
          if (!open) {
            setFolderName("")
            createFolderMutation.reset()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (folderName.trim()) createFolderMutation.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>新建文件夹</DialogTitle>
              <DialogDescription>{project.name} · 审片文件</DialogDescription>
            </DialogHeader>
            <label
              htmlFor="review-folder-name"
              className="grid gap-1.5 text-xs font-medium"
            >
              文件夹名称
              <Input
                id="review-folder-name"
                autoFocus
                maxLength={100}
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="例如：客户交付"
              />
            </label>
            {createFolderMutation.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {createFolderMutation.error.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateFolderOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={!folderName.trim() || createFolderMutation.isPending}
              >
                {createFolderMutation.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <FolderPlus />
                )}
                {createFolderMutation.isPending ? "正在创建" : "创建文件夹"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) createReviewMutation.reset()
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>添加审片版本</DialogTitle>
            <DialogDescription>{project.name} · 资源库视频</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="max-h-[min(42vh,22rem)] overflow-y-auto border border-border">
              {assetsQuery.isPending ? (
                <div className="grid min-h-32 place-items-center text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                </div>
              ) : assetsQuery.isError ? (
                <p role="alert" className="p-3 text-xs text-destructive">
                  {assetsQuery.error.message}
                </p>
              ) : eligibleAssets.length ? (
                <div className="divide-y divide-border">
                  {eligibleAssets.map((asset) => {
                    const selected = selectedAssetId === asset.id
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => selectAsset(asset)}
                        className={cn(
                          "flex min-h-16 w-full items-center gap-3 p-3 text-left outline-none transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                          selected && "bg-primary/7",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center bg-muted text-muted-foreground",
                            selected && "bg-primary/10 text-primary",
                          )}
                        >
                          <Film className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm font-medium">
                            {asset.name}
                          </strong>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {asset.mimeType} · {formatAssetSize(asset.sizeBytes)}
                          </span>
                        </span>
                        {selected ? (
                          <Check className="size-4 shrink-0 text-primary" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="grid min-h-32 place-items-center p-5 text-center text-xs leading-5 text-muted-foreground">
                  当前项目没有可添加的已入库视频素材
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <label
                htmlFor="review-version-name"
                className="grid gap-1.5 text-xs font-medium"
              >
                审片名称
                <Input
                  id="review-version-name"
                  value={reviewName}
                  onChange={(event) => setReviewName(event.target.value)}
                  placeholder="审片名称"
                  disabled={!selectedAssetId}
                />
              </label>
              <label
                htmlFor="review-version-label"
                className="grid gap-1.5 text-xs font-medium"
              >
                版本号
                <Input
                  id="review-version-label"
                  value={reviewVersion}
                  onChange={(event) => setReviewVersion(event.target.value)}
                  placeholder="v1"
                  disabled={!selectedAssetId}
                />
              </label>
            </div>

            {createReviewMutation.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {createReviewMutation.error.message}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                !selectedAssetId ||
                !reviewName.trim() ||
                !reviewVersion.trim() ||
                createReviewMutation.isPending
              }
              onClick={() => createReviewMutation.mutate()}
            >
              {createReviewMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <FilePlus2 />
              )}
              {createReviewMutation.isPending ? "正在添加" : "添加版本"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) =>
          !open && !deleteFileMutation.isPending && setDeleteTarget(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>永久删除审片版本</DialogTitle>
            <DialogDescription>
              将永久删除“{deleteTarget?.name} · {deleteTarget?.version}
              ”及其评论；素材库源文件不受影响。此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          {deleteFileMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {deleteFileMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleteFileMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleteFileMutation.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteFileMutation.mutate(deleteTarget)}
            >
              {deleteFileMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              {deleteFileMutation.isPending ? "正在永久删除" : "确认永久删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ShareReviewDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        projectId={projectId}
        projectName={project.name}
        files={projectFiles}
      />
    </motion.section>
  )
}

function ReviewWorkspace({
  project,
  file,
  onBack,
  onFileUpdated,
}: {
  project: WorkspaceScopedProject
  file: ReviewFile
  onBack: () => void
  onFileUpdated: (file: ReviewFile) => void
}) {
  const projectId = project.id
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const compareVideoRef = useRef<HTMLVideoElement>(null)
  const videoFrameRef = useRef<HTMLDivElement>(null)
  const [primaryFileId, setPrimaryFileId] = useState(file.id)
  const [compareFileId, setCompareFileId] = useState<string | null>(null)
  const filesQuery = useQuery({
    queryKey: ["production-review-files", projectId],
    queryFn: () => productionApi.listReviewFiles(projectId),
  })
  const versionFiles = (filesQuery.data?.items ?? [file])
    .filter((entry) => entry.type === "video" && entry.name === file.name)
    .sort((left, right) =>
      right.version.localeCompare(left.version, undefined, { numeric: true }),
    )
  const primaryFile = versionFiles.find((entry) => entry.id === primaryFileId) ?? file
  const compareFile = versionFiles.find((entry) => entry.id === compareFileId) ?? null
  const compareVersionFiles = versionFiles.filter(
    (entry) => entry.id !== primaryFile.id && entry.version !== primaryFile.version,
  )
  const [duration, setDuration] = useState(reviewDuration(file.duration))
  const [compareDuration, setCompareDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [resolution, setResolution] = useState("")
  const [compareResolution, setCompareResolution] = useState("")
  const [activeComment, setActiveComment] = useState("")
  const [commentsOpen, setCommentsOpen] = useState(true)
  const [tool, setTool] = useState<"cursor" | "pen">("cursor")
  const [time, setTime] = useState(0)
  const [commentFilter, setCommentFilter] = useState<"all" | "open" | "mine">("all")
  const [feedbackView, setFeedbackView] = useState<"version" | "merged">("version")
  const [draft, setDraft] = useState("")
  const [replyingTo, setReplyingTo] = useState<ReviewComment | null>(null)
  const mediaQuery = useQuery({
    queryKey: ["asset-content-url", project.teamId, primaryFile.assetId],
    queryFn: () =>
      assetApi.getReviewContentUrl(project.teamId, primaryFile.assetId ?? ""),
    enabled: Boolean(primaryFile.assetId),
    retry: false,
    staleTime: 4 * 60 * 1000,
  })
  const mediaUrl = mediaQuery.data?.url
  const compareMediaQuery = useQuery({
    queryKey: ["asset-content-url", project.teamId, compareFile?.assetId],
    queryFn: () =>
      assetApi.getReviewContentUrl(project.teamId, compareFile?.assetId ?? ""),
    enabled: Boolean(compareFile?.assetId),
    retry: false,
    staleTime: 4 * 60 * 1000,
  })
  const compareMediaUrl = compareMediaQuery.data?.url
  const commentsQuery = useQuery({
    queryKey: ["production-review-comments", projectId, primaryFile.id],
    queryFn: () => productionApi.listReviewComments(projectId, primaryFile.id),
  })
  const compareCommentsQuery = useQuery({
    queryKey: ["production-review-comments", projectId, compareFile?.id],
    queryFn: () => productionApi.listReviewComments(projectId, compareFile?.id ?? ""),
    enabled: Boolean(compareFile),
  })
  const correspondenceQuery = useQuery({
    queryKey: [
      "production-review-comment-correspondence",
      projectId,
      primaryFile.id,
      compareFile?.id,
    ],
    queryFn: () =>
      productionApi.listReviewCommentCorrespondence(
        projectId,
        primaryFile.id,
        compareFile?.id ?? "",
      ),
    enabled: Boolean(compareFile),
  })
  const reviewComments = commentsQuery.data?.items ?? []
  const compareComments = compareCommentsQuery.data?.items ?? []
  const versionComments = reviewComments.filter(
    (comment) =>
      comment.version === primaryFile.version && comment.parentCommentId === null,
  )
  const compareVersionComments = compareComments.filter(
    (comment) =>
      comment.version === compareFile?.version && comment.parentCommentId === null,
  )
  const repliesFor = (comment: ReviewComment) =>
    [...reviewComments, ...compareComments].filter(
      (reply) => reply.parentCommentId === comment.id,
    )

  const confirmedCounterpart = (commentId: string) => {
    const link = correspondenceQuery.data?.links.find(
      (item) => item.commentId === commentId || item.counterpartCommentId === commentId,
    )
    if (!link) return null
    const counterpartId =
      link.commentId === commentId ? link.counterpartCommentId : link.commentId
    const counterpart = compareVersionComments.find((item) => item.id === counterpartId)
    return counterpart ? { link, counterpart } : null
  }

  const suggestedCounterpart = (commentId: string) => {
    const suggestion = correspondenceQuery.data?.suggestions.find(
      (item) => item.commentId === commentId,
    )
    if (!suggestion) return null
    const counterpart = compareVersionComments.find(
      (item) => item.id === suggestion.counterpartCommentId,
    )
    return counterpart ? { suggestion, counterpart } : null
  }

  const mergedView = feedbackView === "merged" && Boolean(compareFile)
  const referencedCompareCommentIds = new Set(
    [
      ...(correspondenceQuery.data?.links.flatMap((link) => [
        link.commentId,
        link.counterpartCommentId,
      ]) ?? []),
      ...(correspondenceQuery.data?.suggestions.map(
        (suggestion) => suggestion.counterpartCommentId,
      ) ?? []),
    ].filter((commentId) =>
      compareVersionComments.some((comment) => comment.id === commentId),
    ),
  )
  const feedbackComments = mergedView
    ? [
        ...versionComments,
        ...compareVersionComments.filter(
          (comment) => !referencedCompareCommentIds.has(comment.id),
        ),
      ]
    : versionComments
  const feedbackSources = (comment: ReviewComment) => {
    if (!mergedView) return [comment]
    const counterpart =
      confirmedCounterpart(comment.id)?.counterpart ??
      suggestedCounterpart(comment.id)?.counterpart
    return counterpart ? [comment, counterpart] : [comment]
  }
  const visibleComments = feedbackComments.filter((comment) => {
    const sources = feedbackSources(comment)
    if (commentFilter === "open") {
      return sources.some((source) => source.state === "open")
    }
    if (commentFilter === "mine") {
      return sources.some((source) => source.author === "繁星")
    }
    return true
  })
  const openCommentCount = feedbackComments.filter((comment) =>
    feedbackSources(comment).some((source) => source.state === "open"),
  ).length
  const resolvedCommentCount = feedbackComments.length - openCommentCount

  const createCommentMutation = useMutation({
    mutationFn: ({ text, parent }: { text: string; parent: ReviewComment | null }) =>
      productionApi.createReviewComment(projectId, primaryFile.id, {
        version: primaryFile.version,
        timecode: parent?.timecode ?? formatTime(time),
        text,
        parentCommentId: parent?.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<{ items: ReviewComment[] }>(
        ["production-review-comments", projectId, primaryFile.id],
        (current) => ({ items: [...(current?.items ?? []), item] }),
      )
      queryClient.setQueryData<{ items: ReviewFile[] }>(
        ["production-review-files", projectId],
        (current) => ({
          items: (current?.items ?? []).map((entry) =>
            entry.id === primaryFile.id
              ? { ...entry, comments: entry.comments + 1 }
              : entry,
          ),
        }),
      )
      setActiveComment(item.id)
      setDraft("")
      setReplyingTo(null)
    },
  })

  const updateCommentMutation = useMutation({
    mutationFn: ({
      comment,
      state,
    }: {
      comment: ReviewComment
      state: ReviewComment["state"]
    }) =>
      productionApi.updateReviewComment(projectId, comment.id, {
        state,
        expectedRevision: comment.revision,
      }),
    onSuccess: (item) => {
      queryClient.setQueryData<{ items: ReviewComment[] }>(
        ["production-review-comments", projectId, item.fileId],
        (current) => ({
          items: (current?.items ?? []).map((comment) =>
            comment.id === item.id ? item : comment,
          ),
        }),
      )
    },
  })

  const createCommentLinkMutation = useMutation({
    mutationFn: ({
      commentId,
      counterpartCommentId,
    }: {
      commentId: string
      counterpartCommentId: string
    }) =>
      productionApi.createReviewCommentLink(projectId, {
        commentId,
        counterpartCommentId,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["production-review-comment-correspondence", projectId],
      }),
  })

  const unlinkCommentMutation = useMutation({
    mutationFn: (link: ReviewCommentLink) =>
      productionApi.unlinkReviewCommentLink(projectId, link.id, {
        expectedRevision: link.revision,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["production-review-comment-correspondence", projectId],
      }),
    onError: () =>
      queryClient.invalidateQueries({
        queryKey: ["production-review-comment-correspondence", projectId],
      }),
  })

  const approvalMutation = useMutation({
    mutationFn: (action: "approve" | "revoke") => {
      const body = {
        expectedRevision: primaryFile.revision,
        idempotencyKey: crypto.randomUUID(),
      }
      return action === "approve"
        ? productionApi.approveReviewFile(projectId, primaryFile.id, body)
        : productionApi.revokeReviewFileApproval(projectId, primaryFile.id, body)
    },
    onSuccess: ({ item }) => {
      queryClient.setQueryData<{ items: ReviewFile[] }>(
        ["production-review-files", projectId],
        (current) => ({
          items: (current?.items ?? []).map((entry) =>
            entry.id === item.id ? item : entry,
          ),
        }),
      )
      onFileUpdated(item)
      void queryClient.invalidateQueries({ queryKey: ["portfolio-candidates"] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({
          queryKey: ["production-review-files", projectId],
        })
      }
    },
  })

  const approvalBlocked = primaryFile.status === "处理中"
  const approvedAtLabel = primaryFile.approvedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(primaryFile.approvedAt))
    : null
  const approvalFeedback = approvalMutation.isError
    ? approvalMutation.error instanceof ApiError && approvalMutation.error.status === 409
      ? "状态已变化，请返回列表刷新后重试"
      : approvalMutation.error.message
    : approvalMutation.isPending
      ? primaryFile.status === "已通过"
        ? "正在撤销批准"
        : "正在批准"
      : primaryFile.status === "已通过" && primaryFile.approvedBy && approvedAtLabel
        ? `${primaryFile.approvedBy} · ${approvedAtLabel} 通过`
        : primaryFile.status
  const timelineDuration = Math.max(duration, compareFile ? compareDuration : 0, 0.01)
  const videoPanes = [
    {
      slot: "A" as const,
      file: primaryFile,
      mediaUrl,
      mediaQuery,
      videoRef,
      duration,
      resolution,
    },
    ...(compareFile
      ? [
          {
            slot: "B" as const,
            file: compareFile,
            mediaUrl: compareMediaUrl,
            mediaQuery: compareMediaQuery,
            videoRef: compareVideoRef,
            duration: compareDuration,
            resolution: compareResolution,
          },
        ]
      : []),
  ]

  useEffect(() => {
    if (feedbackComments.some((comment) => comment.id === activeComment)) return
    setActiveComment(feedbackComments[0]?.id ?? "")
  }, [activeComment, feedbackComments])

  const formatTime = (value: number) => {
    const wholeSeconds = Math.floor(value)
    const minutes = Math.floor(wholeSeconds / 60)
    const seconds = wholeSeconds % 60
    const milliseconds = Math.floor((value - wholeSeconds) * 1000)
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
  }

  const timecodeToSeconds = (timecode: string) => {
    const seconds = timecode
      .split(":")
      .reduce((total, part) => total * 60 + Number(part), 0)
    return Math.min(timelineDuration, Number.isFinite(seconds) ? seconds : 0)
  }

  const seekTo = (nextTime: number) => {
    const next = Math.max(0, Math.min(timelineDuration, nextTime))
    if (videoRef.current) videoRef.current.currentTime = Math.min(next, duration)
    if (compareVideoRef.current) {
      compareVideoRef.current.currentTime = Math.min(next, compareDuration)
    }
    setTime(next)
  }

  const pausePlayback = () => {
    videoRef.current?.pause()
    compareVideoRef.current?.pause()
    setPlaying(false)
  }

  const updatePlayingState = () => {
    setPlaying(
      [videoRef.current, compareVideoRef.current].some(
        (entry) => entry && !entry.paused && !entry.ended,
      ),
    )
  }

  const selectPrimaryFile = (nextFile: ReviewFile) => {
    pausePlayback()
    setPrimaryFileId(nextFile.id)
    if (compareFileId === nextFile.id || compareFile?.version === nextFile.version) {
      setCompareFileId(null)
      setCompareDuration(0)
      setCompareResolution("")
    }
    setDuration(reviewDuration(nextFile.duration))
    setResolution("")
    setTime(0)
  }

  const selectCompareFile = (nextFile: ReviewFile | null) => {
    pausePlayback()
    setCompareFileId(nextFile?.id ?? null)
    setCompareDuration(nextFile ? reviewDuration(nextFile.duration) : 0)
    setCompareResolution("")
    setFeedbackView(nextFile ? "merged" : "version")
    setTime(0)
  }

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video || !mediaUrl) return
    const videos = [video, compareVideoRef.current].filter(
      (entry): entry is HTMLVideoElement => Boolean(entry),
    )
    if (videos.some((entry) => !entry.paused && !entry.ended)) {
      pausePlayback()
      return
    }

    const playable = videos.filter((entry) => entry.currentTime < entry.duration)
    if (playable.length === 0) seekTo(0)
    void Promise.allSettled(
      (playable.length > 0 ? playable : videos).map((entry) => entry.play()),
    ).then(updatePlayingState)
  }

  return (
    <motion.section
      key="review"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-media-base"
    >
      <div className="flex h-12 shrink-0 items-center border-b border-white/10 bg-media-panel px-2 text-white">
        <IconButton
          label="返回文件列表"
          onClick={onBack}
          className="text-white/75 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft />
        </IconButton>
        <Separator orientation="vertical" className="mx-2 h-5 bg-white/15" />
        <div className="hidden min-w-0 flex-1 sm:block">
          <div className="truncate text-sm font-medium" title={primaryFile.name}>
            {primaryFile.name}
          </div>
          <div
            className="truncate text-xs text-white/55"
            title={`${primaryFile.version}${resolution ? ` · ${resolution}` : ""}`}
          >
            主审 {primaryFile.version}
            {resolution ? ` · ${resolution}` : ""}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none text-white/75 hover:bg-white/10 hover:text-white"
            >
              A {primaryFile.version}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-none">
            <DropdownMenuLabel>主审版本 A</DropdownMenuLabel>
            {versionFiles.map((option) => (
              <DropdownMenuItem
                key={option.id}
                className="rounded-none"
                onSelect={() => selectPrimaryFile(option)}
              >
                {option.version}
                {option.id === file.id ? " · 打开版本" : ""}
                {primaryFile.id === option.id ? (
                  <Check className="ml-auto size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={compareVersionFiles.length === 0}
              className="rounded-none text-white/75 hover:bg-white/10 hover:text-white"
            >
              <Columns2 />B {compareFile?.version ?? "添加对比"}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-none">
            <DropdownMenuLabel>对比版本 B</DropdownMenuLabel>
            <DropdownMenuItem
              className="rounded-none"
              onSelect={() => selectCompareFile(null)}
            >
              不对比
              {!compareFile ? <Check className="ml-auto size-4 text-primary" /> : null}
            </DropdownMenuItem>
            {compareVersionFiles.map((option) => (
              <DropdownMenuItem
                key={option.id}
                className="rounded-none"
                onSelect={() => selectCompareFile(option)}
              >
                {option.version}
                {compareFile?.id === option.id ? (
                  <Check className="ml-auto size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "sr-only max-w-48 truncate px-2 text-xs md:not-sr-only",
            approvalMutation.isError ? "text-destructive" : "text-white/50",
          )}
          title={approvalFeedback}
        >
          {approvalFeedback}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none text-white/75 hover:bg-white/10 hover:text-white",
            primaryFile.status === "已通过" && "text-positive hover:text-positive",
          )}
          disabled={approvalMutation.isPending || approvalBlocked}
          title={
            primaryFile.status === "处理中"
              ? "文件处理完成后才能批准"
              : primaryFile.status === "已通过"
                ? "撤销当前版本的批准状态"
                : "批准当前审片版本"
          }
          onClick={() =>
            approvalMutation.mutate(
              primaryFile.status === "已通过" ? "revoke" : "approve",
            )
          }
        >
          {primaryFile.status === "已通过" ? (
            <RotateCcw data-icon="inline-start" />
          ) : (
            <Check data-icon="inline-start" />
          )}
          {approvalMutation.isPending
            ? primaryFile.status === "已通过"
              ? "正在撤销"
              : "正在批准"
            : primaryFile.status === "已通过"
              ? "撤销批准"
              : "批准版本"}
        </Button>
        <IconButton
          label={commentsOpen ? "收起意见" : "展开意见"}
          onClick={() => setCommentsOpen((value) => !value)}
          className="text-white/75 hover:bg-white/10 hover:text-white"
        >
          {commentsOpen ? <PanelRightClose /> : <MessageSquare />}
        </IconButton>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 transition-[grid-template-columns] duration-300",
          commentsOpen ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1",
        )}
      >
        <div className="flex min-h-0 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-media-base p-4 sm:p-6">
            <div className="absolute right-3 top-3 z-20 flex flex-col border border-white/15 bg-media-base/92">
              <IconButton
                label="选择工具"
                onClick={() => setTool("cursor")}
                className={cn(
                  "text-white/70 hover:bg-white/10 hover:text-white",
                  tool === "cursor" && "bg-primary text-white hover:bg-primary",
                )}
              >
                <Eye />
              </IconButton>
              <Separator className="bg-white/15" />
              <IconButton
                label="画面标注"
                onClick={() => setTool("pen")}
                className={cn(
                  "text-white/70 hover:bg-white/10 hover:text-white",
                  tool === "pen" && "bg-primary text-white hover:bg-primary",
                )}
              >
                <PenTool />
              </IconButton>
            </div>

            <motion.div
              layout
              ref={videoFrameRef}
              className={cn(
                "relative grid w-full overflow-hidden border border-white/15 bg-media-panel shadow-2xl",
                compareFile
                  ? "max-w-7xl grid-cols-1 sm:grid-cols-2"
                  : "max-w-5xl grid-cols-1",
              )}
            >
              <AnimatePresence initial={false}>
                {videoPanes.map((pane) => (
                  <motion.div
                    layout
                    key={`${pane.slot}-${pane.file.id}`}
                    initial={{ opacity: 0, x: pane.slot === "B" ? 24 : 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: pane.slot === "B" ? 24 : 0 }}
                    className={cn(
                      "relative aspect-video min-w-0 overflow-hidden bg-media-panel",
                      pane.slot === "A" &&
                        compareFile &&
                        "border-b border-white/15 sm:border-b-0 sm:border-r",
                    )}
                  >
                    {pane.mediaUrl ? (
                      <video
                        ref={pane.videoRef}
                        src={pane.mediaUrl}
                        preload="metadata"
                        muted={muted}
                        playsInline
                        aria-label={`${project.name}审片视频 ${pane.slot} ${pane.file.version}`}
                        className="size-full object-contain"
                        onLoadedMetadata={(event) => {
                          const video = event.currentTarget
                          if (Number.isFinite(video.duration) && video.duration > 0) {
                            if (pane.slot === "A") setDuration(video.duration)
                            else setCompareDuration(video.duration)
                          }
                          const value = `${video.videoWidth} × ${video.videoHeight}`
                          if (pane.slot === "A") setResolution(value)
                          else setCompareResolution(value)
                        }}
                        onTimeUpdate={(event) => {
                          if (pane.slot === "A") {
                            const next = event.currentTarget.currentTime
                            setTime(next)
                            const comparison = compareVideoRef.current
                            if (
                              comparison &&
                              !comparison.paused &&
                              Math.abs(comparison.currentTime - next) > 0.15
                            ) {
                              comparison.currentTime = Math.min(next, compareDuration)
                            }
                          } else if (videoRef.current?.ended) {
                            setTime(event.currentTarget.currentTime)
                          }
                        }}
                        onPlay={updatePlayingState}
                        onPause={updatePlayingState}
                        onEnded={updatePlayingState}
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 grid place-items-center bg-media-panel px-6 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center gap-3 text-sm">
                          <Film className="size-8" aria-hidden="true" />
                          <span>暂无视频预览</span>
                        </div>
                      </div>
                    )}
                    <div className="absolute left-3 top-3 z-10 bg-black/60 px-2 py-1 text-xs text-white/85">
                      {pane.slot} · {pane.file.version}
                      {pane.resolution ? ` · ${pane.resolution}` : ""}
                    </div>
                    {!pane.mediaUrl ? (
                      <div
                        role="status"
                        className="absolute inset-0 grid place-items-center bg-black/35 px-6 text-center text-sm text-white/80"
                      >
                        {pane.mediaQuery.isLoading
                          ? "正在获取播放地址"
                          : pane.file.assetId
                            ? pane.mediaQuery.error?.message || "源文件暂时无法播放"
                            : "当前版本尚未关联资源库视频"}
                      </div>
                    ) : null}
                    <AnimatePresence>
                      {pane.slot === "A" && pane.mediaUrl && !playing ? (
                        <motion.button
                          type="button"
                          aria-label="播放"
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          onClick={togglePlayback}
                          className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center border border-white/30 bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <Play className="ml-0.5 size-5 fill-current" />
                        </motion.button>
                      ) : null}
                    </AnimatePresence>
                    <AnimatePresence initial={false}>
                      {pane.slot === "A" && tool === "pen" ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          className="absolute left-[58%] top-[30%] h-[28%] w-[18%] border-2 border-support"
                        >
                          <span className="absolute -top-6 left-0 bg-support px-1.5 py-0.5 text-xs font-semibold text-support-foreground">
                            新标注
                          </span>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 font-mono text-xs text-white">
                      {formatTime(Math.min(time, pane.duration))}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>

          <div className="shrink-0 border-t border-white/10 bg-media-panel text-white">
            <div className="relative h-11 border-b border-white/10 px-3 pt-2">
              <div className="absolute left-3 right-3 top-4 h-3 bg-white/8">
                {timelineSegments.map((segment) => (
                  <span
                    key={segment.id}
                    className="inline-block h-full border-r border-media-panel bg-white/12"
                    style={{ width: `${segment.width}%` }}
                  />
                ))}
              </div>
              <motion.div
                layout
                className="absolute bottom-0 top-1 z-10 w-px bg-support"
                style={{ left: `${(time / timelineDuration) * 100}%` }}
              >
                <span className="absolute -left-1.5 top-0 block h-2 w-3 bg-support" />
              </motion.div>
              {reviewComments.map((comment) => (
                <button
                  key={comment.id}
                  type="button"
                  aria-label={`跳转到 ${comment.timecode}`}
                  onClick={() => {
                    setActiveComment(comment.id)
                    seekTo(timecodeToSeconds(comment.timecode))
                  }}
                  className="absolute top-0 z-40 grid size-11 -translate-x-1/2 place-items-center bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-support"
                  style={{
                    left: `${(timecodeToSeconds(comment.timecode) / timelineDuration) * 100}%`,
                  }}
                >
                  <span className="size-2 bg-primary ring-2 ring-media-panel" />
                </button>
              ))}
              <input
                type="range"
                min={0}
                max={timelineDuration}
                step={0.01}
                value={time}
                onChange={(event) => {
                  pausePlayback()
                  seekTo(Number(event.target.value))
                }}
                disabled={!mediaUrl}
                aria-label="审片时间线"
                className="absolute inset-x-3 top-0 z-30 h-11 cursor-pointer opacity-0"
              />
            </div>

            <div className="flex h-11 items-center gap-1 px-2">
              <IconButton
                label={playing ? "暂停" : "播放"}
                onClick={togglePlayback}
                disabled={!mediaUrl}
                className="text-white hover:bg-white/10 hover:text-white"
              >
                {playing ? <Pause /> : <Play />}
              </IconButton>
              <span className="min-w-0 whitespace-nowrap font-mono text-xs text-white/75 sm:min-w-36 sm:text-xs">
                {formatTime(time)} / A {formatTime(duration)}
                {compareFile ? ` · B ${formatTime(compareDuration)}` : ""}
              </span>
              <div className="ml-auto flex items-center">
                <IconButton
                  label={muted ? "取消静音" : "静音"}
                  onClick={() => setMuted((value) => !value)}
                  disabled={!mediaUrl}
                  className="text-white/70 hover:bg-white/10 hover:text-white"
                >
                  {muted ? <VolumeX /> : <Volume2 />}
                </IconButton>
                <IconButton
                  label="全屏"
                  onClick={() => void videoFrameRef.current?.requestFullscreen()}
                  disabled={!mediaUrl}
                  className="text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <Maximize2 />
                </IconButton>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {commentsOpen ? (
            <motion.aside
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              className="flex min-h-0 flex-col border-t border-white/10 bg-background text-foreground xl:border-l xl:border-t-0"
            >
              <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
                <div>
                  <div className="text-sm font-semibold">意见</div>
                  <div className="text-xs text-muted-foreground">
                    {openCommentCount} 条待处理 · {resolvedCommentCount} 条已解决
                    {mergedView
                      ? ` · ${correspondenceQuery.data?.links.length ?? 0} 组已合并`
                      : ""}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="ml-auto rounded-none">
                      {commentFilter === "all"
                        ? "全部"
                        : commentFilter === "open"
                          ? "未解决"
                          : "我的意见"}
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setCommentFilter("all")}>
                      全部
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCommentFilter("open")}>
                      未解决
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCommentFilter("mine")}>
                      我的意见
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {compareFile ? (
                <Tabs
                  value={feedbackView}
                  onValueChange={(value) =>
                    setFeedbackView(value as "version" | "merged")
                  }
                  className="shrink-0 gap-0 border-b border-border"
                >
                  <TabsList className="min-h-9 w-full rounded-none p-0" variant="line">
                    <TabsTrigger value="version" className="min-h-9 rounded-none text-xs">
                      版本 A
                    </TabsTrigger>
                    <TabsTrigger value="merged" className="min-h-9 rounded-none text-xs">
                      合并视图
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : null}

              <ScrollArea className="min-h-48 flex-1">
                <div className="divide-y divide-border">
                  {compareFile &&
                  (compareCommentsQuery.isError || correspondenceQuery.isError) ? (
                    <div role="alert" className="px-3 py-2 text-xs text-destructive">
                      {compareCommentsQuery.error?.message ??
                        correspondenceQuery.error?.message ??
                        "版本对应载入失败"}
                    </div>
                  ) : null}
                  {createCommentLinkMutation.isError || unlinkCommentMutation.isError ? (
                    <div role="alert" className="px-3 py-2 text-xs text-destructive">
                      {createCommentLinkMutation.error?.message ??
                        unlinkCommentMutation.error?.message ??
                        "对应关系更新失败"}
                    </div>
                  ) : null}
                  {visibleComments.map((comment) => {
                    const active = activeComment === comment.id
                    const confirmed = mergedView ? confirmedCounterpart(comment.id) : null
                    const suggested =
                      mergedView && !confirmed ? suggestedCounterpart(comment.id) : null
                    const counterpart = confirmed?.counterpart ?? suggested?.counterpart
                    const sourceSlot = comment.fileId === primaryFile.id ? "A" : "B"
                    return (
                      <div
                        key={comment.id}
                        className={cn(
                          "relative flex w-full items-start gap-1 p-1 transition-colors hover:bg-muted/60",
                          active && "bg-primary/7",
                        )}
                      >
                        {active ? (
                          <motion.span
                            layoutId="active-comment"
                            className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveComment(comment.id)
                              seekTo(timecodeToSeconds(comment.timecode))
                            }}
                            className="flex min-h-11 w-full min-w-0 gap-2.5 p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                          >
                            <Avatar className="size-7 shrink-0 rounded-none">
                              <AvatarFallback className="rounded-none bg-muted text-xs">
                                {comment.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="text-xs font-semibold">
                                  {comment.author}
                                </span>
                                {mergedView ? (
                                  <span className="text-xs text-muted-foreground">
                                    {sourceSlot} · {comment.version}
                                  </span>
                                ) : null}
                                <span className="font-mono text-xs text-primary">
                                  {comment.timecode}
                                </span>
                                {comment.state === "resolved" ? (
                                  <CheckCircle2 className="ml-auto size-3.5 text-positive" />
                                ) : null}
                              </span>
                              <span
                                className={cn(
                                  "mt-1 block text-xs leading-5 text-muted-foreground",
                                  comment.state === "resolved" && "line-through",
                                )}
                              >
                                {comment.text}
                              </span>
                            </span>
                          </button>
                          <AnimatePresence initial={false}>
                            {mergedView && compareFile && counterpart ? (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className={cn(
                                  "mb-2 ml-11 mr-1 flex min-w-0 items-center border-l-2 pl-2",
                                  confirmed
                                    ? "border-support/60"
                                    : "border-border text-muted-foreground",
                                )}
                              >
                                <Link2 className="mr-2 size-3.5 shrink-0" />
                                <button
                                  type="button"
                                  onClick={() =>
                                    seekTo(timecodeToSeconds(counterpart.timecode))
                                  }
                                  className="min-w-0 flex-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                                >
                                  <span className="block font-mono text-xs">
                                    {confirmed
                                      ? "已合并"
                                      : `智能建议 ${Math.round(
                                          (suggested?.suggestion.score ?? 0) * 100,
                                        )}%`}{" "}
                                    · B {compareFile.version} · {counterpart.timecode}
                                  </span>
                                  <span
                                    className="block truncate text-xs"
                                    title={counterpart.text}
                                  >
                                    {counterpart.text}
                                  </span>
                                </button>
                                <IconButton
                                  label={confirmed ? "撤销意见合并" : "确认意见合并"}
                                  size="icon-sm"
                                  disabled={
                                    createCommentLinkMutation.isPending ||
                                    unlinkCommentMutation.isPending
                                  }
                                  onClick={() =>
                                    confirmed
                                      ? unlinkCommentMutation.mutate(confirmed.link)
                                      : suggested &&
                                        createCommentLinkMutation.mutate({
                                          commentId: comment.id,
                                          counterpartCommentId: suggested.counterpart.id,
                                        })
                                  }
                                  className="shrink-0"
                                >
                                  {confirmed ? <Unlink2 /> : <Check />}
                                </IconButton>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                          {repliesFor(comment).map((reply) => (
                            <button
                              key={reply.id}
                              type="button"
                              onClick={() => {
                                setActiveComment(reply.id)
                                seekTo(timecodeToSeconds(reply.timecode))
                              }}
                              className={cn(
                                "mb-1 ml-11 mr-1 block w-[calc(100%-3rem)] border-l border-border px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                                activeComment === reply.id && "bg-primary/7",
                              )}
                            >
                              <span className="flex items-center gap-2 text-xs">
                                <span className="font-semibold">{reply.author}</span>
                                <span className="font-mono text-primary">
                                  {reply.timecode}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                                {reply.text}
                              </span>
                            </button>
                          ))}
                        </div>
                        <IconButton
                          label="回复审片意见"
                          size="icon-sm"
                          onClick={() => {
                            setReplyingTo(comment)
                            setDraft("")
                          }}
                          className="mt-1 shrink-0"
                        >
                          <Reply />
                        </IconButton>
                        <IconButton
                          label={comment.state === "open" ? "标记为已解决" : "重新打开"}
                          size="icon-sm"
                          disabled={updateCommentMutation.isPending}
                          onClick={() =>
                            updateCommentMutation.mutate({
                              comment,
                              state: comment.state === "open" ? "resolved" : "open",
                            })
                          }
                          className="mt-1 shrink-0"
                        >
                          {comment.state === "open" ? <Check /> : <RotateCcw />}
                        </IconButton>
                      </div>
                    )
                  })}
                  {commentsQuery.isLoading ||
                  (mergedView && compareCommentsQuery.isLoading) ? (
                    <EmptyState
                      icon={<MessageSquare className="size-5" />}
                      title="正在载入审片意见"
                    />
                  ) : null}
                  {commentsQuery.isError ? (
                    <EmptyState
                      icon={<MessageSquare className="size-5" />}
                      title={commentsQuery.error.message}
                    />
                  ) : null}
                  {!commentsQuery.isLoading &&
                  !(mergedView && compareCommentsQuery.isLoading) &&
                  !commentsQuery.isError &&
                  !visibleComments.length ? (
                    <EmptyState
                      icon={<MessageSquare className="size-5" />}
                      title="当前筛选下没有意见"
                      action={
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCommentFilter("all")}
                        >
                          查看全部意见
                        </Button>
                      }
                    />
                  ) : null}
                </div>
              </ScrollArea>

              <div className="shrink-0 border-t border-border bg-background p-3">
                {replyingTo ? (
                  <div className="mb-2 flex min-w-0 items-start gap-2 border-l-2 border-primary bg-primary/5 px-2 py-1.5">
                    <Reply className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">回复 {replyingTo.author}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {replyingTo.text}
                      </p>
                    </div>
                    <IconButton
                      label="取消回复"
                      size="icon-sm"
                      onClick={() => setReplyingTo(null)}
                    >
                      <X />
                    </IconButton>
                  </div>
                ) : null}
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="bg-primary/8 px-1.5 py-0.5 font-mono text-primary">
                    {replyingTo?.timecode ?? formatTime(time)}
                  </span>
                  <span>
                    {replyingTo ? "回复当前意见" : "批注将绑定当前版本与时间码"}
                  </span>
                </div>
                <Textarea
                  aria-label={replyingTo ? "回复审片意见" : "添加审片意见"}
                  placeholder={
                    replyingTo
                      ? `回复 ${replyingTo.author}`
                      : "添加审片意见，使用 @ 提及成员"
                  }
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-20 resize-none rounded-none"
                />
                {createCommentMutation.isError ? (
                  <p className="mt-2 text-xs text-destructive">
                    {createCommentMutation.error.message}
                  </p>
                ) : null}
                {updateCommentMutation.isError ? (
                  <p className="mt-2 text-xs text-destructive">
                    {updateCommentMutation.error.message}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 rounded-none text-muted-foreground"
                  >
                    <PenTool />
                    附加画面标注
                  </Button>
                  <Button
                    size="sm"
                    className="ml-auto min-h-11 rounded-none"
                    disabled={!draft.trim() || createCommentMutation.isPending}
                    onClick={() =>
                      createCommentMutation.mutate({
                        text: draft.trim(),
                        parent: replyingTo,
                      })
                    }
                  >
                    <Send data-icon="inline-start" />
                    {createCommentMutation.isPending
                      ? "正在提交"
                      : replyingTo
                        ? "发送回复"
                        : "提交意见"}
                  </Button>
                </div>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

export function ReviewStudio({ project }: { project: WorkspaceScopedProject }) {
  const [selectedFile, setSelectedFile] = useState<ReviewFile | null>(null)
  const [folderId, setFolderId] = useState<string | null>(null)

  const openFile = (file: ReviewFile) => {
    if (file.type === "video") {
      setSelectedFile(file)
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {selectedFile ? (
        <ReviewWorkspace
          key={selectedFile.id}
          project={project}
          file={selectedFile}
          onBack={() => setSelectedFile(null)}
          onFileUpdated={setSelectedFile}
        />
      ) : (
        <FileExplorer
          project={project}
          folderId={folderId}
          onFolderChange={setFolderId}
          onOpen={openFile}
        />
      )}
    </AnimatePresence>
  )
}
