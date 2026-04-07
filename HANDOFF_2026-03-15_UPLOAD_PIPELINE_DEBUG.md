# FlowStudio Upload Pipeline Debug Handoff

**Date:** 2026-03-15 12:50 UTC
**Status:** Pipeline partially working — initial stages complete, downstream failures block full processing

---

## What Was Fixed This Session

| # | Issue | Fix | Files Changed |
|---|-------|-----|---------------|
| 1 | Frontend connecting to old `flowstudio` STDB module | Rebuilt client v7 with `--build-arg NEXT_PUBLIC_STDB_MODULE=flowstudio2` | `frontend/app/record/preview/page.tsx` (added `Wand2` import) |
| 2 | Worker bindings mismatched after module republish | Rebuilt all 13 workers as v14 | `packages/workers/shared/src/base-worker.ts` (`.trim()` on secret) |
| 3 | `findAndClaimTask` PANIC on missing btree index | Added `iter()` fallback when `byTaskTypeStatus` index unavailable | `packages/stdb-module/src/index.ts` |
| 4 | `completeTask` PANIC on missing btree index | Added `getTasksByProjectId()` helper with `iter()` fallback | `packages/stdb-module/src/index.ts` |
| 5 | `timelineClips.byProjectId` PANIC | Added inline `iter()` fallback | `packages/stdb-module/src/index.ts` |
| 6 | Audio-extract crash on no-audio videos | Added `ffprobe` check, returns empty output for no-audio | `packages/workers/audio-extract/src/worker.ts` |
| 7 | Stuck `spacetimedb-update` processes eating CPU | Killed 5 stuck processes | (runtime only) |
| 8 | `build-and-push.sh` defaults to old `flowstudio` module | **NOT FIXED** — line 26 still defaults to `flowstudio` | `infra/scripts/build-and-push.sh:26` |

**Deployed versions:**
- Client: v7 (`flowstudio-client`)
- All 13 workers: v14
- STDB module: republished 3x with index fallbacks

---

## Current State (project `c2eee8dd`)

The latest upload successfully triggered the full pipeline. Task status:

| Task | Status | Worker | Notes |
|------|--------|--------|-------|
| AUDIO_EXTRACT | completed | audio-extract-mmrqxwyq | No audio stream → returned empty output |
| VIDEO_SAMPLE | completed | video-sample-mmrqxx9m | |
| CURSOR_PROCESS | completed | cursor-processor-mmrqxwx2 | |
| TYPING_DETECT | completed | typing-detector-mmrqxvpm | |
| UI_CHANGE_DETECT | completed | ui-change-detector-mmrqxx04 | |
| INTERACTION_PATTERN | completed | interaction-pattern-mmrqxx16 | |
| **SPEECH_TRANSCRIPTION** | **failed (4x)** | speech-transcription-mmrqxwob | `"No input asset ID provided"` |
| **VIDEO_UNDERSTANDING** | **failed (4x)** | video-understanding-mmrqxx32 | `gemini-1.5-flash` model not found (deprecated) |

**Pipeline is blocked here.** Downstream tasks (INTENT_GRAPH → NARRATIVE_PLAN → EDIT_PLAN → TIMELINE_BUILD → RENDER) are never created because VIDEO_UNDERSTANDING and SPEECH_TRANSCRIPTION fail.

---

## Remaining Issues to Investigate

### 1. SPEECH_TRANSCRIPTION fails: "No input asset ID provided"

**Root cause:** When audio-extract returns empty `outputAssetIds: []` (no audio), the `completeTask` DAG chains SPEECH_TRANSCRIPTION with empty `inputAssetIds`. The speech worker then throws.

**Fix options:**
- A) In `completeTask` reducer: skip creating downstream tasks when upstream output is empty
- B) In speech-transcription worker: handle empty input gracefully (complete with empty output)
- C) Both — defense in depth

**Files:**
- `packages/stdb-module/src/index.ts` — `completeTask` reducer (line ~508-558)
- `packages/workers/speech-transcription/src/worker.ts`

### 2. VIDEO_UNDERSTANDING fails: Gemini model deprecated

**Error:** `models/gemini-1.5-flash is not found for API version v1beta`

**Fix:** Update the model name to `gemini-2.0-flash` or `gemini-2.0-flash-lite`.

**Files:**
- `packages/workers/video-understanding/src/worker.ts` — find the model name string

### 3. Video doesn't appear on timeline (user's original complaint)

Even after all pipeline fixes, the user may still not see the video on the timeline because:
- The pipeline hasn't completed end-to-end (blocked by issues 1 & 2 above)
- The studio/timeline frontend may have its own issues loading assets
- Check: `frontend/app/studio/page.tsx` or similar — how does it query STDB for timeline data?

### 4. WebSocket connection instability

The STDB proxy logs show frequent `WS backend closed: 1005` disconnects (~60s intervals). This may cause:
- Lost reducer calls (fire-and-forget calls sent during disconnect window)
- The earlier project `eee0068b` had `createAsset` but no `createTask` — likely lost to a WS disconnect

**Files:**
- `frontend/lib/stdb/spacetimedb.ts` — connection/reconnect logic
- The proxy at `flowstudio-stdb-proxy` just passes through, no module rewriting

### 5. `build-and-push.sh` still defaults to old module name

Line 26: `NEXT_PUBLIC_STDB_MODULE="${NEXT_PUBLIC_STDB_MODULE:-flowstudio}"`

Should be changed to `flowstudio2` or removed (let it use the Dockerfile default).

---

## Architecture Quick Reference

### Pipeline DAG (TASK_CHAIN_DAG in stdb-module/src/index.ts)

```
AUDIO_EXTRACT ──────→ SPEECH_TRANSCRIPTION ──→ INTENT_GRAPH ─┐
VIDEO_SAMPLE ───┬──→ VIDEO_UNDERSTANDING ────────────────────┤
                └──→ UI_CHANGE_DETECT ───────────────────────┤
CURSOR_PROCESS ─┬──→ INTERACTION_PATTERN ────────────────────┤
TYPING_DETECT ──┘                                            │
                                                             ↓
                                                    NARRATIVE_PLAN
                                                         │
                                                    EDIT_PLAN
                                                         │
                                                    TIMELINE_BUILD
                                                         │
                                                    RENDER
```

### Key Services

| Service | Image | Purpose |
|---------|-------|---------|
| flowstudio-client | client:v7 | Next.js frontend |
| flowstudio-stdb-proxy | (unchanged) | WebSocket proxy to SpacetimeDB |
| flowstudio-generate-upload-url | (unchanged) | GCS signed URL generator |
| 13 workers | *:v14 | Pipeline task processors |

### SpacetimeDB

- **Host:** `http://34.150.131.25:3000` (GCE VM `flowstudio-stdb`, us-east4-c)
- **Module:** `flowstudio2`
- **CLI:** `spacetime` on dev VM, use `-s http://34.150.131.25:3000`
- **Logs:** `spacetime logs flowstudio2 -s http://34.150.131.25:3000`
- **SQL:** `spacetime sql flowstudio2 "SELECT ..." -s http://34.150.131.25:3000`

### GCP Project

- **Project:** `lyrical-epigram-484715-v6`
- **Region:** `us-east4`
- **Registry:** `us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/`
- **GCS Bucket:** `flowstudio-assets`
- **Git repo:** `https://github.com/CapitalistCookie/flowstudio` (ONLY this repo)

### Build Commands

```bash
# Worker (from repo root)
DOCKER_BUILDKIT=1 sudo docker build \
  -f infra/docker/Dockerfile.worker \
  -t us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/WORKER:vXX \
  --build-arg WORKER_NAME=WORKER \
  --build-arg NEEDS_FFMPEG=true \  # only for audio-extract, video-sample, render
  .

# Client (from repo root)
DOCKER_BUILDKIT=1 sudo docker build \
  --build-arg NEXT_PUBLIC_STDB_HOST=wss://flowstudio-stdb-proxy-s2vq7emwcq-uk.a.run.app \
  --build-arg NEXT_PUBLIC_STDB_MODULE=flowstudio2 \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCngRh7y4immJAVIWP0btzlv7f8HupWB98 \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=lyrical-epigram-484715-v6.firebaseapp.com \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=lyrical-epigram-484715-v6 \
  -f infra/docker/Dockerfile.client \
  -t us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/client:vXX \
  .

# Push
gcloud auth print-access-token | sudo docker login -u oauth2accesstoken --password-stdin us-east4-docker.pkg.dev
sudo docker push us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/SERVICE:vXX

# Deploy
gcloud run deploy flowstudio-SERVICE \
  --image=us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/SERVICE:vXX \
  --project lyrical-epigram-484715-v6 --region us-east4 --quiet

# Republish STDB module
echo 'y' | spacetime publish flowstudio2 -p packages/stdb-module -s http://34.150.131.25:3000
```

### Uncommitted Changes

Files modified but NOT committed:
- `packages/stdb-module/src/index.ts` — index fallbacks, getTasksByProjectId helper
- `packages/workers/shared/src/base-worker.ts` — `.trim()` on worker secret
- `packages/workers/audio-extract/src/worker.ts` — ffprobe no-audio check
- `frontend/app/record/preview/page.tsx` — Wand2 import

---

## Suggested Next Steps (Priority Order)

1. **Fix SPEECH_TRANSCRIPTION** — handle empty input (complete with empty output)
2. **Fix VIDEO_UNDERSTANDING** — update `gemini-1.5-flash` → `gemini-2.0-flash`
3. Rebuild + deploy those 2 workers
4. Test full pipeline end-to-end with a new upload
5. If video still doesn't appear on timeline, investigate the studio frontend's asset/timeline rendering
6. Fix `build-and-push.sh` default module name
7. Commit all changes and push to `https://github.com/CapitalistCookie/flowstudio`
