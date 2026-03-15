# PLAN-W06 — Frontend Merge & Auth

> **Problem**: `frontend/` is the real app (Clerk auth, rich timeline, polished UI) but lacks SpacetimeDB, real recording, and GCS upload. `claudeFrontend/` has those backend integrations but is a scaffold.
> **Goal**: Port backend integration from `claudeFrontend/` into `frontend/`. Single frontend with auth + STDB + recording + upload.

---

## What to Port FROM `claudeFrontend/` INTO `frontend/`

### 1. SpacetimeDB Connection Layer
**Source**: `claudeFrontend/src/lib/stdbConnection.ts`, `claudeFrontend/src/lib/stdbHooks.ts`
**Target**: `frontend/lib/stdb/connection.ts`, `frontend/lib/stdb/hooks.ts`

- HTTP bridge: `queryTable()`, `callReducer()`, `initConnection()`
- React hooks: `useStdbReducer()`, `useConnectionStatus()`
- STDB proxy API route: `frontend/app/api/stdb/[...path]/route.ts`

### 2. Real Recording (MediaRecorder)
**Source**: `claudeFrontend/src/core/services/capture.ts`
**Target**: `frontend/lib/capture/capture-service.ts`

Replace the timer-only recording in `frontend/app/record/page.tsx` with:
- `getDisplayMedia()` / `getUserMedia()` for screen + camera
- MediaRecorder with pause/resume
- Blob output for upload

### 3. GCS Upload Flow
**Source**: `claudeFrontend/src/core/services/signedUrls.ts` + record page upload logic
**Target**: `frontend/lib/upload/upload-service.ts`

- Fetch signed URL from Cloud Function
- PUT blob to GCS
- Call `createAsset` and `createTask` reducers via STDB

### 4. Capture Store (cursor + keyboard events)
**Source**: `claudeFrontend/src/core/stores/captureStore.ts`, `claudeFrontend/src/core/stores/signalStore.ts`
**Target**: `frontend/lib/stores/capture-store.ts`, `frontend/lib/stores/signal-store.ts`

- Cursor position tracking during recording
- Keyboard event capture
- Signal aggregation

### 5. Pipeline Status
**Source**: `claudeFrontend/src/components/PipelineStatus.tsx`, `PipelineOverlay.tsx`
**Target**: `frontend/components/pipeline-status.tsx`

- Real-time task progress from STDB
- Phase indicators (extracting → analyzing → planning → ready)

---

## What STAYS in `frontend/` (don't touch)

- Clerk auth (middleware, providers, sign-in/sign-up pages)
- Timeline component (trim, split, undo/redo, zoom, snap)
- VideoPreview (effects, chromakey, captions)
- EditorShell layout
- MediaPanel, InspectorPanel
- ExportModal
- Dashboard, Projects pages
- All UI components (shadcn/Radix)
- GSAP animations on landing page

---

## New API Routes to Add

| Route | Purpose |
|-------|---------|
| `app/api/stdb/[...path]/route.ts` | Proxy to SpacetimeDB (avoid CORS) |
| `app/api/upload-url/route.ts` | Proxy to Cloud Function for signed URLs |

---

## Auth Integration Points

The STDB proxy and upload routes must require Clerk auth:
```typescript
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  // ... proxy to STDB with ownerId = userId
}
```

---

## Store Updates

### `frontend/lib/stores/project-store.ts`
Currently uses `MOCK_PROJECTS`. Change to:
- Fetch projects from STDB on mount
- `createProject` → STDB reducer
- `deleteProject` → STDB reducer
- Keep optimistic updates with Zustand

### `frontend/lib/stores/recording-store.ts`
Currently tracks timer only. Enhance to:
- Wrap `capture-service.ts` (MediaRecorder)
- Store recording blob
- Track cursor/keyboard events during recording

---

## Test Plan (TDD)

### Unit tests:
```typescript
describe("STDB Connection", () => {
  it("queryTable returns parsed rows")
  it("callReducer sends correct payload")
  it("handles connection failure gracefully")
  it("proxy route requires auth")
  it("proxy route forwards to STDB_HOST")
})

describe("Capture Service", () => {
  it("starts screen recording with getDisplayMedia")
  it("pauses and resumes recording")
  it("stops recording and returns blob")
  it("captures cursor events during recording")
  it("captures keyboard events during recording")
})

describe("Upload Service", () => {
  it("fetches signed URL from Cloud Function")
  it("uploads blob to signed URL")
  it("creates asset in STDB after upload")
  it("creates initial tasks in STDB after upload")
})

describe("Project Store (STDB)", () => {
  it("fetches projects from STDB on init")
  it("createProject calls STDB reducer")
  it("updates local state optimistically")
})
```

### Acceptance Criteria:
- [ ] `frontend/` is the only app users interact with
- [ ] Sign in → Dashboard shows real projects from STDB
- [ ] Record page uses real MediaRecorder
- [ ] After recording, video uploads to GCS
- [ ] Upload triggers task creation in STDB
- [ ] Pipeline status visible on project page
- [ ] All existing frontend tests still pass
- [ ] Clerk auth protects all routes
