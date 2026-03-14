import { createStore } from 'zustand/vanilla';
import type { CaptureState, CaptureStatus } from '../types';

export interface CaptureStoreActions {
  setStatus: (status: CaptureStatus) => void;
  setElapsedMs: (ms: number) => void;
  setStream: (stream: MediaStream | null) => void;
  setBlobUrl: (url: string | null) => void;
  setError: (message: string | null) => void;
  setSourceType: (type: CaptureState['sourceType']) => void;
  toggleAudio: () => void;
  toggleCursorOverlay: () => void;
  toggleTypingDetection: () => void;
  reset: () => void;
}

export type CaptureStoreType = CaptureState & CaptureStoreActions;

const DEFAULT_CAPTURE: CaptureState = {
  status: 'idle',
  elapsedMs: 0,
  stream: null,
  blobUrl: null,
  errorMessage: null,
  sourceType: 'screen',
  audioEnabled: true,
  cursorOverlay: true,
  typingDetection: true,
};

export const createCaptureStore = () =>
  createStore<CaptureStoreType>((set, get) => ({
    ...DEFAULT_CAPTURE,

    setStatus: (status) => set({ status }),
    setElapsedMs: (ms) => set({ elapsedMs: ms }),
    setStream: (stream) => set({ stream }),
    setBlobUrl: (url) => set({ blobUrl: url }),
    setError: (message) =>
      set({ errorMessage: message, status: message ? 'error' : 'idle' }),
    setSourceType: (type) => set({ sourceType: type }),
    toggleAudio: () => set((s) => ({ audioEnabled: !s.audioEnabled })),
    toggleCursorOverlay: () => set((s) => ({ cursorOverlay: !s.cursorOverlay })),
    toggleTypingDetection: () =>
      set((s) => ({ typingDetection: !s.typingDetection })),
    reset: () => {
      const s = get();
      if (s.blobUrl) URL.revokeObjectURL(s.blobUrl);
      if (s.stream) s.stream.getTracks().forEach((t) => t.stop());
      set(DEFAULT_CAPTURE);
    },
  }));
