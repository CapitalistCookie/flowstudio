/**
 * Auto-save service.
 * Periodically saves timeline state to localStorage as a draft.
 * Framework-agnostic.
 */

import type { StoreApi } from 'zustand';
import type { TimelineStore } from '../stores/timelineStore';

const SAVE_INTERVAL_MS = 30000; // 30 seconds
const STORAGE_PREFIX = 'flowstudio_draft_';

let timer: ReturnType<typeof setInterval> | null = null;
let store: StoreApi<TimelineStore> | null = null;
let projectId: string | null = null;

function getKey(): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

function save() {
  if (!store || !projectId) return;
  const state = store.getState();

  const draft = {
    tracks: state.tracks,
    clips: state.clips,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(getKey(), JSON.stringify(draft));
  } catch {
    // Storage full — ignore
  }
}

export function startAutoSave(
  timelineStore: StoreApi<TimelineStore>,
  activeProjectId: string
) {
  stopAutoSave();
  store = timelineStore;
  projectId = activeProjectId;

  // Save immediately on start
  save();

  timer = setInterval(save, SAVE_INTERVAL_MS);
}

export function stopAutoSave() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function loadDraft(
  timelineStore: StoreApi<TimelineStore>,
  activeProjectId: string
): boolean {
  const key = `${STORAGE_PREFIX}${activeProjectId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;

    const draft = JSON.parse(raw);
    if (Array.isArray(draft.tracks) && Array.isArray(draft.clips)) {
      // Recalculate durationMs from restored clips
      const clips = draft.clips as Array<{ startMs: number; durationMs: number }>;
      const durationMs = clips.length > 0
        ? Math.max(...clips.map((c) => c.startMs + c.durationMs))
        : 0;
      timelineStore.getState().setTimelineState({
        tracks: draft.tracks,
        clips: draft.clips,
        durationMs,
      });
      return true;
    }
  } catch {
    // Corrupted draft — ignore
  }
  return false;
}

export function clearDraft(activeProjectId: string) {
  localStorage.removeItem(`${STORAGE_PREFIX}${activeProjectId}`);
}

export function hasDraft(activeProjectId: string): boolean {
  return localStorage.getItem(`${STORAGE_PREFIX}${activeProjectId}`) !== null;
}
