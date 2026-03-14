'use client';

import { useEffect } from 'react';
import { registerShortcut } from '@/core/services/shortcuts';
import { timelineStore } from '@/hooks/useStores';
import { togglePlayback, seekTo } from '@/core/services/playbackSync';

/**
 * Register studio keyboard shortcuts.
 * Call this in the studio page component.
 */
export function useStudioShortcuts() {
  useEffect(() => {
    const unsubscribers = [
      // Playback
      registerShortcut(
        { action: 'play-pause', keys: 'Space', label: 'Play / Pause', scope: 'studio' },
        () => togglePlayback(timelineStore)
      ),
      registerShortcut(
        { action: 'seek-start', keys: 'Home', label: 'Go to start', scope: 'studio' },
        () => seekTo(timelineStore, 0)
      ),
      registerShortcut(
        { action: 'seek-end', keys: 'End', label: 'Go to end', scope: 'studio' },
        () => seekTo(timelineStore, timelineStore.getState().durationMs)
      ),
      registerShortcut(
        { action: 'seek-back', keys: 'j', label: 'Skip back 5s', scope: 'studio' },
        () => {
          const ms = timelineStore.getState().playheadMs;
          seekTo(timelineStore, Math.max(0, ms - 5000));
        }
      ),
      registerShortcut(
        { action: 'seek-forward', keys: 'l', label: 'Skip forward 5s', scope: 'studio' },
        () => {
          const ms = timelineStore.getState().playheadMs;
          seekTo(timelineStore, ms + 5000);
        }
      ),

      // Editing
      registerShortcut(
        { action: 'split', keys: 's', label: 'Split at playhead', scope: 'studio' },
        () => {
          const { selectedClipIds, playheadMs } = timelineStore.getState();
          for (const id of selectedClipIds) {
            timelineStore.getState().splitClip(id, playheadMs);
          }
        }
      ),
      registerShortcut(
        { action: 'delete', keys: 'Delete', label: 'Delete selected', scope: 'studio' },
        () => {
          const { selectedClipIds } = timelineStore.getState();
          for (const id of selectedClipIds) {
            timelineStore.getState().removeClip(id);
          }
        }
      ),
      registerShortcut(
        { action: 'deselect', keys: 'Escape', label: 'Deselect all', scope: 'studio' },
        () => timelineStore.getState().deselectAll()
      ),

      // Undo/Redo
      registerShortcut(
        { action: 'undo', keys: 'Mod+Z', label: 'Undo', scope: 'studio' },
        () => {
          const temporal = (timelineStore as unknown as { temporal: { getState: () => { undo: () => void } } }).temporal;
          temporal.getState().undo();
        }
      ),
      registerShortcut(
        { action: 'redo', keys: 'Mod+Shift+Z', label: 'Redo', scope: 'studio' },
        () => {
          const temporal = (timelineStore as unknown as { temporal: { getState: () => { redo: () => void } } }).temporal;
          temporal.getState().redo();
        }
      ),

      // Snap
      registerShortcut(
        { action: 'toggle-snap', keys: 'n', label: 'Toggle snap', scope: 'studio' },
        () => timelineStore.getState().toggleSnap()
      ),

      // Zoom
      registerShortcut(
        { action: 'zoom-in', keys: '=', label: 'Zoom in', scope: 'studio' },
        () => {
          const pxPerMs = timelineStore.getState().pxPerMs;
          timelineStore.getState().setZoom(pxPerMs * 1.2);
        }
      ),
      registerShortcut(
        { action: 'zoom-out', keys: '-', label: 'Zoom out', scope: 'studio' },
        () => {
          const pxPerMs = timelineStore.getState().pxPerMs;
          timelineStore.getState().setZoom(pxPerMs * 0.8);
        }
      ),
    ];

    return () => {
      for (const unsub of unsubscribers) unsub();
    };
  }, []);
}
