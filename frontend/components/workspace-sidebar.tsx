"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useUser, SignOutButton } from "@clerk/nextjs"
import { Folder, LayoutDashboard, MoreVertical, Plus, Settings } from "lucide-react"
import { FluxLogo } from "@/components/flux-logo"
import { useProjectStore } from "@/lib/stores/project-store"

interface WorkspaceSidebarProps {
  active: "dashboard" | "projects"
  showProjectList?: boolean
}

function SidebarItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-flux-amber/10 text-flux-amber shadow-[inset_0_0_0_1px_rgba(245,166,35,0.2)]"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <div className={`shrink-0 ${active ? "text-flux-amber" : ""}`}>{icon}</div>
      <span className="flex-1 truncate text-left">{label}</span>
    </button>
  )
}

export function WorkspaceSidebar({ active, showProjectList = true }: WorkspaceSidebarProps) {
  const router = useRouter()
  const { user } = useUser()
  const { projects } = useProjectStore()

  return (
    <aside className="relative z-50 flex h-full w-[280px] flex-col border-r border-border bg-card/40 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-start overflow-hidden px-5 pt-2">
        <FluxLogo size="sm" />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 scrollbar-none">
        <SidebarItem
          icon={<LayoutDashboard size={20} />}
          label="Dashboard"
          active={active === "dashboard"}
          onClick={() => router.push("/dashboard")}
        />

        <SidebarItem
          icon={<Folder size={20} />}
          label="Projects"
          active={active === "projects"}
          onClick={() => router.push("/projects")}
        />

        {showProjectList && (
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
              <span className="px-3 py-1.5 text-[10px] italic text-muted-foreground">No projects yet</span>
            )}
          </div>
        )}

        <SidebarItem
          icon={<Settings size={20} />}
          label="Settings"
          onClick={() => router.push("/projects")}
        />
      </div>

      <div className="border-t border-border p-4">
        <button
          onClick={() => router.push("/record")}
          className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-flux-amber/30 bg-flux-amber/8 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-flux-amber/16"
        >
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <Plus className="h-4 w-4 text-flux-amber" />
          Start a project
        </button>

        <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/50">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-flux-amber/20">
            <img
              src={user?.imageUrl || "https://avatar.vercel.sh/guest"}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold text-foreground">
              {user?.firstName || user?.username || "Creative"}
            </span>
            <span className="truncate text-[10px] text-muted-foreground">
              {user?.primaryEmailAddress?.emailAddress || "Free Tier"}
            </span>
          </div>

          <SignOutButton>
            <button className="cursor-pointer text-muted-foreground transition-colors hover:text-destructive" aria-label="Sign out">
              <MoreVertical size={16} />
            </button>
          </SignOutButton>
        </div>
      </div>
    </aside>
  )
}
