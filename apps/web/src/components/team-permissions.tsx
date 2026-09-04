"use client"

import type {
  PermissionCapability,
  PermissionTemplate,
  PermissionTemplateScope,
} from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Link2Off,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  EmptyState,
  PageBody,
  PageFrame,
  SectionHeader,
  StatusBadge,
  type StatusTone,
  WorkspaceHeader,
} from "@/components/workspace/page-elements"
import type { TeamId } from "@/components/workspace/workspace-data"
import { onboardingApi, workspaceApi } from "@/lib/api-client"
import {
  buildInvitationUrl,
  type CreatedInvitation,
  isOnboardingFeatureUnavailableError,
  onboardingErrorMessage,
  type TeamInvitationStatus,
} from "@/lib/onboarding"
import { cn } from "@/lib/utils"

const capabilityGroups: Record<
  PermissionTemplateScope,
  { capability: PermissionCapability; label: string; detail: string }[]
> = {
  team: [
    { capability: "team.read", label: "查看团队", detail: "访问团队工作区" },
    { capability: "team.write", label: "编辑团队", detail: "修改团队级工作项" },
    {
      capability: "team.permissions.manage",
      label: "管理权限",
      detail: "创建模板并调整成员权限",
    },
    { capability: "asset.write", label: "管理资源", detail: "上传、整理与归档资源" },
    {
      capability: "portfolio.write",
      label: "编辑作品集",
      detail: "组织作品集内容与展示",
    },
    {
      capability: "portfolio.publish",
      label: "发布作品集",
      detail: "公开发布或撤回作品集",
    },
  ],
  project: [
    { capability: "project.read", label: "查看项目", detail: "访问项目工作区" },
    { capability: "project.write", label: "编辑项目", detail: "修改项目基础信息" },
    { capability: "script.write", label: "编辑脚本", detail: "协作编辑脚本与分镜" },
    {
      capability: "production.write",
      label: "编辑制片",
      detail: "管理拆解、排期与通告",
    },
    {
      capability: "call_sheet.publish",
      label: "发布通告",
      detail: "正式发布每日通告表",
    },
    { capability: "review.write", label: "审片批注", detail: "添加和修改审片意见" },
    {
      capability: "review.manage",
      label: "审片管理",
      detail: "批准版本并管理客户审片",
    },
  ],
}

function requiredRead(scope: PermissionTemplateScope): PermissionCapability {
  return scope === "team" ? "team.read" : "project.read"
}

function CapabilityChecklist({
  idPrefix,
  scope,
  value,
  disabled,
  onChange,
}: {
  idPrefix: string
  scope: PermissionTemplateScope
  value: PermissionCapability[]
  disabled?: boolean
  onChange: (value: PermissionCapability[]) => void
}) {
  const required = requiredRead(scope)
  return (
    <div className="grid grid-cols-1 border-t border-l border-border sm:grid-cols-2">
      {capabilityGroups[scope].map((item) => {
        const checked = value.includes(item.capability)
        const locked = item.capability === required
        const checkboxId = `${idPrefix}-${scope}-${item.capability}`
        return (
          <label
            key={item.capability}
            htmlFor={checkboxId}
            className={cn(
              "flex min-h-16 cursor-pointer items-center gap-3 border-r border-b border-border px-3 py-2",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <Checkbox
              id={checkboxId}
              checked={checked}
              disabled={disabled || locked}
              onCheckedChange={(next) => {
                const updated = next
                  ? [...value, item.capability]
                  : value.filter((capability) => capability !== item.capability)
                onChange([...new Set(updated)])
              }}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                {item.label}
                {locked ? <LockKeyhole className="size-3 text-muted-foreground" /> : null}
              </span>
              <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                {item.detail}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

function TemplateSelect({
  label,
  templates,
  value,
  disabled,
  onChange,
}: {
  label: string
  templates: PermissionTemplate[]
  value: string | null
  disabled?: boolean
  onChange: (templateId: string) => void
}) {
  const selected = templates.find((template) => template.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          disabled={disabled}
          aria-label={label}
        >
          <span className="truncate">{selected?.name ?? "选择权限模板"}</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={onChange}>
          {templates.map((template) => (
            <DropdownMenuRadioItem key={template.id} value={template.id}>
              <span className="min-w-0 flex-1 truncate">{template.name}</span>
              {template.isSystem ? (
                <span className="text-xs text-muted-foreground">系统</span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TeamPermissions({ teamId }: { teamId: TeamId }) {
  const queryClient = useQueryClient()
  const queryKey = ["team-permissions", teamId] as const
  const permissionsQuery = useQuery({
    queryKey,
    queryFn: () => workspaceApi.getPermissions(teamId),
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [createScope, setCreateScope] = useState<PermissionTemplateScope>("team")
  const [createName, setCreateName] = useState("")
  const [createCapabilities, setCreateCapabilities] = useState<PermissionCapability[]>([
    "team.read",
  ])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [editName, setEditName] = useState("")
  const [editCapabilities, setEditCapabilities] = useState<PermissionCapability[]>([])

  const templates = permissionsQuery.data?.templates ?? []
  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ?? templates[0],
    [selectedTemplateId, templates],
  )

  useEffect(() => {
    if (!selectedTemplate) return
    setSelectedTemplateId(selectedTemplate.id)
    setEditName(selectedTemplate.name)
    setEditCapabilities([...selectedTemplate.permissions])
  }, [selectedTemplate])

  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const createMutation = useMutation({
    mutationFn: () =>
      workspaceApi.createPermissionTemplate(teamId, {
        scope: createScope,
        name: createName,
        permissions: createCapabilities,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async ({ item }) => {
      setCreateOpen(false)
      setCreateName("")
      await refresh()
      setSelectedTemplateId(item.id)
    },
  })
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error("未选择权限模板")
      return workspaceApi.updatePermissionTemplate(teamId, selectedTemplate.id, {
        name: editName,
        permissions: editCapabilities,
        expectedRevision: selectedTemplate.revision,
      })
    },
    onSuccess: refresh,
  })
  const assignmentMutation = useMutation({
    mutationFn: (
      input:
        | {
            scope: "team"
            accountId: string
            templateId: string
            expectedRevision: number
          }
        | {
            scope: "project"
            accountId: string
            projectId: string
            templateId: string
            expectedRevision: number
          },
    ) =>
      input.scope === "team"
        ? workspaceApi.assignTeamPermissionTemplate(teamId, input.accountId, {
            templateId: input.templateId,
            expectedRevision: input.expectedRevision,
          })
        : workspaceApi.assignProjectPermissionTemplate(
            teamId,
            input.projectId,
            input.accountId,
            {
              templateId: input.templateId,
              expectedRevision: input.expectedRevision,
            },
          ),
    onSuccess: async () => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["team-audit", teamId] }),
      ])
    },
  })

  const mutationError =
    createMutation.error ?? updateMutation.error ?? assignmentMutation.error
  const reloadAfterMutationError = () => {
    createMutation.reset()
    updateMutation.reset()
    assignmentMutation.reset()
    void permissionsQuery.refetch()
  }
  const canManage = permissionsQuery.data?.canManage ?? false
  const teamTemplates = templates.filter((template) => template.scope === "team")
  const projectTemplates = templates.filter((template) => template.scope === "project")
  const resetCreateScope = (scope: PermissionTemplateScope) => {
    setCreateScope(scope)
    setCreateCapabilities([requiredRead(scope)])
  }

  return (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <PageFrame>
        <WorkspaceHeader
          title="权限"
          actions={
            <DialogTrigger asChild>
              <Button
                type="button"
                disabled={!canManage}
                title={canManage ? "新建权限模板" : "当前角色没有权限管理能力"}
              >
                <Plus />
                新建模板
              </Button>
            </DialogTrigger>
          }
        />
        {permissionsQuery.isLoading ? (
          <EmptyState title="正在载入权限工作区" className="flex-1" />
        ) : permissionsQuery.isError ? (
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="权限工作区载入失败"
            detail={permissionsQuery.error.message}
            className="flex-1"
            action={
              <Button variant="outline" onClick={() => permissionsQuery.refetch()}>
                <RefreshCw />
                重试
              </Button>
            }
          />
        ) : (
          <Tabs defaultValue="members" className="min-h-0 flex-1 gap-0">
            <TabsList variant="line" className="w-full justify-start border-b px-4">
              <TabsTrigger value="members" className="flex-none px-4">
                成员权限
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex-none px-4">
                权限模板
              </TabsTrigger>
              <TabsTrigger value="invitations" className="flex-none px-4">
                邀请链接
              </TabsTrigger>
            </TabsList>
            {mutationError ? (
              <div
                role="alert"
                className="flex min-h-11 items-center gap-2 border-b border-destructive/25 bg-destructive/5 px-4 text-xs text-destructive"
              >
                <AlertTriangle className="size-4" />
                <span className="min-w-0 flex-1">{mutationError.message}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={reloadAfterMutationError}
                >
                  重新载入
                </Button>
              </div>
            ) : null}
            <TabsContent value="members" className="min-h-0 overflow-hidden">
              <PageBody scroll="y">
                <div className="hidden min-h-10 grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)_minmax(0,1.5fr)] items-center border-b bg-muted/30 px-4 text-xs text-muted-foreground lg:grid">
                  <span>成员</span>
                  <span>团队权限</span>
                  <span>项目权限</span>
                </div>
                {permissionsQuery.data?.members.map((member) => (
                  <section
                    key={member.accountId}
                    className="grid grid-cols-1 gap-4 border-b border-border p-4 lg:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)_minmax(0,1.5fr)]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {member.displayName}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {member.role} · {member.accountId}
                        {member.accountId === permissionsQuery.data?.currentAccountId
                          ? " · 当前用户"
                          : null}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 text-xs text-muted-foreground lg:hidden">
                        团队权限
                      </div>
                      <TemplateSelect
                        label={`调整 ${member.displayName} 的团队权限`}
                        templates={teamTemplates}
                        value={member.permissionTemplateId}
                        disabled={
                          !canManage ||
                          member.accountId === permissionsQuery.data?.currentAccountId ||
                          assignmentMutation.isPending
                        }
                        onChange={(templateId) =>
                          assignmentMutation.mutate({
                            scope: "team",
                            accountId: member.accountId,
                            templateId,
                            expectedRevision: member.permissionRevision,
                          })
                        }
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 text-xs text-muted-foreground lg:hidden">
                        项目权限
                      </div>
                      {member.projects.length ? (
                        <div className="border-t border-l border-border">
                          {member.projects.map((project) => (
                            <div
                              key={project.projectId}
                              className="grid grid-cols-1 gap-2 border-r border-b border-border p-2 sm:grid-cols-[minmax(120px,1fr)_minmax(190px,1.2fr)] sm:items-center"
                            >
                              <div className="min-w-0 px-1">
                                <div className="truncate text-xs font-medium">
                                  {project.projectName}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {project.role}
                                </div>
                              </div>
                              <TemplateSelect
                                label={`调整 ${member.displayName} 在 ${project.projectName} 的权限`}
                                templates={projectTemplates}
                                value={project.permissionTemplateId}
                                disabled={
                                  !canManage ||
                                  member.accountId ===
                                    permissionsQuery.data?.currentAccountId ||
                                  assignmentMutation.isPending
                                }
                                onChange={(templateId) =>
                                  assignmentMutation.mutate({
                                    scope: "project",
                                    accountId: member.accountId,
                                    projectId: project.projectId,
                                    templateId,
                                    expectedRevision: project.permissionRevision,
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">未加入项目</span>
                      )}
                    </div>
                  </section>
                ))}
              </PageBody>
            </TabsContent>
            <TabsContent value="templates" className="min-h-0 overflow-hidden">
              <PageBody
                scroll="y"
                className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden"
              >
                <aside className="border-b border-border lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={cn(
                        "grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                        selectedTemplate?.id === template.id && "bg-primary/[0.055]",
                      )}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {template.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {template.scope === "team" ? "团队" : "项目"} · 已分配{" "}
                          {template.assignedCount}
                        </span>
                      </span>
                      <StatusBadge tone={template.isSystem ? "neutral" : "primary"}>
                        {template.isSystem ? "系统" : "自定义"}
                      </StatusBadge>
                    </button>
                  ))}
                </aside>
                {selectedTemplate ? (
                  <section className="min-h-0 lg:overflow-y-auto">
                    <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">
                          {selectedTemplate.name}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {selectedTemplate.scope === "team"
                            ? "团队级模板"
                            : "项目级模板"}{" "}
                          · 修订 {selectedTemplate.revision}
                        </p>
                      </div>
                      {selectedTemplate.isSystem ? (
                        <LockKeyhole className="size-4" />
                      ) : null}
                    </div>
                    <div className="space-y-5 p-4">
                      <div className="grid gap-1.5">
                        <label
                          htmlFor="permission-template-name"
                          className="text-xs font-medium"
                        >
                          模板名称
                        </label>
                        <Input
                          id="permission-template-name"
                          value={editName}
                          disabled={selectedTemplate.isSystem || !canManage}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <span className="text-xs font-medium">权限项</span>
                        <CapabilityChecklist
                          idPrefix="edit-permission"
                          scope={selectedTemplate.scope}
                          value={editCapabilities}
                          disabled={selectedTemplate.isSystem || !canManage}
                          onChange={setEditCapabilities}
                        />
                      </div>
                      {!selectedTemplate.isSystem ? (
                        <div className="flex justify-end border-t border-border pt-4">
                          <Button
                            type="button"
                            disabled={
                              !canManage ||
                              updateMutation.isPending ||
                              !editName.trim() ||
                              editCapabilities.length === 0
                            }
                            onClick={() => updateMutation.mutate()}
                          >
                            <Save />
                            保存模板
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : (
                  <EmptyState
                    icon={<ShieldCheck className="size-5" />}
                    title="暂无权限模板"
                  />
                )}
              </PageBody>
            </TabsContent>
            <TabsContent value="invitations" className="min-h-0 overflow-hidden">
              <InvitationsPanel
                teamId={teamId}
                canManage={canManage}
                templates={templates}
              />
            </TabsContent>
          </Tabs>
        )}
      </PageFrame>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新建权限模板</DialogTitle>
        </DialogHeader>
        <Tabs
          value={createScope}
          onValueChange={(value) => resetCreateScope(value as PermissionTemplateScope)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="team">团队模板</TabsTrigger>
            <TabsTrigger value="project">项目模板</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-1.5">
          <label htmlFor="new-permission-template-name" className="text-xs font-medium">
            模板名称
          </label>
          <Input
            id="new-permission-template-name"
            autoFocus
            value={createName}
            maxLength={80}
            onChange={(event) => setCreateName(event.target.value)}
          />
        </div>
        <CapabilityChecklist
          idPrefix="create-permission"
          scope={createScope}
          value={createCapabilities}
          onChange={setCreateCapabilities}
        />
        {createMutation.isError ? (
          <p role="alert" className="text-xs text-destructive">
            {createMutation.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={createMutation.isPending || !createName.trim()}
            onClick={() => createMutation.mutate()}
          >
            创建模板
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const invitationExpiryOptions = [7, 30, 90] as const

const invitationStatusMeta: Record<
  TeamInvitationStatus,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "可加入", tone: "primary" },
  accepted: { label: "已加入", tone: "success" },
  revoked: { label: "已撤销", tone: "neutral" },
}

function invitationDisplayStatus(invitation: {
  status: TeamInvitationStatus
  expiresAt: string
}) {
  if (
    invitation.status === "pending" &&
    new Date(invitation.expiresAt).getTime() <= Date.now()
  ) {
    return { label: "已过期", tone: "warning" as const }
  }
  return invitationStatusMeta[invitation.status]
}

function formatInvitationDate(value: string | null, fallback: string) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("zh-CN")
}

function InvitationsPanel({
  teamId,
  canManage,
  templates,
}: {
  teamId: TeamId
  canManage: boolean
  templates: PermissionTemplate[]
}) {
  const queryClient = useQueryClient()
  const listQuery = useQuery({
    queryKey: ["team-invitations", teamId] as const,
    queryFn: () => onboardingApi.listInvitations(teamId),
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [expiresInDays, setExpiresInDays] = useState<number>(7)
  const [copiedId, setCopiedId] = useState("")
  const [copyError, setCopyError] = useState("")
  const [lastCreated, setLastCreated] = useState<CreatedInvitation | null>(null)

  const teamTemplates = templates.filter((template) => template.scope === "team")
  const invitations = listQuery.data?.items ?? []
  const createdLinkUrl = lastCreated?.token
    ? buildInvitationUrl(window.location.origin, lastCreated.token)
    : ""
  const templateName = (id: string | null) =>
    id
      ? (templates.find((template) => template.id === id)?.name ?? "按邀请配置")
      : "按邀请配置"

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["team-invitations", teamId] })

  const copyLink = async (invitation: CreatedInvitation) => {
    if (!invitation.token) {
      setCopyError("该邀请链接已离开创建页面，出于安全原因无法再次显示")
      return
    }
    try {
      await navigator.clipboard.writeText(
        buildInvitationUrl(window.location.origin, invitation.token),
      )
      setCopiedId(invitation.id)
      setCopyError("")
    } catch {
      setCopyError("浏览器未允许复制，请从列表中查看链接")
    }
  }

  const openCreate = () => {
    setLastCreated(null)
    setCopyError("")
    setInviteEmail("")
    setTemplateId(teamTemplates[0]?.id ?? "")
    setExpiresInDays(7)
    setCreateOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      onboardingApi.createInvitation(teamId, {
        scope: "team",
        email: inviteEmail.trim(),
        permissionTemplateId: templateId || undefined,
        expiresInDays: expiresInDays as 7 | 30 | 90,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async ({ item }) => {
      setLastCreated(item)
      await refresh()
      await copyLink(item)
    },
  })
  const revokeMutation = useMutation({
    mutationFn: (input: { invitationId: string; revision: number }) =>
      onboardingApi.revokeInvitation(teamId, input.invitationId, input.revision),
    onSuccess: refresh,
  })

  const featureUnavailable = listQuery.isError
    ? isOnboardingFeatureUnavailableError(listQuery.error)
    : false

  return (
    <PageBody scroll="y">
      <SectionHeader
        title="邀请链接"
        detail="创建链接后复制给受邀人，对方登录并接受后即可加入团队。系统不会代发邮件。"
        action={
          <Button
            type="button"
            disabled={!canManage}
            onClick={openCreate}
            title={canManage ? "创建邀请链接" : "当前角色没有权限管理能力"}
          >
            <UserRoundPlus />
            创建邀请链接
          </Button>
        }
      />
      {copyError ? (
        <div
          role="alert"
          className="border-b border-destructive/25 bg-destructive/5 px-4 py-2 text-xs text-destructive"
        >
          {copyError}
        </div>
      ) : null}
      {listQuery.isLoading ? (
        <EmptyState title="正在载入邀请链接" className="min-h-32" />
      ) : listQuery.isError ? (
        <EmptyState
          icon={<AlertTriangle className="size-5" />}
          title={featureUnavailable ? "邀请链接服务暂未开放" : "邀请链接载入失败"}
          detail={
            featureUnavailable
              ? "核心服务尚未提供邀请链接接口，暂时无法创建或查看邀请。"
              : listQuery.error.message
          }
          className="min-h-32"
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              <RefreshCw />
              重试
            </Button>
          }
        />
      ) : invitations.length ? (
        <div className="border-b border-border">
          {invitations.map((invitation) => {
            const status = invitationDisplayStatus(invitation)
            return (
              <div
                key={invitation.id}
                className="grid grid-cols-1 gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    <span className="min-w-0 truncate text-sm font-medium">
                      {invitation.email}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {`权限模板：${templateName(invitation.permissionTemplateId)} · 创建于 ${formatInvitationDate(invitation.createdAt, "未知")} · ${formatInvitationDate(invitation.expiresAt, "长期有效")}`}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  {invitation.status === "pending" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={revokeMutation.isPending}
                      onClick={() =>
                        revokeMutation.mutate({
                          invitationId: invitation.id,
                          revision: invitation.revision,
                        })
                      }
                    >
                      <Link2Off />
                      撤销
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<UserRoundPlus className="size-5" />}
          title="暂无邀请链接"
          detail="创建链接后发送给受邀人，对方登录并接受后即可加入团队。"
          className="min-h-32"
        />
      )}
      {revokeMutation.isError ? (
        <div
          role="alert"
          className="border-t border-destructive/25 bg-destructive/5 px-4 py-2 text-xs text-destructive"
        >
          {`撤销失败：${onboardingErrorMessage(revokeMutation.error)}`}
        </div>
      ) : null}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (open) openCreate()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>创建邀请链接</DialogTitle>
          </DialogHeader>
          {lastCreated ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                邀请链接已创建并尝试复制。请自行发送给受邀人，链接只保留在下方输入框中。
              </p>
              <label
                htmlFor="created-invitation-link"
                className="block space-y-2 text-sm font-medium"
              >
                <span>邀请链接</span>
                <Input
                  id="created-invitation-link"
                  readOnly
                  value={createdLinkUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyLink(lastCreated)}
                >
                  {copiedId === lastCreated.id ? <Check /> : <Copy />}
                  {copiedId === lastCreated.id ? "已复制" : "复制链接"}
                </Button>
                <DialogClose asChild>
                  <Button type="button">完成</Button>
                </DialogClose>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-1.5">
                <label htmlFor="invitation-email" className="text-xs font-medium">
                  受邀邮箱
                </label>
                <Input
                  id="invitation-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs font-medium">受邀人权限模板</span>
                <TemplateSelect
                  label="选择受邀人的团队权限模板"
                  templates={teamTemplates}
                  value={templateId || null}
                  disabled={createMutation.isPending}
                  onChange={setTemplateId}
                />
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs font-medium">有效期</span>
                <div className="flex gap-2">
                  {invitationExpiryOptions.map((days) => (
                    <Button
                      key={days}
                      type="button"
                      size="sm"
                      variant={expiresInDays === days ? "default" : "outline"}
                      aria-pressed={expiresInDays === days}
                      disabled={createMutation.isPending}
                      onClick={() => setExpiresInDays(days)}
                      className="min-h-11 flex-1"
                    >
                      {days} 天
                    </Button>
                  ))}
                </div>
              </div>
              {createMutation.isError ? (
                <p role="alert" className="text-xs text-destructive">
                  {onboardingErrorMessage(createMutation.error, "邀请链接创建失败")}
                </p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={createMutation.isPending}
                  >
                    取消
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  disabled={createMutation.isPending || !inviteEmail.trim()}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? "正在创建" : "创建链接"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageBody>
  )
}
