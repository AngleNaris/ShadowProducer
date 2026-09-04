"use client"

import type {
  AnalysisApprovalPolicy,
  AnalysisJob,
  AnalysisWorkflow,
  BreakdownDraft,
  BreakdownItem,
  BreakdownRelationOptions,
  CallSheet,
  CreateExecutionStageBody,
  ExecutionResourceType,
  ExecutionStage,
  ScriptVersion,
  ShootingDay,
  UpdateBreakdownItemBody,
  UpdateCallSheetBody,
  UpdateExecutionStageBody,
  UpdateShootingDayBody,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileText,
  GitFork,
  GitMerge,
  History,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Truck,
  Wrench,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  DataTableViewport,
  PageFrame,
  SectionHeader,
  StatusBadge,
  type StatusTone,
  WorkspaceHeader,
} from "@/components/workspace/page-elements"
import { RelationPicker } from "@/components/workspace/relation-picker"
import type { WorkspaceScopedProject } from "@/components/workspace/workspace-data"
import {
  ApiError,
  analysisApi,
  productionApi,
  scriptApi,
  supplierApi,
  workspaceApi,
} from "@/lib/api-client"
import { executionResourcesFromNames } from "@/lib/production-resources"
import {
  formatTimeZoneOffset,
  type TimeDisambiguation,
  toLocalInput,
  zonedLocalCandidates,
  zonedLocalToIso,
} from "@/lib/production-time"
import { cn } from "@/lib/utils"

type BreakdownCategory = {
  id: string
  label: string
  owner: string
}

const breakdownCategories: BreakdownCategory[] = [
  { id: "cast", label: "演员与角色", owner: "选角 / 演员统筹" },
  { id: "location", label: "场景与场地", owner: "制片 / 场务" },
  { id: "art", label: "美术与道具", owner: "美术 / 道具" },
  { id: "wardrobe", label: "服化造型", owner: "服装 / 化妆" },
  { id: "equipment", label: "摄制设备", owner: "摄影 / 灯光 / 录音" },
  { id: "special", label: "特殊执行与保障", owner: "特效 / 安全 / 后勤" },
]

type EditableBreakdownState = Exclude<BreakdownItem["state"], "已确认">
type BreakdownEditDraft = BreakdownDraft & {
  state: EditableBreakdownState | null
  supplierIds: string[]
  responsibleAccountId: string | null
  taskIds: string[]
  contactRefs: BreakdownItem["contactRefs"]
  shootingDayIds: string[]
  callSheetIds: string[]
}
type BreakdownRewriteDraft = BreakdownDraft & { clientId: string }

type BreakdownRewriteState = {
  mode: "merge" | "split"
  rows: BreakdownItem[]
  drafts: BreakdownRewriteDraft[]
  primaryItemId: string | null
}

const editableBreakdownStates: EditableBreakdownState[] = [
  "待确认",
  "待安排",
  "待采购或租赁",
  "已联系",
  "已完成",
  "不需要",
  "已取消",
]

function breakdownStateTone(state: BreakdownItem["state"]): StatusTone {
  if (state === "已确认" || state === "已完成") return "success"
  if (state === "待确认" || state === "待采购或租赁") return "warning"
  if (state === "已取消") return "danger"
  if (state === "已联系") return "primary"
  return "neutral"
}

function analysisStatusLabel(status: AnalysisJob["status"]) {
  return {
    queued: "排队中",
    processing: "分析中",
    awaiting_confirmation: "待确认",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  }[status]
}

function analysisStatusTone(status: AnalysisJob["status"]): StatusTone {
  if (status === "completed") return "success"
  if (status === "awaiting_confirmation") return "warning"
  if (status === "failed") return "danger"
  if (status === "processing") return "primary"
  return "neutral"
}

function contactRefKey(source: "team" | "member-shared", contactId: string) {
  return `${source}:${contactId}`
}

function breakdownDraftFromRow(row: BreakdownItem): BreakdownDraft {
  return {
    item: row.item,
    requirementType: row.requirementType,
    specification: row.specification,
    quantity: row.quantity,
    preparation: row.preparation,
    department: row.department,
  }
}

function rewriteDraftFromRow(row: BreakdownItem): BreakdownRewriteDraft {
  return { ...breakdownDraftFromRow(row), clientId: crypto.randomUUID() }
}

function rewriteDraftBody({ clientId: _, ...draft }: BreakdownRewriteDraft) {
  return draft
}

function BreakdownFieldsEditor({
  idPrefix,
  value,
  disabled,
  onChange,
}: {
  idPrefix: string
  value: BreakdownDraft
  disabled?: boolean
  onChange: (key: keyof BreakdownDraft, value: string) => void
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-xs" htmlFor={`${idPrefix}-item`}>
        候选内容
        <Input
          id={`${idPrefix}-item`}
          required
          maxLength={300}
          value={value.item}
          onChange={(event) => onChange("item", event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs" htmlFor={`${idPrefix}-type`}>
        需求类型
        <Input
          id={`${idPrefix}-type`}
          required
          maxLength={120}
          value={value.requirementType}
          onChange={(event) => onChange("requirementType", event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs" htmlFor={`${idPrefix}-specification`}>
        规格
        <Input
          id={`${idPrefix}-specification`}
          required
          maxLength={500}
          value={value.specification}
          onChange={(event) => onChange("specification", event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs" htmlFor={`${idPrefix}-quantity`}>
        数量
        <Input
          id={`${idPrefix}-quantity`}
          required
          maxLength={120}
          value={value.quantity}
          onChange={(event) => onChange("quantity", event.target.value)}
        />
      </label>
      <label
        className="grid gap-1 text-xs sm:col-span-2"
        htmlFor={`${idPrefix}-preparation`}
      >
        准备要求
        <Textarea
          id={`${idPrefix}-preparation`}
          required
          maxLength={2_000}
          value={value.preparation}
          onChange={(event) => onChange("preparation", event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs" htmlFor={`${idPrefix}-department`}>
        负责部门
        <Input
          id={`${idPrefix}-department`}
          required
          maxLength={300}
          value={value.department}
          onChange={(event) => onChange("department", event.target.value)}
        />
      </label>
    </fieldset>
  )
}

export function ProductionBreakdown({ project }: { project: WorkspaceScopedProject }) {
  const projectId = project.id
  const queryClient = useQueryClient()
  const [category, setCategory] = useState("cast")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sourceRow, setSourceRow] = useState<BreakdownItem | null>(null)
  const [editRow, setEditRow] = useState<BreakdownItem | null>(null)
  const [editDraft, setEditDraft] = useState<BreakdownEditDraft | null>(null)
  const [rewrite, setRewrite] = useState<BreakdownRewriteState | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisDocumentId, setAnalysisDocumentId] = useState("")
  const [analysisVersionId, setAnalysisVersionId] = useState("")
  const [workflowEnabled, setWorkflowEnabled] = useState(false)
  const [workflowDocumentId, setWorkflowDocumentId] = useState("all")
  const [workflowApprovalPolicy, setWorkflowApprovalPolicy] =
    useState<AnalysisApprovalPolicy>("manual_confirmation")
  const [workflowApprovalThreshold, setWorkflowApprovalThreshold] = useState(90)
  const pendingConfirmKeyRef = useRef<string | null>(null)
  const pendingRewriteKeyRef = useRef<string | null>(null)
  const pendingAnalysisKeyRef = useRef<string | null>(null)
  const pendingWorkflowKeyRef = useRef<string | null>(null)
  const breakdownQuery = useQuery({
    queryKey: ["production-breakdown", projectId],
    queryFn: () => productionApi.listBreakdown(projectId),
  })
  const suppliersQuery = useQuery({
    queryKey: ["team-suppliers", project.teamId],
    queryFn: () => supplierApi.listTeam(project.teamId),
  })
  const relationOptionsQuery = useQuery({
    queryKey: ["breakdown-relation-options", projectId],
    queryFn: () => productionApi.listBreakdownRelationOptions(projectId),
  })
  const analysisJobsQuery = useQuery({
    queryKey: ["analysis-jobs", projectId],
    queryFn: () => analysisApi.list(projectId),
    refetchInterval: (query) =>
      query.state.data?.items.some((job) => ["queued", "processing"].includes(job.status))
        ? 1_000
        : false,
  })
  const analysisWorkflowQuery = useQuery({
    queryKey: ["analysis-workflow", projectId],
    queryFn: () => analysisApi.getWorkflow(projectId),
    enabled: analysisOpen,
  })
  const scriptDocumentsQuery = useQuery({
    queryKey: ["script-documents", projectId],
    queryFn: () => scriptApi.listDocuments(projectId),
    enabled: analysisOpen,
  })
  const scriptDocuments =
    scriptDocumentsQuery.data?.documents.filter(
      (document) => document.type === "script",
    ) ?? []
  const selectedDocumentId = analysisDocumentId || scriptDocuments[0]?.id || ""
  const analysisWorkspaceQuery = useQuery({
    queryKey: ["script-workspace", projectId, selectedDocumentId],
    queryFn: () => scriptApi.getWorkspace(projectId, selectedDocumentId),
    enabled: analysisOpen && Boolean(selectedDocumentId),
  })
  const analysisVersions = analysisWorkspaceQuery.data?.versions ?? []
  const selectedVersionId =
    analysisVersionId || analysisWorkspaceQuery.data?.document.currentVersionId || ""
  const selectedAnalysisVersion = analysisVersions.find(
    (version) => version.id === selectedVersionId,
  )
  const analysisJobs = analysisJobsQuery.data?.items ?? []
  const analysisWorkflow = analysisWorkflowQuery.data
  const workflowDirty = Boolean(
    analysisWorkflow &&
      (workflowEnabled !== analysisWorkflow.enabled ||
        workflowDocumentId !== (analysisWorkflow.sourceDocumentId ?? "all") ||
        workflowApprovalPolicy !== analysisWorkflow.approvalPolicy ||
        workflowApprovalThreshold !== analysisWorkflow.approvalThreshold),
  )
  const rows = breakdownQuery.data?.items ?? []
  const suppliers = (suppliersQuery.data?.items ?? []).filter((supplier) =>
    supplier.projectIds.includes(projectId),
  )
  const relationOptions: BreakdownRelationOptions = relationOptionsQuery.data ?? {
    members: [],
    tasks: [],
    contacts: [],
    shootingDays: [],
    callSheets: [],
  }
  const contactName = (contact: BreakdownItem["contactRefs"][number]) =>
    relationOptions.contacts.find(
      (option) => option.source === contact.source && option.id === contact.contactId,
    )?.name ?? "联系人已不可用"
  const visibleRows = rows.filter((row) => row.category === category)
  const pendingVisible = visibleRows.filter((row) => row.state === "待确认")
  const selectedVisible = pendingVisible.filter((row) => selected.has(row.id))
  const currentCategory = breakdownCategories.find((item) => item.id === category)
  const allPendingSelected =
    pendingVisible.length > 0 && pendingVisible.every((row) => selected.has(row.id))
  const analysisRefreshSignature = analysisJobs
    .filter((job) => ["awaiting_confirmation", "completed"].includes(job.status))
    .map((job) => `${job.id}:${job.revision}`)
    .join("|")

  useEffect(() => {
    if (!analysisWorkflow) return
    setWorkflowEnabled(analysisWorkflow.enabled)
    setWorkflowDocumentId(analysisWorkflow.sourceDocumentId ?? "all")
    setWorkflowApprovalPolicy(analysisWorkflow.approvalPolicy)
    setWorkflowApprovalThreshold(analysisWorkflow.approvalThreshold)
  }, [analysisWorkflow])

  useEffect(() => {
    if (!analysisRefreshSignature) return
    void queryClient.invalidateQueries({ queryKey: ["production-breakdown", projectId] })
  }, [analysisRefreshSignature, projectId, queryClient])
  const lineageLabel = (row: BreakdownItem) => {
    if (row.mergedIntoItemId) {
      return `已并入 ${rows.find((item) => item.id === row.mergedIntoItemId)?.item ?? "新候选"}`
    }
    if (row.parentItemId) {
      return `拆分自 ${rows.find((item) => item.id === row.parentItemId)?.item ?? "原候选"}`
    }
    return null
  }

  const applyBreakdownUpdates = (updatedItems: BreakdownItem[]) => {
    const updates = new Map(updatedItems.map((item) => [item.id, item]))
    queryClient.setQueryData<{ items: BreakdownItem[] }>(
      ["production-breakdown", projectId],
      (current) => {
        const existing = current?.items ?? []
        const known = new Set(existing.map((item) => item.id))
        return {
          items: [
            ...existing.map((item) => updates.get(item.id) ?? item),
            ...updatedItems.filter((item) => !known.has(item.id)),
          ],
        }
      },
    )
  }

  const applyAnalysisJobUpdate = (job: AnalysisJob) => {
    queryClient.setQueryData<{ items: AnalysisJob[] }>(
      ["analysis-jobs", projectId],
      (current) => ({
        items: [job, ...(current?.items ?? []).filter((item) => item.id !== job.id)],
      }),
    )
  }

  const createAnalysisMutation = useMutation({
    mutationFn: ({
      version,
      idempotencyKey,
    }: {
      version: ScriptVersion
      idempotencyKey: string
    }) =>
      analysisApi.createScriptBreakdown(projectId, {
        documentId: selectedDocumentId,
        versionId: version.id,
        sourceRevision: version.revision,
        idempotencyKey,
      }),
    onSuccess: ({ job }) => {
      applyAnalysisJobUpdate(job)
      pendingAnalysisKeyRef.current = null
    },
  })

  const updateWorkflowMutation = useMutation({
    mutationFn: ({
      workflow,
      idempotencyKey,
    }: {
      workflow: AnalysisWorkflow
      idempotencyKey: string
    }) =>
      analysisApi.updateWorkflow(projectId, {
        enabled: workflowEnabled,
        sourceDocumentId: workflowDocumentId === "all" ? null : workflowDocumentId,
        approvalPolicy: workflowApprovalPolicy,
        approvalThreshold: workflowApprovalThreshold,
        expectedRevision: workflow.revision,
        idempotencyKey,
      }),
    onSuccess: ({ workflow }) => {
      queryClient.setQueryData(["analysis-workflow", projectId], workflow)
      pendingWorkflowKeyRef.current = null
    },
  })

  const updateAnalysisMutation = useMutation({
    mutationFn: ({ job, action }: { job: AnalysisJob; action: "retry" | "cancel" }) =>
      analysisApi[action](projectId, job.id, {
        expectedRevision: job.revision,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ job }) => applyAnalysisJobUpdate(job),
  })

  const confirmMutation = useMutation({
    mutationFn: ({
      items,
      selectedCategory,
      idempotencyKey,
    }: {
      items: BreakdownItem[]
      selectedCategory: string
      idempotencyKey: string
    }) =>
      productionApi.confirmBreakdown(projectId, {
        category: selectedCategory,
        items: items.map((item) => ({
          itemId: item.id,
          expectedRevision: item.revision,
        })),
        idempotencyKey,
      }),
    onSuccess: ({ items: updatedItems }) => {
      applyBreakdownUpdates(updatedItems)
      setSelected((current) => {
        const next = new Set(current)
        updatedItems.forEach((item) => {
          next.delete(item.id)
        })
        return next
      })
      pendingConfirmKeyRef.current = null
      setConfirmOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ row, draft }: { row: BreakdownItem; draft: BreakdownEditDraft }) => {
      const body: UpdateBreakdownItemBody = {
        item: draft.item,
        requirementType: draft.requirementType,
        specification: draft.specification,
        quantity: draft.quantity,
        preparation: draft.preparation,
        department: draft.department,
        expectedRevision: row.revision,
        ...(draft.state ? { state: draft.state } : {}),
        ...(row.state === "已确认"
          ? {
              supplierIds: draft.supplierIds,
              responsibleAccountId: draft.responsibleAccountId,
              taskIds: draft.taskIds,
              contactRefs: draft.contactRefs,
              shootingDayIds: draft.shootingDayIds,
              callSheetIds: draft.callSheetIds,
            }
          : {}),
      }
      return productionApi.updateBreakdown(projectId, row.id, body)
    },
    onSuccess: (updated) => {
      applyBreakdownUpdates([updated])
      setEditRow(null)
      setEditDraft(null)
    },
  })

  const rewriteMutation = useMutation({
    mutationFn: ({
      value,
      idempotencyKey,
    }: {
      value: BreakdownRewriteState
      idempotencyKey: string
    }) => {
      if (value.mode === "merge") {
        return productionApi.mergeBreakdown(projectId, {
          category,
          primaryItemId: value.primaryItemId ?? value.rows[0].id,
          items: value.rows.map((row) => ({
            itemId: row.id,
            expectedRevision: row.revision,
          })),
          result: rewriteDraftBody(value.drafts[0]),
          idempotencyKey,
        })
      }
      return productionApi.splitBreakdown(projectId, {
        itemId: value.rows[0].id,
        expectedRevision: value.rows[0].revision,
        items: value.drafts.map(rewriteDraftBody),
        idempotencyKey,
      })
    },
    onSuccess: ({ items: updatedItems }, { value }) => {
      applyBreakdownUpdates(updatedItems)
      setSelected((current) => {
        const next = new Set(current)
        value.rows.forEach((row) => {
          next.delete(row.id)
        })
        return next
      })
      pendingRewriteKeyRef.current = null
      setRewrite(null)
    },
  })

  const openEditor = (row: BreakdownItem) => {
    updateMutation.reset()
    setEditRow(row)
    setEditDraft({
      ...breakdownDraftFromRow(row),
      state: row.state === "已确认" ? null : row.state,
      supplierIds: [...row.supplierIds],
      responsibleAccountId: row.responsibleAccountId,
      taskIds: [...row.taskIds],
      contactRefs: [...row.contactRefs],
      shootingDayIds: [...row.shootingDayIds],
      callSheetIds: [...row.callSheetIds],
    })
  }

  const updateDraft = <K extends keyof BreakdownEditDraft>(
    key: K,
    value: BreakdownEditDraft[K],
  ) => {
    updateMutation.reset()
    setEditDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const openMerge = () => {
    if (selectedVisible.length < 2) return
    const primary = selectedVisible[0]
    const unique = (values: string[], separator: string, maxLength: number) =>
      [...new Set(values)].join(separator).slice(0, maxLength)
    rewriteMutation.reset()
    pendingRewriteKeyRef.current = null
    setRewrite({
      mode: "merge",
      rows: selectedVisible,
      primaryItemId: primary.id,
      drafts: [
        {
          ...rewriteDraftFromRow(primary),
          item: unique(
            selectedVisible.map((row) => row.item),
            " / ",
            300,
          ),
          quantity: unique(
            selectedVisible.map((row) => row.quantity),
            "；",
            120,
          ),
          preparation: unique(
            selectedVisible.map((row) => row.preparation),
            "\n",
            2_000,
          ),
          department: unique(
            selectedVisible.map((row) => row.department),
            " / ",
            300,
          ),
        },
      ],
    })
  }

  const openSplit = () => {
    const parent = selectedVisible[0]
    if (selectedVisible.length !== 1 || !parent) return
    const draft = rewriteDraftFromRow(parent)
    rewriteMutation.reset()
    pendingRewriteKeyRef.current = null
    setRewrite({
      mode: "split",
      rows: [parent],
      primaryItemId: null,
      drafts: [
        {
          ...draft,
          clientId: crypto.randomUUID(),
          item: `${draft.item} A`.slice(0, 300),
        },
        {
          ...draft,
          clientId: crypto.randomUUID(),
          item: `${draft.item} B`.slice(0, 300),
        },
      ],
    })
  }

  const updateRewriteDraft = (
    index: number,
    key: keyof BreakdownDraft,
    value: string,
  ) => {
    rewriteMutation.reset()
    pendingRewriteKeyRef.current = null
    setRewrite((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts.map((draft, draftIndex) =>
              draftIndex === index ? { ...draft, [key]: value } : draft,
            ),
          }
        : current,
    )
  }

  const submitRewrite = () => {
    if (!rewrite) return
    pendingRewriteKeyRef.current ??= crypto.randomUUID()
    rewriteMutation.mutate({
      value: rewrite,
      idempotencyKey: pendingRewriteKeyRef.current,
    })
  }

  const refreshRewriteBase = async () => {
    const result = await breakdownQuery.refetch()
    if (!result.data) return
    const currentRows = new Map(result.data.items.map((item) => [item.id, item]))
    setRewrite((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => currentRows.get(row.id) ?? row),
          }
        : current,
    )
    pendingRewriteKeyRef.current = null
    rewriteMutation.reset()
  }

  const confirmRows = () => {
    if (!selectedVisible.length) return
    pendingConfirmKeyRef.current ??= crypto.randomUUID()
    confirmMutation.mutate({
      items: selectedVisible,
      selectedCategory: category,
      idempotencyKey: pendingConfirmKeyRef.current,
    })
  }

  const selectCategory = (nextCategory: string) => {
    if (nextCategory === category) return
    setCategory(nextCategory)
    setSelected(new Set())
    pendingConfirmKeyRef.current = null
    confirmMutation.reset()
  }

  const toggleRow = (rowId: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
    pendingConfirmKeyRef.current = null
    confirmMutation.reset()
  }

  const toggleAllPending = () => {
    setSelected(
      allPendingSelected ? new Set() : new Set(pendingVisible.map((row) => row.id)),
    )
    pendingConfirmKeyRef.current = null
    confirmMutation.reset()
  }

  return (
    <PageFrame>
      <WorkspaceHeader
        title="制片拆解"
        description={`${project.name} · 来源可追溯的专业制片准备清单`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                createAnalysisMutation.reset()
                setAnalysisOpen(true)
              }}
            >
              <Sparkles />
              分析脚本
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedVisible.length < 2 || rewriteMutation.isPending}
              onClick={openMerge}
            >
              <GitMerge />
              合并
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedVisible.length !== 1 || rewriteMutation.isPending}
              onClick={openSplit}
            >
              <GitFork />
              拆分
            </Button>
            <Button
              size="sm"
              disabled={!selectedVisible.length || confirmMutation.isPending}
              onClick={() => {
                confirmMutation.reset()
                setConfirmOpen(true)
              }}
            >
              <ClipboardCheck />
              确认所选 {selectedVisible.length ? `(${selectedVisible.length})` : ""}
            </Button>
          </div>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside
          data-scroll-owner
          className="flex min-h-0 gap-1 overflow-x-auto border-b border-border p-2 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0"
        >
          {breakdownCategories.map((item) => {
            const pending = rows.filter(
              (row) => row.category === item.id && row.state === "待确认",
            ).length
            return (
              <button
                key={item.id}
                type="button"
                aria-current={category === item.id ? "true" : undefined}
                onClick={() => selectCategory(item.id)}
                className={cn(
                  "flex min-h-11 min-w-44 items-center gap-3 border-l-2 px-3 py-2.5 text-left lg:min-w-0",
                  category === item.id
                    ? "border-primary bg-primary/7 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className="block truncate text-xs">{item.owner}</span>
                </span>
                <span className="grid min-w-5 place-items-center bg-muted px-1 text-xs text-foreground">
                  {pending}
                </span>
              </button>
            )
          })}
        </aside>

        <DataTableViewport label="制片拆解候选列表" axis="both" className="min-h-0">
          <table className="w-full min-w-[1730px] table-fixed border-collapse text-left">
            <caption className="sr-only">制片拆解候选列表</caption>
            <colgroup>
              <col className="w-[42px]" />
              <col className="w-[180px]" />
              <col className="w-[190px]" />
              <col className="w-[230px]" />
              <col className="w-[150px]" />
              <col className="w-[220px]" />
              <col className="w-[190px]" />
              <col className="w-[180px]" />
              <col className="w-[230px]" />
              <col className="w-[110px]" />
              <col className="w-[58px]" />
            </colgroup>
            <thead>
              <tr className="h-9 border-b border-border bg-muted/35 text-xs text-muted-foreground">
                <th scope="col" className="px-3">
                  <label className="grid size-7 place-items-center">
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      disabled={!pendingVisible.length}
                      onChange={toggleAllPending}
                      className="size-4 accent-primary"
                      aria-label={`选择${currentCategory?.label ?? "当前分类"}全部待确认项`}
                    />
                  </label>
                </th>
                <th scope="col" className="px-3 font-medium">
                  候选内容 / 类型
                </th>
                <th scope="col" className="px-3 font-medium">
                  规格 / 数量
                </th>
                <th scope="col" className="px-3 font-medium">
                  准备要求
                </th>
                <th scope="col" className="px-3 font-medium">
                  负责部门
                </th>
                <th scope="col" className="px-3 font-medium">
                  来源文档 / 版本 / 位置
                </th>
                <th scope="col" className="px-3 font-medium">
                  Agent 判断
                </th>
                <th scope="col" className="px-3 font-medium">
                  供应商
                </th>
                <th scope="col" className="px-3 font-medium">
                  负责人 / 联系人 / 任务 / 拍摄日 / 通告
                </th>
                <th
                  scope="col"
                  className="sticky right-[58px] z-10 border-l border-border bg-muted px-3 font-medium"
                >
                  状态
                </th>
                <th
                  scope="col"
                  aria-label="编辑"
                  className="sticky right-0 z-10 bg-muted px-2 font-medium"
                />
              </tr>
            </thead>
            <tbody>
              {breakdownQuery.isLoading ? (
                <tr className="h-20 border-b border-border text-sm">
                  <td colSpan={11} className="px-3 text-center text-muted-foreground">
                    正在载入制片拆解…
                  </td>
                </tr>
              ) : null}
              {breakdownQuery.isError ? (
                <tr className="h-20 border-b border-border text-sm">
                  <td colSpan={11} className="px-3 text-center text-destructive">
                    {breakdownQuery.error.message}
                  </td>
                </tr>
              ) : null}
              {!breakdownQuery.isLoading &&
              !breakdownQuery.isError &&
              !visibleRows.length ? (
                <tr className="h-20 border-b border-border text-sm">
                  <td colSpan={11} className="px-3 text-center text-muted-foreground">
                    当前分类暂无拆解项
                  </td>
                </tr>
              ) : null}
              {visibleRows.map((row) => (
                <tr key={row.id} className="h-24 border-b border-border text-sm">
                  <td className="px-1">
                    <label className="grid size-11 place-items-center">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        disabled={row.state !== "待确认"}
                        onChange={() => toggleRow(row.id)}
                        className="size-4 accent-primary"
                        aria-label={`选择 ${row.item}`}
                      />
                    </label>
                  </td>
                  <th scope="row" className="px-3">
                    <span className="block truncate font-medium" title={row.item}>
                      {row.item}
                    </span>
                    <span
                      className="mt-1 block truncate text-xs font-normal text-muted-foreground"
                      title={lineageLabel(row) ?? row.requirementType}
                    >
                      {row.requirementType}
                      {lineageLabel(row) ? ` · ${lineageLabel(row)}` : ""}
                    </span>
                  </th>
                  <td className="px-3 text-xs leading-5">
                    <span
                      className="line-clamp-2 text-muted-foreground"
                      title={row.specification}
                    >
                      {row.specification}
                    </span>
                    <span
                      className="mt-1 block truncate font-medium"
                      title={row.quantity}
                    >
                      {row.quantity}
                    </span>
                  </td>
                  <td className="px-3 text-xs leading-5 text-muted-foreground">
                    <span className="line-clamp-2" title={row.preparation}>
                      {row.preparation}
                    </span>
                  </td>
                  <td className="px-3 text-xs">
                    <span className="line-clamp-2" title={row.department}>
                      {row.department}
                    </span>
                  </td>
                  <td className="px-3">
                    <button
                      type="button"
                      onClick={() => setSourceRow(row)}
                      className="flex min-h-11 w-full min-w-0 items-start gap-2 py-2 text-left text-xs text-primary hover:underline"
                      title={row.source}
                    >
                      <FileText className="mt-0.5 size-3.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate">{row.sourceDocument}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.sourceVersion} · {row.sourceLocation}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 text-xs leading-5">
                    <span
                      className="line-clamp-2 text-muted-foreground"
                      title={row.agentAssessment}
                    >
                      {row.agentAssessment}
                    </span>
                    <span className="mt-1 flex items-center gap-1 font-medium text-foreground">
                      <Sparkles className="size-3.5 text-primary" />
                      {row.confidence}%
                    </span>
                  </td>
                  <td className="px-3 text-xs leading-5">
                    {row.supplierIds.length ? (
                      <span
                        className="line-clamp-2"
                        title={row.supplierIds
                          .map(
                            (supplierId) =>
                              suppliers.find((supplier) => supplier.id === supplierId)
                                ?.name ?? supplierId,
                          )
                          .join("、")}
                      >
                        {row.supplierIds
                          .map(
                            (supplierId) =>
                              suppliers.find((supplier) => supplier.id === supplierId)
                                ?.name ?? supplierId,
                          )
                          .join("、")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">未关联</span>
                    )}
                  </td>
                  <td className="px-3 text-xs leading-5">
                    <span className="block truncate font-medium">
                      {row.responsibleName ?? "未分配"}
                    </span>
                    <span
                      className="block truncate text-muted-foreground"
                      title={row.contactRefs.map(contactName).join("、")}
                    >
                      {row.contactRefs.length
                        ? row.contactRefs.map(contactName).join("、")
                        : "未关联联系人"}
                    </span>
                    <span
                      className="block truncate text-muted-foreground"
                      title={row.taskIds
                        .map(
                          (taskId) =>
                            relationOptions.tasks.find((task) => task.id === taskId)
                              ?.title ?? taskId,
                        )
                        .join("、")}
                    >
                      {row.taskIds.length
                        ? row.taskIds
                            .map(
                              (taskId) =>
                                relationOptions.tasks.find((task) => task.id === taskId)
                                  ?.title ?? taskId,
                            )
                            .join("、")
                        : "未关联任务"}
                    </span>
                    <span
                      className="block truncate text-muted-foreground"
                      title={row.shootingDayIds
                        .map((shootingDayId) => {
                          const day = relationOptions.shootingDays.find(
                            (item) => item.id === shootingDayId,
                          )
                          return day
                            ? `第 ${day.dayNumber} 天 · ${day.title}`
                            : shootingDayId
                        })
                        .join("、")}
                    >
                      {row.shootingDayIds.length
                        ? row.shootingDayIds
                            .map((shootingDayId) => {
                              const day = relationOptions.shootingDays.find(
                                (item) => item.id === shootingDayId,
                              )
                              return day
                                ? `拍摄日 ${day.dayNumber} · ${day.title}`
                                : shootingDayId
                            })
                            .join("、")
                        : "未关联拍摄日"}
                    </span>
                    <span
                      className="block truncate text-muted-foreground"
                      title={row.callSheetIds
                        .map(
                          (callSheetId) =>
                            relationOptions.callSheets.find(
                              (callSheet) => callSheet.id === callSheetId,
                            )?.title ?? callSheetId,
                        )
                        .join("、")}
                    >
                      {row.callSheetIds.length
                        ? row.callSheetIds
                            .map(
                              (callSheetId) =>
                                relationOptions.callSheets.find(
                                  (callSheet) => callSheet.id === callSheetId,
                                )?.title ?? callSheetId,
                            )
                            .join("、")
                        : "未关联通告"}
                    </span>
                  </td>
                  <td className="sticky right-[58px] border-l border-border bg-background px-3">
                    <StatusBadge tone={breakdownStateTone(row.state)}>
                      {row.state}
                    </StatusBadge>
                  </td>
                  <td className="sticky right-0 bg-background px-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`编辑 ${row.item}`}
                      title={`编辑 ${row.item}`}
                      onClick={() => openEditor(row)}
                    >
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableViewport>
      </div>

      <Dialog
        open={analysisOpen}
        onOpenChange={(open) => {
          setAnalysisOpen(open)
          if (!open) {
            createAnalysisMutation.reset()
            updateWorkflowMutation.reset()
          }
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>脚本拆解分析</DialogTitle>
            <DialogDescription>{project.name} · 本地确定性规则 v1</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-2 sm:items-end">
            <label
              htmlFor="analysis-workflow-enabled"
              className="flex min-h-9 items-center gap-2 text-sm font-medium"
            >
              <Checkbox
                id="analysis-workflow-enabled"
                checked={workflowEnabled}
                disabled={analysisWorkflowQuery.isLoading || !analysisWorkflow}
                onCheckedChange={(checked) => {
                  setWorkflowEnabled(checked === true)
                  pendingWorkflowKeyRef.current = null
                  updateWorkflowMutation.reset()
                }}
              />
              保存后自动分析
            </label>

            <div className="grid min-w-0 gap-1 text-xs">
              <span>分析范围</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                    disabled={
                      !workflowEnabled ||
                      analysisWorkflowQuery.isLoading ||
                      scriptDocumentsQuery.isLoading
                    }
                  >
                    <span className="truncate">
                      {workflowDocumentId === "all"
                        ? "全部脚本文档"
                        : (scriptDocuments.find((item) => item.id === workflowDocumentId)
                            ?.title ?? "指定脚本文档")}
                    </span>
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={workflowDocumentId}
                    onValueChange={(value) => {
                      setWorkflowDocumentId(value)
                      pendingWorkflowKeyRef.current = null
                      updateWorkflowMutation.reset()
                    }}
                  >
                    <DropdownMenuRadioItem value="all">
                      全部脚本文档
                    </DropdownMenuRadioItem>
                    {scriptDocuments.map((document) => (
                      <DropdownMenuRadioItem key={document.id} value={document.id}>
                        {document.title}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="grid min-w-0 gap-1 text-xs">
              <span>审批规则</span>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                      disabled={!workflowEnabled || analysisWorkflowQuery.isLoading}
                    >
                      <span className="truncate">
                        {workflowApprovalPolicy === "manual_confirmation"
                          ? "全部人工确认"
                          : "高置信度自动确认"}
                      </span>
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={workflowApprovalPolicy}
                      onValueChange={(value) => {
                        setWorkflowApprovalPolicy(value as AnalysisApprovalPolicy)
                        pendingWorkflowKeyRef.current = null
                        updateWorkflowMutation.reset()
                      }}
                    >
                      <DropdownMenuRadioItem value="manual_confirmation">
                        全部人工确认
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="confidence_threshold">
                        高置信度自动确认
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  aria-label="自动确认置信度阈值"
                  title="自动确认置信度阈值"
                  disabled={
                    !workflowEnabled ||
                    workflowApprovalPolicy === "manual_confirmation" ||
                    analysisWorkflowQuery.isLoading
                  }
                  value={workflowApprovalThreshold}
                  onChange={(event) => {
                    setWorkflowApprovalThreshold(Number(event.target.value))
                    pendingWorkflowKeyRef.current = null
                    updateWorkflowMutation.reset()
                  }}
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={
                !analysisWorkflow || !workflowDirty || updateWorkflowMutation.isPending
              }
              onClick={() => {
                if (!analysisWorkflow) return
                pendingWorkflowKeyRef.current ??= crypto.randomUUID()
                updateWorkflowMutation.mutate({
                  workflow: analysisWorkflow,
                  idempotencyKey: pendingWorkflowKeyRef.current,
                })
              }}
            >
              <Check />
              {updateWorkflowMutation.isPending ? "正在保存" : "保存设置"}
            </Button>
          </div>

          {analysisWorkflowQuery.error || updateWorkflowMutation.error ? (
            <p className="text-xs text-destructive">
              {updateWorkflowMutation.error instanceof Error
                ? updateWorkflowMutation.error.message
                : "自动分析设置读取失败"}
            </p>
          ) : null}

          <div className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="grid min-w-0 gap-1 text-xs">
              <span>脚本文档</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                    disabled={scriptDocumentsQuery.isLoading || !scriptDocuments.length}
                  >
                    <span className="truncate">
                      {scriptDocuments.find((item) => item.id === selectedDocumentId)
                        ?.title ?? "暂无脚本文档"}
                    </span>
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={selectedDocumentId}
                    onValueChange={(value) => {
                      setAnalysisDocumentId(value)
                      setAnalysisVersionId("")
                      createAnalysisMutation.reset()
                    }}
                  >
                    {scriptDocuments.map((document) => (
                      <DropdownMenuRadioItem key={document.id} value={document.id}>
                        {document.title}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="grid min-w-0 gap-1 text-xs">
              <span>不可变版本</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                    disabled={
                      analysisWorkspaceQuery.isLoading || !analysisVersions.length
                    }
                  >
                    <span className="truncate">
                      {selectedAnalysisVersion
                        ? `${selectedAnalysisVersion.id} · ${selectedAnalysisVersion.meta}`
                        : "暂无版本"}
                    </span>
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={selectedVersionId}
                    onValueChange={(value) => {
                      setAnalysisVersionId(value)
                      createAnalysisMutation.reset()
                    }}
                  >
                    {analysisVersions.map((version) => (
                      <DropdownMenuRadioItem key={version.id} value={version.id}>
                        {version.id} · {version.meta}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Button
              type="button"
              disabled={!selectedAnalysisVersion || createAnalysisMutation.isPending}
              onClick={() => {
                if (!selectedAnalysisVersion) return
                pendingAnalysisKeyRef.current ??= crypto.randomUUID()
                createAnalysisMutation.mutate({
                  version: selectedAnalysisVersion,
                  idempotencyKey: pendingAnalysisKeyRef.current,
                })
              }}
            >
              <Sparkles />
              {createAnalysisMutation.isPending ? "正在提交" : "开始分析"}
            </Button>
          </div>

          {createAnalysisMutation.error ? (
            <p className="text-xs text-destructive">
              {createAnalysisMutation.error instanceof Error
                ? createAnalysisMutation.error.message
                : "分析任务创建失败"}
            </p>
          ) : null}
          {analysisWorkspaceQuery.error ? (
            <p className="text-xs text-destructive">脚本版本读取失败</p>
          ) : null}

          <div className="min-h-0 overflow-y-auto border border-border">
            <div className="sticky top-0 z-10 flex min-h-10 items-center justify-between border-b border-border bg-background px-3 text-xs font-medium">
              <span>分析任务</span>
              <span className="text-muted-foreground">{analysisJobs.length} 项</span>
            </div>
            {analysisJobsQuery.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">正在载入任务…</div>
            ) : analysisJobsQuery.error ? (
              <div className="flex items-center justify-between gap-3 p-4 text-sm text-destructive">
                <span>任务列表读取失败</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="重试读取分析任务"
                  title="重试读取分析任务"
                  onClick={() => analysisJobsQuery.refetch()}
                >
                  <RefreshCw />
                </Button>
              </div>
            ) : analysisJobs.length ? (
              analysisJobs.map((job) => {
                const mutating =
                  updateAnalysisMutation.isPending &&
                  updateAnalysisMutation.variables?.job.id === job.id
                return (
                  <div
                    key={job.id}
                    className="grid gap-3 border-b border-border p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={analysisStatusTone(job.status)}>
                          {analysisStatusLabel(job.status)}
                        </StatusBadge>
                        <span className="truncate text-sm font-medium">
                          {job.sourceDocumentTitle}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {job.sourceVersionId} · revision {job.sourceRevision}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>候选 {job.candidateCount}</span>
                        <span>
                          尝试 {job.attempts}/{job.maxAttempts}
                        </span>
                        <span>{new Date(job.createdAt).toLocaleString("zh-CN")}</span>
                        {job.triggerKind === "script_version_updated" ? (
                          <span>
                            {job.approvalPolicy === "confidence_threshold"
                              ? `自动确认 ≥ ${job.approvalThreshold}%`
                              : "全部人工确认"}
                          </span>
                        ) : null}
                      </div>
                      {job.lastError ? (
                        <p className="mt-2 text-xs text-destructive">
                          {job.failureStage ? `${job.failureStage} · ` : ""}
                          {job.lastError}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {job.status === "failed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={mutating}
                          aria-label={`重试 ${job.sourceDocumentTitle} ${job.sourceVersionId}`}
                          title="重试分析"
                          onClick={() =>
                            updateAnalysisMutation.mutate({ job, action: "retry" })
                          }
                        >
                          <RefreshCw />
                        </Button>
                      ) : null}
                      {["queued", "processing"].includes(job.status) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={mutating}
                          aria-label={`取消 ${job.sourceDocumentTitle} ${job.sourceVersionId}`}
                          title="取消分析"
                          onClick={() =>
                            updateAnalysisMutation.mutate({ job, action: "cancel" })
                          }
                        >
                          <X />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="p-4 text-sm text-muted-foreground">暂无分析任务</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(sourceRow)}
        onOpenChange={(open) => !open && setSourceRow(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{sourceRow?.item} · 来源核对</DialogTitle>
            <DialogDescription>
              {sourceRow?.sourceDocument} · {sourceRow?.sourceVersion} ·{" "}
              {sourceRow?.sourceLocation}
            </DialogDescription>
          </DialogHeader>
          <blockquote className="border-l-2 border-primary bg-muted/40 p-4 text-sm leading-6">
            {sourceRow?.excerpt}
          </blockquote>
          <div className="grid gap-px bg-border sm:grid-cols-3">
            <div className="bg-background p-3">
              <div className="text-xs text-muted-foreground">来源文档</div>
              <div className="mt-1 text-sm font-medium">{sourceRow?.sourceDocument}</div>
            </div>
            <div className="bg-background p-3">
              <div className="text-xs text-muted-foreground">不可变版本</div>
              <div className="mt-1 text-sm font-medium">{sourceRow?.sourceVersion}</div>
            </div>
            <div className="bg-background p-3">
              <div className="text-xs text-muted-foreground">原文位置</div>
              <div className="mt-1 text-sm font-medium">{sourceRow?.sourceLocation}</div>
            </div>
          </div>
          <div className="border border-border p-3">
            <div className="text-xs text-muted-foreground">Agent 判断</div>
            <p className="mt-1 text-sm leading-6">{sourceRow?.agentAssessment}</p>
            <div className="mt-2 text-xs font-medium text-primary">
              置信度 {sourceRow?.confidence}%
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editRow && editDraft)}
        onOpenChange={(open) => {
          if (open || updateMutation.isPending) return
          setEditRow(null)
          setEditDraft(null)
          updateMutation.reset()
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑制片拆解候选</DialogTitle>
            <DialogDescription>
              {editRow?.sourceDocument} · {editRow?.sourceVersion} ·{" "}
              {editRow?.sourceLocation}
            </DialogDescription>
          </DialogHeader>
          {editRow && editDraft ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                updateMutation.mutate({ row: editRow, draft: editDraft })
              }}
            >
              <BreakdownFieldsEditor
                idPrefix="breakdown-edit"
                value={editDraft}
                disabled={updateMutation.isPending}
                onChange={(key, value) => updateDraft(key, value)}
              />
              <div className="grid gap-1 text-xs sm:max-w-[calc(50%-0.5rem)]">
                状态
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                      disabled={updateMutation.isPending}
                    >
                      {editDraft.state ?? "保持已确认"}
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={editDraft.state ?? ""}
                      onValueChange={(value) =>
                        updateDraft("state", value as EditableBreakdownState)
                      }
                    >
                      {editableBreakdownStates.map((state) => (
                        <DropdownMenuRadioItem key={state} value={state}>
                          {state}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1 text-xs">
                  负责人
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between font-normal"
                        disabled={
                          editRow.state !== "已确认" ||
                          relationOptionsQuery.isLoading ||
                          updateMutation.isPending
                        }
                      >
                        {relationOptions.members.find(
                          (member) => member.accountId === editDraft.responsibleAccountId,
                        )?.displayName ?? "未分配"}
                        <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72">
                      <DropdownMenuRadioGroup
                        value={editDraft.responsibleAccountId ?? "unassigned"}
                        onValueChange={(value) =>
                          updateDraft(
                            "responsibleAccountId",
                            value === "unassigned" ? null : value,
                          )
                        }
                      >
                        <DropdownMenuRadioItem value="unassigned">
                          未分配
                        </DropdownMenuRadioItem>
                        {relationOptions.members.map((member) => (
                          <DropdownMenuRadioItem
                            key={member.accountId}
                            value={member.accountId}
                          >
                            {member.displayName} · {member.role}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="grid gap-1 text-xs">
                  关联任务
                  <RelationPicker
                    label={
                      relationOptionsQuery.isLoading ? "正在载入任务" : "关联项目任务"
                    }
                    options={relationOptions.tasks.map((task) => ({
                      id: task.id,
                      label: task.title,
                      detail: `${task.assigneeName} · ${task.status}`,
                    }))}
                    selectedIds={editDraft.taskIds}
                    disabled={
                      editRow.state !== "已确认" ||
                      relationOptionsQuery.isLoading ||
                      updateMutation.isPending
                    }
                    onToggle={(taskId, checked) =>
                      updateDraft(
                        "taskIds",
                        checked
                          ? [...editDraft.taskIds, taskId]
                          : editDraft.taskIds.filter((id) => id !== taskId),
                      )
                    }
                  />
                </div>
                <div className="grid gap-1 text-xs sm:col-span-2">
                  关联联系人
                  <RelationPicker
                    label={
                      relationOptionsQuery.isLoading ? "正在载入联系人" : "关联项目联系人"
                    }
                    options={relationOptions.contacts.map((contact) => ({
                      id: contactRefKey(contact.source, contact.id),
                      label: contact.name ?? "未命名联系人",
                      detail: [
                        contact.role,
                        contact.company,
                        contact.source === "team" ? "团队联系人" : "成员共享",
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    }))}
                    selectedIds={editDraft.contactRefs.map((contact) =>
                      contactRefKey(contact.source, contact.contactId),
                    )}
                    disabled={
                      editRow.state !== "已确认" ||
                      relationOptionsQuery.isLoading ||
                      updateMutation.isPending
                    }
                    onToggle={(contactKey, checked) => {
                      const contact = relationOptions.contacts.find(
                        (option) =>
                          contactRefKey(option.source, option.id) === contactKey,
                      )
                      if (!contact) return
                      updateDraft(
                        "contactRefs",
                        checked
                          ? [
                              ...editDraft.contactRefs,
                              { source: contact.source, contactId: contact.id },
                            ]
                          : editDraft.contactRefs.filter(
                              (item) =>
                                contactRefKey(item.source, item.contactId) !== contactKey,
                            ),
                      )
                    }}
                  />
                </div>
                <div className="grid gap-1 text-xs sm:col-span-2">
                  关联拍摄日
                  <RelationPicker
                    label={
                      relationOptionsQuery.isLoading ? "正在载入拍摄日" : "关联项目拍摄日"
                    }
                    options={relationOptions.shootingDays.map((day) => ({
                      id: day.id,
                      label: `第 ${day.dayNumber} 天 · ${day.title}`,
                      detail: `${day.shootDate} · ${day.status}`,
                    }))}
                    selectedIds={editDraft.shootingDayIds}
                    disabled={
                      editRow.state !== "已确认" ||
                      relationOptionsQuery.isLoading ||
                      updateMutation.isPending
                    }
                    onToggle={(shootingDayId, checked) =>
                      updateDraft(
                        "shootingDayIds",
                        checked
                          ? [...editDraft.shootingDayIds, shootingDayId]
                          : editDraft.shootingDayIds.filter((id) => id !== shootingDayId),
                      )
                    }
                  />
                </div>
                <div className="grid gap-1 text-xs sm:col-span-2">
                  关联通告单
                  <RelationPicker
                    label={
                      relationOptionsQuery.isLoading ? "正在载入通告单" : "关联项目通告单"
                    }
                    options={relationOptions.callSheets.map((callSheet) => ({
                      id: callSheet.id,
                      label: `${callSheet.date} · ${callSheet.title}`,
                      detail: `${callSheet.day} · ${callSheet.status}`,
                    }))}
                    selectedIds={editDraft.callSheetIds}
                    disabled={
                      editRow.state !== "已确认" ||
                      relationOptionsQuery.isLoading ||
                      updateMutation.isPending
                    }
                    onToggle={(callSheetId, checked) =>
                      updateDraft(
                        "callSheetIds",
                        checked
                          ? [...editDraft.callSheetIds, callSheetId]
                          : editDraft.callSheetIds.filter((id) => id !== callSheetId),
                      )
                    }
                  />
                </div>
                {editRow.state !== "已确认" ? (
                  <span className="text-xs text-muted-foreground sm:col-span-2">
                    拆解项确认后可关联联系人、负责人、项目任务、拍摄日和通告单
                  </span>
                ) : null}
                {relationOptionsQuery.isError ? (
                  <span role="alert" className="text-xs text-destructive sm:col-span-2">
                    联系人、负责人、任务、拍摄日和通告单载入失败
                  </span>
                ) : null}
              </div>
              <div className="grid gap-1 text-xs sm:max-w-[calc(50%-0.5rem)]">
                供应商
                <RelationPicker
                  label={suppliersQuery.isLoading ? "正在载入供应商" : "关联供应商"}
                  options={suppliers.map((supplier) => ({
                    id: supplier.id,
                    label: supplier.name,
                    detail: supplier.category || supplier.services,
                  }))}
                  selectedIds={editDraft.supplierIds}
                  disabled={
                    editRow.state !== "已确认" ||
                    suppliersQuery.isLoading ||
                    updateMutation.isPending
                  }
                  onToggle={(supplierId, checked) =>
                    updateDraft(
                      "supplierIds",
                      checked
                        ? [...editDraft.supplierIds, supplierId]
                        : editDraft.supplierIds.filter((id) => id !== supplierId),
                    )
                  }
                />
                {editRow.state !== "已确认" ? (
                  <span className="text-xs text-muted-foreground">
                    拆解项确认后可关联供应商
                  </span>
                ) : null}
                {suppliersQuery.isError ? (
                  <span role="alert" className="text-xs text-destructive">
                    供应商载入失败
                  </span>
                ) : null}
              </div>
              <div className="grid gap-px bg-border sm:grid-cols-2">
                <div className="bg-background p-3">
                  <div className="text-xs text-muted-foreground">Agent 判断</div>
                  <p className="mt-1 text-xs leading-5">{editRow.agentAssessment}</p>
                </div>
                <div className="bg-background p-3">
                  <div className="text-xs text-muted-foreground">不可变来源</div>
                  <p className="mt-1 text-xs leading-5">
                    {editRow.sourceDocument} · {editRow.sourceVersion} ·{" "}
                    {editRow.sourceLocation}
                  </p>
                </div>
              </div>
              {updateMutation.isError ? (
                <p role="alert" className="text-xs text-destructive">
                  {updateMutation.error.message}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={updateMutation.isPending}
                  onClick={() => {
                    setEditRow(null)
                    setEditDraft(null)
                    updateMutation.reset()
                  }}
                >
                  取消
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  <Check />
                  {updateMutation.isPending ? "正在保存" : "保存修改"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rewrite)}
        onOpenChange={(open) => {
          if (open || rewriteMutation.isPending) return
          setRewrite(null)
          pendingRewriteKeyRef.current = null
          rewriteMutation.reset()
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {rewrite?.mode === "merge"
                ? `合并 ${rewrite.rows.length} 项候选`
                : `拆分 ${rewrite?.rows[0]?.item ?? "候选"}`}
            </DialogTitle>
            <DialogDescription>
              {rewrite?.mode === "merge"
                ? "选择不可变来源的基准候选；全部源候选会保留合并去向。"
                : "新候选继承原文来源与 Agent 判断，原候选会保留父子关系。"}
            </DialogDescription>
          </DialogHeader>
          {rewrite ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                submitRewrite()
              }}
            >
              {rewrite.mode === "merge" ? (
                <>
                  <div className="border border-border bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {rewrite.rows.map((row) => row.item).join(" · ")}
                  </div>
                  <div className="grid max-w-sm gap-1 text-xs">
                    来源基准
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-between font-normal"
                          disabled={rewriteMutation.isPending}
                        >
                          {rewrite.rows.find((row) => row.id === rewrite.primaryItemId)
                            ?.item ?? "选择来源基准"}
                          <ChevronDown />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuRadioGroup
                          value={rewrite.primaryItemId ?? ""}
                          onValueChange={(value) => {
                            rewriteMutation.reset()
                            pendingRewriteKeyRef.current = null
                            setRewrite((current) =>
                              current ? { ...current, primaryItemId: value } : current,
                            )
                          }}
                        >
                          {rewrite.rows.map((row) => (
                            <DropdownMenuRadioItem key={row.id} value={row.id}>
                              {row.item} · {row.sourceDocument} {row.sourceVersion}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <BreakdownFieldsEditor
                    idPrefix="breakdown-merge"
                    value={rewrite.drafts[0]}
                    disabled={rewriteMutation.isPending}
                    onChange={(key, value) => updateRewriteDraft(0, key, value)}
                  />
                </>
              ) : (
                <div className="grid gap-3">
                  {rewrite.drafts.map((draft, index) => (
                    <section key={draft.clientId} className="border border-border p-3">
                      <div className="mb-3 flex min-h-9 items-center justify-between border-b border-border pb-2">
                        <h3 className="text-sm font-medium">子候选 {index + 1}</h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={
                            rewrite.drafts.length <= 2 || rewriteMutation.isPending
                          }
                          aria-label={`删除子候选 ${index + 1}`}
                          title={`删除子候选 ${index + 1}`}
                          onClick={() => {
                            rewriteMutation.reset()
                            pendingRewriteKeyRef.current = null
                            setRewrite((current) =>
                              current
                                ? {
                                    ...current,
                                    drafts: current.drafts.filter(
                                      (_, draftIndex) => draftIndex !== index,
                                    ),
                                  }
                                : current,
                            )
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <BreakdownFieldsEditor
                        idPrefix={`breakdown-split-${index}`}
                        value={draft}
                        disabled={rewriteMutation.isPending}
                        onChange={(key, value) => updateRewriteDraft(index, key, value)}
                      />
                    </section>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    disabled={rewrite.drafts.length >= 20 || rewriteMutation.isPending}
                    onClick={() => {
                      rewriteMutation.reset()
                      pendingRewriteKeyRef.current = null
                      setRewrite((current) => {
                        if (!current) return current
                        const parent = current.rows[0]
                        return {
                          ...current,
                          drafts: [
                            ...current.drafts,
                            {
                              ...rewriteDraftFromRow(parent),
                              item: `${parent.item} ${current.drafts.length + 1}`.slice(
                                0,
                                300,
                              ),
                            },
                          ],
                        }
                      })
                    }}
                  >
                    <Plus />
                    添加子候选
                  </Button>
                </div>
              )}
              {rewriteMutation.isError ? (
                <div role="alert" className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs text-destructive">
                    {rewriteMutation.error.message}，草稿与选择已保留。
                  </p>
                  {rewriteMutation.error instanceof ApiError &&
                  rewriteMutation.error.code === "RESOURCE_CONFLICT" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={breakdownQuery.isFetching}
                      onClick={refreshRewriteBase}
                    >
                      <RefreshCw />
                      {breakdownQuery.isFetching ? "正在载入" : "载入最新版本"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={rewriteMutation.isPending}
                  onClick={() => {
                    setRewrite(null)
                    pendingRewriteKeyRef.current = null
                    rewriteMutation.reset()
                  }}
                >
                  取消
                </Button>
                <Button type="submit" disabled={rewriteMutation.isPending}>
                  {rewrite?.mode === "merge" ? <GitMerge /> : <GitFork />}
                  {rewriteMutation.isPending
                    ? "正在保存"
                    : rewrite?.mode === "merge"
                      ? "创建合并候选"
                      : `创建 ${rewrite.drafts.length} 个子候选`}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && confirmMutation.isPending) return
          setConfirmOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认进入正式制片清单</DialogTitle>
            <DialogDescription>
              目标：{project.name} · {currentCategory?.label} · {selectedVisible.length}{" "}
              条候选
            </DialogDescription>
          </DialogHeader>
          <div className="border border-border">
            <div className="border-b border-border bg-muted/35 px-3 py-2 text-xs font-semibold">
              执行命令
            </div>
            <div className="px-3 py-3 font-mono text-xs">breakdown.acceptSelected</div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            确认后条目将成为部门准备、执行计划和通告表的正式数据来源。其他分类中的选择不会被本次操作带入。
          </p>
          {confirmMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {confirmMutation.error.message}，所选条目已保留，可直接重试。
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirmMutation.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              取消
            </Button>
            <Button disabled={confirmMutation.isPending} onClick={confirmRows}>
              <Check />
              {confirmMutation.isPending
                ? "正在确认"
                : `确认 ${selectedVisible.length} 条`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}

const executionStates: ExecutionStage["state"][] = [
  "未开始",
  "进行中",
  "已暂停",
  "已完成",
]

const executionResourceTypes: Array<{
  type: ExecutionResourceType
  label: string
  placeholder: string
}> = [
  { type: "cast", label: "演员", placeholder: "顾遥、林森" },
  { type: "crew", label: "工作人员", placeholder: "繁星、崔岚" },
  { type: "location", label: "场地", placeholder: "旧北站" },
  { type: "equipment", label: "设备", placeholder: "雨车 1 号" },
]

const executionTimezones = Array.from(
  new Set([
    "UTC",
    ...(typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [
          "Asia/Shanghai",
          "America/Los_Angeles",
          "America/New_York",
          "Europe/London",
          "Asia/Tokyo",
        ]),
  ]),
)

function TimezonePicker({
  value,
  onValueChange,
  ariaLabel,
  align = "start",
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  align?: "start" | "center" | "end"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn("min-w-0 justify-between", className)}
        >
          <Clock3 />
          <span className="min-w-0 flex-1 truncate text-left">{value}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatTimeZoneOffset(value)}
          </span>
          <ChevronDown className="shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
      >
        <Command>
          <CommandInput placeholder="搜索城市或时区" />
          <CommandList>
            <CommandEmpty>没有匹配的时区</CommandEmpty>
            {executionTimezones.map((timeZone) => (
              <CommandItem
                key={timeZone}
                value={timeZone}
                data-checked={timeZone === value}
                onSelect={() => {
                  onValueChange(timeZone)
                  setOpen(false)
                }}
              >
                <span className="truncate">{timeZone}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const shootingDayStatuses: ShootingDay["status"][] = [
  "草稿",
  "已确认",
  "拍摄中",
  "已完成",
  "已取消",
]

type ShootingDayDraft = {
  shootDate: string
  dayNumber: string
  title: string
  status: ShootingDay["status"]
  originalTimezone: string
}

function emptyShootingDayDraft(timeZone: string): ShootingDayDraft {
  return {
    shootDate: "",
    dayNumber: "",
    title: "",
    status: "草稿",
    originalTimezone: timeZone,
  }
}

function shootingDayDraftFromItem(item: ShootingDay): ShootingDayDraft {
  return {
    shootDate: item.shootDate,
    dayNumber: String(item.dayNumber),
    title: item.title,
    status: item.status,
    originalTimezone: item.originalTimezone,
  }
}

function shootingDayTone(status: ShootingDay["status"]): StatusTone {
  if (status === "已完成") return "success"
  if (status === "拍摄中") return "primary"
  if (status === "已取消") return "danger"
  if (status === "已确认") return "warning"
  return "neutral"
}

type ExecutionDraft = {
  name: string
  startsLocal: string
  endsLocal: string
  startsDisambiguation: TimeDisambiguation | null
  endsDisambiguation: TimeDisambiguation | null
  originalTimezone: string
  progress: string
  owner: string
  state: ExecutionStage["state"]
  note: string
  resources: Record<ExecutionResourceType, string>
}

function emptyExecutionDraft(timeZone: string): ExecutionDraft {
  return {
    name: "",
    startsLocal: "",
    endsLocal: "",
    startsDisambiguation: null,
    endsDisambiguation: null,
    originalTimezone: timeZone,
    progress: "0",
    owner: "",
    state: "未开始",
    note: "",
    resources: { cast: "", crew: "", location: "", equipment: "" },
  }
}

function executionDraftFromStage(stage: ExecutionStage): ExecutionDraft {
  const resources = { cast: "", crew: "", location: "", equipment: "" }
  for (const type of executionResourceTypes.map((entry) => entry.type)) {
    resources[type] = stage.resources
      .filter((resource) => resource.type === type)
      .map((resource) => resource.name)
      .join("、")
  }
  const startsLocal = toLocalInput(stage.startsAt, stage.originalTimezone)
  const endsLocal = toLocalInput(stage.endsAt, stage.originalTimezone)
  const startsCandidates = zonedLocalCandidates(startsLocal, stage.originalTimezone)
  const endsCandidates = zonedLocalCandidates(endsLocal, stage.originalTimezone)
  const startsAt = new Date(stage.startsAt).toISOString()
  const endsAt = new Date(stage.endsAt).toISOString()
  return {
    name: stage.name,
    startsLocal,
    endsLocal,
    startsDisambiguation:
      startsCandidates.length > 1
        ? startsCandidates.at(-1) === startsAt
          ? "later"
          : "earlier"
        : null,
    endsDisambiguation:
      endsCandidates.length > 1
        ? endsCandidates.at(-1) === endsAt
          ? "later"
          : "earlier"
        : null,
    originalTimezone: stage.originalTimezone,
    progress: String(stage.progress),
    owner: stage.owner,
    state: stage.state,
    note: stage.note,
    resources,
  }
}

function formatExecutionRange(stage: ExecutionStage, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  return `${formatter.format(new Date(stage.startsAt))} — ${formatter.format(new Date(stage.endsAt))}`
}

function formatExecutionMoment(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))
}

function formatExecutionTimeContext(stage: ExecutionStage, displayTimezone: string) {
  const details = [
    `${stage.originalTimezone} ${formatTimeZoneOffset(stage.originalTimezone, stage.startsAt)}`,
  ]
  if (displayTimezone !== stage.originalTimezone) {
    details.push(
      `${displayTimezone} ${formatTimeZoneOffset(displayTimezone, stage.startsAt)}`,
    )
    if (
      toLocalInput(stage.startsAt, displayTimezone).slice(0, 10) !==
        toLocalInput(stage.startsAt, stage.originalTimezone).slice(0, 10) ||
      toLocalInput(stage.endsAt, displayTimezone).slice(0, 10) !==
        toLocalInput(stage.endsAt, stage.originalTimezone).slice(0, 10)
    ) {
      details.push("日期已换算")
    }
  }
  if (
    toLocalInput(stage.startsAt, displayTimezone).slice(0, 10) !==
    toLocalInput(stage.endsAt, displayTimezone).slice(0, 10)
  ) {
    details.push("跨日")
  }
  return details.join(" · ")
}

function AmbiguousTimeChoice({
  label,
  candidates,
  timeZone,
  value,
  onValueChange,
}: {
  label: string
  candidates: string[]
  timeZone: string
  value: TimeDisambiguation | null
  onValueChange: (value: TimeDisambiguation) => void
}) {
  if (candidates.length < 2) return null
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">{label}出现两次</div>
      <div className="grid grid-cols-2" role="radiogroup" aria-label={`${label}时刻`}>
        {(["earlier", "later"] as const).map((choice, index) => {
          const candidate = candidates[index]
          if (!candidate) return null
          return (
            <Button
              key={choice}
              type="button"
              size="sm"
              variant={value === choice ? "secondary" : "outline"}
              role="radio"
              aria-checked={value === choice}
              className={cn(index === 1 && "border-l-0")}
              onClick={() => onValueChange(choice)}
            >
              {index === 0 ? "第一次" : "第二次"} ·{" "}
              {formatTimeZoneOffset(timeZone, candidate)}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function formatCallSheetHistoryTime(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))
}

type DraftRow<T> = T & { clientId: string }

type CallSheetEditDraft = {
  date: string
  title: string
  crewCall: string
  firstShot: string
  wrap: string
  location: string
  changeSummary: string
  departments: Array<DraftRow<CallSheet["departments"][number]>>
  equipment: Array<DraftRow<CallSheet["equipment"][number]>>
  safety: Array<DraftRow<CallSheet["safety"][number]>>
  transport: Array<DraftRow<CallSheet["transport"][number]>>
  catering: Array<DraftRow<CallSheet["catering"][number]>>
  keyContacts: Array<DraftRow<CallSheet["keyContacts"][number]>>
  nextDayPreview: CallSheet["nextDayPreview"]
}

function emptyNextDayPreview(): CallSheet["nextDayPreview"] {
  return { date: "", title: "", scenes: "", cast: "", note: "" }
}

function withDraftIds<T extends object>(rows: T[]): Array<DraftRow<T>> {
  return rows.map((row) => ({ ...row, clientId: crypto.randomUUID() }))
}

function CallSheetRowsEditor<T extends { clientId: string }>({
  title,
  addLabel,
  rows,
  columns,
  maxItems,
  onChange,
}: {
  title: string
  addLabel: string
  rows: T[]
  columns: Array<{ key: Exclude<keyof T, "clientId"> & string; label: string }>
  maxItems: number
  onChange: (rows: T[]) => void
}) {
  return (
    <section className="border border-border">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3">
        <h3 className="text-xs font-semibold">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={rows.length >= maxItems}
          onClick={() =>
            onChange([
              ...rows,
              {
                clientId: crypto.randomUUID(),
                ...Object.fromEntries(columns.map(({ key }) => [key, ""])),
              } as T,
            ])
          }
        >
          <Plus />
          {addLabel}
        </Button>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[680px] divide-y divide-border">
            {rows.map((row, rowIndex) => (
              <div
                key={row.clientId}
                className="grid gap-2 p-2"
                style={{
                  gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr)) 44px`,
                }}
              >
                {columns.map(({ key, label }) => (
                  <Input
                    key={key}
                    aria-label={`${title} ${rowIndex + 1} ${label}`}
                    placeholder={label}
                    value={String(row[key] ?? "")}
                    onChange={(event) =>
                      onChange(
                        rows.map((entry, index) =>
                          index === rowIndex
                            ? ({ ...entry, [key]: event.target.value } as T)
                            : entry,
                        ),
                      )
                    }
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`删除${title}第 ${rowIndex + 1} 行`}
                  title="删除"
                  onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="px-3 py-4 text-xs text-muted-foreground">暂无记录</p>
      )}
    </section>
  )
}

export function ProductionSchedule({ project }: { project: WorkspaceScopedProject }) {
  const projectId = project.id
  const queryClient = useQueryClient()
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const [tab, setTab] = useState("execution")
  const [shootingDayId, setShootingDayId] = useState("")
  const [callSheetId, setCallSheetId] = useState("")
  const [message, setMessage] = useState("")
  const [displayTimezone, setDisplayTimezone] = useState(browserTimezone)
  const [executionOpen, setExecutionOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<ExecutionStage | null>(null)
  const [executionDraft, setExecutionDraft] = useState<ExecutionDraft>(() =>
    emptyExecutionDraft(browserTimezone),
  )
  const [executionFormError, setExecutionFormError] = useState("")
  const [shootingDayOpen, setShootingDayOpen] = useState(false)
  const [editingShootingDay, setEditingShootingDay] = useState<ShootingDay | null>(null)
  const [shootingDayDraft, setShootingDayDraft] = useState<ShootingDayDraft>(() =>
    emptyShootingDayDraft(browserTimezone),
  )
  const [shootingDayFormError, setShootingDayFormError] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishKey, setPublishKey] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [draftCallSheet, setDraftCallSheet] = useState({ title: "" })
  const [editDraft, setEditDraft] = useState<CallSheetEditDraft>({
    date: "",
    title: "",
    crewCall: "",
    firstShot: "",
    wrap: "",
    location: "",
    changeSummary: "",
    departments: [],
    equipment: [],
    safety: [],
    transport: [],
    catering: [],
    keyContacts: [],
    nextDayPreview: emptyNextDayPreview(),
  })
  const callSheetQuery = useQuery({
    queryKey: ["production-call-sheets", projectId],
    queryFn: () => productionApi.listCallSheets(projectId),
  })
  const shootingDayQuery = useQuery({
    queryKey: ["production-shooting-days", projectId],
    queryFn: () => productionApi.listShootingDays(projectId),
  })
  const executionQuery = useQuery({
    queryKey: ["production-execution-schedule", projectId],
    queryFn: () => productionApi.listExecutionSchedule(projectId),
  })
  const executionItems = executionQuery.data?.items ?? []
  const executionConflicts = executionQuery.data?.conflicts ?? []
  const executionConflictGroups = executionResourceTypes
    .map((resourceType) => ({
      ...resourceType,
      conflicts: executionConflicts.filter(
        (conflict) => conflict.resource.type === resourceType.type,
      ),
    }))
    .filter((group) => group.conflicts.length)
  const startsLocalCandidates = zonedLocalCandidates(
    executionDraft.startsLocal,
    executionDraft.originalTimezone,
  )
  const endsLocalCandidates = zonedLocalCandidates(
    executionDraft.endsLocal,
    executionDraft.originalTimezone,
  )
  const overallProgress = executionItems.length
    ? Math.round(
        executionItems.reduce((total, item) => total + item.progress, 0) /
          executionItems.length,
      )
    : 0
  const activeStage = executionItems.find((item) => item.state === "进行中") ?? null
  const nextStage = executionItems.find((item) => item.state === "未开始") ?? null
  const callSheetItems = callSheetQuery.data?.items ?? []
  const shootingDayItems = shootingDayQuery.data?.items ?? []
  const legacyCallSheetItems = callSheetItems.filter((item) => !item.shootingDayId)
  const activeShootingDayId =
    shootingDayId ||
    shootingDayItems[0]?.id ||
    (legacyCallSheetItems.length ? "legacy" : "")
  const selectedShootingDay =
    shootingDayItems.find((item) => item.id === activeShootingDayId) ?? null
  const visibleCallSheetItems = selectedShootingDay
    ? callSheetItems.filter((item) => item.shootingDayId === selectedShootingDay.id)
    : activeShootingDayId === "legacy"
      ? legacyCallSheetItems
      : []
  const selectedCallSheet =
    visibleCallSheetItems.find((item) => item.id === callSheetId) ??
    visibleCallSheetItems[0] ??
    null
  const historyQuery = useQuery({
    queryKey: ["production-call-sheet-history", projectId, selectedCallSheet?.id],
    queryFn: () =>
      productionApi.listCallSheetHistory(projectId, selectedCallSheet?.id ?? ""),
    enabled: historyOpen && Boolean(selectedCallSheet),
  })
  const callSheet: CallSheet = selectedCallSheet ?? {
    id: "",
    projectId,
    shootingDayId: selectedShootingDay?.id ?? null,
    date: selectedShootingDay?.shootDate ?? "未选择",
    day: selectedShootingDay ? `拍摄第 ${selectedShootingDay.dayNumber} 天` : "",
    title: selectedShootingDay?.title ?? "暂无通告表",
    status: "草稿",
    crewCall: "未设置",
    firstShot: "未设置",
    wrap: "未设置",
    weather: "未设置",
    sunrise: "未设置",
    sunset: "未设置",
    basecamp: "未设置",
    location: "未设置",
    hospital: "未设置",
    scenes: [],
    cast: [],
    departments: [],
    equipment: [],
    safety: [],
    transport: [],
    catering: [],
    keyContacts: [],
    nextDayPreview: emptyNextDayPreview(),
    revision: 1,
    updatedAt: "",
  }

  const notify = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(""), 1800)
  }

  const createMutation = useMutation({
    mutationFn: ({ shootingDayId, title }: { shootingDayId: string; title: string }) =>
      productionApi.createCallSheet(projectId, {
        shootingDayId,
        title,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<{ items: CallSheet[] }>(
        ["production-call-sheets", projectId],
        (current) => ({ items: [...(current?.items ?? []), item] }),
      )
      setCallSheetId(item.id)
      setDraftCallSheet({ title: "" })
      setCreateOpen(false)
      notify("通告表草稿已创建，已同步可用的制片信息")
    },
  })

  const shootingDayMutation = useMutation({
    mutationFn: async ({
      item,
      body,
    }: {
      item: ShootingDay | null
      body: Omit<UpdateShootingDayBody, "expectedRevision">
    }) => {
      if (item) {
        return productionApi.updateShootingDay(projectId, item.id, {
          ...body,
          expectedRevision: item.revision,
        })
      }
      const result = await productionApi.createShootingDay(projectId, {
        shootDate: body.shootDate ?? "",
        dayNumber: body.dayNumber ?? 0,
        title: body.title ?? "",
        originalTimezone: body.originalTimezone ?? browserTimezone,
        idempotencyKey: crypto.randomUUID(),
      })
      return result.item
    },
    onSuccess: (item) => {
      queryClient.setQueryData<{ items: ShootingDay[] }>(
        ["production-shooting-days", projectId],
        (current) => {
          const items = current?.items ?? []
          return {
            items: items.some((entry) => entry.id === item.id)
              ? items.map((entry) => (entry.id === item.id ? item : entry))
              : [...items, item].sort((left, right) =>
                  left.shootDate.localeCompare(right.shootDate),
                ),
          }
        },
      )
      setShootingDayId(item.id)
      setCallSheetId("")
      setShootingDayOpen(false)
      setEditingShootingDay(null)
      notify(item.revision === 1 ? "拍摄日已创建" : "拍摄日已保存")
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: UpdateCallSheetBody }) =>
      productionApi.updateCallSheet(projectId, itemId, body),
    onSuccess: (item) => {
      queryClient.setQueryData<{ items: CallSheet[] }>(
        ["production-call-sheets", projectId],
        (current) => ({
          items: (current?.items ?? []).map((entry) =>
            entry.id === item.id ? item : entry,
          ),
        }),
      )
      void queryClient.invalidateQueries({
        queryKey: ["production-call-sheet-history", projectId, item.id],
      })
      setEditOpen(false)
      notify("通告表已保存")
    },
  })

  const publishMutation = useMutation({
    mutationFn: (item: CallSheet) =>
      productionApi.publishCallSheet(projectId, item.id, {
        expectedRevision: item.revision,
        idempotencyKey: publishKey,
      }),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<{ items: CallSheet[] }>(
        ["production-call-sheets", projectId],
        (current) => ({
          items: (current?.items ?? []).map((entry) =>
            entry.id === item.id ? item : entry,
          ),
        }),
      )
      void queryClient.invalidateQueries({
        queryKey: ["production-call-sheet-history", projectId, item.id],
      })
      setPublishOpen(false)
      notify("通告表已正式发布")
    },
  })

  const acknowledgeRecipientMutation = useMutation({
    mutationFn: (notificationId: string) =>
      workspaceApi.updateNotification(project.teamId, notificationId, {
        action: "acknowledge",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["production-call-sheet-history", projectId, selectedCallSheet?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["workspace-notifications", project.teamId],
        }),
      ])
      notify("通告已确认")
    },
  })

  const executionMutation = useMutation({
    mutationFn: async ({
      stage,
      body,
    }: {
      stage: ExecutionStage | null
      body: Omit<CreateExecutionStageBody, "idempotencyKey">
    }) => {
      if (stage) {
        return productionApi.updateExecutionStage(projectId, stage.id, {
          ...body,
          expectedRevision: stage.revision,
        } satisfies UpdateExecutionStageBody)
      }
      const result = await productionApi.createExecutionStage(projectId, {
        ...body,
        idempotencyKey: crypto.randomUUID(),
      })
      return result.item
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["production-execution-schedule", projectId],
      })
      setExecutionOpen(false)
      setEditingStage(null)
      notify(result.revision === 1 ? "执行阶段已创建" : "执行阶段已保存")
    },
  })

  const openExecutionEditor = (stage: ExecutionStage | null) => {
    setEditingStage(stage)
    setExecutionDraft(
      stage ? executionDraftFromStage(stage) : emptyExecutionDraft(browserTimezone),
    )
    setExecutionFormError("")
    executionMutation.reset()
    setExecutionOpen(true)
  }

  const saveExecutionStage = () => {
    setExecutionFormError("")
    try {
      const progress = Number(executionDraft.progress)
      if (
        !executionDraft.name.trim() ||
        !executionDraft.owner.trim() ||
        !Number.isInteger(progress) ||
        progress < 0 ||
        progress > 100
      ) {
        throw new Error("请填写阶段名称、负责人和 0 至 100 的整数进度")
      }
      executionMutation.mutate({
        stage: editingStage,
        body: {
          name: executionDraft.name.trim(),
          startsAt: zonedLocalToIso(
            executionDraft.startsLocal,
            executionDraft.originalTimezone,
            executionDraft.startsDisambiguation ?? undefined,
          ),
          endsAt: zonedLocalToIso(
            executionDraft.endsLocal,
            executionDraft.originalTimezone,
            executionDraft.endsDisambiguation ?? undefined,
          ),
          originalTimezone: executionDraft.originalTimezone,
          progress,
          owner: executionDraft.owner.trim(),
          state: executionDraft.state,
          note: executionDraft.note.trim(),
          resources: executionResourcesFromNames(
            executionDraft.resources,
            editingStage?.resources,
          ),
        },
      })
    } catch (error) {
      setExecutionFormError(error instanceof Error ? error.message : "无法保存执行阶段")
    }
  }

  const openShootingDayEditor = (item: ShootingDay | null) => {
    setEditingShootingDay(item)
    setShootingDayDraft(
      item ? shootingDayDraftFromItem(item) : emptyShootingDayDraft(browserTimezone),
    )
    setShootingDayFormError("")
    shootingDayMutation.reset()
    setShootingDayOpen(true)
  }

  const saveShootingDay = () => {
    const dayNumber = Number(shootingDayDraft.dayNumber)
    if (
      !shootingDayDraft.shootDate ||
      !shootingDayDraft.title.trim() ||
      !Number.isInteger(dayNumber) ||
      dayNumber < 1
    ) {
      setShootingDayFormError("请填写拍摄日期、标题和有效的拍摄日序号")
      return
    }
    setShootingDayFormError("")
    shootingDayMutation.mutate({
      item: editingShootingDay,
      body: {
        shootDate: shootingDayDraft.shootDate,
        dayNumber,
        title: shootingDayDraft.title.trim(),
        originalTimezone: shootingDayDraft.originalTimezone,
        ...(editingShootingDay ? { status: shootingDayDraft.status } : {}),
      },
    })
  }

  const createCallSheet = () => {
    if (!selectedShootingDay) return
    const title = draftCallSheet.title.trim()
    if (!title) return
    createMutation.mutate({ shootingDayId: selectedShootingDay.id, title })
  }

  const openCallSheetCreator = () => {
    if (!selectedShootingDay) return
    setDraftCallSheet({ title: selectedShootingDay.title })
    createMutation.reset()
    setCreateOpen(true)
  }

  const openCallSheetEditor = () => {
    if (!selectedCallSheet) return
    setEditDraft({
      date: selectedCallSheet.date,
      title: selectedCallSheet.title,
      crewCall: selectedCallSheet.crewCall,
      firstShot: selectedCallSheet.firstShot,
      wrap: selectedCallSheet.wrap,
      location: selectedCallSheet.location,
      changeSummary: "",
      departments: withDraftIds(selectedCallSheet.departments),
      equipment: withDraftIds(selectedCallSheet.equipment),
      safety: withDraftIds(selectedCallSheet.safety),
      transport: withDraftIds(selectedCallSheet.transport),
      catering: withDraftIds(selectedCallSheet.catering),
      keyContacts: withDraftIds(selectedCallSheet.keyContacts),
      nextDayPreview: structuredClone(selectedCallSheet.nextDayPreview),
    })
    setEditOpen(true)
  }

  const saveCallSheet = () => {
    if (!selectedCallSheet) return
    const title = editDraft.title.trim()
    const date = editDraft.date.trim()
    if (!title || !date) return
    updateMutation.mutate({
      itemId: selectedCallSheet.id,
      body: {
        date,
        title,
        crewCall: editDraft.crewCall.trim(),
        firstShot: editDraft.firstShot.trim(),
        wrap: editDraft.wrap.trim(),
        location: editDraft.location.trim(),
        departments: editDraft.departments
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            call: item.call.trim(),
            note: item.note.trim(),
          })),
        equipment: editDraft.equipment
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            quantity: item.quantity.trim(),
            source: item.source.trim(),
            note: item.note.trim(),
          })),
        safety: editDraft.safety
          .filter((item) => item.item.trim())
          .map((item) => ({
            level: item.level.trim(),
            item: item.item.trim(),
            owner: item.owner.trim(),
            action: item.action.trim(),
          })),
        transport: editDraft.transport
          .filter((item) => item.item.trim())
          .map((item) => ({
            item: item.item.trim(),
            time: item.time.trim(),
            route: item.route.trim(),
            owner: item.owner.trim(),
            note: item.note.trim(),
          })),
        catering: editDraft.catering
          .filter((item) => item.meal.trim())
          .map((item) => ({
            meal: item.meal.trim(),
            time: item.time.trim(),
            location: item.location.trim(),
            note: item.note.trim(),
          })),
        keyContacts: editDraft.keyContacts
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            role: item.role.trim(),
            phone: item.phone.trim(),
            note: item.note.trim(),
          })),
        nextDayPreview: Object.fromEntries(
          Object.entries(editDraft.nextDayPreview).map(([key, value]) => [
            key,
            value.trim(),
          ]),
        ) as CallSheet["nextDayPreview"],
        ...(selectedCallSheet.status === "已发布"
          ? { changeSummary: editDraft.changeSummary.trim() }
          : {}),
        expectedRevision: selectedCallSheet.revision,
      },
    })
  }

  const publishCallSheet = () => {
    if (!selectedCallSheet || selectedCallSheet.status === "已发布") return
    publishMutation.mutate(selectedCallSheet)
  }

  const openPublishConfirmation = () => {
    publishMutation.reset()
    setPublishKey(crypto.randomUUID())
    setPublishOpen(true)
  }

  const requestError =
    executionQuery.error ??
    executionMutation.error ??
    shootingDayQuery.error ??
    shootingDayMutation.error ??
    callSheetQuery.error ??
    createMutation.error ??
    updateMutation.error ??
    publishMutation.error
  const statusMessage = requestError instanceof Error ? requestError.message : message

  return (
    <PageFrame>
      <WorkspaceHeader
        title="拍摄与通告"
        description={`${project.name} · 项目整体执行与逐日现场安排`}
        actions={
          statusMessage ? (
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs",
                requestError ? "text-destructive" : "text-primary",
              )}
            >
              <CheckCircle2 className="size-3.5" />
              {statusMessage}
            </span>
          ) : null
        }
      />
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <div className="flex flex-wrap items-center gap-y-2 border-b border-border px-3 py-2">
          <TabsList>
            <TabsTrigger value="execution">执行计划</TabsTrigger>
            <TabsTrigger value="callsheets">通告表</TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center justify-end gap-2 max-sm:w-full max-sm:flex-wrap">
            {tab === "execution" ? (
              <>
                <TimezonePicker
                  value={displayTimezone}
                  onValueChange={setDisplayTimezone}
                  ariaLabel="切换执行计划显示时区"
                  align="end"
                  className="h-8 max-w-72"
                />
                <Button size="sm" onClick={() => openExecutionEditor(null)}>
                  <Plus />
                  新增阶段
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedShootingDay || shootingDayMutation.isPending}
                  onClick={() => openShootingDayEditor(selectedShootingDay)}
                >
                  <Pencil />
                  编辑拍摄日
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedCallSheet}
                  onClick={() => setHistoryOpen(true)}
                >
                  <History />
                  发布记录
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !selectedCallSheet ||
                    updateMutation.isPending ||
                    publishMutation.isPending
                  }
                  onClick={openCallSheetEditor}
                >
                  <Wrench />
                  编辑通告
                </Button>
                <Button
                  size="sm"
                  disabled={
                    !selectedCallSheet ||
                    selectedCallSheet.status === "已发布" ||
                    updateMutation.isPending ||
                    publishMutation.isPending
                  }
                  onClick={openPublishConfirmation}
                >
                  <Send />
                  {selectedCallSheet?.status === "已发布" ? "已发布" : "发布通告"}
                </Button>
                <Button
                  size="sm"
                  disabled={shootingDayMutation.isPending}
                  onClick={() => openShootingDayEditor(null)}
                >
                  <Plus />
                  新增拍摄日
                </Button>
              </>
            )}
          </div>
        </div>

        <TabsContent
          data-scroll-owner
          value="execution"
          className="min-h-0 overflow-y-auto overflow-x-hidden"
        >
          <div className="grid border-b border-border md:grid-cols-4">
            {[
              ["整体进度", `${overallProgress}%`, `${executionItems.length} 个阶段`],
              [
                "当前阶段",
                activeStage?.name ?? "暂无进行中阶段",
                activeStage ? formatExecutionRange(activeStage, displayTimezone) : "—",
              ],
              [
                "下一阶段",
                nextStage?.name ?? "暂无待开始阶段",
                nextStage ? formatExecutionRange(nextStage, displayTimezone) : "—",
              ],
              [
                "资源冲突",
                `${executionConflicts.length} 项`,
                executionConflicts[0]?.resource.name ?? "当前没有重叠占用",
              ],
            ].map(([label, value, detail]) => (
              <div
                key={label}
                className="border-r border-b border-border p-4 md:border-b-0"
              >
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-2 text-lg font-semibold">{value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
              </div>
            ))}
          </div>
          <SectionHeader
            title="项目执行阶段"
            detail={`按 ${displayTimezone} ${formatTimeZoneOffset(displayTimezone)} 显示 · 相邻时段不计为冲突`}
          />
          <div className="divide-y divide-border">
            {executionQuery.isLoading ? (
              <div className="p-4 text-xs text-muted-foreground">正在载入执行计划…</div>
            ) : null}
            {executionQuery.isError ? (
              <div className="flex items-center justify-between gap-3 p-4" role="alert">
                <span className="text-xs text-destructive">
                  {executionQuery.error.message}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => executionQuery.refetch()}
                >
                  <RefreshCw />
                  重试
                </Button>
              </div>
            ) : null}
            {!executionQuery.isLoading &&
            !executionQuery.isError &&
            !executionItems.length ? (
              <div className="p-5 text-sm text-muted-foreground">
                还没有执行阶段，先建立项目的第一段时间计划。
              </div>
            ) : null}
            <AnimatePresence initial={false} mode="popLayout">
              {executionItems.map((stage, index) => (
                <motion.div
                  layout
                  key={stage.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, delay: index * 0.04 }}
                  className="grid gap-4 p-4 lg:grid-cols-[190px_minmax(0,1fr)_180px]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "grid size-6 place-items-center border text-xs font-semibold",
                          stage.state === "已完成"
                            ? "border-positive/40 bg-positive/8 text-positive"
                            : stage.state === "进行中"
                              ? "border-primary/40 bg-primary/7 text-primary"
                              : "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <strong className="text-sm">{stage.name}</strong>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {formatExecutionRange(stage, displayTimezone)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatExecutionTimeContext(stage, displayTimezone)}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{stage.note}</span>
                      <span className="ml-4 font-medium">{stage.progress}%</span>
                    </div>
                    <div className="mt-3 h-1.5 bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${stage.progress}%` }}
                      />
                    </div>
                    {stage.resources.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {stage.resources.map((resource) => (
                          <span
                            key={`${resource.type}:${resource.id}`}
                            className="border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {resource.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 lg:justify-end">
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {stage.owner}
                    </span>
                    <StatusBadge
                      tone={
                        stage.state === "已完成"
                          ? "success"
                          : stage.state === "进行中"
                            ? "primary"
                            : "neutral"
                      }
                    >
                      {stage.state}
                    </StatusBadge>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`编辑${stage.name}`}
                      onClick={() => openExecutionEditor(stage)}
                    >
                      <Pencil />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="border-t border-border">
            <div className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="size-4 text-support" />
                资源冲突
              </div>
              {executionConflictGroups.length ? (
                <div className="mt-3 space-y-4">
                  {executionConflictGroups.map((group) => (
                    <section key={group.type} aria-labelledby={`conflicts-${group.type}`}>
                      <div
                        id={`conflicts-${group.type}`}
                        className="border-b border-border pb-1.5 text-xs font-semibold text-muted-foreground"
                      >
                        {group.label} · {group.conflicts.length}
                      </div>
                      <div className="divide-y divide-border">
                        {group.conflicts.map((conflict) => (
                          <div
                            key={conflict.key}
                            className="grid min-h-14 gap-2 py-2.5 text-xs sm:grid-cols-[160px_minmax(0,1fr)_200px_32px] sm:items-center"
                          >
                            <div className="font-medium">{conflict.resource.name}</div>
                            <div className="min-w-0 text-muted-foreground">
                              <span className="text-foreground">{conflict.itemName}</span>
                              {" 与 "}
                              <span>{conflict.conflictingItemName}</span>
                              {conflict.redacted
                                ? " · 跨项目，详情受权限保护"
                                : conflict.crossProject
                                  ? " · 跨项目"
                                  : ""}
                            </div>
                            <div className="text-muted-foreground">
                              重叠{" "}
                              {formatExecutionMoment(conflict.startsAt, displayTimezone)}{" "}
                              — {formatExecutionMoment(conflict.endsAt, displayTimezone)}
                            </div>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`编辑${conflict.itemName}`}
                              onClick={() => {
                                const item = executionItems.find(
                                  (candidate) => candidate.id === conflict.itemId,
                                )
                                if (item) openExecutionEditor(item)
                              }}
                            >
                              <Pencil />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  当前人员、场地和设备没有重叠占用。
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="callsheets" className="min-h-0">
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)]">
            <aside
              data-scroll-owner
              className="flex gap-1 overflow-x-auto border-b border-border p-2 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0"
            >
              <div className="hidden px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground lg:block">
                拍摄日
              </div>
              {shootingDayQuery.isLoading ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  正在载入拍摄日…
                </div>
              ) : null}
              {shootingDayQuery.isError ? (
                <div className="space-y-2 px-3 py-4 text-xs" role="alert">
                  <p className="text-destructive">{shootingDayQuery.error.message}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void shootingDayQuery.refetch()}
                  >
                    <RefreshCw />
                    重新载入
                  </Button>
                </div>
              ) : null}
              {!shootingDayQuery.isLoading &&
              !shootingDayQuery.isError &&
              !shootingDayItems.length ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  还没有拍摄日
                </div>
              ) : null}
              {shootingDayItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={activeShootingDayId === item.id ? "true" : undefined}
                  onClick={() => {
                    setShootingDayId(item.id)
                    setCallSheetId("")
                  }}
                  className={cn(
                    "min-h-20 min-w-48 border-l-2 p-3 text-left lg:min-w-0",
                    activeShootingDayId === item.id
                      ? "border-primary bg-primary/7"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{item.shootDate}</span>
                    <StatusBadge tone={shootingDayTone(item.status)}>
                      {item.status}
                    </StatusBadge>
                  </div>
                  <div className="mt-1 truncate text-sm">{item.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    拍摄第 {item.dayNumber} 天
                  </div>
                </button>
              ))}
              {legacyCallSheetItems.length ? (
                <div className="contents lg:block lg:border-t lg:border-border lg:pt-2">
                  <div className="hidden px-3 pb-1 text-xs font-semibold text-muted-foreground lg:block">
                    历史未归档
                  </div>
                  {legacyCallSheetItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={
                        activeShootingDayId === "legacy" &&
                        selectedCallSheet?.id === item.id
                          ? "true"
                          : undefined
                      }
                      onClick={() => {
                        setShootingDayId("legacy")
                        setCallSheetId(item.id)
                      }}
                      className={cn(
                        "min-h-16 min-w-48 border-l-2 p-3 text-left lg:min-w-0",
                        activeShootingDayId === "legacy" &&
                          selectedCallSheet?.id === item.id
                          ? "border-primary bg-primary/7"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <div className="text-xs font-semibold">{item.date}</div>
                      <div className="mt-1 truncate text-sm">{item.title}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="min-w-36 lg:min-w-0"
                disabled={!selectedShootingDay || createMutation.isPending}
                onClick={openCallSheetCreator}
              >
                <Plus />
                新建通告表
              </Button>
            </aside>

            <article
              data-scroll-owner
              className="min-h-0 overflow-y-auto overflow-x-hidden bg-muted/20 p-3 sm:p-5"
            >
              {visibleCallSheetItems.length > 1 ? (
                <div className="mx-auto mb-3 flex max-w-5xl items-center gap-2 overflow-x-auto border-b border-border pb-2">
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    当日通告
                  </span>
                  {visibleCallSheetItems.map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      variant={selectedCallSheet?.id === item.id ? "secondary" : "ghost"}
                      onClick={() => setCallSheetId(item.id)}
                    >
                      <FileText />
                      {item.title}
                    </Button>
                  ))}
                </div>
              ) : null}
              {callSheetQuery.isError ? (
                <div
                  className="mx-auto flex max-w-5xl items-center justify-between gap-3 py-8"
                  role="alert"
                >
                  <p className="text-sm text-destructive">
                    {callSheetQuery.error.message}
                  </p>
                  <Button variant="outline" onClick={() => void callSheetQuery.refetch()}>
                    <RefreshCw />
                    重新载入
                  </Button>
                </div>
              ) : !selectedCallSheet ? (
                <div className="mx-auto grid min-h-72 max-w-5xl place-items-center">
                  <div className="max-w-sm text-center">
                    <CalendarClock className="mx-auto size-6 text-muted-foreground" />
                    <h2 className="mt-3 text-base font-semibold">
                      {selectedShootingDay ? "这个拍摄日还没有通告表" : "先建立拍摄日"}
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {selectedShootingDay
                        ? `${selectedShootingDay.shootDate} · 拍摄第 ${selectedShootingDay.dayNumber} 天`
                        : "拍摄日负责日期、序号和状态，通告表保存当天的版本化现场安排。"}
                    </p>
                    <Button
                      className="mt-4"
                      onClick={
                        selectedShootingDay
                          ? openCallSheetCreator
                          : () => openShootingDayEditor(null)
                      }
                    >
                      <Plus />
                      {selectedShootingDay ? "创建通告表" : "新增拍摄日"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-5xl border border-border bg-background">
                  <header className="grid gap-4 border-b-2 border-foreground p-4 sm:grid-cols-[1fr_auto]">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">
                        CALL SHEET
                      </div>
                      <h2 className="mt-2 text-xl font-bold">{project.name}</h2>
                      <div className="mt-1 text-sm">{callSheet.title}</div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-base font-semibold">
                        {callSheet.date} · {callSheet.day}
                      </div>
                      <StatusBadge
                        tone={callSheet.status === "已发布" ? "success" : "warning"}
                      >
                        {callSheet.status}
                      </StatusBadge>
                    </div>
                  </header>

                  <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
                    {[
                      ["全组集合", callSheet.crewCall],
                      ["开拍", callSheet.firstShot],
                      ["预计收工", callSheet.wrap],
                      ["天气", callSheet.weather],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="border-r border-b border-border p-3 last:border-r-0 sm:border-b-0"
                      >
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="mt-1 text-sm font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid border-b border-border sm:grid-cols-2">
                    <div className="border-r border-border p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <MapPin className="size-3.5 text-primary" />
                        地点与基地
                      </div>
                      <dl className="mt-2 grid grid-cols-[70px_1fr] gap-y-1 text-xs">
                        <dt className="text-muted-foreground">拍摄地</dt>
                        <dd>{callSheet.location}</dd>
                        <dt className="text-muted-foreground">基地</dt>
                        <dd>{callSheet.basecamp}</dd>
                        <dt className="text-muted-foreground">医院</dt>
                        <dd>{callSheet.hospital}</dd>
                      </dl>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Clock3 className="size-3.5 text-primary" />
                        日光
                      </div>
                      <dl className="mt-2 grid grid-cols-[70px_1fr] gap-y-1 text-xs">
                        <dt className="text-muted-foreground">日出</dt>
                        <dd>{callSheet.sunrise}</dd>
                        <dt className="text-muted-foreground">日落</dt>
                        <dd>{callSheet.sunset}</dd>
                      </dl>
                    </div>
                  </div>

                  <SectionHeader
                    title="场次安排"
                    detail="Hollywood-style scene schedule"
                  />
                  <DataTableViewport label="通告表场次安排">
                    <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-xs">
                      <caption className="sr-only">通告表场次安排</caption>
                      <colgroup>
                        <col className="w-[70px]" />
                        <col className="w-[160px]" />
                        <col className="w-[70px]" />
                        <col />
                        <col className="w-[80px]" />
                      </colgroup>
                      <thead>
                        <tr className="h-9 border-b border-border bg-muted/35 text-xs font-semibold">
                          <th scope="col" className="px-3">
                            场次
                          </th>
                          <th scope="col" className="px-3">
                            场景
                          </th>
                          <th scope="col" className="px-3">
                            页数
                          </th>
                          <th scope="col" className="px-3">
                            内容
                          </th>
                          <th scope="col" className="px-3">
                            演员
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {callSheet.scenes.map((scene) => (
                          <tr key={scene.scene} className="h-14 border-b border-border">
                            <th scope="row" className="px-3 font-semibold">
                              {scene.scene}
                            </th>
                            <td className="px-3">{scene.set}</td>
                            <td className="px-3">{scene.pages}</td>
                            <td className="px-3 text-muted-foreground">
                              {scene.description}
                            </td>
                            <td className="px-3">{scene.cast}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableViewport>

                  <SectionHeader title="演员到场" />
                  <DataTableViewport label="通告表演员到场安排">
                    <table className="w-full min-w-[620px] table-fixed border-collapse text-left text-xs">
                      <caption className="sr-only">通告表演员到场安排</caption>
                      <colgroup>
                        <col />
                        <col />
                        <col className="w-[100px]" />
                        <col className="w-[100px]" />
                        <col className="w-[100px]" />
                      </colgroup>
                      <thead>
                        <tr className="h-9 border-b border-border bg-muted/35 text-xs font-semibold">
                          <th scope="col" className="px-3">
                            演员
                          </th>
                          <th scope="col" className="px-3">
                            角色
                          </th>
                          <th scope="col" className="px-3">
                            接送
                          </th>
                          <th scope="col" className="px-3">
                            妆发
                          </th>
                          <th scope="col" className="px-3">
                            到场
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {callSheet.cast.map((cast) => (
                          <tr key={cast.name} className="h-12 border-b border-border">
                            <th scope="row" className="px-3 font-semibold">
                              {cast.name}
                            </th>
                            <td className="px-3">{cast.role}</td>
                            <td className="px-3">{cast.pickup}</td>
                            <td className="px-3">{cast.makeup}</td>
                            <td className="px-3">{cast.set}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableViewport>

                  <SectionHeader title="部门集合与特殊器材" />
                  <div className="grid border-b border-border lg:grid-cols-2">
                    <div className="border-b border-border p-4 lg:border-r lg:border-b-0">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Clock3 className="size-3.5 text-primary" />
                        部门集合
                      </div>
                      {callSheet.departments.length ? (
                        <div className="mt-3 divide-y divide-border border-t border-border">
                          {callSheet.departments.map((department) => (
                            <div
                              key={`${department.name}-${department.call}`}
                              className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2 text-xs"
                            >
                              <span className="font-medium">{department.name}</span>
                              <span>{department.call || "待定"}</span>
                              <span className="col-span-2 text-muted-foreground">
                                {department.note || "无备注"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">
                          暂无部门集合安排
                        </p>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Wrench className="size-3.5 text-primary" />
                        特殊器材
                      </div>
                      {callSheet.equipment.length ? (
                        <div className="mt-3 divide-y divide-border border-t border-border">
                          {callSheet.equipment.map((equipment) => (
                            <div
                              key={`${equipment.name}-${equipment.quantity}`}
                              className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2 text-xs"
                            >
                              <span className="font-medium">{equipment.name}</span>
                              <span>{equipment.quantity || "数量待定"}</span>
                              <span className="col-span-2 text-muted-foreground">
                                {[equipment.source, equipment.note]
                                  .filter(Boolean)
                                  .join(" · ") || "来源待定"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">暂无特殊器材</p>
                      )}
                    </div>
                  </div>

                  <div className="grid border-b border-border lg:grid-cols-3">
                    <div className="border-b border-border p-4 lg:border-r lg:border-b-0">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <ShieldAlert className="size-3.5 text-destructive" />
                        安全事项
                      </div>
                      {callSheet.safety.length ? (
                        <div className="mt-3 space-y-3">
                          {callSheet.safety.map((safety) => (
                            <div
                              key={`${safety.item}-${safety.owner}`}
                              className="text-xs"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span className="font-medium">{safety.item}</span>
                                <span className="text-muted-foreground">
                                  {safety.level || "未分级"}
                                </span>
                              </div>
                              <p className="mt-1 leading-5 text-muted-foreground">
                                {safety.action || "处置要求待定"}
                              </p>
                              {safety.owner ? (
                                <p className="mt-1">负责：{safety.owner}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">暂无安全事项</p>
                      )}
                    </div>
                    <div className="border-b border-border p-4 lg:border-r lg:border-b-0">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Truck className="size-3.5 text-primary" />
                        交通安排
                      </div>
                      {callSheet.transport.length ? (
                        <div className="mt-3 space-y-3">
                          {callSheet.transport.map((transport) => (
                            <div
                              key={`${transport.item}-${transport.time}`}
                              className="text-xs"
                            >
                              <div className="flex justify-between gap-3 font-medium">
                                <span>{transport.item}</span>
                                <span>{transport.time || "待定"}</span>
                              </div>
                              <p className="mt-1 leading-5 text-muted-foreground">
                                {[transport.route, transport.owner, transport.note]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">暂无交通安排</p>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <ClipboardCheck className="size-3.5 text-primary" />
                        餐饮安排
                      </div>
                      {callSheet.catering.length ? (
                        <div className="mt-3 space-y-3">
                          {callSheet.catering.map((meal) => (
                            <div key={`${meal.meal}-${meal.time}`} className="text-xs">
                              <div className="flex justify-between gap-3 font-medium">
                                <span>{meal.meal}</span>
                                <span>{meal.time || "待定"}</span>
                              </div>
                              <p className="mt-1 leading-5 text-muted-foreground">
                                {[meal.location, meal.note].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">暂无餐饮安排</p>
                      )}
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-2">
                    <div className="border-b border-border p-4 lg:border-r lg:border-b-0">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Phone className="size-3.5 text-primary" />
                        关键联系人
                      </div>
                      {callSheet.keyContacts.length ? (
                        <div className="mt-3 divide-y divide-border border-t border-border">
                          {callSheet.keyContacts.map((contact) => (
                            <div
                              key={`${contact.name}-${contact.phone}`}
                              className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2 text-xs"
                            >
                              <span className="font-medium">
                                {contact.name} · {contact.role || "未设置职责"}
                              </span>
                              <span>{contact.phone || "电话待定"}</span>
                              {contact.note ? (
                                <span className="col-span-2 text-muted-foreground">
                                  {contact.note}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">
                          暂无关键联系人
                        </p>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <CalendarClock className="size-3.5 text-primary" />
                        次日预告
                      </div>
                      {Object.values(callSheet.nextDayPreview).some(Boolean) ? (
                        <dl className="mt-3 grid grid-cols-[72px_1fr] gap-y-2 text-xs">
                          <dt className="text-muted-foreground">日期</dt>
                          <dd>{callSheet.nextDayPreview.date || "待定"}</dd>
                          <dt className="text-muted-foreground">内容</dt>
                          <dd>{callSheet.nextDayPreview.title || "待定"}</dd>
                          <dt className="text-muted-foreground">场次 / 演员</dt>
                          <dd>
                            {[
                              callSheet.nextDayPreview.scenes,
                              callSheet.nextDayPreview.cast,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "待定"}
                          </dd>
                          <dt className="text-muted-foreground">备注</dt>
                          <dd>{callSheet.nextDayPreview.note || "无"}</dd>
                        </dl>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">暂无次日预告</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </article>
          </div>
        </TabsContent>
      </Tabs>
      <Dialog
        open={executionOpen}
        onOpenChange={(open) => {
          if (executionMutation.isPending) return
          setExecutionOpen(open)
          if (!open) setEditingStage(null)
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingStage ? "编辑执行阶段" : "新增执行阶段"}</DialogTitle>
            <DialogDescription>
              {project.name} · 时间统一存储并按所选时区显示
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="execution-stage-name" className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium">阶段名称</span>
              <Input
                id="execution-stage-name"
                value={executionDraft.name}
                onChange={(event) =>
                  setExecutionDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label htmlFor="execution-stage-start" className="space-y-1.5">
              <span className="text-xs font-medium">开始时间</span>
              <Input
                id="execution-stage-start"
                type="datetime-local"
                value={executionDraft.startsLocal}
                onChange={(event) =>
                  setExecutionDraft((current) => ({
                    ...current,
                    startsLocal: event.target.value,
                    startsDisambiguation: null,
                  }))
                }
              />
            </label>
            <label htmlFor="execution-stage-end" className="space-y-1.5">
              <span className="text-xs font-medium">结束时间</span>
              <Input
                id="execution-stage-end"
                type="datetime-local"
                value={executionDraft.endsLocal}
                onChange={(event) =>
                  setExecutionDraft((current) => ({
                    ...current,
                    endsLocal: event.target.value,
                    endsDisambiguation: null,
                  }))
                }
              />
            </label>
            <AmbiguousTimeChoice
              label="开始时间"
              candidates={startsLocalCandidates}
              timeZone={executionDraft.originalTimezone}
              value={executionDraft.startsDisambiguation}
              onValueChange={(startsDisambiguation) =>
                setExecutionDraft((current) => ({ ...current, startsDisambiguation }))
              }
            />
            <AmbiguousTimeChoice
              label="结束时间"
              candidates={endsLocalCandidates}
              timeZone={executionDraft.originalTimezone}
              value={executionDraft.endsDisambiguation}
              onValueChange={(endsDisambiguation) =>
                setExecutionDraft((current) => ({ ...current, endsDisambiguation }))
              }
            />
            <div className="space-y-1.5">
              <div className="text-xs font-medium">原始时区</div>
              <TimezonePicker
                value={executionDraft.originalTimezone}
                ariaLabel="选择执行阶段原始时区"
                className="w-full"
                onValueChange={(originalTimezone) =>
                  setExecutionDraft((current) => ({
                    ...current,
                    originalTimezone,
                    startsDisambiguation: null,
                    endsDisambiguation: null,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium">阶段状态</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="w-full justify-between" variant="outline">
                    {executionDraft.state}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  <DropdownMenuRadioGroup
                    value={executionDraft.state}
                    onValueChange={(state) =>
                      setExecutionDraft((current) => ({
                        ...current,
                        state: state as ExecutionStage["state"],
                      }))
                    }
                  >
                    {executionStates.map((state) => (
                      <DropdownMenuRadioItem key={state} value={state}>
                        {state}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <label htmlFor="execution-stage-owner" className="space-y-1.5">
              <span className="text-xs font-medium">负责人</span>
              <Input
                id="execution-stage-owner"
                value={executionDraft.owner}
                onChange={(event) =>
                  setExecutionDraft((current) => ({
                    ...current,
                    owner: event.target.value,
                  }))
                }
              />
            </label>
            <label htmlFor="execution-stage-progress" className="space-y-1.5">
              <span className="text-xs font-medium">完成进度</span>
              <Input
                id="execution-stage-progress"
                type="number"
                min={0}
                max={100}
                step={1}
                value={executionDraft.progress}
                onChange={(event) =>
                  setExecutionDraft((current) => ({
                    ...current,
                    progress: event.target.value,
                  }))
                }
              />
            </label>
            {executionResourceTypes.map((resource) => (
              <label
                key={resource.type}
                htmlFor={`execution-stage-resource-${resource.type}`}
                className="space-y-1.5"
              >
                <span className="text-xs font-medium">{resource.label}</span>
                <Input
                  id={`execution-stage-resource-${resource.type}`}
                  placeholder={resource.placeholder}
                  value={executionDraft.resources[resource.type]}
                  onChange={(event) =>
                    setExecutionDraft((current) => ({
                      ...current,
                      resources: {
                        ...current.resources,
                        [resource.type]: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            ))}
            <label htmlFor="execution-stage-note" className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium">执行备注</span>
              <Textarea
                id="execution-stage-note"
                className="min-h-24"
                value={executionDraft.note}
                onChange={(event) =>
                  setExecutionDraft((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          {executionFormError || executionMutation.isError ? (
            <p className="text-xs text-destructive" role="alert">
              {executionFormError || executionMutation.error?.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={executionMutation.isPending}
              onClick={() => setExecutionOpen(false)}
            >
              取消
            </Button>
            <Button disabled={executionMutation.isPending} onClick={saveExecutionStage}>
              <CalendarClock />
              {executionMutation.isPending ? "正在保存" : "保存阶段"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={shootingDayOpen}
        onOpenChange={(open) => {
          if (shootingDayMutation.isPending) return
          setShootingDayOpen(open)
          if (!open) setEditingShootingDay(null)
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingShootingDay ? "编辑拍摄日" : "新增拍摄日"}</DialogTitle>
            <DialogDescription>{project.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="shooting-day-date" className="space-y-1.5">
              <span className="text-xs font-medium">拍摄日期</span>
              <Input
                id="shooting-day-date"
                type="date"
                value={shootingDayDraft.shootDate}
                onChange={(event) =>
                  setShootingDayDraft((current) => ({
                    ...current,
                    shootDate: event.target.value,
                  }))
                }
              />
            </label>
            <label htmlFor="shooting-day-number" className="space-y-1.5">
              <span className="text-xs font-medium">拍摄日序号</span>
              <Input
                id="shooting-day-number"
                type="number"
                min={1}
                max={9999}
                step={1}
                value={shootingDayDraft.dayNumber}
                onChange={(event) =>
                  setShootingDayDraft((current) => ({
                    ...current,
                    dayNumber: event.target.value,
                  }))
                }
              />
            </label>
            <label htmlFor="shooting-day-title" className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium">当日主题</span>
              <Input
                id="shooting-day-title"
                value={shootingDayDraft.title}
                onChange={(event) =>
                  setShootingDayDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <div className="space-y-1.5">
              <div className="text-xs font-medium">原始时区</div>
              <TimezonePicker
                value={shootingDayDraft.originalTimezone}
                ariaLabel="选择拍摄日原始时区"
                className="w-full"
                onValueChange={(originalTimezone) =>
                  setShootingDayDraft((current) => ({
                    ...current,
                    originalTimezone,
                  }))
                }
              />
            </div>
            {editingShootingDay ? (
              <div className="space-y-1.5">
                <div className="text-xs font-medium">执行状态</div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="w-full justify-between" variant="outline">
                      {shootingDayDraft.status}
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    <DropdownMenuRadioGroup
                      value={shootingDayDraft.status}
                      onValueChange={(status) =>
                        setShootingDayDraft((current) => ({
                          ...current,
                          status: status as ShootingDay["status"],
                        }))
                      }
                    >
                      {shootingDayStatuses.map((status) => (
                        <DropdownMenuRadioItem key={status} value={status}>
                          {status}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
          {shootingDayFormError || shootingDayMutation.isError ? (
            <p className="text-xs text-destructive" role="alert">
              {shootingDayFormError || shootingDayMutation.error?.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={shootingDayMutation.isPending}
              onClick={() => setShootingDayOpen(false)}
            >
              取消
            </Button>
            <Button disabled={shootingDayMutation.isPending} onClick={saveShootingDay}>
              <CalendarClock />
              {shootingDayMutation.isPending ? "正在保存" : "保存拍摄日"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[min(720px,calc(100svh-2rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建通告表</DialogTitle>
            <DialogDescription>
              {selectedShootingDay?.shootDate} · 拍摄第 {selectedShootingDay?.dayNumber}{" "}
              天
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="call-sheet-title" className="space-y-1.5">
              <span className="text-xs font-medium">通告标题</span>
              <Input
                id="call-sheet-title"
                value={draftCallSheet.title}
                onChange={(event) =>
                  setDraftCallSheet((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            {createMutation.isError ? (
              <p className="text-xs text-destructive">{createMutation.error.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => setCreateOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={
                !draftCallSheet.title.trim() ||
                !selectedShootingDay ||
                createMutation.isPending
              }
              onClick={createCallSheet}
            >
              {createMutation.isPending ? "正在创建" : "创建草稿"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[min(820px,calc(100svh-2rem))] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>编辑通告表</DialogTitle>
            <DialogDescription>现场执行信息与发布版本</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="basic">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="basic">基础信息</TabsTrigger>
              <TabsTrigger value="production">制片执行</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="mt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label="通告日期"
                  placeholder="通告日期"
                  value={editDraft.date}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, date: event.target.value }))
                  }
                />
                <Input
                  aria-label="通告标题"
                  placeholder="通告标题"
                  value={editDraft.title}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <Input
                  aria-label="全组集合时间"
                  placeholder="全组集合"
                  value={editDraft.crewCall}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      crewCall: event.target.value,
                    }))
                  }
                />
                <Input
                  aria-label="开拍时间"
                  placeholder="开拍"
                  value={editDraft.firstShot}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      firstShot: event.target.value,
                    }))
                  }
                />
                <Input
                  aria-label="预计收工时间"
                  placeholder="预计收工"
                  value={editDraft.wrap}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, wrap: event.target.value }))
                  }
                />
                <Input
                  aria-label="拍摄地点"
                  placeholder="拍摄地点"
                  value={editDraft.location}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                />
              </div>
            </TabsContent>
            <TabsContent value="production" className="mt-3 space-y-3">
              <CallSheetRowsEditor
                title="部门集合"
                addLabel="添加部门"
                rows={editDraft.departments}
                columns={[
                  { key: "name", label: "部门" },
                  { key: "call", label: "集合时间" },
                  { key: "note", label: "备注" },
                ]}
                maxItems={40}
                onChange={(departments) =>
                  setEditDraft((current) => ({ ...current, departments }))
                }
              />
              <CallSheetRowsEditor
                title="特殊器材"
                addLabel="添加器材"
                rows={editDraft.equipment}
                columns={[
                  { key: "name", label: "器材" },
                  { key: "quantity", label: "数量" },
                  { key: "source", label: "来源" },
                  { key: "note", label: "备注" },
                ]}
                maxItems={100}
                onChange={(equipment) =>
                  setEditDraft((current) => ({ ...current, equipment }))
                }
              />
              <CallSheetRowsEditor
                title="安全事项"
                addLabel="添加事项"
                rows={editDraft.safety}
                columns={[
                  { key: "level", label: "等级" },
                  { key: "item", label: "风险事项" },
                  { key: "owner", label: "负责人" },
                  { key: "action", label: "处置要求" },
                ]}
                maxItems={50}
                onChange={(safety) => setEditDraft((current) => ({ ...current, safety }))}
              />
              <CallSheetRowsEditor
                title="交通安排"
                addLabel="添加交通"
                rows={editDraft.transport}
                columns={[
                  { key: "item", label: "项目" },
                  { key: "time", label: "时间" },
                  { key: "route", label: "路线" },
                  { key: "owner", label: "负责人" },
                  { key: "note", label: "备注" },
                ]}
                maxItems={50}
                onChange={(transport) =>
                  setEditDraft((current) => ({ ...current, transport }))
                }
              />
              <CallSheetRowsEditor
                title="餐饮安排"
                addLabel="添加餐饮"
                rows={editDraft.catering}
                columns={[
                  { key: "meal", label: "餐次" },
                  { key: "time", label: "时间" },
                  { key: "location", label: "地点" },
                  { key: "note", label: "备注" },
                ]}
                maxItems={20}
                onChange={(catering) =>
                  setEditDraft((current) => ({ ...current, catering }))
                }
              />
              <CallSheetRowsEditor
                title="关键联系人"
                addLabel="添加联系人"
                rows={editDraft.keyContacts}
                columns={[
                  { key: "name", label: "姓名" },
                  { key: "role", label: "职责" },
                  { key: "phone", label: "电话" },
                  { key: "note", label: "备注" },
                ]}
                maxItems={50}
                onChange={(keyContacts) =>
                  setEditDraft((current) => ({ ...current, keyContacts }))
                }
              />
              <section className="border border-border">
                <div className="flex min-h-10 items-center border-b border-border px-3">
                  <h3 className="text-xs font-semibold">次日预告</h3>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                  {(
                    [
                      ["date", "日期"],
                      ["title", "拍摄内容"],
                      ["scenes", "场次"],
                      ["cast", "演员"],
                      ["note", "备注"],
                    ] as const
                  ).map(([key, label]) => (
                    <Input
                      key={key}
                      className={key === "note" ? "sm:col-span-2" : undefined}
                      aria-label={`次日预告${label}`}
                      placeholder={label}
                      value={editDraft.nextDayPreview[key]}
                      onChange={(event) =>
                        setEditDraft((current) => ({
                          ...current,
                          nextDayPreview: {
                            ...current.nextDayPreview,
                            [key]: event.target.value,
                          },
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
            </TabsContent>
          </Tabs>
          {selectedCallSheet?.status === "已发布" ? (
            <Textarea
              aria-label="发布后变更摘要"
              placeholder="发布后变更摘要"
              value={editDraft.changeSummary}
              onChange={(event) =>
                setEditDraft((current) => ({
                  ...current,
                  changeSummary: event.target.value,
                }))
              }
            />
          ) : null}
          {updateMutation.isError ? (
            <p className="text-xs text-destructive">{updateMutation.error.message}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={updateMutation.isPending}
              onClick={() => setEditOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={
                !editDraft.date.trim() ||
                !editDraft.title.trim() ||
                (selectedCallSheet?.status === "已发布" &&
                  !editDraft.changeSummary.trim()) ||
                updateMutation.isPending
              }
              onClick={saveCallSheet}
            >
              {updateMutation.isPending ? "正在保存" : "保存通告"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认正式发布</DialogTitle>
            <DialogDescription>
              将“{selectedCallSheet?.title}
              ”保存为不可变正式版本。后续修改会回到待确认并生成变更记录。
            </DialogDescription>
          </DialogHeader>
          {publishMutation.isError ? (
            <p className="text-xs text-destructive" role="alert">
              {publishMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={publishMutation.isPending}
              onClick={() => setPublishOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={!selectedCallSheet || publishMutation.isPending}
              onClick={publishCallSheet}
            >
              <Send />
              {publishMutation.isPending ? "正在发布" : "确认发布"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[min(760px,calc(100svh-2rem))] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>发布记录</DialogTitle>
            <DialogDescription>{selectedCallSheet?.title}</DialogDescription>
          </DialogHeader>
          {historyQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">正在载入发布记录…</p>
          ) : null}
          {historyQuery.isError ? (
            <div className="flex items-center justify-between gap-3" role="alert">
              <p className="text-xs text-destructive">{historyQuery.error.message}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void historyQuery.refetch()}
              >
                <RefreshCw />
                重试
              </Button>
            </div>
          ) : null}
          {historyQuery.data ? (
            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-xs font-semibold">正式版本</h3>
                {historyQuery.data.publications.length ? (
                  <div className="border border-border">
                    {historyQuery.data.publications.map((publication) => {
                      const acknowledgedCount = publication.recipients.filter(
                        (recipient) => recipient.acknowledgedAt,
                      ).length
                      return (
                        <div
                          key={publication.id}
                          className="border-b border-border last:border-b-0"
                        >
                          <div className="flex items-start justify-between gap-4 p-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">
                                v{publication.version} · {publication.snapshot.title}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {publication.snapshot.date} · 修订{" "}
                                {publication.snapshot.revision}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                已送达 {publication.recipients.length} · 已确认{" "}
                                {acknowledgedCount}
                              </div>
                            </div>
                            <div className="shrink-0 text-right text-xs text-muted-foreground">
                              <div>{publication.publishedBy}</div>
                              <div className="mt-1">
                                {formatCallSheetHistoryTime(publication.publishedAt)}
                              </div>
                            </div>
                          </div>
                          {publication.recipients.length ? (
                            <div className="border-t border-border bg-muted/20 px-3">
                              {publication.recipients.map((recipient) => (
                                <div
                                  key={recipient.id}
                                  className="flex min-h-10 items-center gap-3 border-b border-border/70 py-2 last:border-b-0"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-medium">
                                      {recipient.displayName} · {recipient.projectRole}
                                    </div>
                                    {recipient.email ? (
                                      <div className="truncate text-xs text-muted-foreground">
                                        {recipient.email}
                                      </div>
                                    ) : null}
                                  </div>
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {recipient.acknowledgedAt ? "已确认" : "已送达"}
                                  </span>
                                  {recipient.canAcknowledge &&
                                  recipient.notificationId ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={acknowledgeRecipientMutation.isPending}
                                      onClick={() =>
                                        acknowledgeRecipientMutation.mutate(
                                          recipient.notificationId ?? "",
                                        )
                                      }
                                    >
                                      <Check />
                                      确认
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">尚未正式发布</p>
                )}
              </section>
              {acknowledgeRecipientMutation.isError ? (
                <p className="text-xs text-destructive" role="alert">
                  {acknowledgeRecipientMutation.error.message}
                </p>
              ) : null}
              <section>
                <h3 className="mb-2 text-xs font-semibold">发布后变更</h3>
                {historyQuery.data.changes.length ? (
                  <div className="border border-border">
                    {historyQuery.data.changes.map((change) => (
                      <div
                        key={change.id}
                        className="border-b border-border p-3 last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="text-sm font-medium">{change.summary}</div>
                          <div className="shrink-0 text-xs text-muted-foreground">
                            {formatCallSheetHistoryTime(change.changedAt)}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {change.changedBy} · 基于 v
                          {change.basePublicationVersion ?? "历史"} · “
                          {change.beforeSnapshot.title}” → “{change.afterSnapshot.title}”
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">没有发布后变更</p>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
