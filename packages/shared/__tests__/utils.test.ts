import { describe, test, expect } from 'vitest';
import {
  generateId,
  safeJsonParse,
  toJsonString,
  gcsAssetPath,
  truncate,
  sleep,
} from '../src/utils.js';

describe('generateId', () => {
  test('produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  test('returns a valid UUID format', () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('safeJsonParse', () => {
  test('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  test('returns fallback on invalid JSON', () => {
    expect(safeJsonParse('not json', 'default')).toBe('default');
  });

  test('returns fallback on empty string', () => {
    expect(safeJsonParse('', [])).toEqual([]);
  });
});

describe('toJsonString', () => {
  test('serializes objects', () => {
    expect(toJsonString({ a: 1 })).toBe('{"a":1}');
  });

  test('serializes arrays', () => {
    expect(toJsonString([1, 2, 3])).toBe('[1,2,3]');
  });

  test('serializes null', () => {
    expect(toJsonString(null)).toBe('null');
  });
});

describe('gcsAssetPath', () => {
  test('builds correct GCS path', () => {
    const path = gcsAssetPath('flowstudio-assets', 'proj-123', 'audio_track', 'audio.wav');
    expect(path).toBe('gs://flowstudio-assets/projects/proj-123/audio_track/audio.wav');
  });

  test('handles special characters in projectId', () => {
    const path = gcsAssetPath('bucket', 'abc-def-123', 'source_video', 'video.mp4');
    expect(path).toContain('abc-def-123');
  });
});

describe('truncate', () => {
  test('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  test('truncates long strings with ellipsis', () => {
    expect(truncate('hello world this is long', 10)).toBe('hello w...');
    expect(truncate('hello world this is long', 10).length).toBe(10);
  });

  test('exact length is not truncated', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });
});

describe('sleep', () => {
  test('resolves after specified delay', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow some timing slack
  });
});
