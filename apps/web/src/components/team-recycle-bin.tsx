"use client"

import type { WorkspaceRecycleItem } from "@shadowproducer/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays,
  CheckSquare2,
  ContactRound,
  RotateCcw,
  StickyNote,
  Trash2,
  Truck,
} from "lucide-react"
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
import {
  EmptyState,
  PageBody,
  PageFrame,
  WorkspaceHeader,
} from "@/components/workspace/page-elements"
import type { TeamId } from "@/components/workspace/workspace-data"
import { workspaceApi } from "@/lib/api-client"

const typeMeta = {
  task: { label: "任务", icon: CheckSquare2, fallbackScope: "个人范围" },
  "calendar-event": { label: "日程", icon: CalendarDays, fallbackScope: "个人范围" },
  note: { label: "笔记", icon: StickyNote, fallbackScope: "个人范围" },
  "team-contact": { label: "团队联系人", icon: ContactRound, fallbackScope: "团队范围" },
  supplier: { label: "供应商", icon: Truck, fallbackScope: "团队范围" },
} satisfies Record<
  WorkspaceRecycleItem["kind"],
  { label: string; icon: typeof Trash2; fallbackScope: string }
>

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

export function TeamRecycleBin({ teamId }: { teamId: TeamId }) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const [permanentDeleteItem, setPermanentDeleteItem] =
    useState<WorkspaceRecycleItem | null>(null)
  const recycleQuery = useQuery({
    queryKey: ["workspace-recycle-bin", teamId],
    queryFn: () => workspaceApi.listRecycleBin(teamId),
  })
  const restoreMutation = useMutation({
    mutationFn: (item: WorkspaceRecycleItem) =>
      workspaceApi.restoreRecycleItem(teamId, item),
    onSuccess: async (_, item) => {
      setNotice(`已恢复“${item.title}”`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-recycle-bin", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-tasks", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-notes", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["team-contacts", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["team-suppliers", teamId] }),
      ])
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "恢复失败")
    },
  })
  const permanentDeleteMutation = useMutation({
    mutationFn: (item: WorkspaceRecycleItem) =>
      workspaceApi.permanentlyDeleteRecycleItem(teamId, item),
    onSuccess: async (_, item) => {
      setPermanentDeleteItem(null)
      setNotice(`已永久删除“${item.title}”`)
      await queryClient.invalidateQueries({
        queryKey: ["workspace-recycle-bin", teamId],
      })
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "永久删除失败")
    },
  })

  return (
    <PageFrame>
      <WorkspaceHeader title="回收站" />
      <PageBody scroll="y">
        {notice ? (
          <div
            role="status"
            className="border-b border-border bg-muted/25 px-4 py-2 text-xs"
          >
            {notice}
          </div>
        ) : null}
        {recycleQuery.isLoading ? (
          <EmptyState title="正在载入回收站" />
        ) : recycleQuery.isError ? (
          <EmptyState
            title="回收站载入失败"
            detail={recycleQuery.error.message}
            action={
              <Button variant="outline" onClick={() => recycleQuery.refetch()}>
                重试
              </Button>
            }
          />
        ) : !recycleQuery.data?.items.length ? (
          <EmptyState icon={<Trash2 className="size-5" />} title="回收站为空" />
        ) : (
          <section
            aria-label="已删除项目"
            className="divide-y divide-border border-b border-border"
          >
            {recycleQuery.data.items.map((item) => {
              const meta = typeMeta[item.kind]
              const Icon = meta.icon
              const canManageShared = recycleQuery.data?.canManageShared ?? false
              const sharedItem = item.kind === "team-contact" || item.kind === "supplier"
              const restoring =
                restoreMutation.isPending && restoreMutation.variables?.id === item.id
              const deleting =
                permanentDeleteMutation.isPending &&
                permanentDeleteMutation.variables?.id === item.id
              return (
                <article
                  key={`${item.kind}:${item.id}`}
                  className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium">{item.title}</h2>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {meta.label} · {item.projectName ?? meta.fallbackScope} ·{" "}
                        {dateTimeFormatter.format(new Date(item.deletedAt))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!sharedItem || canManageShared ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          restoreMutation.isPending || permanentDeleteMutation.isPending
                        }
                        onClick={() => restoreMutation.mutate(item)}
                      >
                        <RotateCcw />
                        {restoring ? "正在恢复" : "恢复"}
                      </Button>
                    ) : null}
                    {!sharedItem || canManageShared ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={
                          restoreMutation.isPending || permanentDeleteMutation.isPending
                        }
                        onClick={() => setPermanentDeleteItem(item)}
                      >
                        <Trash2 />
                        {deleting ? "正在删除" : "永久删除"}
                      </Button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </PageBody>
      <Dialog
        open={Boolean(permanentDeleteItem)}
        onOpenChange={(open) => !open && setPermanentDeleteItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>永久删除</DialogTitle>
            <DialogDescription>
              “{permanentDeleteItem?.title}”及其可恢复关联将被永久删除，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentDeleteItem(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!permanentDeleteItem || permanentDeleteMutation.isPending}
              onClick={() =>
                permanentDeleteItem && permanentDeleteMutation.mutate(permanentDeleteItem)
              }
            >
              <Trash2 />
              {permanentDeleteMutation.isPending ? "正在永久删除" : "确认永久删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  )
}
