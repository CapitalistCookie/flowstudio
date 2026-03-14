# FlowStudio Frontend NLE — Handoff Document

**Date:** 2026-03-14 09:18 UTC
**Author:** Design session (brainstorming → plan)
**Status:** Ready for execution

---

## What Was Done

1. Explored the full FlowStudio backend (SpacetimeDB module, 13 workers, 11 reducers, 10 signal types, GCS storage)
2. Audited the existing frontend (2 routes, 4 components, ~500 LOC, dashboard + upload only)
3. Designed 40-section frontend spec through iterative Q&A with user
4. Wrote phased implementation plan (9 phases, ~30 tasks)

## What Needs To Be Done

Build a full NLE video editor frontend with:
- **Dashboard** — project cards, progress bars, quick actions
- **Recording** — browser screen capture via `getDisplayMedia`, cursor/typing tracking, upload pipeline
- **Studio** — resizable 3-panel layout, video preview, hybrid HTML+Canvas timeline, properties inspector, preview modals
- **Projects** — gallery with grid/list, filters, context menus, download/retry/delete

## Architecture Summary

```
packages/client/src/
├── app/                    ← Next.js pages (swappable)
│   ├── page.tsx            ← Dashboard (/)
│   ├── record/page.tsx     ← Recording (/record)
│   ├── project/[id]/page.tsx ← Studio (/project/[id])
│   └── projects/page.tsx   ← Gallery (/projects)
├── components/             ← React components (swappable)
│   ├── ui/                 ← shadcn/ui primitives
│   ├── studio/             ← Studio-specific components
│   ├── Header.tsx          ← Navigation header
│   ├── ProjectCard.tsx     ← Project card
│   ├── StoreProvider.tsx   ← Root sync + toaster
│   └── ...
├── hooks/                  ← React adapters (swappable)
│   ├── useProjectStore.ts
│   ├── useTimelineStore.ts
│   ├── useCaptureStore.ts
│   ├── useUIStore.ts
│   ├── useSignalStore.ts
│   └── index.ts
├── core/                   ← Framework-agnostic (PERMANENT)
│   ├── stores/             ← Zustand vanilla stores
│   │   ├── projectStore.ts
│   │   ├── timelineStore.ts (+ zundo undo/redo)
│   │   ├── captureStore.ts
│   │   ├── signalStore.ts
│   │   └── uiStore.ts
│   ├── services/
│   │   ├── stdbSync.ts     ← SpacetimeDB → store bridge
│   │   ├── capture.ts      ← CaptureEngine (MediaRecorder)
│   │   ├── playbackSync.ts ← Video ↔ timeline sync
│   │   ├── shortcuts.ts    ← Keyboard shortcut manager
│   │   ├── notifications.ts← Toast queue
│   │   ├── signedUrls.ts   ← GCS URL cache/refresh
│   │   └── autoSave.ts     ← Debounced timeline save
│   ├── timeline/
│   │   ├── renderer.ts     ← Canvas timeline renderer
│   │   ├── colors.ts       ← Track color constants
│   │   └── types.ts        ← Renderer-specific types
│   ├── workers/
│   │   ├── waveformWorker.ts
│   │   └── thumbnailWorker.ts
│   └── types.ts            ← All core type definitions
└── lib/
    ├── stdb.ts             ← SpacetimeDB HTTP client (EXISTING, don't modify)
    ├── hooks.ts            ← DEPRECATED (old hooks, being replaced)
    └── utils.ts            ← cn() utility for shadcn
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI framework | shadcn/ui + Radix | Full control, no lock-in, great for dark theme |
| State management | Zustand vanilla + zundo | Framework-agnostic, performant selectors, built-in undo/redo |
| Timeline rendering | Hybrid HTML + Canvas | Canvas for clip grid (perf), HTML for controls (accessibility) |
| Recording | Browser getDisplayMedia | No external tool needed, cursor/typing capture alongside |
| Studio layout | Resizable panels | Premiere-style, shadcn ResizablePanelGroup built-in |
| Architecture | UI/Core separation | Core layer stays when swapping React for custom frontend |

## Existing Code To Preserve

- `lib/stdb.ts` — SpacetimeDB HTTP client. Already framework-agnostic. Don't modify.
- `packages/shared/src/` — All shared types, enums, constants. Don't modify (read from it).
- `components/PipelineStatus.tsx` — Can be reused in studio overlay.
- `globals.css` — CSS variables. Extend with shadcn mappings, don't replace.

## Existing Code To Replace

- `lib/hooks.ts` — Old per-component polling hooks. Replaced by `hooks/` directory + `core/services/stdbSync.ts`.
- `app/page.tsx` — Current dashboard. Replace with enhanced version using new stores.
- `app/project/[id]/page.tsx` — Current upload-only page. Replace with full studio.
- `components/Header.tsx` — Add navigation links.
- `components/CreateProjectDialog.tsx` — Migrate to use shadcn Dialog.
- `components/ProjectCard.tsx` — Add progress bar, thumbnail area.

## Dependencies To Install

```bash
# Core
pnpm --filter @flowstudio/client add zustand zundo sonner

# shadcn/ui primitives
pnpm --filter @flowstudio/client add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-context-menu @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-slider @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-popover @radix-ui/react-select class-variance-authority clsx tailwind-merge lucide-react react-resizable-panels
```

## SpacetimeDB Contract (Backend API)

### Tables (subscribe via HTTP polling)
- `projects` — id, name, status, createdAt, updatedAt, ownerId, metadata
- `tasks` — id, projectId, taskType, status, workerId, inputAssetIds, outputAssetIds, config, failureReason, retryCount
- `assets` — id, projectId, assetType, gcsPath, sizeBytes, mimeType, durationMs, metadata
- `signals` — id, projectId, taskId, signalType, timestampMs, durationMs, confidence, payload
- `project_state` — projectId, completedTasks, totalTasks, completedCount, currentPhase

### Reducers (HTTP POST)
- `createProject(name, ownerId, metadata)`
- `createAsset(projectId, assetType, gcsPath, sizeBytes, mimeType, durationMs, metadata)`
- `createTask(projectId, taskType, inputAssetIds, config, maxRetries)`
- `updateProjectState(projectId, currentPhase, status)`
- `completeTask(taskId, outputAssetIds)` — worker-only
- `failTask(taskId, failureReason)` — worker-only

### Missing Reducers (need to add in Phase 9)
- `deleteProject(projectId)`
- `renameProject(projectId, newName)`
- `duplicateProject(projectId)`
- `updateAsset(assetId, metadata)`

## Environment

- **Working directory:** `/home/user/FlowStudio`
- **Package manager:** pnpm (monorepo)
- **Client package:** `@flowstudio/client` at `packages/client/`
- **Shared package:** `@flowstudio/shared` at `packages/shared/`
- **TypeScript:** strict mode
- **Next.js:** 15.3.2, App Router, standalone output
- **Tailwind:** 4.1.4 (uses `@import "tailwindcss"` NOT JIT directives)
- **Build check:** `pnpm --filter @flowstudio/client run typecheck`
- **Full build:** `pnpm --filter @flowstudio/client run build`

## Phase Dependency Graph

```
Phase 1 (Foundation) ───► Phase 4 (Studio Layout) ───► Phase 5 (Timeline Core)
    │                                                       │
    ├──► Phase 2 (Dashboard) [parallel]                     ├──► Phase 7 (Workers) [parallel]
    ├──► Phase 3 (Recording) [parallel]                     └──► Phase 8 (Polish) [parallel]
    └──► Phase 6 (Projects) [parallel]

Phase 9 (Backend) ───► independent, anytime
```

## Risks

| Risk | Mitigation |
|------|------------|
| shadcn/ui + Tailwind v4 compatibility | Tailwind v4 changed config format — may need PostCSS adjustments. Test early. |
| Canvas timeline performance | Virtualize at 200+ clips. Profile during Phase 5. |
| MediaRecorder browser support | Chrome/Edge only. Show "unsupported" banner on Firefox/Safari. |
| zundo (temporal middleware) with Map types | Maps may not serialize cleanly for undo snapshots. Test in Task 1.4. |
| SpacetimeDB HTTP polling latency | 3s poll interval is fine for project/task status. Signals may need faster poll during processing. |
