# FlowStudio Deploy Hotfix Handoff — 2026-03-15 11:02 UTC

## What Was Deployed

| Component | Version | Status |
|-----------|---------|--------|
| Git commit | `c2cd806` (fix) + `243c9d9` (feature) | Pushed to main |
| STDB module | Published with snake_case reducers | Working |
| Cloud Function | gen2, us-east4 | Working |
| Client | v13 | Deployed to Cloud Run |
| Workers (13) | v13 | Deployed to Cloud Run |

## What Was Fixed

### 1. STDB Reducer Name Mismatch (FIXED)
- **Root cause**: Module defined reducers in camelCase (`"registerIdentity"`) but client bindings use snake_case (`"register_identity"`). SpacetimeDB server does NOT auto-convert.
- **Fix**: Changed all 35 reducer name strings in `packages/stdb-module/src/index.ts` to snake_case
- **Commit**: `c2cd806`

### 2. STDB SCP Nested Directory (FIXED)
- `gcloud compute scp --recurse packages/stdb-module flowstudio-stdb:/tmp/stdb-module` creates `/tmp/stdb-module/stdb-module/` (nested). First publish used old source from `/tmp/stdb-module/src/`.
- **Fix**: Published from the correct nested path. Future deploys should use `--recurse packages/stdb-module/ flowstudio-stdb:/tmp/stdb-module/` (trailing slashes) or `rm -rf /tmp/stdb-module && scp`.

### 3. Upload 403 (CASCADING — should be fixed)
- `/api/upload-url` returns 403 because `verifyProjectOwnership()` calls into STDB which was broken.
- With STDB fixed, this should resolve. **Needs verification.**

## STILL BROKEN — Issues Persisting After STDB Fix

### 1. STDB Fatal Error (STILL HAPPENING)
```
InternalError: The instance encountered a fatal error.
```
- STDB reducers work server-side (logs show `register_identity` succeeding)
- But the client JS still hits a fatal error — possibly a **client SDK version mismatch** or the STDB proxy (`flowstudio-stdb-proxy`) is returning errors
- The `7f4cf3bf82fa3475.js` chunk is the STDB client SDK code
- **Investigate**: Check if the STDB proxy Cloud Run service is correctly forwarding WebSocket connections to the VM. Check if client SDK version matches server version.

### 2. Upload 403 (STILL HAPPENING)
```
POST /api/upload-url 403 (Forbidden)
[Refine] Upload failed: Error: Failed to get upload URL: 403
```
- Route at `frontend/app/api/upload-url/route.ts` calls `verifyProjectOwnership()` which depends on STDB working
- If STDB connection is broken client-side, ownership verification fails → 403
- **Also check**: `UPLOAD_FUNCTION_URL` or `NEXT_PUBLIC_UPLOAD_FUNCTION_URL` env var on the Cloud Run client service
- Cloud function URL: `https://us-east4-lyrical-epigram-484715-v6.cloudfunctions.net/flowstudio-generate-upload-url`
- **Key file**: `frontend/lib/stdb/stdb-server.ts` — server-side STDB connection for ownership checks

### 3. STDB Reconnect Loop
- Client rapidly cycles: disconnect → connect → register_identity → fatal error → disconnect (every 6s)
- Check `frontend/components/stdb-provider.tsx` reconnect logic
- May need to check STDB proxy WebSocket support and connection parameters

### Investigation Priority
1. **STDB fatal error is the root cause** — fix this and upload 403 likely resolves
2. Check STDB proxy (`flowstudio-stdb-proxy`) Cloud Run service — is it healthy? Does it support WebSocket upgrade?
3. Check client SDK version vs server version compatibility
4. Check if `verifyProjectOwnership` in `stdb-server.ts` uses a separate server-side STDB connection (may also be broken)

## Infrastructure Notes (Learned This Session)

### Docker
- **Data root moved to `/data/docker`** (237GB SSD) — configured in `/etc/docker/daemon.json`
- Root disk was 100% full (119GB, only 517MB free) — Docker images + build cache
- `docker system prune -a -f --volumes` freed 39GB

### Parallel Builds
- `deploy-all.sh` builds sequentially — takes 15-20 min
- Parallel build (background `&` + `wait`) completes in **41 seconds** for all 14 services
- Parallel push: 44 seconds. Parallel deploy: 31 seconds.
- Pattern used:
```bash
for s in "${SERVICES[@]}"; do
  docker build ... > /tmp/build-${s}.log 2>&1 &
done
wait
```

### STDB VM Access
- **Must use `--tunnel-through-iap`** — direct SSH times out
- **Must use `--project=lyrical-epigram-484715-v6`** — defaults to wrong project
- `spacetime` binary at `~/.local/bin/spacetime` (not on PATH)
- Publish flag is `-s`/`--server`, NOT `--host`
- Schema migration: `--delete-data=on-conflict`
- Must `npm install spacetimedb` in module dir before publish

### Cloud Run Deploy
- `deploy-worker.sh` does NOT include `--project` flag — must add explicitly
- All services are in project `lyrical-epigram-484715-v6`, region `us-east4`

## Files Changed

```
packages/stdb-module/src/index.ts          # 35 reducer names: camelCase → snake_case
infra/cloud-function/generate-upload-url/   # package-lock.json regenerated (npm install)
```

## Verification Checklist

- [ ] App loads without STDB errors in console
- [ ] Create new folder works
- [ ] Create project works
- [ ] Record → "Refine in Studio" → video loads
- [ ] Upload doesn't return 403
- [ ] Edits persist across refresh (STDB persistence)
- [ ] Playhead is smooth (no jank)
- [ ] Split clip (S key) works
- [ ] Zoom-to-fit shows all clips
- [ ] "Dead time cut" label on dashboard
