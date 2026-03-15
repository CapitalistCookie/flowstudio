# PLAN-X15 — Create Signal-Fetcher Service

> **Problem**: Workers write signals to both STDB (via `writeSignal` reducer) and GCS (as JSON files under `projects/{projectId}/signals/`). The gateway's `/api/v1/generate-edits` endpoint expects signals in the request body. There is no service that:
> 1. Reads signals from STDB for a given project
> 2. Groups them by signal type
> 3. Formats them for the gateway
>
> The two flows (worker pipeline → STDB signals, and chat agent → gateway) are completely disconnected.
>
> **Impact**: The "auto edit" flow (upload → workers → AI planning) can never work. Workers produce signals but nothing feeds them to the gateway for intent/narrative/edit planning.

---

## Acceptance Criteria

- [ ] New API route `/api/signals/[projectId]` fetches all signals from STDB for a project
- [ ] Signals are grouped by `signalType` into the format the gateway expects: `{ speech_segments, scene_descriptions, ui_transitions, interaction_clusters }`
- [ ] Each signal includes its payload (parsed from JSON string), `timestampMs`, `durationMs`, `confidence`
- [ ] A test verifies the grouping and formatting logic
- [ ] The formatted output matches `GenerateEditsRequest.signals` schema

---

## Tests to Write FIRST

### `frontend/__tests__/signal-fetcher.test.ts`

```typescript
describe('signal-fetcher', () => {
  it('groups STDB signals by type', () => {
    const rawSignals = [
      { signalType: 'SPEECH_SEGMENT', timestampMs: 0, durationMs: 2000, confidence: 0.95, payload: '{"text":"hello"}' },
      { signalType: 'SCENE_CHANGE', timestampMs: 1000, durationMs: 0, confidence: 0.8, payload: '{"description":"coding"}' },
      { signalType: 'UI_TRANSITION', timestampMs: 2000, durationMs: 500, confidence: 0.7, payload: '{"fromElement":"editor","toElement":"terminal"}' },
      { signalType: 'INTERACTION_CLUSTER', timestampMs: 0, durationMs: 5000, confidence: 0.6, payload: '{"clusterType":"typing"}' },
    ];

    const grouped = groupSignalsForGateway(rawSignals);

    expect(grouped.speech_segments).toHaveLength(1);
    expect(grouped.speech_segments[0].text).toBe('hello');
    expect(grouped.scene_descriptions).toHaveLength(1);
    expect(grouped.ui_transitions).toHaveLength(1);
    expect(grouped.interaction_clusters).toHaveLength(1);
  });

  it('maps STDB signal types to gateway field names', () => {
    const mapping = {
      'SPEECH_SEGMENT': 'speech_segments',
      'SCENE_CHANGE': 'scene_descriptions',
      'UI_TRANSITION': 'ui_transitions',
      'INTERACTION_CLUSTER': 'interaction_clusters',
    };
    for (const [stdbType, gatewayField] of Object.entries(mapping)) {
      expect(signalTypeToGatewayField(stdbType)).toBe(gatewayField);
    }
  });

  it('parses signal payloads from JSON strings', () => {
    const signal = { payload: '{"text":"hello","timestampMs":0}' };
    const parsed = parseSignalPayload(signal);
    expect(parsed.text).toBe('hello');
  });

  it('returns empty arrays for signal types with no data', () => {
    const grouped = groupSignalsForGateway([]);
    expect(grouped.speech_segments).toEqual([]);
    expect(grouped.scene_descriptions).toEqual([]);
    expect(grouped.ui_transitions).toEqual([]);
    expect(grouped.interaction_clusters).toEqual([]);
  });
});
```

---

## Implementation

### Step 1: Create `frontend/lib/services/signal-fetcher.ts`

```typescript
import { queryTable } from '../stdb/connection';

export interface GatewaySignals {
  speech_segments: Record<string, unknown>[];
  scene_descriptions: Record<string, unknown>[];
  ui_transitions: Record<string, unknown>[];
  interaction_clusters: Record<string, unknown>[];
}

const SIGNAL_TYPE_MAP: Record<string, keyof GatewaySignals> = {
  SPEECH_SEGMENT: 'speech_segments',
  SCENE_CHANGE: 'scene_descriptions',
  UI_TRANSITION: 'ui_transitions',
  INTERACTION_CLUSTER: 'interaction_clusters',
};

export function groupSignalsForGateway(
  rawSignals: Array<{ signalType: string; payload: string; timestampMs: number; durationMs: number; confidence: number }>
): GatewaySignals {
  const result: GatewaySignals = {
    speech_segments: [],
    scene_descriptions: [],
    ui_transitions: [],
    interaction_clusters: [],
  };

  for (const signal of rawSignals) {
    const field = SIGNAL_TYPE_MAP[signal.signalType];
    if (!field) continue;

    try {
      const payload = JSON.parse(signal.payload);
      result[field].push({
        ...payload,
        timestampMs: signal.timestampMs,
        durationMs: signal.durationMs,
        confidence: signal.confidence,
      });
    } catch {}
  }

  return result;
}

export async function fetchProjectSignals(projectId: string): Promise<GatewaySignals> {
  // Query STDB for all signals for this project
  // Filter by projectId (STDB SQL supports WHERE)
  const allSignals = await queryTable('signals');
  const projectSignals = allSignals.filter(s => s.projectId === projectId);
  return groupSignalsForGateway(projectSignals as any);
}
```

### Step 2: Create API route `frontend/app/api/signals/[projectId]/route.ts`

Authenticated endpoint that calls `fetchProjectSignals` and returns the grouped signals.

---

## Dependencies

- X-01 (STDB calls must work — `queryTable` uses SQL endpoint)
- X-18 (STDB connection must be initialized)
