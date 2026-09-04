import {
  type CSSProperties,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const workspaceCardGridClassName = "grid grid-cols-1 gap-3"

export const workspaceCardSurfaceClassName = "border border-border bg-background"

export const workspaceInteractiveCardClassName =
  "border border-border bg-background transition-colors duration-200 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"

export function PageFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}
    >
      {children}
    </section>
  )
}

type WorkspaceHeaderProps = {
  title: string
  description?: ReactNode
  actions?: ReactNode
  toolbar?: ReactNode
  variant?: "default" | "compact"
  className?: string
}

export function WorkspaceHeader({
  title,
  description,
  actions,
  toolbar,
  variant = "default",
  className,
}: WorkspaceHeaderProps) {
  return (
    <div className="shrink-0">
      <header
        className={cn(
          "grid min-h-16 grid-cols-1 items-center gap-3 border-b border-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5",
          variant === "compact" && "min-h-14 border-0 bg-transparent px-4 py-2 sm:px-4",
          className,
        )}
      >
        <div className="min-w-0">
          <h1 className="break-words text-base font-semibold">{title}</h1>
          {description ? (
            <div className="mt-0.5 break-words text-xs text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </header>
      {toolbar ? <div className="border-b border-border">{toolbar}</div> : null}
    </div>
  )
}

type PageBodyProps = HTMLAttributes<HTMLDivElement> & {
  scroll?: "none" | "y" | "auto"
}

export const PageBody = forwardRef<HTMLDivElement, PageBodyProps>(function PageBody(
  { scroll = "none", className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-scroll-owner={scroll === "none" ? undefined : ""}
      className={cn(
        "min-h-0 min-w-0 flex-1",
        scroll === "none" && "overflow-hidden",
        scroll === "y" && "overflow-y-auto overflow-x-hidden",
        scroll === "auto" && "overflow-auto",
        className,
      )}
      {...props}
    />
  )
})

type ScrollAxis = "x" | "y" | "both"

function scrollAxisClass(axis: ScrollAxis) {
  if (axis === "x") return "overflow-x-auto overflow-y-hidden"
  if (axis === "y") return "overflow-y-auto overflow-x-hidden"
  return "overflow-auto"
}

type ScrollRegionProps = HTMLAttributes<HTMLDivElement> & {
  axis?: ScrollAxis
}

export const ScrollRegion = forwardRef<HTMLDivElement, ScrollRegionProps>(
  function ScrollRegion({ axis = "y", className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-scroll-owner
        className={cn("min-h-0 min-w-0", scrollAxisClass(axis), className)}
        {...props}
      />
    )
  },
)

export function WorkspaceListPane({
  listHeader,
  list,
  detailHeader,
  detail,
  listWidth = "320px",
  listLabel,
  detailLabel,
  className,
  listClassName,
  detailClassName,
}: {
  listHeader?: ReactNode
  list: ReactNode
  detailHeader?: ReactNode
  detail: ReactNode
  listWidth?: string
  listLabel: string
  detailLabel: string
  className?: string
  listClassName?: string
  detailClassName?: string
}) {
  return (
    <PageBody
      scroll="y"
      className={cn(
        "grid grid-cols-1 lg:grid-cols-[var(--workspace-list-width)_minmax(0,1fr)] lg:overflow-hidden",
        className,
      )}
      style={{ "--workspace-list-width": listWidth } as CSSProperties}
    >
      <aside className="flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0">
        {listHeader}
        <section
          data-scroll-owner
          aria-label={listLabel}
          className={cn("min-h-0 lg:flex-1 lg:overflow-y-auto", listClassName)}
        >
          {list}
        </section>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col">
        {detailHeader}
        <section
          data-scroll-owner
          aria-label={detailLabel}
          className={cn("min-h-0 lg:flex-1 lg:overflow-y-auto", detailClassName)}
        >
          {detail}
        </section>
      </section>
    </PageBody>
  )
}

export function SectionHeader({
  title,
  detail,
  action,
}: {
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-sm font-semibold">{title}</h2>
        {detail ? (
          <p className="break-words text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function PaneHeader({
  title,
  description,
  action,
  titleId,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  titleId?: string
  className?: string
}) {
  return (
    <header
      className={cn(
        "grid min-h-16 grid-cols-1 items-center gap-3 border-b border-border bg-background px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="break-words text-base font-semibold">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex min-w-0 flex-wrap sm:justify-end">{action}</div>
      ) : null}
    </header>
  )
}

export const DataTableViewport = forwardRef<
  HTMLElement,
  {
    children: ReactNode
    label: string
    axis?: ScrollAxis
    className?: string
  }
>(function DataTableViewport({ children, label, axis = "x", className }, ref) {
  return (
    <section
      ref={ref}
      data-scroll-owner
      aria-label={label}
      className={cn("min-w-0", scrollAxisClass(axis), className)}
    >
      {children}
    </section>
  )
})

export function EmptyState({
  icon,
  title,
  detail,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  detail?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        "grid min-h-40 place-items-center px-6 py-8 text-center text-muted-foreground",
        className,
      )}
    >
      <div className="max-w-sm">
        {icon ? <div className="mx-auto mb-3 flex justify-center">{icon}</div> : null}
        <p className="text-sm font-medium text-foreground">{title}</p>
        {detail ? <p className="mt-1 text-xs leading-5">{detail}</p> : null}
        {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
      </div>
    </div>
  )
}

export type StatusTone = "neutral" | "primary" | "success" | "warning" | "danger"

export function StatusBadge({
  children,
  tone = "neutral",
  size = "sm",
  className,
}: {
  children: ReactNode
  tone?: StatusTone
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-border font-medium",
        size === "sm" ? "h-6 px-1.5 text-xs" : "h-7 px-2 text-xs",
        tone === "primary" && "border-primary/30 bg-primary/6 text-primary",
        tone === "success" && "border-positive/35 bg-positive/8 text-positive",
        tone === "warning" && "border-support/35 bg-support/8 text-support",
        tone === "danger" && "border-destructive/30 bg-destructive/6 text-destructive",
        className,
      )}
    >
      {children}
    </Badge>
  )
}
