import { describe, it, expect } from 'vitest';
import {
  groupSignalsForGateway,
  signalTypeToGatewayField,
  parseSignalPayload,
  hasMinimumSignals,
  type GatewaySignals,
} from '../lib/services/signal-fetcher';

describe('signal-fetcher', () => {
  describe('signalTypeToGatewayField', () => {
    it('maps STDB signal types to gateway field names', () => {
      expect(signalTypeToGatewayField('SPEECH_SEGMENT')).toBe('speech_segments');
      expect(signalTypeToGatewayField('SCENE_CHANGE')).toBe('scene_descriptions');
      expect(signalTypeToGatewayField('UI_TRANSITION')).toBe('ui_transitions');
      expect(signalTypeToGatewayField('INTERACTION_CLUSTER')).toBe('interaction_clusters');
    });

    it('returns undefined for unknown signal types', () => {
      expect(signalTypeToGatewayField('CURSOR_MOVEMENT')).toBeUndefined();
      expect(signalTypeToGatewayField('TYPING_EVENT')).toBeUndefined();
    });
  });

  describe('parseSignalPayload', () => {
    it('parses valid JSON payload', () => {
      const result = parseSignalPayload({ payload: '{"text":"hello","speaker":"user"}' });
      expect(result.text).toBe('hello');
      expect(result.speaker).toBe('user');
    });

    it('returns empty object for invalid JSON', () => {
      const result = parseSignalPayload({ payload: 'not json' });
      expect(result).toEqual({});
    });
  });

  describe('groupSignalsForGateway', () => {
    it('groups mixed signals by type', () => {
      const raw = [
        { signalType: 'SPEECH_SEGMENT', timestampMs: 0, durationMs: 2000, confidence: 0.95, payload: '{"text":"hello"}' },
        { signalType: 'SCENE_CHANGE', timestampMs: 1000, durationMs: 0, confidence: 0.8, payload: '{"description":"coding"}' },
        { signalType: 'UI_TRANSITION', timestampMs: 2000, durationMs: 500, confidence: 0.7, payload: '{"from":"editor","to":"terminal"}' },
        { signalType: 'INTERACTION_CLUSTER', timestampMs: 0, durationMs: 5000, confidence: 0.6, payload: '{"clusterType":"typing"}' },
      ];

      const grouped = groupSignalsForGateway(raw);

      expect(grouped.speech_segments).toHaveLength(1);
      expect(grouped.speech_segments[0]).toMatchObject({ text: 'hello', timestampMs: 0, confidence: 0.95 });

      expect(grouped.scene_descriptions).toHaveLength(1);
      expect(grouped.scene_descriptions[0]).toMatchObject({ description: 'coding' });

      expect(grouped.ui_transitions).toHaveLength(1);
      expect(grouped.interaction_clusters).toHaveLength(1);
    });

    it('returns empty arrays when no signals', () => {
      const grouped = groupSignalsForGateway([]);
      expect(grouped.speech_segments).toEqual([]);
      expect(grouped.scene_descriptions).toEqual([]);
      expect(grouped.ui_transitions).toEqual([]);
      expect(grouped.interaction_clusters).toEqual([]);
    });

    it('skips unknown signal types', () => {
      const raw = [
        { signalType: 'CURSOR_MOVEMENT', timestampMs: 100, durationMs: 0, confidence: 1, payload: '{"x":100}' },
        { signalType: 'TYPING_EVENT', timestampMs: 200, durationMs: 0, confidence: 1, payload: '{"key":"a"}' },
      ];

      const grouped = groupSignalsForGateway(raw);
      const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
      expect(total).toBe(0);
    });

    it('includes timestamp metadata in grouped signals', () => {
      const raw = [
        { signalType: 'SPEECH_SEGMENT', timestampMs: 5000, durationMs: 3000, confidence: 0.9, payload: '{"text":"test"}' },
      ];

      const grouped = groupSignalsForGateway(raw);
      expect(grouped.speech_segments[0]).toMatchObject({
        timestampMs: 5000,
        durationMs: 3000,
        confidence: 0.9,
      });
    });

    it('handles multiple signals of the same type', () => {
      const raw = [
        { signalType: 'SPEECH_SEGMENT', timestampMs: 0, durationMs: 1000, confidence: 0.9, payload: '{"text":"first"}' },
        { signalType: 'SPEECH_SEGMENT', timestampMs: 2000, durationMs: 1500, confidence: 0.85, payload: '{"text":"second"}' },
        { signalType: 'SPEECH_SEGMENT', timestampMs: 5000, durationMs: 800, confidence: 0.95, payload: '{"text":"third"}' },
      ];

      const grouped = groupSignalsForGateway(raw);
      expect(grouped.speech_segments).toHaveLength(3);
    });
  });

  describe('hasMinimumSignals', () => {
    it('returns false for empty signals', () => {
      const signals: GatewaySignals = {
        speech_segments: [],
        scene_descriptions: [],
        ui_transitions: [],
        interaction_clusters: [],
      };
      expect(hasMinimumSignals(signals)).toBe(false);
    });

    it('returns true when any signal type has data', () => {
      const signals: GatewaySignals = {
        speech_segments: [{ text: 'hello' }],
        scene_descriptions: [],
        ui_transitions: [],
        interaction_clusters: [],
      };
      expect(hasMinimumSignals(signals)).toBe(true);
    });
  });
});
