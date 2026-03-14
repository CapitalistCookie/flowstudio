"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2, Sparkles, Wand2, Upload } from "lucide-react"
import { useCaptureStore } from "@/lib/capture/capture-store"
import { getRecordedBlob, discardCapture } from "@/lib/capture/capture-service"
import { uploadToGcs } from "@/lib/upload/upload-service"
import { triggerPipeline } from "@/lib/upload/pipeline-trigger"

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

export default function RecordingPreviewPage() {
  const router = useRouter()
<<<<<<< HEAD
  const searchParams = useSearchParams()
  const projectId = searchParams.get("projectId")
=======
  const { elapsedSeconds } = useRecordingStore()
  const [pendingAction, setPendingAction] = useState<"auto" | "refine" | null>(null)
  const [isAutoProcessing, setIsAutoProcessing] = useState(false)
  const [autoProgress, setAutoProgress] = useState(0)
  const [isAutoComplete, setIsAutoComplete] = useState(false)
>>>>>>> 8e7d71255acab9be82a2f8ce28c9c318486a27c6

  const blobUrl = useCaptureStore((s) => s.blobUrl)
  const elapsedMs = useCaptureStore((s) => s.elapsedMs)

  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleAutoApply = async () => {
    if (!blobUrl || !projectId) return
    setUploadState("uploading")
    setUploadProgress(10)

    try {
      const blob = await getRecordedBlob()
      if (!blob) throw new Error("No recording data available")

      setUploadProgress(30)

      const filename = `recording_${Date.now()}.webm`
      const { gcsPath, size } = await uploadToGcs(
        projectId,
        filename,
        blob,
        "video/webm",
      )

      setUploadProgress(60)
      setUploadState("processing")

      await triggerPipeline({
        projectId,
        gcsPath,
        fileSize: size,
        contentType: "video/webm",
        durationMs: elapsedMs,
      })

      setUploadProgress(100)
      setUploadState("done")
      discardCapture()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
      setUploadState("error")
    }
  }

<<<<<<< HEAD
  const goToStudioTweak = () => {
    router.push(`/studio${projectId ? `?projectId=${projectId}` : ""}&edits=tweak`)
=======
  const goToStudioRefine = () => {
    setPendingAction("refine")
    router.push("/studio?edits=refine")
  }

  const goToStudioAuto = () => {
    router.push("/studio?edits=auto")
>>>>>>> 8e7d71255acab9be82a2f8ce28c9c318486a27c6
  }

  const goToDashboard = () => {
    discardCapture()
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
                {blobUrl ? (
                  <video
                    className="h-full w-full object-cover"
                    src={blobUrl}
                    controls
                    playsInline
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-black/50 text-white/50">
                    No recording available
                  </div>
                )}
                <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs text-white/85">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#F5A623]" />
                  Captured session
                </div>
                <div className="absolute right-5 top-5 rounded-full border border-white/15 bg-black/45 px-3 py-1 font-mono text-xs text-white/85">
                  {formatTime(elapsedMs)}
                </div>
              </div>
            </div>

            {uploadState !== "idle" && (
              <div className="rounded-xl border border-white/15 bg-black/35 p-4 text-white/90">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {uploadState === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-[#5AD092]" />
                  ) : uploadState === "error" ? (
                    <span className="h-4 w-4 text-red-400">✕</span>
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-[#F5A623]" />
                  )}
                  {uploadState === "uploading" && "Uploading recording..."}
                  {uploadState === "processing" && "Starting AI pipeline..."}
                  {uploadState === "done" && "Pipeline started successfully"}
                  {uploadState === "error" && "Upload failed"}
                </div>

                <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      uploadState === "error" ? "bg-red-500" : "bg-[#F5A623]"
                    }`}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>

                <p className="text-xs text-white/70">
                  {uploadState === "done"
                    ? "Workers are processing your recording. Open Studio to watch progress, or head back to dashboard."
                    : uploadState === "error"
                    ? uploadError
                    : "Uploading to cloud and triggering the AI edit pipeline..."}
                </p>
              </div>
            )}

            {!projectId && uploadState === "idle" && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-900/20 p-3 text-xs text-yellow-200">
                No project ID found. Create a project first to enable upload and AI processing.
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleAutoApply}
<<<<<<< HEAD
                disabled={!projectId || !blobUrl || uploadState !== "idle"}
=======
                disabled={pendingAction === "refine" || isAutoComplete}
>>>>>>> 8e7d71255acab9be82a2f8ce28c9c318486a27c6
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white transition duration-200 hover:scale-[1.01] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadState === "uploading" || uploadState === "processing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : uploadState === "done" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploadState === "done" ? "Uploaded" : "Upload & Auto Edit"}
              </button>
              <button
                type="button"
<<<<<<< HEAD
                onClick={goToStudioTweak}
                disabled={uploadState === "uploading" || uploadState === "processing"}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F5A623] px-5 text-sm font-semibold text-[#1A1916] shadow-lg transition duration-200 hover:scale-[1.01] hover:bg-[#E79A21] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                Apply + Tweak
              </button>

              <button
                type="button"
                onClick={goToDashboard}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/25 bg-transparent px-5 text-sm font-semibold text-white/90 transition duration-200 hover:bg-white/10"
              >
                Back to dashboard
              </button>
=======
                onClick={goToStudioRefine}
                disabled={pendingAction !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F5A623] px-5 text-sm font-semibold text-[#1A1916] shadow-lg transition duration-200 hover:scale-[1.01] hover:bg-[#E79A21] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "refine" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Apply + Refine
              </button>

              {isAutoProcessing && (
                <button
                  type="button"
                  onClick={goToStudioAuto}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/25 bg-transparent px-5 text-sm font-semibold text-white/90 transition duration-200 hover:bg-white/10"
                >
                  Open Studio
                </button>
              )}

              {isAutoProcessing && (
                <button
                  type="button"
                  onClick={goToDashboard}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/25 bg-transparent px-5 text-sm font-semibold text-white/90 transition duration-200 hover:bg-white/10"
                >
                  Back to dashboard
                </button>
              )}
>>>>>>> 8e7d71255acab9be82a2f8ce28c9c318486a27c6
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
