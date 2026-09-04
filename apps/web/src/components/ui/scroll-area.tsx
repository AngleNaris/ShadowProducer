"use client"

import type * as React from "react"

import { cn } from "@/lib/utils"

type ScrollAreaProps = React.ComponentPropsWithoutRef<"div"> & {
  scrollbars?: "vertical" | "horizontal" | "both"
  viewportClassName?: string
  viewportProps?: Omit<React.ComponentPropsWithoutRef<"div">, "children" | "className">
  viewportRef?: React.Ref<HTMLDivElement>
  type?: "auto" | "always" | "scroll" | "hover"
  scrollHideDelay?: number
}

function ScrollArea({
  className,
  children,
  scrollbars = "vertical",
  type: _type,
  scrollHideDelay: _scrollHideDelay,
  viewportClassName,
  viewportProps,
  viewportRef,
  ...props
}: ScrollAreaProps) {
  const overflowClass =
    scrollbars === "horizontal"
      ? "overflow-x-auto overflow-y-hidden"
      : scrollbars === "both"
        ? "overflow-auto"
        : "overflow-y-auto overflow-x-hidden"

  return (
    <div data-slot="scroll-area" className={cn("relative", className)} {...props}>
      <div
        {...viewportProps}
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        data-scroll-owner
        className={cn(
          "size-full min-h-0 min-w-0 rounded-none transition-[color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
          overflowClass,
          viewportClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export { ScrollArea }
