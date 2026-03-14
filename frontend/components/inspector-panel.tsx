"use client"

import { useEditorStore } from "@/lib/stores/editor-store"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"

export function InspectorPanel() {
  const { viewMode, projectResolution, projectFrameRate } = useEditorStore()

  const stats = [
    { label: "Segment Confidence", value: "96%", color: "text-[oklch(0.78_0.16_75)]" },
    { label: "Caption Accuracy", value: "98%", color: "text-[oklch(0.65_0.14_170)]" },
    { label: "Dead Time Removed", value: "00:41", color: "text-[oklch(0.78_0.16_75)]" },
    { label: "Zoom Events", value: "2", color: "text-[oklch(0.65_0.14_170)]" },
    { label: "Total Cuts", value: "2", color: "text-[oklch(0.78_0.16_75)]" },
    { label: "Chapters", value: "4", color: "text-foreground" },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="properties" className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-3 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value="properties" className="flex-1 text-xs">Properties</TabsTrigger>
            <TabsTrigger value="analysis" className="flex-1 text-xs">Analysis</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="properties" className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-4">
            {/* Project info */}
            <div className="rounded-md border border-border bg-background p-3">
              <Label className="text-xs text-muted-foreground mb-1">Resolution</Label>
              <p className="text-sm font-mono text-foreground">{projectResolution}</p>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <Label className="text-xs text-muted-foreground mb-1">Frame Rate</Label>
              <p className="text-sm font-mono text-foreground">{projectFrameRate} fps</p>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <Label className="text-xs text-muted-foreground mb-1">View Mode</Label>
              <p className={`text-sm font-medium capitalize ${
                viewMode === "polished" ? "text-[oklch(0.65_0.14_170)]" : "text-foreground"
              }`}>
                {viewMode}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-border bg-background p-3">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className={`mt-1 text-lg font-bold font-mono ${stat.color}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
