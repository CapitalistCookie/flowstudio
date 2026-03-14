# FlowStudio Frontend NLE Design

**Date:** 2026-03-14 09:06 UTC
**Status:** Approved

## Overview

Complete frontend redesign for FlowStudio: 4 views (Dashboard, Recording, Studio/NLE, Projects), full non-linear editor with hybrid HTML+Canvas timeline, browser-based screen capture, and framework-agnostic core layer for future UI swapability.

**Key decisions:**
- UI framework: shadcn/ui + Tailwind
- State management: Zustand (vanilla mode) with temporal middleware for undo/redo
- Timeline rendering: Hybrid HTML (track headers, toolbar, UI) + Canvas (clip grid, waveforms, playhead)
- Recording: Browser `getDisplayMedia` + `MediaRecorder`
- Architecture: Strict UI/core separation — React layer is swappable

---

## 1. Architecture: UI / Core Separation

```
┌─────────────────────────────────────┐
│  UI Layer (React + shadcn)          │  ← swappable
│  Components, pages, styling         │
├─────────────────────────────────────┤
│  Hooks / Adapters                   │  ← thin glue (React-specific)
│  useProjectStore(), useTimeline()   │
├─────────────────────────────────────┤
│  Core Layer (framework-agnostic)    │  ← stays
│  Zustand stores (vanilla mode)      │
│  SpacetimeDB client (stdb.ts)       │
│  Canvas timeline renderer           │
│  MediaRecorder capture engine       │
│  GCS upload service                 │
│  Types / contracts                  │
└─────────────────────────────────────┘
```

File structure:
```
finalFrontend/src/
├── app/              ← React pages (swappable)
├── components/       ← React components (swappable)
├── hooks/            ← React adapters (swappable)
├── core/             ← framework-agnostic (stays)
│   ├── stores/       ← Zustand vanilla stores
│   ├── services/     ← stdb, gcs, capture engine, shortcuts, notifications
│   ├── timeline/     ← Canvas renderer
│   ├── workers/      ← Web Workers (waveform, thumbnails)
│   └── types.ts      ← local UI types
```

To swap React: replace `app/`, `components/`, and `hooks/`. Core layer untouched.

---

## 2. Route Structure

```
/                    → Dashboard
/record              → Recording Studio
/project/[id]        → NLE Studio (editor + preview modals)
/projects            → Projects Gallery
```

```
app/
├── layout.tsx              → Root layout (dark theme)
├── page.tsx                → Dashboard
├── record/
│   └── page.tsx            → RecordingStudio
├── project/
│   └── [id]/
│       └── page.tsx        → NLEStudio
└── projects/
    └── page.tsx            → ProjectsGallery
```

Navigation: top bar with Dashboard, Record, Projects links + project name breadcrumb in studio.

Lazy loading: `/record` lazy-loads MediaRecorder APIs, `/project/[id]` lazy-loads Canvas renderer + waveform decoder.

---

## 3. Dashboard (`/`)

Project cards grid with thumbnails, status badges, progress bars from `project_state`. Quick actions: "New Project" and "New Recording". Live "Processing Now" section showing active pipelines with task progress. Data via SpacetimeDB subscription on `projects` + `project_state` tables.

Components: extended `ProjectCard`, existing `CreateProjectDialog`, new `ProcessingBanner`, `QuickActions`.

---

## 4. Recording (`/record`)

Browser-based screen capture with cursor/typing tracking.

**Layout:** Live preview (screen capture feed), control bar (start/stop, mic toggle, pause/resume, timer), source selector (screen/tab/window).

**Capture engine** (`core/services/capture.ts`):
```typescript
class CaptureEngine {
  startCapture(source: 'screen' | 'tab' | 'window'): Promise<MediaStream>
  stopCapture(): Blob
  startCursorTracking(): void
  getCursorEvents(): CursorPosition[]
  startTypingDetection(): void
  getTypingEvents(): TypingEvent[]
  toggleMic(enabled: boolean): void
  state: 'idle' | 'recording' | 'paused' | 'stopped'
  durationMs: number
}
```

**Post-recording flow:**
1. Stop → get Blob → show quick preview
2. User confirms → auto-create project via `createProject`
3. Upload video to GCS (resumable upload with progress)
4. Register asset + create 4 initial tasks + set status to `processing`
5. Navigate to `/project/[id]`

**Cursor tracking:** `mousemove` listener at ~30Hz, stored as JSON array, uploaded to GCS.

**Audio:** System audio + mic merged via `AudioContext.createMediaStreamDestination()` into single stream (v1).

**Constraints:** Max 30 min recording, WebM output (backend FFmpeg handles conversion), Chrome/Edge required.

---

## 5. Studio / NLE Editor (`/project/[id]`)

Resizable panel layout (shadcn `ResizablePanelGroup`):

```
┌────────┬─────────────────────────────┬───────────────────┐
│ Assets │      Video Preview          │   Properties      │
│ & Sig- │   ┌─────────────────┐       │   Inspector       │
│ nals   │   │   <video>       │       │                   │
│        │   └─────────────────┘       │   Speed, opacity  │
│        │   ◄ ▶ ■  00:24/02:34       │   zoom, pan, etc  │
├────────┴─────────────────────────────┴───────────────────┤
│ Toolbar: Cut, Split, Speed, Zoom, Text, Undo/Redo       │
├──────────────────────────────────────────────────────────┤
│ Timeline Minimap (thin strip, visible for long projects) │
├──────────────────────────────────────────────────────────┤
│ Timeline (Canvas + HTML hybrid)                          │
│  V1: [clip][clip][clip]                                  │
│  A1: ~~waveform~~                                        │
│  T1: [text][text]                                        │
└──────────────────────────────────────────────────────────┘
```

### Left Panel — Asset Browser & Signal Inspector
Two tabs: Assets (drag onto timeline) and Signals (speech segments, intent tree, narrative beats, edit decisions, UI transitions, cursor movements). Click signal → jump playhead.

### Center Panel — Preview + Timeline
Upper: `<video>` synced to playhead via `PlaybackSync` engine. Audio level meters (vertical bar, right side). Lower: Canvas-rendered timeline with HTML track headers.

### Right Panel — Properties Inspector
Context-sensitive for selected clip: video (speed, opacity, zoom, pan, crop), audio (volume, fade), text (content, font, size, color, position, animation, background), transition (type, duration), effects (type-specific params).

### Preview Modals
- **Clip preview:** double-click clip → modal with that segment playing, studio blurred behind (`backdrop-filter: blur(12px)`)
- **Full render preview:** toolbar button or `Cmd+Enter` → rendered output video in modal
- Same `PreviewModal` component, different source props

### Processing State
Pipeline progress overlay when project still processing. Timeline populates incrementally as signals arrive. User can start editing before render completes.

---

## 6. Projects Gallery (`/projects`)

Grid/list view toggle. Filter by status (All/Ready/Processing/Failed), sort by date. Cards show thumbnail, name, status, duration, date, context menu.

**Context menu:** Open in Studio, Download, Retry (failed), Delete (needs backend reducer), Rename (needs backend reducer), Duplicate (needs backend reducer).

Search: client-side filter on project name.

---

## 7. Zustand Store Architecture

All stores use `createStore()` (vanilla). React hooks wrap via `useStore()`.

```
core/stores/
├── projectStore.ts      ← projects, project states, tasks, STDB sync
├── timelineStore.ts     ← clips, tracks, playhead, zoom (+ temporal undo/redo)
├── captureStore.ts      ← recording state, cursor/typing buffers
├── signalStore.ts       ← AI signals by type, per-project
└── uiStore.ts           ← panel sizes, modal state, selections
```

### timelineStore (with temporal middleware, limit 100)
Tracks, clips (Map by ID), playhead, zoom, scroll, selection, playing state. Undoable operations: addClip, moveClip, trimClip, splitClip, deleteClips, setClipProperty. Import from AI: `loadFromTimelineEvents()`.

### captureStore
Recording state machine, blob storage, cursor/typing buffers, upload progress, `uploadAndProcess()` method.

### signalStore
Signals by projectId, grouped accessors (speech, intents, beats, edit decisions), STDB sync.

### uiStore
Panel collapse state, active tab, modal state (open/mode/clipId), active project.

---

## 8. Timeline Architecture (Hybrid)

### HTML layer (React)
Track headers (labels, mute/solo/lock), toolbar, scrollbar, zoom slider, time ruler.

### Canvas layer (`core/timeline/`)
```typescript
class TimelineRenderer {
  constructor(canvas: HTMLCanvasElement, store: TimelineStore)
  render(): void
  renderClip(clip: Clip): void
  renderWaveform(track: Track): void
  renderPlayhead(positionMs: number): void
  onMouseDown(e: MouseEvent): HitTarget | null
  onMouseMove(e: MouseEvent): void
  onMouseUp(e: MouseEvent): void
  setZoom(pxPerMs: number): void
  setScroll(scrollMs: number): void
  showDropPreview(trackIndex: number, timeMs: number): void
}
```

Canvas retina handling: `canvas.width = clientWidth * devicePixelRatio`, `ctx.scale(dpr, dpr)`.

Virtualized rendering: only draw clips in visible viewport + margin. Trigger at 200+ clips.

---

## 9. Video-Timeline Sync

```typescript
class PlaybackSync {
  constructor(video: HTMLVideoElement, store: TimelineStore)
  // Play: rAF loop reads video.currentTime → updates store.playheadMs → canvas redraws
  // Seek: store.playheadMs updates → sets video.currentTime → waits for 'seeked' event
  // Speed: video.playbackRate adjusted per-clip
}
```

Scrub preview: throttle `video.currentTime` updates to 50ms during fast dragging.

---

## 10. Keyboard Shortcuts

Framework-agnostic `core/services/shortcuts.ts`. Skips when focused on text inputs.

**Playback:** Space (play/pause), J/K/L (reverse/pause/forward), arrows (nudge frame/10 frames)

**Editing:** C (split), V (select tool), Delete, Cmd+Z/Shift+Z (undo/redo), Cmd+A/D (select/deselect all), Cmd+C/X/V (copy/cut/paste)

**Timeline:** Cmd+±/0 (zoom in/out/fit), Home/End (jump start/end)

**Modals:** Cmd+Enter (render preview), Esc (close/deselect)

**Recording:** R (start/stop), M (mic toggle) — `/record` page only

---

## 11. Clip Operations

### Selection & Multi-select
Click (single), Shift+click (range), Cmd+click (toggle), marquee drag (area select). Selected clips: highlight border + resize handles.

### Copy/Paste
Cmd+C/X/V. Paste at playhead, maintain relative spacing. Shift right if overlap.

### Snapping
Snap to: playhead, clip edges, markers, time grid. Visual: snap line at 8px threshold. Alt to disable.

### Editing Modes
Toggle in toolbar: Overwrite (gaps allowed) vs Ripple (clips shift to fill gaps).

### Clip Overlap Rules
Same track: no overlap. Overwrite mode trims overlapped clip; ripple mode pushes clips right. Cross-track: always allowed (stacking).

---

## 12. Track Management

Add track: `+` button → dropdown (Video/Audio/Text/Overlay). Delete: right-click header. Reorder: drag headers. Per-track controls: mute/hide, solo, lock.

Default tracks: V1 + A1 (always present). Max 20 tracks.

---

## 13. Clip Visual Representation

- **Video:** filmstrip thumbnail strip (sampled frames at zoom-dependent intervals)
- **Audio:** filled waveform
- **Text:** text content rendered in clip body
- **Overlay:** colored bar with type label

Color coding: video=indigo, audio=green, text=amber, overlay=pink. Clip label at top-left.

---

## 14. Keyframe System

```typescript
interface Keyframe {
  timeMs: number          // relative to clip start
  value: number
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

interface ClipEffect {
  property: 'zoom' | 'panX' | 'panY' | 'opacity' | 'speed'
  keyframes: Keyframe[]   // min 2 (start + end)
}
```

Diamond markers on clips in timeline. Add via Properties panel. Drag to reposition. Preview via CSS transforms on `<video>` element interpolated per `requestAnimationFrame`.

---

## 15. Context Menus

**On clip:** Cut, Copy, Delete, Split, Speed submenu, Transition submenu, Properties, Preview Clip.

**On empty timeline:** Paste, Add Text, Add Marker.

**On track header:** Add Track Above/Below, Delete Track, Rename, Mute/Solo/Lock.

---

## 16. Drag-and-Drop

HTML5 Drag API on asset panel items. Canvas receives `dragover`/`drop`. Drop preview: insertion line at target position. Creates clip at drop location.

---

## 17. Re-render Flow

User edits → serialize timeline to JSON → upload to GCS → `createAsset(type: 'timeline')` → `createTask(type: RENDER)` → worker renders → new `rendered_video` asset → studio shows toast.

Skips AI pipeline — goes straight to RENDER. User IS the editor.

---

## 18. Auto-save & Persistence

Debounced auto-save (500ms) on every timeline mutation. Timeline state serialized to GCS as `timeline/user_edit.json`. Dirty indicator in header. `beforeunload` warning if unsaved.

Recovery: load `user_edit.json` → AI `timeline.json` → empty timeline (in that priority).

Undo/redo history NOT persisted across refreshes.

---

## 19. Notifications / Toasts

Framework-agnostic `core/services/notifications.ts`. React renders via shadcn Sonner. Bottom-right, max 3 stacked.

Triggers: upload complete, render complete (with Preview action), task failed, STDB reconnecting.

---

## 20. Empty States

| Location | Content |
|----------|---------|
| Dashboard (no projects) | Illustration + "Create your first project" + "Start Recording" CTAs |
| Studio (processing) | Pipeline DAG overlay |
| Studio (done, no clips) | "Drag assets or click 'Load AI Edit'" |
| Asset panel (empty) | "Assets will appear as pipeline processes" |
| Signal panel (empty) | "Signals will populate as AI analysis completes" |
| Properties (nothing selected) | "Select a clip to view properties" |

---

## 21. Loading & Skeleton States

Skeleton cards for Dashboard/Projects. Spinner overlay on video preview during buffering. Skeleton panels on studio mount. Gray flat bar → waveform on audio decode completion.

---

## 22. Error Handling

| Scenario | Response |
|----------|----------|
| Recording permission denied | Toast, stay on page |
| Browser unsupported | Banner, hide record button |
| STDB disconnect | Yellow "Reconnecting..." badge, queue reducer calls |
| GCS upload failure | 3x retry with backoff, then error toast with Retry button |
| Task failure | Show failure reason, per-task Retry button |
| Video decode error | "Unsupported format" in preview |

---

## 23. Memory Management

Video: stream from GCS (never load full file). Thumbnails: generate visible range + buffer, evict off-screen. Waveform: decode once, cache peaks, downsample at zoom. Virtualize timeline at 200+ clips. Target: max 500MB browser memory.

---

## 24. Web Workers

```
core/workers/
├── waveformWorker.ts     ← AudioBuffer → peaks array
├── thumbnailWorker.ts    ← Video frames via OffscreenCanvas
└── exportWorker.ts       ← Timeline JSON serialization
```

---

## 25. Signed URL Refresh

`core/services/signedUrls.ts` — caches URLs, refreshes when <5 min remaining. Refreshes all on tab refocus. All `<video>` src and fetch calls go through this manager.

---

## 26. Performance Budgets

| Metric | Target |
|--------|--------|
| Max clips before virtualization | 200 |
| Max tracks | 20 |
| Timeline render frame budget | 16ms (60fps) |
| Waveform decode (1 min audio) | <2s (worker) |
| Max project video duration | 30 min |
| Studio page load | <3s |
| Studio bundle size | <500KB gzipped |

---

## 27. Concurrent Tab Safety

On studio mount: set `lockedBy: tabId` on `project_state`. On unmount: clear lock. Second tab sees "Open read-only?" dialog. Lock expires 60s without heartbeat.

Requires backend: `lockedBy` and `lockHeartbeat` fields on `project_state`.

---

## 28. Zoom Behavior

Min: 1px = 10s (see full 30-min project). Default: 1px = 100ms. Max: 1px = 1 frame (33ms).

`Cmd+Scroll` zooms centered on mouse. `Shift+Scroll` scrolls horizontally. Time ruler adapts tick marks to zoom level.

Below 1px per clip → clips render as colored lines (no thumbnails).

---

## 29. Timeline Minimap

30px Canvas strip above main timeline. Shows all clips as colored blocks at compressed scale. White draggable viewport rectangle. Only shown when project > 2× viewport width.

---

## 30. Signal ↔ Clip Linking

Click signal → playhead jumps + corresponding clip selected. Select clip → source signals highlighted in signal panel. Dotted connector lines on signal panel hover.

---

## 31. Audio Level Meters

Vertical bar on right side of video preview during playback. `AudioContext.createAnalyser()` → `getByteFrequencyData()` → render per rAF. Green/yellow/red ranges. Stereo: two thin bars (L/R).

---

## 32. Text Overlay Editor

Properties panel: content textarea, font dropdown, size slider, color picker, position X/Y, animation dropdown, background toggle.

WYSIWYG: text renders on video preview as draggable/resizable overlay. Direct manipulation updates `ClipEffect` keyframes in real-time.

---

## 33. Transition System

Available v1: Fade, Dissolve, Wipe Left, Wipe Right, Slide. Diamond icon between adjacent clips. Hover shows type + duration tooltip. Menu hover shows 2s looping CSS animation preview.

---

## 34. Long Recording / Chunked Upload

GCS resumable uploads via byte-range headers. Resume from last successful byte on failure. Progress shows MB uploaded / total. Warning banner at 10+ min recordings.

---

## 35. Aspect Ratio Handling

Preview: `object-fit: contain` with letterbox bars. Timeline thumbnails: fixed height (60px), width proportional. Render output resolution: determined by backend from source.

---

## 36. Offline / Degraded Network

Offline: banner, edits continue in memory, `localStorage` fallback (5MB cap). Reconnect: auto-sync + toast. Slow connection: reduce poll frequency 3s → 10s.

---

## 37. Project Duplication

Projects gallery context menu: "Duplicate" → new project with "(copy)" suffix, same asset references, copied timeline, no re-run of pipeline. Requires `duplicateProject` backend reducer.

---

## 38. Backend Reducers Needed

| Reducer | Purpose |
|---------|---------|
| `deleteProject` | Delete project + cascade all related data |
| `renameProject` | Update project name |
| `updateAsset` | Update asset metadata |
| `duplicateProject` | Clone project with assets + timeline |

Also: add `lockedBy` / `lockHeartbeat` fields to `project_state` table.

---

## 39. Bundle Size Strategy

| Route | Key deps | Est. gzip |
|-------|----------|-----------|
| `/` | shadcn cards, stdb client | ~80KB |
| `/record` | + MediaRecorder (native) | ~90KB |
| `/project/[id]` | + Canvas, waveform, Zustand | ~350KB |
| `/projects` | same as `/` | ~80KB |
| shared | Zustand, shadcn core, Tailwind | ~120KB |

Next.js code splitting + dynamic imports for heavy modules.

---

## 40. File Format Handling

MediaRecorder outputs WebM. Backend FFmpeg handles WebM input natively. No client-side conversion needed.
