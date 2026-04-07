# FlowStudio Session 2 Handoff

**Date:** 2026-03-15 ~13:30 UTC
**Status:** Multiple fixes deployed, one build in progress

---

## Deployed This Session

| Service | Version | Fix |
|---------|---------|-----|
| STDB module | republished 2x | 1) Fixed infinite recursion in `getTasksByProjectId` (called itself instead of index). 2) Added `renameProject` reducer |
| speech-transcription | v15 | Handle empty input gracefully — no audio → return empty output instead of throwing |
| video-understanding | v15 | Default model `gemini-1.5-flash` → `gemini-2.0-flash` (old model deprecated by Google) |
| client | v9 | Fixed GCS URL construction (strip `gs://bucket/` prefix) + made bucket public |
| client | v10 | Dark timeline track backgrounds (`oklch(0.20...)` instead of `oklch(0.97...)`) |
| client | v11 | Click-to-preview in media panel + thumbnail generation for GCS source videos + race condition fix (load source video after STDB subscription) + preserve capture blob on navigate |
| GCS bucket | — | `allUsers` → `roles/storage.objectViewer` on `flowstudio-assets` bucket |

---

## In Progress — Client v12 (NOT YET DEPLOYED)

### What it adds:
- **Project title renaming** — `renameProject` STDB reducer + `handleNameBlur()` in editor-shell calls it

### What's needed to finish:
1. The STDB module already has the `renameProject` reducer (published)
2. `frontend/lib/stdb/module_bindings/index.ts` — already has `rename_project` reducer schema added (line ~228)
3. `frontend/lib/stdb/module_bindings/rename_project_reducer.ts` — already created
4. `frontend/components/editor-shell.tsx` — `handleNameBlur()` already calls `renameProject` reducer
5. **Just needs to build and deploy:**
```bash
cd /home/user/projects/flowstudio
DOCKER_BUILDKIT=1 sudo docker build \
  --build-arg NEXT_PUBLIC_STDB_HOST=wss://flowstudio-stdb-proxy-s2vq7emwcq-uk.a.run.app \
  --build-arg NEXT_PUBLIC_STDB_MODULE=flowstudio2 \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCngRh7y4immJAVIWP0btzlv7f8HupWB98 \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=lyrical-epigram-484715-v6.firebaseapp.com \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=lyrical-epigram-484715-v6 \
  -f infra/docker/Dockerfile.client \
  -t us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/client:v12 .

sudo docker push us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/client:v12
gcloud run deploy flowstudio-client \
  --image=us-east4-docker.pkg.dev/lyrical-epigram-484715-v6/flowstudio/client:v12 \
  --project lyrical-epigram-484715-v6 --region us-east4 --allow-unauthenticated --quiet
```

### ⚠️ WARNING — Binding regeneration broke things
- DO NOT run `spacetime generate` to regenerate all bindings — it changes type names (`TimelineClipRow` → `TimelineClips`) and drops custom BTree index accessors (`byProjectId`)
- The old hand-maintained bindings in `frontend/lib/stdb/module_bindings/` were restored via `git checkout`
- Only the new `rename_project_reducer.ts` and the index.ts entry were manually added
- If the build fails on type errors, check `converters.ts` imports match the old `TimelineClipRow`/`MediaFileRow`/`EffectBlockRow` names

---

## Known Issues (Not Fixed)

### 1. AI Assistant — "Failed to fetch gateway at localhost:8000"
- **Cause:** `NEXT_PUBLIC_RAILTRACKS_URL` defaults to `http://localhost:8000`
- **Fix needed:** Deploy the Railtracks gateway (`packages/railtracks-gateway/`) as a Cloud Run service, then pass the URL as a build arg
- Not critical — AI assistant feature requires this gateway

### 2. Pipeline still blocked on failed tasks from previous uploads
- The 2 workers (speech-transcription v15, video-understanding v15) are deployed and will handle NEW uploads correctly
- Old failed tasks (project `c2eee8dd`) won't auto-retry — they exceeded max retries
- To test: create a new recording and upload it

### 3. WebSocket connection instability
- STDB proxy logs show frequent `WS backend closed: 1005` disconnects (~60s intervals)
- Can cause lost reducer calls (fire-and-forget)
- `frontend/lib/stdb/spacetimedb.ts` — connection/reconnect logic

### 4. `build-and-push.sh` STDB proxy host URL mismatch
- Line 25 has old proxy URL: `https://flowstudio-stdb-proxy-97563850419.us-east4.run.app`
- Production uses: `wss://flowstudio-stdb-proxy-s2vq7emwcq-uk.a.run.app`
- Already fixed the module name default (`flowstudio` → `flowstudio2`) on line 26

---

## Files Modified (Uncommitted)

### STDB Module
- `packages/stdb-module/src/index.ts` — `getTasksByProjectId` recursion fix, `renameProject` reducer

### Workers
- `packages/workers/speech-transcription/src/worker.ts` — graceful empty input handling
- `packages/workers/shared/src/config.ts` — `gemini-2.0-flash` default
- `packages/workers/shared/src/test-utils.ts` — updated test model name
- `packages/workers/video-understanding/__tests__/worker.test.ts` — updated test model name
- `packages/workers/audio-extract/src/worker.ts` — ffprobe no-audio check (from session 1)
- `packages/workers/shared/src/base-worker.ts` — `.trim()` on secret (from session 1)

### Frontend
- `frontend/components/editor-shell.tsx` — source video loading after subscription, GCS URL fix, thumbnail generation, `handleNameBlur` calls `renameProject`
- `frontend/components/media-panel.tsx` — click-to-preview modal, escape key handler
- `frontend/components/timeline.tsx` — dark track backgrounds
- `frontend/app/record/preview/page.tsx` — don't discard capture blob before navigation
- `frontend/lib/stdb/module_bindings/index.ts` — added `rename_project` reducer schema
- `frontend/lib/stdb/module_bindings/rename_project_reducer.ts` — new file

### Infrastructure
- `infra/scripts/build-and-push.sh` — default module `flowstudio` → `flowstudio2`

---

## Architecture Quick Reference

| Service | Image | URL |
|---------|-------|-----|
| Client | client:v11 (v12 pending) | https://flowstudio-client-97563850419.us-east4.run.app |
| STDB | VM `34.150.131.25:3000` | Module: `flowstudio2` |
| STDB Proxy | unchanged | wss://flowstudio-stdb-proxy-s2vq7emwcq-uk.a.run.app |
| 13 workers | v15 (speech+video), v14 (rest) | Cloud Run |
| GCS Bucket | `flowstudio-assets` | Public read (allUsers objectViewer) |
| GCP Project | `lyrical-epigram-484715-v6` | Region: `us-east4` |
| Git repo | `CapitalistCookie/flowstudio` | |
