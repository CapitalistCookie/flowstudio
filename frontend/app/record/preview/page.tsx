"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Sparkles, Wand2 } from "lucide-react"
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
  const [isAutoProcessing, setIsAutoProcessing] = useState(false)
  const [autoProgress, setAutoProgress] = useState(0)
  const [isAutoComplete, setIsAutoComplete] = useState(false)

  const safeElapsed = useMemo(() => Math.max(0, elapsedSeconds), [elapsedSeconds])

  useEffect(() => {
    if (!isAutoProcessing || isAutoComplete) return

    const interval = setInterval(() => {
      setAutoProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 14 + 7)
        if (next >= 100) {
          clearInterval(interval)
          setIsAutoComplete(true)
          return 100
        }
        return next
      })
    }, 650)

    return () => clearInterval(interval)
  }, [isAutoProcessing, isAutoComplete])

  const handleAutoApply = () => {
    if (isAutoProcessing) return
    setPendingAction("auto")
    setIsAutoProcessing(true)
    setAutoProgress(8)
    setIsAutoComplete(false)

    // Simulate backend async kickoff marker so dashboard can later surface status.
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "flowstudio:last-auto-edit-job",
        JSON.stringify({
          status: "processing",
          startedAt: new Date().toISOString(),
          source: "record-preview",
        })
      )
    }
  }

  const goToStudioTweak = () => {
    setPendingAction("tweak")
    router.push("/studio?edits=tweak")
  }

  const goToDashboard = () => {
    router.push("/dashboard")
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
              <div className="relative aspect-video w-full overflow-hidden">
                <video
                  className="h-full w-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                >
                  <source src="/assets/3051359-uhd_3840_2160_25fps.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/20" />
                <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs text-white/85">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#F5A623]" />
                  Captured session
                </div>
                <div className="absolute right-5 top-5 rounded-full border border-white/15 bg-black/45 px-3 py-1 font-mono text-xs text-white/85">
                  {formatTime(safeElapsed)}
                </div>
              </div>
            </div>

            {isAutoProcessing && (
              <div className="rounded-xl border border-white/15 bg-black/35 p-4 text-white/90">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {isAutoComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-[#5AD092]" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-[#F5A623]" />
                  )}
                  {isAutoComplete ? "Auto edit completed" : "Auto editing in progress"}
                </div>

                <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#F5A623] transition-all duration-500"
                    style={{ width: `${autoProgress}%` }}
                  />
                </div>

                <p className="text-xs text-white/70">
                  {isAutoComplete
                    ? "Your AI pass is ready. You can open Studio to tweak, or head back to dashboard."
                    : "This runs asynchronously on the backend. You can safely return to dashboard while it finishes."}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleAutoApply}
                disabled={pendingAction === "tweak" || isAutoComplete}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white transition duration-200 hover:scale-[1.01] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAutoProcessing && !isAutoComplete ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {isAutoComplete ? "Auto Applied" : "Auto Apply"}
              </button>
              <button
                type="button"
                onClick={goToStudioTweak}
                disabled={pendingAction !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F5A623] px-5 text-sm font-semibold text-[#1A1916] shadow-lg transition duration-200 hover:scale-[1.01] hover:bg-[#E79A21] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "tweak" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Apply + Tweak
              </button>

              {isAutoProcessing && (
                <button
                  type="button"
                  onClick={goToDashboard}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/25 bg-transparent px-5 text-sm font-semibold text-white/90 transition duration-200 hover:bg-white/10"
                >
                  Back to dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
