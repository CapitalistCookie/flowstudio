# PLAN-X16 — Wire use-agent.ts to Real Project Signals

> **Problem**: `frontend/lib/agent/use-agent.ts` currently sends fake signals when generating the initial edit plan:
> ```typescript
> signals: {
>   speech_segments: [{ text: userMessage, timestampMs: 0 }],
>   scene_descriptions: [],
>   ui_transitions: [],
>   interaction_clusters: [],
> }
> ```
> This means the AI agent only sees the user's text prompt, not the actual signals produced by workers (audio transcription, video analysis, UI changes, interaction patterns).
>
> **Impact**: The "Auto Edit" feature produces generic edits based on a single text prompt, not intelligent edits based on what actually happened in the recording.

---

## Acceptance Criteria

- [ ] When `use-agent.ts` has a `projectId` and the project has real signals, it fetches them from STDB
- [ ] Real signals are sent to the gateway's `generate-edits` endpoint
- [ ] When no real signals are available, falls back to the text-prompt-as-signal behavior
- [ ] The first message includes both user text AND real signals
- [ ] A test verifies real signals are sent when available

---

## Design

### Two Modes

1. **Pipeline-driven** (project has workers running):
   - After workers complete, signals exist in STDB
   - `use-agent.ts` fetches them via `fetchProjectSignals(projectId)`
   - Sends real signals + user text to gateway

2. **Chat-driven** (user opens studio without recording):
   - No pipeline, no signals in STDB
   - Falls back to current behavior: user text as speech_segment

### Detection

Check if the project has signals in STDB:
```typescript
const signals = await fetchProjectSignals(projectId);
const hasRealSignals = Object.values(signals).some(arr => arr.length > 0);
```

---

## Implementation

### Step 1: Import and use signal-fetcher in `use-agent.ts`

```typescript
import { fetchProjectSignals } from '../services/signal-fetcher';

// In submitMessage:
let signals;
if (projectIdRef.current) {
  try {
    signals = await fetchProjectSignals(projectIdRef.current);
    const hasRealSignals = Object.values(signals).some(arr => arr.length > 0);
    if (!hasRealSignals) {
      signals = null; // Fall back to text-only
    }
  } catch {
    signals = null;
  }
}

if (!signals) {
  signals = {
    speech_segments: [{ text: userMessage, timestampMs: 0 }],
    scene_descriptions: [],
    ui_transitions: [],
    interaction_clusters: [],
  };
} else {
  // Prepend user message as context
  signals.speech_segments.unshift({ text: userMessage, timestampMs: 0, isUserPrompt: true });
}
```

---

## Dependencies

- X-15 (signal-fetcher must exist)
- X-01 (STDB queries must work)
- X-18 (STDB must be connected)
