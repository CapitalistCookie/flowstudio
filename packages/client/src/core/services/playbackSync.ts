/**
 * Playback synchronization engine.
 * Drives the timeline playhead using requestAnimationFrame.
 * Framework-agnostic — talks to the timeline store directly.
 */

import type { StoreApi } from 'zustand';
import type { TimelineStore } from '../stores/timelineStore';

let animFrameId: number | null = null;
let lastFrameTime: number | null = null;
let store: StoreApi<TimelineStore> | null = null;

function tick(timestamp: number) {
  if (!store) return;

  const state = store.getState();
  if (!state.isPlaying) {
    lastFrameTime = null;
    animFrameId = null;
    return;
  }

  if (lastFrameTime !== null) {
    const deltaMs = timestamp - lastFrameTime;
    const newMs = state.playheadMs + deltaMs;

    if (newMs >= state.durationMs && state.durationMs > 0) {
      // Reached end — stop playback
      store.getState().setPlayheadMs(state.durationMs);
      store.getState().setIsPlaying(false);
      lastFrameTime = null;
      animFrameId = null;
      return;
    }

    store.getState().setPlayheadMs(newMs);
  }

  lastFrameTime = timestamp;
  animFrameId = requestAnimationFrame(tick);
}

export function startPlayback(timelineStore: StoreApi<TimelineStore>) {
  store = timelineStore;
  const state = store.getState();

  // If at end, restart from beginning
  if (state.playheadMs >= state.durationMs && state.durationMs > 0) {
    store.getState().setPlayheadMs(0);
  }

  store.getState().setIsPlaying(true);
  lastFrameTime = null;
  animFrameId = requestAnimationFrame(tick);
}

export function stopPlayback() {
  if (store) {
    store.getState().setIsPlaying(false);
  }
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  lastFrameTime = null;
}

export function togglePlayback(timelineStore: StoreApi<TimelineStore>) {
  const state = timelineStore.getState();
  if (state.isPlaying) {
    stopPlayback();
  } else {
    startPlayback(timelineStore);
  }
}

export function seekTo(timelineStore: StoreApi<TimelineStore>, ms: number) {
  timelineStore.getState().setPlayheadMs(Math.max(0, ms));
}
