"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react"
import { Video, Volume2, Lock, Eye, Film, Trash2, Scissors, Undo2, Redo2, Copy, Clipboard, Wand2, ChevronDown, ChevronUp, GripHorizontal, Sparkles } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useEditor, TimelineClip, PIXELS_PER_SECOND, DEFAULT_CLIP_TRANSFORM, DEFAULT_CLIP_EFFECTS, type MediaFile } from "./editor-context"
import { EFFECT_DRAG_DATA_TYPE, type ModularEffectType, type EffectBlockData } from "@/lib/types"

// ── Module-level constants ─────────────────────────────────────────────────────
const ORDERED_EFFECT_TYPES: ModularEffectType[] = [
  "zoom", "fast_forward", "trim", "cut",
  "noise_removal", "background_music", "normalize_volume", "captions",
  "track_cursor", "cursor_click_sound", "smooth_cursor_movement", "auto_hide_static_cursor",
]

const EFFECT_TYPE_LABELS: Record<ModularEffectType, string> = {
  zoom: "Zoom",
  fast_forward: "Fast forward",
  trim: "Trim",
  cut: "Cut",
  noise_removal: "Noise removal",
  background_music: "Background music",
  normalize_volume: "Normalize volume",
  captions: "Captions",
  track_cursor: "Track cursor",
  cursor_click_sound: "Cursor click sound",
  smooth_cursor_movement: "Smooth cursor movement",
  auto_hide_static_cursor: "Auto-hide static cursor",
}

const DEFAULT_EFFECT_DURATION_PX = 5 * PIXELS_PER_SECOND

function getTrackLabel(track: string): string {
  if (track === "FX") return "FX"
  if (track.startsWith("FX:")) return EFFECT_TYPE_LABELS[track.slice(3) as ModularEffectType] ?? track
  return track
}

function formatRulerTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatDragTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ── Internal context ───────────────────────────────────────────────────────────
// Keeps sub-components at module level (stable identity) so React never
// unmounts/remounts them on Timeline re-renders – which would break drag-drop.
type TimelineCtx = {
  tracks: string[]
  playheadPosition: number
  zoomLevel: number
  pixelsPerSecond: number
  isScrubbing: boolean
  setIsScrubbing: (v: boolean) => void
  isPlaying: boolean
  setIsPlaying: (v: boolean) => void
  setCurrentTime: (t: number) => void
  timelineClips: TimelineClip[]
  mediaFiles: MediaFile[]
  effectBlocks: EffectBlockData[]
  removeEffectBlock: (id: string) => void
  selectedEffectBlockId: string | null
  selectedClipId: string | null
  activeClip: TimelineClip | null
  dropTargetTrack: string | null
  dragPreview: { x: number; trackId: string; duration: number; label: string; isSnapped?: boolean } | null
  liveTransform: { clipId: string; x: number; trackId?: string } | null
  liveTrim: { clipId: string; edge: "left" | "right"; deltaX: number } | null
  draggedClip: string | null
  trimState: {
    clipId: string; edge: "left" | "right"
    initialX: number; initialStartTime: number; initialDuration: number; initialMediaOffset: number
  } | null
  draggedEffectBlockId: string | null
  liveEffectBlockStart: number | null
  liveEffectTrim: { blockId: string; edge: "left" | "right"; deltaX: number } | null
  effectTrimState: {
    blockId: string; edge: "left" | "right"
    initialX: number; initialStartTime: number; initialDuration: number
  } | null
  timelineRef: { current: HTMLDivElement | null }
  handleTrackDragOver: (e: React.DragEvent, trackId: string) => void
  handleTrackDragLeave: (e: React.DragEvent) => void
  handleTrackDrop: (e: React.DragEvent, trackId: string) => void
  handleEffectBlockMouseDown: (e: React.MouseEvent, blockId: string) => void
  handleEffectBlockContextMenu: (e: React.MouseEvent, blockId: string) => void
  handleEffectTrimStart: (e: React.MouseEvent, blockId: string, edge: "left" | "right") => void
  handleClipMouseDown: (e: React.MouseEvent, clipId: string) => void
  handleClipContextMenu: (e: React.MouseEvent, clipId: string) => void
  handleTrimStart: (e: React.MouseEvent, clipId: string, edge: "left" | "right") => void
  handleDeleteClip: (e: React.MouseEvent, clipId: string) => void
  handleTimelineMouseDown: (e: React.MouseEvent) => void
  getTimeFromMouseEvent: (e: React.MouseEvent | MouseEvent) => number | null
}

const TimelineContext = createContext<TimelineCtx | null>(null)

function useTimelineCtx(): TimelineCtx {
  const ctx = useContext(TimelineContext)
  if (!ctx) throw new Error("useTimelineCtx must be used within Timeline")
  return ctx
}

// ── Sub-components at module level ────────────────────────────────────────────
// Defined here (not inside Timeline) so their function reference is stable.
// React uses function identity to decide mount/unmount; if these were inside
// Timeline, every state update would create a new reference and force a remount,
// which destroys the DOM node that is the active drag target mid-drag.

function TimelineScrollContent() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin">
      <div className="flex w-full min-h-full">
        <TimelineLabels />
        <TimelineGrid />
      </div>
    </div>
  )
}

function TimelineLabels() {
  const { tracks } = useTimelineCtx()
  return (
    <div className="w-24 border-r border-border bg-secondary/80 flex-shrink-0">
      <div className="h-6 border-b border-border shrink-0" aria-hidden />
      {tracks.map((track) => (
        <div key={track} className="flex h-12 items-center gap-2 border-b border-border px-2">
          <div className="flex items-center gap-1">
            {track === "FX" || track.startsWith("FX:") ? (
              <Wand2 className="h-3 w-3 text-muted-foreground" />
            ) : track.startsWith("V") ? (
              <Video className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Volume2 className="h-3 w-3 text-muted-foreground" />
            )}
            {track !== "FX" && !track.startsWith("FX:") && (
              <>
                <Lock className="h-2.5 w-2.5 text-muted-foreground/50" />
                <Eye className="h-2.5 w-2.5 text-muted-foreground/50" />
              </>
            )}
          </div>
          <div className="text-xs font-medium text-foreground truncate">{getTrackLabel(track)}</div>
        </div>
      ))}
    </div>
  )
}

function TimelineGrid() {
  const { timelineRef, isScrubbing, trimState, draggedClip, dropTargetTrack, handleTimelineMouseDown } = useTimelineCtx()
  return (
    <div
      ref={timelineRef}
      className={`relative flex-1 min-w-0 overflow-x-auto scrollbar-thin select-none ${
        isScrubbing ? "cursor-ew-resize" : trimState ? "cursor-ew-resize" : draggedClip ? "cursor-grabbing" : dropTargetTrack ? "cursor-copy" : ""
      }`}
      onMouseDown={handleTimelineMouseDown}
      style={{ userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none", msUserSelect: "none" } as React.CSSProperties}
    >
      <TimelineRuler />
      <TimelineTracksAndOverlays />
    </div>
  )
}

function TimelineRuler() {
  const { zoomLevel, pixelsPerSecond } = useTimelineCtx()
  const secondsPerSegment = zoomLevel <= 50 ? 30 : zoomLevel <= 100 ? 8 : zoomLevel <= 200 ? 4 : 2
  const segmentWidth = secondsPerSegment * pixelsPerSecond
  const numSegments = Math.ceil(600 / secondsPerSegment)
  return (
    <div className="sticky top-0 z-10 flex h-6 border-b border-border bg-card">
      {Array.from({ length: numSegments }).map((_, i) => (
        <div key={i} className="shrink-0 border-r border-border" style={{ width: `${segmentWidth}px` }}>
          <div className="px-2 text-[10px] text-muted-foreground">{formatRulerTime(i * secondsPerSegment)}</div>
        </div>
      ))}
    </div>
  )
}

function TimelineTracksAndOverlays() {
  const { tracks, playheadPosition, isPlaying, setIsPlaying, getTimeFromMouseEvent, setCurrentTime, setIsScrubbing, timelineClips } = useTimelineCtx()
  return (
    <div className="relative">
      {tracks.map((track, index) => (
        <TimelineTrackRow key={track} track={track} index={index} />
      ))}
      <div className="absolute top-0 z-20 h-full w-0.5 bg-red-500" style={{ left: `${playheadPosition}px` }}>
        <div
          className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-red-500 ring-2 ring-background shadow-lg cursor-ew-resize hover:scale-125 transition-transform select-none"
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            if (isPlaying) setIsPlaying(false)
            const newTime = getTimeFromMouseEvent(e)
            if (newTime !== null) setCurrentTime(Math.max(0, newTime))
            setIsScrubbing(true)
          }}
        />
      </div>
      {timelineClips.length === 0 && (
        <div className="pointer-events-none absolute bottom-0 left-24 right-0 top-6 flex items-center justify-center">
          <div className="rounded-xl border border-border/70 bg-background/70 px-6 py-5 text-center shadow-sm backdrop-blur-sm">
            <Film className="mx-auto mb-2 h-8 w-8 text-muted-foreground/70" />
            <p className="text-sm font-medium text-muted-foreground">Drag media here to start editing</p>
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineTrackRow({ track, index }: { track: string; index: number }) {
  const {
    dropTargetTrack, dragPreview, zoomLevel, pixelsPerSecond,
    effectBlocks, timelineClips, liveTransform,
    handleTrackDragOver, handleTrackDragLeave, handleTrackDrop,
  } = useTimelineCtx()
  return (
    <div
      className={`flex h-12 border-b transition-all relative ${
        dropTargetTrack === track
          ? "bg-blue-500/20 border-blue-400 shadow-inner ring-1 ring-blue-400/50 ring-inset"
          : "border-border"
      }`}
      style={{
        background: dropTargetTrack === track
          ? undefined
          : index < 2 ? "oklch(0.97 0.006 84)" : "oklch(0.95 0.008 82)",
      }}
      onDragOver={(e) => handleTrackDragOver(e, track)}
      onDragLeave={handleTrackDragLeave}
      onDrop={(e) => handleTrackDrop(e, track)}
    >
      {dropTargetTrack === track && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-400 rounded-sm pointer-events-none animate-pulse" />
      )}
      <div className="absolute inset-0 flex pointer-events-none">
        {(() => {
          const sps = zoomLevel <= 50 ? 30 : zoomLevel <= 100 ? 8 : zoomLevel <= 200 ? 4 : 2
          const sw = sps * pixelsPerSecond
          return Array.from({ length: Math.ceil(600 / sps) }).map((_, i) => (
            <div key={i} className="shrink-0 border-r border-border/30" style={{ width: `${sw}px` }} />
          ))
        })()}
      </div>
      {dragPreview && dragPreview.trackId === track && (
        <div
          className={`absolute z-30 mx-1 my-1.5 h-9 rounded-lg border-2 pointer-events-none transition-all shadow-2xl ${
            dragPreview.isSnapped
              ? "border-solid border-green-400 bg-green-400/40 ring-2 ring-green-400/50 ring-offset-1 ring-offset-background"
              : "border-dashed border-blue-400 bg-blue-400/30 ring-2 ring-blue-400/40 ring-offset-1 ring-offset-background animate-pulse"
          }`}
          style={{ left: `${dragPreview.x}px`, width: `${dragPreview.duration}px` }}
        >
          <div className="flex h-full items-center justify-center px-2">
            <div className={`text-xs font-bold px-3 py-1 rounded-md shadow-lg backdrop-blur-sm whitespace-nowrap ${
              dragPreview.isSnapped ? "bg-green-500 text-white" : "bg-blue-500 text-white"
            }`}>
              {dragPreview.isSnapped && "🧲 "}{dragPreview.label}
            </div>
          </div>
          <div className="absolute -top-7 left-0 right-0 flex items-center justify-center">
            <div className={`text-[10px] font-semibold px-2 py-1 rounded shadow-md whitespace-nowrap ${
              dragPreview.isSnapped ? "bg-green-500 text-white" : "bg-blue-500 text-white"
            }`}>
              ⏱ {formatDragTime(dragPreview.duration / pixelsPerSecond)} • 📍 {formatRulerTime(dragPreview.x / pixelsPerSecond)}
            </div>
          </div>
          <div className={`absolute -left-1 top-0 bottom-0 w-1 rounded-l ${dragPreview.isSnapped ? "bg-green-400" : "bg-blue-400"}`}>
            <div className={`absolute top-1/2 -translate-y-1/2 -left-2 ${dragPreview.isSnapped ? "text-green-400" : "text-blue-400"}`}>▶</div>
          </div>
          <div className={`absolute -right-1 top-0 bottom-0 w-1 rounded-r ${dragPreview.isSnapped ? "bg-green-400" : "bg-blue-400"}`}>
            <div className={`absolute top-1/2 -translate-y-1/2 -right-2 ${dragPreview.isSnapped ? "text-green-400" : "text-blue-400"}`}>◀</div>
          </div>
          <div className={`absolute left-0 -top-2 bottom-0 w-0.5 ${dragPreview.isSnapped ? "bg-green-400" : "bg-blue-400"}`} style={{ height: "calc(100% + 8px)" }} />
        </div>
      )}
      {(track === "FX" || track.startsWith("FX:")) ? (
        (track === "FX"
          ? effectBlocks
          : effectBlocks.filter((b) => b.effectType === (track.slice(3) as ModularEffectType))
        ).map((block) => (
          <TimelineEffectBlock key={block.id} block={block} />
        ))
      ) : (
        timelineClips
          .filter((clip) => {
            const isOnThisTrack = clip.trackId === track
            const isBeingDraggedToThisTrack = liveTransform?.clipId === clip.id && liveTransform?.trackId === track
            const isDraggedAwayFromThisTrack = liveTransform?.clipId === clip.id && liveTransform?.trackId && liveTransform.trackId !== track && clip.trackId === track
            return (isOnThisTrack && !isDraggedAwayFromThisTrack) || isBeingDraggedToThisTrack
          })
          .map((clip) => (
            <TimelineClipBlock key={clip.id} clip={clip} track={track} />
          ))
      )}
    </div>
  )
}

function TimelineEffectBlock({ block }: { block: EffectBlockData }) {
  const {
    draggedEffectBlockId, liveEffectBlockStart, liveEffectTrim, effectTrimState,
    selectedEffectBlockId, pixelsPerSecond,
    handleEffectBlockMouseDown, handleEffectBlockContextMenu, handleEffectTrimStart, removeEffectBlock,
  } = useTimelineCtx()
  let visualStart = (block.startTime / PIXELS_PER_SECOND) * pixelsPerSecond
  let visualDuration = (block.duration / PIXELS_PER_SECOND) * pixelsPerSecond
  if (draggedEffectBlockId === block.id && liveEffectBlockStart !== null) visualStart = liveEffectBlockStart
  if (liveEffectTrim && liveEffectTrim.blockId === block.id) {
    if (liveEffectTrim.edge === "left") {
      visualStart += liveEffectTrim.deltaX
      visualDuration -= liveEffectTrim.deltaX
    } else {
      visualDuration += liveEffectTrim.deltaX
    }
  }
  const label = EFFECT_TYPE_LABELS[block.effectType]
  const isSelected = selectedEffectBlockId === block.id
  return (
    <div
      data-effect-block-id={block.id}
      onMouseDown={(e) => handleEffectBlockMouseDown(e, block.id)}
      onContextMenu={(e) => handleEffectBlockContextMenu(e, block.id)}
      className={`absolute z-10 mx-1 my-1.5 h-9 rounded border flex items-center px-2 min-w-[24px] group ${
        draggedEffectBlockId === block.id ? "opacity-70 cursor-grabbing z-50 bg-violet-500/90 border-violet-400" :
        effectTrimState?.blockId === block.id ? "cursor-ew-resize z-50 bg-violet-500/90 border-violet-400" :
        "cursor-grab bg-violet-500/80 border-violet-400 hover:bg-violet-500/90"
      } ${isSelected ? "ring-2 ring-white" : ""}`}
      style={{ left: `${visualStart}px`, width: `${Math.max(24, visualDuration)}px` }}
    >
      <span className="text-xs font-medium text-white truncate pointer-events-none">{label}</span>
      <div data-effect-trim-handle className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30" onMouseDown={(e) => handleEffectTrimStart(e, block.id, "left")} />
      <div data-effect-trim-handle className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30" onMouseDown={(e) => handleEffectTrimStart(e, block.id, "right")} />
      <button
        type="button"
        className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 hover:opacity-100 flex items-center justify-center text-[10px] z-10"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); removeEffectBlock(block.id) }}
        title="Remove effect"
      >
        <Trash2 className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}

function TimelineClipBlock({ clip, track }: { clip: TimelineClip; track: string }) {
  const {
    mediaFiles, liveTransform, liveTrim, draggedClip, trimState,
    selectedClipId, activeClip, pixelsPerSecond,
    handleClipMouseDown, handleClipContextMenu, handleTrimStart, handleDeleteClip,
  } = useTimelineCtx()
  const media = mediaFiles.find((m) => m.id === clip.mediaId)
  let visualStartTime = (clip.startTime / PIXELS_PER_SECOND) * pixelsPerSecond
  let visualDuration = (clip.duration / PIXELS_PER_SECOND) * pixelsPerSecond
  if (liveTransform && liveTransform.clipId === clip.id) visualStartTime = liveTransform.x
  if (liveTrim && liveTrim.clipId === clip.id) {
    if (liveTrim.edge === "left") {
      visualStartTime += liveTrim.deltaX
      visualDuration -= liveTrim.deltaX
    } else {
      visualDuration += liveTrim.deltaX
    }
  }
  return (
    <div
      data-clip-id={clip.id}
      onMouseDown={(e) => handleClipMouseDown(e, clip.id)}
      onContextMenu={(e) => handleClipContextMenu(e, clip.id)}
      className={`absolute z-10 mx-1 my-1.5 h-9 rounded border overflow-hidden group ${
        clip.aiEditType
          ? "bg-amber-600/80 border-amber-500"
          : clip.type === "video" ? "bg-primary/80 border-primary" : "bg-chart-2/80 border-chart-2"
      } ${draggedClip === clip.id ? "opacity-70 cursor-grabbing z-50" : trimState?.clipId === clip.id ? "cursor-ew-resize z-50" : "cursor-grab"} ${
        selectedClipId === clip.id ? "ring-2 ring-white" : ""
      } ${activeClip?.id === clip.id ? "ring-2 ring-red-500/50" : ""}`}
      title={clip.aiReasoning ?? undefined}
      style={{ left: `${visualStartTime}px`, width: `${Math.max(20, visualDuration)}px` }}
    >
      {clip.type === "video" ? (
        <div className="flex h-full items-center gap-1.5 px-2">
          {clip.aiEditType ? (
            <Sparkles className="h-3 w-3 text-amber-200 shrink-0" />
          ) : media?.thumbnail ? (
            <img src={media.thumbnail} alt="" className="h-6 w-10 object-cover rounded-sm shrink-0" />
          ) : (
            <Film className="h-3 w-3 text-primary-foreground/80 shrink-0" />
          )}
          <div className="text-[10px] font-medium text-primary-foreground truncate">{clip.label}</div>
        </div>
      ) : (
        <div className="h-full">
          <div className="flex h-full items-center gap-1.5 px-2">
            <Volume2 className="h-3 w-3 shrink-0 text-foreground/60" />
            <div className="flex h-full flex-1 items-center gap-px">
              {Array.from({ length: Math.min(40, Math.floor(clip.duration / 8)) }).map((_, i) => (
                <div key={i} className="flex-1 bg-foreground/60" style={{ height: `${30 + Math.random() * 70}%` }} />
              ))}
            </div>
          </div>
        </div>
      )}
      <div data-trim-handle="true" className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-linear-to-r from-white/40 to-transparent hover:from-white/70 hover:to-white/20 transition-all z-20 border-r-2 border-white/60 hover:border-white/90 shadow-lg" onMouseDown={(e) => handleTrimStart(e, clip.id, "left")} title="Drag to trim start">
        <div className="absolute inset-y-0 left-0.5 flex flex-col items-center justify-center gap-0.5">
          <div className="w-0.5 h-1 bg-white/80 rounded-full" />
          <div className="w-0.5 h-1 bg-white/80 rounded-full" />
          <div className="w-0.5 h-1 bg-white/80 rounded-full" />
        </div>
      </div>
      <div data-trim-handle="true" className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-linear-to-l from-white/40 to-transparent hover:from-white/70 hover:to-white/20 transition-all z-20 border-l-2 border-white/60 hover:border-white/90 shadow-lg" onMouseDown={(e) => handleTrimStart(e, clip.id, "right")} title="Drag to trim end">
        <div className="absolute inset-y-0 right-0.5 flex flex-col items-center justify-center gap-0.5">
          <div className="w-0.5 h-1 bg-white/80 rounded-full" />
          <div className="w-0.5 h-1 bg-white/80 rounded-full" />
          <div className="w-0.5 h-1 bg-white/80 rounded-full" />
        </div>
      </div>
      <button onClick={(e) => handleDeleteClip(e, clip.id)} className="absolute top-0.5 right-3 rounded bg-background/85 border border-border p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 cursor-pointer z-30 shadow-lg">
        <Trash2 className="h-3 w-3 text-foreground hover:text-white" />
      </button>
    </div>
  )
}

export function Timeline() {
  const {
    mediaFiles,
    timelineClips,
    addClipToTimeline,
    updateClip,
    removeClip,
    selectedClipId,
    setSelectedClipId,
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    timelineEndTime,
    isScrubbing,
    setIsScrubbing,
    activeClip,
    splitClip,
    undo,
    redo,
    canUndo,
    canRedo,
    copyClip,
    pasteClip,
    canPaste,
    zoomLevel,
    zoomIn,
    zoomOut,
    zoomToFit,
    pixelsPerSecond,
    effectBlocks,
    addEffectBlock,
    updateEffectBlock,
    removeEffectBlock,
    selectedEffectBlockId,
    setSelectedEffectBlockId,
    setTimelineViewportWidth,
  } = useEditor()

  // Editing actions
  const handleCut = () => {
    if (activeClip) {
      splitClip(activeClip.id, currentTime)
    }
  }

  const handleDelete = () => {
    if (selectedEffectBlockId) {
      removeEffectBlock(selectedEffectBlockId)
    } else if (selectedClipId) {
      removeClip(selectedClipId)
    } else if (activeClip) {
      removeClip(activeClip.id)
    }
  }

  const handleCopy = () => {
    if (selectedClipId) {
      copyClip(selectedClipId)
    } else if (activeClip) {
      copyClip(activeClip.id)
    }
  }

  // Local state for smooth playhead animation
  const [localPlayheadPosition, setLocalPlayheadPosition] = useState(currentTime * pixelsPerSecond)
  const animationRef = useRef<number | null>(null)
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  // Sync local position with context when not playing or when currentTime/zoom changes
  useEffect(() => {
    if (!isPlaying) {
      setLocalPlayheadPosition(currentTime * pixelsPerSecond)
    }
  }, [currentTime, isPlaying, pixelsPerSecond])

  // Animate playhead smoothly during playback
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      return
    }

    const animate = () => {
      // Read current time from ref (avoids stale closure / deps restart)
      setLocalPlayheadPosition(currentTimeRef.current * pixelsPerSecond)
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [isPlaying, pixelsPerSecond])

  const playheadPosition = localPlayheadPosition

  const [draggedClip, setDraggedClip] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [liveTransform, setLiveTransform] = useState<{ clipId: string; x: number; trackId?: string } | null>(null)
  const draggedClipRef = useRef<string | null>(null)
  const lastUpdateTimeRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const pendingUpdateRef = useRef<{ clipId: string; updates: Partial<TimelineClip> } | null>(null)
  const [trimState, setTrimState] = useState<{
    clipId: string
    edge: 'left' | 'right'
    initialX: number
    initialStartTime: number
    initialDuration: number
    initialMediaOffset: number
  } | null>(null)
  const [liveTrim, setLiveTrim] = useState<{
    clipId: string
    edge: 'left' | 'right'
    deltaX: number
  } | null>(null)
  const [dropTargetTrack, setDropTargetTrack] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    x: number
    trackId: string
    duration: number
    label: string
    isSnapped?: boolean
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    clipId?: string
    effectBlockId?: string
  } | null>(null)
  const [draggedEffectBlockId, setDraggedEffectBlockId] = useState<string | null>(null)
  const [effectDragOffset, setEffectDragOffset] = useState(0) // visual px from block start to click
  const [liveEffectBlockStart, setLiveEffectBlockStart] = useState<number | null>(null)
  const [effectTrimState, setEffectTrimState] = useState<{
    blockId: string
    edge: "left" | "right"
    initialX: number
    initialStartTime: number
    initialDuration: number
  } | null>(null)
  const [liveEffectTrim, setLiveEffectTrim] = useState<{
    blockId: string
    edge: "left" | "right"
    deltaX: number
  } | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const pendingEffectBlockUpdateRef = useRef<{ blockId: string; startTime?: number; duration?: number } | null>(null)

  // Measure timeline viewport width for zoomToFit
  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTimelineViewportWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [setTimelineViewportWidth])

  const [fxExpanded, setFxExpanded] = useState(false)
  const [timelineBodyHeight, setTimelineBodyHeight] = useState(280)
  const timelineBodyRef = useRef<HTMLDivElement>(null)

  /** Effect types that appear in the project (for expanded FX: show only these rows). */
  const effectTypesInProject = useMemo(() => {
    const set = new Set(effectBlocks.map((b) => b.effectType))
    return ORDERED_EFFECT_TYPES.filter((t) => set.has(t))
  }, [effectBlocks])

  /** Track list: collapsed = one FX row; expanded = one row per effect type present, then V2/V1/A2/A1. */
  const tracks = useMemo(() => {
    const videoAudio = ["V2", "V1", "A2", "A1"]
    if (!fxExpanded) return ["FX", ...videoAudio]
    const fxRows = effectTypesInProject.map((t) => `FX:${t}` as const)
    return [...fxRows, ...videoAudio]
  }, [fxExpanded, effectTypesInProject])

  // Timeline layout constants
  const TRACK_HEIGHT = 48 // Track height in pixels (h-12)
  const RULER_HEIGHT = 24 // Ruler height in pixels (h-6)

  const handleTrimStart = useCallback((e: React.MouseEvent, clipId: string, edge: 'left' | 'right') => {
    e.stopPropagation()
    e.preventDefault()
    
    const clip = timelineClips.find(c => c.id === clipId)
    if (!clip || !timelineRef.current) return
    
    const timelineRect = timelineRef.current.getBoundingClientRect()
    const mouseXInTimeline = e.clientX - timelineRect.left - 96
    
    setTrimState({
      clipId,
      edge,
      initialX: mouseXInTimeline,
      initialStartTime: clip.startTime,
      initialDuration: clip.duration,
      initialMediaOffset: clip.mediaOffset,
    })
    setSelectedClipId(clipId)
  }, [timelineClips, setSelectedClipId])

  const handleClipContextMenu = useCallback((e: React.MouseEvent, clipId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      clipId,
    })
    setSelectedClipId(clipId)
    setSelectedEffectBlockId(null)
  }, [setSelectedClipId, setSelectedEffectBlockId])

  const handleEffectBlockContextMenu = useCallback((e: React.MouseEvent, blockId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      effectBlockId: blockId,
    })
    setSelectedEffectBlockId(blockId)
    setSelectedClipId(null)
  }, [setSelectedEffectBlockId, setSelectedClipId])

  const handleEffectBlockMouseDown = useCallback((e: React.MouseEvent, blockId: string) => {
    if ((e.target as HTMLElement).getAttribute("data-effect-trim-handle")) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(null)
    if (!timelineRef.current) return
    const block = effectBlocks.find((b) => b.id === blockId)
    if (!block) return
    const timelineRect = timelineRef.current.getBoundingClientRect()
    const mouseXInTimeline = e.clientX - timelineRect.left - 96
    const blockVisualStart = (block.startTime / PIXELS_PER_SECOND) * pixelsPerSecond
    setEffectDragOffset(mouseXInTimeline - blockVisualStart)
    setDraggedEffectBlockId(blockId)
    setSelectedEffectBlockId(blockId)
  }, [effectBlocks, pixelsPerSecond, setSelectedEffectBlockId])

  const handleEffectTrimStart = useCallback((e: React.MouseEvent, blockId: string, edge: "left" | "right") => {
    e.stopPropagation()
    e.preventDefault()
    const block = effectBlocks.find((b) => b.id === blockId)
    if (!block || !timelineRef.current) return
    const timelineRect = timelineRef.current.getBoundingClientRect()
    const mouseXInTimeline = e.clientX - timelineRect.left - 96
    setEffectTrimState({
      blockId,
      edge,
      initialX: mouseXInTimeline,
      initialStartTime: block.startTime,
      initialDuration: block.duration,
    })
    setSelectedEffectBlockId(blockId)
  }, [effectBlocks, setSelectedEffectBlockId])

  const handleClipMouseDown = useCallback((e: React.MouseEvent, clipId: string) => {
    // Don't start dragging if we're on a trim handle
    if ((e.target as HTMLElement).getAttribute('data-trim-handle')) {
      return
    }
    
    e.preventDefault() // Prevent text selection and default drag behavior
    e.stopPropagation()
    setContextMenu(null) // Close context menu on any click
    if (!timelineRef.current) return
    
    // Calculate offset relative to timeline, not the clip itself
    const timelineRect = timelineRef.current.getBoundingClientRect()
    const clip = timelineClips.find(c => c.id === clipId)
    if (!clip) return
    
    // Calculate where the mouse is within the timeline (visual pixels)
    const mouseXInTimeline = e.clientX - timelineRect.left - 96 // Subtract track label width
    
    // Calculate where the clip starts (visual pixels)
    const clipVisualStart = (clip.startTime / PIXELS_PER_SECOND) * pixelsPerSecond
    
    // The drag offset is how far into the clip the user clicked (visual pixels)
    setDragOffset(mouseXInTimeline - clipVisualStart)
    setDraggedClip(clipId)
    setSelectedClipId(clipId)
  }, [timelineClips, pixelsPerSecond, setSelectedClipId])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
    // Effect block trim
    if (effectTrimState && timelineRef.current) {
      const timelineRect = timelineRef.current.getBoundingClientRect()
      const mouseXInTimeline = e.clientX - timelineRect.left - 96
      const deltaVisual = mouseXInTimeline - effectTrimState.initialX
      const deltaBase = (deltaVisual / pixelsPerSecond) * PIXELS_PER_SECOND
      const minDuration = PIXELS_PER_SECOND * 0.5
      let validDeltaVisual = deltaVisual
      if (effectTrimState.edge === "left") {
        let newStart = Math.max(0, effectTrimState.initialStartTime + deltaBase)
        let newDuration = effectTrimState.initialDuration + (effectTrimState.initialStartTime - newStart)
        if (newDuration < minDuration) {
          newDuration = minDuration
          newStart = effectTrimState.initialStartTime + effectTrimState.initialDuration - minDuration
          validDeltaVisual = (newStart - effectTrimState.initialStartTime) / (PIXELS_PER_SECOND / pixelsPerSecond)
        }
        pendingEffectBlockUpdateRef.current = {
          blockId: effectTrimState.blockId,
          startTime: newStart,
          duration: newDuration,
        }
      } else {
        const newDuration = Math.max(minDuration, effectTrimState.initialDuration + deltaBase)
        pendingEffectBlockUpdateRef.current = {
          blockId: effectTrimState.blockId,
          duration: newDuration,
        }
      }
      setLiveEffectTrim({
        blockId: effectTrimState.blockId,
        edge: effectTrimState.edge,
        deltaX: validDeltaVisual,
      })
      return
    }

    // Effect block drag
    if (draggedEffectBlockId && timelineRef.current) {
      const timelineRect = timelineRef.current.getBoundingClientRect()
      const mouseXInTimeline = e.clientX - timelineRect.left - 96
      const relativeX = mouseXInTimeline - effectDragOffset
      const gridSize = pixelsPerSecond
      const snappedVisualX = Math.max(0, Math.round(relativeX / gridSize) * gridSize)
      const startTimePx = (snappedVisualX / pixelsPerSecond) * PIXELS_PER_SECOND
      pendingEffectBlockUpdateRef.current = { blockId: draggedEffectBlockId, startTime: Math.max(0, startTimePx) }
      setLiveEffectBlockStart(snappedVisualX)
      return
    }

    // Handle trim operations with live visual feedback
    if (trimState && timelineRef.current) {
      const timelineRect = timelineRef.current.getBoundingClientRect()
      const mouseXInTimeline = e.clientX - timelineRect.left - 96
      const deltaVisual = mouseXInTimeline - trimState.initialX
      
      // Check bounds before showing visual feedback
      const deltaBase = (deltaVisual / pixelsPerSecond) * PIXELS_PER_SECOND
      const clip = timelineClips.find(c => c.id === trimState.clipId)
      const media = clip ? mediaFiles.find(m => m.id === clip.mediaId) : null
      if (!clip || !media) return
      
      const maxMediaDuration = media.durationSeconds * PIXELS_PER_SECOND
      let validDeltaVisual = deltaVisual
      
      if (trimState.edge === 'left') {
        const newStartTime = Math.max(0, trimState.initialStartTime + deltaBase)
        const actualDelta = newStartTime - trimState.initialStartTime
        const newDuration = trimState.initialDuration - actualDelta
        const newMediaOffset = trimState.initialMediaOffset + actualDelta
        
        // Clamp the delta to valid bounds
        if (newMediaOffset < 0) {
          // Can't trim before media start
          const maxDelta = -trimState.initialMediaOffset
          validDeltaVisual = (maxDelta / PIXELS_PER_SECOND) * pixelsPerSecond
        } else if (newMediaOffset >= maxMediaDuration) {
          // Can't trim past media end
          const maxDelta = maxMediaDuration - trimState.initialMediaOffset
          validDeltaVisual = (maxDelta / PIXELS_PER_SECOND) * pixelsPerSecond
        } else if (newDuration < PIXELS_PER_SECOND * 0.1) {
          // Minimum duration
          const maxDelta = trimState.initialDuration - PIXELS_PER_SECOND * 0.1
          validDeltaVisual = (maxDelta / PIXELS_PER_SECOND) * pixelsPerSecond
        }
        
        if (newMediaOffset >= 0 && newMediaOffset < maxMediaDuration && newDuration > PIXELS_PER_SECOND * 0.1) {
          pendingUpdateRef.current = {
            clipId: trimState.clipId,
            updates: { startTime: newStartTime, duration: newDuration, mediaOffset: newMediaOffset }
          }
        }
      } else {
        const newDuration = Math.max(PIXELS_PER_SECOND * 0.1, trimState.initialDuration + deltaBase)
        const endInMedia = trimState.initialMediaOffset + newDuration
        
        // Clamp the delta to valid bounds
        if (endInMedia > maxMediaDuration) {
          // Can't extend past media end
          const maxDuration = maxMediaDuration - trimState.initialMediaOffset
          const maxDelta = maxDuration - trimState.initialDuration
          validDeltaVisual = (maxDelta / PIXELS_PER_SECOND) * pixelsPerSecond
        } else if (newDuration < PIXELS_PER_SECOND * 0.1) {
          // Minimum duration
          const minDelta = PIXELS_PER_SECOND * 0.1 - trimState.initialDuration
          validDeltaVisual = (minDelta / PIXELS_PER_SECOND) * pixelsPerSecond
        }
        
        if (endInMedia <= maxMediaDuration && newDuration > PIXELS_PER_SECOND * 0.1) {
          pendingUpdateRef.current = {
            clipId: trimState.clipId,
            updates: { duration: newDuration }
          }
        }
      }
      
      // Only show visual feedback with valid delta
      setLiveTrim({
        clipId: trimState.clipId,
        edge: trimState.edge,
        deltaX: validDeltaVisual
      })
      
      return
    }
    
    if (!draggedClip || !timelineRef.current) return

    const timelineRect = timelineRef.current.getBoundingClientRect()
    const mouseXInTimeline = e.clientX - timelineRect.left - 96
    const relativeY = e.clientY - timelineRect.top
    const relativeX = mouseXInTimeline - dragOffset

    const clip = timelineClips.find(c => c.id === draggedClip)
    if (!clip) return

    const clipVisualDuration = (clip.duration / PIXELS_PER_SECOND) * pixelsPerSecond
    const gridSize = pixelsPerSecond
    let snappedVisualX = Math.max(0, Math.round(relativeX / gridSize) * gridSize)
    
    const snapThreshold = 15
    const trackIndex = Math.floor((relativeY - RULER_HEIGHT) / TRACK_HEIGHT)
    const targetTrack = trackIndex >= 0 && trackIndex < tracks.length ? tracks[trackIndex] : null
    
    if (targetTrack) {
      const otherClips = timelineClips.filter(c => 
        c.trackId === targetTrack && c.id !== draggedClip
      )
      
      for (const otherClip of otherClips) {
        const otherVisualStart = (otherClip.startTime / PIXELS_PER_SECOND) * pixelsPerSecond
        const otherVisualEnd = otherVisualStart + (otherClip.duration / PIXELS_PER_SECOND) * pixelsPerSecond
        
        if (Math.abs(relativeX - otherVisualEnd) < snapThreshold) {
          snappedVisualX = otherVisualEnd
          break
        }
        
        const currentClipEnd = relativeX + clipVisualDuration
        if (Math.abs(currentClipEnd - otherVisualStart) < snapThreshold) {
          snappedVisualX = otherVisualStart - clipVisualDuration
          break
        }
        
        if (Math.abs(relativeX - otherVisualStart) < snapThreshold) {
          snappedVisualX = otherVisualStart
          break
        }
        
        if (Math.abs(currentClipEnd - otherVisualEnd) < snapThreshold) {
          snappedVisualX = otherVisualEnd - clipVisualDuration
          break
        }
      }
    }
    
    // Validate target track compatibility (clips only on V/A tracks, not FX)
    const snappedX = (snappedVisualX / pixelsPerSecond) * PIXELS_PER_SECOND
    let validTargetTrack: string | undefined = undefined
    
    if (targetTrack && !targetTrack.startsWith("FX")) {
      const isVideoTrack = targetTrack.startsWith("V")
      const isVideoClip = clip.type === "video"
      
      if ((isVideoClip && isVideoTrack) || (!isVideoClip && !isVideoTrack)) {
        validTargetTrack = targetTrack
      }
    }
    
    // Instant visual feedback with CSS transform
    setLiveTransform({
      clipId: draggedClip,
      x: snappedVisualX,
      trackId: validTargetTrack
    })

    const updates: Partial<TimelineClip> = { startTime: snappedX }
    if (validTargetTrack && validTargetTrack !== clip.trackId) {
      updates.trackId = validTargetTrack
    }

    pendingUpdateRef.current = { clipId: draggedClip, updates }
    },
    [draggedClip, dragOffset, timelineClips, tracks, pixelsPerSecond, trimState, mediaFiles, effectTrimState, draggedEffectBlockId, effectDragOffset]
    )

  const handleMouseUp = useCallback(() => {
    // Apply effect block updates from ref (set during mousemove)
    if (pendingEffectBlockUpdateRef.current) {
      const { blockId, startTime, duration } = pendingEffectBlockUpdateRef.current
      updateEffectBlock(blockId, { ...(startTime !== undefined && { startTime }), ...(duration !== undefined && { duration }) })
      pendingEffectBlockUpdateRef.current = null
    }

    setEffectTrimState(null)
    setLiveEffectTrim(null)
    setDraggedEffectBlockId(null)
    setEffectDragOffset(0)
    setLiveEffectBlockStart(null)

    // Apply any pending clip updates
    if (pendingUpdateRef.current) {
      updateClip(pendingUpdateRef.current.clipId, pendingUpdateRef.current.updates)
      pendingUpdateRef.current = null
    }
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    
    setDraggedClip(null)
    draggedClipRef.current = null
    setDragOffset(0)
    setLiveTransform(null)
    setLiveTrim(null)
    setTrimState(null)
    lastUpdateTimeRef.current = 0
  }, [updateClip, updateEffectBlock])

  // Close context menu on click anywhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    const handleScroll = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      document.addEventListener('scroll', handleScroll, true)
      return () => {
        document.removeEventListener('click', handleClick)
        document.removeEventListener('scroll', handleScroll, true)
      }
    }
  }, [contextMenu])

  useEffect(() => {
    if (draggedClip || trimState || draggedEffectBlockId || effectTrimState) {
      // Use capture phase to ensure we always get the mouseup event
      const handleMouseUpCapture = (e: MouseEvent) => {
        handleMouseUp()
      }
      
      // Handle Escape key to cancel drag/trim
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          handleMouseUp()
        }
      }
      
      // Listen on both window and document to catch all mouseup events
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUpCapture, true) // Capture phase
      document.addEventListener("mouseup", handleMouseUpCapture, true) // Also on document
      
      // Also clear drag state if mouse leaves the window
      window.addEventListener("mouseleave", handleMouseUp)
      
      // Allow Escape key to cancel drag/trim
      window.addEventListener("keydown", handleEscape)
      
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUpCapture, true)
        document.removeEventListener("mouseup", handleMouseUpCapture, true)
        window.removeEventListener("mouseleave", handleMouseUp)
        window.removeEventListener("keydown", handleEscape)
      }
    }
  }, [draggedClip, trimState, handleMouseMove, handleMouseUp])

  // Handle drops from media panel (and effect palette onto FX track)
  const handleTrackDragOver = useCallback((e: React.DragEvent, trackId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Effect block drop onto FX track (collapsed "FX" or expanded "FX:effectType")
    if (trackId === "FX" || trackId.startsWith("FX:")) {
      const isEffectDrag = e.dataTransfer.types.includes(EFFECT_DRAG_DATA_TYPE)
      if (isEffectDrag && timelineRef.current) {
        setDropTargetTrack(trackId)
        const rowLabel = trackId === "FX" ? "Effect" : (EFFECT_TYPE_LABELS[trackId.slice(3) as ModularEffectType] ?? "Effect")
        const timelineRect = timelineRef.current.getBoundingClientRect()
        const relativeX = e.clientX - timelineRect.left + timelineRef.current.scrollLeft
        const gridSize = pixelsPerSecond
        const snappedX = Math.max(0, Math.round(relativeX / gridSize) * gridSize)
        const durationPx = (DEFAULT_EFFECT_DURATION_PX / PIXELS_PER_SECOND) * pixelsPerSecond
        setDragPreview({
          trackId,
          x: snappedX,
          duration: durationPx,
          label: rowLabel,
          isSnapped: false,
        })
      } else {
        setDropTargetTrack(null)
        setDragPreview(null)
      }
      return
    }

    setDropTargetTrack(trackId)

    // Media drops only on video/audio tracks
    const mediaId = e.dataTransfer.getData("application/x-media-id")
    if (!mediaId || !timelineRef.current) return
    if (trackId === "FX" || trackId.startsWith("FX:")) return

    const media = mediaFiles.find((m) => m.id === mediaId)
    if (!media) return

    // Calculate position relative to timeline
    const timelineRect = timelineRef.current.getBoundingClientRect()
    const relativeX = e.clientX - timelineRect.left - 96 // Subtract track label width

    // Check for NLP search result time range to get duration
    const clipStartStr = e.dataTransfer.getData("application/x-clip-start")
    const clipEndStr = e.dataTransfer.getData("application/x-clip-end")
    
    let clipDuration: number
    
    if (clipStartStr && clipEndStr) {
      const clipStart = parseFloat(clipStartStr)
      const clipEnd = parseFloat(clipEndStr)
      clipDuration = (clipEnd - clipStart) * pixelsPerSecond
    } else {
      clipDuration = Math.max(80, media.durationSeconds * pixelsPerSecond)
    }

    // Snap to grid based on zoom level (visual pixels)
    const gridSize = pixelsPerSecond // 1 second grid
    let snappedX = Math.max(0, Math.round(relativeX / gridSize) * gridSize)

    // Snap to other clips on this track (higher priority than grid)
    const snapThreshold = 15 // Pixels
    const clipsOnTrack = timelineClips.filter(c => c.trackId === trackId)
    let isSnapped = false
    
    for (const clip of clipsOnTrack) {
      const clipVisualStart = (clip.startTime / PIXELS_PER_SECOND) * pixelsPerSecond
      const clipVisualEnd = clipVisualStart + (clip.duration / PIXELS_PER_SECOND) * pixelsPerSecond
      
      // Snap to the end of existing clip (place new clip right after)
      if (Math.abs(relativeX - clipVisualEnd) < snapThreshold) {
        snappedX = clipVisualEnd
        isSnapped = true
        break
      }
      
      // Snap to the start of existing clip (place new clip right before)
      const newClipEnd = relativeX + clipDuration
      if (Math.abs(newClipEnd - clipVisualStart) < snapThreshold) {
        snappedX = clipVisualStart - clipDuration
        isSnapped = true
        break
      }
      
      // Snap start to start
      if (Math.abs(relativeX - clipVisualStart) < snapThreshold) {
        snappedX = clipVisualStart
        isSnapped = true
        break
      }
      
      // Snap end to end
      if (Math.abs(newClipEnd - clipVisualEnd) < snapThreshold) {
        snappedX = clipVisualEnd - clipDuration
        isSnapped = true
        break
      }
    }

    // Format label for preview
    let clipLabel = media.name
    if (clipStartStr && clipEndStr) {
      const clipStart = parseFloat(clipStartStr)
      const clipEnd = parseFloat(clipEndStr)
      const formatTime = (s: number) => {
        const mins = Math.floor(s / 60)
        const secs = Math.floor(s % 60)
        return `${mins}:${secs.toString().padStart(2, "0")}`
      }
      clipLabel = `${media.name} (${formatTime(clipStart)} - ${formatTime(clipEnd)})`
    }

    setDragPreview({
      x: snappedX,
      trackId,
      duration: clipDuration,
      label: clipLabel,
      isSnapped,
    })
  }, [mediaFiles, pixelsPerSecond, timelineClips])

  const handleTrackDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.currentTarget === e.target) {
      setDropTargetTrack(null)
      setDragPreview(null)
    }
  }, [])

  useEffect(() => {
    const clearDragState = () => {
      setDropTargetTrack(null)
      setDragPreview(null)
    }
    window.addEventListener("dragend", clearDragState)
    return () => window.removeEventListener("dragend", clearDragState)
  }, [])

  const handleTrackDrop = useCallback(
    (e: React.DragEvent, trackId: string) => {
      e.preventDefault()
      e.stopPropagation()

      const previewPosition = dragPreview?.x

      setDropTargetTrack(null)
      setDragPreview(null)

      // Effect block drop on FX track (collapsed or expanded row)
      const draggedType = e.dataTransfer.getData(EFFECT_DRAG_DATA_TYPE) as ModularEffectType | ""
      const isFxRow = trackId === "FX" || trackId.startsWith("FX:")
      const effectTypeForBlock = trackId === "FX" ? draggedType : trackId.startsWith("FX:") ? (trackId.slice(3) as ModularEffectType) : null
      if (isFxRow && effectTypeForBlock && EFFECT_TYPE_LABELS[effectTypeForBlock]) {
        if (trackId.startsWith("FX:") && draggedType !== effectTypeForBlock) return
        const startTimePx = previewPosition !== undefined
          ? (previewPosition / pixelsPerSecond) * PIXELS_PER_SECOND
          : 0
        const block: EffectBlockData = {
          id: `effect-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          effectType: effectTypeForBlock,
          startTime: Math.max(0, startTimePx),
          duration: DEFAULT_EFFECT_DURATION_PX,
        }
        addEffectBlock(block)
        return
      }

      const mediaId = e.dataTransfer.getData("application/x-media-id")
      if (!mediaId) return
      if (trackId === "FX") return // FX track only accepts effect blocks

      const media = mediaFiles.find((m) => m.id === mediaId)
      if (!media) return

      // Check for NLP search result time range (from AI search)
      const clipStartStr = e.dataTransfer.getData("application/x-clip-start")
      const clipEndStr = e.dataTransfer.getData("application/x-clip-end")
      
      let mediaOffset = 0 // Start from beginning of source media by default
      let clipDuration: number
      let clipLabel = media.name
      
      if (clipStartStr && clipEndStr) {
        // NLP search result with specific time range
        const clipStart = parseFloat(clipStartStr)
        const clipEnd = parseFloat(clipEndStr)
        mediaOffset = clipStart * PIXELS_PER_SECOND // Convert seconds to base pixels
        clipDuration = Math.max(80, (clipEnd - clipStart) * PIXELS_PER_SECOND)
        
        // Format time for label
        const formatTime = (s: number) => {
          const mins = Math.floor(s / 60)
          const secs = Math.floor(s % 60)
          return `${mins}:${secs.toString().padStart(2, "0")}`
        }
        clipLabel = `${media.name} (${formatTime(clipStart)} - ${formatTime(clipEnd)})`
      } else {
        // Full media clip
        clipDuration = Math.max(80, media.durationSeconds * PIXELS_PER_SECOND)
      }

      // Use preview position if available (includes snapping), otherwise calculate position
      let startPosition: number
      if (previewPosition !== undefined) {
        // Convert visual pixels from preview to base pixels
        startPosition = (previewPosition / pixelsPerSecond) * PIXELS_PER_SECOND
      } else {
        // Fallback: Find clips on this track and get the end position of the last one
        const clipsOnTrack = timelineClips.filter((clip) => clip.trackId === trackId)
        
        if (clipsOnTrack.length === 0) {
          // No clips on track - place at the beginning
          startPosition = 0
        } else {
          // Find the rightmost clip end position
          const lastClipEnd = clipsOnTrack.reduce((max, clip) => {
            const clipEnd = clip.startTime + clip.duration
            return Math.max(max, clipEnd)
          }, 0)
          startPosition = lastClipEnd
        }
      }

      // Determine clip type from media MIME type, auto-route to correct track
      const isAudioMedia = media.type.startsWith("audio/")
      const clipType: "video" | "audio" = isAudioMedia ? "audio" : "video"
      // If audio media is dropped on a video track, auto-route to A1
      const resolvedTrackId = isAudioMedia && trackId.startsWith("V") ? "A1" : trackId

      // Recalculate start position for the resolved track (when auto-routed)
      if (resolvedTrackId !== trackId && previewPosition === undefined) {
        const clipsOnResolved = timelineClips.filter((clip) => clip.trackId === resolvedTrackId)
        if (clipsOnResolved.length === 0) {
          startPosition = 0
        } else {
          startPosition = clipsOnResolved.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0)
        }
      }

      const newClip: TimelineClip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        mediaId: media.id,
        trackId: resolvedTrackId,
        startTime: startPosition,
        duration: clipDuration,
        mediaOffset: mediaOffset,
        label: clipLabel,
        type: clipType,
        transform: DEFAULT_CLIP_TRANSFORM,
        effects: DEFAULT_CLIP_EFFECTS,
      }

      addClipToTimeline(newClip)
    },
    [mediaFiles, timelineClips, addClipToTimeline, addEffectBlock, dragPreview, pixelsPerSecond]
  )

  // Calculate time from mouse position
  const getTimeFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!timelineRef.current) return null
    const timelineRect = timelineRef.current.getBoundingClientRect()
    const relativeX = e.clientX - timelineRect.left
    if (relativeX >= 0) {
      return Math.max(0, relativeX / pixelsPerSecond)
    }
    return null
  }, [pixelsPerSecond])

  // Handle scrubbing (drag to move playhead)
  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current) return
      
      // Prevent text selection during drag
      e.preventDefault()
      e.stopPropagation()
      
      // Check if we clicked on a clip or effect block
      const target = e.target as HTMLElement
      if (target.closest("[data-clip-id]") || target.closest("[data-effect-block-id]")) return

      const newTime = getTimeFromMouseEvent(e)
      if (newTime !== null) {
        // Pause playback if playing
        if (isPlaying) {
          setIsPlaying(false)
        }
        // Allow dragging past the timeline end
        const clampedTime = Math.max(0, newTime)
        setCurrentTime(clampedTime)
        setSelectedClipId(null)
        setIsScrubbing(true)
      }
    },
    [setCurrentTime, setSelectedClipId, getTimeFromMouseEvent, setIsScrubbing, isPlaying, setIsPlaying]
  )

  // Handle scrubbing mousemove — RAF-throttled to avoid 30-50ms/frame jank
  const pendingScrubTimeRef = useRef<number | null>(null)
  const scrubRafRef = useRef<number | null>(null)

  const handleScrubMove = useCallback(
    (e: MouseEvent) => {
      if (!isScrubbing) return
      e.preventDefault()
      e.stopPropagation()
      const newTime = getTimeFromMouseEvent(e)
      if (newTime !== null) {
        pendingScrubTimeRef.current = Math.max(0, newTime)
        if (scrubRafRef.current === null) {
          scrubRafRef.current = requestAnimationFrame(() => {
            if (pendingScrubTimeRef.current !== null) {
              setCurrentTime(pendingScrubTimeRef.current)
              pendingScrubTimeRef.current = null
            }
            scrubRafRef.current = null
          })
        }
      }
    },
    [isScrubbing, setCurrentTime, getTimeFromMouseEvent]
  )

  // Handle scrubbing mouseup — flush any pending RAF
  const handleScrubEnd = useCallback(() => {
    if (scrubRafRef.current !== null) {
      cancelAnimationFrame(scrubRafRef.current)
      scrubRafRef.current = null
    }
    if (pendingScrubTimeRef.current !== null) {
      setCurrentTime(pendingScrubTimeRef.current)
      pendingScrubTimeRef.current = null
    }
    setIsScrubbing(false)
  }, [setCurrentTime])

  // Add/remove scrubbing event listeners
  useEffect(() => {
    if (isScrubbing) {
      // Prevent text selection globally during scrubbing
      const originalUserSelect = document.body.style.userSelect
      const originalCursor = document.body.style.cursor
      const originalWebkitUserSelect = (document.body.style as any).webkitUserSelect
      
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ew-resize'
      ;(document.body.style as any).webkitUserSelect = 'none'
      
      // Also prevent selection on the document
      const preventSelect = (e: Event) => e.preventDefault()
      document.addEventListener('selectstart', preventSelect)
      document.addEventListener('dragstart', preventSelect)
      
      window.addEventListener("mousemove", handleScrubMove)
      window.addEventListener("mouseup", handleScrubEnd)
      return () => {
        document.body.style.userSelect = originalUserSelect
        document.body.style.cursor = originalCursor
        ;(document.body.style as any).webkitUserSelect = originalWebkitUserSelect
        document.removeEventListener('selectstart', preventSelect)
        document.removeEventListener('dragstart', preventSelect)
        window.removeEventListener("mousemove", handleScrubMove)
        window.removeEventListener("mouseup", handleScrubEnd)
      }
    }
  }, [isScrubbing, handleScrubMove, handleScrubEnd])

  // Handle scroll wheel zoom on timeline
  useEffect(() => {
    const timelineElement = timelineRef.current
    if (!timelineElement) return

    const handleWheel = (e: WheelEvent) => {
      // Check if Ctrl or Cmd is pressed (standard zoom gesture)
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        
        // Determine zoom direction (negative deltaY = zoom in, positive = zoom out)
        if (e.deltaY < 0) {
          // Zoom in
          if (zoomLevel < 500) {
            zoomIn()
          }
        } else {
          // Zoom out
          if (zoomLevel > 25) {
            zoomOut()
          }
        }
      }
    }

    timelineElement.addEventListener('wheel', handleWheel, { passive: false })
    
    return () => {
      timelineElement.removeEventListener('wheel', handleWheel)
    }
  }, [zoomLevel, zoomIn, zoomOut])

  const handleTimelineResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = timelineBodyHeight
    const minH = 120
    const maxH = 720
    const onMove = (e: MouseEvent) => {
      const dy = e.clientY - startY
      setTimelineBodyHeight(Math.min(maxH, Math.max(minH, startH + dy)))
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [timelineBodyHeight])

  const handleDeleteClip = useCallback(
    (e: React.MouseEvent, clipId: string) => {
      e.stopPropagation()
      removeClip(clipId)
    },
    [removeClip]
  )

  const contextMenuPopup =
    contextMenu != null ? (
      <div
        className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {contextMenu.effectBlockId != null ? (
          <button
            className="w-full px-3 py-2 text-sm text-left hover:bg-destructive hover:text-destructive-foreground flex items-center gap-2 cursor-pointer"
            onClick={() => {
              removeEffectBlock(contextMenu.effectBlockId!)
              setContextMenu(null)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove effect block
            <span className="ml-auto text-xs text-muted-foreground">Del</span>
          </button>
        ) : (
          <>
            <button
              className="w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2 cursor-pointer"
              onClick={() => {
                const clip = timelineClips.find(c => c.id === contextMenu.clipId)
                if (clip && contextMenu.clipId) splitClip(contextMenu.clipId, currentTime)
                setContextMenu(null)
              }}
              disabled={!activeClip || activeClip?.id !== contextMenu.clipId}
            >
              <Scissors className="h-3.5 w-3.5" />
              Split at Playhead
              <span className="ml-auto text-xs text-muted-foreground">S</span>
            </button>
            <button
              className="w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2 cursor-pointer"
              onClick={() => {
                if (contextMenu.clipId) copyClip(contextMenu.clipId)
                setContextMenu(null)
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+C</span>
            </button>
            <div className="h-px bg-border my-1" />
            <button
              className="w-full px-3 py-2 text-sm text-left hover:bg-destructive hover:text-destructive-foreground flex items-center gap-2 cursor-pointer"
              onClick={() => {
                if (contextMenu.clipId) removeClip(contextMenu.clipId)
                setContextMenu(null)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
              <span className="ml-auto text-xs text-muted-foreground">Del</span>
            </button>
          </>
        )}
      </div>
    ) : null;

  const timelineUI = (
    <div className="relative flex h-full flex-col bg-card/70">
      {/* Timeline Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="text-xs font-medium text-foreground">Timeline</div>
          {/* Editing Toolbar */}
          <div className="flex items-center gap-1 border-l border-border pl-3 ml-3">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant={activeClip ? "default" : "ghost"}
                size="sm"
                className={`h-7 w-7 p-0 transition-colors ${
                  activeClip ? "bg-primary text-primary-foreground shadow-md" : ""
                }`}
                onClick={handleCut}
                disabled={!activeClip}
                title="Split clip at playhead (S)"
              >
                <Scissors className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleDelete}
                disabled={!selectedClipId && !activeClip && !selectedEffectBlockId}
                title="Delete clip or effect (Delete)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
            <div className="w-px h-3 bg-border mx-0.5" />
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z / Cmd+Z)"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z)"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
            <div className="w-px h-3 bg-border mx-0.5" />
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleCopy}
                disabled={!selectedClipId && !activeClip}
                title="Copy clip (Ctrl+C / Cmd+C)"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={pasteClip}
                disabled={!canPaste}
                title="Paste clip (Ctrl+V / Cmd+V)"
              >
                <Clipboard className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
          </div>
          <div className="font-mono text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
            {formatRulerTime(currentTime)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button 
            onClick={zoomToFit}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Zoom to fit all clips"
          >
            Fit
          </motion.button>
          <div className="flex items-center gap-1">
            <motion.button 
              onClick={zoomOut}
              disabled={zoomLevel <= 25}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: zoomLevel > 25 ? 1.05 : 1 }}
              whileTap={{ scale: zoomLevel > 25 ? 0.95 : 1 }}
              title="Zoom out (max 10 minutes)"
            >
              −
            </motion.button>
            <div className="px-2 text-xs text-muted-foreground font-mono min-w-[48px] text-center">
              {zoomLevel}%
            </div>
            <motion.button 
              onClick={zoomIn}
              disabled={zoomLevel >= 500}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: zoomLevel < 500 ? 1.05 : 1 }}
              whileTap={{ scale: zoomLevel < 500 ? 0.95 : 1 }}
              title="Zoom in (max detail)"
            >
              +
            </motion.button>
          </div>
          <div className="w-px h-4 bg-border" />
          <motion.button
            onClick={() => setFxExpanded((v) => !v)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={fxExpanded ? "Collapse FX (single overlapping row)" : "Expand FX (one row per effect type)"}
          >
            <Wand2 className="h-3 w-3" />
            {fxExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            <span>{fxExpanded ? "Collapse FX" : "Expand FX"}</span>
          </motion.button>
        </div>
      </div>

      {/* Timeline Tracks: scrollable + resizable body so labels and grid stay aligned */}
      <div
        className="flex flex-col min-h-0"
        style={{ height: timelineBodyHeight }}
        ref={timelineBodyRef}
      >
        <TimelineScrollContent />
        <div
          className="flex h-2 shrink-0 cursor-ns-resize items-center justify-center border-t border-border bg-secondary/50 hover:bg-secondary transition-colors"
          onMouseDown={handleTimelineResizeStart}
          title="Drag to resize timeline height"
          role="separator"
          aria-orientation="horizontal"
        >
          <GripHorizontal className="h-3 w-3 rotate-90 text-muted-foreground" />
        </div>
      </div>
    </div>
  );

  const timelineCtx: TimelineCtx = {
    tracks,
    playheadPosition,
    zoomLevel,
    pixelsPerSecond,
    isScrubbing,
    setIsScrubbing,
    isPlaying,
    setIsPlaying,
    setCurrentTime,
    timelineClips,
    mediaFiles,
    effectBlocks,
    removeEffectBlock,
    selectedEffectBlockId,
    selectedClipId,
    activeClip,
    dropTargetTrack,
    dragPreview,
    liveTransform,
    liveTrim,
    draggedClip,
    trimState,
    draggedEffectBlockId,
    liveEffectBlockStart,
    liveEffectTrim,
    effectTrimState,
    timelineRef,
    handleTrackDragOver,
    handleTrackDragLeave,
    handleTrackDrop,
    handleEffectBlockMouseDown,
    handleEffectBlockContextMenu,
    handleEffectTrimStart,
    handleClipMouseDown,
    handleClipContextMenu,
    handleTrimStart,
    handleDeleteClip,
    handleTimelineMouseDown,
    getTimeFromMouseEvent,
  }

  return (
    <TimelineContext.Provider value={timelineCtx}>
      <>
        {timelineUI}
        {contextMenuPopup}
      </>
    </TimelineContext.Provider>
  )
}