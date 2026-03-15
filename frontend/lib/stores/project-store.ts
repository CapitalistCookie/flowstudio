import { create } from "zustand"
import type { Project } from "../types"
import { getProjects, type ProjectData } from "../projects"
import { queryTable } from "../stdb/connection"

function projectDataToProject(p: ProjectData): Project {
  return {
    id: p.id,
    name: p.name,
    status: "ready",
    resolution: p.resolution,
    frame_rate: p.frame_rate,
    duration: p.duration,
    thumbnail: p.thumbnail,
    confidence: 0,
    created_at: p.created_at,
    updated_at: p.updated_at,
    category: "Uncategorized",
  }
}

interface ProjectStore {
  projects: Project[]
  starredProjectIds: string[]
  searchQuery: string
  viewMode: "grid" | "list"
  isLoading: boolean

  setSearchQuery: (q: string) => void
  setViewMode: (mode: "grid" | "list") => void
  toggleProjectStar: (id: string) => void
  addProject: (project: Project) => void
  removeProject: (id: string) => void
  duplicateProject: (id: string) => void
  fetchProjects: () => Promise<void>
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  starredProjectIds: [],
  searchQuery: "",
  viewMode: "grid",
  isLoading: true,

  setSearchQuery: (q) => set({ searchQuery: q }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleProjectStar: (id) =>
    set((s) => {
      const alreadyStarred = s.starredProjectIds.includes(id)
      return {
        starredProjectIds: alreadyStarred
          ? s.starredProjectIds.filter((pid) => pid !== id)
          : [id, ...s.starredProjectIds],
      }
    }),
  addProject: (project) => set((s) => ({ projects: [project, ...s.projects] })),
  removeProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      starredProjectIds: s.starredProjectIds.filter((pid) => pid !== id),
    })),
  duplicateProject: (id) =>
    set((s) => {
      const orig = s.projects.find((p) => p.id === id)
      if (!orig) return s
      const dup: Project = {
        ...orig,
        id: `proj-${Date.now()}`,
        name: `${orig.name} (Copy)`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return { projects: [dup, ...s.projects] }
    }),

  fetchProjects: async () => {
    set({ isLoading: true })
    try {
      // Get local projects
      const { data: localProjects } = await getProjects()
      const projects: Project[] = (localProjects ?? []).map(projectDataToProject)

      // Try to get STDB projects too
      try {
        const stdbProjects = await queryTable("projects")
        const validStatuses = ["recording", "analyzing", "review", "ready", "exported"] as const
        for (const sp of stdbProjects) {
          const id = sp.id as string
          if (!projects.find((p) => p.id === id)) {
            const rawStatus = (sp.status as string) ?? "ready"
            const status = validStatuses.includes(rawStatus as (typeof validStatuses)[number])
              ? (rawStatus as (typeof validStatuses)[number])
              : "ready"
            projects.push({
              id,
              name: (sp.name as string) ?? "Untitled",
              status,
              resolution: "1920x1080",
              frame_rate: 30,
              duration: "00:00",
              thumbnail: null,
              confidence: 0,
              created_at: (sp.createdAt as string) ?? new Date().toISOString(),
              updated_at: (sp.updatedAt as string) ?? new Date().toISOString(),
              category: "Uncategorized",
            })
          }
        }
      } catch {
        // STDB not available — just use local projects
      }

      projects.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      set({ projects, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },
}))
