"use client"

import { useRouter } from "next/navigation"
import { useUser, SignOutButton } from "@clerk/nextjs"
import { motion } from "framer-motion"
import { 
  Plus, 
  ArrowRight, 
  Clock, 
  TrendingUp, 
  ChevronRight, 
  Folder, 
  LayoutDashboard, 
  Settings,
  MoreVertical
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FluxLogo } from "@/components/flux-logo"
import { useProjectStore } from "@/lib/stores/project-store"

export function DashboardView() {
  const router = useRouter()
  const { user } = useUser()
  const { projects } = useProjectStore()

  // Get current hour for greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening"

  // Get recent projects (last 3)
  const recentProjects = projects.slice(0, 3)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* ── Sidebar ── */}
      <div 
        className="relative z-50 flex h-full w-[280px] flex-col border-r border-border bg-card/40 backdrop-blur-xl"
      >

        {/* Logo Section */}
        <div className="flex h-24 items-center justify-center px-6 overflow-hidden">
          <FluxLogo size="md" />
        </div>

        {/* Navigation */}
        <div className="flex-1 space-y-2 px-3 py-4 overflow-y-auto scrollbar-none">
          <SidebarItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active 
            onClick={() => router.push("/dashboard")}
          />

          <SidebarItem 
            icon={<Folder size={20} />} 
            label="Projects" 
            onClick={() => router.push("/projects")}
          />

          <div className="ml-3 mt-1 space-y-1">
            {projects.length > 0 ? (
              projects.slice(0, 6).map((project) => (
                <button
                  key={project.id}
                  onClick={() => router.push("/studio")}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                >
                  <div className="h-1 w-1 rounded-full bg-border" />
                  <span className="line-clamp-1">{project.name}</span>
                </button>
              ))
            ) : (
              <span className="px-3 py-1.5 text-[10px] text-muted-foreground italic">No projects yet</span>
            )}
          </div>

          <SidebarItem 
            icon={<Settings size={20} />} 
            label="Settings" 
            onClick={() => router.push("/projects")}
          />
        </div>

        {/* User Profile Hooked to Bottom Left */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/50">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-flux-amber/20">
              <img 
                src={user?.imageUrl || "https://avatar.vercel.sh/guest"} 
                alt="Profile" 
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="text-sm font-semibold truncate text-foreground">
                {user?.firstName || user?.username || "Creative"}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {user?.primaryEmailAddress?.emailAddress || "Free Tier"}
              </span>
            </div>
            <SignOutButton>
              <button
                className="cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Sign out"
              >
                  <MoreVertical size={16} />
              </button>
            </SignOutButton>
          </div>
        </div>
      </div>

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

function SidebarItem({ icon, label, active = false, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active 
          ? "bg-flux-amber/10 text-flux-amber shadow-[inset_0_0_0_1px_rgba(245,166,35,0.2)]" 
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <div className={`shrink-0 ${active && "text-flux-amber"}`}>
        {icon}
      </div>
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  )
}

