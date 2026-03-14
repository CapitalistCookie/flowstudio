"use client"

import React from "react"
import { GripVertical } from "lucide-react"
import { Panel, Group, Separator, type GroupProps, type SeparatorProps } from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: GroupProps) {
  return (
    <Group
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const ResizablePanel = Panel

function ResizableHandle({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <Separator
      className={cn(
        "relative flex items-center justify-center bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        // Horizontal handle (resizing width)
        "data-[panel-group-direction=horizontal]:w-2 data-[panel-group-direction=horizontal]:cursor-col-resize hover:data-[panel-group-direction=horizontal]:bg-border/50",
        // Vertical handle (resizing height)
        "data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:cursor-row-resize hover:data-[panel-group-direction=vertical]:bg-border/50",
        className
      )}
      {...props}
    >
      {/* The actual visual line */}
      <div className={cn(
        "bg-border transition-colors",
        "data-[panel-group-direction=horizontal]:h-full data-[panel-group-direction=horizontal]:w-px",
        "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full",
        "group-hover:bg-[oklch(0.78_0.16_75)] group-active:bg-[oklch(0.78_0.16_75)]"
      )} />
      
      {withHandle && (
        <div className={cn(
          "z-20 flex items-center justify-center rounded-sm border bg-card shadow-md transition-all group-hover:scale-110",
          "data-[panel-group-direction=horizontal]:h-4 data-[panel-group-direction=horizontal]:w-3",
          "data-[panel-group-direction=vertical]:h-3 data-[panel-group-direction=vertical]:w-4"
        )}>
          <GripVertical className={cn(
            "h-2.5 w-2.5 text-muted-foreground transition-transform",
            "data-[panel-group-direction=vertical]:rotate-90"
          )} />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
