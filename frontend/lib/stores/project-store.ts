import { create } from "zustand"
import type { Project } from "../types"
import { MOCK_PROJECTS } from "../mock-data"

interface ProjectStore {
  projects: Project[]
  searchQuery: string
  viewMode: "grid" | "list"

  setSearchQuery: (q: string) => void
  setViewMode: (mode: "grid" | "list") => void
  addProject: (project: Project) => void
  removeProject: (id: string) => void
  duplicateProject: (id: string) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: MOCK_PROJECTS,
  searchQuery: "",
  viewMode: "grid",

  setSearchQuery: (q) => set({ searchQuery: q }),
  setViewMode: (mode) => set({ viewMode: mode }),
  addProject: (project) => set((s) => ({ projects: [project, ...s.projects] })),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
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
}))
