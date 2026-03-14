"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { gsap } from "gsap"
import {
  Folder, FolderOpen, Film, Plus, ChevronRight, ChevronDown, X, Play, Clock, MoreVertical
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FluxLogo } from "@/components/flux-logo"
import { useProjectStore } from "@/lib/stores/project-store"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface FolderNode {
  id: string
  name: string
  type: "folder" | "project"
  children?: FolderNode[]
  projectData?: any
}

export function ProjectsView() {
  const router = useRouter()
  const { projects, removeProject, duplicateProject } = useProjectStore()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedFolder, setSelectedFolder] = useState<FolderNode | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const folderButtonRef = useRef<{ [key: string]: HTMLButtonElement | null }>({})

  // Build folder tree structure
  const folderTree: FolderNode[] = [
    {
      id: "recent",
      name: "Recent Projects",
      type: "folder",
      children: projects.slice(0, 5).map(p => ({
        id: p.id,
        name: p.name,
        type: "project" as const,
        projectData: p
      }))
    },
    {
      id: "all",
      name: "All Projects",
      type: "folder",
      children: projects.map(p => ({
        id: p.id,
        name: p.name,
        type: "project" as const,
        projectData: p
      }))
    },
    {
      id: "starred",
      name: "Starred",
      type: "folder",
      children: []
    }
  ]

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const openFolderModal = (folder: FolderNode, buttonElement: HTMLButtonElement) => {
    setSelectedFolder(folder)

    // Wait for next frame to ensure modal is in DOM
    requestAnimationFrame(() => {
      if (!modalRef.current) return

      // Get button position
      const buttonRect = buttonElement.getBoundingClientRect()
      const buttonCenterX = buttonRect.left + buttonRect.width / 2
      const buttonCenterY = buttonRect.top + buttonRect.height / 2

      // Calculate center of viewport
      const viewportCenterX = window.innerWidth / 2
      const viewportCenterY = window.innerHeight / 2

      // GSAP animation from button position to center
      gsap.fromTo(modalRef.current,
        {
          x: buttonCenterX - viewportCenterX,
          y: buttonCenterY - viewportCenterY,
          scale: 0.1,
          opacity: 0,
        },
        {
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          duration: 0.5,
          ease: "back.out(1.4)"
        }
      )
    })
  }

  const closeFolderModal = () => {
    if (!modalRef.current || !selectedFolder) return

    // Get the button that opened this modal
    const buttonElement = folderButtonRef.current[selectedFolder.id]
    if (!buttonElement) {
      setSelectedFolder(null)
      return
    }

    const buttonRect = buttonElement.getBoundingClientRect()
    const buttonCenterX = buttonRect.left + buttonRect.width / 2
    const buttonCenterY = buttonRect.top + buttonRect.height / 2
    const viewportCenterX = window.innerWidth / 2
    const viewportCenterY = window.innerHeight / 2

    // Animate back to button position
    gsap.to(modalRef.current, {
      x: buttonCenterX - viewportCenterX,
      y: buttonCenterY - viewportCenterY,
      scale: 0.1,
      opacity: 0,
      duration: 0.4,
      ease: "back.in(1.4)",
      onComplete: () => setSelectedFolder(null)
    })
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Top Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6">
        <button onClick={() => router.push("/")} className="cursor-pointer">
          <FluxLogo />
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => router.push("/dashboard")}>
            Dashboard
          </Button>
          <Button variant="ghost" size="sm" className="text-foreground font-medium">
            Projects
          </Button>
        </nav>

        <Button
          onClick={() => router.push("/record")}
          className="gap-2 bg-[#F5A623] hover:bg-[#E09420] text-[#1A1916] font-medium"
          size="sm"
        >
          <Plus className="h-3.5 w-3.5" />
          New Project
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar with Folder Tree */}
        <aside className="w-72 shrink-0 border-r border-border bg-card/50 overflow-auto p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4 px-2">Your Projects</h2>

          <div className="space-y-1">
            {folderTree.map((folder) => (
              <div key={folder.id}>
                <button
                  ref={el => { folderButtonRef.current[folder.id] = el }}
                  onClick={() => {
                    const btn = folderButtonRef.current[folder.id]
                    if (btn) openFolderModal(folder, btn)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-secondary/80 cursor-pointer group"
                >
                  {expandedFolders.has(folder.id) ? (
                    <FolderOpen className="h-4 w-4 text-[#F5A623]" />
                  ) : (
                    <Folder className="h-4 w-4 text-muted-foreground group-hover:text-[#F5A623] transition-colors" />
                  )}
                  <span className="flex-1 text-left font-medium text-foreground">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">{folder.children?.length || 0}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Start Project Button */}
          <Button
            onClick={() => router.push("/record")}
            className="w-full mt-6 bg-[#F5A623] hover:bg-[#E09420] text-[#1A1916]"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start a Project
          </Button>
        </aside>

        {/* Main Area - Instructions */}
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary mx-auto mb-6">
              <Folder className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-3">Select a folder to view projects</h2>
            <p className="text-muted-foreground leading-relaxed">
              Click on any folder from the sidebar to see its contents in a focused view.
            </p>
          </div>
        </main>
      </div>

      {/* Folder Modal */}
      <AnimatePresence>
        {selectedFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-8">
            <div
              ref={modalRef}
              className="relative w-full max-w-5xl bg-[#F5F2ED] rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <FolderOpen className="h-6 w-6 text-[#F5A623]" />
                  <h2 className="text-2xl font-semibold text-foreground">{selectedFolder.name}</h2>
                  <span className="text-sm text-muted-foreground">
                    {selectedFolder.children?.length || 0} projects
                  </span>
                </div>
                <button
                  onClick={closeFolderModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              {/* Projects Grid */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {selectedFolder.children && selectedFolder.children.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedFolder.children.map((project) => (
                      <motion.div
                        key={project.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="group relative overflow-hidden rounded-xl border border-border bg-white hover:border-[#F5A623]/30 hover:shadow-md transition-all"
                      >
                        <button
                          onClick={() => router.push("/studio")}
                          className="w-full text-left cursor-pointer"
                        >
                          {/* Thumbnail */}
                          <div className="relative aspect-video bg-gradient-to-br from-[#F5A623]/10 to-[#1A9E8F]/5">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Film className="h-10 w-10 text-muted-foreground/20" />
                            </div>
                            <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-mono text-white">
                              {project.projectData?.duration || "00:00"}
                            </div>
                          </div>

                          {/* Info */}
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-medium text-foreground truncate flex-1">{project.name}</h3>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-secondary transition-colors">
                                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => router.push("/studio")}>
                                    <Play className="mr-2 h-4 w-4" /> Open
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => duplicateProject(project.id)}>
                                    Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => removeProject(project.id)}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>
                                {project.projectData?.updated_at
                                  ? new Date(project.projectData.updated_at).toLocaleDateString()
                                  : "Recently"}
                              </span>
                            </div>
                          </div>
                        </button>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary mb-4">
                      <Folder className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No projects in this folder</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
