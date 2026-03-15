# PLAN-X11 — Pipeline-Trigger → STDB → Worker Chain Test

> **Problem**: The pipeline trigger creates tasks in STDB, workers claim and complete them, and `completeTask` chains downstream tasks. But nobody has tested this full chain with real data shapes. We don't know if:
> 1. The initial task creation succeeds
> 2. Workers can claim the created tasks
> 3. `completeTask` properly chains downstream tasks
> 4. The `inputAssetIds` passed to downstream tasks are correct
>
> **Goal**: A contract test that simulates the full task chain with the actual STDB reducer logic.

---

## Acceptance Criteria

- [ ] Test simulates: triggerPipeline → creates 4 initial tasks
- [ ] Test verifies: each initial task has correct `taskType` and `inputAssetIds`
- [ ] Test simulates: worker claims task → processes → completeTask
- [ ] Test verifies: downstream tasks are created by `completeTask` with correct dependencies
- [ ] Test verifies: INTENT_GRAPH task is only created after ALL 4 dependencies complete
- [ ] Test verifies: TIMELINE_BUILD is the terminal node (no downstream created)
- [ ] Test traces: full chain from AUDIO_EXTRACT to TIMELINE_BUILD

---

## Tests to Write FIRST

### `packages/shared/__tests__/pipeline-chain-simulation.test.ts`

```typescript
describe('Pipeline chain simulation', () => {
  it('initial tasks match INITIAL_TASK_TYPES', () => {
    const initialTypes = ['AUDIO_EXTRACT', 'VIDEO_SAMPLE', 'CURSOR_PROCESS', 'TYPING_DETECT'];
    // Simulate triggerPipeline's createTask calls
    // Verify each task gets created with the correct type
  });

  it('SPEECH_TRANSCRIPTION is created when AUDIO_EXTRACT completes', () => {
    // Simulate: completeTask({ taskId: audioTask, outputAssetIds: '["audio-p1"]' })
    // Verify: SPEECH_TRANSCRIPTION task exists with inputAssetIds: ["audio-p1"]
  });

  it('INTENT_GRAPH waits for all 4 dependencies', () => {
    // Complete SPEECH_TRANSCRIPTION, VIDEO_UNDERSTANDING, UI_CHANGE_DETECT
    // Verify INTENT_GRAPH NOT created yet (INTERACTION_PATTERN not done)
    // Complete INTERACTION_PATTERN
    // Verify INTENT_GRAPH IS created with all upstream asset IDs
  });

  it('TIMELINE_BUILD has no downstream tasks', () => {
    // Complete the full chain up to TIMELINE_BUILD
    // Verify no new tasks are created
    // Verify project state is 'ready'
  });

  it('inputAssetIds accumulates outputs from ALL dependencies', () => {
    // INTENT_GRAPH depends on 4 tasks
    // Its inputAssetIds should contain outputs from all 4
  });
});
```

---

## Implementation

This test simulates the STDB reducers in-memory (since we can't import the STDB module directly in vitest). It uses the shared `TASK_CHAIN_DAG` and `TASK_DEPENDENCIES` constants to verify the chaining logic.

---

## Dependencies

- X-01 (call format — needed for real STDB testing)
- Uses `packages/shared/src/constants.ts` (DAG and dependencies)
