"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Film, Plus, Search, Grid3x3, List, Clock, MoreVertical,
  Play, Copy, Trash2, ArrowRight, Mic2, TrendingUp, Download, Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FluxLogo } from "@/components/flux-logo"
import { useProjectStore } from "@/lib/stores/project-store"
import type { Project } from "@/lib/types"

const STATUS_STYLES: Record<string, string> = {
  ready:     "bg-[#1A9E8F]/10 text-[#1A9E8F] border border-[#1A9E8F]/20",
  exported:  "bg-[#1A9E8F]/10 text-[#1A9E8F] border border-[#1A9E8F]/20",
  analyzing: "bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/20",
  recording: "bg-destructive/10 text-destructive border border-destructive/20",
  review:    "bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/20",
  draft:     "bg-secondary text-muted-foreground border border-border",
}

function ProjectThumbnail({ project }: { project: Project }) {
  const gradients: Record<string, string> = {
    ready:     "from-[#1A9E8F]/10 to-[#F5A623]/5",
    exported:  "from-[#1A9E8F]/10 to-transparent",
    analyzing: "from-[#F5A623]/10 to-[#F5A623]/3",
    recording: "from-destructive/8 to-transparent",
    review:    "from-[#F5A623]/8 to-transparent",
  }
  const gradient = gradients[project.status] ?? "from-secondary to-transparent"
  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}>
      <Film className="h-10 w-10 text-muted-foreground/20" />
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function ProjectsDashboard() {
  const router = useRouter()
  const { projects, searchQuery, viewMode, setSearchQuery, setViewMode, removeProject, duplicateProject } = useProjectStore()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })

  const handleOpenProject = (_projectId: string) => {
    router.push("/studio")
  }

  const readyCount = projects.filter(p => p.status === "ready" || p.status === "exported").length
  const analyzingCount = projects.filter(p => p.status === "analyzing").length

  return (
    <div className="flex h-screen w-screen flex-col bg-background">

      {/* ── Top Bar ── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6">
        <button onClick={() => router.push("/")} className="cursor-pointer">
          <FluxLogo />
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => router.push("/")}>
            Home
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
          New Recording
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card/50 p-4 md:flex">
          <div className="mb-6">
            <div className="mb-1.5 px-2 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Workspace</div>
            {[
              { label: "All Projects", count: projects.length, active: true },
              { label: "Ready", count: readyCount, color: "#1A9E8F" },
              { label: "Analyzing", count: analyzingCount, color: "#F5A623" },
            ].map((item) => (
              <button
                key={item.label}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors cursor-pointer ${
                  item.active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <span>{item.label}</span>
                <span
                  className="font-mono text-xs"
                  style={item.color ? { color: item.color } : undefined}
                >
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-auto pt-4 border-t border-border">
            <button
              onClick={() => router.push("/record")}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[#F5A623] hover:bg-[#F5A623]/5 transition-colors cursor-pointer"
            >
              <Mic2 className="h-4 w-4" />
              Start Recording
            </button>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-auto">
          <motion.div
            className="p-6 lg:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Page header */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="mb-7"
            >
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {projects.length} recording{projects.length !== 1 ? "s" : ""} · review, edit, and ship.
              </p>
            </motion.div>

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              <StatCard label="Total demos" value={String(projects.length)} />
              <StatCard label="Ready to export" value={String(readyCount)} sub={`${Math.round((readyCount / Math.max(projects.length, 1)) * 100)}% done`} />
              <StatCard label="Exports" value="3" sub="this week" />
              <StatCard label="Avg AI confidence" value="78%" />
            </motion.div>

            {/* Controls */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="mb-5 flex items-center justify-between gap-4"
            >
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search projects…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm bg-card border-border"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                    viewMode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                    viewMode === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>

            {/* Empty state */}
            {filteredProjects.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-64 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary">
                  <Film className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">No recordings yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Start your first demo recording to get going</p>
                </div>
                <Button
                  onClick={() => router.push("/record")}
                  size="sm"
                  className="gap-1.5 bg-[#F5A623] hover:bg-[#E09420] text-[#1A1916]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Recording
                </Button>
              </motion.div>
            ) : viewMode === "list" ? (
              // ── List View ──
              <motion.div
                className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card overflow-hidden"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
              >
                {/* Header row */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                  <span>Project</span>
                  <span>Status</span>
                  <span>Specs</span>
                  <span>Updated</span>
                  <span />
                </div>
                {filteredProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    variants={{ hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } }}
                    className="group grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/30 cursor-pointer"
                    onClick={() => handleOpenProject(project.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-14 shrink-0 overflow-hidden rounded border border-border bg-muted">
                        <ProjectThumbnail project={project} />
                      </div>
                      <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
                    </div>
                    <div>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[project.status] ?? "bg-secondary text-muted-foreground"}`}>
                        {project.status}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.resolution} · {project.frame_rate}fps
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(project.updated_at)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenProject(project.id) }}>
                          <Play className="mr-2 h-3.5 w-3.5" /> Open
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateProject(project.id) }}>
                          <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeProject(project.id) }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              // ── Grid View ──
              <motion.div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
              >
                {filteredProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
                    }}
                    className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-[#F5A623]/25 hover:shadow-sm cursor-pointer"
                    onMouseEnter={() => setHoveredId(project.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => handleOpenProject(project.id)}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video w-full overflow-hidden bg-secondary">
                      <ProjectThumbnail project={project} />
                      {/* Play overlay on hover */}
                      <AnimatePresence>
                        {hoveredId === project.id && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="absolute inset-0 flex items-center justify-center bg-foreground/5"
                          >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/90 shadow-sm">
                              <Play className="h-4 w-4 text-foreground ml-0.5" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {/* Duration badge */}
                      <div className="absolute bottom-2 right-2 rounded-md bg-card/80 backdrop-blur-sm px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {project.duration}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="flex-1 truncate text-sm font-medium text-foreground leading-tight">{project.name}</h3>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenProject(project.id) }}>
                              <Play className="mr-2 h-3.5 w-3.5" /> Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateProject(project.id) }}>
                              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => { e.stopPropagation(); removeProject(project.id) }}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[project.status] ?? "bg-secondary text-muted-foreground"}`}>
                          {project.status}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(project.updated_at)}</span>
                        </div>
                      </div>

                      <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                        {project.resolution} · {project.frame_rate}fps
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
