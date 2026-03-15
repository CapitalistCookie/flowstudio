import { createStore } from 'zustand/vanilla';
import type { ProjectMeta, FolderMeta } from '../types';
import type { Asset, Task, ProjectState } from '@flowstudio/shared';

export interface ProjectStoreState {
  /** All projects */
  projects: ProjectMeta[];
  /** Currently active project ID */
  activeProjectId: string | null;
  /** Assets for the active project */
  assets: Asset[];
  /** Tasks for the active project */
  tasks: Task[];
  /** Project state (progress) for active project */
  projectState: ProjectState | null;
  /** All folders */
  folders: FolderMeta[];
  /** Active folder ID for browsing (null = root) */
  activeFolderId: string | null;
  /** Loading flags */
  loading: boolean;
  /** Error message */
  error: string | null;
}

export interface ProjectStoreActions {
  setProjects: (projects: ProjectMeta[]) => void;
  setActiveProject: (id: string | null) => void;
  setAssets: (assets: Asset[]) => void;
  setTasks: (tasks: Task[]) => void;
  setProjectState: (state: ProjectState | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateProject: (id: string, patch: Partial<ProjectMeta>) => void;
  removeProject: (id: string) => void;
  toggleStar: (id: string) => void;
  setFolders: (folders: FolderMeta[]) => void;
  setActiveFolderId: (id: string | null) => void;
  addFolder: (folder: FolderMeta) => void;
  removeFolder: (id: string) => void;
  moveProjectToFolder: (projectId: string, folderId: string) => void;
}

export type ProjectStore = ProjectStoreState & ProjectStoreActions;

export const createProjectStore = () =>
  createStore<ProjectStore>((set) => ({
    projects: [],
    activeProjectId: null,
    assets: [],
    tasks: [],
    projectState: null,
    folders: [],
    activeFolderId: null,
    loading: false,
    error: null,

    setProjects: (projects) => set({ projects }),
    setActiveProject: (id) => set({ activeProjectId: id }),
    setAssets: (assets) => set({ assets }),
    setTasks: (tasks) => set({ tasks }),
    setProjectState: (state) => set({ projectState: state }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    updateProject: (id, patch) =>
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),

    removeProject: (id) =>
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
        ...(s.activeProjectId === id
          ? { assets: [], tasks: [], projectState: null }
          : {}),
      })),

    toggleStar: (id) =>
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id ? { ...p, starred: !p.starred } : p
        ),
      })),

    setFolders: (folders) => set({ folders }),
    setActiveFolderId: (id) => set({ activeFolderId: id }),
    addFolder: (folder) =>
      set((s) => ({ folders: [...s.folders, folder] })),
    removeFolder: (id) =>
      set((s) => ({
        folders: s.folders.filter((f) => f.id !== id),
        activeFolderId: s.activeFolderId === id ? null : s.activeFolderId,
      })),
    moveProjectToFolder: (projectId, folderId) =>
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, folderId } : p
        ),
      })),
  }));
