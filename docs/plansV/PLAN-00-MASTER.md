# FlowStudio Backend Master Plan — PLAN-00: Codebase Analysis & Strategy

**Date:** 2026-03-14  
**Author:** Backend Lead  
**Scope:** Full backend + infrastructure audit, strategy document

---

## 1. Codebase State of Affairs

### What Exists (Built by JC via Claude Code)

A complete TypeScript pnpm monorepo (`~8,700 lines, 17 packages, 50 TypeScript source files`) with:

| Layer | Component | Status |
|-------|-----------|--------|
| **Orchestration** | SpacetimeDB v2 WASM module (7 tables, 11 reducers) | ✅ Complete, untested |
| **Shared Types** | `@flowstudio/shared` (enums, types, schemas, prompt-security, utils) | ✅ Complete, untested |
| **Worker Framework** | `@flowstudio/worker-shared` (BaseWorker, GCS client, StdbClient, Semaphore) | ✅ Complete, untested |
| **13 Pipeline Workers** | audio-extract → render (full DAG) | ✅ Code exists, untested |
| **Frontend** | Next.js dashboard + project view | ✅ Code exists (not our scope) |
| **Infrastructure** | Terraform (GCE VM, Cloud Run, GCS, VPC, secrets) | ✅ Config exists, untested |
| **Docker** | Client + Worker Dockerfiles | ✅ Code exists, untested |
| **Cloud Function** | generate-upload-url (signed GCS URLs) | ✅ Code exists, untested |
| **Test Suite** | N/A | ❌ **ZERO tests exist** |
| **Railtracks Integration** | N/A | ❌ **Not started** |
| **Cursor/Keyboard Capture** | N/A | ❌ **Known gap** |
| **Video Context (TwelveLabs alternative)** | Gemini multimodal only | ⚠️ Partial |

### Pipeline DAG (13 Steps)

```
Upload → [AUDIO_EXTRACT]  → [SPEECH_TRANSCRIPTION] ──────────┐
       → [VIDEO_SAMPLE]   → [VIDEO_UNDERSTANDING]  ──────────┤
                           → [UI_CHANGE_DETECT]     ──────────┤
       → [CURSOR_PROCESS] ──────────┐                        │
       → [TYPING_DETECT]  ──────────┤                        │
                                    ▼                        │
                           [INTERACTION_PATTERN] ─────────────┤
                                                              ▼
                                                    [INTENT_GRAPH]
                                                         │
                                                    [NARRATIVE_PLAN]
                                                         │
                                                    [EDIT_PLAN]
                                                         │
                                                    [TIMELINE_BUILD]
                                                         │
                                                      [RENDER] → ready
```

### Critical Weaknesses Identified

1. **Zero tests** — No unit, integration, or e2e tests anywhere
2. **No local dev story** — Everything assumes Cloud Run + GCE deployment
3. **Cursor/keyboard capture gap** — Workers expect data that doesn't flow in yet
4. **No Railtracks integration** — Required for the prize track
5. **Hardcoded 2s frame intervals** — video-understanding and ui-change-detector assume `i * 2000`
6. **`extractJsonArray` duplicated** in 4 worker files (should be in shared)
7. **No auth** — SpacetimeDB reducers and Cloud Function are fully open
8. **CORS wildcard `*`** on Cloud Function
9. **No video context extraction solution** — TwelveLabs was in the architecture but Gemini is used instead (partial)
10. **No re-prompt/agentic loop** — pipeline is fire-and-forget, no user re-prompting

---

## 2. Strategy: Module-by-Module, Bottom-Up, Test-Driven

### Approach

Work **bottom-up** from shared packages to individual workers, then integration:

1. **Don't touch JC's code structure** — work within the existing architecture
2. **Add tests alongside** — create `__tests__/` directories in each package
3. **Validate each worker standalone** — mock GCS, mock StdbClient, mock LLMs
4. **Build Railtracks integration as a separate FastAPI layer** — Python microservice
5. **Fill the capture gap** with a minimal cursor/keyboard data pipeline

### Priority Order (Hackathon-Optimized)

| Priority | Plans | Why |
|----------|-------|-----|
| **P0 — Must Do** | PLAN-01 through PLAN-03 (test infra + shared) | Foundation for everything |
| **P0 — Must Do** | PLAN-22 (Railtracks integration) | Required for prize track |
| **P1 — Should Do** | PLAN-04 through PLAN-16 (all workers) | Validate pipeline correctness |
| **P1 — Should Do** | PLAN-17, PLAN-18 (pipeline + WASM module) | Prove e2e flow works |
| **P2 — Nice to Have** | PLAN-19 through PLAN-21 (infra) | Deployment readiness |
| **P2 — Nice to Have** | PLAN-24 through PLAN-26 (missing capabilities) | Feature completeness |

---

## 3. Individual Plans Index

Each plan below is a self-contained document with:
- **Objective** — what we're testing/building
- **Files involved** — exact paths
- **Test cases** — specific tests with expected inputs/outputs
- **Commands to run** — exact terminal commands
- **Success criteria** — how we know it works

| Plan | Title | Scope |
|------|-------|-------|
| PLAN-01 | Shared Package Tests | `packages/shared/src/*` — enums, constants, DAG, schemas, prompt-security, utils |
| PLAN-02 | Worker-Shared Tests | `packages/workers/shared/src/*` — BaseWorker, GcsClient, StdbClient, Semaphore, Logger, Health |
| PLAN-03 | extractJsonArray Consolidation | Move from 4 worker files → `@flowstudio/shared`, test edge cases |
| PLAN-04 | audio-extract Worker | FFmpeg audio extraction, GCS upload, signal output |
| PLAN-05 | video-sample Worker | Frame sampling, scene detection, asset ID format |
| PLAN-06 | cursor-processor Worker | Cursor event segmentation, movement classification |
| PLAN-07 | typing-detector Worker | Typing burst detection, paste detection |
| PLAN-08 | speech-transcription Worker | Deepgram API integration, transcript → signals |
| PLAN-09 | video-understanding Worker | Gemini multimodal, frame batch analysis |
| PLAN-10 | ui-change-detector Worker | Frame diff, UI transition classification |
| PLAN-11 | interaction-pattern Worker | Signal clustering, intent inference |
| PLAN-12 | intent-graph Worker | Claude API, intent hierarchy, signal fusion |
| PLAN-13 | narrative-planner Worker | Claude API, narrative beats from intents |
| PLAN-14 | edit-planner Worker | Claude API, edit decisions from narrative |
| PLAN-15 | timeline-builder Worker | Edit plan → timeline JSON, video/audio tracks |
| PLAN-16 | render Worker | FFmpeg filter_complex, timeline execution |
| PLAN-17 | Pipeline DAG Integration | `completeTask` chaining, dependency resolution |
| PLAN-18 | SpacetimeDB Module | All reducers, watchdog, task state machine |
| PLAN-19 | Infrastructure Validation | Terraform, Docker builds |
| PLAN-20 | GCS Path Contracts | All 12 writer→reader pairs verification |
| PLAN-21 | Cloud Function | generate-upload-url, input sanitization |
| PLAN-22 | Railtracks FastAPI Gateway | Python agentic loop wrapping intent→edit pipeline |
| PLAN-23 | Railtracks Observability | CLI visualization of agent runs |
| PLAN-24 | Video Context Strategy | Gemini multimodal vs alternatives |
| PLAN-25 | Capture Pipeline | Browser cursor/keyboard → GCS data flow |
| PLAN-26 | Re-prompt Loop | Non-destructive edits, user feedback → re-edit |
