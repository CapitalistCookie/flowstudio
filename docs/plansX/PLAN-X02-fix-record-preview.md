# PLAN-X02 — Fix Record/Preview Page

> **Problem**: `frontend/app/record/preview/page.tsx` has two bugs that crash the page on load:
> 1. Line 25: `const { elapsedSeconds } = useRecordingStore()` — `useRecordingStore` is never imported
> 2. Lines 39, 170: `projectId` is used but never defined — should come from `useSearchParams()`
>
> **Impact**: After recording a video, navigating to `/record/preview` crashes with a ReferenceError.

---

## Acceptance Criteria

- [ ] `useRecordingStore` import removed or replaced (it's not needed — `elapsedMs` from `useCaptureStore` is already used)
- [ ] `projectId` is extracted from search params via `useSearchParams()`
- [ ] Page renders without errors when `blobUrl` is null (no recording)
- [ ] Page renders without errors when `blobUrl` is set (has recording)
- [ ] Page renders without errors when `projectId` is missing from URL

---

## Tests to Write FIRST

### `frontend/__tests__/record-preview-page.test.ts`

```typescript
describe('RecordingPreviewPage data flow', () => {
  it('projectId comes from searchParams, not undefined', () => {
    // Verify the page component reads from useSearchParams
    // This is a compile-time check — if projectId is undefined, TS should error
  });

  it('no reference to useRecordingStore in page', () => {
    // Grep test: verify the import doesn't exist
  });
});
```

Since this is primarily a compile-time fix, the main verification is `tsc --noEmit` passing.

---

## Implementation

### Step 1: Remove `useRecordingStore` reference

Line 25 uses `useRecordingStore()` but its return value `elapsedSeconds` is never used in the rendered output (the page uses `elapsedMs` from `useCaptureStore` on line 32). Delete line 25.

### Step 2: Add `projectId` from search params

Already imported `useSearchParams` on line 4. Add after line 24:

```typescript
const searchParams = useSearchParams()
const projectId = searchParams.get("projectId")
```

### Step 3: Verify TypeScript compiles

```bash
cd frontend && npx tsc --noEmit
```

---

## Verification

1. `tsc --noEmit` passes with zero errors
2. `npx vitest run` still passes (647 tests)
3. Manual: navigate to `/record/preview` — no crash
4. Manual: navigate to `/record/preview?projectId=test-123` — upload button uses the project ID

---

## Dependencies

- None (independent frontend fix)
