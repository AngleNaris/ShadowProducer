"use client"

import type { ContactField, DeletedPersonalContact } from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  ContactRound,
  FileText,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  UserRound,
} from "lucide-react"
import { useEffect, useState } from "react"

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
import { IconButton } from "@/components/workspace/icon-button"
import {
  EmptyState,
  PageFrame,
  SectionHeader,
  WorkspaceHeader,
  WorkspaceListPane,
} from "@/components/workspace/page-elements"
import type { WorkspaceTeam } from "@/components/workspace/workspace-data"
import { ApiError, contactApi } from "@/lib/api-client"
import { cn } from "@/lib/utils"

const contactFields: Array<{
  id: ContactField
  label: string
  icon: typeof UserRound
}> = [
  { id: "name", label: "姓名", icon: UserRound },
  { id: "role", label: "职业", icon: UserRound },
  { id: "company", label: "公司", icon: ContactRound },
  { id: "phone", label: "电话", icon: Link2 },
  { id: "email", label: "邮箱", icon: FileText },
]

const emptyDraft = { name: "", role: "", company: "", phone: "", email: "" }

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "联系人操作失败，请稍后重试"
}

export function PersonalContacts({ team }: { team: WorkspaceTeam }) {
  const teamId = team.id
  const queryClient = useQueryClient()
  const contactsQuery = useQuery({
    queryKey: ["personal-contacts"],
    queryFn: () => contactApi.listPersonal(),
  })
  const contacts = contactsQuery.data?.items ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [dialog, setDialog] = useState<
    "create" | "edit" | "share" | "delete" | "deleted" | "permanent-delete" | null
  >(null)
  const [permanentTarget, setPermanentTarget] = useState<DeletedPersonalContact | null>(
    null,
  )
  const [draft, setDraft] = useState(emptyDraft)
  const [shareFields, setShareFields] = useState<ContactField[]>([])
  const [allowProjectLink, setAllowProjectLink] = useState(true)
  const [operationError, setOperationError] = useState("")

  const selected = contacts.find((contact) => contact.id === selectedId) ?? contacts[0]
  const currentShare = selected?.shares.find((share) => share.teamId === teamId)
  const filtered = contacts.filter((contact) =>
    `${contact.name}${contact.role}${contact.company}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )

  useEffect(() => {
    if (!selectedId && contacts[0]) setSelectedId(contacts[0].id)
    if (selectedId && !contacts.some((contact) => contact.id === selectedId)) {
      setSelectedId(contacts[0]?.id ?? null)
    }
  }, [contacts, selectedId])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["personal-contacts"] })
  const deletedContactsQuery = useQuery({
    queryKey: ["deleted-personal-contacts"],
    queryFn: () => contactApi.listDeletedPersonal(),
    enabled: dialog === "deleted",
  })

  const createMutation = useMutation({
    mutationFn: () =>
      contactApi.createPersonal({
        ...draft,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async ({ item }) => {
      await refresh()
      setSelectedId(item.id)
      setDraft(emptyDraft)
      setDialog(null)
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No contact selected")
      return contactApi.updatePersonal(selected.id, {
        ...draft,
        expectedRevision: selected.revision,
      })
    },
    onSuccess: async () => {
      await refresh()
      setDialog(null)
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const shareMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No contact selected")
      if (!shareFields.length) {
        return contactApi.revokeShare(selected.id, teamId, selected.revision)
      }
      return contactApi.setShare(selected.id, teamId, {
        fields: shareFields,
        allowProjectLink,
        expectedRevision: selected.revision,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["team-contacts", teamId] }),
      ])
      setDialog(null)
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No contact selected")
      return contactApi.deletePersonal(selected.id, selected.revision)
    },
    onSuccess: async () => {
      setSelectedId(null)
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["deleted-personal-contacts"] }),
        queryClient.invalidateQueries({ queryKey: ["team-contacts"] }),
      ])
      setDialog(null)
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const restoreMutation = useMutation({
    mutationFn: (contact: DeletedPersonalContact) =>
      contactApi.restorePersonal(contact.id, contact.revision),
    onSuccess: async (contact) => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["deleted-personal-contacts"] }),
        queryClient.invalidateQueries({ queryKey: ["team-contacts"] }),
      ])
      setSelectedId(contact.id)
      setOperationError("")
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const permanentDeleteMutation = useMutation({
    mutationFn: (contact: DeletedPersonalContact) =>
      contactApi.permanentlyDeletePersonal(contact.id, contact.revision),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deleted-personal-contacts"] }),
        queryClient.invalidateQueries({ queryKey: ["team-contacts"] }),
      ])
      setPermanentTarget(null)
      setOperationError("")
      setDialog("deleted")
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })

  const openCreate = () => {
    setOperationError("")
    setDraft(emptyDraft)
    setDialog("create")
  }
  const openEdit = () => {
    if (!selected) return
    setOperationError("")
    setDraft({
      name: selected.name,
      role: selected.role,
      company: selected.company,
      phone: selected.phone,
      email: selected.email,
    })
    setDialog("edit")
  }
  const openShare = () => {
    if (!selected) return
    setOperationError("")
    setShareFields(currentShare?.fields ?? [])
    setAllowProjectLink(currentShare?.allowProjectLink ?? true)
    setDialog("share")
  }

  const pending =
    createMutation.isPending ||
    updateMutation.isPending ||
    shareMutation.isPending ||
    deleteMutation.isPending ||
    restoreMutation.isPending ||
    permanentDeleteMutation.isPending

  return (
    <PageFrame>
      <WorkspaceHeader
        title="个人联系人"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => {
                setOperationError("")
                setDialog("deleted")
              }}
            >
              <Trash2 />
              已删除
            </Button>
            <Button size="sm" className="min-h-11" onClick={openCreate}>
              <Plus />
              新建联系人
            </Button>
          </div>
        }
      />
      <WorkspaceListPane
        listWidth="320px"
        listLabel="个人联系人列表"
        detailLabel={selected ? `${selected.name} 联系人详情` : "联系人详情"}
        listHeader={
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索个人联系人"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索姓名、职业或公司"
                className="pl-8"
              />
            </div>
          </div>
        }
        list={
          contactsQuery.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">正在载入联系人...</div>
          ) : contactsQuery.isError ? (
            <EmptyState
              title="联系人载入失败"
              detail={errorMessage(contactsQuery.error)}
              action={<Button onClick={() => contactsQuery.refetch()}>重新载入</Button>}
            />
          ) : filtered.length ? (
            filtered.map((contact) => (
              <button
                key={contact.id}
                type="button"
                aria-current={contact.id === selected?.id ? "true" : undefined}
                onClick={() => setSelectedId(contact.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border p-3 text-left hover:bg-muted",
                  contact.id === selected?.id && "bg-primary/6",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center border border-border bg-muted text-xs font-semibold">
                  {contact.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {contact.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {contact.role || "未填写职业"} · {contact.company || "未填写公司"}
                  </span>
                </span>
                {contact.shares.length ? (
                  <Share2 className="size-3.5 text-primary" aria-label="已共享" />
                ) : null}
              </button>
            ))
          ) : (
            <EmptyState title="没有联系人" detail="创建联系人后可按字段共享到团队。" />
          )
        }
        detailHeader={
          selected ? (
            <SectionHeader
              title={selected.name}
              detail="个人所有"
              action={
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={openShare}>
                    <Share2 />
                    共享到团队
                  </Button>
                  <IconButton label="编辑联系人" onClick={openEdit}>
                    <Pencil />
                  </IconButton>
                  <IconButton label="删除联系人" onClick={() => setDialog("delete")}>
                    <Trash2 />
                  </IconButton>
                </div>
              }
            />
          ) : undefined
        }
        detail={
          selected ? (
            <>
              <div className="grid gap-px bg-border sm:grid-cols-2">
                {contactFields.slice(1).map(({ id, label, icon: Icon }) => (
                  <div key={id} className="bg-background p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="size-3.5" />
                      {label}
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {selected[id] || "未填写"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-4">
                <h3 className="text-xs font-semibold">当前团队共享</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {currentShare
                    ? `已向 ${team.name} 共享 ${currentShare.fields.length} 个字段${currentShare.allowProjectLink ? "，允许关联项目" : "，不允许建立新项目关联"}。`
                    : `尚未共享到 ${team.name}。`}
                </p>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<ContactRound className="size-5" />}
              title="选择或创建联系人"
              detail="个人联系人只在这里维护。"
            />
          )
        }
      />

      <Dialog
        open={dialog === "create" || dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "edit" ? "编辑个人联系人" : "新建个人联系人"}
            </DialogTitle>
            <DialogDescription>个人记录默认不会出现在任何团队资源库。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {contactFields.map(({ id, label }) => (
              <Input
                key={id}
                aria-label={label}
                value={draft[id]}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [id]: event.target.value }))
                }
                placeholder={label}
                className={id === "email" ? "sm:col-span-2" : undefined}
              />
            ))}
          </div>
          {operationError ? (
            <p className="text-sm text-destructive">{operationError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              disabled={!draft.name.trim() || pending}
              onClick={() =>
                dialog === "edit" ? updateMutation.mutate() : createMutation.mutate()
              }
            >
              {dialog === "edit" ? "保存修改" : "创建联系人"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "share"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              共享 {selected?.name} 到 {team.name}
            </DialogTitle>
            <DialogDescription>
              团队资源库只会收到所选字段，未选字段不会返回给团队。
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border border border-border">
            {contactFields.map(({ id, label }) => {
              const checked = shareFields.includes(id)
              return (
                <label
                  key={id}
                  className="flex h-11 w-full cursor-pointer items-center gap-3 px-3 text-left text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/60"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setShareFields((current) =>
                        checked
                          ? current.filter((field) => field !== id)
                          : [...current, id],
                      )
                    }
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      "grid size-4 place-items-center border border-border",
                      checked && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {checked ? <Check className="size-3" /> : null}
                  </span>
                  <span className="flex-1">{label}</span>
                </label>
              )
            })}
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-border px-3 text-left text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/60">
            <input
              type="checkbox"
              checked={allowProjectLink}
              onChange={(event) => setAllowProjectLink(event.target.checked)}
              className="sr-only"
            />
            <span
              className={cn(
                "grid size-4 place-items-center border border-border",
                allowProjectLink && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {allowProjectLink ? <Check className="size-3" /> : null}
            </span>
            允许团队将联系人关联到新项目
          </label>
          {operationError ? (
            <p className="text-sm text-destructive">{operationError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              disabled={pending || (!shareFields.length && !currentShare)}
              onClick={() => shareMutation.mutate()}
            >
              <Share2 />
              {!shareFields.length && currentShare ? "撤销共享" : "更新共享"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 {selected?.name}</DialogTitle>
            <DialogDescription>
              该联系人将从个人列表和团队共享投影中移除。
            </DialogDescription>
          </DialogHeader>
          {operationError ? (
            <p className="text-sm text-destructive">{operationError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => deleteMutation.mutate()}
            >
              <Trash2 />
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "deleted"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>已删除联系人</DialogTitle>
            <DialogDescription>仅你可以查看和恢复这些联系人。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(55vh,440px)] overflow-y-auto border border-border">
            {deletedContactsQuery.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">正在载入...</div>
            ) : deletedContactsQuery.isError ? (
              <EmptyState
                title="已删除联系人载入失败"
                detail={errorMessage(deletedContactsQuery.error)}
                action={
                  <Button onClick={() => deletedContactsQuery.refetch()}>重新载入</Button>
                }
              />
            ) : deletedContactsQuery.data?.items.length ? (
              deletedContactsQuery.data.items.map((contact) => (
                <div
                  key={contact.id}
                  className="flex min-h-16 items-center gap-3 border-b border-border p-3 last:border-b-0"
                >
                  <span className="grid size-9 shrink-0 place-items-center border border-border bg-muted text-xs font-semibold">
                    {contact.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {contact.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {contact.role || "未填写职业"} · 删除于{" "}
                      {new Date(contact.deletedAt).toLocaleDateString("zh-CN")}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <IconButton
                      label={`恢复 ${contact.name}`}
                      disabled={pending}
                      onClick={() => restoreMutation.mutate(contact)}
                    >
                      <RotateCcw />
                    </IconButton>
                    <IconButton
                      label={`永久删除 ${contact.name}`}
                      disabled={pending}
                      onClick={() => {
                        setOperationError("")
                        setPermanentTarget(contact)
                        setDialog("permanent-delete")
                      }}
                    >
                      <Trash2 />
                    </IconButton>
                  </span>
                </div>
              ))
            ) : (
              <EmptyState title="没有已删除联系人" />
            )}
          </div>
          {operationError ? (
            <p className="text-sm text-destructive">{operationError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "permanent-delete"}
        onOpenChange={(open) => !open && setDialog("deleted")}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>永久删除 {permanentTarget?.name}</DialogTitle>
            <DialogDescription>
              该联系人及其团队共享和业务关联将被永久删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {operationError ? (
            <p className="text-sm text-destructive">{operationError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog("deleted")}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!permanentTarget || pending}
              onClick={() =>
                permanentTarget && permanentDeleteMutation.mutate(permanentTarget)
              }
            >
              <Trash2 />
              永久删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
