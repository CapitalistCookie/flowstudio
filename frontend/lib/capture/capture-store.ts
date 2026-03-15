import { create } from 'zustand';
import type { CaptureState, CaptureStatus, CaptureSourceType } from './types';

interface CaptureActions {
  setStatus: (status: CaptureStatus) => void;
  setElapsedMs: (ms: number) => void;
  setStream: (stream: MediaStream | null) => void;
  setBlobUrl: (url: string | null) => void;
  setError: (error: string | null) => void;
  setSourceType: (type: CaptureSourceType) => void;
  toggleAudio: () => void;
  reset: () => void;
}

export type CaptureStore = CaptureState & CaptureActions;

const initialState: CaptureState = {
  status: 'idle',
  elapsedMs: 0,
  stream: null,
  blobUrl: null,
  error: null,
  sourceType: 'screen',
  audioEnabled: true,
};

export const useCaptureStore = create<CaptureStore>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setElapsedMs: (elapsedMs) => set({ elapsedMs }),
  setStream: (stream) => set({ stream }),
  setBlobUrl: (blobUrl) => set({ blobUrl }),
  setError: (error) => set({ error, status: 'idle' }),
  setSourceType: (sourceType) => set({ sourceType }),
  toggleAudio: () => set((s) => ({ audioEnabled: !s.audioEnabled })),
  reset: () => set(initialState),
}));
