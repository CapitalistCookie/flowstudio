"use client"

import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { motion } from "framer-motion"
import { 
  Plus, 
  ArrowRight, 
  Clock, 
  TrendingUp, 
  Rocket,
  Sparkles,
  Scissors
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { useProjectStore } from "@/lib/stores/project-store"

function parseDurationToSeconds(duration: string): number {
  const parts = duration.split(":").map(Number)
  if (parts.some(Number.isNaN)) return 0

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    return hours * 3600 + minutes * 60 + seconds
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts
    return minutes * 60 + seconds
  }

  return 0
}

export function DashboardView() {
  const router = useRouter()
  const { user } = useUser()
  const { projects } = useProjectStore()

  // Get current hour for greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening"

  // Get recent projects (last 3)
  const recentProjects = projects.slice(0, 3)

  const totalDurationSeconds = projects.reduce((sum, project) => {
    return sum + parseDurationToSeconds(project.duration)
  }, 0)

  const editingHoursSaved = (totalDurationSeconds * 2.2) / 3600
  const demosShipped = projects.filter((project) => project.status === "ready" || project.status === "exported").length
  const aiEditsApplied = projects.filter((project) => project.confidence >= 80).length
  const deadTimeRemovedMinutes = Math.round((totalDurationSeconds * 0.18) / 60)

  const stats = [
    { label: "Editing hours saved", value: `${editingHoursSaved.toFixed(1)}h`, icon: Clock },
    { label: "Demos shipped", value: `${demosShipped}`, icon: Rocket },
    { label: "AI edits applied", value: `${aiEditsApplied}`, icon: Sparkles },
    { label: "Dead time removed", value: `${deadTimeRemovedMinutes}m`, icon: Scissors },
  ]

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <WorkspaceSidebar active="dashboard" />

      {/* ── Main Content ── */}
      <main className="relative flex-1 overflow-y-auto bg-background/50">
        {/* Subtle Background Glow for main content */}
        <div className="absolute top-0 left-1/2 -z-10 h-[500px] w-full -translate-x-1/2 bg-[radial-gradient(circle_at_50%_0%,rgba(245,166,35,0.03),transparent_70%)]" />

        <div className="mx-auto max-w-6xl px-8 py-12 lg:px-16 flex flex-col min-h-full">
          
          {/* ── Top Greeting ── */}
          <motion.header
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10"
          >
            <h1 className="text-5xl font-bold tracking-tight text-foreground">
              {greeting}, {user?.firstName || "Alex"}
            </h1>
            <p className="mt-3 text-xl text-muted-foreground">
              Your demo. Exactly how you want it.
            </p>
          </motion.header>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {stats.map((stat) => {
              const Icon = stat.icon

              return (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-border/50 bg-card/35 px-4 py-3 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 text-flux-amber/80" />
                    {stat.label}
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{stat.value}</p>
                </div>
              )
            })}
          </motion.section>

          {/* ── Center Prompt Section ── */}
          <div className="flex flex-1 flex-col items-center justify-center py-10">
             <motion.button
              whileHover={{ scale: 1.01, borderColor: "rgba(245,166,35,0.3)" }}
              whileTap={{ scale: 0.99 }}
              onClick={() => router.push("/record")}
              className="group relative flex w-full max-w-2xl cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[40px] border-2 border-border/40 bg-card/30 px-12 py-20 transition-all hover:bg-card/50 shadow-2xl shadow-black/5"
             >
                <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[32px] bg-flux-amber/10 ring-1 ring-flux-amber/20 group-hover:bg-flux-amber/20 transition-colors">
                  <Plus className="h-10 w-10 text-flux-amber" />
                </div>
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-foreground">Start a new project</h2>
                  <p className="mt-4 text-base text-muted-foreground/80 max-w-sm mx-auto">
                    Record your screen and FlowStudio will automatically engineer a polished showcase.
                  </p>
                </div>
                
                {/* Visual Accent */}
                <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-flux-amber/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
             </motion.button>
          </div>

          {/* ── Recent Projects ── */}
          <section className="mt-auto pt-20">
            <div className="mb-8 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-foreground">Recent Projects</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="group cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/projects")}
              >
                View all projects
                <ArrowRight size={16} className="ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>

            {recentProjects.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center rounded-[32px] bg-secondary/10 border border-border/20 border-dashed">
                <p className="text-muted-foreground italic text-sm">No recorded projects yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                {recentProjects.map((project, i) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => router.push("/studio")}
                    className="group cursor-pointer"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-sm transition-all hover:border-flux-amber/30 hover:shadow-xl hover:-translate-y-1">
                      <div className="absolute inset-0 bg-gradient-to-br from-flux-amber/5 to-flux-teal/5" />
                      
                      {/* Thumbnail Placeholder Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-50 transition-opacity">
                        <TrendingUp size={48} className="text-muted-foreground/20" />
                      </div>

                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5">
                        <div className="rounded-full bg-white/90 backdrop-blur-sm px-4 py-2 text-xs font-bold text-black shadow-lg">
                          Open Editor
                        </div>
                      </div>

                      <div className="absolute bottom-4 right-4 rounded-xl bg-black/60 px-2.5 py-1 text-[11px] font-mono font-bold text-white backdrop-blur-lg border border-white/10 uppercase tracking-widest">
                        {project.duration}
                      </div>
                    </div>
                    <div className="mt-5 px-1">
                      <h4 className="text-lg font-bold text-foreground line-clamp-1 group-hover:text-flux-amber transition-colors">{project.name}</h4>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] font-medium text-muted-foreground uppercase tracking-tight">
                        <span className="flex items-center gap-1.5 text-flux-teal">
                          <Clock size={12} />
                          {new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <div className="h-1 w-1 rounded-full bg-border" />
                        <span>Ready to export</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
