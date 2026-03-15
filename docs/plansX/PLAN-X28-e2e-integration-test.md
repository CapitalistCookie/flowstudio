# PLAN-X28 — Full End-to-End Integration Test

> **Problem**: No automated test verifies the complete flow from upload to export. We have unit tests that mock everything and contract tests that verify shapes, but nothing tests the actual data flowing through the real system.
>
> **Goal**: A scripted E2E test that exercises the entire pipeline and verifies human-readable outputs at each step.

---

## Acceptance Criteria

- [ ] Test script exercises: upload → pipeline trigger → (simulated) worker completion → signal fetch → gateway generate-edits → edit plan → timeline clips → export
- [ ] Each step's output is logged in a human-readable format
- [ ] Each step's output is validated against the expected schema
- [ ] The test can run with mocked external services (no GCS, no Deepgram, no Gemini)
- [ ] The test can also run with real services when env vars are provided
- [ ] Test produces a summary report at the end

---

## Test Scenario

### `packages/shared/__tests__/e2e-pipeline.test.ts`

```typescript
describe('E2E Pipeline Simulation', () => {
  // Simulates the full pipeline without real services
  // Uses the actual shared logic, STDB reducer args, and conversion functions

  it('Step 1: triggerPipeline creates correct STDB calls', () => {
    // Verify: 1 createAsset call + 4 createTask calls + 1 updateProjectState call
    // Verify: each call has the correct arg shape and serializes to JSON array
  });

  it('Step 2: workers produce signals in expected format', () => {
    // Simulate worker output: signals with correct signalType and payload
    // Verify: signals can be grouped by groupSignalsForGateway()
  });

  it('Step 3: gateway receives signals and produces edit plan', () => {
    // Use a mock LLM that returns a valid JSON array of EditDecisions
    // Verify: response matches FlowRunResponse schema
  });

  it('Step 4: edit plan converts to timeline clips', () => {
    // Convert EditDecision[] to TimelineClip[]
    // Verify: clips have correct positions, AI metadata
  });

  it('Step 5: timeline clips serialize and deserialize', () => {
    // Save → load round-trip preserves all fields
  });

  it('Step 6: reprompt with feedback produces revised plan', () => {
    // Send previous plan + "zoom in at 0:50" feedback
    // Verify: response has edit_plan with zoom edit near 50000ms
  });
});
```

### `scripts/e2e-smoke-test.sh`

A shell script that:
1. Starts STDB locally
2. Publishes the module
3. Starts the gateway
4. Creates a project via HTTP
5. Triggers a pipeline
6. Simulates worker completions
7. Calls generate-edits
8. Verifies the edit plan
9. Calls reprompt
10. Verifies the revised plan

```bash
#!/bin/bash
set -euo pipefail

echo "🔧 Starting E2E smoke test..."

# 1. Check STDB
echo "1. Checking SpacetimeDB..."
curl -sf http://localhost:3000/v1/database/flowstudio/schema > /dev/null || {
  echo "❌ STDB not running. Start with: spacetime start"
  exit 1
}

# 2. Create project
echo "2. Creating project..."
curl -sf -X POST http://localhost:3000/v1/database/flowstudio/call/create_project \
  -H 'Content-Type: application/json' \
  -d '["Smoke Test", "test-user", "{}"]'

# 3. Verify project
echo "3. Verifying project..."
PROJECTS=$(curl -sf -X POST http://localhost:3000/v1/database/flowstudio/sql \
  -H 'Content-Type: text/plain' \
  -d 'SELECT * FROM projects')
echo "   Projects: $PROJECTS"

# ... etc
```

---

## Dependencies

- All X-01 through X-27 (this is the final verification)
- Can be partially run earlier by mocking later stages
