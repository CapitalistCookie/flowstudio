# Worker Deployment Handoff — Execute This

## Context

The FlowStudio pipeline is fully functional: frontend uploads recordings, creates STDB tasks (AUDIO_EXTRACT, VIDEO_SAMPLE, CURSOR_PROCESS, TYPING_DETECT), and sets project state to "processing". But all 13 Cloud Run worker services are pointing at the OLD `flowstudio` STDB database and have `minScale=0` so they never start. They need two fixes:

1. Update `STDB_MODULE` env var from `flowstudio` → `flowstudio2` on all 13 workers
2. Set `minScale=1` on all 13 workers so they stay alive and poll for tasks

Workers connect via WebSocket to STDB, subscribe to task table changes, and claim pending tasks. With `minScale=0` they never boot because there's no inbound HTTP to trigger them.

## What NOT to do

- Do NOT rebuild Docker images. The existing images are fine — only the runtime env vars need changing.
- Do NOT touch the frontend, STDB module, or Cloud Function — those are already deployed and working.
- Do NOT change the STDB_INTERNAL_HOST (10.128.0.2) — that's the VPC internal IP and is correct.

## Execution

### Step 1: Update all 13 workers (single loop)

Run this to update STDB_MODULE and set minScale=1 on every worker:

```bash
cd /home/user/projects/flowstudio

WORKERS=(
  audio-extract video-sample cursor-processor typing-detector
  speech-transcription video-understanding ui-change-detector interaction-pattern
  intent-graph narrative-planner edit-planner timeline-builder render
)

for worker in "${WORKERS[@]}"; do
  echo "=== Updating flowstudio-${worker} ==="
  gcloud run services update "flowstudio-${worker}" \
    --project lyrical-epigram-484715-v6 \
    --region us-east4 \
    --update-env-vars STDB_MODULE=flowstudio2 \
    --min-instances 1 \
    --quiet &
done

# Wait for all parallel deploys
wait
echo "=== All workers updated ==="
```

### Step 2: Verify workers are connecting to STDB

Wait ~60 seconds for instances to boot, then check STDB logs:

```bash
spacetime logs flowstudio2 -s http://34.150.131.25:3000 2>&1 | grep -E "registerWorkerIdentity|Client connected|claimTask|createTask" | tail -30
```

You should see:
- `[FlowStudio] Client connected: ...` (13 worker connections)
- `[registerWorkerIdentity] sender=... workerId=...` (13 registrations)
- `[claimTask]` or `[findAndClaimTask]` entries as workers pick up pending tasks

### Step 3: Check if pending tasks are being claimed

```bash
curl -s http://34.150.131.25:3000/v1/database/flowstudio2/sql \
  -H 'Content-Type: text/plain' \
  -d 'SELECT id, task_type, status, worker_id FROM tasks' 2>&1 | python3 -c "
import sys, json
data = json.load(sys.stdin)
schema = data[0]['schema']['elements']
cols = [e['name']['some'] for e in schema]
print('Columns:', cols)
for row in data[0].get('rows', []):
    print(dict(zip(cols, row)))
"
```

Tasks should transition from `pending` → `claimed` → `completed` as workers process them.

### Step 4: Verify health endpoints

```bash
for worker in audio-extract video-sample cursor-processor typing-detector; do
  url="https://flowstudio-${worker}-s2vq7emwcq-uk.a.run.app/health"
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  echo "${worker}: ${status}"
done
```

All should return 200.

## Architecture Notes

- **Workers use WebSocket** to STDB, NOT HTTP polling to Cloud Run. The health server on port 8080 is just for Cloud Run's startup probe.
- **Task DAG auto-chains**: when a worker completes a task via `completeTask` reducer, STDB automatically creates downstream tasks (e.g., AUDIO_EXTRACT completion creates SPEECH_TRANSCRIPTION).
- **Watchdog**: STDB runs a watchdog every 30s that reclaims tasks stuck in `claimed` state for >5 minutes.
- **API keys**: Workers that need external APIs (Deepgram, Google AI, Vertex) get secrets injected via Secret Manager — these are already configured in the existing Cloud Run services.
- **STDB_WORKER_SECRET**: Already mounted from Secret Manager (`flowstudio-stdb-worker-secret`). Workers use this to authenticate via `registerWorkerIdentity` reducer.

## Cost Note

Setting `minScale=1` on all 13 workers means 13 always-on Cloud Run instances. At the configured resource limits (1 CPU / 1Gi for light workers, 2 CPU / 2Gi for heavy), this will cost roughly $150-300/month. If cost is a concern, you can set only the 4 initial workers (audio-extract, video-sample, cursor-processor, typing-detector) to `minScale=1` and leave the rest at 0 — they'll get woken up by Cloud Scheduler or a custom trigger when downstream tasks are created.
