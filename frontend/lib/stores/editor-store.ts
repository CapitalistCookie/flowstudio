import { create } from "zustand"
import type { TimelineTrack } from "../types"
import { MOCK_TIMELINE_TRACKS } from "../mock-data"

interface EditorStore {
  tracks: TimelineTrack[]
  currentTime: number
  duration: number
  isPlaying: boolean
  viewMode: "polished" | "raw"
  selectedClipId: string | null
  projectName: string
  projectResolution: string
  projectFrameRate: number

  setCurrentTime: (time: number) => void
  togglePlay: () => void
  setIsPlaying: (playing: boolean) => void
  setViewMode: (mode: "polished" | "raw") => void
  setSelectedClipId: (id: string | null) => void
  setProjectName: (name: string) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  tracks: MOCK_TIMELINE_TRACKS,
  currentTime: 0,
  duration: 109,
  isPlaying: false,
  viewMode: "polished",
  selectedClipId: null,
  projectName: "Launch Video v4",
  projectResolution: "1920x1080",
  projectFrameRate: 30,

  setCurrentTime: (time) => set({ currentTime: time }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedClipId: (id) => set({ selectedClipId: id }),
  setProjectName: (name) => set({ projectName: name }),
}))
