"use client"

import { Video, Music, FileText, Image } from "lucide-react"
import { MOCK_MEDIA_ASSETS } from "@/lib/mock-data"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const typeIcons: Record<string, React.ElementType> = {
  video: Video,
  audio: Music,
  subtitle: FileText,
  image: Image,
}

export function MediaPanel() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="media" className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-3 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value="media" className="flex-1 text-xs">Media</TabsTrigger>
            <TabsTrigger value="assets" className="flex-1 text-xs">Assets</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="media" className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-1">
            {MOCK_MEDIA_ASSETS.map((asset) => {
              const Icon = typeIcons[asset.type] || FileText
              return (
                <div
                  key={asset.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer transition-colors hover:bg-accent"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${
                    asset.type === "video" ? "text-[oklch(0.78_0.16_75)]" :
                    asset.type === "audio" ? "text-[oklch(0.65_0.14_170)]" :
                    "text-muted-foreground"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">{asset.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {asset.size}{asset.duration ? ` · ${asset.duration}` : ""}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="assets" className="flex-1 overflow-y-auto p-3">
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">No additional assets</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
