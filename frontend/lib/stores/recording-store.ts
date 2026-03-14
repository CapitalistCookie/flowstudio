import { create } from "zustand"
import type { IntentStream } from "../types"
import { MOCK_INTENT_STREAMS } from "../mock-data"

interface RecordingStore {
  isRecording: boolean
  isPaused: boolean
  elapsedSeconds: number
  streams: IntentStream[]

  startRecording: () => void
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: () => void
  tick: () => void
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  isRecording: false,
  isPaused: false,
  elapsedSeconds: 0,
  streams: MOCK_INTENT_STREAMS,

  startRecording: () => set({ isRecording: true, isPaused: false, elapsedSeconds: 0 }),
  pauseRecording: () => set({ isPaused: true }),
  resumeRecording: () => set({ isPaused: false }),
  stopRecording: () => set({ isRecording: false, isPaused: false }),
  tick: () => set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 })),
}))
