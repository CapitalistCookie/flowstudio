"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Play, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRecordingStore } from "@/lib/stores/recording-store"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

export function RecordView() {
  const router = useRouter()
  const { isRecording, isPaused, elapsedSeconds, startRecording, pauseRecording, resumeRecording, stopRecording, tick } = useRecordingStore()
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)

  // Auto-start recording on mount
  useEffect(() => {
    startRecording()
    // Prevent navigation while recording
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startRecording, isRecording])

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

  const handleStopAndAnalyze = () => {
    stopRecording()
    setShowPreviewModal(true)
  }

  const handleContinueToStudio = () => {
    setShowPreviewModal(false)
    router.push("/studio")
  }

  return (
    <>
      <div className="relative flex h-screen w-screen flex-col overflow-hidden">
        {/* Asteroid Splash Background - Full Screen */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(/assets/asteroid_splash.jpg)',
            filter: 'brightness(0.85) contrast(1.1)'
          }}
        >
          {/* Top gradient fade */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#F5F2ED]/60 via-transparent to-transparent" style={{ height: '30%' }} />
          {/* Overall warm overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#F5F2ED]/20 to-[#EDE9E2]/30" />
        </div>

        {/* Main Content - Centered */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-12 p-8">
          {/* Play Icon */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: "spring" }}
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#F5A623]/20 bg-[#F5A623]/5 backdrop-blur-sm"
          >
            <Play className="h-8 w-8 text-[#F5A623] fill-[#F5A623] ml-1" />
          </motion.div>

          {/* Timer */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-mono text-7xl font-light tracking-tight text-[#1A1916]"
          >
            {formatTime(elapsedSeconds)}
          </motion.div>

          {/* Recording Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3"
          >
            <div className="relative flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-[#F5A623]" />
              {isRecording && !isPaused && (
                <div className="absolute inset-0 h-3 w-3 rounded-full bg-[#F5A623] animate-ping" />
              )}
            </div>
            <span className="text-lg font-medium text-[#1A1916]">
              {isPaused ? "Paused" : "Recording in progress"}
            </span>
          </motion.div>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-4 mt-8"
          >
            {!isPaused && (
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-8 rounded-full border-2 border-white/40 bg-white/20 backdrop-blur-md text-[#1A1916] hover:bg-white/30 hover:border-white/60"
                onClick={() => pauseRecording()}
              >
                <Play className="h-5 w-5 mr-2 rotate-180" />
                Pause
              </Button>
            )}
            {isPaused && (
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-8 rounded-full border-2 border-[#F5A623]/40 bg-[#F5A623]/20 backdrop-blur-md text-[#1A1916] hover:bg-[#F5A623]/30"
                onClick={() => resumeRecording()}
              >
                <Play className="h-5 w-5 mr-2" />
                Resume
              </Button>
            )}
            <Button
              size="lg"
              className="h-14 px-8 rounded-full bg-[#1A1916] hover:bg-[#2E2C29] text-white shadow-lg"
              onClick={handleStopAndAnalyze}
              disabled={!isRecording && !isPaused}
            >
              <Square className="h-5 w-5 mr-2" />
              Stop & Analyze
            </Button>
          </motion.div>
        </div>

        {/* Waveform Visualization Hint */}
        <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none">
          <svg viewBox="0 0 1200 100" className="w-full h-full opacity-20">
            <path
              d="M0,50 Q150,30 300,50 T600,50 T900,50 T1200,50"
              stroke="#F5A623"
              strokeWidth="2"
              fill="none"
              className="animate-pulse"
            />
          </svg>
        </div>
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreviewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-8"
            onClick={handleContinueToStudio}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 20 }}
              className="relative max-w-4xl w-full bg-[#F5F2ED] rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Video Player Placeholder */}
              <div className="relative aspect-video bg-gradient-to-br from-[#2E2C29] to-[#1A1916]">
                {/* Play/Pause Overlay */}
                <button
                  onClick={() => setIsPreviewPlaying(!isPreviewPlaying)}
                  className="absolute inset-0 flex items-center justify-center group hover:bg-black/10 transition-colors cursor-pointer"
                >
                  {!isPreviewPlaying ? (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F5A623]/90 group-hover:bg-[#F5A623] transition-all group-hover:scale-110 shadow-lg">
                      <Play className="h-10 w-10 text-[#1A1916] fill-[#1A1916] ml-1" />
                    </div>
                  ) : (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-8 bg-white rounded-sm" />
                          <div className="w-2 h-8 bg-white rounded-sm" />
                        </div>
                      </div>
                    </div>
                  )}
                </button>

                {/* Time Display */}
                <div className="absolute top-4 right-4 font-mono text-sm text-[#F0EDE8] bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-md">
                  {formatTime(previewTime)} / {formatTime(elapsedSeconds)}
                </div>

                {/* Scrubber Bar */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <div className="relative h-1.5 w-full rounded-full bg-white/20 group/scrubber cursor-pointer">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-[#F5A623] transition-all"
                      style={{ width: `${(previewTime / elapsedSeconds) * 100}%` }}
                    />
                    <input
                      type="range"
                      min="0"
                      max={elapsedSeconds}
                      value={previewTime}
                      onChange={(e) => setPreviewTime(Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-lg opacity-0 group-hover/scrubber:opacity-100 transition-opacity"
                      style={{ left: `${(previewTime / elapsedSeconds) * 100}%`, transform: 'translate(-50%, -50%)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-[#1A1916]">Recording Complete</h3>
                  <p className="text-sm text-[#8A8780] mt-1">Preview your recording before moving to the studio</p>
                </div>
                <Button
                  size="lg"
                  onClick={handleContinueToStudio}
                  className="bg-[#F5A623] hover:bg-[#E09420] text-[#1A1916]"
                >
                  Continue to Studio
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
