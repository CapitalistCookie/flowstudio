# PLAN-19: Infrastructure Validation

**Objective:** Verify Terraform configs, Docker builds, and deployment scripts.

---

## Test Cases

### T19.1 — Terraform Validate
```bash
cd infra/terraform && terraform validate
# Must pass with zero errors
```

### T19.2 — Terraform Plan (Dry Run)
```bash
cd infra/terraform && terraform plan -input=false
# Review planned resources, verify no unexpected destroys
```

### T19.3 — Dockerfile.worker Builds
```bash
# Build a test worker image (no push)
docker build -f infra/docker/Dockerfile.worker \
  --build-arg WORKER_NAME=audio-extract \
  --build-arg NEEDS_FFMPEG=true \
  -t test-worker .
# Must complete without errors
```

### T19.4 — Dockerfile.client Builds
```bash
docker build -f infra/docker/Dockerfile.client \
  --build-arg NEXT_PUBLIC_STDB_HOST=wss://test \
  --build-arg NEXT_PUBLIC_STDB_MODULE=test \
  --build-arg NEXT_PUBLIC_UPLOAD_FUNCTION_URL=https://test \
  -t test-client .
# Must complete without errors
```

### T19.5 — FFmpeg Worker Detection
```bash
# Verify FFMPEG_WORKERS variable in build-and-push.sh
grep 'FFMPEG_WORKERS' infra/scripts/build-and-push.sh
# Should list: audio-extract, video-sample, render
```

### T19.6 — Deploy Script Executable
```bash
ls -la infra/scripts/*.sh
# All .sh files should have execute permission
```

### T19.7 — Environment Variable Completeness
```bash
# Every env var referenced in code should be in .env.example
diff <(grep -roh 'process\.env\.\w*' packages/ | sort -u) \
     <(grep -oh '^\w*=' .env.example | tr -d '=' | sort -u)
```

---

## Success Criteria
- `terraform validate` passes
- Both Dockerfiles build successfully
- All required env vars documented in `.env.example`
- Deploy scripts have correct permissions
