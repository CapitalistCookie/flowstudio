# PLAN-X23 — Cursor Movement Capture During Recording

> **Problem**: The `cursor-processor` worker expects cursor movement data at `projects/{projectId}/cursor_data/events.json` in GCS. But the frontend's `capture-service.ts` only records video via MediaRecorder — it doesn't capture cursor position data.
>
> The shared package has `CursorEvent` type (`capture-types.ts`): `{ x, y, timestamp, screenWidth, screenHeight, isClicking }`, plus `validateCursorEvent()` and `cursorDataGcsPath()`. But none of this is used during recording.
>
> **Impact**: `cursor-processor` worker always gets empty data. `INTERACTION_PATTERN` worker gets no cursor signals. The intent graph is less accurate without cursor movement context.

---

## Acceptance Criteria

- [ ] During screen recording, `mousemove` and `click` events are captured
- [ ] Events are stored as `CursorEvent[]` using the shared type
- [ ] Events are throttled (max 30 Hz to avoid massive data)
- [ ] Events include `timestamp` relative to recording start
- [ ] Events are stored in the capture store alongside the video blob
- [ ] A test verifies event structure matches `CursorEvent`
- [ ] A test verifies throttling (max 33ms between events)

---

## Tests to Write FIRST

### `frontend/__tests__/cursor-capture.test.ts`

```typescript
import { validateCursorEvent } from '@flowstudio/shared';

describe('cursor capture', () => {
  it('captured events match CursorEvent schema', () => {
    const event: CursorEvent = {
      x: 100, y: 200,
      timestamp: 1500,
      screenWidth: 1920, screenHeight: 1080,
      isClicking: false,
    };
    expect(validateCursorEvent(event)).toBe(true);
  });

  it('events are throttled to max 30Hz', () => {
    // Simulate rapid mouse events
    // Verify only 1 event per 33ms is captured
  });
});
```

---

## Implementation

### Create `frontend/lib/capture/cursor-capture.ts`

```typescript
import type { CursorEvent } from '@flowstudio/shared';

let events: CursorEvent[] = [];
let lastCaptureTime = 0;
let startTime = 0;
const THROTTLE_MS = 33; // ~30Hz

function handleMouseEvent(e: MouseEvent) {
  const now = performance.now();
  if (now - lastCaptureTime < THROTTLE_MS) return;
  lastCaptureTime = now;

  events.push({
    x: e.clientX,
    y: e.clientY,
    timestamp: Math.round(now - startTime),
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    isClicking: e.type === 'click' || e.type === 'mousedown',
  });
}

export function startCursorCapture(): void {
  events = [];
  startTime = performance.now();
  lastCaptureTime = 0;
  window.addEventListener('mousemove', handleMouseEvent);
  window.addEventListener('click', handleMouseEvent);
  window.addEventListener('mousedown', handleMouseEvent);
}

export function stopCursorCapture(): CursorEvent[] {
  window.removeEventListener('mousemove', handleMouseEvent);
  window.removeEventListener('click', handleMouseEvent);
  window.removeEventListener('mousedown', handleMouseEvent);
  return [...events];
}

export function getCursorEvents(): CursorEvent[] {
  return [...events];
}
```

### Wire into `capture-service.ts`

```typescript
import { startCursorCapture, stopCursorCapture } from './cursor-capture';

export function startCapture() {
  // ... existing MediaRecorder setup
  startCursorCapture();
}

export function stopCapture() {
  // ... existing MediaRecorder stop
  const cursorEvents = stopCursorCapture();
  useCaptureStore.getState().setCursorEvents(cursorEvents);
}
```

---

## Dependencies

- `@flowstudio/shared` must be importable from frontend (need to check if it's in package.json)
- X-25 (uploading captured data to GCS)
