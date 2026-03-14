"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles, Wand2 } from "lucide-react"
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

export default function RecordingPreviewPage() {
  const router = useRouter()
  const { elapsedSeconds } = useRecordingStore()
  const [pendingAction, setPendingAction] = useState<"auto" | "tweak" | null>(null)

  const safeElapsed = useMemo(() => Math.max(0, elapsedSeconds), [elapsedSeconds])

  const goToStudio = (mode: "auto" | "tweak") => {
    setPendingAction(mode)
    router.push(mode === "auto" ? "/studio?edits=auto" : "/studio?edits=tweak")
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/assets/image_2026-03-14_010105433_imgupscaler.ai_General_4K.jpg')",
        }}
      />
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(245,166,35,0.18),transparent_52%)]" />

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-black/35 shadow-[0_30px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/60">Recording preview</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Choose what happens next</h1>
            <p className="mt-2 text-sm text-white/75 sm:text-base">Apply smart edits instantly, or open in studio and fine-tune every cut.</p>
          </div>

          <div className="grid gap-6 p-6 sm:p-8">
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/35">
              <div className="aspect-video w-full bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]">
                <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs text-white/85">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#F5A623]" />
                  Captured session
                </div>
                <div className="absolute right-5 top-5 rounded-full border border-white/15 bg-black/45 px-3 py-1 font-mono text-xs text-white/85">
                  {formatTime(safeElapsed)}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full border border-white/15 bg-black/40 p-4 text-white/75">
                    <Sparkles className="h-8 w-8" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => goToStudio("auto")}
                disabled={pendingAction !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white transition duration-200 hover:scale-[1.01] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "auto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Auto Apply
              </button>
              <button
                type="button"
                onClick={() => goToStudio("tweak")}
                disabled={pendingAction !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F5A623] px-5 text-sm font-semibold text-[#1A1916] shadow-lg transition duration-200 hover:scale-[1.01] hover:bg-[#E79A21] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "tweak" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Apply + Tweak
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
