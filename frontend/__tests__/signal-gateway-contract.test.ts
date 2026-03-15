/**
 * Data contract verification: groupSignalsForGateway output matches gateway SignalData schema.
 * X-09: Frontend-to-gateway signal format contract.
 */
import { describe, it, expect } from 'vitest';
import { SignalType } from '@flowstudio/shared';
import { groupSignalsForGateway, type GatewaySignals } from '../lib/services/signal-fetcher';

describe('Signal–gateway contract', () => {
  it('output has required keys: speech_segments, scene_descriptions, ui_transitions, interaction_clusters', () => {
    const result = groupSignalsForGateway([]);
    expect(Object.keys(result).sort()).toEqual([
      'interaction_clusters',
      'scene_descriptions',
      'speech_segments',
      'ui_transitions',
    ]);
  });

  it('each value is an array', () => {
    const result = groupSignalsForGateway([]);
    expect(Array.isArray(result.speech_segments)).toBe(true);
    expect(Array.isArray(result.scene_descriptions)).toBe(true);
    expect(Array.isArray(result.ui_transitions)).toBe(true);
    expect(Array.isArray(result.interaction_clusters)).toBe(true);
  });

  it('speech segments include timestampMs, durationMs, confidence fields', () => {
    const raw = [
      {
        signalType: SignalType.SPEECH_SEGMENT,
        payload: '{"text":"hello"}',
        timestampMs: 1000,
        durationMs: 500,
        confidence: 0.92,
      },
    ];
    const result = groupSignalsForGateway(raw);
    expect(result.speech_segments).toHaveLength(1);
    const seg = result.speech_segments[0]!;
    expect(seg).toHaveProperty('timestampMs', 1000);
    expect(seg).toHaveProperty('durationMs', 500);
    expect(seg).toHaveProperty('confidence', 0.92);
    expect(seg).toHaveProperty('text', 'hello');
  });

  it('scene descriptions include timestampMs, durationMs, confidence fields', () => {
    const raw = [
      {
        signalType: SignalType.SCENE_CHANGE,
        payload: '{"description":"user coding"}',
        timestampMs: 2000,
        durationMs: 0,
        confidence: 0.85,
      },
    ];
    const result = groupSignalsForGateway(raw);
    expect(result.scene_descriptions).toHaveLength(1);
    const desc = result.scene_descriptions[0]!;
    expect(desc).toHaveProperty('timestampMs', 2000);
    expect(desc).toHaveProperty('durationMs', 0);
    expect(desc).toHaveProperty('confidence', 0.85);
    expect(desc).toHaveProperty('description', 'user coding');
  });

  it('empty input produces empty arrays', () => {
    const result = groupSignalsForGateway([]);
    const expected: GatewaySignals = {
      speech_segments: [],
      scene_descriptions: [],
      ui_transitions: [],
      interaction_clusters: [],
    };
    expect(result).toEqual(expected);
  });
});
