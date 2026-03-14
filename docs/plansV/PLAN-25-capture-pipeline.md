# PLAN-25: Cursor/Keyboard Capture Pipeline

**Objective:** Fill the known architectural gap — get cursor movement and keyboard events from the browser into GCS for workers to consume.

---

## Current Gap

The pipeline expects:
- **cursor-processor** reads: `projects/{id}/cursor_data/{assetId}`
- **typing-detector** reads: `projects/{id}/keyboard_data/{assetId}`

But NO code currently writes to these paths. The frontend records video but not interaction events.

## Architecture

```
Browser (capture page)
  ├── MediaRecorder → video upload → GCS (existing)
  ├── mousemove/click listener → cursor events array
  └── keydown/keyup listener → keyboard events array
         ↓
  POST to API (new endpoint) or direct GCS upload
         ↓
  GCS: projects/{id}/cursor_data/events.json
  GCS: projects/{id}/keyboard_data/events.json
         ↓
  createTask(CURSOR_PROCESS) with inputAssetId = "events.json"
  createTask(TYPING_DETECT) with inputAssetId = "events.json"
```

## Implementation

### Frontend (JavaScript — capture page)

```javascript
// Event collectors
const cursorEvents = [];
const keyboardEvents = [];

// Cursor tracking
document.addEventListener('mousemove', (e) => {
  cursorEvents.push({
    x: e.clientX, y: e.clientY,
    timestampMs: Date.now() - recordingStartTime,
    type: 'mousemove'
  });
});

document.addEventListener('click', (e) => {
  cursorEvents.push({
    x: e.clientX, y: e.clientY,
    timestampMs: Date.now() - recordingStartTime,
    type: 'click'
  });
});

// Keyboard tracking
document.addEventListener('keydown', (e) => {
  keyboardEvents.push({
    key: e.key,
    timestampMs: Date.now() - recordingStartTime,
    type: 'keydown'
  });
});

// On recording stop: upload both arrays to GCS
async function uploadInteractionData(projectId) {
  // Get signed URLs for both files
  // Upload cursor events JSON
  // Upload keyboard events JSON
  // Create task with inputAssetId = GCS path
}
```

### Backend Changes

1. **Cloud Function** — extend to support `cursor_data` and `keyboard_data` asset types
2. **Upload flow** — after video upload, also upload interaction data files
3. **Task creation** — pass correct GCS paths as inputAssetIds

## Test Cases

### T25.1 — Event Collection Format
```typescript
test('cursor events have correct shape', () => {
  // { x: number, y: number, timestampMs: number, type: 'mousemove'|'click' }
});
```

### T25.2 — Event Collection Format (Keyboard)
```typescript
test('keyboard events have correct shape', () => {
  // { key: string, timestampMs: number, type: 'keydown'|'keyup' }
});
```

### T25.3 — GCS Upload
```typescript
test('interaction data uploaded to correct GCS paths', () => {
  // cursor → projects/{id}/cursor_data/events.json
  // keyboard → projects/{id}/keyboard_data/events.json
});
```

### T25.4 — Worker Consumption
```typescript
test('cursor-processor can read the uploaded cursor data', async () => {
  // Write test cursor data to MockGCS
  // Run cursor-processor worker
  // Verify signals produced
});
```

---

## Success Criteria
- Browser captures cursor and keyboard events during recording
- Events uploaded to GCS in correct format
- cursor-processor and typing-detector workers can consume the data
- Full signal extraction pipeline works end-to-end
