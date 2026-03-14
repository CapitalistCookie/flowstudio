"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Pause, Play, Square, MousePointer, Target, Keyboard, PauseCircle, Mic, Scan } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FluxLogo } from "@/components/flux-logo"
import { useRecordingStore } from "@/lib/stores/recording-store"

const streamIcons: Record<string, React.ElementType> = {
  "mouse-pointer": MousePointer,
  target: Target,
  keyboard: Keyboard,
  "pause-circle": PauseCircle,
  mic: Mic,
  scan: Scan,
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

export function RecordView() {
  const router = useRouter()
  const { isRecording, isPaused, elapsedSeconds, streams, startRecording, pauseRecording, resumeRecording, stopRecording, tick } = useRecordingStore()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-start recording on mount
  useEffect(() => {
    startRecording()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startRecording])

  // Timer tick
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(tick, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording, isPaused, tick])

  const handleStop = () => {
    stopRecording()
    router.push("/studio")
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Top Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <motion.div whileHover="hover" whileTap={{ scale: 0.97 }}>
            <Button variant="ghost" size="sm" className="gap-2 cursor-pointer" onClick={() => router.push("/")}>
              <motion.div
                variants={{
                  hover: { x: -3, transition: { type: "spring", stiffness: 400, damping: 20 } },
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </motion.div>
              Dashboard
            </Button>
          </motion.div>
          <div className="h-4 w-px bg-border" />
          <FluxLogo size="sm" />
        </div>

        <div className="flex items-center gap-3">
          {/* Recording indicator */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-[oklch(0.78_0.16_75)] animate-pulse-amber" />
              {isRecording && !isPaused && (
                <div className="absolute inset-0 h-3 w-3 rounded-full bg-[oklch(0.78_0.16_75)] animate-recording-ring" />
              )}
            </div>
            <span className="text-sm font-medium text-[oklch(0.78_0.16_75)]">
              {isPaused ? "Paused" : "Recording"}
            </span>
            <span className="font-mono text-sm text-muted-foreground">
              {formatTime(elapsedSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Recording Canvas */}
        <motion.div
          className="flex flex-1 flex-col items-center justify-center gap-8 p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="text-center max-w-lg">
            <motion.p
              className="text-xs font-mono uppercase tracking-widest text-[oklch(0.78_0.16_75)] mb-3"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Trust Moment
            </motion.p>
            <motion.h1
              className="text-3xl font-bold text-foreground leading-tight"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Record naturally.{" "}
              <span className="text-muted-foreground">We handle the structure.</span>
            </motion.h1>
            <motion.p
              className="mt-4 text-sm text-muted-foreground leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              FluxStudio captures cursor movement, click targets, dwell behavior,
              keyboard bursts, speech, and scene semantics — all while staying nearly invisible.
            </motion.p>
          </div>

          {/* Controls */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => (isPaused ? resumeRecording() : pauseRecording())}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {isPaused ? "Resume" : "Pause"}
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-[oklch(0.78_0.16_75)] hover:bg-[oklch(0.72_0.18_75)] text-[oklch(0.15_0.02_75)]"
              onClick={handleStop}
            >
              <Square className="h-4 w-4" />
              Stop & Analyze
            </Button>
          </motion.div>
        </motion.div>

        {/* Intent Streams Panel */}
        <motion.div
          className="w-80 shrink-0 border-l border-border bg-card overflow-auto"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">Intent Streams</h2>
            <div className="flex flex-col gap-2">
              {streams.map((stream, index) => {
                const Icon = streamIcons[stream.icon] || Scan
                return (
                  <motion.div
                    key={stream.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/30"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[oklch(0.78_0.16_75_/_0.1)]">
                      <Icon className="h-4 w-4 text-[oklch(0.78_0.16_75)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{stream.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{stream.description}</div>
                    </div>
                    <span className="font-mono text-xs font-medium text-[oklch(0.78_0.16_75)]">
                      {stream.eventCount.toLocaleString()}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
