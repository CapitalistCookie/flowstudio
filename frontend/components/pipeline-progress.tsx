"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Loader2, CheckCircle2, AlertCircle, Brain, Volume2, Eye, MousePointer2, Keyboard, FileText, Clapperboard, Film, Sparkles } from "lucide-react"
import { TaskType } from "@flowstudio/shared"
import { usePipelineStatus } from "@/lib/services/pipeline-status"

const TASK_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  [TaskType.AUDIO_EXTRACT]: { label: "Audio extraction", icon: Volume2 },
  [TaskType.VIDEO_SAMPLE]: { label: "Frame sampling", icon: Film },
  [TaskType.CURSOR_PROCESS]: { label: "Cursor tracking", icon: MousePointer2 },
  [TaskType.TYPING_DETECT]: { label: "Keystroke detection", icon: Keyboard },
  [TaskType.SPEECH_TRANSCRIPTION]: { label: "Speech transcription", icon: FileText },
  [TaskType.VIDEO_UNDERSTANDING]: { label: "Video understanding", icon: Eye },
  [TaskType.UI_CHANGE_DETECT]: { label: "UI change detection", icon: Eye },
  [TaskType.INTERACTION_PATTERN]: { label: "Interaction patterns", icon: Brain },
  [TaskType.INTENT_GRAPH]: { label: "Intent graph", icon: Brain },
  [TaskType.NARRATIVE_PLAN]: { label: "Narrative planning", icon: Sparkles },
  [TaskType.EDIT_PLAN]: { label: "Edit planning", icon: Clapperboard },
  [TaskType.TIMELINE_BUILD]: { label: "Timeline build", icon: Clapperboard },
  [TaskType.RENDER]: { label: "Final render", icon: Film },
}

interface PipelineProgressBarProps {
  projectId: string
  onSignalsReady?: () => void
}

export function PipelineProgressBar({ projectId, onSignalsReady }: PipelineProgressBarProps) {
  const { status, error } = usePipelineStatus(projectId)

  // Don't show if no tasks exist for this project
  if (!status || status.totalCount === 0) return null

  const percent = status.totalCount > 0
    ? Math.round((status.completedCount / status.totalCount) * 100)
    : 0

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm"
      >
        <div className="px-4 py-2">
          {/* Top row: label + progress */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              {status.isComplete ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : status.hasFailed ? (
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F5A623]" />
              )}
              <span className="text-[11px] font-semibold text-foreground">
                {status.isComplete
                  ? "Pipeline complete — signals ready for AI"
                  : status.hasFailed
                    ? "Pipeline error"
                    : `Processing: ${status.completedCount}/${status.totalCount} stages`}
              </span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{percent}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/50">
            <motion.div
              className={`h-full rounded-full ${
                status.hasFailed ? "bg-red-500" : status.isComplete ? "bg-emerald-500" : "bg-[#F5A623]"
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>

          {/* Task pills */}
          <div className="mt-2 flex flex-wrap gap-1">
            {status.tasks.map((task) => {
              const meta = TASK_META[task.taskType] ?? { label: task.taskType, icon: Loader2 }
              const Icon = meta.icon
              const isActive = task.status === "claimed"
              const isDone = task.status === "completed"
              const isFailed = task.status === "failed"

              return (
                <div
                  key={task.taskType}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium transition-colors ${
                    isDone
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : isFailed
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : isActive
                          ? "bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/20"
                          : "bg-secondary/30 text-muted-foreground border border-border/50"
                  }`}
                >
                  {isActive ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  ) : isFailed ? (
                    <AlertCircle className="h-2.5 w-2.5" />
                  ) : (
                    <Icon className="h-2.5 w-2.5" />
                  )}
                  {meta.label}
                </div>
              )
            })}
          </div>

          {error && (
            <p className="mt-1 text-[9px] text-red-400">{error}</p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
