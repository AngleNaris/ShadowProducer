"use client"

import type {
  AssetFolder,
  AssetSemanticSearchMatch,
  MediaAnalysisJob,
  MediaAnalysisResponse,
  SupplierContactRef,
  TeamAsset,
  TeamContact,
  TeamContactImportItem,
  TeamSupplier,
  TeamSupplierImportItem,
  UpdateTeamAssetBody,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  Camera,
  Check,
  ContactRound,
  Copy,
  Download,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Grid2X2,
  ImageIcon,
  Info,
  LayoutList,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  Truck,
  Upload,
} from "lucide-react"
import Image from "next/image"
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { IconButton } from "@/components/workspace/icon-button"
import {
  DataTableViewport,
  EmptyState,
  PageFrame,
  WorkspaceHeader,
} from "@/components/workspace/page-elements"
import { RelationPicker } from "@/components/workspace/relation-picker"
import type { WorkspaceTeam } from "@/components/workspace/workspace-data"
import {
  ApiError,
  assetApi,
  contactApi,
  supplierApi,
  workspaceApi,
} from "@/lib/api-client"
import {
  ContactCsvError,
  exportTeamContactsCsv,
  parseTeamContactCsv,
} from "@/lib/contact-csv"
import {
  exportTeamSuppliersCsv,
  parseTeamSupplierCsv,
  SupplierCsvError,
} from "@/lib/supplier-csv"
import { cn } from "@/lib/utils"

type SharedContact = {
  id: string
  name: string
  role: string
  owner: string
  source: "团队联系人" | "成员共享"
  phone: string
  projects: string[]
  masked?: boolean
  editable: boolean
  revision: number
  raw: TeamContact
}

type ContactImportDialog = {
  fileName: string
  items: TeamContactImportItem[]
  idempotencyKey: string
  error?: string
  imported?: number
}

type SupplierDraft = Omit<TeamSupplier, "id" | "teamId" | "revision" | "updatedAt">

type SupplierImportDialog = {
  fileName: string
  items: TeamSupplierImportItem[]
  idempotencyKey: string
  error?: string
  imported?: number
}

const emptySupplierDraft = (): SupplierDraft => ({
  name: "",
  category: "",
  services: "",
  phone: "",
  email: "",
  address: "",
  contactRefs: [],
  projectIds: [],
})

function SupplierFieldsEditor({
  value,
  contacts,
  projects,
  onChange,
}: {
  value: SupplierDraft
  contacts: TeamContact[]
  projects: { id: string; name: string }[]
  onChange: (value: SupplierDraft) => void
}) {
  const selectedContactIds = value.contactRefs.map(
    (reference) => `${reference.source}:${reference.contactId}`,
  )

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        aria-label="供应商名称"
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        placeholder="供应商名称"
      />
      <Input
        aria-label="供应商类别"
        value={value.category}
        onChange={(event) => onChange({ ...value, category: event.target.value })}
        placeholder="类别，如场地、设备、雨效"
      />
      <Textarea
        aria-label="供应商服务范围"
        value={value.services}
        onChange={(event) => onChange({ ...value, services: event.target.value })}
        placeholder="服务范围"
        className="min-h-20 sm:col-span-2"
      />
      <Input
        aria-label="供应商电话"
        value={value.phone}
        onChange={(event) => onChange({ ...value, phone: event.target.value })}
        placeholder="电话"
      />
      <Input
        aria-label="供应商邮箱"
        value={value.email}
        onChange={(event) => onChange({ ...value, email: event.target.value })}
        placeholder="邮箱"
      />
      <Input
        aria-label="供应商地址"
        value={value.address}
        onChange={(event) => onChange({ ...value, address: event.target.value })}
        placeholder="地址"
        className="sm:col-span-2"
      />
      <RelationPicker
        label="关联联系人"
        options={contacts.map((contact) => ({
          id: `${contact.source}:${contact.id}`,
          label: contact.name ?? "未共享姓名",
          detail: contact.role ?? contact.ownerName,
        }))}
        selectedIds={selectedContactIds}
        onToggle={(id, checked) => {
          const [source, ...contactIdParts] = id.split(":")
          const reference: SupplierContactRef = {
            source: source as SupplierContactRef["source"],
            contactId: contactIdParts.join(":"),
          }
          onChange({
            ...value,
            contactRefs: checked
              ? [...value.contactRefs, reference]
              : value.contactRefs.filter(
                  (item) =>
                    item.contactId !== reference.contactId ||
                    item.source !== reference.source,
                ),
          })
        }}
      />
      <RelationPicker
        label="关联项目"
        options={projects.map((project) => ({ id: project.id, label: project.name }))}
        selectedIds={value.projectIds}
        onToggle={(id, checked) =>
          onChange({
            ...value,
            projectIds: checked
              ? [...value.projectIds, id]
              : value.projectIds.filter((projectId) => projectId !== id),
          })
        }
      />
    </div>
  )
}

type AssetKind = "视频" | "图片" | "音频" | "文档"

type AssetItem = {
  id: string
  projectId: string | null
  folderId: string | null
  name: string
  kind: AssetKind
  project: string
  owner: string
  updatedAt: string
  folder: string
  tags: string[]
  rating: 0 | 1 | 2 | 3 | 4 | 5
  size: string
  dimensions?: string
  duration?: string
  durationUs: number | null
  frameRate?: string
  codec?: string
  processing?: string
  note?: string
  favorite?: boolean
  duplicate?: boolean
  preview?: boolean
  previewUrl?: string
  status: TeamAsset["status"]
  analysisReady: boolean
  searchMatches: TeamAsset["searchMatches"]
  semanticScore?: number
  semanticTimeUs?: number | null
  revision: number
}

const defaultTags = ["车站", "夜景", "构图参考", "设备", "雨效", "调色", "环境声", "分镜"]

type ViewMode = "grid" | "list"
type Density = "compact" | "comfortable"
type SortMode = "updated" | "name" | "rating"

const kindIcons = {
  视频: FileVideo,
  图片: FileImage,
  音频: FileAudio,
  文档: FileText,
} satisfies Record<AssetKind, typeof FileImage>

const searchSourceLabels = {
  metadata: "素材信息",
  transcription: "语音转写",
  ocr: "画面文字",
  vision: "画面语义",
} satisfies Record<TeamAsset["searchMatches"][number]["source"], string>

function inferKind(fileName: string): AssetKind {
  const extension = fileName.split(".").pop()?.toLowerCase()
  if (["mp4", "mov", "mxf", "avi"].includes(extension ?? "")) return "视频"
  if (["jpg", "jpeg", "png", "webp", "tif", "tiff"].includes(extension ?? ""))
    return "图片"
  if (["wav", "mp3", "aac", "flac"].includes(extension ?? "")) return "音频"
  return "文档"
}

async function uploadCommandKeys(teamId: string, file: File) {
  const fingerprint = `${teamId}:${file.name}:${file.type}:${file.size}:${file.lastModified}`
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fingerprint),
  )
  const storageKey = `shadowproducer:upload:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`
  const stored = window.localStorage.getItem(storageKey)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as {
        intentKey?: unknown
        completeKey?: unknown
      }
      if (
        typeof parsed.intentKey === "string" &&
        typeof parsed.completeKey === "string"
      ) {
        return {
          storageKey,
          intentKey: parsed.intentKey,
          completeKey: parsed.completeKey,
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }
  const keys = {
    storageKey,
    intentKey: crypto.randomUUID(),
    completeKey: crypto.randomUUID(),
  }
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ intentKey: keys.intentKey, completeKey: keys.completeKey }),
  )
  return keys
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024 * 1024)
    return `${(sizeBytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return `今天 ${date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`
  }
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })
}

function formatDuration(durationUs: number | null) {
  if (durationUs === null) return undefined
  const seconds = Math.round(durationUs / 1_000_000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  return hours
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`
    : `${minutes}:${remaining.toString().padStart(2, "0")}`
}

function formatTimecode(durationUs: number) {
  const totalSeconds = durationUs / 1_000_000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`
}

function parseTimecode(value: string) {
  const parts = value.trim().split(":")
  if (parts.length < 2 || parts.length > 3) return null
  const seconds = Number(parts.pop())
  const minutes = Number(parts.pop())
  const hours = parts.length ? Number(parts[0]) : 0
  if (
    !Number.isFinite(seconds) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(hours) ||
    seconds < 0 ||
    seconds >= 60 ||
    minutes < 0 ||
    (parts.length > 0 && minutes >= 60) ||
    hours < 0
  )
    return null
  const timecodeUs = Math.round((hours * 3600 + minutes * 60 + seconds) * 1_000_000)
  return Number.isSafeInteger(timecodeUs) ? timecodeUs : null
}

const mediaAnalysisStatusText: Record<MediaAnalysisJob["status"], string> = {
  queued: "等待分析",
  processing: "分析中",
  awaiting_confirmation: "待确认",
  completed: "已确认",
  failed: "分析失败",
  cancelled: "已取消",
  expired: "源版本已过期",
}

function toAssetItem(
  teamId: string,
  asset: TeamAsset,
  semanticMatch?: AssetSemanticSearchMatch,
): AssetItem {
  const previewUrl = asset.archived
    ? undefined
    : (asset.thumbnailUrl ??
      (asset.kind === "图片" && asset.status === "ready"
        ? assetApi.contentUrl(teamId, asset.id)
        : undefined))
  return {
    id: asset.id,
    projectId: asset.projectId,
    folderId: asset.folderId,
    name: asset.name,
    kind: asset.kind,
    project: asset.projectName ?? "未关联项目",
    owner: asset.ownerName,
    updatedAt: formatUpdatedAt(asset.updatedAt),
    folder: asset.folderName ?? "未归类",
    tags: asset.tags,
    rating: asset.rating as AssetItem["rating"],
    size: formatBytes(asset.sizeBytes),
    dimensions:
      asset.width && asset.height ? `${asset.width} × ${asset.height}` : undefined,
    duration: formatDuration(asset.durationUs),
    durationUs: asset.durationUs,
    frameRate:
      asset.frameRateNumerator && asset.frameRateDenominator
        ? `${(asset.frameRateNumerator / asset.frameRateDenominator).toFixed(3)} fps`
        : undefined,
    codec: [asset.videoCodec, asset.audioCodec].filter(Boolean).join(" / ") || undefined,
    processing:
      asset.mediaStatus === "pending"
        ? "等待处理"
        : asset.mediaStatus === "processing"
          ? "处理中"
          : asset.mediaStatus === "failed"
            ? `处理失败${asset.mediaError ? ` · ${asset.mediaError}` : ""}`
            : asset.mediaStatus === "ready"
              ? "已完成"
              : undefined,
    note: asset.note,
    favorite: asset.favorite,
    preview: Boolean(previewUrl),
    previewUrl,
    status: asset.status,
    analysisReady:
      ["视频", "音频", "图片"].includes(asset.kind) &&
      asset.status === "ready" &&
      asset.mediaStatus === "ready" &&
      Boolean(asset.checksumSha256),
    searchMatches: semanticMatch
      ? [{ source: semanticMatch.source, excerpt: semanticMatch.excerpt }]
      : asset.searchMatches,
    semanticScore: semanticMatch?.score,
    semanticTimeUs: semanticMatch?.timecodeUs,
    revision: asset.revision,
  }
}

function LibraryNavButton({
  active,
  action,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean
  action?: ReactNode
  count?: number
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 w-full items-center gap-2 border-l-2 px-3 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        active
          ? "border-primary bg-primary/7 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground",
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className={cn("[&_svg]:size-3.5", active && "text-primary")}>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {typeof count === "number" ? (
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </button>
      {action}
    </div>
  )
}

function RatingControl({
  value,
  onChange,
  compact = false,
}: {
  value: number
  onChange: (value: 0 | 1 | 2 | 3 | 4 | 5) => void
  compact?: boolean
}) {
  return (
    <fieldset className="flex items-center">
      <legend className="sr-only">评分 {value} 星</legend>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`设为 ${star} 星`}
          onClick={(event) => {
            event.stopPropagation()
            onChange(star as 1 | 2 | 3 | 4 | 5)
          }}
          className={cn(
            "grid place-items-center text-muted-foreground transition-colors hover:text-support focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            compact ? "size-6" : "size-8",
          )}
        >
          <Star
            className={cn(
              compact ? "size-3" : "size-4",
              star <= value && "fill-support text-support",
            )}
          />
        </button>
      ))}
    </fieldset>
  )
}

function AssetPreview({ asset, eager = false }: { asset: AssetItem; eager?: boolean }) {
  const AssetIcon = kindIcons[asset.kind]
  if (asset.preview && asset.previewUrl) {
    return (
      <div className="relative size-full overflow-hidden bg-muted">
        <Image
          src={asset.previewUrl}
          alt={`${asset.name}预览`}
          fill
          sizes="(max-width: 768px) 100vw, 40vw"
          loading={eager ? "eager" : "lazy"}
          unoptimized
          className="object-cover"
        />
        {asset.kind === "视频" ? (
          <span className="absolute right-2 bottom-2 bg-background/90 px-1.5 py-1 text-xs font-medium">
            {asset.duration}
          </span>
        ) : null}
      </div>
    )
  }
  return (
    <div className="grid size-full place-items-center bg-muted/60 text-muted-foreground">
      <div className="flex flex-col items-center gap-2 text-xs">
        <AssetIcon className="size-10 stroke-[1.25]" />
        <span>暂无预览</span>
      </div>
    </div>
  )
}

export function ResourceLibrary({ team }: { team: WorkspaceTeam }) {
  const teamId = team.id
  const projects = team.projects
  const queryClient = useQueryClient()
  const [assetScope, setAssetScope] = useState<"library" | "trash">("library")
  const [tab, setTab] = useState<"assets" | "contacts" | "suppliers">("assets")
  const [activeFilter, setActiveFilter] = useState("all")
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic">("keyword")
  const [query, setQuery] = useState("")
  const assetSearch = useDeferredValue(tab === "assets" ? query.trim() : "")
  const [semanticSearch, setSemanticSearch] = useState("")
  useEffect(() => {
    if (searchMode !== "semantic") {
      setSemanticSearch("")
      return
    }
    const timeout = window.setTimeout(() => setSemanticSearch(query.trim()), 500)
    return () => window.clearTimeout(timeout)
  }, [query, searchMode])
  const semanticProjectId = activeFilter.startsWith("project:")
    ? projects.find((project) => project.name === activeFilter.slice(8))?.id
    : undefined
  const semanticSearchActive =
    tab === "assets" &&
    assetScope === "library" &&
    searchMode === "semantic" &&
    Boolean(semanticSearch)
  const assetsQuery = useQuery({
    queryKey: [
      "team-assets",
      teamId,
      assetScope,
      searchMode === "keyword" ? assetSearch : "",
    ],
    queryFn: () =>
      assetApi.list(
        teamId,
        assetScope === "trash",
        searchMode === "keyword" ? assetSearch : "",
      ),
    refetchInterval: (query) =>
      assetScope === "library" &&
      query.state.data?.items.some((asset) =>
        ["pending", "processing"].includes(asset.mediaStatus ?? ""),
      )
        ? 1_000
        : false,
  })
  const semanticAssetsQuery = useQuery({
    queryKey: ["team-assets-semantic", teamId, semanticProjectId, semanticSearch],
    queryFn: () =>
      assetApi.semanticSearch(teamId, {
        query: semanticSearch,
        projectId: semanticProjectId,
        limit: 100,
      }),
    enabled: semanticSearchActive,
    retry: false,
  })
  const assetResultsLoading = semanticSearchActive
    ? semanticAssetsQuery.isLoading
    : assetsQuery.isLoading
  const assetResultsError = semanticSearchActive
    ? semanticAssetsQuery.error
    : assetsQuery.error
  const refetchAssetResults = semanticSearchActive
    ? semanticAssetsQuery.refetch
    : assetsQuery.refetch
  const teamContactsQuery = useQuery({
    queryKey: ["team-contacts", teamId],
    queryFn: () => contactApi.listTeam(teamId),
  })
  const suppliersQuery = useQuery({
    queryKey: ["team-suppliers", teamId],
    queryFn: () => supplierApi.listTeam(teamId),
  })
  const permissionsQuery = useQuery({
    queryKey: ["team-permissions", teamId],
    queryFn: () => workspaceApi.getPermissions(teamId),
  })
  const canWriteAssets = useMemo(() => {
    const workspace = permissionsQuery.data
    if (!workspace) return false
    const member = workspace.members.find(
      (item) => item.accountId === workspace.currentAccountId,
    )
    if (!member) return false
    const template = workspace.templates.find(
      (item) => item.id === member.permissionTemplateId,
    )
    return template
      ? template.permissions.includes("asset.write")
      : member.role !== "viewer"
  }, [permissionsQuery.data])
  const teamContacts: SharedContact[] = (teamContactsQuery.data?.items ?? []).map(
    (contact) => ({
      id: contact.id,
      name: contact.name ?? "未共享姓名",
      role: contact.role ?? "字段未共享",
      owner: contact.ownerName,
      source: contact.source === "team" ? "团队联系人" : "成员共享",
      phone: contact.phone ?? "字段未共享",
      projects: contact.projectIds.map(
        (projectId) =>
          projects.find((project) => project.id === projectId)?.name ?? projectId,
      ),
      masked: contact.phone === null,
      editable: contact.editable,
      revision: contact.revision,
      raw: contact,
    }),
  )
  const assets = useMemo(
    () =>
      semanticSearchActive
        ? (semanticAssetsQuery.data?.items ?? []).map((match) =>
            toAssetItem(teamId, match.item, match),
          )
        : (assetsQuery.data?.items ?? []).map((asset) => toAssetItem(teamId, asset)),
    [
      assetsQuery.data?.items,
      semanticAssetsQuery.data?.items,
      semanticSearchActive,
      teamId,
    ],
  )
  const assetFolders = useMemo(
    () => (semanticSearchActive ? [] : (assetsQuery.data?.folders ?? [])),
    [assetsQuery.data?.folders, semanticSearchActive],
  )
  const folders = useMemo(() => assetFolders.map((folder) => folder.name), [assetFolders])
  const [kindFilters, setKindFilters] = useState<AssetKind[]>([])
  const [sort, setSort] = useState<SortMode>("updated")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [density, setDensity] = useState<Density>("comfortable")
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null)
  const [previewTimeUs, setPreviewTimeUs] = useState(0)
  const [captureTimecode, setCaptureTimecode] = useState("00:00.000")
  const [captureError, setCaptureError] = useState("")
  const [createContactOpen, setCreateContactOpen] = useState(false)
  const [contactImportDialog, setContactImportDialog] =
    useState<ContactImportDialog | null>(null)
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false)
  const [supplierImportDialog, setSupplierImportDialog] =
    useState<SupplierImportDialog | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<TeamSupplier | null>(null)
  const [confirmDeleteSupplier, setConfirmDeleteSupplier] = useState(false)
  const [draftSupplier, setDraftSupplier] = useState<SupplierDraft>(emptySupplierDraft)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [folderToArchive, setFolderToArchive] = useState<AssetFolder | null>(null)
  const [newFolderName, setNewFolderName] = useState("")
  const [selectedContact, setSelectedContact] = useState<SharedContact | null>(null)
  const [confirmDeleteContact, setConfirmDeleteContact] = useState(false)
  const [draftContact, setDraftContact] = useState({
    name: "",
    role: "",
    company: "",
    phone: "",
    email: "",
  })
  const [statusMessage, setStatusMessage] = useState("")
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [uploadingCount, setUploadingCount] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const contactFileInput = useRef<HTMLInputElement>(null)
  const supplierFileInput = useRef<HTMLInputElement>(null)

  const allTags = useMemo(
    () => [...new Set([...defaultTags, ...assets.flatMap((asset) => asset.tags)])],
    [assets],
  )

  const visibleAssets = useMemo(() => {
    const filtered = assets.filter((asset) => {
      if (kindFilters.length && !kindFilters.includes(asset.kind)) return false
      if (activeFilter === "favorite" && !asset.favorite) return false
      if (activeFilter === "recent" && !asset.updatedAt.includes("今天")) return false
      if (activeFilter === "untagged" && asset.tags.length) return false
      if (activeFilter === "duplicates" && !asset.duplicate) return false
      if (activeFilter.startsWith("folder:") && asset.folder !== activeFilter.slice(7))
        return false
      if (activeFilter.startsWith("project:") && asset.project !== activeFilter.slice(8))
        return false
      if (activeFilter.startsWith("tag:") && !asset.tags.includes(activeFilter.slice(4)))
        return false
      return true
    })
    return [...filtered].sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name, "zh-CN")
      if (sort === "rating") return right.rating - left.rating
      return assets.indexOf(left) - assets.indexOf(right)
    })
  }, [activeFilter, assets, kindFilters, sort])

  const contacts = teamContacts.filter((contact) =>
    `${contact.name}${contact.role}${contact.owner}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const suppliers = (suppliersQuery.data?.items ?? []).filter((supplier) =>
    `${supplier.name}${supplier.category}${supplier.services}${supplier.phone}${supplier.email}${supplier.address}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const activeAsset = assets.find((asset) => asset.id === activeAssetId) ?? null
  const previewAsset = assets.find((asset) => asset.id === previewAssetId) ?? null
  const mediaAnalysisQuery = useQuery({
    queryKey: ["media-analysis", teamId, activeAsset?.id],
    queryFn: () => assetApi.getMediaAnalysis(teamId, activeAsset?.id ?? ""),
    enabled:
      Boolean(activeAsset) &&
      ["视频", "音频", "图片"].includes(activeAsset?.kind ?? "") &&
      activeAsset?.status === "ready",
    refetchInterval: (query) => {
      const jobs = [
        query.state.data?.job,
        query.state.data?.transcription,
        query.state.data?.ocr,
        ...(query.state.data?.frameCaptures ?? []),
      ]
      return jobs.some((job) => ["queued", "processing"].includes(job?.status ?? ""))
        ? 1_000
        : false
    },
  })
  const mediaAnalysis = mediaAnalysisQuery.data?.job ?? null
  const frameCaptures = mediaAnalysisQuery.data?.frameCaptures ?? []
  const transcription = mediaAnalysisQuery.data?.transcription ?? null
  const ocr = mediaAnalysisQuery.data?.ocr ?? null
  const textAnalysis = activeAsset?.kind === "图片" ? ocr : transcription
  const activeFrameCapture = frameCaptures.find((job) =>
    ["queued", "processing"].includes(job.status),
  )

  const putMediaAnalysisJob = (job: MediaAnalysisJob) => {
    queryClient.setQueryData<MediaAnalysisResponse>(
      ["media-analysis", teamId, job.assetId],
      (current) => {
        const response = current ?? {
          job: null,
          frameCaptures: [],
          transcription: null,
          ocr: null,
        }
        if (job.kind === "shot_detection") return { ...response, job }
        if (job.kind === "transcription") return { ...response, transcription: job }
        if (job.kind === "ocr") return { ...response, ocr: job }
        return {
          ...response,
          frameCaptures: [
            job,
            ...response.frameCaptures.filter((item) => item.id !== job.id),
          ],
        }
      },
    )
  }

  const createContactMutation = useMutation({
    mutationFn: () =>
      contactApi.createTeam(teamId, {
        ...draftContact,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-contacts", teamId] })
      setDraftContact({ name: "", role: "", company: "", phone: "", email: "" })
      setCreateContactOpen(false)
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "团队联系人创建失败，请稍后重试",
      ),
  })
  const importContactsMutation = useMutation({
    mutationFn: ({ items, idempotencyKey }: ContactImportDialog) =>
      contactApi.importTeam(teamId, { items, idempotencyKey }),
    onSuccess: async ({ items }) => {
      await queryClient.invalidateQueries({ queryKey: ["team-contacts", teamId] })
      setContactImportDialog((current) =>
        current ? { ...current, imported: items.length } : current,
      )
    },
    onError: (error) =>
      setContactImportDialog((current) =>
        current
          ? {
              ...current,
              error:
                error instanceof ApiError
                  ? error.message
                  : "团队联系人导入失败，请稍后重试",
            }
          : current,
      ),
  })
  const updateContactMutation = useMutation({
    mutationFn: () => {
      if (!selectedContact?.editable) throw new Error("Contact is read only")
      return contactApi.updateTeam(teamId, selectedContact.id, {
        ...draftContact,
        expectedRevision: selectedContact.revision,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-contacts", teamId] })
      setSelectedContact(null)
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "团队联系人更新失败，请稍后重试",
      ),
  })
  const deleteContactMutation = useMutation({
    mutationFn: () => {
      if (!selectedContact?.editable) throw new Error("Contact is read only")
      return contactApi.deleteTeam(teamId, selectedContact.id, selectedContact.revision)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-contacts", teamId] })
      setConfirmDeleteContact(false)
      setSelectedContact(null)
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "团队联系人删除失败，请稍后重试",
      ),
  })

  const createSupplierMutation = useMutation({
    mutationFn: () =>
      supplierApi.createTeam(teamId, {
        ...draftSupplier,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-suppliers", teamId] })
      setDraftSupplier(emptySupplierDraft())
      setCreateSupplierOpen(false)
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "供应商创建失败，请稍后重试",
      ),
  })
  const importSuppliersMutation = useMutation({
    mutationFn: ({ items, idempotencyKey }: SupplierImportDialog) =>
      supplierApi.importTeam(teamId, { items, idempotencyKey }),
    onSuccess: async ({ items }) => {
      await queryClient.invalidateQueries({ queryKey: ["team-suppliers", teamId] })
      setSupplierImportDialog((current) =>
        current ? { ...current, imported: items.length } : current,
      )
    },
    onError: (error) =>
      setSupplierImportDialog((current) =>
        current
          ? {
              ...current,
              error:
                error instanceof ApiError ? error.message : "供应商导入失败，请稍后重试",
            }
          : current,
      ),
  })
  const updateSupplierMutation = useMutation({
    mutationFn: () => {
      if (!selectedSupplier) throw new Error("No supplier selected")
      return supplierApi.updateTeam(teamId, selectedSupplier.id, {
        ...draftSupplier,
        expectedRevision: selectedSupplier.revision,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-suppliers", teamId] })
      setSelectedSupplier(null)
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "供应商更新失败，请稍后重试",
      ),
  })
  const deleteSupplierMutation = useMutation({
    mutationFn: () => {
      if (!selectedSupplier) throw new Error("No supplier selected")
      return supplierApi.deleteTeam(
        teamId,
        selectedSupplier.id,
        selectedSupplier.revision,
      )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-suppliers", teamId] })
      setConfirmDeleteSupplier(false)
      setSelectedSupplier(null)
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "供应商删除失败，请稍后重试",
      ),
  })

  const updateAssetMutation = useMutation({
    mutationFn: ({ assetId, body }: { assetId: string; body: UpdateTeamAssetBody }) =>
      assetApi.update(teamId, assetId, body),
    onSuccess: async (item, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["team-assets", teamId] })
      if (variables.body.archived !== undefined) {
        setSelectedIds((current) => current.filter((id) => id !== item.id))
        setActiveAssetId((current) => (current === item.id ? null : current))
      }
      if (variables.body.note !== undefined) {
        setNoteDrafts((current) => {
          const next = { ...current }
          delete next[item.id]
          return next
        })
      }
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "素材更新失败，请重新载入后再试",
      ),
  })

  const createMediaAnalysisMutation = useMutation({
    mutationFn: (assetId: string) =>
      assetApi.createMediaAnalysis(teamId, assetId, {
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ job }) => {
      putMediaAnalysisJob(job)
      setStatusMessage("镜头分析任务已创建")
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "镜头分析任务创建失败",
      ),
  })

  const createTextAnalysisMutation = useMutation({
    mutationFn: ({ assetId, kind }: { assetId: string; kind: "transcription" | "ocr" }) =>
      assetApi.createMediaAnalysis(teamId, assetId, {
        idempotencyKey: crypto.randomUUID(),
        kind,
      }),
    onSuccess: ({ job }) => {
      putMediaAnalysisJob(job)
      setStatusMessage(job.kind === "ocr" ? "OCR 识别任务已创建" : "语音转写任务已创建")
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "内容识别任务创建失败",
      ),
  })

  const retryMediaAnalysisMutation = useMutation({
    mutationFn: (job: MediaAnalysisJob) =>
      assetApi.retryMediaAnalysis(teamId, job.assetId, job.id, {
        expectedRevision: job.revision,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ job }) => {
      putMediaAnalysisJob(job)
      void queryClient.invalidateQueries({ queryKey: ["team-assets", teamId] })
      setStatusMessage(
        job.kind === "frame_capture"
          ? "截帧已重新排队"
          : job.kind === "transcription"
            ? "语音转写已重新排队"
            : job.kind === "ocr"
              ? "OCR 识别已重新排队"
              : "镜头分析已重新排队",
      )
    },
    onError: (error) =>
      setStatusMessage(error instanceof ApiError ? error.message : "镜头分析重试失败"),
  })

  const confirmMediaAnalysisMutation = useMutation({
    mutationFn: (job: MediaAnalysisJob) =>
      assetApi.confirmMediaAnalysis(teamId, job.assetId, job.id, {
        expectedRevision: job.revision,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ job }) => {
      putMediaAnalysisJob(job)
      void queryClient.invalidateQueries({ queryKey: ["team-assets", teamId] })
      setStatusMessage(
        job.kind === "transcription"
          ? "语音转写结果已确认"
          : job.kind === "ocr"
            ? "OCR 识别结果已确认"
            : "镜头分析结果已确认",
      )
    },
    onError: (error) =>
      setStatusMessage(error instanceof ApiError ? error.message : "镜头分析确认失败"),
  })

  const createFrameCaptureMutation = useMutation({
    mutationFn: ({ assetId, timecodeUs }: { assetId: string; timecodeUs: number }) =>
      assetApi.createMediaAnalysis(teamId, assetId, {
        idempotencyKey: crypto.randomUUID(),
        timecodeUs,
      }),
    onSuccess: ({ job }) => {
      putMediaAnalysisJob(job)
      setCaptureError("")
      setStatusMessage(`已提交 ${formatTimecode(job.requestedTimecodeUs ?? 0)} 截帧`)
    },
    onError: (error) =>
      setCaptureError(error instanceof ApiError ? error.message : "截帧任务创建失败"),
  })

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      assetApi.createFolder(teamId, {
        name,
        parentId: null,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async ({ item }) => {
      await queryClient.invalidateQueries({
        queryKey: ["team-assets", teamId, "library"],
      })
      setActiveFilter(`folder:${item.name}`)
      setNewFolderName("")
      setCreateFolderOpen(false)
      setStatusMessage(`已创建文件夹“${item.name}”`)
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "文件夹创建失败，请稍后重试",
      ),
  })

  const updateFolderMutation = useMutation({
    mutationFn: ({ folder, archived }: { folder: AssetFolder; archived: boolean }) =>
      assetApi.updateFolder(teamId, folder.id, {
        archived,
        expectedRevision: folder.revision,
      }),
    onSuccess: async (folder) => {
      await queryClient.invalidateQueries({ queryKey: ["team-assets", teamId] })
      setActiveFilter("all")
      setFolderToArchive(null)
      setStatusMessage(
        folder.archived
          ? `已将文件夹“${folder.name}”移入回收站`
          : `已恢复文件夹“${folder.name}”`,
      )
    },
    onError: (error) =>
      setStatusMessage(
        error instanceof ApiError ? error.message : "文件夹操作失败，请稍后重试",
      ),
  })

  useEffect(() => {
    if (!assets.length) {
      setActiveAssetId(null)
      return
    }
    if (!activeAssetId || !assets.some((asset) => asset.id === activeAssetId)) {
      setActiveAssetId(assets[0]?.id ?? null)
    }
  }, [activeAssetId, assets])

  useEffect(() => {
    if (!previewAssetId) setPreviewTimeUs(0)
  }, [previewAssetId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the draft when the selected asset changes.
  useEffect(() => {
    setCaptureTimecode("00:00.000")
    setCaptureError("")
  }, [activeAssetId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        event.code !== "Space" ||
        assetScope !== "library" ||
        !activeAssetId ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      )
        return
      event.preventDefault()
      setPreviewAssetId(activeAssetId)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeAssetId, assetScope])

  const updateAsset = (
    assetId: string,
    patch: Partial<
      Pick<AssetItem, "favorite" | "rating" | "tags" | "note" | "folderId" | "projectId">
    > & { archived?: boolean },
  ) => {
    const asset = assets.find((item) => item.id === assetId)
    if (!asset || updateAssetMutation.isPending) return
    const body: UpdateTeamAssetBody = { expectedRevision: asset.revision }
    if (patch.favorite !== undefined) body.favorite = patch.favorite
    if (patch.rating !== undefined) body.rating = patch.rating
    if (patch.tags !== undefined) body.tags = patch.tags
    if (patch.note !== undefined) body.note = patch.note
    if (patch.folderId !== undefined) body.folderId = patch.folderId
    if (patch.projectId !== undefined) body.projectId = patch.projectId
    if (patch.archived !== undefined) body.archived = patch.archived
    setStatusMessage("")
    updateAssetMutation.mutate({ assetId, body })
  }

  const selectLibraryFilter = (filter: string) => {
    if (assetScope === "trash") {
      setSelectedIds([])
      setActiveAssetId(null)
      setStatusMessage("")
    }
    setAssetScope("library")
    setActiveFilter(filter)
  }

  const openTrash = () => {
    setAssetScope("trash")
    setSearchMode("keyword")
    setActiveFilter("all")
    setSelectedIds([])
    setActiveAssetId(null)
    setPreviewAssetId(null)
    setStatusMessage("")
  }

  const captureFrame = () => {
    if (!activeAsset) return
    const timecodeUs = parseTimecode(captureTimecode)
    if (
      timecodeUs === null ||
      activeAsset.durationUs === null ||
      timecodeUs >= activeAsset.durationUs
    ) {
      setCaptureError("请输入视频时长内的时间码")
      return
    }
    setCaptureError("")
    createFrameCaptureMutation.mutate({ assetId: activeAsset.id, timecodeUs })
  }

  const toggleSelection = (assetId: string) => {
    setSelectedIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    )
    setActiveAssetId(assetId)
  }

  const selectAsset = (assetId: string, additive: boolean) => {
    setActiveAssetId(assetId)
    if (additive) toggleSelection(assetId)
    else setSelectedIds([assetId])
  }

  const moveAssets = (assetIds: string[], folder: string) => {
    const folderId = assetsQuery.data?.folders.find((item) => item.name === folder)?.id
    if (!folderId) return
    const targets = assets.filter((asset) => assetIds.includes(asset.id))
    void Promise.all(
      targets.map((asset) =>
        updateAssetMutation.mutateAsync({
          assetId: asset.id,
          body: { folderId, expectedRevision: asset.revision },
        }),
      ),
    )
      .then(() => setStatusMessage(`已移动 ${targets.length} 项到“${folder}”`))
      .catch(() => undefined)
  }

  const archiveAssets = (assetIds: string[]) => {
    const targets = assets.filter((asset) => assetIds.includes(asset.id))
    void Promise.all(
      targets.map((asset) =>
        updateAssetMutation.mutateAsync({
          assetId: asset.id,
          body: { archived: true, expectedRevision: asset.revision },
        }),
      ),
    )
      .then(() => setStatusMessage(`已归档 ${targets.length} 项素材`))
      .catch(() => undefined)
  }

  const restoreAssets = (assetIds: string[]) => {
    const targets = assets.filter((asset) => assetIds.includes(asset.id))
    void Promise.all(
      targets.map((asset) =>
        updateAssetMutation.mutateAsync({
          assetId: asset.id,
          body: { archived: false, expectedRevision: asset.revision },
        }),
      ),
    )
      .then(() => setStatusMessage(`已恢复 ${targets.length} 项素材`))
      .catch(() => undefined)
  }

  const importFiles = async (files: File[]) => {
    if (!files.length) return
    setUploadingCount(files.length)
    setStatusMessage(`正在导入 ${files.length} 项素材`)
    let completed = 0
    let failed = 0
    const inboxId = assetsQuery.data?.folders.find(
      (folder) => folder.name === "收件箱",
    )?.id
    for (const file of files) {
      try {
        const keys = await uploadCommandKeys(teamId, file)
        const request = {
          name: file.name,
          kind: inferKind(file.name),
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          projectId: projects[0]?.id ?? null,
          folderId: inboxId ?? null,
          idempotencyKey: keys.intentKey,
        }
        let intent = await assetApi.createUploadIntent(teamId, request)
        if (intent.upload) {
          try {
            await assetApi.uploadFile(intent.upload, file, (percent) =>
              setStatusMessage(`正在导入“${file.name}” · ${percent}%`),
            )
          } catch {
            intent = await assetApi.createUploadIntent(teamId, request)
            if (intent.upload) {
              await assetApi.uploadFile(intent.upload, file, (percent) =>
                setStatusMessage(`正在续传“${file.name}” · ${percent}%`),
              )
            }
          }
        }
        if (intent.item.status === "uploading") {
          await assetApi.completeUpload(teamId, intent.item.id, {
            expectedRevision: intent.item.revision,
            idempotencyKey: keys.completeKey,
          })
        }
        window.localStorage.removeItem(keys.storageKey)
        completed += 1
      } catch (error) {
        failed += 1
        setStatusMessage(
          error instanceof ApiError ? error.message : `“${file.name}”导入失败`,
        )
      } finally {
        setUploadingCount((current) => Math.max(0, current - 1))
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["team-assets", teamId] })
    if (!failed) setStatusMessage(`已导入 ${completed} 项到“收件箱”`)
    else if (completed) setStatusMessage(`已导入 ${completed} 项，${failed} 项失败`)
  }

  const loadContactCsv = async (file: File) => {
    importContactsMutation.reset()
    try {
      setContactImportDialog({
        fileName: file.name,
        items: parseTeamContactCsv(await file.text()),
        idempotencyKey: crypto.randomUUID(),
      })
    } catch (error) {
      setContactImportDialog({
        fileName: file.name,
        items: [],
        idempotencyKey: crypto.randomUUID(),
        error: error instanceof ContactCsvError ? error.message : "无法读取联系人 CSV",
      })
    }
  }

  const exportContacts = () => {
    const csv = exportTeamContactsCsv(teamContactsQuery.data?.items ?? [])
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${team.name.replace(/[\\/:*?"<>|]/g, "-")}-团队联系人.csv`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const loadSupplierCsv = async (file: File) => {
    importSuppliersMutation.reset()
    try {
      setSupplierImportDialog({
        fileName: file.name,
        items: parseTeamSupplierCsv(await file.text()),
        idempotencyKey: crypto.randomUUID(),
      })
    } catch (error) {
      setSupplierImportDialog({
        fileName: file.name,
        items: [],
        idempotencyKey: crypto.randomUUID(),
        error: error instanceof SupplierCsvError ? error.message : "无法读取供应商 CSV",
      })
    }
  }

  const exportSuppliers = () => {
    const csv = exportTeamSuppliersCsv(suppliersQuery.data?.items ?? [])
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${team.name.replace(/[\\/:*?"<>|]/g, "-")}-供应商.csv`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const copyAssetInfo = async (asset: AssetItem) => {
    await navigator.clipboard?.writeText(
      `${asset.name}\n${asset.kind} · ${asset.project}\n${asset.folder} · ${asset.size}`,
    )
    setStatusMessage(`已复制“${asset.name}”的信息`)
  }

  const renderAssetMenu = (asset: AssetItem) => (
    <ContextMenuContent>
      {assetScope === "trash" ? (
        <>
          {canWriteAssets ? (
            <>
              <ContextMenuItem onSelect={() => restoreAssets([asset.id])}>
                <RotateCcw />
                恢复素材
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuItem onSelect={() => void copyAssetInfo(asset)}>
            <Copy />
            复制素材信息
          </ContextMenuItem>
        </>
      ) : (
        <>
          <ContextMenuItem onSelect={() => setPreviewAssetId(asset.id)}>
            <ImageIcon />
            快速预览
          </ContextMenuItem>
          {asset.kind === "视频" ? (
            <ContextMenuItem
              onSelect={() => {
                setActiveAssetId(asset.id)
                setSelectedIds([asset.id])
                setInspectorOpen(true)
              }}
            >
              <ScanSearch />
              镜头分析
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem
            onSelect={() => updateAsset(asset.id, { favorite: !asset.favorite })}
          >
            <Star />
            {asset.favorite ? "取消收藏" : "加入收藏"}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Tag />
              添加标签
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {defaultTags.slice(0, 5).map((tag) => (
                <ContextMenuItem
                  key={tag}
                  disabled={asset.tags.includes(tag)}
                  onSelect={() =>
                    updateAsset(asset.id, { tags: [...new Set([...asset.tags, tag])] })
                  }
                >
                  {tag}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Folder />
              移动到
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {folders.map((folder) => (
                <ContextMenuItem
                  key={folder}
                  disabled={asset.folder === folder}
                  onSelect={() => moveAssets([asset.id], folder)}
                >
                  {folder}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void copyAssetInfo(asset)}>
            <Copy />
            复制素材信息
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => archiveAssets([asset.id])}>
            <Archive />
            归档
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )

  return (
    <PageFrame>
      <WorkspaceHeader
        title="资源库"
        actions={
          tab === "contacts" ? (
            <>
              <input
                ref={contactFileInput}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void loadContactCsv(file)
                  event.target.value = ""
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => contactFileInput.current?.click()}
              >
                <Upload />
                导入
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !(teamContactsQuery.data?.items ?? []).some(
                    (contact) => contact.source === "team",
                  )
                }
                onClick={exportContacts}
              >
                <Download />
                导出
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setStatusMessage("")
                  setDraftContact({
                    name: "",
                    role: "",
                    company: "",
                    phone: "",
                    email: "",
                  })
                  setCreateContactOpen(true)
                }}
              >
                <Plus />
                团队联系人
              </Button>
            </>
          ) : tab === "suppliers" ? (
            <>
              <input
                ref={supplierFileInput}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void loadSupplierCsv(file)
                  event.target.value = ""
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => supplierFileInput.current?.click()}
              >
                <Upload />
                导入
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!suppliersQuery.data?.items.length}
                onClick={exportSuppliers}
              >
                <Download />
                导出
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setStatusMessage("")
                  setDraftSupplier(emptySupplierDraft())
                  setCreateSupplierOpen(true)
                }}
              >
                <Plus />
                供应商
              </Button>
            </>
          ) : assetScope === "trash" ? null : (
            <>
              <input
                ref={fileInput}
                type="file"
                hidden
                multiple
                onChange={(event) => {
                  void importFiles(Array.from(event.target.files ?? []))
                  event.target.value = ""
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateFolderOpen(true)}
              >
                <Plus />
                文件夹
              </Button>
              <Button
                size="sm"
                disabled={uploadingCount > 0 || assetsQuery.isLoading}
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
                {uploadingCount > 0 ? `导入中 ${uploadingCount}` : "导入素材"}
              </Button>
            </>
          )
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as "assets" | "contacts" | "suppliers")
          setSearchMode("keyword")
          setQuery("")
        }}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
          <TabsList variant="line">
            <TabsTrigger value="assets">共享素材</TabsTrigger>
            <TabsTrigger value="contacts">联系人</TabsTrigger>
            <TabsTrigger value="suppliers">供应商</TabsTrigger>
          </TabsList>
          {tab === "assets" && assetScope === "library" ? (
            <fieldset
              aria-label="素材搜索模式"
              className="flex shrink-0 border border-border bg-background"
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={searchMode === "keyword"}
                className={cn(
                  "min-h-9 border-0 px-2.5",
                  searchMode === "keyword" && "bg-muted text-foreground",
                )}
                onClick={() => setSearchMode("keyword")}
              >
                <Search />
                关键词
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={searchMode === "semantic"}
                className={cn(
                  "min-h-9 border-0 border-l border-border px-2.5",
                  searchMode === "semantic" && "bg-muted text-foreground",
                )}
                onClick={() => setSearchMode("semantic")}
              >
                <ScanSearch />
                语义
              </Button>
            </fieldset>
          ) : null}
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            {searchMode === "semantic" && tab === "assets" ? (
              <ScanSearch className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            ) : (
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              aria-label={
                tab === "contacts"
                  ? "搜索团队联系人"
                  : tab === "suppliers"
                    ? "搜索团队供应商"
                    : assetScope === "trash"
                      ? "搜索回收站素材"
                      : searchMode === "semantic"
                        ? "按语义搜索共享素材"
                        : "按关键词搜索共享素材"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                tab === "contacts"
                  ? "搜索联系人"
                  : tab === "suppliers"
                    ? "搜索供应商、类别或服务"
                    : assetScope === "trash"
                      ? "搜索已归档素材"
                      : searchMode === "semantic"
                        ? "描述画面、台词、声音或内容"
                        : "搜索名称、标签、项目、转写或 OCR"
              }
              className="pl-8"
            />
          </div>

          {tab === "assets" ? (
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 lg:hidden"
                onClick={() =>
                  assetScope === "trash" ? selectLibraryFilter("all") : openTrash()
                }
              >
                {assetScope === "trash" ? <FolderOpen /> : <Trash2 />}
                {assetScope === "trash" ? "返回素材" : "回收站"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="筛选素材类型"
                    className={cn(kindFilters.length && "border-primary text-primary")}
                  >
                    <SlidersHorizontal />
                    类型{kindFilters.length ? ` ${kindFilters.length}` : ""}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>素材类型</DropdownMenuLabel>
                  {(["视频", "图片", "音频", "文档"] as AssetKind[]).map((kind) => (
                    <DropdownMenuCheckboxItem
                      key={kind}
                      checked={kindFilters.includes(kind)}
                      onCheckedChange={(checked) =>
                        setKindFilters((current) =>
                          checked
                            ? [...current, kind]
                            : current.filter((item) => item !== kind),
                        )
                      }
                    >
                      {kind}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {kindFilters.length ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setKindFilters([])}>
                        清除类型筛选
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" aria-label="素材排序">
                    <MoreHorizontal />
                    排序
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(value) => setSort(value as SortMode)}
                  >
                    <DropdownMenuRadioItem value="updated">
                      最近更新
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name">名称</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="rating">评分</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="hidden border border-border sm:flex">
                <IconButton
                  label="网格视图"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                  className={cn("size-9", viewMode === "grid" && "bg-muted text-primary")}
                >
                  <Grid2X2 />
                </IconButton>
                <IconButton
                  label="列表视图"
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "size-9 border-l border-border",
                    viewMode === "list" && "bg-muted text-primary",
                  )}
                >
                  <LayoutList />
                </IconButton>
              </div>

              {viewMode === "grid" ? (
                <IconButton
                  label={density === "compact" ? "放大素材卡片" : "缩小素材卡片"}
                  onClick={() =>
                    setDensity((current) =>
                      current === "compact" ? "comfortable" : "compact",
                    )
                  }
                  className="hidden size-9 sm:inline-flex"
                >
                  {density === "compact" ? <Grid2X2 /> : <LayoutList />}
                </IconButton>
              ) : null}

              <IconButton
                label={inspectorOpen ? "隐藏素材信息" : "显示素材信息"}
                aria-pressed={inspectorOpen}
                onClick={() => setInspectorOpen((current) => !current)}
                className="hidden size-9 lg:inline-flex"
              >
                {inspectorOpen ? <PanelRightClose /> : <PanelRightOpen />}
              </IconButton>
            </div>
          ) : null}
        </div>

        <TabsContent value="assets" className="min-h-0 overflow-hidden">
          <div
            className={cn(
              "grid size-full min-h-0 min-w-0",
              inspectorOpen
                ? "lg:grid-cols-[210px_minmax(0,1fr)_280px]"
                : "lg:grid-cols-[210px_minmax(0,1fr)]",
            )}
          >
            <aside className="hidden min-h-0 flex-col border-r border-border bg-muted/15 lg:flex">
              <div data-scroll-owner className="min-h-0 flex-1 overflow-y-auto py-2">
                <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                  资料库
                </div>
                <LibraryNavButton
                  active={assetScope === "library" && activeFilter === "all"}
                  count={assets.length}
                  icon={<FolderOpen />}
                  label="全部素材"
                  onClick={() => selectLibraryFilter("all")}
                />
                <LibraryNavButton
                  active={assetScope === "library" && activeFilter === "favorite"}
                  count={assets.filter((asset) => asset.favorite).length}
                  icon={<Star />}
                  label="收藏"
                  onClick={() => selectLibraryFilter("favorite")}
                />
                <LibraryNavButton
                  active={assetScope === "library" && activeFilter === "recent"}
                  count={
                    assets.filter((asset) => asset.updatedAt.includes("今天")).length
                  }
                  icon={<Check />}
                  label="最近导入"
                  onClick={() => selectLibraryFilter("recent")}
                />
                <LibraryNavButton
                  active={assetScope === "library" && activeFilter === "untagged"}
                  count={assets.filter((asset) => !asset.tags.length).length}
                  icon={<Tag />}
                  label="未标记"
                  onClick={() => selectLibraryFilter("untagged")}
                />

                <div className="mt-4 flex items-center justify-between px-3 pb-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    文件夹
                  </span>
                  {assetScope === "library" ? (
                    <button
                      type="button"
                      aria-label="新建文件夹"
                      onClick={() => setCreateFolderOpen(true)}
                      className="grid size-6 place-items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Plus className="size-3" />
                    </button>
                  ) : (
                    <span className="size-6" aria-hidden="true" />
                  )}
                </div>
                {assetFolders.map((folder) => (
                  <LibraryNavButton
                    key={folder.id}
                    active={activeFilter === `folder:${folder.name}`}
                    count={assets.filter((asset) => asset.folder === folder.name).length}
                    icon={<Folder />}
                    label={folder.name}
                    onClick={() => {
                      if (assetScope === "library") {
                        selectLibraryFilter(`folder:${folder.name}`)
                      } else {
                        setActiveFilter(`folder:${folder.name}`)
                      }
                    }}
                    action={
                      canWriteAssets ? (
                        <button
                          type="button"
                          aria-label={
                            folder.archived
                              ? `恢复文件夹：${folder.name}`
                              : `归档文件夹：${folder.name}`
                          }
                          title={folder.archived ? "恢复文件夹" : "移入回收站"}
                          disabled={updateFolderMutation.isPending}
                          onClick={() => {
                            if (folder.archived) {
                              updateFolderMutation.mutate({ folder, archived: false })
                            } else {
                              setFolderToArchive(folder)
                              setStatusMessage("")
                            }
                          }}
                          className="grid size-7 shrink-0 place-items-center text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                        >
                          {folder.archived ? (
                            <RotateCcw className="size-3.5" />
                          ) : (
                            <Archive className="size-3.5" />
                          )}
                        </button>
                      ) : undefined
                    }
                  />
                ))}

                <div className="mt-4 px-3 pb-1 text-xs font-medium text-muted-foreground">
                  项目
                </div>
                {projects.map((project) => (
                  <LibraryNavButton
                    key={project.id}
                    active={
                      assetScope === "library" &&
                      activeFilter === `project:${project.name}`
                    }
                    count={
                      assets.filter((asset) => asset.project === project.name).length
                    }
                    icon={<FolderOpen />}
                    label={project.name}
                    onClick={() => selectLibraryFilter(`project:${project.name}`)}
                  />
                ))}

                <div className="mt-4 px-3 pb-1 text-xs font-medium text-muted-foreground">
                  标签
                </div>
                {allTags.slice(0, 8).map((tag) => (
                  <LibraryNavButton
                    key={tag}
                    active={assetScope === "library" && activeFilter === `tag:${tag}`}
                    count={assets.filter((asset) => asset.tags.includes(tag)).length}
                    icon={<Tag />}
                    label={tag}
                    onClick={() => selectLibraryFilter(`tag:${tag}`)}
                  />
                ))}

                <div className="mt-4 border-t border-border pt-2">
                  <LibraryNavButton
                    active={assetScope === "library" && activeFilter === "duplicates"}
                    count={assets.filter((asset) => asset.duplicate).length}
                    icon={<Copy />}
                    label="重复项检查"
                    onClick={() => selectLibraryFilter("duplicates")}
                  />
                  <LibraryNavButton
                    active={assetScope === "trash"}
                    icon={<Trash2 />}
                    label="回收站"
                    onClick={openTrash}
                  />
                </div>
              </div>
            </aside>

            <section className="relative flex min-h-0 min-w-0 flex-col">
              <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3">
                <button
                  type="button"
                  className="truncate text-xs font-medium hover:text-primary"
                  onClick={() => selectLibraryFilter("all")}
                >
                  {team.name}
                </button>
                <span className="text-muted-foreground">/</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {assetScope === "trash"
                    ? "回收站"
                    : activeFilter === "all"
                      ? "全部素材"
                      : activeFilter.includes(":")
                        ? activeFilter.split(":")[1]
                        : {
                            favorite: "收藏",
                            recent: "最近导入",
                            untagged: "未标记",
                            duplicates: "重复项检查",
                          }[activeFilter]}
                </span>
                {statusMessage ? (
                  <span
                    aria-live="polite"
                    className="hidden max-w-64 truncate text-xs text-muted-foreground sm:block"
                  >
                    {statusMessage}
                  </span>
                ) : null}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {visibleAssets.length +
                    (activeFilter === "all" ? assetFolders.length : 0)}{" "}
                  项
                </span>
              </div>

              <div
                data-scroll-owner
                className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/8 p-3"
              >
                {!assetResultsLoading &&
                !assetResultsError &&
                activeFilter === "all" &&
                assetFolders.length ? (
                  <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                    {assetFolders.map((folder) => (
                      <div
                        key={folder.id}
                        className="flex min-h-12 min-w-0 items-center border border-border bg-background transition-colors hover:border-foreground/35"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (assetScope === "library") {
                              selectLibraryFilter(`folder:${folder.name}`)
                            } else {
                              setActiveFilter(`folder:${folder.name}`)
                            }
                          }}
                          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                        >
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {folder.name}
                          </span>
                        </button>
                        {canWriteAssets ? (
                          <button
                            type="button"
                            aria-label={
                              folder.archived
                                ? `恢复文件夹：${folder.name}`
                                : `归档文件夹：${folder.name}`
                            }
                            title={folder.archived ? "恢复文件夹" : "移入回收站"}
                            disabled={updateFolderMutation.isPending}
                            onClick={() => {
                              if (folder.archived) {
                                updateFolderMutation.mutate({ folder, archived: false })
                              } else {
                                setFolderToArchive(folder)
                                setStatusMessage("")
                              }
                            }}
                            className="mr-2 grid size-7 shrink-0 place-items-center text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                          >
                            {folder.archived ? (
                              <RotateCcw className="size-3.5" />
                            ) : (
                              <Archive className="size-3.5" />
                            )}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {assetResultsLoading ? (
                  <EmptyState
                    icon={
                      semanticSearchActive ? (
                        <ScanSearch className="size-6" />
                      ) : (
                        <FolderOpen className="size-6" />
                      )
                    }
                    title={
                      semanticSearchActive
                        ? "正在进行语义检索"
                        : assetScope === "trash"
                          ? "正在载入回收站"
                          : "正在载入团队素材"
                    }
                    detail={
                      semanticSearchActive
                        ? "第三方模型 API 正在生成查询向量并检索已确认的媒体内容。"
                        : "正在读取素材元数据。"
                    }
                  />
                ) : assetResultsError ? (
                  <EmptyState
                    icon={<Info className="size-6" />}
                    title={
                      semanticSearchActive
                        ? "语义检索失败"
                        : assetScope === "trash"
                          ? "回收站载入失败"
                          : "团队素材载入失败"
                    }
                    detail={
                      assetResultsError instanceof ApiError
                        ? assetResultsError.message
                        : "无法连接资源服务，请稍后重试。"
                    }
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refetchAssetResults()}
                      >
                        重新载入
                      </Button>
                    }
                  />
                ) : visibleAssets.length ? (
                  viewMode === "grid" ? (
                    <div
                      className={cn(
                        "grid items-start gap-3",
                        density === "compact"
                          ? "grid-cols-[repeat(auto-fill,minmax(148px,1fr))]"
                          : "grid-cols-[repeat(auto-fill,minmax(205px,1fr))]",
                      )}
                    >
                      {visibleAssets.map((asset, index) => {
                        const selected = selectedIds.includes(asset.id)
                        return (
                          <ContextMenu key={asset.id}>
                            <ContextMenuTrigger asChild>
                              <article
                                aria-label={asset.name}
                                data-selected={selected}
                                className={cn(
                                  "group relative min-w-0 border bg-background transition-[border-color,background-color,box-shadow] duration-150",
                                  selected
                                    ? "border-primary shadow-[inset_0_0_0_1px_var(--primary)]"
                                    : "border-border hover:border-foreground/35",
                                )}
                              >
                                <button
                                  type="button"
                                  aria-label={`选择素材：${asset.name}`}
                                  aria-pressed={selected}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    toggleSelection(asset.id)
                                  }}
                                  className={cn(
                                    "absolute top-2 left-2 z-10 grid size-7 place-items-center border bg-background/90 text-transparent opacity-0 transition-[color,background-color,border-color,opacity] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100",
                                    selected
                                      ? "border-primary bg-primary text-primary-foreground opacity-100"
                                      : "border-border group-hover:text-muted-foreground",
                                  )}
                                >
                                  <Check className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) =>
                                    selectAsset(asset.id, event.ctrlKey || event.metaKey)
                                  }
                                  onDoubleClick={() => {
                                    if (assetScope === "library") {
                                      setPreviewTimeUs(asset.semanticTimeUs ?? 0)
                                      setPreviewAssetId(asset.id)
                                    }
                                  }}
                                  className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                                >
                                  <div
                                    className={cn(
                                      "border-b border-border",
                                      density === "compact"
                                        ? "aspect-[4/3]"
                                        : "aspect-[16/10]",
                                    )}
                                  >
                                    <AssetPreview asset={asset} eager={index === 0} />
                                  </div>
                                  <div className="p-2.5">
                                    <div className="flex items-start gap-2">
                                      <strong
                                        className="min-w-0 flex-1 truncate text-xs font-medium"
                                        title={asset.name}
                                      >
                                        {asset.name}
                                      </strong>
                                      {asset.favorite ? (
                                        <Star className="size-3 shrink-0 fill-support text-support" />
                                      ) : null}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                      <span className="truncate">{asset.project}</span>
                                      <span className="shrink-0">{asset.kind}</span>
                                    </div>
                                    {assetSearch && asset.searchMatches[0] ? (
                                      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                        <ScanSearch className="size-3 shrink-0 text-primary" />
                                        <span className="truncate">
                                          {
                                            searchSourceLabels[
                                              asset.searchMatches[0].source
                                            ]
                                          }
                                          {asset.semanticScore === undefined
                                            ? ""
                                            : ` · ${Math.max(0, Math.round(asset.semanticScore * 100))}%`}
                                          {asset.semanticTimeUs === null ||
                                          asset.semanticTimeUs === undefined
                                            ? ""
                                            : ` · ${formatTimecode(asset.semanticTimeUs)}`}
                                          {` · ${asset.searchMatches[0].excerpt}`}
                                        </span>
                                      </div>
                                    ) : null}
                                    {density === "comfortable" ? (
                                      <div className="mt-2 flex min-h-5 flex-wrap gap-1">
                                        {asset.tags.slice(0, 2).map((tag) => (
                                          <span
                                            key={tag}
                                            className="border border-border bg-muted/45 px-1.5 py-0.5 text-xs text-muted-foreground"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </button>
                              </article>
                            </ContextMenuTrigger>
                            {renderAssetMenu(asset)}
                          </ContextMenu>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto border-t border-l border-border bg-background">
                      <div className="grid min-w-[720px] grid-cols-[44px_minmax(240px,1fr)_110px_150px_100px_90px] border-r border-b border-border bg-muted/35 text-xs text-muted-foreground">
                        <span />
                        {["名称", "类型", "项目", "更新", "评分"].map((label) => (
                          <span key={label} className="px-3 py-2">
                            {label}
                          </span>
                        ))}
                      </div>
                      {visibleAssets.map((asset) => {
                        const AssetIcon = kindIcons[asset.kind]
                        const selected = selectedIds.includes(asset.id)
                        return (
                          <ContextMenu key={asset.id}>
                            <ContextMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(event) =>
                                  selectAsset(asset.id, event.ctrlKey || event.metaKey)
                                }
                                onDoubleClick={() => {
                                  if (assetScope === "library") {
                                    setPreviewTimeUs(asset.semanticTimeUs ?? 0)
                                    setPreviewAssetId(asset.id)
                                  }
                                }}
                                className={cn(
                                  "grid min-h-12 w-full min-w-[720px] grid-cols-[44px_minmax(240px,1fr)_110px_150px_100px_90px] items-center border-r border-b border-border text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                                  selected ? "bg-primary/7" : "hover:bg-muted/30",
                                )}
                              >
                                <span className="grid place-items-center">
                                  <span
                                    className={cn(
                                      "grid size-5 place-items-center border",
                                      selected
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border text-transparent",
                                    )}
                                  >
                                    <Check className="size-3" />
                                  </span>
                                </span>
                                <span className="flex min-w-0 items-center gap-2 px-3">
                                  <AssetIcon className="size-4 shrink-0 text-muted-foreground" />
                                  <span className="min-w-0">
                                    <strong className="block truncate font-medium">
                                      {asset.name}
                                    </strong>
                                    {assetSearch && asset.searchMatches[0] ? (
                                      <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                                        <ScanSearch className="size-3 shrink-0 text-primary" />
                                        <span className="truncate">
                                          {
                                            searchSourceLabels[
                                              asset.searchMatches[0].source
                                            ]
                                          }
                                          {asset.semanticScore === undefined
                                            ? ""
                                            : ` · ${Math.max(0, Math.round(asset.semanticScore * 100))}%`}
                                          {asset.semanticTimeUs === null ||
                                          asset.semanticTimeUs === undefined
                                            ? ""
                                            : ` · ${formatTimecode(asset.semanticTimeUs)}`}
                                          {` · ${asset.searchMatches[0].excerpt}`}
                                        </span>
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                                <span className="px-3 text-muted-foreground">
                                  {asset.kind}
                                </span>
                                <span className="truncate px-3">{asset.project}</span>
                                <span className="px-3 text-xs text-muted-foreground">
                                  {asset.updatedAt}
                                </span>
                                <span className="px-3 text-support">
                                  {asset.rating ? `${asset.rating} 星` : "未评分"}
                                </span>
                              </button>
                            </ContextMenuTrigger>
                            {renderAssetMenu(asset)}
                          </ContextMenu>
                        )
                      })}
                    </div>
                  )
                ) : activeFilter === "all" && assetFolders.length ? null : (
                  <EmptyState
                    icon={
                      semanticSearchActive ? (
                        <ScanSearch className="size-6" />
                      ) : (
                        <FolderOpen className="size-6" />
                      )
                    }
                    title={
                      semanticSearchActive
                        ? "没有找到语义相近的素材"
                        : assetScope === "trash"
                          ? "回收站为空"
                          : "当前范围没有素材"
                    }
                    detail={
                      semanticSearchActive
                        ? "可以换一种描述，或切换到关键词搜索。"
                        : assetScope === "trash"
                          ? "暂无已归档素材。"
                          : "可以调整搜索与分类，或将新素材导入收件箱。"
                    }
                    action={
                      assetScope === "library" || query || kindFilters.length ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQuery("")
                            setKindFilters([])
                            setActiveFilter("all")
                          }}
                        >
                          清除筛选
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
              <div className="sr-only" aria-live="polite">
                {statusMessage}
              </div>
            </section>

            {inspectorOpen ? (
              <aside className="hidden min-h-0 min-w-0 flex-col border-l border-border bg-background lg:flex">
                {activeAsset ? (
                  <>
                    <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3">
                      <Info className="size-3.5 text-muted-foreground" />
                      <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">
                        素材信息
                      </h2>
                      <IconButton
                        label="隐藏素材信息"
                        onClick={() => setInspectorOpen(false)}
                        className="size-8"
                      >
                        <PanelRightClose />
                      </IconButton>
                    </div>
                    <div data-scroll-owner className="min-h-0 flex-1 overflow-y-auto">
                      <button
                        type="button"
                        disabled={assetScope === "trash"}
                        onClick={() => setPreviewAssetId(activeAsset.id)}
                        className="block aspect-video w-full border-b border-border outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <AssetPreview asset={activeAsset} eager />
                      </button>
                      <div className="border-b border-border p-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <h2 className="break-words text-sm font-semibold">
                              {activeAsset.name}
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {activeAsset.kind} · {activeAsset.size}
                            </p>
                          </div>
                          {assetScope === "library" ? (
                            <IconButton
                              label={activeAsset.favorite ? "取消收藏" : "加入收藏"}
                              onClick={() =>
                                updateAsset(activeAsset.id, {
                                  favorite: !activeAsset.favorite,
                                })
                              }
                              className={cn(
                                "size-9",
                                activeAsset.favorite && "text-support",
                              )}
                            >
                              <Star
                                className={cn(activeAsset.favorite && "fill-support")}
                              />
                            </IconButton>
                          ) : null}
                        </div>
                        {assetScope === "library" ? (
                          <RatingControl
                            value={activeAsset.rating}
                            onChange={(rating) => updateAsset(activeAsset.id, { rating })}
                          />
                        ) : null}
                      </div>

                      <dl className="divide-y divide-border border-b border-border text-xs">
                        {[
                          ["文件夹", activeAsset.folder],
                          ["关联项目", activeAsset.project],
                          ["所有者", activeAsset.owner],
                          ["更新时间", activeAsset.updatedAt],
                          ["尺寸", activeAsset.dimensions ?? "—"],
                          ["时长", activeAsset.duration ?? "—"],
                          ["帧率", activeAsset.frameRate ?? "—"],
                          ["编码", activeAsset.codec ?? "—"],
                          ["媒体处理", activeAsset.processing ?? "不适用"],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 px-3 py-2.5"
                          >
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="min-w-0 break-words text-right">{value}</dd>
                          </div>
                        ))}
                      </dl>

                      {assetScope === "trash" && canWriteAssets ? (
                        <section className="p-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateAssetMutation.isPending}
                            onClick={() => restoreAssets([activeAsset.id])}
                          >
                            <RotateCcw />
                            恢复素材
                          </Button>
                        </section>
                      ) : (
                        <>
                          {activeAsset.kind === "视频" ? (
                            <section className="border-b border-border p-3">
                              <div className="flex items-center gap-2">
                                <ScanSearch className="size-3.5 text-muted-foreground" />
                                <h3 className="min-w-0 flex-1 text-xs font-semibold">
                                  镜头分析
                                </h3>
                                {mediaAnalysis ? (
                                  <span className="text-xs text-muted-foreground">
                                    {mediaAnalysisStatusText[mediaAnalysis.status]}
                                  </span>
                                ) : null}
                              </div>

                              {mediaAnalysisQuery.isLoading ? (
                                <p className="mt-3 text-xs text-muted-foreground">
                                  正在读取分析状态
                                </p>
                              ) : mediaAnalysisQuery.isError ? (
                                <div className="mt-3 space-y-2">
                                  <p role="alert" className="text-xs text-destructive">
                                    镜头分析状态读取失败
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void mediaAnalysisQuery.refetch()}
                                  >
                                    重新载入
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  {mediaAnalysis ? (
                                    <dl className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                                      <dt className="text-muted-foreground">工具</dt>
                                      <dd className="truncate text-right">
                                        FFmpeg 场景检测
                                      </dd>
                                      {mediaAnalysis.modelName ? (
                                        <>
                                          <dt className="text-muted-foreground">
                                            视觉模型
                                          </dt>
                                          <dd className="truncate text-right">
                                            {mediaAnalysis.provider ?? "第三方 API"} ·{" "}
                                            {mediaAnalysis.modelName}
                                          </dd>
                                        </>
                                      ) : null}
                                      <dt className="text-muted-foreground">源版本</dt>
                                      <dd className="truncate text-right">
                                        r{mediaAnalysis.sourceRevision} ·{" "}
                                        {mediaAnalysis.sourceChecksumSha256.slice(0, 8)}
                                      </dd>
                                    </dl>
                                  ) : null}

                                  {mediaAnalysis?.status === "failed" ? (
                                    <p
                                      role="alert"
                                      className="mt-3 text-xs text-destructive"
                                    >
                                      {mediaAnalysis.failureStage
                                        ? `${mediaAnalysis.failureStage} · `
                                        : ""}
                                      {mediaAnalysis.lastError ?? "分析失败"}
                                    </p>
                                  ) : null}

                                  {mediaAnalysis?.shots.length ? (
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                      {mediaAnalysis.shots.map((shot) => (
                                        <button
                                          key={shot.id}
                                          type="button"
                                          aria-label={`播放镜头 ${shot.sequence}，${formatTimecode(shot.keyframeUs)}`}
                                          onClick={() => {
                                            setPreviewTimeUs(shot.keyframeUs)
                                            setPreviewAssetId(activeAsset.id)
                                          }}
                                          className="group border border-border text-left outline-none hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary"
                                        >
                                          <span className="relative block aspect-video bg-muted">
                                            <Image
                                              src={assetApi.mediaAnalysisKeyframeUrl(
                                                teamId,
                                                activeAsset.id,
                                                mediaAnalysis.id,
                                                shot.id,
                                              )}
                                              alt={`镜头 ${shot.sequence} 关键帧`}
                                              fill
                                              sizes="160px"
                                              unoptimized
                                              className="object-cover"
                                            />
                                          </span>
                                          <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                                            <strong className="font-medium">
                                              镜头 {shot.sequence}
                                            </strong>
                                            <span className="text-muted-foreground tabular-nums">
                                              {formatTimecode(shot.startUs)}
                                            </span>
                                          </span>
                                          {shot.description ? (
                                            <span className="line-clamp-2 min-h-9 border-t border-border px-2 py-1.5 text-xs leading-4 text-muted-foreground">
                                              {shot.description}
                                            </span>
                                          ) : null}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}

                                  <div className="mt-3">
                                    {!mediaAnalysis ||
                                    ["completed", "cancelled", "expired"].includes(
                                      mediaAnalysis.status,
                                    ) ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={
                                          !activeAsset.analysisReady ||
                                          createMediaAnalysisMutation.isPending
                                        }
                                        title={
                                          activeAsset.analysisReady
                                            ? undefined
                                            : "等待基础媒体处理完成"
                                        }
                                        onClick={() =>
                                          createMediaAnalysisMutation.mutate(
                                            activeAsset.id,
                                          )
                                        }
                                      >
                                        <ScanSearch />
                                        {mediaAnalysis ? "重新分析" : "开始分析"}
                                      </Button>
                                    ) : mediaAnalysis.status === "failed" ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={retryMediaAnalysisMutation.isPending}
                                        onClick={() =>
                                          retryMediaAnalysisMutation.mutate(mediaAnalysis)
                                        }
                                      >
                                        重新分析
                                      </Button>
                                    ) : mediaAnalysis.status ===
                                      "awaiting_confirmation" ? (
                                      <Button
                                        size="sm"
                                        disabled={confirmMediaAnalysisMutation.isPending}
                                        onClick={() =>
                                          confirmMediaAnalysisMutation.mutate(
                                            mediaAnalysis,
                                          )
                                        }
                                      >
                                        <Check />
                                        确认结果
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" disabled>
                                        {mediaAnalysis.status === "queued"
                                          ? "等待分析"
                                          : "正在分析"}
                                      </Button>
                                    )}
                                  </div>
                                </>
                              )}
                            </section>
                          ) : null}

                          {["视频", "音频", "图片"].includes(activeAsset.kind) ? (
                            <section className="border-b border-border p-3">
                              <div className="flex items-center gap-2">
                                {activeAsset.kind === "图片" ? (
                                  <FileText className="size-3.5 text-muted-foreground" />
                                ) : (
                                  <FileAudio className="size-3.5 text-muted-foreground" />
                                )}
                                <h3 className="min-w-0 flex-1 text-xs font-semibold">
                                  {activeAsset.kind === "图片" ? "文字识别" : "语音转写"}
                                </h3>
                                {textAnalysis ? (
                                  <span className="text-xs text-muted-foreground">
                                    {mediaAnalysisStatusText[textAnalysis.status]}
                                  </span>
                                ) : null}
                              </div>

                              {mediaAnalysisQuery.isLoading ? (
                                <p className="mt-3 text-xs text-muted-foreground">
                                  正在读取识别状态
                                </p>
                              ) : mediaAnalysisQuery.isError ? (
                                <div className="mt-3 space-y-2">
                                  <p role="alert" className="text-xs text-destructive">
                                    识别状态读取失败
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void mediaAnalysisQuery.refetch()}
                                  >
                                    重新载入
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  {textAnalysis ? (
                                    <dl className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                                      <dt className="text-muted-foreground">
                                        API 提供方
                                      </dt>
                                      <dd className="truncate text-right">
                                        {textAnalysis.provider ?? "等待处理"}
                                      </dd>
                                      <dt className="text-muted-foreground">API 协议</dt>
                                      <dd className="truncate text-right">
                                        {textAnalysis.runtimeVersion ?? "等待处理"}
                                      </dd>
                                      <dt className="text-muted-foreground">模型</dt>
                                      <dd className="truncate text-right">
                                        {textAnalysis.modelName ?? "—"}
                                      </dd>
                                      <dt className="text-muted-foreground">语言</dt>
                                      <dd className="truncate text-right">
                                        {textAnalysis.language ?? "—"}
                                      </dd>
                                      <dt className="text-muted-foreground">源版本</dt>
                                      <dd className="truncate text-right">
                                        r{textAnalysis.sourceRevision} ·{" "}
                                        {textAnalysis.sourceChecksumSha256.slice(0, 8)}
                                      </dd>
                                    </dl>
                                  ) : null}

                                  {textAnalysis?.status === "failed" ? (
                                    <p
                                      role="alert"
                                      className="mt-3 text-xs text-destructive"
                                    >
                                      {textAnalysis.failureStage
                                        ? `${textAnalysis.failureStage} · `
                                        : ""}
                                      {textAnalysis.lastError ?? "识别失败"}
                                    </p>
                                  ) : null}

                                  {textAnalysis?.segments.length ? (
                                    <div className="mt-3 max-h-48 overflow-auto border-y border-border">
                                      {textAnalysis.segments.map((segment) => (
                                        <div
                                          key={`${textAnalysis.id}-${segment.sequence}`}
                                          className="grid grid-cols-[56px_minmax(0,1fr)] gap-2 border-b border-border px-1 py-2 text-xs last:border-b-0"
                                        >
                                          <span className="text-muted-foreground tabular-nums">
                                            {segment.startUs === null
                                              ? String(segment.sequence).padStart(2, "0")
                                              : formatTimecode(segment.startUs)}
                                          </span>
                                          <p className="min-w-0 whitespace-pre-wrap break-words">
                                            {segment.text}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : textAnalysis?.status === "awaiting_confirmation" ? (
                                    <p className="mt-3 text-xs text-muted-foreground">
                                      未识别到可确认的文本
                                    </p>
                                  ) : null}

                                  <div className="mt-3">
                                    {!textAnalysis ||
                                    ["completed", "cancelled", "expired"].includes(
                                      textAnalysis.status,
                                    ) ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={
                                          !activeAsset.analysisReady ||
                                          createTextAnalysisMutation.isPending
                                        }
                                        title={
                                          activeAsset.analysisReady
                                            ? undefined
                                            : "等待基础媒体处理完成"
                                        }
                                        onClick={() =>
                                          createTextAnalysisMutation.mutate({
                                            assetId: activeAsset.id,
                                            kind:
                                              activeAsset.kind === "图片"
                                                ? "ocr"
                                                : "transcription",
                                          })
                                        }
                                      >
                                        <ScanSearch />
                                        {textAnalysis ? "重新识别" : "开始识别"}
                                      </Button>
                                    ) : textAnalysis.status === "failed" ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={retryMediaAnalysisMutation.isPending}
                                        onClick={() =>
                                          retryMediaAnalysisMutation.mutate(textAnalysis)
                                        }
                                      >
                                        重新识别
                                      </Button>
                                    ) : textAnalysis.status ===
                                      "awaiting_confirmation" ? (
                                      <Button
                                        size="sm"
                                        disabled={confirmMediaAnalysisMutation.isPending}
                                        onClick={() =>
                                          confirmMediaAnalysisMutation.mutate(
                                            textAnalysis,
                                          )
                                        }
                                      >
                                        <Check />
                                        确认文本
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" disabled>
                                        {textAnalysis.status === "queued"
                                          ? "等待识别"
                                          : "正在识别"}
                                      </Button>
                                    )}
                                  </div>
                                </>
                              )}
                            </section>
                          ) : null}

                          {activeAsset.kind === "视频" ? (
                            <section className="border-b border-border p-3">
                              <div className="flex items-center gap-2">
                                <Camera className="size-3.5 text-muted-foreground" />
                                <h3 className="min-w-0 flex-1 text-xs font-semibold">
                                  指定时间码截帧
                                </h3>
                                {frameCaptures.length ? (
                                  <span className="text-xs text-muted-foreground">
                                    {frameCaptures.length} 项
                                  </span>
                                ) : null}
                              </div>

                              <form
                                className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2"
                                onSubmit={(event) => {
                                  event.preventDefault()
                                  captureFrame()
                                }}
                              >
                                <Input
                                  aria-label="截帧时间码"
                                  value={captureTimecode}
                                  onChange={(event) =>
                                    setCaptureTimecode(event.target.value)
                                  }
                                  placeholder="00:00.000"
                                  className="min-w-0 tabular-nums"
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    !activeAsset.analysisReady ||
                                    Boolean(activeFrameCapture) ||
                                    createFrameCaptureMutation.isPending
                                  }
                                >
                                  <Camera />
                                  {activeFrameCapture ? "截取中" : "截取"}
                                </Button>
                              </form>

                              {captureError ? (
                                <p role="alert" className="mt-2 text-xs text-destructive">
                                  {captureError}
                                </p>
                              ) : null}

                              {frameCaptures.length ? (
                                <div className="mt-3 divide-y divide-border border-y border-border">
                                  {frameCaptures.map((capture) => {
                                    const frame = capture.shots[0]
                                    return (
                                      <div
                                        key={capture.id}
                                        className="grid min-h-14 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 py-2"
                                      >
                                        {frame ? (
                                          <button
                                            type="button"
                                            aria-label={`播放 ${formatTimecode(frame.keyframeUs)} 截帧位置`}
                                            className="relative aspect-video w-[72px] overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                            onClick={() => {
                                              setPreviewTimeUs(frame.keyframeUs)
                                              setPreviewAssetId(activeAsset.id)
                                            }}
                                          >
                                            <Image
                                              src={assetApi.mediaAnalysisKeyframeUrl(
                                                teamId,
                                                activeAsset.id,
                                                capture.id,
                                                frame.id,
                                              )}
                                              alt={`${formatTimecode(frame.keyframeUs)} 截帧`}
                                              fill
                                              sizes="72px"
                                              unoptimized
                                              className="object-cover"
                                            />
                                          </button>
                                        ) : (
                                          <span className="grid aspect-video w-[72px] place-items-center bg-muted text-muted-foreground">
                                            <Camera className="size-4" />
                                          </span>
                                        )}
                                        <div className="min-w-0">
                                          <p className="truncate text-xs font-medium tabular-nums">
                                            {formatTimecode(
                                              capture.requestedTimecodeUs ?? 0,
                                            )}
                                          </p>
                                          <p className="truncate text-xs text-muted-foreground">
                                            {capture.kind === "frame_capture" &&
                                            capture.status === "completed"
                                              ? "截帧完成"
                                              : mediaAnalysisStatusText[capture.status]}
                                          </p>
                                        </div>
                                        {capture.status === "failed" ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={
                                              retryMediaAnalysisMutation.isPending
                                            }
                                            onClick={() =>
                                              retryMediaAnalysisMutation.mutate(capture)
                                            }
                                          >
                                            重试
                                          </Button>
                                        ) : frame ? (
                                          <IconButton
                                            label={`下载 ${formatTimecode(frame.keyframeUs)} 截帧`}
                                            className="size-8"
                                            asChild
                                          >
                                            <a
                                              href={`${assetApi.mediaAnalysisKeyframeUrl(
                                                teamId,
                                                activeAsset.id,
                                                capture.id,
                                                frame.id,
                                              )}?download=1`}
                                              download={`${activeAsset.name}-${formatTimecode(frame.keyframeUs)}.jpg`}
                                            >
                                              <Download />
                                            </a>
                                          </IconButton>
                                        ) : (
                                          <span className="size-8" aria-hidden="true" />
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </section>
                          ) : null}

                          <section className="border-b border-border p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <h3 className="text-xs font-medium text-muted-foreground">
                                标签
                              </h3>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <IconButton label="添加标签" className="size-8">
                                    <Plus />
                                  </IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  {allTags.map((tag) => (
                                    <DropdownMenuCheckboxItem
                                      key={tag}
                                      checked={activeAsset.tags.includes(tag)}
                                      onCheckedChange={(checked) =>
                                        updateAsset(activeAsset.id, {
                                          tags: checked
                                            ? [...new Set([...activeAsset.tags, tag])]
                                            : activeAsset.tags.filter(
                                                (item) => item !== tag,
                                              ),
                                        })
                                      }
                                    >
                                      {tag}
                                    </DropdownMenuCheckboxItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <div className="flex min-h-7 flex-wrap gap-1">
                              {activeAsset.tags.length ? (
                                activeAsset.tags.map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setActiveFilter(`tag:${tag}`)}
                                    className="border border-border bg-muted/45 px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                  >
                                    {tag}
                                  </button>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  尚未添加标签
                                </span>
                              )}
                            </div>
                          </section>

                          <section className="p-3">
                            <label
                              htmlFor="asset-note"
                              className="mb-2 block text-xs font-medium text-muted-foreground"
                            >
                              备注
                            </label>
                            <Textarea
                              id="asset-note"
                              value={noteDrafts[activeAsset.id] ?? activeAsset.note ?? ""}
                              onChange={(event) =>
                                setNoteDrafts((current) => ({
                                  ...current,
                                  [activeAsset.id]: event.target.value,
                                }))
                              }
                              onBlur={() => {
                                const note = noteDrafts[activeAsset.id]
                                if (note !== undefined && note !== activeAsset.note) {
                                  updateAsset(activeAsset.id, { note })
                                }
                              }}
                              placeholder="记录使用限制、创作意图或协作说明"
                              className="min-h-24 resize-y text-xs"
                            />
                          </section>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={<Info className="size-6" />}
                    title="选择一项素材"
                    detail="素材信息、标签、评分与备注会显示在这里。"
                  />
                )}
              </aside>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="min-h-0 overflow-hidden">
          <DataTableViewport label="团队资源库联系人" axis="both" className="h-full">
            <table className="w-full min-w-[760px] table-fixed text-left">
              <caption className="sr-only">
                团队联系人、成员共享联系人、来源、电话、项目关联与操作
              </caption>
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[120px]" />
              </colgroup>
              <thead className="border-b border-border bg-muted/35 text-xs text-muted-foreground">
                <tr>
                  {["联系人", "来源 / 所有者", "电话", "项目关联", "操作"].map(
                    (label) => (
                      <th key={label} scope="col" className="px-4 py-2 font-medium">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="h-14 border-b border-border text-sm transition-colors hover:bg-muted/25"
                  >
                    <td className="min-w-0 px-4">
                      <strong className="block truncate font-medium">
                        {contact.name}
                      </strong>
                      <span className="block truncate text-xs text-muted-foreground">
                        {contact.role}
                      </span>
                    </td>
                    <td className="min-w-0 px-4">
                      <span className="block truncate text-xs">{contact.source}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {contact.owner}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-4 text-xs",
                        contact.masked && "text-muted-foreground",
                      )}
                    >
                      {contact.phone}
                    </td>
                    <td className="truncate px-4 text-xs">
                      {contact.projects.join("、") || "未关联"}
                    </td>
                    <td className="px-4">
                      <IconButton
                        label={`打开联系人：${contact.name}`}
                        onClick={() => {
                          setStatusMessage("")
                          setDraftContact({
                            name: contact.raw.name ?? "",
                            role: contact.raw.role ?? "",
                            company: contact.raw.company ?? "",
                            phone: contact.raw.phone ?? "",
                            email: contact.raw.email ?? "",
                          })
                          setSelectedContact(contact)
                        }}
                      >
                        <ContactRound />
                      </IconButton>
                    </td>
                  </tr>
                ))}
                {teamContactsQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="h-24 px-4 text-sm text-muted-foreground">
                      正在载入团队联系人...
                    </td>
                  </tr>
                ) : null}
                {teamContactsQuery.isError ? (
                  <tr>
                    <td colSpan={5} className="h-24 px-4 text-sm text-destructive">
                      团队联系人载入失败
                    </td>
                  </tr>
                ) : null}
                {!teamContactsQuery.isLoading &&
                !teamContactsQuery.isError &&
                !contacts.length ? (
                  <tr>
                    <td colSpan={5} className="h-24 px-4 text-sm text-muted-foreground">
                      当前团队还没有可见联系人
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </DataTableViewport>
        </TabsContent>

        <TabsContent value="suppliers" className="min-h-0 overflow-hidden">
          <DataTableViewport label="团队资源库供应商" axis="both" className="h-full">
            <table className="w-full min-w-[960px] table-fixed text-left">
              <caption className="sr-only">
                团队供应商、类别、服务范围、联系方式、项目关联与操作
              </caption>
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[14%]" />
                <col className="w-[24%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[96px]" />
              </colgroup>
              <thead className="border-b border-border bg-muted/35 text-xs text-muted-foreground">
                <tr>
                  {["供应商", "类别", "服务范围", "联系方式", "项目关联", "操作"].map(
                    (label) => (
                      <th key={label} scope="col" className="px-4 py-2 font-medium">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="h-14 border-b border-border text-sm transition-colors hover:bg-muted/25"
                  >
                    <td className="min-w-0 px-4">
                      <strong className="block truncate font-medium">
                        {supplier.name}
                      </strong>
                      <span className="block truncate text-xs text-muted-foreground">
                        {supplier.contactRefs.length
                          ? `关联 ${supplier.contactRefs.length} 位联系人`
                          : "未关联联系人"}
                      </span>
                    </td>
                    <td className="truncate px-4 text-xs">
                      {supplier.category || "未分类"}
                    </td>
                    <td className="truncate px-4 text-xs text-muted-foreground">
                      {supplier.services || "未填写"}
                    </td>
                    <td className="min-w-0 px-4">
                      <span className="block truncate text-xs">
                        {supplier.phone || "未填写电话"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {supplier.email || "未填写邮箱"}
                      </span>
                    </td>
                    <td className="truncate px-4 text-xs">
                      {supplier.projectIds
                        .map(
                          (projectId) =>
                            projects.find((project) => project.id === projectId)?.name ??
                            projectId,
                        )
                        .join("、") || "未关联"}
                    </td>
                    <td className="px-4">
                      <IconButton
                        label={`打开供应商：${supplier.name}`}
                        onClick={() => {
                          setStatusMessage("")
                          setDraftSupplier({
                            name: supplier.name,
                            category: supplier.category,
                            services: supplier.services,
                            phone: supplier.phone,
                            email: supplier.email,
                            address: supplier.address,
                            contactRefs: [...supplier.contactRefs],
                            projectIds: [...supplier.projectIds],
                          })
                          setSelectedSupplier(supplier)
                        }}
                      >
                        <Truck />
                      </IconButton>
                    </td>
                  </tr>
                ))}
                {suppliersQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="h-24 px-4 text-sm text-muted-foreground">
                      正在载入团队供应商...
                    </td>
                  </tr>
                ) : null}
                {suppliersQuery.isError ? (
                  <tr>
                    <td colSpan={6} className="h-24 px-4">
                      <div className="flex items-center gap-3 text-sm text-destructive">
                        <span role="alert">团队供应商载入失败</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void suppliersQuery.refetch()}
                        >
                          重试
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {!suppliersQuery.isLoading &&
                !suppliersQuery.isError &&
                !suppliers.length ? (
                  <tr>
                    <td colSpan={6} className="h-24 px-4 text-sm text-muted-foreground">
                      {query ? "没有匹配的供应商" : "当前团队还没有供应商"}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </DataTableViewport>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(folderToArchive)}
        onOpenChange={(open) => {
          if (!open && !updateFolderMutation.isPending) setFolderToArchive(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>将文件夹移入回收站</DialogTitle>
            <DialogDescription>
              仅空文件夹可以归档，之后可从资源库回收站恢复。
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{folderToArchive?.name}</p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={updateFolderMutation.isPending}
              onClick={() => setFolderToArchive(null)}
            >
              取消
            </Button>
            <Button
              disabled={!folderToArchive || updateFolderMutation.isPending}
              onClick={() => {
                if (folderToArchive) {
                  updateFolderMutation.mutate({ folder: folderToArchive, archived: true })
                }
              }}
            >
              {updateFolderMutation.isPending ? "正在归档" : "移入回收站"}
            </Button>
          </DialogFooter>
          {updateFolderMutation.isError ? (
            <p className="text-sm text-destructive">{statusMessage}</p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
            <DialogDescription>文件夹用于团队素材的稳定归类。</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="文件夹名称"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="文件夹名称"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              onClick={() => {
                const name = newFolderName.trim()
                setStatusMessage("")
                createFolderMutation.mutate(name)
              }}
            >
              {createFolderMutation.isPending ? "创建中" : "创建"}
            </Button>
          </DialogFooter>
          {createFolderMutation.isError ? (
            <p className="text-sm text-destructive">{statusMessage}</p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={createContactOpen} onOpenChange={setCreateContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建团队联系人</DialogTitle>
            <DialogDescription>
              记录归 {team.name} 所有，团队成员按权限共同维护。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label="团队联系人姓名或机构"
              value={draftContact.name}
              onChange={(event) =>
                setDraftContact((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="姓名或机构"
            />
            <Input
              aria-label="团队联系人职业或类型"
              value={draftContact.role}
              onChange={(event) =>
                setDraftContact((current) => ({ ...current, role: event.target.value }))
              }
              placeholder="职业 / 类型"
            />
            <Input
              aria-label="团队联系人公司"
              value={draftContact.company}
              onChange={(event) =>
                setDraftContact((current) => ({
                  ...current,
                  company: event.target.value,
                }))
              }
              placeholder="公司"
            />
            <Input
              aria-label="团队联系人电话"
              value={draftContact.phone}
              onChange={(event) =>
                setDraftContact((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="电话"
            />
            <Input
              aria-label="团队联系人邮箱"
              value={draftContact.email}
              onChange={(event) =>
                setDraftContact((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="邮箱"
              className="sm:col-span-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateContactOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!draftContact.name.trim() || createContactMutation.isPending}
              onClick={() => {
                setStatusMessage("")
                createContactMutation.mutate()
              }}
            >
              创建联系人
            </Button>
          </DialogFooter>
          {createContactMutation.isError ? (
            <p className="text-sm text-destructive">{statusMessage}</p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={contactImportDialog !== null}
        onOpenChange={(open) => {
          if (open) return
          setContactImportDialog(null)
          importContactsMutation.reset()
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>导入团队联系人</DialogTitle>
            <DialogDescription>
              {contactImportDialog?.fileName}
              {contactImportDialog && !contactImportDialog.error
                ? ` · ${contactImportDialog.items.length} 条记录`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {contactImportDialog?.imported !== undefined ? (
            <p role="status" className="py-8 text-center text-sm">
              已导入 {contactImportDialog.imported} 位团队联系人
            </p>
          ) : contactImportDialog?.error ? (
            <p role="alert" className="py-6 text-sm text-destructive">
              {contactImportDialog.error}
            </p>
          ) : contactImportDialog ? (
            <DataTableViewport label="联系人导入预览" axis="both" className="max-h-80">
              <table className="w-full min-w-[680px] table-fixed text-left text-xs">
                <caption className="sr-only">即将导入的团队联系人预览</caption>
                <thead className="border-b border-border bg-muted/35 text-muted-foreground">
                  <tr>
                    {["姓名", "职务 / 类型", "公司", "电话", "邮箱"].map((label) => (
                      <th key={label} scope="col" className="px-3 py-2 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contactImportDialog.items.slice(0, 10).map((contact) => (
                    <tr
                      key={JSON.stringify(contact)}
                      className="h-10 border-b border-border"
                    >
                      <td className="truncate px-3">{contact.name}</td>
                      <td className="truncate px-3">{contact.role || "-"}</td>
                      <td className="truncate px-3">{contact.company || "-"}</td>
                      <td className="truncate px-3">{contact.phone || "-"}</td>
                      <td className="truncate px-3">{contact.email || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableViewport>
          ) : null}
          {contactImportDialog &&
          !contactImportDialog.error &&
          contactImportDialog.imported === undefined &&
          contactImportDialog.items.length > 10 ? (
            <p className="text-xs text-muted-foreground">
              预览前 10 条，另有 {contactImportDialog.items.length - 10}{" "}
              条将在确认后导入。
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactImportDialog(null)}>
              {contactImportDialog?.imported !== undefined ? "完成" : "取消"}
            </Button>
            {contactImportDialog &&
            !contactImportDialog.error &&
            contactImportDialog.imported === undefined ? (
              <Button
                disabled={importContactsMutation.isPending}
                onClick={() => importContactsMutation.mutate(contactImportDialog)}
              >
                {importContactsMutation.isPending
                  ? "导入中"
                  : `导入 ${contactImportDialog.items.length} 条`}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedContact !== null && !confirmDeleteContact}
        onOpenChange={(open) => !open && setSelectedContact(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedContact?.name}</DialogTitle>
            <DialogDescription>
              {selectedContact?.source} · 所有者 {selectedContact?.owner}
            </DialogDescription>
          </DialogHeader>
          {selectedContact?.editable ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["name", "姓名或机构"],
                ["role", "职业 / 类型"],
                ["company", "公司"],
                ["phone", "电话"],
                ["email", "邮箱"],
              ].map(([field, label]) => (
                <Input
                  key={field}
                  aria-label={`编辑${label}`}
                  value={draftContact[field as keyof typeof draftContact]}
                  onChange={(event) =>
                    setDraftContact((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                  placeholder={label}
                  className={field === "email" ? "sm:col-span-2" : undefined}
                />
              ))}
            </div>
          ) : (
            <dl className="divide-y divide-border border border-border text-sm">
              {[
                ["职业 / 类型", selectedContact?.role],
                ["公司", selectedContact?.raw.company ?? "字段未共享"],
                ["电话", selectedContact?.phone],
                ["邮箱", selectedContact?.raw.email ?? "字段未共享"],
                ["项目关联", selectedContact?.projects.join("、") || "未关联"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 p-3"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {updateContactMutation.isError ? (
            <p className="text-sm text-destructive">{statusMessage}</p>
          ) : null}
          <DialogFooter
            className={selectedContact?.editable ? "sm:justify-between" : undefined}
          >
            {selectedContact?.editable ? (
              <Button
                variant="destructive"
                onClick={() => {
                  setStatusMessage("")
                  deleteContactMutation.reset()
                  setConfirmDeleteContact(true)
                }}
              >
                <Trash2 />
                删除
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setSelectedContact(null)}>
                关闭
              </Button>
            )}
            {selectedContact?.editable ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedContact(null)}>
                  取消
                </Button>
                <Button
                  disabled={!draftContact.name.trim() || updateContactMutation.isPending}
                  onClick={() => updateContactMutation.mutate()}
                >
                  保存修改
                </Button>
              </div>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDeleteContact}
        onOpenChange={(open) => !open && setConfirmDeleteContact(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除“{selectedContact?.name}”</DialogTitle>
            <DialogDescription>该联系人将移至团队回收站。</DialogDescription>
          </DialogHeader>
          {deleteContactMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {statusMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteContact(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleteContactMutation.isPending}
              onClick={() => deleteContactMutation.mutate()}
            >
              {deleteContactMutation.isPending ? "删除中" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createSupplierOpen} onOpenChange={setCreateSupplierOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建供应商</DialogTitle>
            <DialogDescription className="sr-only">
              创建团队供应商并设置联系人和项目关联。
            </DialogDescription>
          </DialogHeader>
          <SupplierFieldsEditor
            value={draftSupplier}
            contacts={teamContactsQuery.data?.items ?? []}
            projects={projects}
            onChange={setDraftSupplier}
          />
          {createSupplierMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {statusMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSupplierOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!draftSupplier.name.trim() || createSupplierMutation.isPending}
              onClick={() => {
                setStatusMessage("")
                createSupplierMutation.mutate()
              }}
            >
              {createSupplierMutation.isPending ? "创建中" : "创建供应商"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={supplierImportDialog !== null}
        onOpenChange={(open) => {
          if (open) return
          setSupplierImportDialog(null)
          importSuppliersMutation.reset()
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>导入供应商</DialogTitle>
            <DialogDescription>
              {supplierImportDialog?.fileName}
              {supplierImportDialog && !supplierImportDialog.error
                ? ` · ${supplierImportDialog.items.length} 条记录`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {supplierImportDialog?.imported !== undefined ? (
            <p role="status" className="py-8 text-center text-sm">
              已导入 {supplierImportDialog.imported} 个供应商
            </p>
          ) : supplierImportDialog?.error ? (
            <p role="alert" className="py-6 text-sm text-destructive">
              {supplierImportDialog.error}
            </p>
          ) : supplierImportDialog ? (
            <DataTableViewport label="供应商导入预览" axis="both" className="max-h-80">
              <table className="w-full min-w-[900px] table-fixed text-left text-xs">
                <caption className="sr-only">即将导入的供应商预览</caption>
                <thead className="border-b border-border bg-muted/35 text-muted-foreground">
                  <tr>
                    {["名称", "类别", "服务范围", "电话", "邮箱", "地址"].map((label) => (
                      <th key={label} scope="col" className="px-3 py-2 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplierImportDialog.items.slice(0, 10).map((supplier) => (
                    <tr
                      key={JSON.stringify(supplier)}
                      className="h-10 border-b border-border"
                    >
                      <td className="truncate px-3">{supplier.name}</td>
                      <td className="truncate px-3">{supplier.category || "-"}</td>
                      <td className="truncate px-3">{supplier.services || "-"}</td>
                      <td className="truncate px-3">{supplier.phone || "-"}</td>
                      <td className="truncate px-3">{supplier.email || "-"}</td>
                      <td className="truncate px-3">{supplier.address || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableViewport>
          ) : null}
          {supplierImportDialog &&
          !supplierImportDialog.error &&
          supplierImportDialog.imported === undefined &&
          supplierImportDialog.items.length > 10 ? (
            <p className="text-xs text-muted-foreground">
              预览前 10 条，另有 {supplierImportDialog.items.length - 10} 条。
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierImportDialog(null)}>
              {supplierImportDialog?.imported !== undefined ? "完成" : "取消"}
            </Button>
            {supplierImportDialog &&
            !supplierImportDialog.error &&
            supplierImportDialog.imported === undefined ? (
              <Button
                disabled={importSuppliersMutation.isPending}
                onClick={() => importSuppliersMutation.mutate(supplierImportDialog)}
              >
                {importSuppliersMutation.isPending
                  ? "导入中"
                  : `导入 ${supplierImportDialog.items.length} 条`}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedSupplier !== null && !confirmDeleteSupplier}
        onOpenChange={(open) => !open && setSelectedSupplier(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedSupplier?.name}</DialogTitle>
            <DialogDescription className="sr-only">
              编辑供应商资料、联系人和项目关联。
            </DialogDescription>
          </DialogHeader>
          <SupplierFieldsEditor
            value={draftSupplier}
            contacts={teamContactsQuery.data?.items ?? []}
            projects={projects}
            onChange={(value) => {
              updateSupplierMutation.reset()
              setDraftSupplier(value)
            }}
          />
          {updateSupplierMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {statusMessage}
            </p>
          ) : null}
          <DialogFooter className="sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => {
                setStatusMessage("")
                deleteSupplierMutation.reset()
                setConfirmDeleteSupplier(true)
              }}
            >
              <Trash2 />
              删除
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedSupplier(null)}>
                取消
              </Button>
              <Button
                disabled={!draftSupplier.name.trim() || updateSupplierMutation.isPending}
                onClick={() => {
                  setStatusMessage("")
                  updateSupplierMutation.mutate()
                }}
              >
                {updateSupplierMutation.isPending ? "保存中" : "保存修改"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDeleteSupplier}
        onOpenChange={(open) => !open && setConfirmDeleteSupplier(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除“{selectedSupplier?.name}”</DialogTitle>
            <DialogDescription>该供应商将从团队资源库中移除。</DialogDescription>
          </DialogHeader>
          {deleteSupplierMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {statusMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteSupplier(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleteSupplierMutation.isPending}
              onClick={() => deleteSupplierMutation.mutate()}
            >
              {deleteSupplierMutation.isPending ? "删除中" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewAsset !== null}
        onOpenChange={(open) => !open && setPreviewAssetId(null)}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewAsset?.name}</DialogTitle>
            <DialogDescription>
              {previewAsset?.kind} · {previewAsset?.project} · {previewAsset?.size}
            </DialogDescription>
          </DialogHeader>
          {previewAsset ? (
            <div className="grid min-h-[320px] place-items-center border border-border bg-muted/30">
              {previewAsset.kind === "视频" ? (
                // biome-ignore lint/a11y/useMediaCaption: Uploaded media has no caption derivative until a real ASR runtime is connected.
                <video
                  key={`${previewAsset.id}:${previewTimeUs}`}
                  controls
                  autoPlay={previewTimeUs > 0}
                  preload="metadata"
                  className="aspect-video w-full bg-black object-contain"
                  src={`${assetApi.contentUrl(teamId, previewAsset.id)}#t=${(
                    previewTimeUs / 1_000_000
                  ).toFixed(6)}`}
                ></video>
              ) : (
                <div className="aspect-video w-full">
                  <AssetPreview asset={previewAsset} />
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewAssetId(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
