# FlowStudio: Concurrent Editing Implementation Handoff
**Date:** 2026-03-15 09:29 UTC

## Status: IMPLEMENTED, NOT COMMITTED, NOT DEPLOYED

All code is in the working tree as unstaged changes. Nothing has been committed or deployed.
Run `git diff --stat` and `git ls-files --others --exclude-standard` to see everything.

## What Was Built (8 Phases)

### Phase 0: Recording → Editor Data Loss Fix
**Problem:** "Apply + Refine" path called `discardCapture()` and navigated to `/studio` without uploading — editor found nothing.
**Fix:**
- `frontend/app/record/preview/page.tsx`: `goToStudioRefine()` now uploads blob to GCS via `uploadToGcs()`, creates STDB `SOURCE_VIDEO` asset via `conn.reducers.createAsset()`, THEN navigates. Shows upload progress.
- `frontend/components/editor-shell.tsx`: Added fallback — if no SOURCE_VIDEO asset in STDB but capture store has a blob, uses it directly.

### Phase 1: STDB Schema — 5 New Tables + 16 Reducers
**File:** `packages/stdb-module/src/index.ts` (+376 lines)

**New Tables:**
| Table | Purpose | Index |
|-------|---------|-------|
| `timeline_clips` | Clip data (position, duration, transform, effects) | byProjectId |
| `media_files` | Media metadata + GCS URLs | byProjectId |
| `effect_blocks` | Modular effects (zoom, speed, etc.) | byProjectId |
| `project_presence` | Who's viewing, their cursor position, color | byProjectId |
| `project_locks` | Pessimistic editing lock (30-min expiry) | PK: projectId |

**New Reducers:** `upsertTimelineClip`, `removeTimelineClip`, `batchUpsertTimelineClips` (max 200), `clearProjectTimeline`, `createMediaFile`, `updateMediaFileCaptions`, `removeMediaFile`, `upsertEffectBlock`, `removeEffectBlock`, `joinProject`, `leaveProject`, `heartbeatPresence`, `acquireLock`, `renewLock`, `releaseLock`, `forceReleaseLock`

**Lifecycle changes:**
- `onDisconnect`: Deletes presence rows + releases locks for disconnected identity
- `runWatchdog`: Now also cleans stale presence (>2min) + expired locks

**Constants added:** `LOCK_EXPIRY_MS` (30min), `PRESENCE_STALE_MS` (2min), `MAX_BATCH_CLIPS` (200), `PRESENCE_COLORS` (8 colors)

### Phase 2: Shared Types
- `packages/shared/src/types/tables.ts`: Added `TimelineClipRow`, `MediaFileRow`, `EffectBlockRow`, `ProjectPresenceRow`, `ProjectLockRow`
- `packages/shared/src/types/enums.ts`: Added `PRESENCE_COLORS` array

### Phase 3: Timeline Persistence
- `frontend/lib/stdb/module_bindings/index.ts`: Added 5 table defs, 17 reducer schemas, 6 row types
- `frontend/lib/stdb/spacetimedb.ts`: **Major changes:**
  - Scoped initial subscription (removed unscoped `SELECT * FROM assets/tasks/signals`)
  - Added `subscribeToProject(projectId)` — scoped queries for all 8 project tables
  - Added `wireProjectCallbacks()` — onInsert/onUpdate/onDelete for all 5 new tables
  - Added 5 query helpers: `getTimelineClips`, `getMediaFiles`, `getEffectBlocks`, `getProjectPresence`, `getProjectLock`
  - Added 5 callback setters: `setOnTimelineClipsChanged`, etc.
  - Added store types: `StdbPresenceUser`, `StdbProjectLock` (bigint→number)
  - Debounced `notifyProjectsChanged`/`notifyFoldersChanged` by 100ms
  - `getProjectAssets` now uses `byProjectId` index with fallback
- **NEW:** `frontend/lib/stdb/converters.ts` — Bidirectional converters (STDB rows ↔ local editor types)
- `frontend/components/editor-context.tsx`:
  - Accepts `isEditor` prop (controls mutation permissions + auto-save)
  - Added `loadFromStdb(projectId)` — reads clips/media/effects from STDB cache
  - `saveProject` now batch-upserts clips + effects to STDB when `isEditor && isConnected()`
  - Auto-save gated on `isEditor`
- `frontend/components/editor-shell.tsx`:
  - Calls `subscribeToProject(projectId)` on mount, then `loadFromStdb(projectId)` after subscription applied
  - Passes `isEditor` to `EditorProvider`

### Phase 4: Media Persistence to GCS
- **NEW:** `frontend/lib/upload/media-upload-service.ts` — `uploadEditorMedia()` via signed URL
- `infra/cloud-function/generate-upload-url/index.js`: Accepts `media_files` folder + `image/*` content type; `folder` param from request body
- `frontend/app/api/upload-url/route.ts`: Passes `folder` param through; accepts image content types

### Phase 5: Presence & Locking
- **NEW:** `frontend/hooks/use-presence.ts` — `joinProject` on mount, 10s heartbeat, `leaveProject` on unmount/beforeunload
- **NEW:** `frontend/hooks/use-project-lock.ts` — Auto-acquire lock, 5min renew, release on unmount; `forceAcquire` for owner takeover
- `frontend/components/editor-shell.tsx`: Uses both hooks, passes `isEditor` from lock state

### Phase 6: Conflict UI
- **NEW:** `frontend/components/presence-avatars.tsx` — Colored initials, max 5 + overflow count
- **NEW:** `frontend/components/lock-status-banner.tsx` — "X is editing" banner with start/takeover buttons
- **NEW:** `frontend/components/lock-takeover-dialog.tsx` — Confirmation modal for force-take
- `frontend/components/editor-shell.tsx`: Read-only badge, presence avatars in top bar, lock banner, takeover dialog

### Phase 7: Performance Fixes
- `frontend/components/timeline.tsx`: RAF-throttled scrubbing (`pendingScrubTimeRef` + `scrubRafRef`)
- **NEW:** `frontend/lib/playback-store.ts` — Zustand store for `currentTime`/`isPlaying`/`isScrubbing` (not yet wired — available for future use to decouple from EditorContext)
- `frontend/lib/storage.ts`: Blob URL tracking + `revokeBlobUrl()`/`revokeAllBlobUrls()`
- `frontend/lib/stdb/spacetimedb.ts`: Debounced project/folder notifications
- `packages/workers/shared/src/base-worker.ts`: `Promise.all` for parallel signal dispatch

## File Inventory

### New Files (8)
```
frontend/components/presence-avatars.tsx
frontend/components/lock-status-banner.tsx
frontend/components/lock-takeover-dialog.tsx
frontend/hooks/use-presence.ts
frontend/hooks/use-project-lock.ts
frontend/lib/playback-store.ts
frontend/lib/stdb/converters.ts
frontend/lib/upload/media-upload-service.ts
```

### Modified Files (13)
```
frontend/app/api/upload-url/route.ts
frontend/app/record/preview/page.tsx
frontend/components/editor-context.tsx
frontend/components/editor-shell.tsx
frontend/components/timeline.tsx
frontend/lib/stdb/module_bindings/index.ts
frontend/lib/stdb/spacetimedb.ts
frontend/lib/storage.ts
infra/cloud-function/generate-upload-url/index.js
packages/shared/src/types/enums.ts
packages/shared/src/types/tables.ts
packages/stdb-module/src/index.ts
packages/workers/shared/src/base-worker.ts
```

## TypeScript Verification
All three packages pass `tsc --noEmit` with zero errors:
- `frontend/` ✓
- `packages/shared/` ✓
- `packages/workers/shared/` ✓

## Deployment Requirements (when ready)
1. **`spacetime publish`** — Must publish the STDB module first (5 new tables + 16 reducers)
2. **Cloud Function redeploy** — `generate-upload-url` accepts new folder/content types
3. **Frontend build** — Use `./build-local.sh vXX` (NEVER raw docker build)
4. **Worker rebuild** — `base-worker.ts` changed (signal batching)
5. **Shared package rebuild** — `pnpm --filter @flowstudio/shared run build` (new types)

## Known Issues (NOT YET FIXED)
See the bugfix prompt below — these must be fixed before deploying.

## Critical Architecture Notes
- **Reducer name casing:** STDB module uses camelCase (`upsertTimelineClip`), module_bindings use snake_case (`upsert_timeline_clip`). The SDK auto-converts. If this breaks, check the casing.
- **Scoped subscriptions:** Initial connect now only subscribes to `projects` + `folders`. Per-project data (assets, tasks, signals, timeline, etc.) requires calling `subscribeToProject(projectId)`.
- **Lock expiry:** 30 minutes. Watchdog cleans every 30 seconds. Presence stale after 2 minutes.
- **Batch limit:** `batchUpsertTimelineClips` rejects batches > 200 clips.
