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
  Filter,
  Copy,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectStore } from "@/lib/stores/project-store"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
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
  const { projects, fetchProjects, starredProjectIds, toggleProjectStar, removeProject, duplicateProject } = useProjectStore()
  const [sortMode, setSortMode] = useState<SortMode>("newest")

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>("all")

  const visibleProjects = useMemo(() => {
    const filtered = visibilityMode === "starred"
      ? projects.filter((project) => starredProjectIds.includes(project.id))
      : projects
    return sortProjects(filtered, sortMode)
  }, [projects, sortMode, visibilityMode, starredProjectIds])

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
                <h1 className="text-5xl font-bold tracking-tight text-foreground">Your Projects</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {visibleProjects.length} visible of {projects.length} total
                </p>
              </div>

              <Button
                onClick={() => router.push("/record")}
                className="h-12 cursor-pointer gap-2 rounded-xl bg-card px-5 text-base font-semibold text-foreground shadow-sm ring-1 ring-border transition hover:bg-secondary"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                Start a new project
              </Button>
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

                  return (
                    <motion.article
                      key={project.id}
                      variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
                      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-flux-amber/35 hover:shadow-md"
                      onClick={() => router.push("/studio")}
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
                          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{project.name}</h3>

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
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => router.push("/studio")}>
                                <Play className="mr-2 h-3.5 w-3.5" /> Open
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicateProject(project.id)}>
                                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => removeProject(project.id)}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div>Title: {project.duration}</div>
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
    </div>
  )
}
