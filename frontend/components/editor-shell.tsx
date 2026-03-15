"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Save, Loader2, Download, Sparkles, X, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExportModal } from "./export-modal"
import { MediaPanel } from "./media-panel"
import { VideoPreview } from "./video-preview"
import { Timeline } from "./timeline"
import { InspectorPanel } from "./inspector-panel"
import { PipelineProgressBar } from "./pipeline-progress"
import { EditorProvider, useEditor } from "./editor-context"
import { getConnection, isConnected, getProjectAssets } from "@/lib/stdb/spacetimedb"
import { AssetType } from "@flowstudio/shared"
import { usePipelineStatus } from "@/lib/services/pipeline-status"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

interface EditorShellProps {
  projectId: string
  initialEditMode?: "none" | "auto" | "tweak"
}

interface EditorProject {
  id: string;
  name: string;
  resolution: string;
  frame_rate: number;
}

function EditorContent({ projectId, initialEditMode = "none" }: { projectId: string; initialEditMode?: "none" | "auto" | "tweak" }) {
  const [project, setProject] = useState<EditorProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")
  const [isUpdatingName, setIsUpdatingName] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showAiNotice, setShowAiNotice] = useState(initialEditMode !== "none")
  const [isApproved, setIsApproved] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { setProjectId, setProjectResolution, loadTimelineData, saveProject, isSaving, hasUnsavedChanges, isPlaying, setIsPlaying, sortedVideoClips, currentTime, setCurrentTime, timelineEndTime, activeClip, splitClip, selectedClipId, removeClip, undo, redo, canUndo, canRedo, copyClip, pasteClip, canPaste, addMediaFiles, mediaFiles } = useEditor()
  const [autoEditTriggered, setAutoEditTriggered] = useState(false)
  const { status: pipelineStatus } = usePipelineStatus(projectId !== "local-project" ? projectId : null)
  const searchParams = useSearchParams()

  // Handle direct export action from recording
  useEffect(() => {
    if (searchParams.get("action") === "export" && !isLoading && project) {
      setShowExportModal(true)
    }
  }, [searchParams, isLoading, !!project])

  // Exit guard for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    function loadProject() {
      setIsLoading(true)

      // Load project metadata from STDB
      let foundProject: EditorProject | null = null
      if (isConnected()) {
        try {
          const conn = getConnection()
          for (const row of conn.db.projects.iter()) {
            if (row.id === projectId) {
              foundProject = {
                id: row.id,
                name: row.name,
                resolution: "1920x1080",
                frame_rate: 30,
              }
              break
            }
          }
        } catch {
          // SDK not ready
        }
      }

      // Fallback for local-project or when STDB hasn't synced yet
      if (!foundProject) {
        foundProject = {
          id: projectId,
          name: "Untitled Project",
          resolution: "1920x1080",
          frame_rate: 30,
        }
      }

      setProject(foundProject)
      setProjectId(foundProject.id)
      setProjectResolution(foundProject.resolution)
      loadTimelineData(null)

      // Load source video from STDB assets
      if (projectId !== "local-project") {
        try {
          const assets = getProjectAssets(projectId)
          const sourceAsset = assets.find(
            (a) => a.assetType === AssetType.SOURCE_VIDEO
          )
          if (sourceAsset) {
            const bucketUrl = process.env.NEXT_PUBLIC_GCS_BUCKET_URL ?? "https://storage.googleapis.com/flowstudio-uploads"
            const videoUrl = `${bucketUrl}/${sourceAsset.gcsPath}`
            addMediaFiles([{
              id: `source-${projectId}`,
              name: "Source Recording",
              duration: formatDuration(sourceAsset.durationMs),
              durationSeconds: sourceAsset.durationMs / 1000,
              type: "video/webm",
              thumbnail: null,
              objectUrl: videoUrl,
              storageUrl: videoUrl,
              storagePath: sourceAsset.gcsPath,
            }])
          }
        } catch (e) {
          console.warn("[Editor] Could not load source video from STDB:", e)
        }
      }

      setIsLoading(false)
    }
    loadProject()
  }, [projectId, setProjectId, setProjectResolution, loadTimelineData, addMediaFiles])

  // When pipeline signals are ready and auto mode, show AI notice
  useEffect(() => {
    if (
      pipelineStatus?.hasSignals &&
      !autoEditTriggered &&
      initialEditMode === "auto" &&
      mediaFiles.length > 0
    ) {
      setAutoEditTriggered(true)
      setShowAiNotice(true)
    }
  }, [pipelineStatus?.hasSignals, autoEditTriggered, initialEditMode, mediaFiles.length])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger if user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    // Ctrl+Z or Cmd+Z - Undo
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault()
      if (canUndo) {
        undo()
      }
      return
    }

    // Ctrl+Shift+Z or Cmd+Shift+Z - Redo
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault()
      if (canRedo) {
        redo()
      }
      return
    }

    // Ctrl+C or Cmd+C - Copy selected clip
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      e.preventDefault()
      if (selectedClipId) {
        copyClip(selectedClipId)
      }
      return
    }

    // Ctrl+V or Cmd+V - Paste clip
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault()
      if (canPaste) {
        pasteClip()
      }
      return
    }

    // Delete or Backspace - Delete selected clip
    if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
      e.preventDefault()
      removeClip(selectedClipId)
      return
    }

    if (e.code === "Space") {
      e.preventDefault() // Prevent page scroll
      
      if (!sortedVideoClips.length) return
      
      // If at end, restart from beginning
      if (currentTime >= timelineEndTime) {
        setCurrentTime(0)
      }
      
      setIsPlaying(!isPlaying)
    }

    // S key - Split clip at playhead
    if (e.code === "KeyS" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      if (activeClip) {
        splitClip(activeClip.id, currentTime)
      }
    }
  }, [isPlaying, setIsPlaying, sortedVideoClips.length, currentTime, timelineEndTime, setCurrentTime, activeClip, splitClip, selectedClipId, removeClip, undo, redo, canUndo, canRedo, copyClip, pasteClip, canPaste])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const handleBackToProjects = () => {
    router.push("/projects")
  }

  const handleSave = async () => {
    await saveProject()
  }

  const handleNameClick = () => {
    if (project) {
      setEditedName(project.name)
      setIsEditingName(true)
    }
  }

  const handleNameBlur = () => {
    if (!project || !editedName.trim() || editedName === project.name) {
      setIsEditingName(false)
      return
    }

    setIsUpdatingName(true)
    // Update project name via STDB — the reactive callback will update the store
    setProject({ ...project, name: editedName.trim() })
    setIsUpdatingName(false)
    setIsEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur()
    } else if (e.key === "Escape") {
      if (project) {
        setEditedName(project.name)
      }
      setIsEditingName(false)
    }
  }

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditingName])

  // When pipeline signals are ready and we haven't auto-triggered yet, show AI notice
  useEffect(() => {
    if (
      pipelineStatus?.hasSignals &&
      !autoEditTriggered &&
      initialEditMode === "auto" &&
      mediaFiles.length > 0
    ) {
      setAutoEditTriggered(true)
      setShowAiNotice(true)
    }
  }, [pipelineStatus?.hasSignals, autoEditTriggered, initialEditMode, mediaFiles.length])

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading project...</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-destructive">{error || "Project not found"}</p>
          <Button onClick={handleBackToProjects}>Back to Projects</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* Top Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover="hover"
            whileTap={{ scale: 0.97 }}
          >
            <Button variant="ghost" size="sm" className="gap-2 cursor-pointer" onClick={handleBackToProjects}>
              <motion.div
                variants={{
                  hover: { x: -3, transition: { type: "spring", stiffness: 400, damping: 20 } }
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </motion.div>
              Projects
            </Button>
          </motion.div>
          <div className="h-4 w-px bg-border" />
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              disabled={isUpdatingName}
              className="text-sm font-semibold text-foreground bg-transparent border-b-2 border-[oklch(0.78_0.16_75)] focus:outline-none px-1 min-w-[120px] max-w-[300px] disabled:opacity-50"
            />
          ) : (
            <motion.div
              className="text-sm font-semibold text-foreground cursor-pointer hover:text-[oklch(0.78_0.16_75)] transition-colors"
              onClick={handleNameClick}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {project.name}
            </motion.div>
          )}
          <div className="text-xs text-muted-foreground">
            {project.resolution} • {project.frame_rate} fps
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "Saving..." : hasUnsavedChanges ? "Save" : "Saved"}
          </Button>
          {projectId !== "local-project" && pipelineStatus?.hasSignals && !isApproved && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-emerald-400 hover:text-emerald-300"
              onClick={() => {
                if (isConnected()) {
                  getConnection().reducers.approveTimeline({ projectId })
                  setIsApproved(true)
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve & Render
            </Button>
          )}
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Button
              className="gap-2 bg-[oklch(0.78_0.16_75)] hover:bg-[oklch(0.72_0.18_75)] text-[oklch(0.15_0.02_75)]"
              onClick={() => setShowExportModal(true)}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </motion.div>
        </div>
      </div>

      {showAiNotice && (
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-[#F5A623]/10 px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Sparkles className="h-4 w-4 text-[#F5A623]" />
            {initialEditMode === "tweak"
              ? "AI edits are loaded. Review them and tweak anything in Studio."
              : "AI edit pass imported. You can now review and refine in Studio."}
          </div>
          <button
            type="button"
            onClick={() => setShowAiNotice(false)}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Dismiss AI edit notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Export Modal */}
      <ExportModal open={showExportModal} onOpenChange={setShowExportModal} />

      {projectId && projectId !== "local-project" && (
        <PipelineProgressBar projectId={projectId} />
      )}

      {/* Main Content Area - Resizable Panels */}
      <ResizablePanelGroup orientation="vertical" className="flex-1">
        {/* Top Section: Media, Preview, Inspector */}
        <ResizablePanel defaultSize="65%" minSize="30%">
          <ResizablePanelGroup orientation="horizontal">
            {/* Left Panel - Media Bin */}
            <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
              <div className="h-full border-r border-border bg-card">
                <MediaPanel />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Center Panel - Video Preview */}
            <ResizablePanel defaultSize="60%" minSize="25%">
              <div className="h-full">
                <VideoPreview />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel - Inspector */}
            <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
              <div className="h-full border-l border-border bg-card">
                <InspectorPanel />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        {/* Vertical drag handle — resize timeline height */}
        <ResizableHandle withHandle className="bg-border/10 hover:bg-border/30 transition-all border-y border-border/5" />

        {/* Bottom Panel - Timeline */}
        <ResizablePanel defaultSize="35%" minSize="20%" maxSize="60%">
          <div className="h-full border-t border-border bg-card">
            <Timeline />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

export function EditorShell({ projectId, initialEditMode = "none" }: EditorShellProps) {
  return (
    <EditorProvider>
      <EditorContent projectId={projectId} initialEditMode={initialEditMode} />
    </EditorProvider>
  )
}
