"use client"

import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Plus, ArrowRight, Clock, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FluxLogo } from "@/components/flux-logo"
import { useProjectStore } from "@/lib/stores/project-store"

export function DashboardView() {
  const router = useRouter()
  const { projects } = useProjectStore()

  // Get current hour for greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening"

  // Get recent projects (last 3)
  const recentProjects = projects.slice(0, 3)

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Top Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6">
        <button onClick={() => router.push("/")} className="cursor-pointer">
          <FluxLogo />
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" className="text-foreground font-medium">
            Dashboard
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => router.push("/projects")}>
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

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <motion.div
          className="p-8 lg:p-12 max-w-7xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* Greeting Section */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mb-10"
          >
            <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-2">
              {greeting}, Alex
            </h1>
            <p className="text-lg text-muted-foreground">
              Your demo. Exactly how you want it.
            </p>
          </motion.div>

          {/* Start New Project Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mb-12"
          >
            <button
              onClick={() => router.push("/record")}
              className="group relative w-full rounded-2xl border-2 border-dashed border-border hover:border-[#F5A623]/50 bg-card p-12 transition-all hover:shadow-lg cursor-pointer text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F5A623]/10 group-hover:bg-[#F5A623]/20 transition-colors">
                    <Plus className="h-8 w-8 text-[#F5A623]" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground mb-1">Start a new project</h2>
                    <p className="text-sm text-muted-foreground">Record your screen and let AI handle the editing</p>
                  </div>
                </div>
                <ArrowRight className="h-6 w-6 text-muted-foreground group-hover:text-[#F5A623] transition-colors" />
              </div>
            </button>
          </motion.div>

          {/* Recent Projects */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-foreground">Recent Projects</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/projects")}
                className="text-muted-foreground hover:text-foreground"
              >
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {recentProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary mb-4">
                  <Clock className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mb-4">No projects yet</p>
                <Button
                  onClick={() => router.push("/record")}
                  size="sm"
                  className="bg-[#F5A623] hover:bg-[#E09420] text-[#1A1916]"
                >
                  Create Your First Project
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {recentProjects.map((project, index) => (
                  <motion.button
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 + index * 0.05 }}
                    onClick={() => router.push("/studio")}
                    className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all hover:border-[#F5A623]/30 hover:shadow-md cursor-pointer text-left"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video w-full mb-4 rounded-lg bg-gradient-to-br from-[#F5A623]/10 to-[#1A9E8F]/5 overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-mono text-white">
                        {project.duration}
                      </div>
                    </div>

                    {/* Info */}
                    <h3 className="font-medium text-foreground mb-1 truncate">{project.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Edited {new Date(project.updated_at).toLocaleDateString()}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
