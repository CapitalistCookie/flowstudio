"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth/use-auth"
import { Pause, Play, Square } from "lucide-react"
import { useCaptureStore } from "@/lib/capture/capture-store"
import {
  startCapture,
  pauseCapture,
  resumeCapture,
  stopCapture,
} from "@/lib/capture/capture-service"
import { getConnection, isConnected } from "@/lib/stdb/spacetimedb"

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

export default function RecordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const projectId = searchParams.get("projectId")

  const status = useCaptureStore((s) => s.status)
  const elapsedMs = useCaptureStore((s) => s.elapsedMs)
  const error = useCaptureStore((s) => s.error)

  useEffect(() => {
    if (!projectId && status === "idle") {
      const newId = crypto.randomUUID()
      if (isConnected() && user?.uid) {
        try {
          const conn = getConnection()
          conn.reducers.createProject({
            id: newId,
            name: "Untitled Recording",
            ownerId: user.uid,
            metadata: JSON.stringify({}),
          })
        } catch {
          /* STDB not ready */
        }
      }
      router.replace(`/record?projectId=${newId}`)
    }
  }, [projectId, status, router, user])

  useEffect(() => {
    if (projectId && status === "idle") {
      startCapture()
    }
  }, [projectId, status])

  useEffect(() => {
    if (status === "done") {
      router.push(`/record/preview${projectId ? `?projectId=${projectId}` : ""}`)
    }
  }, [status, router, projectId])

  const handleTogglePause = () => {
    if (status === "recording") {
      pauseCapture()
    } else if (status === "paused") {
      resumeCapture()
    }
  }

  const handleStop = () => {
    stopCapture()
  }

  const isRecording = status === "recording" || status === "paused"
  const isPaused = status === "paused"

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/assets/image_2026-03-14_010105433_imgupscaler.ai_General_4K.jpg')",
        }}
      />

      <div className="absolute inset-0 bg-black/25" />

      {error && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg border border-red-500/50 bg-red-900/80 px-4 py-2 text-sm text-white backdrop-blur-sm">
          {error}
        </div>
      )}

      <div className="absolute left-6 top-6 z-20 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">
        <span className={`h-2 w-2 rounded-full ${isPaused ? "bg-[#F5A623]" : status === "preparing" ? "bg-blue-400 animate-pulse" : "bg-[#FF5A4C]"}`} />
        {status === "preparing" ? "Starting..." : isPaused ? "Paused" : "Recording"}
      </div>

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 py-8">
        <div className="relative flex w-full max-w-xl flex-col items-center justify-center gap-5 text-center text-white">
          <div className="pointer-events-none absolute left-1/2 top-[-56px] h-[260px] w-px -translate-x-1/2 bg-gradient-to-b from-[#F5A623]/20 via-[#F5A623]/75 to-[#F5A623]/20 shadow-[0_0_16px_rgba(245,166,35,0.3)] animate-pulse" />

          <p className="font-mono text-[clamp(3rem,9vw,6rem)] font-bold leading-none tracking-tight">
            {formatTime(elapsedMs)}
          </p>

          <p className="flex items-center gap-2 text-base font-medium text-white/95 sm:text-lg">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#F5A623]" />
            {status === "preparing" ? "Starting screen capture..." : isPaused ? "Recording paused" : "Recording in progress"}
          </p>

          <div className="mt-3 flex items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={!isRecording}
              className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl border border-white/35 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm transition duration-200 hover:scale-[1.02] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPaused ? <Play className="mr-2 h-4 w-4 fill-current" /> : <Pause className="mr-2 h-4 w-4" />}
              {isPaused ? "Play" : "Pause"}
            </button>

            <button
              type="button"
              onClick={handleStop}
              disabled={!isRecording}
              className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl bg-[#E75A4D] px-6 text-sm font-semibold text-white shadow-lg transition duration-200 hover:scale-[1.02] hover:bg-[#DA4C3E] hover:shadow-[0_8px_24px_rgba(231,90,77,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Square className="mr-2 h-4 w-4 fill-current" />
              Stop
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
