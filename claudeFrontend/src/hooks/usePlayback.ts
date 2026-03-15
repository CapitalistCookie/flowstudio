'use client';

import { useCallback } from 'react';
import { useTimelineStore, timelineStore } from './useStores';
import {
  startPlayback,
  stopPlayback,
  togglePlayback,
  seekTo,
} from '../core/services/playbackSync';

export function usePlayback() {
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const playheadMs = useTimelineStore((s) => s.playheadMs);
  const durationMs = useTimelineStore((s) => s.durationMs);

  const play = useCallback(() => startPlayback(timelineStore), []);
  const stop = useCallback(() => stopPlayback(), []);
  const toggle = useCallback(() => togglePlayback(timelineStore), []);
  const seek = useCallback((ms: number) => seekTo(timelineStore, ms), []);

  return { isPlaying, playheadMs, durationMs, play, stop, toggle, seek };
}
