# FlowStudio Frontend NLE Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full NLE video editor frontend with 4 views (Dashboard, Recording, Studio, Projects), hybrid HTML+Canvas timeline, browser screen capture, and framework-agnostic core layer.

**Architecture:** Strict UI/Core separation. Core layer (Zustand vanilla stores, Canvas timeline renderer, capture engine, services) is framework-agnostic. React+shadcn is the swappable UI layer. Hooks bridge the two.

**Tech Stack:** Next.js 15, React 19, shadcn/ui, Zustand + zundo (temporal), Tailwind 4, Canvas 2D, Web Workers, MediaRecorder API

**Design doc:** `docs/plans/2026-03-14-frontend-nle-design.md` (40 sections, approved)

---

## Phase 1: Foundation — Dependencies, Core Structure, Stores

### Task 1.1: Install Dependencies

**Files:**
- Modify: `claudeFrontend/package.json`

**Step 1: Install zustand, zundo, and sonner**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend add zustand zundo sonner
```

**Step 2: Install shadcn/ui prerequisites**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-context-menu @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-slider @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-popover @radix-ui/react-select class-variance-authority clsx tailwind-merge lucide-react react-resizable-panels
```

**Step 3: Verify build**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend run typecheck
```

**Step 4: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/package.json pnpm-lock.yaml && git commit -m "chore: add zustand, shadcn primitives, and NLE dependencies"
```

---

### Task 1.2: Create Core Directory Structure

**Files:**
- Create: `claudeFrontend/src/core/stores/projectStore.ts`
- Create: `claudeFrontend/src/core/stores/timelineStore.ts`
- Create: `claudeFrontend/src/core/stores/captureStore.ts`
- Create: `claudeFrontend/src/core/stores/signalStore.ts`
- Create: `claudeFrontend/src/core/stores/uiStore.ts`
- Create: `claudeFrontend/src/core/services/notifications.ts`
- Create: `claudeFrontend/src/core/services/shortcuts.ts`
- Create: `claudeFrontend/src/core/services/signedUrls.ts`
- Create: `claudeFrontend/src/core/services/capture.ts`
- Create: `claudeFrontend/src/core/services/playbackSync.ts`
- Create: `claudeFrontend/src/core/timeline/renderer.ts`
- Create: `claudeFrontend/src/core/timeline/types.ts`
- Create: `claudeFrontend/src/core/workers/waveformWorker.ts`
- Create: `claudeFrontend/src/core/workers/thumbnailWorker.ts`
- Create: `claudeFrontend/src/core/types.ts`

**Step 1: Create directories**

```bash
mkdir -p /home/user/FlowStudio/claudeFrontend/src/core/{stores,services,timeline,workers}
```

**Step 2: Create core types file**

Create `claudeFrontend/src/core/types.ts`:

```typescript
import type { SignalType } from '@flowstudio/shared';

// ── Timeline Types ──────────────────────────────────

export type TrackType = 'video' | 'audio' | 'text' | 'overlay';

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  height: number; // px
}

export interface Clip {
  id: string;
  trackId: string;
  sourceAssetId: string;
  startMs: number;       // position on timeline
  durationMs: number;    // length on timeline
  sourceStartMs: number; // in-point in source
  sourceEndMs: number;   // out-point in source
  type: TrackType;
  name: string;
  effects: ClipEffect[];
  speed: number;         // playback rate (1.0 = normal)
  opacity: number;       // 0-1
  // Text-specific
  textContent?: string;
  textStyle?: TextStyle;
}

export interface ClipEffect {
  property: 'zoom' | 'panX' | 'panY' | 'opacity' | 'speed';
  keyframes: Keyframe[];
}

export interface Keyframe {
  timeMs: number;  // relative to clip start
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  position: { x: number; y: number };
  animation: 'none' | 'fade-in' | 'typewriter' | 'slide-up';
}

export interface Transition {
  id: string;
  type: 'fade' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'slide';
  durationMs: number;
  clipBeforeId: string;
  clipAfterId: string;
}

export interface Marker {
  id: string;
  timeMs: number;
  label: string;
  color: string;
}

// ── Timeline Renderer Types ─────────────────────────

export type HitTarget =
  | { type: 'clip'; clipId: string; edge: 'left' | 'right' | 'body' }
  | { type: 'playhead' }
  | { type: 'transition'; transitionId: string }
  | { type: 'keyframe'; clipId: string; effectIndex: number; keyframeIndex: number }
  | { type: 'marker'; markerId: string }
  | { type: 'empty'; trackIndex: number; timeMs: number };

export interface ViewportState {
  scrollMs: number;
  zoomPxPerMs: number; // pixels per millisecond
  viewportWidthPx: number;
}

// ── Capture Types ───────────────────────────────────

export interface CursorPosition {
  x: number;
  y: number;
  timestampMs: number;
}

export interface TypingEvent {
  text: string;
  timestampMs: number;
  charactersPerSecond: number;
  isPaste: boolean;
}

export type CaptureState = 'idle' | 'recording' | 'paused' | 'stopped';
export type CaptureSource = 'screen' | 'tab' | 'window';

// ── Notification Types ──────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  durationMs: number;
  action?: { label: string; onClick: () => void };
}

// ── UI Types ────────────────────────────────────────

export type PanelTab = 'assets' | 'signals';
export type EditMode = 'overwrite' | 'ripple';
export type ToolMode = 'select' | 'cut' | 'text';

export interface PreviewModalState {
  open: boolean;
  mode: 'clip' | 'render';
  clipId?: string;
}
```

**Step 3: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/ && git commit -m "feat: create core directory structure and types"
```

---

### Task 1.3: Implement Project Store (vanilla Zustand)

**Files:**
- Create: `claudeFrontend/src/core/stores/projectStore.ts`
- Modify: `claudeFrontend/src/lib/stdbConnection.ts` (already framework-agnostic, keep as-is)

**Step 1: Write the store**

Create `claudeFrontend/src/core/stores/projectStore.ts`:

```typescript
import { createStore } from 'zustand/vanilla';
import type { Project, Task, ProjectState, Asset, Signal } from '@flowstudio/shared';
import { callReducer, queryTable } from '../../lib/stdbConnection';

export interface ProjectStoreState {
  // Data
  projects: Map<string, Project>;
  tasks: Map<string, Task>;
  projectStates: Map<string, ProjectState>;
  assets: Map<string, Asset>;
  loading: boolean;
  connected: boolean;

  // Actions
  syncProjects: (rows: Record<string, unknown>[]) => void;
  syncTasks: (rows: Record<string, unknown>[]) => void;
  syncProjectStates: (rows: Record<string, unknown>[]) => void;
  syncAssets: (rows: Record<string, unknown>[]) => void;
  setLoading: (loading: boolean) => void;
  setConnected: (connected: boolean) => void;

  // Derived
  getProject: (id: string) => Project | undefined;
  getProjectTasks: (projectId: string) => Task[];
  getProjectAssets: (projectId: string) => Asset[];
  getProjectState: (projectId: string) => ProjectState | undefined;
  getProjectsByStatus: (status: string) => Project[];
  getAllProjectsSorted: () => Project[];
}

export const projectStore = createStore<ProjectStoreState>((set, get) => ({
  projects: new Map(),
  tasks: new Map(),
  projectStates: new Map(),
  assets: new Map(),
  loading: true,
  connected: false,

  syncProjects: (rows) => {
    const map = new Map<string, Project>();
    for (const row of rows) map.set(row.id as string, row as unknown as Project);
    set({ projects: map, loading: false });
  },

  syncTasks: (rows) => {
    const map = new Map<string, Task>();
    for (const row of rows) map.set(row.id as string, row as unknown as Task);
    set({ tasks: map });
  },

  syncProjectStates: (rows) => {
    const map = new Map<string, ProjectState>();
    for (const row of rows) map.set(row.projectId as string, row as unknown as ProjectState);
    set({ projectStates: map });
  },

  syncAssets: (rows) => {
    const map = new Map<string, Asset>();
    for (const row of rows) map.set(row.id as string, row as unknown as Asset);
    set({ assets: map });
  },

  setLoading: (loading) => set({ loading }),
  setConnected: (connected) => set({ connected }),

  getProject: (id) => get().projects.get(id),

  getProjectTasks: (projectId) =>
    Array.from(get().tasks.values())
      .filter(t => t.projectId === projectId)
      .sort((a, b) => a.createdAt - b.createdAt),

  getProjectAssets: (projectId) =>
    Array.from(get().assets.values())
      .filter(a => a.projectId === projectId),

  getProjectState: (projectId) => get().projectStates.get(projectId),

  getProjectsByStatus: (status) =>
    Array.from(get().projects.values()).filter(p => p.status === status),

  getAllProjectsSorted: () =>
    Array.from(get().projects.values()).sort((a, b) => b.updatedAt - a.updatedAt),
}));
```

**Step 2: Verify typecheck**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend run typecheck
```

**Step 3: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/stores/projectStore.ts && git commit -m "feat: add framework-agnostic project store"
```

---

### Task 1.4: Implement Timeline Store (with undo/redo)

**Files:**
- Create: `claudeFrontend/src/core/stores/timelineStore.ts`

**Step 1: Write the store**

Create `claudeFrontend/src/core/stores/timelineStore.ts`:

```typescript
import { createStore } from 'zustand/vanilla';
import { temporal } from 'zundo';
import { generateId } from '@flowstudio/shared';
import type { Track, Clip, Transition, Marker, TrackType, EditMode, ToolMode, ViewportState } from '../types';

export interface TimelineStoreState {
  // Data
  tracks: Track[];
  clips: Map<string, Clip>;
  transitions: Map<string, Transition>;
  markers: Map<string, Marker>;

  // Playback
  playheadMs: number;
  isPlaying: boolean;
  durationMs: number; // total timeline duration

  // Viewport
  scrollMs: number;
  zoomPxPerMs: number;

  // Selection
  selectedClipIds: Set<string>;
  selectedTransitionId: string | null;

  // Mode
  editMode: EditMode;
  toolMode: ToolMode;

  // Clipboard
  clipboardClips: Clip[];

  // Dirty flag
  isDirty: boolean;

  // ── Track operations ──
  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, newIndex: number) => void;
  updateTrack: (trackId: string, updates: Partial<Pick<Track, 'muted' | 'solo' | 'locked' | 'name'>>) => void;

  // ── Clip operations (all undoable) ──
  addClip: (clip: Omit<Clip, 'id'>) => string;
  moveClip: (clipId: string, trackId: string, startMs: number) => void;
  trimClip: (clipId: string, edge: 'left' | 'right', newMs: number) => void;
  splitClip: (clipId: string, atMs: number) => void;
  deleteClips: (clipIds: string[]) => void;
  setClipProperty: (clipId: string, updates: Partial<Clip>) => void;

  // ── Selection ──
  selectClip: (clipId: string, additive?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  deselectAll: () => void;
  selectAll: () => void;

  // ── Clipboard ──
  copySelected: () => void;
  cutSelected: () => void;
  paste: () => void;

  // ── Playback ──
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seekTo: (ms: number) => void;

  // ── Viewport ──
  setZoom: (pxPerMs: number) => void;
  setScroll: (ms: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: (viewportWidthPx: number) => void;

  // ── Mode ──
  setEditMode: (mode: EditMode) => void;
  setToolMode: (mode: ToolMode) => void;

  // ── Transitions ──
  addTransition: (clipBeforeId: string, clipAfterId: string, type: Transition['type'], durationMs?: number) => string;
  removeTransition: (transitionId: string) => void;

  // ── Markers ──
  addMarker: (timeMs: number, label?: string) => string;
  removeMarker: (markerId: string) => void;

  // ── Import ──
  loadFromTimelineEvents: (events: Array<{ trackIndex: number; trackType: TrackType; clipId: string; startMs: number; endMs: number; sourceAssetId: string; effects: Array<{ type: string; params: Record<string, unknown> }> }>) => void;

  // ── Serialization ──
  serialize: () => string;
  markClean: () => void;

  // ── Internal ──
  _recalcDuration: () => void;
}

const DEFAULT_TRACK_HEIGHT = 60;
const MIN_ZOOM = 0.0001;  // 1px = 10s
const MAX_ZOOM = 0.03;    // 1px = ~33ms (1 frame at 30fps)
const DEFAULT_ZOOM = 0.01; // 1px = 100ms

export const timelineStore = createStore<TimelineStoreState>()(
  temporal(
    (set, get) => ({
      tracks: [
        { id: 'v1', type: 'video' as TrackType, name: 'V1', muted: false, solo: false, locked: false, height: DEFAULT_TRACK_HEIGHT },
        { id: 'a1', type: 'audio' as TrackType, name: 'A1', muted: false, solo: false, locked: false, height: DEFAULT_TRACK_HEIGHT },
      ],
      clips: new Map(),
      transitions: new Map(),
      markers: new Map(),
      playheadMs: 0,
      isPlaying: false,
      durationMs: 0,
      scrollMs: 0,
      zoomPxPerMs: DEFAULT_ZOOM,
      selectedClipIds: new Set(),
      selectedTransitionId: null,
      editMode: 'overwrite' as EditMode,
      toolMode: 'select' as ToolMode,
      clipboardClips: [],
      isDirty: false,

      // ── Track operations ──
      addTrack: (type, name) => {
        const id = generateId();
        const trackName = name ?? `${type.charAt(0).toUpperCase()}${get().tracks.filter(t => t.type === type).length + 1}`;
        set(state => ({
          tracks: [...state.tracks, { id, type, name: trackName, muted: false, solo: false, locked: false, height: DEFAULT_TRACK_HEIGHT }],
          isDirty: true,
        }));
        return id;
      },

      removeTrack: (trackId) => set(state => {
        const newClips = new Map(state.clips);
        for (const [id, clip] of newClips) {
          if (clip.trackId === trackId) newClips.delete(id);
        }
        return {
          tracks: state.tracks.filter(t => t.id !== trackId),
          clips: newClips,
          isDirty: true,
        };
      }),

      reorderTrack: (trackId, newIndex) => set(state => {
        const tracks = [...state.tracks];
        const oldIndex = tracks.findIndex(t => t.id === trackId);
        if (oldIndex < 0 || oldIndex === newIndex) return state;
        const [track] = tracks.splice(oldIndex, 1);
        tracks.splice(newIndex, 0, track);
        return { tracks, isDirty: true };
      }),

      updateTrack: (trackId, updates) => set(state => ({
        tracks: state.tracks.map(t => t.id === trackId ? { ...t, ...updates } : t),
        isDirty: true,
      })),

      // ── Clip operations ──
      addClip: (clipData) => {
        const id = generateId();
        const clip: Clip = { ...clipData, id };
        set(state => {
          const newClips = new Map(state.clips);
          newClips.set(id, clip);
          return { clips: newClips, isDirty: true };
        });
        get()._recalcDuration();
        return id;
      },

      moveClip: (clipId, trackId, startMs) => set(state => {
        const clip = state.clips.get(clipId);
        if (!clip) return state;
        const newClips = new Map(state.clips);
        newClips.set(clipId, { ...clip, trackId, startMs: Math.max(0, startMs) });
        return { clips: newClips, isDirty: true };
      }),

      trimClip: (clipId, edge, newMs) => set(state => {
        const clip = state.clips.get(clipId);
        if (!clip) return state;
        const newClips = new Map(state.clips);
        if (edge === 'left') {
          const delta = newMs - clip.startMs;
          newClips.set(clipId, {
            ...clip,
            startMs: Math.max(0, newMs),
            durationMs: clip.durationMs - delta,
            sourceStartMs: clip.sourceStartMs + delta,
          });
        } else {
          newClips.set(clipId, {
            ...clip,
            durationMs: Math.max(100, newMs - clip.startMs),
            sourceEndMs: clip.sourceStartMs + Math.max(100, newMs - clip.startMs),
          });
        }
        return { clips: newClips, isDirty: true };
      }),

      splitClip: (clipId, atMs) => set(state => {
        const clip = state.clips.get(clipId);
        if (!clip) return state;
        const relativeMs = atMs - clip.startMs;
        if (relativeMs <= 0 || relativeMs >= clip.durationMs) return state;

        const newClips = new Map(state.clips);
        // Shorten original
        newClips.set(clipId, {
          ...clip,
          durationMs: relativeMs,
          sourceEndMs: clip.sourceStartMs + relativeMs,
        });
        // Create new clip for the remainder
        const newId = generateId();
        newClips.set(newId, {
          ...clip,
          id: newId,
          name: `${clip.name} (split)`,
          startMs: atMs,
          durationMs: clip.durationMs - relativeMs,
          sourceStartMs: clip.sourceStartMs + relativeMs,
          effects: clip.effects.map(e => ({ ...e, keyframes: [...e.keyframes] })),
        });
        return { clips: newClips, isDirty: true };
      }),

      deleteClips: (clipIds) => set(state => {
        const newClips = new Map(state.clips);
        const newSelected = new Set(state.selectedClipIds);
        for (const id of clipIds) {
          newClips.delete(id);
          newSelected.delete(id);
        }
        return { clips: newClips, selectedClipIds: newSelected, isDirty: true };
      }),

      setClipProperty: (clipId, updates) => set(state => {
        const clip = state.clips.get(clipId);
        if (!clip) return state;
        const newClips = new Map(state.clips);
        newClips.set(clipId, { ...clip, ...updates });
        return { clips: newClips, isDirty: true };
      }),

      // ── Selection ──
      selectClip: (clipId, additive = false) => set(state => {
        if (additive) {
          const newSelected = new Set(state.selectedClipIds);
          if (newSelected.has(clipId)) newSelected.delete(clipId);
          else newSelected.add(clipId);
          return { selectedClipIds: newSelected };
        }
        return { selectedClipIds: new Set([clipId]) };
      }),

      selectClips: (clipIds) => set({ selectedClipIds: new Set(clipIds) }),

      deselectAll: () => set({ selectedClipIds: new Set(), selectedTransitionId: null }),

      selectAll: () => set(state => ({
        selectedClipIds: new Set(state.clips.keys()),
      })),

      // ── Clipboard ──
      copySelected: () => {
        const state = get();
        const clips = Array.from(state.selectedClipIds)
          .map(id => state.clips.get(id))
          .filter((c): c is Clip => c !== undefined);
        set({ clipboardClips: clips });
      },

      cutSelected: () => {
        get().copySelected();
        get().deleteClips(Array.from(get().selectedClipIds));
      },

      paste: () => {
        const state = get();
        if (state.clipboardClips.length === 0) return;
        const minStart = Math.min(...state.clipboardClips.map(c => c.startMs));
        const offset = state.playheadMs - minStart;
        const newIds: string[] = [];
        for (const clip of state.clipboardClips) {
          const id = get().addClip({
            ...clip,
            startMs: clip.startMs + offset,
            name: `${clip.name} (copy)`,
          });
          newIds.push(id);
        }
        set({ selectedClipIds: new Set(newIds) });
      },

      // ── Playback ──
      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      togglePlayPause: () => set(state => ({ isPlaying: !state.isPlaying })),
      seekTo: (ms) => set({ playheadMs: Math.max(0, ms) }),

      // ── Viewport ──
      setZoom: (pxPerMs) => set({ zoomPxPerMs: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pxPerMs)) }),
      setScroll: (ms) => set({ scrollMs: Math.max(0, ms) }),
      zoomIn: () => set(state => ({ zoomPxPerMs: Math.min(MAX_ZOOM, state.zoomPxPerMs * 1.5) })),
      zoomOut: () => set(state => ({ zoomPxPerMs: Math.max(MIN_ZOOM, state.zoomPxPerMs / 1.5) })),
      fitToView: (viewportWidthPx) => {
        const duration = get().durationMs;
        if (duration <= 0) return;
        set({ zoomPxPerMs: viewportWidthPx / duration, scrollMs: 0 });
      },

      // ── Mode ──
      setEditMode: (mode) => set({ editMode: mode }),
      setToolMode: (mode) => set({ toolMode: mode }),

      // ── Transitions ──
      addTransition: (clipBeforeId, clipAfterId, type, durationMs = 500) => {
        const id = generateId();
        set(state => {
          const newTransitions = new Map(state.transitions);
          newTransitions.set(id, { id, type, durationMs, clipBeforeId, clipAfterId });
          return { transitions: newTransitions, isDirty: true };
        });
        return id;
      },

      removeTransition: (transitionId) => set(state => {
        const newTransitions = new Map(state.transitions);
        newTransitions.delete(transitionId);
        return { transitions: newTransitions, isDirty: true };
      }),

      // ── Markers ──
      addMarker: (timeMs, label = '') => {
        const id = generateId();
        set(state => {
          const newMarkers = new Map(state.markers);
          newMarkers.set(id, { id, timeMs, label, color: '#F59E0B' });
          return { markers: newMarkers, isDirty: true };
        });
        return id;
      },

      removeMarker: (markerId) => set(state => {
        const newMarkers = new Map(state.markers);
        newMarkers.delete(markerId);
        return { markers: newMarkers, isDirty: true };
      }),

      // ── Import ──
      loadFromTimelineEvents: (events) => {
        const state = get();
        const newClips = new Map<string, Clip>();
        const trackSet = new Map<number, Track>();

        for (const event of events) {
          // Ensure track exists
          if (!trackSet.has(event.trackIndex)) {
            const existing = state.tracks[event.trackIndex];
            if (existing) {
              trackSet.set(event.trackIndex, existing);
            } else {
              trackSet.set(event.trackIndex, {
                id: generateId(),
                type: event.trackType,
                name: `${event.trackType.charAt(0).toUpperCase()}${event.trackIndex + 1}`,
                muted: false, solo: false, locked: false,
                height: DEFAULT_TRACK_HEIGHT,
              });
            }
          }

          const track = trackSet.get(event.trackIndex)!;
          const clip: Clip = {
            id: event.clipId || generateId(),
            trackId: track.id,
            sourceAssetId: event.sourceAssetId,
            startMs: event.startMs,
            durationMs: event.endMs - event.startMs,
            sourceStartMs: event.startMs,
            sourceEndMs: event.endMs,
            type: event.trackType,
            name: `Clip ${newClips.size + 1}`,
            effects: [],
            speed: 1,
            opacity: 1,
          };
          newClips.set(clip.id, clip);
        }

        const tracks = Array.from(trackSet.entries())
          .sort(([a], [b]) => a - b)
          .map(([, t]) => t);

        set({ tracks: tracks.length > 0 ? tracks : state.tracks, clips: newClips, isDirty: true });
        get()._recalcDuration();
      },

      // ── Serialization ──
      serialize: () => {
        const state = get();
        return JSON.stringify({
          tracks: state.tracks,
          clips: Array.from(state.clips.values()),
          transitions: Array.from(state.transitions.values()),
          markers: Array.from(state.markers.values()),
        });
      },

      markClean: () => set({ isDirty: false }),

      // ── Internal ──
      _recalcDuration: () => set(state => {
        let maxMs = 0;
        for (const clip of state.clips.values()) {
          maxMs = Math.max(maxMs, clip.startMs + clip.durationMs);
        }
        return { durationMs: maxMs };
      }),
    }),
    {
      limit: 100,
      // Only track undoable state (not playback/viewport)
      partialize: (state) => ({
        tracks: state.tracks,
        clips: state.clips,
        transitions: state.transitions,
        markers: state.markers,
      }),
    }
  )
);
```

**Step 2: Verify typecheck**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend run typecheck
```

**Step 3: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/stores/timelineStore.ts && git commit -m "feat: add timeline store with undo/redo via zundo"
```

---

### Task 1.5: Implement UI Store, Capture Store, Signal Store

**Files:**
- Create: `claudeFrontend/src/core/stores/uiStore.ts`
- Create: `claudeFrontend/src/core/stores/captureStore.ts`
- Create: `claudeFrontend/src/core/stores/signalStore.ts`

**Step 1: Write UI store**

Create `claudeFrontend/src/core/stores/uiStore.ts`:

```typescript
import { createStore } from 'zustand/vanilla';
import type { PanelTab, PreviewModalState } from '../types';

export interface UIStoreState {
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  leftPanelTab: PanelTab;
  previewModal: PreviewModalState;
  activeProjectId: string | null;

  togglePanel: (side: 'left' | 'right') => void;
  setLeftPanelTab: (tab: PanelTab) => void;
  openPreviewModal: (mode: 'clip' | 'render', clipId?: string) => void;
  closePreviewModal: () => void;
  setActiveProject: (id: string | null) => void;
}

export const uiStore = createStore<UIStoreState>((set) => ({
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  leftPanelTab: 'assets',
  previewModal: { open: false, mode: 'clip' },
  activeProjectId: null,

  togglePanel: (side) => set(state => ({
    [side === 'left' ? 'leftPanelCollapsed' : 'rightPanelCollapsed']:
      side === 'left' ? !state.leftPanelCollapsed : !state.rightPanelCollapsed,
  })),

  setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),

  openPreviewModal: (mode, clipId) => set({
    previewModal: { open: true, mode, clipId },
  }),

  closePreviewModal: () => set({
    previewModal: { open: false, mode: 'clip' },
  }),

  setActiveProject: (id) => set({ activeProjectId: id }),
}));
```

**Step 2: Write capture store**

Create `claudeFrontend/src/core/stores/captureStore.ts`:

```typescript
import { createStore } from 'zustand/vanilla';
import type { CaptureState, CaptureSource, CursorPosition, TypingEvent } from '../types';

export interface CaptureStoreState {
  state: CaptureState;
  source: CaptureSource;
  durationMs: number;
  micEnabled: boolean;
  recordedBlob: Blob | null;
  cursorEvents: CursorPosition[];
  typingEvents: TypingEvent[];
  uploadProgress: number | null; // 0-100 or null

  setState: (state: CaptureState) => void;
  setSource: (source: CaptureSource) => void;
  setDurationMs: (ms: number) => void;
  setMicEnabled: (enabled: boolean) => void;
  setRecordedBlob: (blob: Blob | null) => void;
  addCursorEvent: (event: CursorPosition) => void;
  addTypingEvent: (event: TypingEvent) => void;
  setUploadProgress: (progress: number | null) => void;
  reset: () => void;
}

export const captureStore = createStore<CaptureStoreState>((set) => ({
  state: 'idle',
  source: 'screen',
  durationMs: 0,
  micEnabled: false,
  recordedBlob: null,
  cursorEvents: [],
  typingEvents: [],
  uploadProgress: null,

  setState: (state) => set({ state }),
  setSource: (source) => set({ source }),
  setDurationMs: (ms) => set({ durationMs: ms }),
  setMicEnabled: (enabled) => set({ micEnabled: enabled }),
  setRecordedBlob: (blob) => set({ recordedBlob: blob }),
  addCursorEvent: (event) => set(state => ({
    cursorEvents: [...state.cursorEvents, event],
  })),
  addTypingEvent: (event) => set(state => ({
    typingEvents: [...state.typingEvents, event],
  })),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
  reset: () => set({
    state: 'idle',
    durationMs: 0,
    recordedBlob: null,
    cursorEvents: [],
    typingEvents: [],
    uploadProgress: null,
  }),
}));
```

**Step 3: Write signal store**

Create `claudeFrontend/src/core/stores/signalStore.ts`:

```typescript
import { createStore } from 'zustand/vanilla';
import type { Signal } from '@flowstudio/shared';
import { SignalType } from '@flowstudio/shared';
import type {
  SpeechSegmentPayload,
  IntentNodePayload,
  NarrativeBeatPayload,
  EditDecisionPayload,
  TimelineEventPayload,
} from '@flowstudio/shared';
import { safeJsonParse } from '@flowstudio/shared';

export interface SignalStoreState {
  signals: Map<string, Signal[]>; // keyed by projectId

  syncSignals: (projectId: string, rows: Record<string, unknown>[]) => void;

  getSignalsByType: (projectId: string, type: SignalType) => Signal[];
  getSpeechSegments: (projectId: string) => Array<Signal & { parsed: SpeechSegmentPayload }>;
  getIntentGraph: (projectId: string) => Array<Signal & { parsed: IntentNodePayload }>;
  getNarrativeBeats: (projectId: string) => Array<Signal & { parsed: NarrativeBeatPayload }>;
  getEditDecisions: (projectId: string) => Array<Signal & { parsed: EditDecisionPayload }>;
  getTimelineEvents: (projectId: string) => Array<Signal & { parsed: TimelineEventPayload }>;
}

function parseSignals<T>(signals: Signal[], type: SignalType): Array<Signal & { parsed: T }> {
  return signals
    .filter(s => s.signalType === type)
    .map(s => ({ ...s, parsed: safeJsonParse<T>(s.payload, {} as T) }))
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export const signalStore = createStore<SignalStoreState>((set, get) => ({
  signals: new Map(),

  syncSignals: (projectId, rows) => set(state => {
    const newMap = new Map(state.signals);
    newMap.set(projectId, rows as unknown as Signal[]);
    return { signals: newMap };
  }),

  getSignalsByType: (projectId, type) => {
    const signals = get().signals.get(projectId) ?? [];
    return signals.filter(s => s.signalType === type);
  },

  getSpeechSegments: (projectId) =>
    parseSignals<SpeechSegmentPayload>(get().signals.get(projectId) ?? [], SignalType.SPEECH_SEGMENT),

  getIntentGraph: (projectId) =>
    parseSignals<IntentNodePayload>(get().signals.get(projectId) ?? [], SignalType.INTENT_NODE),

  getNarrativeBeats: (projectId) =>
    parseSignals<NarrativeBeatPayload>(get().signals.get(projectId) ?? [], SignalType.NARRATIVE_BEAT),

  getEditDecisions: (projectId) =>
    parseSignals<EditDecisionPayload>(get().signals.get(projectId) ?? [], SignalType.EDIT_DECISION),

  getTimelineEvents: (projectId) =>
    parseSignals<TimelineEventPayload>(get().signals.get(projectId) ?? [], SignalType.TIMELINE_EVENT),
}));
```

**Step 4: Verify typecheck**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend run typecheck
```

**Step 5: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/stores/ && git commit -m "feat: add ui, capture, and signal stores"
```

---

### Task 1.6: Implement Core Services (Notifications, Shortcuts, SignedUrls)

**Files:**
- Create: `claudeFrontend/src/core/services/notifications.ts`
- Create: `claudeFrontend/src/core/services/shortcuts.ts`
- Create: `claudeFrontend/src/core/services/signedUrls.ts`

**Step 1: Write notification service**

Create `claudeFrontend/src/core/services/notifications.ts`:

```typescript
import { generateId } from '@flowstudio/shared';
import type { Notification, NotificationType } from '../types';

type NotificationListener = (notifications: Notification[]) => void;

class NotificationService {
  private notifications: Notification[] = [];
  private listeners: Set<NotificationListener> = new Set();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  show(
    message: string,
    type: NotificationType = 'info',
    options?: { durationMs?: number; action?: { label: string; onClick: () => void } }
  ): string {
    const id = generateId();
    const notification: Notification = {
      id,
      message,
      type,
      durationMs: options?.durationMs ?? 5000,
      action: options?.action,
    };

    this.notifications = [...this.notifications.slice(-2), notification]; // max 3
    this.emit();

    if (notification.durationMs > 0) {
      const timer = setTimeout(() => this.dismiss(id), notification.durationMs);
      this.timers.set(id, timer);
    }

    return id;
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.emit();
  }

  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    listener(this.notifications);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.notifications);
    }
  }
}

export const notifications = new NotificationService();
```

**Step 2: Write keyboard shortcut service**

Create `claudeFrontend/src/core/services/shortcuts.ts`:

```typescript
type ShortcutHandler = () => void;

interface ShortcutBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: ShortcutHandler;
  scope?: string; // e.g., 'studio', 'record', 'global'
}

class ShortcutService {
  private bindings: Map<string, ShortcutBinding> = new Map();
  private activeScopes: Set<string> = new Set(['global']);
  private listening = false;

  register(id: string, binding: Omit<ShortcutBinding, 'handler'> & { handler: ShortcutHandler }): void {
    this.bindings.set(id, { scope: 'global', ...binding });
    if (!this.listening) this.startListening();
  }

  unregister(id: string): void {
    this.bindings.delete(id);
  }

  setScopes(scopes: string[]): void {
    this.activeScopes = new Set(['global', ...scopes]);
  }

  private startListening(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown);
    this.listening = true;
  }

  stopListening(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown);
    this.listening = false;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Skip when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    for (const binding of this.bindings.values()) {
      if (!this.activeScopes.has(binding.scope ?? 'global')) continue;

      const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase();
      const ctrlMatch = (binding.ctrl ?? false) === (e.ctrlKey || e.metaKey);
      const shiftMatch = (binding.shift ?? false) === e.shiftKey;
      const altMatch = (binding.alt ?? false) === e.altKey;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        binding.handler();
        return;
      }
    }
  };
}

export const shortcuts = new ShortcutService();
```

**Step 3: Write signed URL manager**

Create `claudeFrontend/src/core/services/signedUrls.ts`:

```typescript
interface CachedUrl {
  url: string;
  expiresAt: number;
}

class SignedUrlManager {
  private cache: Map<string, CachedUrl> = new Map();
  private uploadFnUrl: string;
  private refreshMarginMs = 5 * 60 * 1000; // refresh 5 min before expiry

  constructor() {
    this.uploadFnUrl = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_UPLOAD_FUNCTION_URL)
      ?? 'http://localhost:8081';

    // Refresh on tab refocus
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.refreshAll();
      });
    }
  }

  async getUrl(gcsPath: string): Promise<string> {
    const cached = this.cache.get(gcsPath);
    if (cached && cached.expiresAt - Date.now() > this.refreshMarginMs) {
      return cached.url;
    }

    const res = await fetch(`${this.uploadFnUrl}/generate-download-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gcsPath }),
    });

    if (!res.ok) throw new Error(`Failed to get signed URL for ${gcsPath}`);

    const { url, expiresAt } = await res.json() as { url: string; expiresAt: number };
    this.cache.set(gcsPath, { url, expiresAt });
    return url;
  }

  async refreshAll(): Promise<void> {
    const expiring = Array.from(this.cache.entries())
      .filter(([, cached]) => cached.expiresAt - Date.now() < this.refreshMarginMs);

    await Promise.allSettled(
      expiring.map(([path]) => this.getUrl(path))
    );
  }

  invalidate(gcsPath: string): void {
    this.cache.delete(gcsPath);
  }
}

export const signedUrls = new SignedUrlManager();
```

**Step 4: Verify typecheck**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend run typecheck
```

**Step 5: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/services/ && git commit -m "feat: add notification, shortcut, and signed URL services"
```

---

### Task 1.7: Create React Hook Adapters

**Files:**
- Create: `claudeFrontend/src/hooks/useProjectStore.ts`
- Create: `claudeFrontend/src/hooks/useTimelineStore.ts`
- Create: `claudeFrontend/src/hooks/useCaptureStore.ts`
- Create: `claudeFrontend/src/hooks/useUIStore.ts`
- Create: `claudeFrontend/src/hooks/useSignalStore.ts`
- Create: `claudeFrontend/src/hooks/index.ts`

**Step 1: Create hooks directory and adapter files**

```bash
mkdir -p /home/user/FlowStudio/claudeFrontend/src/hooks
```

Create `claudeFrontend/src/hooks/useProjectStore.ts`:

```typescript
import { useStore } from 'zustand';
import { projectStore } from '../core/stores/projectStore';

export const useProjectStore = () => useStore(projectStore);
export const useProjects = () => useStore(projectStore, s => s.getAllProjectsSorted());
export const useProjectLoading = () => useStore(projectStore, s => s.loading);
export const useProject = (id: string) => useStore(projectStore, s => s.getProject(id));
export const useProjectTasks = (id: string) => useStore(projectStore, s => s.getProjectTasks(id));
export const useProjectAssets = (id: string) => useStore(projectStore, s => s.getProjectAssets(id));
export const useProjectState = (id: string) => useStore(projectStore, s => s.getProjectState(id));
```

Create `claudeFrontend/src/hooks/useTimelineStore.ts`:

```typescript
import { useStore } from 'zustand';
import { timelineStore } from '../core/stores/timelineStore';
import { useStoreWithEqualityFn } from 'zustand/traditional';

export const useTimeline = () => useStore(timelineStore);
export const usePlayhead = () => useStore(timelineStore, s => s.playheadMs);
export const useIsPlaying = () => useStore(timelineStore, s => s.isPlaying);
export const useTracks = () => useStore(timelineStore, s => s.tracks);
export const useClips = () => useStore(timelineStore, s => s.clips);
export const useSelectedClipIds = () => useStore(timelineStore, s => s.selectedClipIds);
export const useZoom = () => useStore(timelineStore, s => s.zoomPxPerMs);
export const useEditMode = () => useStore(timelineStore, s => s.editMode);
export const useToolMode = () => useStore(timelineStore, s => s.toolMode);
export const useTimelineIsDirty = () => useStore(timelineStore, s => s.isDirty);

// Undo/redo
export const useUndo = () => {
  const temporal = timelineStore.temporal;
  return {
    undo: () => temporal.getState().undo(),
    redo: () => temporal.getState().redo(),
  };
};
```

Create `claudeFrontend/src/hooks/useCaptureStore.ts`:

```typescript
import { useStore } from 'zustand';
import { captureStore } from '../core/stores/captureStore';

export const useCaptureStore = () => useStore(captureStore);
export const useCaptureState = () => useStore(captureStore, s => s.state);
export const useCaptureDuration = () => useStore(captureStore, s => s.durationMs);
export const useUploadProgress = () => useStore(captureStore, s => s.uploadProgress);
```

Create `claudeFrontend/src/hooks/useUIStore.ts`:

```typescript
import { useStore } from 'zustand';
import { uiStore } from '../core/stores/uiStore';

export const useUIStore = () => useStore(uiStore);
export const usePreviewModal = () => useStore(uiStore, s => s.previewModal);
export const useLeftPanel = () => useStore(uiStore, s => ({
  collapsed: s.leftPanelCollapsed,
  tab: s.leftPanelTab,
}));
export const useRightPanel = () => useStore(uiStore, s => s.rightPanelCollapsed);
```

Create `claudeFrontend/src/hooks/useSignalStore.ts`:

```typescript
import { useStore } from 'zustand';
import { signalStore } from '../core/stores/signalStore';

export const useSignalStore = () => useStore(signalStore);
export const useSpeechSegments = (projectId: string) =>
  useStore(signalStore, s => s.getSpeechSegments(projectId));
export const useIntentGraph = (projectId: string) =>
  useStore(signalStore, s => s.getIntentGraph(projectId));
export const useNarrativeBeats = (projectId: string) =>
  useStore(signalStore, s => s.getNarrativeBeats(projectId));
export const useEditDecisions = (projectId: string) =>
  useStore(signalStore, s => s.getEditDecisions(projectId));
```

Create `claudeFrontend/src/hooks/index.ts`:

```typescript
export * from './useProjectStore';
export * from './useTimelineStore';
export * from './useCaptureStore';
export * from './useUIStore';
export * from './useSignalStore';
```

**Step 2: Verify typecheck**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend run typecheck
```

**Step 3: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/hooks/ && git commit -m "feat: add React hook adapters for vanilla Zustand stores"
```

---

### Task 1.8: Set Up SpacetimeDB → Store Sync

**Files:**
- Already exists: `claudeFrontend/src/core/services/stdbSdkSync.ts`

This service connects the `stdbConnection` module to the Zustand stores via HTTP SQL polling, replacing the per-component subscription hooks.

**Step 1: Write sync service**

Already implemented at `claudeFrontend/src/core/services/stdbSdkSync.ts`:

```typescript
import { queryTable } from '../../lib/stdbConnection';
import type { StoreApi } from 'zustand';
import type { ProjectStore } from '../stores/projectStore';
import type { SignalStoreType } from '../stores/signalStore';

interface SyncConfig {
  projectStore: StoreApi<ProjectStore>;
  signalStore: StoreApi<SignalStoreType>;
  pollInterval?: number;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let syncFn: (() => Promise<void>) | null = null;

export function startSdkSync(config: SyncConfig) {
  const { projectStore, signalStore, pollInterval = 3000 } = config;

  const sync = async () => {
    // Polls projects, folders, assets, tasks, signals via queryTable()
    // Maps rows to typed objects, pushes into Zustand stores
  };

  syncFn = sync;
  sync();                                // Initial sync
  pollTimer = setInterval(sync, pollInterval); // Periodic poll
}

/** Force an immediate sync (called after mutations for UI responsiveness) */
export async function forceSync() {
  if (syncFn) await syncFn();
}

export function stopSdkSync() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
```

**Step 2: Verify typecheck**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend run typecheck
```

**Step 3: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/services/stdbSdkSync.ts && git commit -m "feat: add SpacetimeDB → Zustand store sync service"
```

---

## Phase 2: Navigation, Dashboard, and shadcn Setup

### Task 2.1: Set Up shadcn/ui Utility and Base Components

**Files:**
- Create: `claudeFrontend/src/lib/utils.ts`
- Create: `claudeFrontend/src/components/ui/button.tsx`
- Create: `claudeFrontend/src/components/ui/dialog.tsx`
- Create: `claudeFrontend/src/components/ui/card.tsx`
- Create: `claudeFrontend/src/components/ui/badge.tsx`
- Create: `claudeFrontend/src/components/ui/dropdown-menu.tsx`
- Create: `claudeFrontend/src/components/ui/context-menu.tsx`
- Create: `claudeFrontend/src/components/ui/tabs.tsx`
- Create: `claudeFrontend/src/components/ui/slider.tsx`
- Create: `claudeFrontend/src/components/ui/tooltip.tsx`
- Create: `claudeFrontend/src/components/ui/toaster.tsx`
- Create: `claudeFrontend/src/components/ui/resizable.tsx`

**Step 1:** Create the `cn` utility:

Create `claudeFrontend/src/lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 2:** Create each shadcn component following the standard shadcn/ui patterns (Radix primitives + CVA + cn). These are standard shadcn components — use the latest shadcn source for each:

- `button.tsx` — standard shadcn Button with variant/size CVA
- `dialog.tsx` — wraps @radix-ui/react-dialog
- `card.tsx` — Card, CardHeader, CardContent, CardTitle, CardDescription
- `badge.tsx` — Badge with variant CVA (default, secondary, destructive, outline)
- `dropdown-menu.tsx` — wraps @radix-ui/react-dropdown-menu
- `context-menu.tsx` — wraps @radix-ui/react-context-menu
- `tabs.tsx` — wraps @radix-ui/react-tabs
- `slider.tsx` — wraps @radix-ui/react-slider
- `tooltip.tsx` — wraps @radix-ui/react-tooltip
- `toaster.tsx` — wraps sonner's Toaster component with theme integration
- `resizable.tsx` — wraps react-resizable-panels (ResizablePanelGroup, ResizablePanel, ResizableHandle)

**IMPORTANT:** Use shadcn's dark theme CSS variables from globals.css. The existing `--color-*` variables map to shadcn's expected `--background`, `--foreground`, etc. Add the shadcn variable mappings to `globals.css`.

**Step 3: Verify typecheck and commit**

```bash
cd /home/user/FlowStudio && pnpm --filter @flowstudio/frontend run typecheck
git add claudeFrontend/src/components/ui/ claudeFrontend/src/lib/utils.ts claudeFrontend/src/app/globals.css
git commit -m "feat: add shadcn/ui base components and utilities"
```

---

### Task 2.2: Update Header with Navigation

**Files:**
- Modify: `claudeFrontend/src/components/Header.tsx`

**Step 1:** Rewrite Header with navigation links:

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRANDING } from '@flowstudio/shared';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/record', label: 'Record' },
  { href: '/projects', label: 'Projects' },
] as const;

interface HeaderProps {
  projectName?: string; // shown as breadcrumb in studio
}

export function Header({ projectName }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--color-surface)] bg-[var(--color-surface)] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-xl font-bold text-[var(--color-primary)]">
          {BRANDING.name}
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                pathname === item.href
                  ? 'bg-[var(--color-primary)] text-[var(--color-text)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {projectName && (
          <span className="text-sm text-[var(--color-muted)]">
            / {projectName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-success)]" />
        <span className="text-xs text-[var(--color-muted)]">Connected</span>
      </div>
    </header>
  );
}
```

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/components/Header.tsx && git commit -m "feat: add navigation links to header"
```

---

### Task 2.3: Create Route Pages (Record, Projects)

**Files:**
- Create: `claudeFrontend/src/app/record/page.tsx` (placeholder)
- Create: `claudeFrontend/src/app/projects/page.tsx` (placeholder)

**Step 1:** Create placeholder pages:

Create `claudeFrontend/src/app/record/page.tsx`:

```typescript
'use client';

import { Header } from '../../components/Header';

export default function RecordPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-[var(--color-muted)]">Recording studio — coming soon</p>
      </main>
    </div>
  );
}
```

Create `claudeFrontend/src/app/projects/page.tsx`:

```typescript
'use client';

import { Header } from '../../components/Header';

export default function ProjectsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-[var(--color-muted)]">Projects gallery — coming soon</p>
      </main>
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/app/record/ claudeFrontend/src/app/projects/ && git commit -m "feat: add placeholder route pages for record and projects"
```

---

### Task 2.4: Upgrade Dashboard Page

**Files:**
- Modify: `claudeFrontend/src/app/page.tsx`
- Modify: `claudeFrontend/src/components/ProjectCard.tsx`

**Step 1:** Update Dashboard to use new stores, add processing banner and quick actions. Replace the existing `useProjects` hook import with the new store-based hook. Add empty states with illustrations. Add "Processing Now" section.

Key changes to `page.tsx`:
- Import from `../hooks` instead of `../lib/hooks`
- Use `useProjects()` from new hooks (returns sorted Project[])
- Use `useProjectLoading()` for loading state
- Add "New Recording" button linking to `/record`
- Add `ProcessingBanner` section that filters projects with status `processing`
- Add skeleton loading cards

**Step 2:** Update `ProjectCard` to show progress bar from `project_state`:
- Accept optional `progress` prop (0-100)
- Show progress bar under status badge for processing projects
- Add thumbnail placeholder area

**Step 3: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/app/page.tsx claudeFrontend/src/components/ProjectCard.tsx && git commit -m "feat: upgrade dashboard with processing banner and quick actions"
```

---

### Task 2.5: Wire Up Store Sync in Root Layout

**Files:**
- Modify: `claudeFrontend/src/app/layout.tsx`
- Create: `claudeFrontend/src/components/StoreProvider.tsx`

**Step 1:** Create a client component that starts the SpacetimeDB sync on mount:

Create `claudeFrontend/src/components/StoreProvider.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { startSync, stopSync } from '../core/services/stdbSync';
import { Toaster } from 'sonner';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    startSync();
    return () => stopSync();
  }, []);

  return (
    <>
      {children}
      <Toaster theme="dark" position="bottom-right" richColors />
    </>
  );
}
```

**Step 2:** Wrap children in layout.tsx with `StoreProvider`:

```typescript
import type { Metadata } from "next";
import { BRANDING } from "@flowstudio/shared";
import { StoreProvider } from "../components/StoreProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: BRANDING.name,
  description: BRANDING.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
```

**Step 3: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/components/StoreProvider.tsx claudeFrontend/src/app/layout.tsx && git commit -m "feat: wire SpacetimeDB sync to root layout via StoreProvider"
```

---

## Phase 3: Recording Page

### Task 3.1: Implement CaptureEngine

**Files:**
- Create: `claudeFrontend/src/core/services/capture.ts`

**Step 1:** Write the framework-agnostic capture engine:

```typescript
import { captureStore } from '../stores/captureStore';
import type { CaptureSource, CursorPosition, TypingEvent } from '../types';

export class CaptureEngine {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private cursorTracker: ((e: MouseEvent) => void) | null = null;
  private typingTracker: ((e: KeyboardEvent) => void) | null = null;
  private lastCursorTime = 0;
  private readonly CURSOR_SAMPLE_INTERVAL_MS = 33; // ~30Hz

  async startCapture(source: CaptureSource): Promise<MediaStream> {
    const displayMediaOptions: DisplayMediaStreamOptions = {
      video: { displaySurface: source === 'tab' ? 'browser' : source === 'window' ? 'window' : 'monitor' },
      audio: true,
    };

    this.stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

    // Merge mic if enabled
    const store = captureStore.getState();
    if (store.micEnabled) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.stream = this.mergeAudioStreams(this.stream, this.micStream);
      } catch {
        // Mic unavailable — continue without
      }
    }

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'video/webm;codecs=vp9,opus' });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      captureStore.getState().setRecordedBlob(blob);
      captureStore.getState().setState('stopped');
      this.stopTimers();
    };

    // Handle user stopping via browser UI
    this.stream.getVideoTracks()[0].onended = () => {
      if (this.mediaRecorder?.state === 'recording') {
        this.stopCapture();
      }
    };

    this.mediaRecorder.start(1000); // 1s chunks
    this.startTime = Date.now();
    captureStore.getState().setState('recording');

    // Duration timer
    this.durationTimer = setInterval(() => {
      captureStore.getState().setDurationMs(Date.now() - this.startTime);
    }, 100);

    this.startCursorTracking();
    this.startTypingDetection();

    return this.stream;
  }

  stopCapture(): Blob | null {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.stream?.getTracks().forEach(t => t.stop());
    this.micStream?.getTracks().forEach(t => t.stop());
    this.stopCursorTracking();
    this.stopTypingDetection();
    this.stopTimers();

    const blob = this.chunks.length > 0
      ? new Blob(this.chunks, { type: 'video/webm' })
      : null;
    return blob;
  }

  pauseCapture(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.pause();
      captureStore.getState().setState('paused');
    }
  }

  resumeCapture(): void {
    if (this.mediaRecorder?.state === 'paused') {
      this.mediaRecorder.resume();
      captureStore.getState().setState('recording');
    }
  }

  async toggleMic(enabled: boolean): Promise<void> {
    captureStore.getState().setMicEnabled(enabled);
    // Mic toggle during recording would require stream re-merge — skip for v1
  }

  private startCursorTracking(): void {
    this.cursorTracker = (e: MouseEvent) => {
      const now = Date.now();
      if (now - this.lastCursorTime < this.CURSOR_SAMPLE_INTERVAL_MS) return;
      this.lastCursorTime = now;
      captureStore.getState().addCursorEvent({
        x: e.clientX,
        y: e.clientY,
        timestampMs: now - this.startTime,
      });
    };
    window.addEventListener('mousemove', this.cursorTracker);
  }

  private stopCursorTracking(): void {
    if (this.cursorTracker) {
      window.removeEventListener('mousemove', this.cursorTracker);
      this.cursorTracker = null;
    }
  }

  private startTypingDetection(): void {
    let buffer = '';
    let lastKeyTime = 0;
    let keyCount = 0;

    this.typingTracker = (e: KeyboardEvent) => {
      const now = Date.now();
      if (e.key.length === 1) {
        buffer += e.key;
        keyCount++;
      }

      // Flush buffer every 2 seconds of inactivity
      if (now - lastKeyTime > 2000 && buffer.length > 0) {
        const elapsed = (now - lastKeyTime) / 1000;
        captureStore.getState().addTypingEvent({
          text: buffer,
          timestampMs: now - this.startTime,
          charactersPerSecond: keyCount / Math.max(elapsed, 0.1),
          isPaste: e.ctrlKey && e.key === 'v',
        });
        buffer = '';
        keyCount = 0;
      }
      lastKeyTime = now;
    };
    window.addEventListener('keydown', this.typingTracker);
  }

  private stopTypingDetection(): void {
    if (this.typingTracker) {
      window.removeEventListener('keydown', this.typingTracker);
      this.typingTracker = null;
    }
  }

  private mergeAudioStreams(display: MediaStream, mic: MediaStream): MediaStream {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const displaySource = ctx.createMediaStreamSource(display);
    const micSource = ctx.createMediaStreamSource(mic);
    displaySource.connect(dest);
    micSource.connect(dest);

    const merged = new MediaStream([
      ...display.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    return merged;
  }

  private stopTimers(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }
}

export const captureEngine = new CaptureEngine();
```

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/services/capture.ts && git commit -m "feat: add CaptureEngine for browser screen recording"
```

---

### Task 3.2: Build Recording Page UI

**Files:**
- Modify: `claudeFrontend/src/app/record/page.tsx`

**Step 1:** Build the full recording page with live preview, controls, source selector, and post-recording flow.

Key elements:
- `<video>` element for live preview (`srcObject = stream`)
- Control bar: Start/Stop (red circle/square), Mic toggle, Pause/Resume, Duration timer
- Source selector: Screen / Tab / Window radio buttons
- Post-recording state: preview playback of recorded blob, "Confirm & Process" button
- On confirm: create project → upload blob to GCS → create tasks → navigate to `/project/[id]`

Use `captureEngine` from core services and `captureStore` hooks for state.

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/app/record/ && git commit -m "feat: build recording page with screen capture and upload flow"
```

---

## Phase 4: Studio Page Foundation

### Task 4.1: Studio Page Layout (Resizable Panels)

**Files:**
- Modify: `claudeFrontend/src/app/project/[id]/page.tsx`

**Step 1:** Replace the current project detail page with the resizable panel studio layout:

```
ResizablePanelGroup (horizontal)
├── ResizablePanel (left, default 15%, min 10%, collapsible)
│   └── AssetSignalPanel
├── ResizableHandle
├── ResizablePanel (center, default 60%)
│   ├── VideoPreview (top, flex-1)
│   └── TimelineContainer (bottom, default 40% of center height)
├── ResizableHandle
└── ResizablePanel (right, default 25%, min 15%, collapsible)
    └── PropertiesPanel
```

Use `react-resizable-panels` (already installed as dep). Wire up `uiStore` for panel collapse states.

Start `startSignalSync(projectId)` on mount. Register studio keyboard shortcuts on mount, unregister on unmount.

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/app/project/ && git commit -m "feat: studio page with resizable panel layout"
```

---

### Task 4.2: Asset Browser Panel

**Files:**
- Create: `claudeFrontend/src/components/studio/AssetPanel.tsx`

**Step 1:** Two-tab panel (Assets / Signals). Assets tab lists project assets from store with icons by type. Items are `draggable` for drag-to-timeline (set `dataTransfer` with asset ID + type). Signals tab lists signal types with counts, expandable groups showing individual signals with timestamps. Click signal → `timelineStore.seekTo(signal.timestampMs)`.

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/components/studio/ && git commit -m "feat: add asset browser and signal inspector panel"
```

---

### Task 4.3: Video Preview Component

**Files:**
- Create: `claudeFrontend/src/components/studio/VideoPreview.tsx`

**Step 1:** `<video>` element with playback controls (play/pause, time display, scrubber). Source from project's `source_video` or `rendered_video` asset via `signedUrls.getUrl()`. Audio level meter (vertical bar, right side) using `AudioContext.createAnalyser()`. Wire to `timelineStore` playhead via `PlaybackSync`.

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/components/studio/VideoPreview.tsx && git commit -m "feat: add video preview component with playback controls"
```

---

### Task 4.4: Properties Panel

**Files:**
- Create: `claudeFrontend/src/components/studio/PropertiesPanel.tsx`

**Step 1:** Shows properties for selected clip from `timelineStore.selectedClipIds`. Context-sensitive sections based on clip type:
- Video: speed slider, opacity slider, zoom, panX/Y
- Audio: volume slider, fade in/out
- Text: content textarea, font select, size, color, position
- Empty state: "Select a clip to view properties"

All property changes dispatch to `timelineStore.setClipProperty()`.

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/components/studio/PropertiesPanel.tsx && git commit -m "feat: add properties panel for clip editing"
```

---

### Task 4.5: Preview Modal

**Files:**
- Create: `claudeFrontend/src/components/studio/PreviewModal.tsx`

**Step 1:** Full-screen overlay with `backdrop-filter: blur(12px)`. `<video>` player for either a single clip (in-point to out-point) or full rendered output. Play/pause, fullscreen, download button. Close on Esc or click outside. Source determined by `uiStore.previewModal` state.

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/components/studio/PreviewModal.tsx && git commit -m "feat: add preview modal with blur backdrop"
```

---

## Phase 5: Timeline Core

### Task 5.1: Timeline Renderer (Canvas)

**Files:**
- Create: `claudeFrontend/src/core/timeline/renderer.ts`
- Create: `claudeFrontend/src/core/timeline/types.ts` (if not already from Task 1.2)
- Create: `claudeFrontend/src/core/timeline/colors.ts`

**Step 1:** Write `TimelineRenderer` class. Framework-agnostic, takes a `HTMLCanvasElement` and reads from `timelineStore`.

Key methods:
- `render()` — full repaint: clear canvas, draw tracks, clips, transitions, playhead, markers, selection highlights, snap lines, drop preview
- `renderClip(clip)` — draw single clip (colored rect, name label, trim handles if selected)
- `renderWaveform(track)` — draw audio waveform from cached peaks
- `renderPlayhead(ms)` — vertical red line at playhead position
- `onMouseDown/Move/Up(e)` — canvas hit testing, returns `HitTarget`. Handles drag-to-move, trim, marquee select, playhead scrub
- `setZoom/setScroll` — viewport controls
- `showDropPreview(track, timeMs)` — draw insertion line during drag-and-drop

Color constants in `colors.ts`:
```typescript
export const TRACK_COLORS: Record<string, string> = {
  video: '#6366F1',   // indigo
  audio: '#22C55E',   // green
  text: '#F59E0B',    // amber
  overlay: '#EC4899', // pink
};
```

Handle `devicePixelRatio` for retina displays.

**Step 2:** Write `TimelineRenderer` constructor to:
1. Get canvas context
2. Set up DPI scaling
3. Subscribe to `timelineStore` for reactive repaints
4. Start `requestAnimationFrame` loop (only repaints when dirty flag is set)

**Step 3: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/timeline/ && git commit -m "feat: add Canvas timeline renderer with hit testing"
```

---

### Task 5.2: Timeline React Wrapper

**Files:**
- Create: `claudeFrontend/src/components/studio/Timeline.tsx`
- Create: `claudeFrontend/src/components/studio/TimelineToolbar.tsx`
- Create: `claudeFrontend/src/components/studio/TrackHeader.tsx`

**Step 1:** `Timeline.tsx` — the hybrid component:
- Renders Canvas element for clip grid (ref → `TimelineRenderer`)
- Renders HTML track headers alongside canvas (positioned absolutely, synced with canvas scroll)
- Time ruler above canvas (HTML div with tick marks based on zoom level)
- Horizontal scrollbar below canvas
- Zoom slider in corner
- Drag-and-drop: `onDragOver`/`onDrop` handlers that delegate to `TimelineRenderer.showDropPreview()` and `timelineStore.addClip()`

**Step 2:** `TimelineToolbar.tsx` — above the timeline:
- Tool buttons: Select (V), Cut (C), Text
- Edit mode toggle: Overwrite / Ripple
- Action buttons: Split, Delete, Undo, Redo
- Preview button (opens render preview modal)
- Zoom controls: +, -, Fit

**Step 3:** `TrackHeader.tsx` — per-track header:
- Track name (editable on double-click)
- Mute/Solo/Lock toggle buttons
- Track type icon

**Step 4: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/components/studio/Timeline.tsx claudeFrontend/src/components/studio/TimelineToolbar.tsx claudeFrontend/src/components/studio/TrackHeader.tsx && git commit -m "feat: add timeline React wrapper with toolbar and track headers"
```

---

### Task 5.3: PlaybackSync Engine

**Files:**
- Create: `claudeFrontend/src/core/services/playbackSync.ts`

**Step 1:** Write `PlaybackSync` class:

```typescript
import { timelineStore } from '../stores/timelineStore';

export class PlaybackSync {
  private video: HTMLVideoElement;
  private rafId: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;

    // Subscribe to store changes for seek
    this.unsubscribe = timelineStore.subscribe((state, prev) => {
      // External seek (user dragged playhead)
      if (!state.isPlaying && state.playheadMs !== prev.playheadMs) {
        this.video.currentTime = state.playheadMs / 1000;
      }
      // Play/pause
      if (state.isPlaying && !prev.isPlaying) this.startLoop();
      if (!state.isPlaying && prev.isPlaying) this.stopLoop();
    });
  }

  private startLoop(): void {
    this.video.play().catch(() => {});
    const loop = () => {
      const ms = this.video.currentTime * 1000;
      timelineStore.getState().seekTo(ms);
      if (timelineStore.getState().isPlaying) {
        this.rafId = requestAnimationFrame(loop);
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    this.video.pause();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy(): void {
    this.stopLoop();
    this.unsubscribe?.();
  }
}
```

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/core/services/playbackSync.ts && git commit -m "feat: add playback sync engine (video ↔ timeline)"
```

---

### Task 5.4: Wire Keyboard Shortcuts for Studio

**Files:**
- Create: `claudeFrontend/src/components/studio/useStudioShortcuts.ts`

**Step 1:** Hook that registers all studio shortcuts on mount, unregisters on unmount:

```typescript
import { useEffect } from 'react';
import { shortcuts } from '../../core/services/shortcuts';
import { timelineStore } from '../../core/stores/timelineStore';
import { uiStore } from '../../core/stores/uiStore';

export function useStudioShortcuts() {
  useEffect(() => {
    const store = timelineStore.getState();
    shortcuts.setScopes(['studio']);

    shortcuts.register('play-pause', { key: ' ', handler: () => store.togglePlayPause(), scope: 'studio' });
    shortcuts.register('split', { key: 'c', handler: () => {
      const { selectedClipIds, playheadMs } = timelineStore.getState();
      for (const id of selectedClipIds) timelineStore.getState().splitClip(id, playheadMs);
    }, scope: 'studio' });
    shortcuts.register('delete', { key: 'Delete', handler: () => {
      const ids = Array.from(timelineStore.getState().selectedClipIds);
      if (ids.length) timelineStore.getState().deleteClips(ids);
    }, scope: 'studio' });
    shortcuts.register('undo', { key: 'z', ctrl: true, handler: () => timelineStore.temporal.getState().undo(), scope: 'studio' });
    shortcuts.register('redo', { key: 'z', ctrl: true, shift: true, handler: () => timelineStore.temporal.getState().redo(), scope: 'studio' });
    shortcuts.register('select-all', { key: 'a', ctrl: true, handler: () => timelineStore.getState().selectAll(), scope: 'studio' });
    shortcuts.register('deselect', { key: 'd', ctrl: true, handler: () => timelineStore.getState().deselectAll(), scope: 'studio' });
    shortcuts.register('copy', { key: 'c', ctrl: true, handler: () => timelineStore.getState().copySelected(), scope: 'studio' });
    shortcuts.register('cut', { key: 'x', ctrl: true, handler: () => timelineStore.getState().cutSelected(), scope: 'studio' });
    shortcuts.register('paste', { key: 'v', ctrl: true, handler: () => timelineStore.getState().paste(), scope: 'studio' });
    shortcuts.register('zoom-in', { key: '=', ctrl: true, handler: () => timelineStore.getState().zoomIn(), scope: 'studio' });
    shortcuts.register('zoom-out', { key: '-', ctrl: true, handler: () => timelineStore.getState().zoomOut(), scope: 'studio' });
    shortcuts.register('preview', { key: 'Enter', ctrl: true, handler: () => uiStore.getState().openPreviewModal('render'), scope: 'studio' });
    shortcuts.register('close-modal', { key: 'Escape', handler: () => {
      if (uiStore.getState().previewModal.open) uiStore.getState().closePreviewModal();
      else timelineStore.getState().deselectAll();
    }, scope: 'studio' });

    // Arrow keys for playhead nudge
    shortcuts.register('nudge-left', { key: 'ArrowLeft', handler: () => {
      timelineStore.getState().seekTo(timelineStore.getState().playheadMs - 33);
    }, scope: 'studio' });
    shortcuts.register('nudge-right', { key: 'ArrowRight', handler: () => {
      timelineStore.getState().seekTo(timelineStore.getState().playheadMs + 33);
    }, scope: 'studio' });
    shortcuts.register('nudge-left-10', { key: 'ArrowLeft', shift: true, handler: () => {
      timelineStore.getState().seekTo(timelineStore.getState().playheadMs - 330);
    }, scope: 'studio' });
    shortcuts.register('nudge-right-10', { key: 'ArrowRight', shift: true, handler: () => {
      timelineStore.getState().seekTo(timelineStore.getState().playheadMs + 330);
    }, scope: 'studio' });
    shortcuts.register('home', { key: 'Home', handler: () => timelineStore.getState().seekTo(0), scope: 'studio' });
    shortcuts.register('end', { key: 'End', handler: () => {
      timelineStore.getState().seekTo(timelineStore.getState().durationMs);
    }, scope: 'studio' });

    return () => {
      shortcuts.setScopes([]);
      // Unregister all studio shortcuts
      const ids = ['play-pause', 'split', 'delete', 'undo', 'redo', 'select-all', 'deselect',
        'copy', 'cut', 'paste', 'zoom-in', 'zoom-out', 'preview', 'close-modal',
        'nudge-left', 'nudge-right', 'nudge-left-10', 'nudge-right-10', 'home', 'end'];
      for (const id of ids) shortcuts.unregister(id);
    };
  }, []);
}
```

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/components/studio/useStudioShortcuts.ts && git commit -m "feat: add studio keyboard shortcuts"
```

---

## Phase 6: Projects Gallery

### Task 6.1: Build Projects Gallery Page

**Files:**
- Modify: `claudeFrontend/src/app/projects/page.tsx`

**Step 1:** Full implementation with:
- Grid/list toggle (state in component)
- Filter dropdown by status (All / Ready / Processing / Failed)
- Sort dropdown (Newest / Oldest / Name)
- Client-side search input filtering on project name
- Project cards with context menu (shadcn ContextMenu): Open, Download, Retry, Delete, Rename
- Download: `signedUrls.getUrl()` → `<a download>` click
- Retry: `callReducer('createTask', ...)` for failed tasks → `callReducer('updateProjectState', ...)`
- Delete: confirmation dialog → `callReducer('deleteProject', ...)` (once backend reducer exists, show toast "not yet implemented" until then)

**Step 2: Commit**

```bash
cd /home/user/FlowStudio && git add claudeFrontend/src/app/projects/ && git commit -m "feat: build projects gallery with filters and context menus"
```

---

## Phase 7: Web Workers and Advanced Timeline Features

### Task 7.1: Waveform Worker

**Files:**
- Create: `claudeFrontend/src/core/workers/waveformWorker.ts`

Receives `ArrayBuffer` of audio, decodes via `OfflineAudioContext`, returns `Float32Array` of peaks.

### Task 7.2: Thumbnail Worker

**Files:**
- Create: `claudeFrontend/src/core/workers/thumbnailWorker.ts`

Receives video URL + timestamps, draws frames to `OffscreenCanvas`, returns `ImageBitmap[]`.

### Task 7.3: Timeline Minimap

**Files:**
- Create: `claudeFrontend/src/components/studio/TimelineMinimap.tsx`

30px Canvas strip showing compressed view of all clips + draggable viewport rectangle.

### Task 7.4: Context Menus for Timeline

**Files:**
- Create: `claudeFrontend/src/components/studio/TimelineContextMenu.tsx`

Right-click on clip, empty area, or track header → shadcn ContextMenu with appropriate options.

### Task 7.5: Track Management UI

- Add track button (+) below last track header → dropdown for track type
- Drag-to-reorder track headers
- Delete track via context menu

---

## Phase 8: Auto-save, Re-render, and Polish

### Task 8.1: Auto-save Service

**Files:**
- Create: `claudeFrontend/src/core/services/autoSave.ts`

Debounced (500ms) save on every `timelineStore` mutation where `isDirty` is true. Serializes timeline → uploads to GCS → `createAsset` → `markClean()`. `beforeunload` warning if dirty.

### Task 8.2: Re-render Flow

When user clicks "Render" in toolbar:
1. Serialize timeline via `timelineStore.serialize()`
2. Upload JSON to GCS as `timeline/user_edit.json`
3. `callReducer('createAsset', ...)` for timeline asset
4. `callReducer('createTask', { taskType: 'RENDER', ... })` with timeline asset as input
5. Toast: "Rendering started..."
6. On task completion (detected via store sync): toast with "Preview" action

### Task 8.3: Pipeline Progress Overlay

**Files:**
- Create: `claudeFrontend/src/components/studio/PipelineOverlay.tsx`

Shows when project is still processing. Displays the 13-task DAG with checkmarks, animated progress. Overlays the video preview area. Disappears when project reaches `ready`.

### Task 8.4: Error Handling Integration

- Browser support check on `/record` mount
- SpacetimeDB disconnection → yellow badge in header, reconnect toast
- GCS upload retry (3x exponential backoff)
- Unsupported video format → error in preview

### Task 8.5: Snapping System

Add snapping logic to `TimelineRenderer` mouse handlers:
- Snap to playhead, clip edges, markers
- 8px threshold
- Visual snap line
- Alt key to disable

### Task 8.6: Signal ↔ Clip Linking

- Click signal → seek + highlight corresponding clip
- Select clip → highlight source signals in signal panel
- Dotted connector lines on hover

---

## Phase 9: Backend Additions (SpacetimeDB Module)

### Task 9.1: Add Missing Reducers

**Files:**
- Modify: SpacetimeDB module (Rust WASM)

Add reducers:
- `deleteProject(projectId)` — cascade delete all related rows
- `renameProject(projectId, newName)` — update project name
- `duplicateProject(projectId)` — clone project + assets + timeline
- `updateAsset(assetId, metadata)` — update asset metadata

Add fields to `project_state`:
- `lockedBy: String` — tab ID holding edit lock
- `lockHeartbeat: u64` — last heartbeat timestamp

### Task 9.2: Deploy Updated Module

```bash
spacetime publish flowstudio --project-path=/path/to/stdb-module
```

---

## Execution Notes

- **Total phases:** 9
- **Estimated tasks:** ~30 discrete tasks
- **Critical path:** Phase 1 (foundation) → Phase 4 (studio layout) → Phase 5 (timeline core) — everything else can parallelize after Phase 1
- **Parallelizable after Phase 1:** Phase 2 (dashboard), Phase 3 (recording), Phase 6 (projects) are independent
- **Phase 7-8 depend on Phase 5** (timeline must exist for workers, auto-save, minimap)
- **Phase 9** (backend) can be done anytime but blocks delete/rename/duplicate features

### Testing Strategy

Each component and service should be manually tested in the browser since this is a UI-heavy project:
- Stores: test via browser console (`timelineStore.getState()`)
- Canvas: visual verification
- Recording: test with screen share permission
- Keyboard shortcuts: manual verification
- Build: `pnpm --filter @flowstudio/frontend run build` after each phase
