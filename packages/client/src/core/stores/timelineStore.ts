import { createStore } from 'zustand/vanilla';
import { temporal } from 'zundo';
import type { TimelineState, Track, Clip } from '../types';
import { generateId } from '@flowstudio/shared';

export interface TimelineStoreActions {
  // Track management
  addTrack: (track: Omit<Track, 'id' | 'order'>) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, patch: Partial<Track>) => void;
  reorderTracks: (trackIds: string[]) => void;

  // Clip management
  addClip: (clip: Omit<Clip, 'id'>) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  moveClip: (clipId: string, trackId: string, startMs: number) => void;
  trimClip: (clipId: string, startMs: number, durationMs: number) => void;
  splitClip: (clipId: string, atMs: number) => void;

  // Playhead
  setPlayheadMs: (ms: number) => void;
  setIsPlaying: (playing: boolean) => void;

  // Selection
  selectClip: (clipId: string, additive?: boolean) => void;
  deselectAll: () => void;

  // Zoom & scroll
  setZoom: (pxPerMs: number) => void;
  setScrollOffset: (ms: number) => void;

  // Marks
  setMarkIn: (ms: number | null) => void;
  setMarkOut: (ms: number | null) => void;

  // Snap
  toggleSnap: () => void;
  setSnapResolution: (ms: number) => void;

  // Bulk
  setTimelineState: (state: Partial<TimelineState>) => void;
  reset: () => void;
}

export type TimelineStore = TimelineState & TimelineStoreActions;

const DEFAULT_STATE: TimelineState = {
  tracks: [],
  clips: [],
  playheadMs: 0,
  durationMs: 0,
  pxPerMs: 0.1,
  scrollOffsetMs: 0,
  selectedClipIds: [],
  markInMs: null,
  markOutMs: null,
  isPlaying: false,
  snapEnabled: true,
  snapResolutionMs: 100,
};

function recalcDuration(clips: Clip[]): number {
  if (clips.length === 0) return 0;
  return Math.max(...clips.map((c) => c.startMs + c.durationMs));
}

export const createTimelineStore = () =>
  createStore<TimelineStore>()(
    temporal(
      (set, get) => ({
        ...DEFAULT_STATE,

        addTrack: (track) =>
          set((s) => ({
            tracks: [
              ...s.tracks,
              { ...track, id: generateId(), order: s.tracks.length },
            ],
          })),

        removeTrack: (trackId) =>
          set((s) => {
            const clips = s.clips.filter((c) => c.trackId !== trackId);
            return {
              tracks: s.tracks
                .filter((t) => t.id !== trackId)
                .map((t, i) => ({ ...t, order: i })),
              clips,
              durationMs: recalcDuration(clips),
            };
          }),

        updateTrack: (trackId, patch) =>
          set((s) => ({
            tracks: s.tracks.map((t) =>
              t.id === trackId ? { ...t, ...patch } : t
            ),
          })),

        reorderTracks: (trackIds) =>
          set((s) => ({
            tracks: trackIds
              .map((id, i) => {
                const track = s.tracks.find((t) => t.id === id);
                return track ? { ...track, order: i } : null;
              })
              .filter((t): t is Track => t !== null),
          })),

        addClip: (clip) =>
          set((s) => {
            const newClip = { ...clip, id: generateId() };
            const clips = [...s.clips, newClip];
            return { clips, durationMs: recalcDuration(clips) };
          }),

        removeClip: (clipId) =>
          set((s) => {
            const clips = s.clips.filter((c) => c.id !== clipId);
            return {
              clips,
              durationMs: recalcDuration(clips),
              selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId),
            };
          }),

        updateClip: (clipId, patch) =>
          set((s) => {
            const clips = s.clips.map((c) =>
              c.id === clipId ? { ...c, ...patch } : c
            );
            return { clips, durationMs: recalcDuration(clips) };
          }),

        moveClip: (clipId, trackId, startMs) =>
          set((s) => {
            const snap = s.snapEnabled
              ? Math.round(startMs / s.snapResolutionMs) * s.snapResolutionMs
              : startMs;
            const clips = s.clips.map((c) =>
              c.id === clipId ? { ...c, trackId, startMs: Math.max(0, snap) } : c
            );
            return { clips, durationMs: recalcDuration(clips) };
          }),

        trimClip: (clipId, startMs, durationMs) =>
          set((s) => {
            const clips = s.clips.map((c) =>
              c.id === clipId ? { ...c, startMs, durationMs } : c
            );
            return { clips, durationMs: recalcDuration(clips) };
          }),

        splitClip: (clipId, atMs) => {
          const state = get();
          const clip = state.clips.find((c) => c.id === clipId);
          if (!clip) return;
          const relativeMs = atMs - clip.startMs;
          if (relativeMs <= 0 || relativeMs >= clip.durationMs) return;

          const leftClip: Clip = {
            ...clip,
            durationMs: relativeMs,
          };
          const rightClip: Clip = {
            ...clip,
            id: generateId(),
            startMs: atMs,
            durationMs: clip.durationMs - relativeMs,
            sourceOffsetMs: clip.sourceOffsetMs + relativeMs / clip.speed,
          };

          set((s) => {
            const clips = s.clips.map((c) => (c.id === clipId ? leftClip : c));
            clips.push(rightClip);
            return { clips, durationMs: recalcDuration(clips) };
          });
        },

        setPlayheadMs: (ms) => set({ playheadMs: Math.max(0, ms) }),
        setIsPlaying: (playing) => set({ isPlaying: playing }),

        selectClip: (clipId, additive = false) =>
          set((s) => ({
            selectedClipIds: additive
              ? s.selectedClipIds.includes(clipId)
                ? s.selectedClipIds.filter((id) => id !== clipId)
                : [...s.selectedClipIds, clipId]
              : [clipId],
          })),

        deselectAll: () => set({ selectedClipIds: [] }),

        setZoom: (pxPerMs) => set({ pxPerMs: Math.max(0.001, Math.min(1, pxPerMs)) }),
        setScrollOffset: (ms) => set({ scrollOffsetMs: Math.max(0, ms) }),

        setMarkIn: (ms) => set({ markInMs: ms }),
        setMarkOut: (ms) => set({ markOutMs: ms }),

        toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
        setSnapResolution: (ms) => set({ snapResolutionMs: ms }),

        setTimelineState: (partial) => set(partial),
        reset: () => set(DEFAULT_STATE),
      }),
      {
        // zundo config: only track data changes, not actions
        partialize: (state) => ({
          tracks: state.tracks,
          clips: state.clips,
          selectedClipIds: state.selectedClipIds,
        }),
        limit: 50,
      }
    )
  );
