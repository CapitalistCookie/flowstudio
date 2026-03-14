"use client"

import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Plus, Clock, ExternalLink, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FluxLogo } from "@/components/flux-logo"
import { useProjectStore } from "@/lib/stores/project-store"
import { GlassCard } from "@/components/ui/glass-card"

export function DashboardView() {
  const router = useRouter()
  const { projects } = useProjectStore()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"

  return (
    <div className="flex h-screen w-screen flex-col bg-[#070605] text-white overflow-hidden">
      {/* Cinematic Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-[#F5A623]/5 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-[#1A9E8F]/5 blur-[120px] rounded-full" />
      </div>

      {/* Top Bar */}
      <nav className="relative z-50 flex h-20 shrink-0 items-center justify-between px-8 lg:px-16 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <button onClick={() => router.push("/")} className="cursor-pointer">
          <FluxLogo />
        </button>

        <div className="flex items-center gap-6">
          <Button
            onClick={() => router.push("/record")}
            className="h-10 px-6 rounded-full bg-white text-black hover:bg-[#F5A623] transition-all font-medium flex gap-2"
          >
            <Plus className="h-4 w-4" />
            New Recording
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 overflow-auto p-8 lg:p-16">
        <div className="max-w-6xl mx-auto">
          {/* Greeting */}
          <header className="mb-12">
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[#8A8780] font-mono text-xs uppercase tracking-[0.3em] mb-3"
            >
              System Dashboard
            </motion.p>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-medium tracking-tight"
            >
              Good {greeting}.
            </motion.h1>
          </header>

          {/* Project Grid */}
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[13px] font-mono uppercase tracking-[0.2em] text-[#8A8780]">Your Projects</h2>
            </div>

            {projects.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <GlassCard 
                  className="flex flex-col items-center justify-center py-24 border-dashed border-white/10"
                  onClick={() => router.push("/record")}
                >
                  <div className="p-4 rounded-full bg-white/5 mb-6 group-hover:bg-[#F5A623]/10 transition-colors">
                    <Plus className="h-8 w-8 text-[#8A8780] group-hover:text-[#F5A623]" />
                  </div>
                  <p className="text-[#8A8780]">No recordings yet. Take your first flight.</p>
                </GlassCard>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project, i) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                  >
                    <GlassCard 
                      className="p-0 border-white/5 hover:border-[#F5A623]/20 transition-all cursor-pointer group"
                      onClick={() => router.push("/studio")}
                    >
                      {/* Preview Placeholder */}
                      <div className="aspect-video bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                        <ExternalLink className="h-6 w-6 text-white/20 group-hover:text-white/60 transition-all scale-90 group-hover:scale-100" />
                        <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-[#8A8780]">
                          {project.duration || "00:00"}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-5">
                        <h3 className="text-sm font-medium mb-4 truncate group-hover:text-[#F5A623] transition-colors">
                          {project.name}
                        </h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[10px] text-[#4A4740] font-mono uppercase tracking-wider">
                            <Calendar className="h-3 w-3" />
                            {new Date(project.updated_at).toLocaleDateString()}
                          </div>
                          <div className="px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-[9px] font-medium text-[#8A8780]">
                            Ready
                          </div>
                        </div>
                      </div>
                    </GlassCard>
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

