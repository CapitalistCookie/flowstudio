# PLAN-W03 — TypeScript Compilation Fixes

> **Problem**: `tsc --noEmit` fails in `packages/workers/video-understanding` with unused variable error. CI would fail.
> **Goal**: `pnpm -r exec tsc --noEmit` succeeds across all packages.

---

## Known Errors

### 1. `packages/workers/video-understanding/src/worker.ts` line 9
```
error TS6133: 'DEFAULT_SAMPLE_INTERVAL_MS' is declared but its value is never read.
```

**Fix**: Remove the unused import.

---

## Process

1. Fix the known error
2. Run `pnpm -r exec tsc --noEmit` across all packages
3. Fix any additional errors found
4. Verify `frontend/` compiles (separate since it's not in workspace)

---

## Test Plan

### Acceptance Criteria:
- [ ] `pnpm -r exec tsc --noEmit` exits 0
- [ ] `cd frontend && npx tsc --noEmit` exits 0 (or has only pre-existing non-blocking warnings)
- [ ] No `@ts-ignore` or `@ts-expect-error` added to suppress real issues
