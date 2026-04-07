"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Film,
  Plus,
  Play,
  Clock,
  MoreVertical,
  Star,
  ArrowUpDown,
  ArrowLeft,
  Filter,
  Copy,
  Trash2,
  FolderPlus,
  FolderInput,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectStore } from "@/lib/stores/project-store"
import { useAuth } from "@/lib/auth/use-auth"
import { getConnection, isConnected, getUserCollaborations, getProjectCollaborators } from "@/lib/stdb/spacetimedb"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { FolderCard } from "@/components/folder-card"
import { CreateFolderDialog } from "@/components/create-folder-dialog"
import { MoveToFolderDialog } from "@/components/move-to-folder-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Project } from "@/lib/types"

type SortMode = "newest" | "oldest" | "az" | "za"
type VisibilityMode = "all" | "starred"

const SORT_LABELS: Record<SortMode, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  az: "A-Z",
  za: "Z-A",
}

const VISIBILITY_LABELS: Record<VisibilityMode, string> = {
  all: "Show all",
  starred: "Show starred",
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function sortProjects(list: Project[], mode: SortMode): Project[] {
  const sorted = [...list]
  if (mode === "newest") {
    return sorted.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
  }
  if (mode === "oldest") {
    return sorted.sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at))
  }
  if (mode === "az") {
    return sorted.sort((a, b) => a.name.localeCompare(b.name))
  }
  return sorted.sort((a, b) => b.name.localeCompare(a.name))
}

export function ProjectsView() {
  const router = useRouter()
  const { user } = useAuth()
  const {
    projects,
    stdbProjects,
    folders,
    activeFolderId,
    setActiveFolderId,
    moveProjectToFolder,
    fetchProjects,
    starredProjectIds,
    toggleProjectStar,
    removeProject,
    duplicateProject,
  } = useProjectStore()
  const [sortMode, setSortMode] = useState<SortMode>("newest")
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>("all")
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [moveDialogProjectId, setMoveDialogProjectId] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const activeFolder = folders.find((f) => f.id === activeFolderId)

  const folderProjectCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of stdbProjects) {
      if (p.folderId) {
        counts[p.folderId] = (counts[p.folderId] ?? 0) + 1
      }
    }
    return counts
  }, [stdbProjects])

  // Determine shared projects and their owner names
  const sharedProjectInfo = useMemo(() => {
    if (!user?.uid) return new Map<string, { isShared: boolean; ownerName: string }>()
    const info = new Map<string, { isShared: boolean; ownerName: string }>()
    for (const p of stdbProjects) {
      if (p.ownerId !== user.uid) {
        // This is a shared project — find owner name from collaborators
        const collabs = getProjectCollaborators(p.id)
        const owner = collabs.find(c => c.role === 'owner')
        info.set(p.id, {
          isShared: true,
          ownerName: owner?.displayName ?? 'Unknown',
        })
      }
    }
    return info
  }, [stdbProjects, user?.uid])

  const visibleProjects = useMemo(() => {
    let filtered = visibilityMode === "starred"
      ? projects.filter((project) => starredProjectIds.includes(project.id))
      : projects

    // Filter by folder membership
    if (activeFolderId) {
      // Inside a folder: show only projects in this folder
      const folderProjectIds = new Set(
        stdbProjects.filter((p) => p.folderId === activeFolderId).map((p) => p.id)
      )
      filtered = filtered.filter((p) => folderProjectIds.has(p.id))
    } else if (visibilityMode !== "starred") {
      // At root: hide projects that are inside folders
      const inFolderIds = new Set(
        stdbProjects.filter((p) => p.folderId).map((p) => p.id)
      )
      filtered = filtered.filter((p) => !inFolderIds.has(p.id))
    }

    return sortProjects(filtered, sortMode)
  }, [projects, stdbProjects, sortMode, visibilityMode, starredProjectIds, activeFolderId])

  const handleCreateFolder = async (name: string, color: string) => {
    if (!isConnected() || !user?.uid) return
    try {
      getConnection().reducers.createFolder({ name, ownerId: user.uid, color, sortOrder: folders.length })
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }

  const handleRenameFolder = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return
    const newName = prompt('Rename folder:', folder.name)
    if (!newName?.trim()) return
    try {
      getConnection().reducers.renameFolder({ folderId, name: newName.trim() })
    } catch (err) {
      console.error('Failed to rename folder:', err)
    }
  }

  const handleDeleteFolder = (folderId: string) => {
    try {
      getConnection().reducers.deleteFolder({ folderId })
      if (activeFolderId === folderId) setActiveFolderId(null)
    } catch (err) {
      console.error('Failed to delete folder:', err)
    }
  }

  const handleMoveToFolder = (projectId: string, folderId: string) => {
    const prev = stdbProjects.find((p) => p.id === projectId)?.folderId ?? ''
    moveProjectToFolder(projectId, folderId)
    try {
      getConnection().reducers.moveProjectToFolder({ projectId, folderId })
    } catch {
      moveProjectToFolder(projectId, prev) // rollback
    }
  }

  const moveTarget = stdbProjects.find((p) => p.id === moveDialogProjectId)

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        <WorkspaceSidebar active="projects" />

        <main className="projects-streak-bg relative flex-1 overflow-auto bg-background/50">

          <motion.div
            className="mx-auto max-w-6xl p-6 lg:p-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28 }}
          >
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                {activeFolderId && (
                  <button
                    onClick={() => setActiveFolderId(null)}
                    className="mb-2 flex cursor-pointer items-center gap-1 text-sm text-flux-amber transition-opacity hover:opacity-80"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Projects
                  </button>
                )}
                <h1 className="text-5xl font-bold tracking-tight text-foreground">
                  {activeFolder ? activeFolder.name : "Your Projects"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {visibleProjects.length} visible of {projects.length} total
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setCreateFolderOpen(true)}
                  className="h-10 cursor-pointer gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition hover:bg-secondary"
                >
                  <FolderPlus className="h-4 w-4 text-muted-foreground" />
                  New Folder
                </Button>
                <Button
                  onClick={() => router.push("/record")}
                  className="h-12 cursor-pointer gap-2 rounded-xl bg-card px-5 text-base font-semibold text-foreground shadow-sm ring-1 ring-border transition hover:bg-secondary"
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  Start a new project
                </Button>
              </div>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    Sort by: {SORT_LABELS[sortMode]}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={() => setSortMode("newest")}>Newest first</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortMode("oldest")}>Oldest first</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortMode("az")}>A-Z</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortMode("za")}>Z-A</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    {VISIBILITY_LABELS[visibilityMode]}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => setVisibilityMode("all")}>Show all</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setVisibilityMode("starred")}>Show starred</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Folder cards at root level */}
            {!activeFolderId && folders.length > 0 && visibilityMode !== "starred" && (
              <motion.div
                className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
              >
                {[...folders].sort((a, b) => a.sortOrder - b.sortOrder).map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    projectCount={folderProjectCounts[folder.id] ?? 0}
                    onClick={() => setActiveFolderId(folder.id)}
                    onRename={() => handleRenameFolder(folder.id)}
                    onDelete={() => handleDeleteFolder(folder.id)}
                  />
                ))}
              </motion.div>
            )}

            {visibleProjects.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/70">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary">
                  <Film className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">No projects in this view</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try changing filters or create a new recording.</p>
                </div>
              </div>
            ) : (
              <motion.div
                className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
              >
                {visibleProjects.map((project) => {
                  const isStarred = starredProjectIds.includes(project.id)
                  const shared = sharedProjectInfo.get(project.id)

                  return (
                    <motion.article
                      key={project.id}
                      variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
                      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-flux-amber/35 hover:shadow-md"
                      onClick={() => router.push(`/studio?projectId=${project.id}`)}
                    >
                      <div className="relative aspect-video border-b border-border bg-gradient-to-br from-secondary/80 to-secondary/40">
                        {project.thumbnail ? (
                          <img src={project.thumbnail} alt={project.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Film className="h-10 w-10 text-muted-foreground/30" />
                          </div>
                        )}

                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleProjectStar(project.id)
                              }}
                              className={`absolute right-2 top-2 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border/80 bg-card/90 backdrop-blur-sm transition ${isStarred ? "text-amber-400" : "text-muted-foreground hover:text-amber-300"}`}
                              aria-label={isStarred ? "Unstar project" : "Star project"}
                              aria-pressed={isStarred}
                            >
                              <Star className="h-4 w-4" fill={isStarred ? "currentColor" : "none"} />
                            </button>
                      </div>

                      <div className="p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{project.name}</h3>
                            {shared?.isShared && (
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-1.5 py-0 text-[10px] font-medium text-blue-400">
                                  <Users className="h-2.5 w-2.5" />
                                  Shared
                                </span>
                                <span className="text-[10px] text-muted-foreground truncate">
                                  by {shared.ownerName}
                                </span>
                              </div>
                            )}
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Project actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => router.push(`/studio?projectId=${project.id}`)}>
                                <Play className="mr-2 h-3.5 w-3.5" /> Open
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicateProject(project.id)}>
                                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                setMoveDialogProjectId(project.id)
                              }}>
                                <FolderInput className="mr-2 h-3.5 w-3.5" /> Move to Folder
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => removeProject(project.id)}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="inline-flex items-center gap-1">
                            <Film className="h-3 w-3" />
                            {project.duration}
                            {project.editStats && (
                              <> • {Math.round(project.editStats.secondsRemoved)}s removed • {project.editStats.editCount} {project.editStats.editCount === 1 ? "edit" : "edits"}</>
                            )}
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Edited {formatDate(project.updated_at)}
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  )
                })}
              </motion.div>
            )}
          </motion.div>
        </main>
      </div>

      <CreateFolderDialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreate={handleCreateFolder}
      />

      {moveDialogProjectId && moveTarget && (
        <MoveToFolderDialog
          open={!!moveDialogProjectId}
          onClose={() => setMoveDialogProjectId(null)}
          folders={folders}
          currentFolderId={moveTarget.folderId}
          onMove={(folderId) => handleMoveToFolder(moveDialogProjectId, folderId)}
        />
      )}
    </div>
  )
}
