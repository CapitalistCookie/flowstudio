"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Pause, Play, Square } from "lucide-react"
import { useRecordingStore } from "@/lib/stores/recording-store"

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

export default function RecordPage() {
  const router = useRouter()
  const { isRecording, isPaused, elapsedSeconds, startRecording, pauseRecording, resumeRecording, stopRecording, tick } = useRecordingStore()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    startRecording()

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startRecording])

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(tick, 1000)
      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }

    if (timerRef.current) clearInterval(timerRef.current)
    return undefined
  }, [isRecording, isPaused, tick])

  const handlePlayAction = () => {
    if (!isRecording) {
      startRecording()
      return
    }

    if (isPaused) {
      resumeRecording()
    }
  }

  const handlePause = () => {
    if (isRecording && !isPaused) {
      pauseRecording()
    }
  }

  const handleStop = () => {
    stopRecording()
    router.push("/record/preview")
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/assets/image_2026-03-14_010105433_imgupscaler.ai_General_4K.jpg')",
        }}
      />

      <div className="absolute inset-0 bg-black/25" />

      <button
        type="button"
        aria-label="Play"
        onClick={handlePlayAction}
        className="absolute left-6 top-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-black/35 text-white shadow-lg backdrop-blur-sm transition duration-200 hover:scale-105 hover:bg-black/45 hover:shadow-[0_0_24px_rgba(245,166,35,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
      >
        <Play className="h-5 w-5 fill-current" />
      </button>

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 py-8">
        <div className="relative flex w-full max-w-xl flex-col items-center justify-center gap-5 text-center text-white">
          <div className="pointer-events-none absolute left-1/2 top-[-56px] h-[260px] w-px -translate-x-1/2 bg-gradient-to-b from-[#F5A623]/20 via-[#F5A623]/75 to-[#F5A623]/20 shadow-[0_0_16px_rgba(245,166,35,0.3)] animate-pulse" />

          <p className="font-mono text-[clamp(3rem,9vw,6rem)] font-bold leading-none tracking-tight">
            {formatTime(elapsedSeconds)}
          </p>

          <p className="flex items-center gap-2 text-base font-medium text-white/95 sm:text-lg">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#F5A623]" />
            Recording in progress
          </p>

          <div className="mt-3 flex items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={handlePause}
              disabled={!isRecording || isPaused}
              className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl border border-white/35 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm transition duration-200 hover:scale-[1.02] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </button>

            <button
              type="button"
              onClick={handleStop}
              className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl bg-[#E75A4D] px-6 text-sm font-semibold text-white shadow-lg transition duration-200 hover:scale-[1.02] hover:bg-[#DA4C3E] hover:shadow-[0_8px_24px_rgba(231,90,77,0.35)]"
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
