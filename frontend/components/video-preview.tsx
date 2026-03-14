"use client"

import { Play, Pause, SkipBack, SkipForward, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/stores/editor-store"

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = Math.floor(seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

export function VideoPreview() {
  const { currentTime, duration, isPlaying, togglePlay, setCurrentTime, setIsPlaying } = useEditorStore()
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="relative w-full h-full max-w-full max-h-full aspect-video rounded-md border border-border bg-muted overflow-hidden">
          {/* Gradient background as video placeholder */}
          <div className="absolute inset-0 bg-gradient-to-br from-background via-card to-background" />

          {/* Center play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={togglePlay}
              className={`flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm transition-all hover:bg-foreground/20 hover:scale-105 cursor-pointer ${isPlaying ? "opacity-0 hover:opacity-100" : "opacity-100"}`}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6 text-foreground" />
              ) : (
                <Play className="h-6 w-6 text-foreground ml-1" />
              )}
            </button>
          </div>

          {/* Top-right info chip */}
          <div className="absolute top-3 right-3">
            <span className="rounded-md bg-background/80 backdrop-blur-sm px-2 py-1 text-xs font-mono text-muted-foreground">
              1920×1080
            </span>
          </div>

          {/* Fullscreen button */}
          <div className="absolute bottom-3 right-3">
            <Button variant="ghost" size="icon-sm" className="h-7 w-7 bg-background/60 backdrop-blur-sm">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Transport controls */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-2">
        {/* Scrubber */}
        <div
          className="relative h-1 w-full rounded-full bg-muted mb-3 cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            setCurrentTime(Math.floor(pct * duration))
          }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-[oklch(0.78_0.16_75)] transition-[width] duration-75"
            style={{ width: `${playheadPct}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-[oklch(0.78_0.16_75)] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            style={{ left: `${playheadPct}%`, transform: `translateX(-50%) translateY(-50%)` }}
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground w-12">
            {formatTimecode(currentTime)}
          </span>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setCurrentTime(0)}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="h-9 w-9"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setCurrentTime(duration)}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          <span className="font-mono text-xs text-muted-foreground w-12 text-right">
            {formatTimecode(duration)}
          </span>
        </div>
      </div>
    </div>
  )
}
