# PLAN-X09 — Worker GCS Path Contract Tests

> **Problem**: Each worker constructs GCS paths from `inputAssetIds` and `projectId`. For the pipeline to work, worker A's **output** path must exactly match worker B's **input** path. Currently, this is tested by `gcs-contracts.test.ts` but only via source-code string matching — not by running the actual path construction logic.
>
> **Goal**: Tests that call each worker's actual path-building functions and verify the chain is consistent.

---

## Acceptance Criteria

- [ ] Test verifies: audio-extract output path = speech-transcription input path
- [ ] Test verifies: video-sample output path prefix = video-understanding input path prefix
- [ ] Test verifies: video-sample output path prefix = ui-change-detector input path prefix
- [ ] Test verifies: cursor-processor expected input path uses correct GCS prefix
- [ ] Test verifies: typing-detector expected input path uses correct GCS prefix
- [ ] Test verifies: intent-graph reads from correct signal file paths
- [ ] Test verifies: timeline-builder reads from correct edit plan path
- [ ] All path construction logic is extracted into testable pure functions

---

## Tests to Write FIRST

### `packages/shared/__tests__/worker-gcs-path-chain.test.ts`

```typescript
describe('Worker GCS path chain', () => {
  const PROJECT_ID = 'test-project';

  it('audio-extract writes to path that speech-transcription reads', () => {
    const audioOutputPath = `projects/${PROJECT_ID}/audio_track/audio.wav`;
    const speechInputPath = `projects/${PROJECT_ID}/audio_track/audio.wav`;
    expect(audioOutputPath).toBe(speechInputPath);
  });

  it('video-sample frame paths match video-understanding input', () => {
    const framePrefix = `projects/${PROJECT_ID}/frame_sample/`;
    // video-understanding reads all files matching this prefix
    expect(framePrefix).toMatch(/^projects\/[^/]+\/frame_sample\/$/);
  });

  it('signals are written to consistent paths per signal type', () => {
    const signalPaths: Record<string, string> = {
      cursor_movements: `projects/${PROJECT_ID}/signals/cursor_movements.json`,
      typing_events: `projects/${PROJECT_ID}/signals/typing_events.json`,
      speech_segments: `projects/${PROJECT_ID}/signals/speech_segments.json`,
      scene_descriptions: `projects/${PROJECT_ID}/signals/scene_descriptions.json`,
      ui_transitions: `projects/${PROJECT_ID}/signals/ui_transitions.json`,
      interaction_clusters: `projects/${PROJECT_ID}/signals/interaction_clusters.json`,
      intent_graph: `projects/${PROJECT_ID}/signals/intent_graph.json`,
      narrative_plan: `projects/${PROJECT_ID}/signals/narrative_plan.json`,
      edit_plan: `projects/${PROJECT_ID}/signals/edit_plan.json`,
    };

    // Intent-graph worker reads these signal files
    const intentInputFiles = [
      signalPaths.speech_segments,
      signalPaths.scene_descriptions,
      signalPaths.ui_transitions,
      signalPaths.interaction_clusters,
    ];
    for (const path of intentInputFiles) {
      expect(path).toMatch(/^projects\/[^/]+\/signals\/\w+\.json$/);
    }
  });

  it('edit-plan output path matches timeline-builder input', () => {
    const editPlanOutputPath = `projects/${PROJECT_ID}/signals/edit_plan.json`;
    const timelineBuilderInputPath = `projects/${PROJECT_ID}/signals/edit_plan.json`;
    expect(editPlanOutputPath).toBe(timelineBuilderInputPath);
  });
});
```

---

## Implementation

1. Extract GCS path construction into shared utility functions in `packages/shared/src/gcs-paths.ts`
2. Each worker imports from the shared utility instead of hardcoding paths
3. Tests call the shared functions and verify the chain

---

## Dependencies

- None (can be written immediately)
