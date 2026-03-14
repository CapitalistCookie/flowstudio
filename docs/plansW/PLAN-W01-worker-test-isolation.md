# PLAN-W01 — Worker Test Isolation

> **Problem**: 274/599 tests fail because `BaseWorker` constructor eagerly calls `loadConfig()`, which throws `Missing required env var: STDB_INTERNAL_HOST`.
> **Goal**: All 599 tests pass with `npx vitest run`.

---

## Root Cause

```
new SpeechTranscriptionWorker()
  → new BaseWorker()
    → this.config = loadConfig()     // ← throws if env vars missing
      → required("STDB_INTERNAL_HOST")  // ← not set in test env
```

Every worker test instantiates the worker class, which immediately demands production env vars.

---

## Solution: Lazy Config + Test Config Override

### Option A: Lazy config (preferred)
Defer `loadConfig()` until `start()` is called, not in the constructor. Tests that call `processTask()` directly never call `start()`.

### Option B: Config injection
Allow passing a config object to the constructor. Tests pass a mock config.

**Decision**: Option A — it's less invasive and tests don't need to know about config shape.

---

## Changes

### 1. `packages/workers/shared/src/base-worker.ts`

**Before**:
```typescript
constructor() {
  this.config = loadConfig();
  this.gcs = new GcsClient(this.config);
  this.stdb = new StdbClient(this.config);
}
```

**After**:
```typescript
protected config!: WorkerConfig;
protected gcs!: GcsClient;
protected stdb!: StdbClient;
private _initialized = false;

protected ensureInitialized(): void {
  if (!this._initialized) {
    this.config = loadConfig();
    this.gcs = new GcsClient(this.config);
    this.stdb = new StdbClient(this.config);
    this._initialized = true;
  }
}

async start(): Promise<void> {
  this.ensureInitialized();
  // ... existing polling loop
}
```

Workers that access `this.gcs` or `this.stdb` inside `processTask()` are fine — tests mock these anyway.

### 2. Each worker test: mock at the module level

Tests already mock GcsClient and StdbClient. The fix is just that instantiation no longer throws. No test changes needed if we do Option A correctly.

### 3. `packages/workers/shared/src/config.ts`

Add `loadConfig({ allowMissing: true })` for test environments, or just rely on the lazy init above.

---

## Test Plan (TDD)

### Tests to write FIRST (in `packages/workers/shared/__tests__/base-worker.test.ts`):

```
describe("BaseWorker initialization", () => {
  it("does not throw on construction without env vars")
  it("throws on start() when env vars are missing")
  it("initializes config, gcs, stdb on start()")
  it("processTask can be called without start() if gcs/stdb are mocked")
})
```

### Acceptance Criteria:
- [ ] `npx vitest run` → 599/599 tests pass (0 failures)
- [ ] No env vars required to run tests
- [ ] `BaseWorker.start()` still validates config at runtime
- [ ] No changes to worker `processTask()` implementations

---

## Files to Modify

| File | Change |
|------|--------|
| `packages/workers/shared/src/base-worker.ts` | Lazy init |
| `packages/workers/shared/src/config.ts` | Optional: add test mode |
| `packages/workers/shared/__tests__/base-worker.test.ts` | New: init tests |

---

## Risk

Low. The constructor → lazy init refactor is mechanical. The only risk is if any worker accesses `this.config` in the constructor — grep confirms none do.
