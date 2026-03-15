'use client';

import { useCallback } from 'react';
import { useStore } from 'zustand';
import type { TemporalState } from 'zundo';
import { useTimelineStore, timelineStore } from './useStores';
import type { TimelineStore } from '../core/stores/timelineStore';

/**
 * Undo/redo hooks for the timeline.
 * zundo v2 exposes temporal state via store.temporal (a vanilla store).
 */
export function useTimelineHistory() {
  const temporalStore = (timelineStore as unknown as { temporal: import('zustand').StoreApi<TemporalState<TimelineStore>> }).temporal;

  const pastStates = useStore(temporalStore, (s) => s.pastStates);
  const futureStates = useStore(temporalStore, (s) => s.futureStates);

  const undo = useCallback(() => {
    temporalStore.getState().undo();
  }, [temporalStore]);

  const redo = useCallback(() => {
    temporalStore.getState().redo();
  }, [temporalStore]);

  return {
    undo,
    redo,
    canUndo: pastStates.length > 0,
    canRedo: futureStates.length > 0,
  };
}

/**
 * Convenience hook for common timeline operations.
 */
export function useTimelineActions() {
  const addClip = useTimelineStore((s) => s.addClip);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const moveClip = useTimelineStore((s) => s.moveClip);
  const splitClip = useTimelineStore((s) => s.splitClip);
  const addTrack = useTimelineStore((s) => s.addTrack);
  const removeTrack = useTimelineStore((s) => s.removeTrack);
  const selectClip = useTimelineStore((s) => s.selectClip);
  const deselectAll = useTimelineStore((s) => s.deselectAll);

  return {
    addClip,
    removeClip,
    moveClip,
    splitClip,
    addTrack,
    removeTrack,
    selectClip,
    deselectAll,
  };
}
