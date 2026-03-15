# PLAN-X00 — Master Verification & Integration Plan

> **Goal**: Every component talks to every other component correctly. Human-verifiable inputs and outputs at every boundary.
> **Method**: Test-driven. Write the contract test first, watch it fail, fix the code, watch it pass.
> **Motto**: "If you can't see it work in a test, it doesn't work."

---

## Reality Check (March 14, 2026)

### What the W-plans claimed to fix vs what's actually broken

| Claim | Reality |
|-------|---------|
| 647/647 tests pass | Tests pass but they mock everything — no real integration tested |
| Frontend merged with STDB | `callReducer` sends JSON **object** but STDB expects JSON **array** — every reducer call fails |
| Gateway uses Railtracks | Yes, but validation.py checks **snake_case** fields while LLM outputs **camelCase** — validation always fails |
| Reprompt loop works | `use-agent.ts` sends fake signals (user message as speech_segment), never real pipeline signals |
| Upload triggers pipeline | `createAsset` omits required `durationMs`; `inputAssetIds` sends GCS paths, not asset IDs |
| Edit plan → timeline | Converter is correct, but nothing feeds real edit plans into it |
| Export works | Client-side canvas export works for manual clips; AI clips never actually arrive |

### Critical Bugs Found

| # | Bug | Impact | Where |
|---|-----|--------|-------|
| 1 | **STDB callReducer sends JSON object, API expects JSON array** | Every STDB call from frontend AND workers fails | `frontend/lib/stdb/connection.ts:50`, `workers/shared/src/stdb-client.ts:50` |
| 2 | **record/preview uses `useRecordingStore()` without import** | Page crashes on load | `frontend/app/record/preview/page.tsx:25` |
| 3 | **record/preview uses `projectId` without defining it** | Page crashes on load | `frontend/app/record/preview/page.tsx:39,170` |
| 4 | **validation.py checks snake_case, LLM outputs camelCase** | Validation always reports failures/warnings | `railtracks-gateway/app/agents/validation.py` |
| 5 | **createAsset called without `durationMs` top-level field** | STDB reducer will reject the call (missing required u64) | `frontend/lib/upload/pipeline-trigger.ts:35` |
| 6 | **upload-service calls Cloud Function directly, bypasses auth** | No Clerk auth on uploads; CORS issues | `frontend/lib/upload/upload-service.ts` |
| 7 | **Dockerfile.client references `claudeFrontend/`** | Docker builds fail — wrong frontend dir | `infra/docker/Dockerfile.client` |
| 8 | **Two disconnected flows** | Chat agent and worker pipeline never share data | `use-agent.ts` vs `pipeline-trigger.ts` |
| 9 | **No cursor/keyboard capture** | Workers that process these signals always get empty data | `capture-service.ts` only records video |
| 10 | **No RENDER trigger** | Pipeline stops at TIMELINE_BUILD; user can never get final video | `stdb-module DAG` |

---

## Plan Sequence

### Phase 1 — Stop the Bleeding (X-01 to X-07)
Bugs that crash the app immediately or break every data flow.

| Plan | Title | Bug # | Severity |
|------|-------|-------|----------|
| X-01 | Fix STDB HTTP call format | 1 | **P0** — blocks all STDB communication |
| X-02 | Fix record/preview page | 2, 3 | **P0** — page crashes |
| X-03 | Fix validation.py camelCase | 4 | **P0** — AI pipeline silent failures |
| X-04 | Fix createAsset durationMs | 5 | **P0** — asset creation fails |
| X-05 | Fix upload-service auth | 6 | **P1** — security + CORS |
| X-06 | Fix Dockerfile.client | 7 | **P1** — Docker builds fail |
| X-07 | Verify STDB reducer names | — | **P0** — must confirm camelCase→snake_case mapping |

### Phase 2 — Data Contract Verification (X-08 to X-12)
Write tests that verify actual data flowing between components.

| Plan | Title | Tests |
|------|-------|-------|
| X-08 | STDB call format integration test | Verify array serialization, reducer name mapping |
| X-09 | Worker GCS path contract tests | Verify worker A output path = worker B input path |
| X-10 | Gateway signal→edit contract test | Verify signal format in, edit plan format out |
| X-11 | Pipeline-trigger → STDB → worker chain test | Full task creation and claiming flow |
| X-12 | EditDecision → TimelineClip round-trip test | Verify gateway output → frontend timeline |

### Phase 3 — Fix Data Flow (X-13 to X-17)
Connect the disconnected pieces.

| Plan | Title | What it connects |
|------|-------|-----------------|
| X-13 | Fix inputAssetIds semantics | Initial tasks → workers → downstream tasks |
| X-14 | Propagate source video through DAG | Source video accessible to TIMELINE_BUILD and RENDER |
| X-15 | Create signal-fetcher service | Workers → STDB signals → gateway |
| X-16 | Wire use-agent.ts to real signals | Frontend chat → real pipeline signals → AI edits |
| X-17 | Add approveTimeline + triggerRender | Pipeline completion: TIMELINE_BUILD → user approval → RENDER |

### Phase 4 — Frontend-Backend Integration (X-18 to X-22)
Make the frontend actually talk to the backend.

| Plan | Title |
|------|-------|
| X-18 | STDB connection lifecycle (init, error, reconnect) |
| X-19 | Project creation in STDB (not just localStorage) |
| X-20 | Pipeline status tracking (poll/subscribe for task completion) |
| X-21 | Replace mock stores with STDB data |
| X-22 | Implement missing API routes |

### Phase 5 — Recording Completeness (X-23 to X-25)
Capture all signal sources during recording.

| Plan | Title |
|------|-------|
| X-23 | Cursor movement capture during recording |
| X-24 | Keyboard event capture during recording |
| X-25 | Upload cursor/keyboard data to GCS alongside video |

### Phase 6 — End-to-End (X-26 to X-28)
Final integration.

| Plan | Title |
|------|-------|
| X-26 | Wire timeline-builder output → frontend |
| X-27 | Export pipeline with real AI edits |
| X-28 | Full E2E integration test |

---

## Execution Order (Critical Path)

```
X-01 (STDB format) ──┬──→ X-07 (name verify) ──→ X-08 (STDB test)
                      │                              │
X-02 (preview fix) ──→│                              │
X-03 (validation) ────┤                              │
X-04 (durationMs) ────┤                              │
X-05 (upload auth) ───┤                              │
X-06 (Dockerfile) ────┘                              │
                                                     │
X-09 (GCS paths) ─────────→ X-13 (inputAssetIds) ──→ X-14 (source video)
X-10 (gateway) ────────────→ X-15 (signal-fetcher) ──→ X-16 (real signals)
X-11 (pipeline chain) ─────→ X-17 (approveTimeline)
X-12 (round-trip) ──────────────────────────────────────→ X-26 (timeline wire)
                                                           │
X-18 (STDB init) ──→ X-19 (project create) ──→ X-20 (status) ──→ X-21 (stores)
X-22 (API routes) ────────────────────────────────────────────────→│
X-23 (cursor) ──→ X-25 (upload signals) ──────────────────────────→│
X-24 (keyboard)──→ X-25                                            │
                                                                    ↓
                                              X-27 (export) ──→ X-28 (E2E)
```

**Parallelizable**: X-01 through X-06 are all independent. X-09, X-10, X-11, X-12 are independent. X-23 and X-24 are independent.

---

## Definition of Done

The app is done when this scenario works end-to-end:

1. User signs in (Clerk) → sees dashboard with real STDB projects
2. User clicks "New Recording" → project created in STDB
3. Screen recording starts → captures video + cursor + keyboard
4. User stops recording → preview page shows real video
5. User clicks "Auto Edit" → video uploaded to GCS, pipeline triggered
6. Workers process signals → STDB tasks complete in order
7. Gateway generates intent → narrative → edit plan
8. Edit plan appears on frontend timeline as amber AI clips
9. User says "zoom in at 0:50" → reprompt sends real signals + feedback
10. AI revises edit plan → timeline updates → version history tracked
11. User clicks Export → gets MP4 with all edits applied

Each step is verified by a test before implementation.
