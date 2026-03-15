# PLAN-X24 — Keyboard Event Capture During Recording

> **Problem**: The `typing-detector` worker expects keyboard data at `projects/{projectId}/keyboard_data/events.json` in GCS. The shared package has `KeyboardEvent` type: `{ key, timestamp, isKeyDown, modifiers }`, plus `sanitizeKeyValue()` and `validateKeyboardEvent()`. But nothing captures keyboard events during recording.
>
> **Impact**: `typing-detector` always returns empty signals. Interaction patterns are incomplete.

---

## Acceptance Criteria

- [ ] During recording, `keydown` and `keyup` events are captured
- [ ] Sensitive keys are sanitized via `sanitizeKeyValue()` (no password chars)
- [ ] Events include `timestamp` relative to recording start
- [ ] Modifier state (ctrl, shift, alt, meta) is tracked
- [ ] Events stored in capture store alongside video and cursor data
- [ ] A test verifies sanitization works (password fields, credit card inputs)
- [ ] A test verifies event structure matches `KeyboardEvent`

---

## Implementation

### Create `frontend/lib/capture/keyboard-capture.ts`

Similar pattern to cursor capture. Use `sanitizeKeyValue()` from shared to avoid capturing sensitive input.

```typescript
import { sanitizeKeyValue, type KeyboardEvent as KbEvent } from '@flowstudio/shared';

let events: KbEvent[] = [];
let startTime = 0;

function handleKeyEvent(e: globalThis.KeyboardEvent) {
  events.push({
    key: sanitizeKeyValue(e.key),
    timestamp: Math.round(performance.now() - startTime),
    isKeyDown: e.type === 'keydown',
    modifiers: {
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
    },
  });
}
```

---

## Dependencies

- `@flowstudio/shared` must be importable (for `sanitizeKeyValue`)
- X-25 (uploading captured data to GCS)
