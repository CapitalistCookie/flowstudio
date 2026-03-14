"use client"

import { motion } from "framer-motion"
import { useEditorStore } from "@/lib/stores/editor-store"
import type { TimelineEventType } from "@/lib/types"

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = Math.floor(seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

const eventStyles: Record<TimelineEventType, string> = {
  chapter: "border-border/70 bg-card hover:border-foreground/30",
  cut: "border-[oklch(0.78_0.16_75_/_0.3)] bg-[oklch(0.78_0.16_75_/_0.04)] hover:border-[oklch(0.78_0.16_75_/_0.5)]",
  zoom: "border-[oklch(0.65_0.14_170_/_0.3)] bg-[oklch(0.65_0.14_170_/_0.04)] hover:border-[oklch(0.65_0.14_170_/_0.5)]",
  caption: "border-border/40 bg-muted/30 hover:border-border/70",
  highlight: "border-[oklch(0.78_0.16_75_/_0.25)] bg-[oklch(0.78_0.16_75_/_0.03)] hover:border-[oklch(0.78_0.16_75_/_0.4)]",
}

const eventLabelColors: Record<TimelineEventType, string> = {
  chapter: "text-foreground",
  cut: "text-[oklch(0.78_0.16_75)]",
  zoom: "text-[oklch(0.65_0.14_170)]",
  caption: "text-muted-foreground",
  highlight: "text-[oklch(0.78_0.16_75)]",
}

export function Timeline() {
  const { tracks, currentTime, duration, viewMode, setViewMode, setCurrentTime, selectedClipId, setSelectedClipId } = useEditorStore()
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0

  // Ruler marks every 15 seconds
  const rulerMarks: number[] = []
  for (let t = 0; t <= duration; t += 15) rulerMarks.push(t)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Timeline</h3>
          <span className="text-xs text-muted-foreground font-mono">
            {formatTimecode(currentTime)} / {formatTimecode(duration)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(["polished", "raw"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors cursor-pointer ${
                viewMode === mode
                  ? "bg-[oklch(0.78_0.16_75)] text-[oklch(0.15_0.02_75)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Ruler + Playhead */}
      <div className="shrink-0 relative px-4 py-2 border-b border-border">
        <div className="flex justify-between text-xs font-mono text-muted-foreground mb-1">
          {rulerMarks.map((t) => (
            <span
              key={t}
              className="cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setCurrentTime(t)}
            >
              {formatTimecode(t)}
            </span>
          ))}
        </div>
        <div
          className="relative h-1 w-full rounded-full bg-muted cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            setCurrentTime(Math.floor(pct * duration))
          }}
        >
          {/* Playhead */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[oklch(0.78_0.16_75)] rounded-full shadow-[0_0_6px_oklch(0.78_0.16_75_/_0.5)] transition-[left] duration-75"
            style={{ left: `${playheadPct}%` }}
          />
        </div>
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        <div className="flex flex-col gap-4">
          {tracks.map((track) => (
            <div key={track.id}>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                {track.label}
              </div>

              {track.type === "caption" ? (
                // Caption track — single bar
                <div className="relative h-7">
                  <div
                    className="absolute top-0 h-full rounded-sm border border-border/40 bg-muted/30 flex items-center px-2"
                    style={{
                      left: `${(track.events[0].startTime / duration) * 100}%`,
                      width: `${((track.events[0].endTime - track.events[0].startTime) / duration) * 100}%`,
                    }}
                  >
                    <span className="text-xs text-muted-foreground truncate">
                      {track.events[0].label}
                    </span>
                  </div>
                </div>
              ) : (
                <motion.div
                  className="flex flex-col gap-1.5"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: {
                      transition: { staggerChildren: 0.04 },
                    },
                  }}
                >
                  {track.events.map((event) => (
                    <motion.div
                      key={event.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                        selectedClipId === event.id
                          ? "border-[oklch(0.78_0.16_75)] bg-[oklch(0.78_0.16_75_/_0.06)]"
                          : eventStyles[event.type]
                      }`}
                      onClick={() => setSelectedClipId(selectedClipId === event.id ? null : event.id)}
                      variants={{
                        hidden: { opacity: 0, x: -12 },
                        visible: {
                          opacity: 1,
                          x: 0,
                          transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                        },
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${eventLabelColors[event.type]} opacity-60`}>
                          {event.type}
                        </span>
                        <span className="text-sm text-foreground">{event.label}</span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {formatTimecode(event.startTime)} – {formatTimecode(event.endTime)}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
