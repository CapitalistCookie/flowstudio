# PLAN-X04 — Fix createAsset durationMs Mismatch

> **Problem**: `frontend/lib/upload/pipeline-trigger.ts:35-45` calls `createAsset` without a top-level `durationMs` field. It sends `durationMs` inside the `metadata` JSON string instead. But `stdb-module/src/index.ts:248` defines `createAsset` with `durationMs: t.u64()` as a required top-level parameter.
>
> **Impact**: The `createAsset` reducer call will fail (missing required field), preventing video assets from being registered in STDB. The entire upload pipeline is broken.

---

## Acceptance Criteria

- [ ] `triggerPipeline` sends `durationMs` as a top-level argument to `createAsset`
- [ ] The value is a number (not nested in metadata)
- [ ] A test verifies the `createAsset` call shape matches the STDB reducer definition
- [ ] `durationMs` defaults to `0` when not provided (defensive)

---

## Tests to Write FIRST

### `frontend/__tests__/pipeline-trigger-contract.test.ts`

```typescript
describe('pipeline-trigger createAsset contract', () => {
  it('sends durationMs as top-level field', () => {
    const args = buildCreateAssetArgs({
      projectId: 'p1', gcsPath: 'gs://bucket/video.webm',
      fileSize: 1024, contentType: 'video/webm', durationMs: 30000,
    });
    expect(args.durationMs).toBe(30000);
    expect(typeof args.durationMs).toBe('number');
  });

  it('durationMs defaults to 0 when not provided', () => {
    const args = buildCreateAssetArgs({
      projectId: 'p1', gcsPath: 'gs://bucket/video.webm',
      fileSize: 1024, contentType: 'video/webm',
    });
    expect(args.durationMs).toBe(0);
  });

  it('field count matches STDB reducer definition (7 fields)', () => {
    const args = buildCreateAssetArgs({ ... });
    const keys = Object.keys(args);
    expect(keys).toEqual(['projectId', 'assetType', 'gcsPath', 'sizeBytes', 'mimeType', 'durationMs', 'metadata']);
  });
});
```

---

## Implementation

### Update `frontend/lib/upload/pipeline-trigger.ts`

```typescript
await callReducer('createAsset', {
  projectId,
  assetType: 'source_video',
  gcsPath,
  sizeBytes: fileSize,
  mimeType: contentType,
  durationMs: durationMs ?? 0,          // <-- ADD THIS
  metadata: JSON.stringify({
    uploadedAt: new Date().toISOString(),
  }),
});
```

---

## Verification

1. Test passes: `npx vitest run pipeline-trigger-contract`
2. TypeScript clean: `cd frontend && npx tsc --noEmit`
3. With STDB running: call triggers without error, asset appears in `assets` table

---

## Dependencies

- X-01 (STDB call format must be fixed first, or the call fails regardless)
