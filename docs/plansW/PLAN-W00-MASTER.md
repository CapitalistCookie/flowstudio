# PLAN-W00 — Master Execution Plan

> **Goal**: Make FlowStudio a working, end-to-end agentic video editor — not a prototype, a product.
> **Method**: Test-driven, bottom-up, every plan has acceptance criteria before code is written.

---

## Current State Assessment (March 14, 2026)

### What Exists and Works
| Area | Status | Detail |
|------|--------|--------|
| `packages/shared` | ✅ 325 tests pass | Types, DAG, schemas, prompt security, utils |
| `packages/stdb-module` | ✅ Compiles | Tables, reducers, DAG chain, watchdog |
| 14 workers | ✅ Code exists | All extend BaseWorker, all have `processTask()` |
| `claudeFrontend` | ✅ Partial | Real recording, GCS upload, STDB HTTP bridge |
| `frontend` | ✅ Partial | Clerk auth, beautiful UI, timeline editor |
| Railtracks gateway | ✅ Partial | FastAPI, 3 agents, but **zero Railtracks SDK** |
| Infrastructure | ✅ Exists | Terraform, Docker, CI/CD, Cloud Function |

### What's Broken
| Issue | Impact | Severity |
|-------|--------|----------|
| 274 worker tests fail | Can't verify any worker works | **P0** |
| BaseWorker eagerly loads config | Tests crash before any assertion runs | **P0** |
| .env.example ≠ .env | Nothing runs locally without guessing | **P0** |
| TS compilation error in video-understanding | CI would fail | **P1** |
| No Railtracks SDK usage | Prize track disqualified | **P0** |
| Frontends not connected to pipeline | No end-to-end flow | **P0** |
| No reprompt loop | Core value prop doesn't work | **P0** |
| No export | Users can't get output | **P1** |
| No auth on claudeFrontend | Anyone can access | **P2** |

### Two Frontends Problem
| Aspect | `frontend/` (REAL) | `claudeFrontend/` (SCAFFOLD) |
|--------|---------------------|------------------------------|
| Auth | Clerk ✅ | None |
| SpacetimeDB | None | HTTP bridge ✅ |
| Recording | Timer only | Real MediaRecorder ✅ |
| Upload | None | GCS signed URLs ✅ |
| Timeline | Rich (trim, split, undo) ✅ | Basic tracks |
| UI quality | Polished ✅ | Functional |
| Next.js | 16.1 | 15.3 |
| Workspace | Standalone | In pnpm workspace |

**Decision**: `frontend/` is the canonical app. Port SpacetimeDB integration, real recording, and GCS upload from `claudeFrontend/` into it. `claudeFrontend/` served as a proving ground for backend integration patterns.

---

## Plan Sequence

### Phase 0 — Fix Foundations (W-01 to W-03)
Everything else is blocked until tests run and env is sane.

| Plan | Title | Depends On | Deliverable |
|------|-------|------------|-------------|
| W-01 | Worker Test Isolation | — | 599/599 tests pass |
| W-02 | Unified Environment Config | — | Single `.env.example`, validation script |
| W-03 | TypeScript Fixes | — | `tsc --noEmit` passes all packages |

### Phase 1 — Railtracks Prize Track (W-04 to W-05)
Binary requirement: either we use Railtracks or we don't qualify.

| Plan | Title | Depends On | Deliverable |
|------|-------|------------|-------------|
| W-04 | Railtracks SDK Integration | W-01 | Gateway uses `rt.agent_node`, `rt.Flow`, `rt.call` |
| W-05 | Railtracks Observability | W-04 | `railtracks viz` shows runs with token usage |

### Phase 2 — Frontend Consolidation (W-06 to W-07)
One app, all features.

| Plan | Title | Depends On | Deliverable |
|------|-------|------------|-------------|
| W-06 | Frontend Merge & Auth | W-02 | claudeFrontend + Clerk auth + polished UI |
| W-07 | SpacetimeDB SDK Upgrade | W-06 | WebSocket real-time sync replaces HTTP polling |

### Phase 3 — End-to-End Pipeline (W-08 to W-11)
The core product loop: record → AI edits → review → reprompt → export.

| Plan | Title | Depends On | Deliverable |
|------|-------|------------|-------------|
| W-08 | Upload → Pipeline Trigger | W-06, W-07 | Upload video → STDB tasks created → workers run |
| W-09 | Edit Plan → Timeline | W-08 | Edits appear on timeline as they're produced |
| W-10 | Reprompt Loop | W-04, W-09 | Chat sidebar → agent re-plans → timeline updates |
| W-11 | Export Pipeline | W-09 | ffmpeg.wasm or server-side render → MP4 download |

### Phase 4 — Polish & Robustness (W-12 to W-14)
Make it production-worthy.

| Plan | Title | Depends On | Deliverable |
|------|-------|------------|-------------|
| W-12 | Local Dev Environment | W-02 | docker-compose up → everything runs |
| W-13 | Security Hardening | W-06 | Auth on all routes, prompt injection defense, CORS |
| W-14 | E2E Tests & Demo Script | W-11 | Automated E2E test, 2-min demo video script |

---

## Execution Order (Critical Path)

```
W-01 ──→ W-04 ──→ W-05
  │         │
  │         └──→ W-10 ──→ W-14
  │               ↑
W-02 ──→ W-06 ──→ W-07 ──→ W-08 ──→ W-09 ──→ W-11
  │         │                                    │
  │         └──→ W-13                            └──→ W-14
  │
W-03     W-12 (parallel with anything)
```

**Parallelizable pairs**:
- W-01 + W-02 + W-03 (all independent)
- W-04 + W-06 (Railtracks + Frontend, after W-01/W-02)
- W-12 at any time

---

## Key Architectural Decisions

### 1. Single Frontend (`frontend/`)
Rationale: It has Clerk auth, polished UI, rich timeline (trim, split, undo/redo, snap-to-grid), and the better component library. We port SpacetimeDB connection, real MediaRecorder recording, and GCS upload from `claudeFrontend/` into it. Adding backend integration to a good frontend is better than polishing a backend-connected skeleton.

### 2. Railtracks wraps the agentic loop only
The 14 TypeScript workers continue doing signal extraction. Railtracks handles intent → narrative → edit planning (the LLM part). This keeps the TS worker infrastructure while satisfying the prize track.

### 3. SpacetimeDB as the single source of truth
All state flows through STDB. The frontend subscribes to STDB tables. Workers read/write via STDB. No separate REST API needed for pipeline state.

### 4. Non-destructive edit plan
Edit plans are versioned (v1, v2, ...). Reprompting creates a new version. Source video is never modified. Export renders from the edit plan.

### 5. Test-driven everything
Every plan starts with test cases. Implementation follows. No "it probably works."

---

## What I Need From You

1. **GCP Service Account Key**: Is `lyrical-epigram-484715-v6-f865e736b70b.json` in the repo root? We need it for GCS.
2. **SpacetimeDB**: Is there a running instance? What's the actual host?
3. **Clerk keys**: The ones in `.env` look like test keys — are they valid?
4. **Deepgram API key**: Is `b324c31f73cd25ff5bf796f4d8d880ccdf9d820e` valid?
5. **Google AI API key**: Is `VERTEX_API_KEY` in `.env` a valid Gemini key?
6. **Hackathon deadline**: When does this need to be submitted?
7. **Prize track confirmation**: Is "Railtracks by Railtown AI" the specific prize we're targeting?
