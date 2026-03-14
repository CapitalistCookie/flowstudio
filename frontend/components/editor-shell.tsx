"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Save, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FluxLogo } from "@/components/flux-logo"
import { ExportModal } from "./export-modal"
import { MediaPanel } from "./media-panel"
import { VideoPreview } from "./video-preview"
import { Timeline } from "./timeline"
import { InspectorPanel } from "./inspector-panel"
import { useEditorStore } from "@/lib/stores/editor-store"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

export function EditorShell() {
  const [showExportModal, setShowExportModal] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { projectName, setProjectName, projectResolution, projectFrameRate, isPlaying, togglePlay, setIsPlaying, currentTime, setCurrentTime, duration, selectedClipId, setSelectedClipId } = useEditorStore()

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.code === "Space") {
        e.preventDefault()
        if (currentTime >= duration) setCurrentTime(0)
        togglePlay()
      }

      if (e.code === "KeyE" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setShowExportModal(true)
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipId) {
          setSelectedClipId(null)
        }
      }
    },
    [togglePlay, currentTime, duration, setCurrentTime, selectedClipId, setSelectedClipId]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const handleNameClick = () => {
    setEditedName(projectName)
    setIsEditingName(true)
  }

  const handleNameBlur = () => {
    if (editedName.trim() && editedName !== projectName) {
      setProjectName(editedName.trim())
    }
    setIsEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur()
    if (e.key === "Escape") {
      setEditedName(projectName)
      setIsEditingName(false)
    }
  }

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditingName])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* Top Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <motion.div whileHover="hover" whileTap={{ scale: 0.97 }}>
            <Button variant="ghost" size="sm" className="gap-2 cursor-pointer" onClick={() => router.push("/projects")}>
              <motion.div
                variants={{
                  hover: { x: -3, transition: { type: "spring", stiffness: 400, damping: 20 } },
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
              className="text-sm font-semibold text-foreground bg-transparent border-b-2 border-[oklch(0.78_0.16_75)] focus:outline-none px-1 min-w-[120px] max-w-[300px]"
            />
          ) : (
            <motion.div
              className="text-sm font-semibold text-foreground cursor-pointer hover:text-[oklch(0.78_0.16_75)] transition-colors"
              onClick={handleNameClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {projectName}
            </motion.div>
          )}
          <div className="text-xs text-muted-foreground">
            {projectResolution} • {projectFrameRate} fps
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-2">
            <Save className="h-4 w-4" />
            Saved
          </Button>
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Button
              size="sm"
              className="gap-2 bg-[oklch(0.78_0.16_75)] hover:bg-[oklch(0.72_0.18_75)] text-[oklch(0.15_0.02_75)]"
              onClick={() => setShowExportModal(true)}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal open={showExportModal} onOpenChange={setShowExportModal} />

      {/* Main Content Area - Resizable Panels */}
      <ResizablePanelGroup orientation="vertical" className="flex-1 overflow-hidden">
        {/* Top Section: Media, Preview, Inspector */}
        <ResizablePanel defaultSize={65} minSize={30}>
          <ResizablePanelGroup orientation="horizontal">
            {/* Left Panel - Media Bin */}
            <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
              <div className="h-full overflow-hidden border-r border-border bg-card">
                <MediaPanel />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Center Panel - Video Preview */}
            <ResizablePanel defaultSize={55} minSize={30}>
              <div className="h-full overflow-hidden">
                <VideoPreview />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel - Inspector */}
            <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
              <div className="h-full overflow-hidden border-l border-border bg-card">
                <InspectorPanel />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        {/* Invisible but functional resize handle */}
        <ResizableHandle className="bg-transparent after:bg-transparent hover:bg-border/50 transition-colors" />

        {/* Bottom Panel - Timeline */}
        <ResizablePanel defaultSize={35} minSize={20} maxSize={60}>
          <div className="h-full overflow-hidden border-t border-border bg-card">
            <Timeline />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
