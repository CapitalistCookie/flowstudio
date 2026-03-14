import { describe, test, expect } from 'vitest';
import {
  validateCursorEvent,
  validateKeyboardEvent,
  sanitizeKeyValue,
  cursorDataGcsPath,
  keyboardDataGcsPath,
  DEFAULT_CAPTURE_CONFIG,
  type CursorEvent,
  type KeyboardEvent as CaptureKeyboardEvent,
} from '../src/capture-types.js';

// ─── T25.1: CursorEvent validation ─────────────────────────────────────────

describe('validateCursorEvent', () => {
  test('accepts valid mousemove event', () => {
    const event: CursorEvent = { x: 100, y: 200, timestampMs: 1000, type: 'mousemove' };
    expect(validateCursorEvent(event)).toBe(true);
  });

  test('accepts valid click event', () => {
    const event: CursorEvent = { x: 50, y: 75, timestampMs: 500, type: 'click' };
    expect(validateCursorEvent(event)).toBe(true);
  });

  test('accepts valid dblclick event', () => {
    const event: CursorEvent = { x: 0, y: 0, timestampMs: 0, type: 'dblclick' };
    expect(validateCursorEvent(event)).toBe(true);
  });

  test('accepts event with optional viewport dimensions', () => {
    const event = { x: 100, y: 200, timestampMs: 1000, type: 'mousemove', viewportWidth: 1920, viewportHeight: 1080 };
    expect(validateCursorEvent(event)).toBe(true);
  });

  test('rejects negative x coordinate', () => {
    expect(validateCursorEvent({ x: -1, y: 0, timestampMs: 0, type: 'click' })).toBe(false);
  });

  test('rejects negative y coordinate', () => {
    expect(validateCursorEvent({ x: 0, y: -1, timestampMs: 0, type: 'click' })).toBe(false);
  });

  test('rejects negative timestamp', () => {
    expect(validateCursorEvent({ x: 0, y: 0, timestampMs: -1, type: 'click' })).toBe(false);
  });

  test('rejects invalid event type', () => {
    expect(validateCursorEvent({ x: 0, y: 0, timestampMs: 0, type: 'drag' })).toBe(false);
  });

  test('rejects null', () => {
    expect(validateCursorEvent(null)).toBe(false);
  });

  test('rejects non-object', () => {
    expect(validateCursorEvent('string')).toBe(false);
  });

  test('rejects missing fields', () => {
    expect(validateCursorEvent({ x: 0 })).toBe(false);
  });
});

// ─── T25.2: KeyboardEvent validation ────────────────────────────────────────

describe('validateKeyboardEvent', () => {
  test('accepts valid keydown event', () => {
    const event: CaptureKeyboardEvent = { key: 'a', code: 'KeyA', timestampMs: 1000, type: 'keydown' };
    expect(validateKeyboardEvent(event)).toBe(true);
  });

  test('accepts valid keyup event', () => {
    const event: CaptureKeyboardEvent = { key: 'Enter', code: 'Enter', timestampMs: 2000, type: 'keyup' };
    expect(validateKeyboardEvent(event)).toBe(true);
  });

  test('accepts event with modifier keys', () => {
    const event = { key: 'c', code: 'KeyC', timestampMs: 500, type: 'keydown', ctrlKey: true, shiftKey: false };
    expect(validateKeyboardEvent(event)).toBe(true);
  });

  test('rejects invalid event type', () => {
    expect(validateKeyboardEvent({ key: 'a', code: 'KeyA', timestampMs: 0, type: 'keypress' })).toBe(false);
  });

  test('rejects negative timestamp', () => {
    expect(validateKeyboardEvent({ key: 'a', code: 'KeyA', timestampMs: -1, type: 'keydown' })).toBe(false);
  });

  test('rejects null', () => {
    expect(validateKeyboardEvent(null)).toBe(false);
  });

  test('rejects missing key', () => {
    expect(validateKeyboardEvent({ timestampMs: 0, type: 'keydown' })).toBe(false);
  });
});

// ─── T25.3: GCS path contracts ──────────────────────────────────────────────

describe('GCS Path Contracts', () => {
  test('cursorDataGcsPath matches cursor-processor expected path', () => {
    const path = cursorDataGcsPath('proj-123');
    expect(path).toBe('projects/proj-123/cursor_data/events.json');
  });

  test('cursorDataGcsPath supports custom filename', () => {
    const path = cursorDataGcsPath('proj-123', 'batch-001.json');
    expect(path).toBe('projects/proj-123/cursor_data/batch-001.json');
  });

  test('keyboardDataGcsPath matches typing-detector expected path', () => {
    const path = keyboardDataGcsPath('proj-123');
    expect(path).toBe('projects/proj-123/keyboard_data/events.json');
  });

  test('keyboardDataGcsPath supports custom filename', () => {
    const path = keyboardDataGcsPath('proj-123', 'batch-001.json');
    expect(path).toBe('projects/proj-123/keyboard_data/batch-001.json');
  });

  test('cursor path matches what cursor-processor downloads', () => {
    const path = cursorDataGcsPath('abc');
    expect(path).toMatch(/^projects\/[^/]+\/cursor_data\//);
  });

  test('keyboard path matches what typing-detector downloads', () => {
    const path = keyboardDataGcsPath('abc');
    expect(path).toMatch(/^projects\/[^/]+\/keyboard_data\//);
  });
});

// ─── sanitizeKeyValue ───────────────────────────────────────────────────────

describe('sanitizeKeyValue', () => {
  test('replaces single letter with [letter]', () => {
    expect(sanitizeKeyValue('a')).toBe('[letter]');
    expect(sanitizeKeyValue('Z')).toBe('[letter]');
  });

  test('replaces single digit with [digit]', () => {
    expect(sanitizeKeyValue('5')).toBe('[digit]');
    expect(sanitizeKeyValue('0')).toBe('[digit]');
  });

  test('replaces single symbol with [symbol]', () => {
    expect(sanitizeKeyValue('!')).toBe('[symbol]');
    expect(sanitizeKeyValue('@')).toBe('[symbol]');
  });

  test('preserves special keys as-is', () => {
    expect(sanitizeKeyValue('Enter')).toBe('Enter');
    expect(sanitizeKeyValue('Backspace')).toBe('Backspace');
    expect(sanitizeKeyValue('ArrowLeft')).toBe('ArrowLeft');
    expect(sanitizeKeyValue('Control')).toBe('Control');
    expect(sanitizeKeyValue('Tab')).toBe('Tab');
  });
});

// ─── DEFAULT_CAPTURE_CONFIG ─────────────────────────────────────────────────

describe('DEFAULT_CAPTURE_CONFIG', () => {
  test('has reasonable throttle value', () => {
    expect(DEFAULT_CAPTURE_CONFIG.cursorThrottleMs).toBeGreaterThanOrEqual(16);
    expect(DEFAULT_CAPTURE_CONFIG.cursorThrottleMs).toBeLessThanOrEqual(200);
  });

  test('has reasonable buffer size', () => {
    expect(DEFAULT_CAPTURE_CONFIG.maxBufferSize).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_CAPTURE_CONFIG.maxBufferSize).toBeLessThanOrEqual(50000);
  });

  test('has reasonable flush interval', () => {
    expect(DEFAULT_CAPTURE_CONFIG.flushIntervalMs).toBeGreaterThanOrEqual(1000);
    expect(DEFAULT_CAPTURE_CONFIG.flushIntervalMs).toBeLessThanOrEqual(60000);
  });

  test('captures keyboard by default', () => {
    expect(DEFAULT_CAPTURE_CONFIG.captureKeyboard).toBe(true);
  });

  test('does not sanitize keys by default (configurable per deployment)', () => {
    expect(DEFAULT_CAPTURE_CONFIG.sanitizeKeys).toBe(false);
  });
});

// ─── T25.4: Worker consumption ──────────────────────────────────────────────

describe('Worker Consumption Compatibility', () => {
  test('cursor events match cursor-processor expected shape', () => {
    const events: CursorEvent[] = [
      { x: 100, y: 200, timestampMs: 1000, type: 'mousemove' },
      { x: 150, y: 250, timestampMs: 1100, type: 'click' },
    ];
    const json = JSON.stringify(events);
    const parsed = JSON.parse(json);

    for (const event of parsed) {
      expect(typeof event.x).toBe('number');
      expect(typeof event.y).toBe('number');
      expect(typeof event.timestampMs).toBe('number');
      expect(typeof event.type).toBe('string');
    }
  });

  test('keyboard events match typing-detector expected shape', () => {
    const events: CaptureKeyboardEvent[] = [
      { key: 'h', code: 'KeyH', timestampMs: 1000, type: 'keydown' },
      { key: 'h', code: 'KeyH', timestampMs: 1050, type: 'keyup' },
    ];
    const json = JSON.stringify(events);
    const parsed = JSON.parse(json);

    for (const event of parsed) {
      expect(typeof event.key).toBe('string');
      expect(typeof event.timestampMs).toBe('number');
      expect(typeof event.type).toBe('string');
    }
  });
});
