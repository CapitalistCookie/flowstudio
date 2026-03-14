# PLAN-17: Pipeline DAG Integration Test

**Objective:** Verify the `completeTask` reducer correctly chains downstream tasks based on the DAG.

**Scope:** Test the task chaining logic WITHOUT requiring a live SpacetimeDB instance — mock the reducer behavior.

---

## Test Cases

### T17.1 — Single-Dependency Chain
```typescript
test('AUDIO_EXTRACT completion creates SPEECH_TRANSCRIPTION', () => {
  // Complete AUDIO_EXTRACT
  // Verify: SPEECH_TRANSCRIPTION task created with AUDIO_EXTRACT's outputAssetIds as inputs
});
```

### T17.2 — Multi-Dependency Gating (INTENT_GRAPH)
```typescript
test('INTENT_GRAPH only created when ALL 4 deps complete', () => {
  // Complete SPEECH_TRANSCRIPTION → no INTENT_GRAPH yet (3 deps remaining)
  // Complete VIDEO_UNDERSTANDING → no INTENT_GRAPH yet (2 deps remaining)
  // Complete UI_CHANGE_DETECT → no INTENT_GRAPH yet (1 dep remaining)
  // Complete INTERACTION_PATTERN → INTENT_GRAPH created
});
```

### T17.3 — Duplicate Prevention
```typescript
test('does not create duplicate task if type already exists', () => {
  // Complete CURSOR_PROCESS → INTERACTION_PATTERN created
  // Complete TYPING_DETECT → INTERACTION_PATTERN should NOT be created again
});
```

### T17.4 — Output Asset Propagation
```typescript
test('downstream task inputAssetIds = union of upstream outputAssetIds', () => {
  // INTENT_GRAPH's inputs should include outputs from all 4 upstream tasks
});
```

### T17.5 — Terminal Completion (RENDER → project ready)
```typescript
test('RENDER completion sets project status to ready', () => {
  // Complete RENDER (TASK_CHAIN_DAG[RENDER] = [])
  // Verify: project_state.currentPhase = 'ready'
  // Verify: projects.status = 'ready'
});
```

### T17.6 — Full Pipeline Traversal
```typescript
test('full pipeline from AUDIO_EXTRACT to RENDER follows DAG exactly', () => {
  // Simulate all 13 tasks completing in dependency order
  // Verify: exactly 13 tasks created, no duplicates, project ends at 'ready'
});
```

### T17.7 — Partial Failure → Retry → Continue
```typescript
test('failed task with retries remaining creates new pending task', () => {
  // Fail a task with retryCount < maxRetries
  // Verify: new pending task created with retryCount + 1
});
```

### T17.8 — Terminal Failure → Project Failed
```typescript
test('max retries exhausted sets project to failed', () => {
  // Fail a task with retryCount >= maxRetries
  // Verify: project_state.currentPhase = 'failed'
});
```

---

## Approach

Since we can't run a live SpacetimeDB module for unit tests, we'll:
1. Extract the chaining logic from `packages/stdb-module/src/index.ts` into a testable pure function
2. OR: simulate the reducer behavior using in-memory state

**Option A: Pure function extraction**
```typescript
// Extract from the completeTask reducer:
function evaluateDownstreamTasks(
  completedType: string,
  allCompletedTypes: Set<string>,
  existingTypes: Set<string>,
  taskChainDag: Record<string, string[]>,
  taskDependencies: Record<string, string[]>,
): string[] { /* returns downstream types to create */ }
```

**Option B: In-memory simulation**
```typescript
class PipelineSimulator {
  tasks: Map<string, { type: string; status: string; ... }>;
  completeTask(taskId: string): void { /* replicates reducer logic */ }
  failTask(taskId: string): void { /* replicates retry logic */ }
}
```

---

## Success Criteria
- DAG chaining logic produces correct downstream tasks
- Multi-dependency gating works (INTENT_GRAPH waits for all 4)
- No duplicate tasks created
- Project transitions to 'ready' after RENDER
- Retry logic creates new tasks with incremented retryCount
