/**
 * Zustand store for high-frequency playback state.
 *
 * Extracted from EditorContext to prevent full-tree re-renders during
 * playback and scrubbing. Only components that subscribe to specific
 * selectors (video-preview, timeline playhead) will re-render.
 */

import { create } from 'zustand';

interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  isScrubbing: boolean;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsScrubbing: (scrubbing: boolean) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentTime: 0,
  isPlaying: false,
  isScrubbing: false,
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsScrubbing: (scrubbing) => set({ isScrubbing: scrubbing }),
}));
