"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Save, Loader2, Download, Sparkles, X, CheckCircle2, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExportModal } from "./export-modal"
import { MediaPanel } from "./media-panel"
import { VideoPreview } from "./video-preview"
import { Timeline } from "./timeline"
import { InspectorPanel } from "./inspector-panel"
import { PipelineProgressBar } from "./pipeline-progress"
import { EditorProvider, useEditor } from "./editor-context"
import { useEditStats } from "./use-edit-stats"
import { getConnection, isConnected, getProjectAssets, subscribeToProject, getProjectCollaborators } from "@/lib/stdb/spacetimedb"
import { useAuth } from "@/lib/auth/use-auth"
import { AssetType } from "@flowstudio/shared"
import { useCaptureStore } from "@/lib/capture/capture-store"
import { useStdbStatus } from "@/components/stdb-provider"
import { usePresence } from "@/hooks/use-presence"
import { useProjectLock } from "@/hooks/use-project-lock"
import { PresenceAvatars } from "./presence-avatars"
import { LockStatusBanner } from "./lock-status-banner"
import { LockTakeoverDialog } from "./lock-takeover-dialog"
import { ShareDialog } from "./share-dialog"
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

function formatSecondsShort(s: number): string {
  const rounded = Math.round(s)
  if (rounded >= 60) {
    const m = Math.floor(rounded / 60)
    const sec = rounded % 60
    return sec > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${m}m`
  }
  return `${rounded}s`
}

function EditStatsDisplay() {
  const { outputSeconds, secondsRemoved, editCount } = useEditStats()
  if (editCount === 0) return null
  return (
    <>
      <div className="h-4 w-px bg-border" />
      <div className="text-xs text-muted-foreground">
        {formatSecondsShort(outputSeconds)} output • {formatSecondsShort(secondsRemoved)} removed • {editCount} {editCount === 1 ? "edit" : "edits"}
      </div>
    </>
  )
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
  const { setProjectId, setProjectResolution, loadTimelineData, loadFromStdb, saveProject, isSaving, hasUnsavedChanges, isPlaying, setIsPlaying, sortedVideoClips, currentTime, setCurrentTime, timelineEndTime, activeClip, splitClip, selectedClipId, removeClip, undo, redo, canUndo, canRedo, copyClip, pasteClip, canPaste, addMediaFiles, mediaFiles } = useEditor()
  const { user } = useAuth()
  const [autoEditTriggered, setAutoEditTriggered] = useState(false)
  const { status: pipelineStatus } = usePipelineStatus(projectId !== "local-project" ? projectId : null)
  const searchParams = useSearchParams()
  const { users: presenceUsers } = usePresence(projectId !== "local-project" ? projectId : null)
  const { isEditor: hasLock, lockHolder, acquireLock: doAcquireLock, releaseLock: doReleaseLock, forceAcquire: doForceAcquire } = useProjectLock(projectId !== "local-project" ? projectId : null)
  const stdbStatus = useStdbStatus()
  const [showTakeoverDialog, setShowTakeoverDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)

  // Compute user's role for this project
  const myRole = (() => {
    if (projectId === "local-project") return "owner"
    if (!user?.uid) return "viewer"
    // Check if owner via STDB project data
    if (isConnected()) {
      try {
        const conn = getConnection()
        for (const row of conn.db.projects.iter()) {
          if (row.id === projectId && row.ownerId === user.uid) return "owner"
        }
      } catch {}
    }
    // Check collaborators
    const collabs = getProjectCollaborators(projectId)
    const myCollab = collabs.find(c => c.firebaseUid === user.uid)
    return myCollab?.role ?? "viewer"
  })()
  const isOwner = myRole === "owner"
  const isViewer = myRole === "viewer"

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
    let cancelled = false

    function loadProject() {
      setIsLoading(true)

      // Load project metadata from STDB
      let foundProject: EditorProject | null = null
      if (isConnected()) {
        try {
          const conn = getConnection()
          for (const row of conn.db.projects.iter()) {
            if (row.id === projectId) {
              // Ownership / collaborator check
              if (user?.uid && row.ownerId && row.ownerId !== user.uid) {
                const collabs = getProjectCollaborators(projectId)
                const isCollaborator = collabs.some(c => c.firebaseUid === user.uid)
                if (!isCollaborator) {
                  setError("You don't have access to this project")
                  setIsLoading(false)
                  return
                }
              }
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

      // Subscribe to project-scoped STDB tables, then load assets + timeline
      if (projectId !== "local-project" && isConnected()) {
        subscribeToProject(projectId)
          .then(() => {
            if (cancelled) return
            loadFromStdb(projectId)

            // Load source video from STDB assets (must be after subscription resolves)
            try {
              const assets = getProjectAssets(projectId)
              const sourceAsset = assets.find(
                (a) => a.assetType === AssetType.SOURCE_VIDEO
              )
              if (sourceAsset) {
                const bucketUrl = process.env.NEXT_PUBLIC_GCS_BUCKET_URL ?? "https://storage.googleapis.com/flowstudio-assets"
                // gcsPath comes as gs://bucket/path — strip the gs://bucket/ prefix
                const pathPortion = sourceAsset.gcsPath.replace(/^gs:\/\/[^/]+\//, '')
                const videoUrl = `${bucketUrl}/${pathPortion}`

                // Generate thumbnail from GCS video URL, then add to media panel
                const video = document.createElement("video")
                video.crossOrigin = "anonymous"
                video.preload = "auto"
                video.muted = true
                const thumbTimeout = setTimeout(() => {
                  // Timeout — add without thumbnail
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
                }, 8000)
                video.onloadeddata = () => {
                  video.currentTime = Math.min(1, video.duration * 0.1)
                }
                video.onseeked = () => {
                  clearTimeout(thumbTimeout)
                  let thumb: string | null = null
                  try {
                    const canvas = document.createElement("canvas")
                    canvas.width = 320
                    canvas.height = 180
                    const ctx = canvas.getContext("2d")
                    if (ctx) {
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                      thumb = canvas.toDataURL("image/jpeg", 0.7)
                    }
                  } catch { /* ignore */ }
                  if (!cancelled) {
                    addMediaFiles([{
                      id: `source-${projectId}`,
                      name: "Source Recording",
                      duration: formatDuration(sourceAsset.durationMs),
                      durationSeconds: sourceAsset.durationMs / 1000,
                      type: "video/webm",
                      thumbnail: thumb,
                      objectUrl: videoUrl,
                      storageUrl: videoUrl,
                      storagePath: sourceAsset.gcsPath,
                    }])
                  }
                }
                video.onerror = () => {
                  clearTimeout(thumbTimeout)
                  if (!cancelled) {
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
                }
                video.src = videoUrl
              } else {
                // Fallback: capture store blob (e.g. fresh recording, not yet in STDB)
                const captureBlobUrl = useCaptureStore.getState().blobUrl
                const captureElapsed = useCaptureStore.getState().elapsedMs
                if (captureBlobUrl) {
                  console.log("[Editor] Using capture store blob as fallback source video")
                  addMediaFiles([{
                    id: `capture-${projectId}`,
                    name: "Recording (unsaved)",
                    duration: formatDuration(captureElapsed),
                    durationSeconds: captureElapsed / 1000,
                    type: "video/webm",
                    thumbnail: null,
                    objectUrl: captureBlobUrl,
                  }])
                }
              }
            } catch (e) {
              console.warn("[Editor] Could not load source video from STDB:", e)
            }
          })
          .catch((err) => {
            if (!cancelled) console.warn("[Editor] Project subscription failed:", err)
          })
      }

      setIsLoading(false)
    }
    loadProject()

    return () => { cancelled = true }
  }, [projectId, user?.uid, setProjectId, setProjectResolution, loadTimelineData, addMediaFiles, stdbStatus, loadFromStdb])

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
    const newName = editedName.trim()
    // Persist name change to STDB
    if (isConnected() && projectId !== "local-project") {
      try {
        getConnection().reducers.renameProject({ projectId, name: newName })
      } catch (e) {
        console.warn("[Editor] Failed to rename project:", e)
      }
    }
    setProject({ ...project, name: newName })
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
          <EditStatsDisplay />
        </div>
        <div className="flex items-center gap-2">
          <PresenceAvatars users={presenceUsers} collaborators={getProjectCollaborators(projectId)} />
          {isOwner && projectId !== "local-project" && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setShowShareDialog(true)}
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          )}
          {isViewer && projectId !== "local-project" && (
            <div className="text-xs text-blue-400 font-medium px-2 py-1 rounded bg-blue-500/10">
              Viewing
            </div>
          )}
          {!isViewer && !hasLock && projectId !== "local-project" && (
            <div className="text-xs text-amber-400 font-medium px-2 py-1 rounded bg-amber-500/10">
              Read-only
            </div>
          )}
          {!isViewer && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges || !hasLock}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? "Saving..." : hasUnsavedChanges ? "Save" : "Saved"}
            </Button>
          )}
          {!isViewer && projectId !== "local-project" && pipelineStatus?.hasSignals && !isApproved && (
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
          {!isViewer && (
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
          )}
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

      {/* Lock status banner */}
      {projectId !== "local-project" && (
        <LockStatusBanner
          isEditor={hasLock}
          lockHolder={lockHolder}
          onAcquireLock={doAcquireLock}
          onForceAcquire={() => setShowTakeoverDialog(true)}
          isOwner={isOwner}
          role={myRole}
        />
      )}

      {/* Lock takeover confirmation dialog */}
      <LockTakeoverDialog
        open={showTakeoverDialog}
        lockHolderName={lockHolder?.name ?? "Unknown"}
        onConfirm={() => {
          doForceAcquire()
          setShowTakeoverDialog(false)
        }}
        onCancel={() => setShowTakeoverDialog(false)}
      />

      {/* Share Dialog */}
      {projectId !== "local-project" && (
        <ShareDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          projectId={projectId}
        />
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
  const { isEditor } = useProjectLock(projectId)

  return (
    <EditorProvider isEditor={isEditor}>
      <EditorContent projectId={projectId} initialEditMode={initialEditMode} />
    </EditorProvider>
  )
}
