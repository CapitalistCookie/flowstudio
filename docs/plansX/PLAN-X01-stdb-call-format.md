# PLAN-X01 — Fix STDB HTTP Call Format

> **Problem**: `callReducer` in both frontend (`lib/stdb/connection.ts:50`) and workers (`workers/shared/src/stdb-client.ts:50`) sends `JSON.stringify(args)` where `args` is a `Record<string, unknown>` (a JSON object). But the SpacetimeDB HTTP API docs state: **"Data: A JSON array of arguments to the reducer."** Every reducer call silently fails or returns an error.
>
> **Impact**: Nothing in the entire app can write to SpacetimeDB. No project creation, no task creation, no signal writing, no asset creation. The backend is completely non-functional.

---

## Acceptance Criteria

- [ ] Frontend `callReducer` sends a JSON **array** of positional arguments
- [ ] Worker `StdbClient.callReducer` sends a JSON **array** of positional arguments
- [ ] A test verifies the serialization format against the STDB API spec
- [ ] The parameter order matches the reducer definition order in `stdb-module/src/index.ts`

---

## Tests to Write FIRST

### `packages/shared/__tests__/stdb-call-format.test.ts`

```typescript
describe('STDB HTTP call format', () => {
  it('createProject args serialize to positional array', () => {
    const args = { name: 'Test', ownerId: 'user-1', metadata: '{}' };
    const serialized = serializeReducerArgs('createProject', args);
    expect(JSON.parse(serialized)).toEqual(['Test', 'user-1', '{}']);
  });

  it('createAsset args serialize with correct u64 handling', () => {
    const args = { projectId: 'p1', assetType: 'source_video', gcsPath: 'gs://...', sizeBytes: 1024, mimeType: 'video/webm', durationMs: 30000, metadata: '{}' };
    const serialized = serializeReducerArgs('createAsset', args);
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveLength(7);
    expect(parsed[0]).toBe('p1');
    expect(parsed[5]).toBe(30000); // durationMs in correct position
  });

  it('createTask args have inputAssetIds as string in correct position', () => {
    const args = { projectId: 'p1', taskType: 'AUDIO_EXTRACT', inputAssetIds: '["video.webm"]', config: '{}', maxRetries: 3 };
    const serialized = serializeReducerArgs('createTask', args);
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(['p1', 'AUDIO_EXTRACT', '["video.webm"]', '{}', 3]);
  });

  it('writeSignal args include all 7 fields in order', () => {
    const args = { projectId: 'p1', taskId: 't1', signalType: 'SPEECH_SEGMENT', timestampMs: 5000, durationMs: 2000, confidence: 0.95, payload: '{"text":"hello"}' };
    const serialized = serializeReducerArgs('writeSignal', args);
    const parsed = JSON.parse(serialized);
    expect(parsed).toEqual(['p1', 't1', 'SPEECH_SEGMENT', 5000, 2000, 0.95, '{"text":"hello"}']);
  });
});
```

---

## Implementation

### Step 1: Create STDB reducer schema registry

Create `packages/shared/src/stdb-reducers.ts` — a single source of truth for reducer parameter names and their order:

```typescript
export const REDUCER_PARAMS: Record<string, string[]> = {
  createProject: ['name', 'ownerId', 'metadata'],
  createAsset: ['projectId', 'assetType', 'gcsPath', 'sizeBytes', 'mimeType', 'durationMs', 'metadata'],
  createTask: ['projectId', 'taskType', 'inputAssetIds', 'config', 'maxRetries'],
  claimTask: ['taskId', 'workerId'],
  findAndClaimTask: ['taskType', 'workerId'],
  completeTask: ['taskId', 'outputAssetIds'],
  failTask: ['taskId', 'failureReason'],
  writeSignal: ['projectId', 'taskId', 'signalType', 'timestampMs', 'durationMs', 'confidence', 'payload'],
  ingestInteractionBatch: ['projectId', 'taskId', 'signalType', 'batchJson'],
  updateProjectState: ['projectId', 'currentPhase', 'status'],
  updateWorkerConfig: ['workerId', 'workerType', 'isActive', 'concurrency', 'metadata'],
  toggleProjectStar: ['projectId'],
  createFolder: ['name', 'ownerId', 'color', 'sortOrder'],
  renameFolder: ['folderId', 'name'],
  deleteFolder: ['folderId'],
  moveProjectToFolder: ['projectId', 'folderId'],
};

export function serializeReducerArgs(reducerName: string, args: Record<string, unknown>): string {
  const params = REDUCER_PARAMS[reducerName];
  if (!params) throw new Error(`Unknown reducer: ${reducerName}`);
  return JSON.stringify(params.map(p => args[p]));
}

export function reducerToSnakeCase(name: string): string {
  return name.replace(/[A-Z]/g, c => '_' + c.toLowerCase()).replace(/^_/, '');
}
```

### Step 2: Update frontend `callReducer`

```typescript
// frontend/lib/stdb/connection.ts
import { serializeReducerArgs, reducerToSnakeCase } from './stdb-reducers'; // or inline

export async function callReducer(name: string, args: Record<string, unknown>): Promise<void> {
  const snakeName = reducerToSnakeCase(name);
  const url = `${HTTP_HOST}/v1/database/${DB_NAME}/call/${snakeName}`;
  const body = serializeReducerArgs(name, args);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  // ...
}
```

### Step 3: Update worker `StdbClient.callReducer`

Same change in `packages/workers/shared/src/stdb-client.ts`.

### Step 4: Update all tests that mock `callReducer` to verify the array format

---

## Verification

1. Run the new contract tests: `npx vitest run stdb-call-format`
2. Start STDB locally: `spacetime start`
3. Publish the module: `spacetime publish --project-path packages/stdb-module flowstudio`
4. Manually call `createProject` from the frontend and verify it appears in STDB: `spacetime sql flowstudio "SELECT * FROM projects"`

---

## Dependencies

- None (this is the highest priority — blocks everything)

## Blocked By This

- X-04 (createAsset durationMs)
- X-08 (STDB integration test)
- X-11 (pipeline chain test)
- X-18 (STDB connection lifecycle)
- X-19 (project creation in STDB)
- Every worker's STDB communication
