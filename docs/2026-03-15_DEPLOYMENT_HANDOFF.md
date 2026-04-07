# Deployment Handoff — v10 Build (2026-03-15)

## Summary

All 14 Docker images (13 workers + client) deployed to Cloud Run as `v10`. Two root causes were identified and fixed that prevented workers from starting.

## Current State

| Component | Status | Detail |
|-----------|--------|--------|
| **Client** | DEPLOYED (v10) | `https://flowstudio-client-97563850419.us-east4.run.app` |
| **13 Workers** | DEPLOYED (v10) | All services running on `node:24-slim` |
| **All v10 images** | IN REGISTRY | `us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/*:v10` |

## Root Cause 1 — Node.js Version (Resolved)

SpacetimeDB SDK v2.0.4 (`spacetimedb/dist/server/index.mjs`) uses the **`using` keyword** (TC39 Explicit Resource Management, ES2024):

```javascript
// spacetimedb/dist/server/index.mjs:6900
using iter = new IteratorHandle(id);
```

Node.js 20.18 does not support `using` declarations. Node.js 22 and 23 also fail — **Node.js 24 is required** for full ES2024 `using` support. The workers crashed immediately on import:

```
SyntaxError: Unexpected identifier 'iter'
    at compileSourceTextModule (node:internal/modules/esm/utils:339:16)
```

**Fix applied:**

**File:** `infra/docker/Dockerfile.worker` (line 1)
```diff
-FROM node:20.18-slim
+FROM node:24-slim
```

**File:** `infra/docker/Dockerfile.client` (lines 1 and 21)
```diff
-FROM node:20.18-slim AS base
+FROM node:24-slim AS base
...
-FROM node:20.18-slim AS production
+FROM node:24-slim AS production
```

**File:** `package.json`
```diff
-"node": ">=20.18.0"
+"node": ">=24.0.0"
```

## Root Cause 2 — Wrong SDK Import Path (Resolved)

The auto-generated `module_bindings/index.ts` files imported from `spacetimedb/server`, which is the WASM-only server binding. This module contains the `using` keyword and is not intended for Node.js client use. The correct import for Node.js clients is `spacetimedb/sdk`.

**Files fixed:**
- `packages/workers/shared/src/module_bindings/index.ts`
- `frontend/lib/stdb/module_bindings/index.ts`
- `claudeFrontend/src/module_bindings/index.ts`

```diff
-import { ... } from 'spacetimedb/server';
+import { ... } from 'spacetimedb/sdk';
```

This was the actual reason Node 22/23 also failed — the `server` entrypoint pulls in WASM-only code with `using` declarations, while the `sdk` entrypoint is a pure Node.js client that works on Node 24+.

## Deployment Steps (for reference)

```bash
# Authenticate Docker
gcloud config configurations activate flowstudio
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin us-east4-docker.pkg.dev

# Rebuild all (from /home/user/projects/flowstudio)
./infra/scripts/deploy-all.sh v10
```

## Verification

```bash
# Check service status
gcloud run services describe flowstudio-audio-extract --region=us-east4 --format='value(status.conditions)'

# Check logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=flowstudio-audio-extract" \
  --project=lyrical-epigram-484715-v6 --limit=20 --format="table(timestamp,textPayload)"
```

Workers will still fail the health probe if SpacetimeDB (GCE VM) is unreachable. The `STDB_INTERNAL_HOST` env var in Terraform must point to the GCE VM's internal IP, and the VPC connector must be active.

## Additional Fixes Applied in This Session

### 1. `worker-shared/test-utils.ts` — Removed stale `stdb` field

The `WorkerDeps` interface no longer has an `stdb` field (removed when workers switched to native SDK). `createMockDeps()` still referenced it, causing build failures.

**File:** `packages/workers/shared/src/test-utils.ts`
```diff
 export function createMockDeps(overrides: Partial<WorkerDeps> = {}): WorkerDeps {
   const config = overrides.config ?? createMockConfig();
   return {
     config,
     logger: overrides.logger ?? (createMockLogger() as any),
     gcs: overrides.gcs ?? (createMockGcs() as any),
-    stdb: overrides.stdb ?? (createMockStdb() as any),
   };
 }
```

### 2. `worker-shared/package.json` — Types point to source

The `worker-shared` package has `declaration: false` in its tsconfig (required because SpacetimeDB's schema types aren't portable for `.d.ts` generation). This means no `.d.ts` files are emitted, so downstream workers couldn't resolve `getSourceVideoPath()` from `BaseWorker`.

**Fix:** Changed `types` export to point to TypeScript source instead of `dist/`:

```diff
-"types": "dist/index.d.ts",
+"types": "src/index.ts",
 "exports": {
   ".": {
     "import": "./dist/index.js",
-    "types": "./dist/index.d.ts"
+    "types": "./src/index.ts"
   }
 },
```

### 3. Frontend — Next.js 16 Turbopack compatibility

Next.js 16 defaults to Turbopack which can't resolve `spacetime:sys@2.0` (a SpacetimeDB WASM-only native module). Three changes:

**a) Turbopack alias stub** — `frontend/next.config.ts`
```typescript
turbopack: {
  resolveAlias: {
    'spacetime:sys@2.0': './lib/stdb/spacetimedb-stub.ts',
  },
},
```

**b) SSR-safe provider** — `frontend/components/stdb-provider-wrapper.tsx` (new file)
```typescript
'use client';
import dynamic from 'next/dynamic';
const StdbProvider = dynamic(
  () => import('@/components/stdb-provider').then((mod) => mod.StdbProvider),
  { ssr: false }
);
```

**c) Layout update** — `frontend/app/layout.tsx` uses `StdbProviderWrapper` instead of `StdbProvider`

### 4. Missing dependency — `@radix-ui/react-alert-dialog`

Shadcn/ui generated `components/ui/alert-dialog.tsx` but the dependency wasn't in `package.json`. Next.js TypeScript check fails during build. Added via `pnpm --filter frontend add @radix-ui/react-alert-dialog`.

### 5. `Project` type — Added `folderId` field

**File:** `frontend/lib/types.ts`
```diff
   category: string;
+  folderId?: string;
 }
```

**File:** `frontend/lib/stores/project-store.ts`
```diff
     category: "Uncategorized",
+    folderId: p.folderId || undefined,
   }
```

## Files Changed (Full List)

| File | Change |
|------|--------|
| `infra/docker/Dockerfile.worker` | `node:20.18-slim` → `node:24-slim` |
| `infra/docker/Dockerfile.client` | `node:20.18-slim` → `node:24-slim` (both stages) |
| `package.json` | `engines.node` → `>=24.0.0` |
| `packages/workers/shared/src/module_bindings/index.ts` | `spacetimedb/server` → `spacetimedb/sdk` |
| `frontend/lib/stdb/module_bindings/index.ts` | `spacetimedb/server` → `spacetimedb/sdk` |
| `claudeFrontend/src/module_bindings/index.ts` | `spacetimedb/server` → `spacetimedb/sdk` |
| `frontend/lib/types.ts` | Added `folderId?: string` to `Project` interface |
| `frontend/lib/stores/project-store.ts` | Map `folderId` in `stdbProjectToProject()` |
| `packages/workers/shared/src/test-utils.ts` | Removed stale `stdb` from `createMockDeps()` |
| `packages/workers/shared/package.json` | `types` → `src/index.ts` |
| `frontend/next.config.ts` | Added `output: 'standalone'`, turbopack alias |
| `frontend/app/layout.tsx` | Use `StdbProviderWrapper` |
| `frontend/package.json` | Added `@radix-ui/react-alert-dialog` |
| `infra/docker/Dockerfile.client` | Build command (reverted to `pnpm run build`) |
| `frontend/components/stdb-provider-wrapper.tsx` | NEW — SSR-safe dynamic wrapper |
| `frontend/lib/stdb/spacetimedb-stub.ts` | NEW — Turbopack stub for `spacetime:sys@2.0` |
| `pnpm-lock.yaml` | Updated |

## GCP Context

| Resource | Value |
|----------|-------|
| GCP Project | `lyrical-epigram-484715-v6` |
| Region | `us-east4` |
| Registry | `us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio` |
| gcloud config | `flowstudio` (activate with `gcloud config configurations activate flowstudio`) |
| Service Account | `vertex-express@lyrical-epigram-484715-v6.iam.gserviceaccount.com` |

## Deployment Scripts

```bash
# Build + push one service
./infra/scripts/build-and-push.sh <service-name> <version>

# Deploy one service to Cloud Run
./infra/scripts/deploy-worker.sh <service-name> <version>

# Build + push + deploy everything
./infra/scripts/deploy-all.sh <version>
```

Workers: `audio-extract`, `video-sample`, `cursor-processor`, `typing-detector`, `speech-transcription`, `video-understanding`, `ui-change-detector`, `interaction-pattern`, `intent-graph`, `narrative-planner`, `edit-planner`, `timeline-builder`, `render`

Client: `client`
