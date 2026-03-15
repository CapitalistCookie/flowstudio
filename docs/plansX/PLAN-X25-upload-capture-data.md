# PLAN-X25 — Upload Cursor/Keyboard Data to GCS Alongside Video

> **Problem**: Even after X-23 and X-24 capture cursor/keyboard events, they need to be uploaded to GCS so workers can process them. Currently, only the video blob is uploaded. The upload flow must also upload:
> 1. `cursor_data/events.json` — cursor movement events
> 2. `keyboard_data/events.json` — keyboard events
>
> **Impact**: Without this, cursor-processor and typing-detector workers get empty data.

---

## Acceptance Criteria

- [ ] After recording, cursor events are uploaded to `projects/{projectId}/cursor_data/events.json`
- [ ] After recording, keyboard events are uploaded to `projects/{projectId}/keyboard_data/events.json`
- [ ] Upload uses signed URLs (same mechanism as video upload)
- [ ] Pipeline trigger passes `["events.json"]` as `inputAssetIds` for CURSOR_PROCESS and TYPING_DETECT tasks
- [ ] A test verifies the upload paths match what workers expect

---

## Implementation

### Step 1: Update `record/preview/page.tsx` upload flow

After uploading the video:

```typescript
const cursorEvents = useCaptureStore.getState().cursorEvents;
if (cursorEvents.length > 0) {
  const cursorBlob = new Blob([JSON.stringify(cursorEvents)], { type: 'application/json' });
  await uploadToGcs(projectId, 'cursor_data/events.json', cursorBlob, 'application/json');
}

const keyboardEvents = useCaptureStore.getState().keyboardEvents;
if (keyboardEvents.length > 0) {
  const kbBlob = new Blob([JSON.stringify(keyboardEvents)], { type: 'application/json' });
  await uploadToGcs(projectId, 'keyboard_data/events.json', kbBlob, 'application/json');
}
```

### Step 2: Update pipeline-trigger to pass correct inputAssetIds

```typescript
if (taskType === 'CURSOR_PROCESS') {
  inputAssetIds = cursorEvents.length > 0 ? ['events.json'] : [];
} else if (taskType === 'TYPING_DETECT') {
  inputAssetIds = keyboardEvents.length > 0 ? ['events.json'] : [];
}
```

---

## Dependencies

- X-05 (upload auth fix)
- X-13 (inputAssetIds semantics)
- X-23 (cursor capture)
- X-24 (keyboard capture)
