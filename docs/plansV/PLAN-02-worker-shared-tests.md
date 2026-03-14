# PLAN-02: Worker-Shared Package Tests (`@flowstudio/worker-shared`)

**Objective:** Validate BaseWorker lifecycle, GcsClient, StdbClient, Semaphore, Logger, and Health server.

**Files Under Test:**
- `packages/workers/shared/src/base-worker.ts` — BaseWorker abstract class (272 lines)
- `packages/workers/shared/src/gcs-client.ts` — GCS upload/download/exists/signed URLs
- `packages/workers/shared/src/stdb-client.ts` — HTTP-only SpacetimeDB client
- `packages/workers/shared/src/semaphore.ts` — Counting semaphore for concurrency
- `packages/workers/shared/src/health.ts` — Health check HTTP server
- `packages/workers/shared/src/config.ts` — Environment-based config loader
- `packages/workers/shared/src/logger.ts` — Structured JSON logger

**New Files to Create:**
- `packages/workers/shared/vitest.config.ts`
- `packages/workers/shared/__tests__/semaphore.test.ts`
- `packages/workers/shared/__tests__/stdb-client.test.ts`
- `packages/workers/shared/__tests__/gcs-client.test.ts`
- `packages/workers/shared/__tests__/config.test.ts`
- `packages/workers/shared/__tests__/base-worker.test.ts`
- `packages/workers/shared/__tests__/mocks.ts` — Shared mocks for all worker tests

---

## Test Cases

### T2.1 — Semaphore: Basic Acquire/Release
```typescript
test('semaphore allows up to max concurrent', async () => {
  const sem = new Semaphore(2);
  const order: number[] = [];
  const task = (id: number, delay: number) => sem.run(async () => {
    order.push(id);
    await sleep(delay);
  });
  await Promise.all([task(1, 50), task(2, 50), task(3, 10)]);
  // Tasks 1 and 2 start first (max 2), task 3 waits
  expect(order.slice(0, 2)).toEqual([1, 2]);
});
```

### T2.2 — Semaphore: Over-Release Guard
```typescript
test('semaphore throws on release without acquire', () => {
  const sem = new Semaphore(1);
  expect(() => sem.release()).toThrow('Semaphore: release without acquire');
});
```

### T2.3 — Semaphore: Concurrent Count
```typescript
test('semaphore.activeCount tracks correctly', async () => {
  const sem = new Semaphore(3);
  expect(sem.activeCount).toBe(0);
  await sem.acquire();
  expect(sem.activeCount).toBe(1);
  sem.release();
  expect(sem.activeCount).toBe(0);
});
```

### T2.4 — StdbClient: callReducer Sends Correct HTTP POST
```typescript
test('callReducer posts to correct endpoint', async () => {
  // Mock fetch, verify URL is /v1/database/{module}/call/{reducer_name}
  // Verify camelCase → snake_case conversion
  // Verify body is JSON
});
```

### T2.5 — StdbClient: queryTable Parses SQL Response
```typescript
test('queryTable sends SELECT * and parses rows', async () => {
  // Mock fetch to return SpacetimeDB SQL response format
  // Verify snake_case → camelCase column conversion
  // Verify BigInt → Number conversion
});
```

### T2.6 — GcsClient: Upload with Retry
```typescript
test('gcs upload retries 3 times on failure', async () => {
  // Mock @google-cloud/storage to fail twice, succeed on third
  // Verify upload eventually succeeds
  // Verify exponential backoff delays
});
```

### T2.7 — GcsClient: Path Cleaning
```typescript
test('gcs strips gs://bucket/ prefix from paths', () => {
  // Verify both raw paths and full GCS URIs work
  // 'projects/abc/audio.wav' and 'gs://bucket/projects/abc/audio.wav'
  // should both resolve to the same file
});
```

### T2.8 — Config: loadConfig Reads Environment
```typescript
test('loadConfig reads WORKER_NAME and generates unique workerId', () => {
  process.env.WORKER_NAME = 'audio-extract';
  process.env.STDB_INTERNAL_HOST = 'localhost';
  const config = loadConfig();
  expect(config.workerName).toBe('audio-extract');
  expect(config.workerId).toMatch(/^audio-extract-/);
});
```

### T2.9 — BaseWorker: Task Claiming Flow
```typescript
test('BaseWorker polls, claims, processes, and completes', async () => {
  // Create a TestWorker subclass with mock processTask
  // Mock StdbClient: findAndClaimTask succeeds, queryTable returns claimed task
  // Verify: processTask called → writeSignal called for each signal → completeTask called
});
```

### T2.10 — BaseWorker: Task Failure → failTask
```typescript
test('BaseWorker calls failTask when processTask throws', async () => {
  // Mock processTask to throw Error('boom')
  // Verify failTask reducer is called with the error message
});
```

### T2.11 — BaseWorker: Deduplication via processingTaskIds
```typescript
test('BaseWorker does not process same task twice', async () => {
  // Mock queryTable to return the same claimed task on two consecutive polls
  // Verify processTask is only called once
});
```

### T2.12 — Health Server
```typescript
test('health endpoint returns JSON with worker status', async () => {
  // Start health server on random port
  // GET /health
  // Verify response shape: { healthy, workerName, workerId, activeTasks, uptime }
});
```

---

## Mock Infrastructure (`__tests__/mocks.ts`)

```typescript
export class MockGcsClient {
  private store = new Map<string, Buffer>();
  
  async upload(path: string, data: Buffer): Promise<void> {
    this.store.set(this.clean(path), data);
  }
  
  async download(path: string): Promise<Buffer> {
    const data = this.store.get(this.clean(path));
    if (!data) throw new Error(`File not found: ${path}`);
    return data;
  }
  
  async exists(path: string): Promise<boolean> {
    return this.store.has(this.clean(path));
  }
  
  private clean(path: string): string {
    return path.replace(/^gs:\/\/[^/]+\//, '');
  }
}

export class MockStdbClient {
  public reducerCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  private tables: Record<string, Record<string, unknown>[]> = {};
  
  async callReducer(name: string, args: Record<string, unknown>): Promise<void> {
    this.reducerCalls.push({ name, args });
  }
  
  async queryTable(tableName: string): Promise<Record<string, unknown>[]> {
    return this.tables[tableName] ?? [];
  }
  
  setTableData(tableName: string, rows: Record<string, unknown>[]): void {
    this.tables[tableName] = rows;
  }
}
```

---

## Commands to Run

```bash
# Add vitest to worker-shared
cd /Users/vishnu/Documents/FlowStudio
pnpm --filter @flowstudio/worker-shared add -D vitest

# Run tests
pnpm --filter @flowstudio/worker-shared run test
```

## Success Criteria
- All 12 test cases pass
- Semaphore edge cases (over-release, max concurrency) verified
- StdbClient HTTP protocol verified (endpoint format, data conversion)
- BaseWorker lifecycle (poll → claim → process → complete/fail) verified
- Mock GCS and StdbClient reusable for all downstream worker tests
