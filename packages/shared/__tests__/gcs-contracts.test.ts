import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const WORKERS_DIR = resolve(ROOT, 'packages/workers');

function readWorkerSource(workerName: string): string {
  return readFileSync(
    resolve(WORKERS_DIR, workerName, 'src/worker.ts'),
    'utf-8',
  );
}

function getAllWorkerNames(): string[] {
  return readdirSync(WORKERS_DIR).filter(name => {
    if (name === 'shared') return false;
    try {
      readFileSync(resolve(WORKERS_DIR, name, 'src/worker.ts'));
      return true;
    } catch {
      return false;
    }
  });
}

// ─── T20.1: All 12 GCS writer→reader path contracts ────────────────────────

describe('GCS Path Contracts', () => {

  // Contract 1-2: Upload → audio-extract, video-sample (source_video)
  test('audio-extract reads source_video/{inputAssetId}', () => {
    const src = readWorkerSource('audio-extract');
    expect(src).toContain('source_video/${inputAssetId}');
  });

  test('video-sample reads source_video/{inputAssetId}', () => {
    const src = readWorkerSource('video-sample');
    expect(src).toContain('source_video/${inputAssetId}');
  });

  // Contract 3: audio-extract → speech-transcription (audio_track)
  test('audio-extract writes audio_track/audio.wav', () => {
    const src = readWorkerSource('audio-extract');
    expect(src).toContain('audio_track/audio.wav');
  });

  test('speech-transcription reads audio_track/audio.wav', () => {
    const src = readWorkerSource('speech-transcription');
    expect(src).toContain('audio_track/audio.wav');
  });

  // Contract 4-5: video-sample → video-understanding, ui-change-detector (frame_sample)
  test('video-sample writes frame_sample/frame-NNNN.jpg', () => {
    const src = readWorkerSource('video-sample');
    expect(src).toMatch(/frame_sample\/frame-.*\.jpg/);
  });

  test('video-understanding reads frame_sample/{assetId}.jpg', () => {
    const src = readWorkerSource('video-understanding');
    expect(src).toContain('frame_sample/${assetId}.jpg');
  });

  test('ui-change-detector reads frame_sample/frame-NNNN.jpg', () => {
    const src = readWorkerSource('ui-change-detector');
    expect(src).toMatch(/frame_sample\/frame-.*\.jpg/);
  });

  // Contract 6: cursor-processor → interaction-pattern (cursor_movements)
  test('cursor-processor writes signals/cursor_movements.json', () => {
    const src = readWorkerSource('cursor-processor');
    expect(src).toContain('signals/cursor_movements.json');
  });

  test('interaction-pattern reads signals/cursor_movements.json', () => {
    const src = readWorkerSource('interaction-pattern');
    expect(src).toContain('signals/cursor_movements.json');
  });

  // Contract 7: typing-detector → interaction-pattern (typing_events)
  test('typing-detector writes signals/typing_events.json', () => {
    const src = readWorkerSource('typing-detector');
    expect(src).toContain('signals/typing_events.json');
  });

  test('interaction-pattern reads signals/typing_events.json', () => {
    const src = readWorkerSource('interaction-pattern');
    expect(src).toContain('signals/typing_events.json');
  });

  // Contract 8: speech-transcription → intent-graph (speech_segments)
  test('speech-transcription writes signals/speech_segments.json', () => {
    const src = readWorkerSource('speech-transcription');
    expect(src).toContain('signals/speech_segments.json');
  });

  test('intent-graph reads signals/speech_segments.json', () => {
    const src = readWorkerSource('intent-graph');
    expect(src).toContain('signals/speech_segments.json');
  });

  // Contract 9: video-understanding → intent-graph (scene_descriptions)
  test('video-understanding writes signals/scene_descriptions.json', () => {
    const src = readWorkerSource('video-understanding');
    expect(src).toContain('signals/scene_descriptions.json');
  });

  test('intent-graph reads signals/scene_descriptions.json', () => {
    const src = readWorkerSource('intent-graph');
    expect(src).toContain('signals/scene_descriptions.json');
  });

  // Contract 10: ui-change-detector → intent-graph (ui_transitions)
  test('ui-change-detector writes signals/ui_transitions.json', () => {
    const src = readWorkerSource('ui-change-detector');
    expect(src).toContain('signals/ui_transitions.json');
  });

  test('intent-graph reads signals/ui_transitions.json', () => {
    const src = readWorkerSource('intent-graph');
    expect(src).toContain('signals/ui_transitions.json');
  });

  // Contract 11: interaction-pattern → intent-graph (interaction_clusters)
  test('interaction-pattern writes signals/interaction_clusters.json', () => {
    const src = readWorkerSource('interaction-pattern');
    expect(src).toContain('signals/interaction_clusters.json');
  });

  test('intent-graph reads signals/interaction_clusters.json', () => {
    const src = readWorkerSource('intent-graph');
    expect(src).toContain('signals/interaction_clusters.json');
  });

  // Contract: intent-graph → narrative-planner
  test('intent-graph writes signals/intent_graph.json', () => {
    const src = readWorkerSource('intent-graph');
    expect(src).toContain('signals/intent_graph.json');
  });

  test('narrative-planner reads signals/intent_graph.json', () => {
    const src = readWorkerSource('narrative-planner');
    expect(src).toContain('signals/intent_graph.json');
  });

  // Contract: narrative-planner → edit-planner
  test('narrative-planner writes signals/narrative_plan.json', () => {
    const src = readWorkerSource('narrative-planner');
    expect(src).toContain('signals/narrative_plan.json');
  });

  test('edit-planner reads signals/narrative_plan.json', () => {
    const src = readWorkerSource('edit-planner');
    expect(src).toContain('signals/narrative_plan.json');
  });

  // Contract: edit-planner → timeline-builder
  test('edit-planner writes signals/edit_plan.json', () => {
    const src = readWorkerSource('edit-planner');
    expect(src).toContain('signals/edit_plan.json');
  });

  test('timeline-builder reads signals/edit_plan.json', () => {
    const src = readWorkerSource('timeline-builder');
    expect(src).toContain('signals/edit_plan.json');
  });

  // Contract 12: timeline-builder → render (timeline)
  test('timeline-builder writes timeline/timeline.json', () => {
    const src = readWorkerSource('timeline-builder');
    expect(src).toContain('timeline/timeline.json');
  });

  test('render reads timeline/timeline.json', () => {
    const src = readWorkerSource('render');
    expect(src).toContain('timeline/timeline.json');
  });

  // Contract: render → rendered_video
  test('render writes rendered_video/output.mp4', () => {
    const src = readWorkerSource('render');
    expect(src).toContain('rendered_video/output.mp4');
  });
});

// ─── T20.2: Frame naming consistency ────────────────────────────────────────

describe('Frame Naming Consistency', () => {
  test('video-sample uses 4-digit zero-padded frame IDs', () => {
    const src = readWorkerSource('video-sample');
    expect(src).toContain("padStart(4, '0')");
  });

  test('ui-change-detector uses 4-digit zero-padded frame IDs', () => {
    const src = readWorkerSource('ui-change-detector');
    expect(src).toContain("padStart(4, '0')");
  });
});

// ─── T20.3: Signal file naming — definitive writer→reader map ───────────────

describe('Signal File Writer Contracts', () => {
  const SIGNAL_CONTRACTS: Record<string, { writer: string; readers: string[] }> = {
    'cursor_movements.json':    { writer: 'cursor-processor',     readers: ['interaction-pattern'] },
    'typing_events.json':       { writer: 'typing-detector',      readers: ['interaction-pattern'] },
    'speech_segments.json':     { writer: 'speech-transcription',  readers: ['intent-graph'] },
    'scene_descriptions.json':  { writer: 'video-understanding',   readers: ['intent-graph'] },
    'ui_transitions.json':      { writer: 'ui-change-detector',    readers: ['intent-graph'] },
    'interaction_clusters.json': { writer: 'interaction-pattern',   readers: ['intent-graph'] },
    'intent_graph.json':        { writer: 'intent-graph',          readers: ['narrative-planner'] },
    'narrative_plan.json':      { writer: 'narrative-planner',     readers: ['edit-planner'] },
    'edit_plan.json':           { writer: 'edit-planner',          readers: ['timeline-builder'] },
  };

  for (const [signalFile, { writer, readers }] of Object.entries(SIGNAL_CONTRACTS)) {
    test(`${writer} writes signals/${signalFile}`, () => {
      const src = readWorkerSource(writer);
      expect(src).toContain(`signals/${signalFile}`);
      expect(src).toContain('this.gcs.upload');
    });

    for (const reader of readers) {
      test(`${reader} reads signals/${signalFile}`, () => {
        const src = readWorkerSource(reader);
        expect(src).toContain(`signals/${signalFile}`);
      });
    }
  }
});

// ─── No orphaned signal files ───────────────────────────────────────────────

describe('No Orphaned Paths', () => {
  test('every signal writer path is read by at least one downstream worker', () => {
    const workerPaths: Record<string, { writes: string[]; reads: string[] }> = {};
    for (const w of getAllWorkerNames()) {
      const src = readWorkerSource(w);
      const writes = [...src.matchAll(/signals\/(\w+\.json)/g)].map(m => m[1]);
      workerPaths[w] = { writes, reads: writes };
    }

    const allWrites = new Set<string>();
    const allReads = new Set<string>();
    for (const { writes } of Object.values(workerPaths)) {
      for (const w of writes) allWrites.add(w!);
    }
    for (const { reads } of Object.values(workerPaths)) {
      for (const r of reads) allReads.add(r!);
    }

    for (const written of allWrites) {
      expect(allReads.has(written), `${written} is written but never read`).toBe(true);
    }
  });
});
