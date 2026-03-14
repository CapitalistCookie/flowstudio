import { type EffectPreset, type ClipTransform, type ClipEffects, type TimelineClipData, type Caption, type MediaFileData } from "./types"

export interface ProjectData {
  id: string
  user_id: string
  name: string
  resolution: string
  frame_rate: number
  duration: string
  thumbnail: string | null
  timeline_data: TimelineData | null
  created_at: string
  updated_at: string
}

export interface TimelineData {
  clips: TimelineClipData[]
  media: MediaFileData[]
}

const STORAGE_KEY = 'flowstudio_projects'

const getLocalProjects = (): ProjectData[] => {
  if (typeof window === 'undefined') return []
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : []
}

const saveLocalProjects = (projects: ProjectData[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  }
}

// Create a new project
export async function createProject(data: {
  name: string
  resolution: string
  frame_rate: number
}): Promise<{ data: ProjectData | null; error: Error | null }> {
  try {
    const projects = getLocalProjects()
    const newProject: ProjectData = {
      id: crypto.randomUUID(),
      user_id: "local_user",
      name: data.name,
      resolution: data.resolution,
      frame_rate: data.frame_rate,
      duration: "00:00:00",
      thumbnail: null,
      timeline_data: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    projects.push(newProject)
    saveLocalProjects(projects)
    
    return { data: newProject, error: null }
  } catch (error: unknown) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Get all projects for the current user
export async function getProjects(): Promise<{ data: ProjectData[] | null; error: Error | null }> {
  try {
    const projects = getLocalProjects().sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    return { data: projects, error: null }
  } catch (error: unknown) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Get a single project by ID
export async function getProject(id: string): Promise<{ data: ProjectData | null; error: Error | null }> {
  try {
    const projects = getLocalProjects()
    let project = projects.find(p => p.id === id)
    
    if (!project) {
      if (id === "local-project") {
        project = {
          id: "local-project",
          user_id: "local_user",
          name: "My FlowStudio Project",
          resolution: "1080p",
          frame_rate: 30,
          duration: "00:00:00",
          thumbnail: null,
          timeline_data: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        projects.push(project)
        saveLocalProjects(projects)
      } else {
        return { data: null, error: new Error("Project not found") }
      }
    }
    
    return { data: project, error: null }
  } catch (error: unknown) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Update a project
export async function updateProject(
  id: string,
  data: Partial<{
    name: string
    resolution: string
    frame_rate: number
    duration: string
    thumbnail: string | null
    timeline_data: TimelineData | null
  }>
): Promise<{ data: ProjectData | null; error: Error | null }> {
  try {
    const projects = getLocalProjects()
    const index = projects.findIndex(p => p.id === id)
    
    if (index === -1) {
      return { data: null, error: new Error("Project not found") }
    }
    
    const updatedProject = {
      ...projects[index],
      ...data,
      updated_at: new Date().toISOString(),
    }
    
    projects[index] = updatedProject
    saveLocalProjects(projects)
    
    return { data: updatedProject, error: null }
  } catch (error: unknown) {
    return { data: null, error }
  }
}

// Delete a project
export async function deleteProject(id: string): Promise<{ error: Error | null }> {
  try {
    const projects = getLocalProjects()
    const filteredProjects = projects.filter(p => p.id !== id)
    saveLocalProjects(filteredProjects)
    return { error: null }
  } catch (error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}

// Duplicate a project
export async function duplicateProject(id: string): Promise<{ data: ProjectData | null; error: Error | null }> {
  try {
    const projects = getLocalProjects()
    const original = projects.find(p => p.id === id)
    
    if (!original) {
      return { data: null, error: new Error("Project not found") }
    }
    
    const duplicatedProject: ProjectData = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (Copy)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    projects.push(duplicatedProject)
    saveLocalProjects(projects)
    
    return { data: duplicatedProject, error: null }
  } catch (error: unknown) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}
