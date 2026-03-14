'use client';

/**
 * Central store instances + React hook adapters.
 * Uses useStore() from zustand to bind vanilla stores to React.
 */

import { createContext, useContext } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { createProjectStore, type ProjectStore } from '../core/stores/projectStore';
import { createTimelineStore, type TimelineStore } from '../core/stores/timelineStore';
import { createUIStore, type UIStoreType } from '../core/stores/uiStore';
import { createCaptureStore, type CaptureStoreType } from '../core/stores/captureStore';
import { createSignalStore, type SignalStoreType } from '../core/stores/signalStore';

// ─── Store instances (singletons) ───────────────────────────────────

export const projectStore = createProjectStore();
export const timelineStore = createTimelineStore();
export const uiStore = createUIStore();
export const captureStore = createCaptureStore();
export const signalStore = createSignalStore();

// ─── Context (for SSR safety) ───────────────────────────────────────

export interface StoreContextValue {
  projectStore: StoreApi<ProjectStore>;
  timelineStore: StoreApi<TimelineStore>;
  uiStore: StoreApi<UIStoreType>;
  captureStore: StoreApi<CaptureStoreType>;
  signalStore: StoreApi<SignalStoreType>;
}

export const StoreContext = createContext<StoreContextValue | null>(null);

function useStoreContext() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreContext not found — wrap app in StoreProvider');
  return ctx;
}

// ─── Typed hooks ────────────────────────────────────────────────────

export function useProjectStore<T>(selector: (s: ProjectStore) => T): T {
  const { projectStore: store } = useStoreContext();
  return useStore(store, selector);
}

export function useTimelineStore<T>(selector: (s: TimelineStore) => T): T {
  const { timelineStore: store } = useStoreContext();
  return useStore(store, selector);
}

export function useTimelineStoreShallow<T>(
  selector: (s: TimelineStore) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is
): T {
  const { timelineStore: store } = useStoreContext();
  return useStoreWithEqualityFn(store, selector, equalityFn);
}

export function useUIStore<T>(selector: (s: UIStoreType) => T): T {
  const { uiStore: store } = useStoreContext();
  return useStore(store, selector);
}

export function useCaptureStore<T>(selector: (s: CaptureStoreType) => T): T {
  const { captureStore: store } = useStoreContext();
  return useStore(store, selector);
}

export function useSignalStore<T>(selector: (s: SignalStoreType) => T): T {
  const { signalStore: store } = useStoreContext();
  return useStore(store, selector);
}
