import { create } from "zustand"
import type { Project } from "../types"
import { ProjectStatus } from '@flowstudio/shared'
import { getProjects as getStdbProjects, getFolders as getStdbFolders, getConnection, isConnected, type StdbProject, type StdbFolder } from "../stdb/spacetimedb"

function stdbProjectToProject(p: StdbProject): Project {
  let editStats: Project["editStats"]
  let duration = "00:00"

  if (p.metadata) {
    try {
      const meta = JSON.parse(p.metadata)
      if (
        meta &&
        typeof meta.editStats === 'object' &&
        meta.editStats !== null &&
        typeof meta.editStats.outputSeconds === 'number' &&
        typeof meta.editStats.secondsRemoved === 'number' &&
        typeof meta.editStats.editCount === 'number'
      ) {
        editStats = meta.editStats
        const secs = Math.max(0, Math.floor(meta.editStats.outputSeconds))
        const m = Math.floor(secs / 60)
        const s = secs % 60
        duration = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      }
    } catch {
      // ignore malformed metadata
    }
  }

  return {
    id: p.id,
    name: p.name,
    status: p.status as ProjectStatus,
    resolution: "1920x1080",
    frame_rate: 30,
    duration,
    thumbnail: null,
    confidence: 0,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt).toISOString(),
    category: "Uncategorized",
    folderId: p.folderId || undefined,
    editStats,
  }
}

interface ProjectStore {
  projects: Project[]
  starredProjectIds: string[]
  /** Raw STDB projects for folder membership lookups */
  stdbProjects: StdbProject[]
  folders: StdbFolder[]
  activeFolderId: string | null
  searchQuery: string
  viewMode: "grid" | "list"
  isLoading: boolean

  setSearchQuery: (q: string) => void
  setViewMode: (mode: "grid" | "list") => void
  toggleProjectStar: (id: string) => void
  addProject: (project: Project) => void
  removeProject: (id: string) => void
  duplicateProject: (id: string) => void
  fetchProjects: () => void
  /** Called by STDB reactive callbacks to push project updates */
  setStdbProjects: (projects: StdbProject[]) => void
  /** Called by STDB reactive callbacks to push folder updates */
  setStdbFolders: (folders: StdbFolder[]) => void
  setActiveFolderId: (id: string | null) => void
  moveProjectToFolder: (projectId: string, folderId: string) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  starredProjectIds: [],
  stdbProjects: [],
  folders: [],
  activeFolderId: null,
  searchQuery: "",
  viewMode: "grid",
  isLoading: true,

  setSearchQuery: (q) => set({ searchQuery: q }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleProjectStar: (id) => {
    if (isConnected()) {
      getConnection().reducers.toggleProjectStar({ projectId: id });
    }
    set((s) => {
      const alreadyStarred = s.starredProjectIds.includes(id)
      return {
        starredProjectIds: alreadyStarred
          ? s.starredProjectIds.filter((pid) => pid !== id)
          : [id, ...s.starredProjectIds],
      }
    })
  },
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

  fetchProjects: () => {
    // Read from SDK in-memory cache (synchronous)
    const stdbProjects = getStdbProjects()
    const projects = stdbProjects
      .map(stdbProjectToProject)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    // Merge starred state from STDB
    const starredIds = stdbProjects
      .filter((p) => p.starred)
      .map((p) => p.id)

    const folders = getStdbFolders()

    set({
      projects,
      stdbProjects,
      starredProjectIds: starredIds,
      folders,
      isLoading: false,
    })
  },

  setStdbProjects: (stdbProjects) => {
    const projects = stdbProjects
      .map(stdbProjectToProject)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    const starredIds = stdbProjects
      .filter((p) => p.starred)
      .map((p) => p.id)

    set({
      projects,
      stdbProjects,
      starredProjectIds: starredIds,
      isLoading: false,
    })
  },

  setStdbFolders: (folders) => {
    set({ folders })
  },

  setActiveFolderId: (id) => set({ activeFolderId: id }),

  moveProjectToFolder: (projectId, folderId) => {
    set((s) => ({
      stdbProjects: s.stdbProjects.map((p) =>
        p.id === projectId ? { ...p, folderId } : p
      ),
    }))
  },
}))
