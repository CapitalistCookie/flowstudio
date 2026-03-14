/**
 * Type definitions for browser-side capture events.
 * These types define the contracts between:
 *   - Browser capture code → GCS upload
 *   - GCS files → cursor-processor and typing-detector workers
 */

export interface CursorEvent {
  x: number;
  y: number;
  timestampMs: number;
  type: 'mousemove' | 'click' | 'dblclick' | 'contextmenu';
  /** Viewport dimensions at time of capture for coordinate normalization */
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface KeyboardEvent {
  key: string;
  code: string;
  timestampMs: number;
  type: 'keydown' | 'keyup';
  /** Whether modifier keys were held */
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export interface CaptureSession {
  sessionId: string;
  projectId: string;
  startedAtMs: number;
  endedAtMs?: number;
  cursorEvents: CursorEvent[];
  keyboardEvents: KeyboardEvent[];
}

export interface CaptureConfig {
  /** Minimum interval between mousemove events in ms (throttle) */
  cursorThrottleMs: number;
  /** Maximum number of events to buffer before flushing */
  maxBufferSize: number;
  /** Interval to flush events to server in ms */
  flushIntervalMs: number;
  /** Whether to capture keyboard events (privacy consideration) */
  captureKeyboard: boolean;
  /** Whether to sanitize key values (replace with key type instead of actual key) */
  sanitizeKeys: boolean;
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  cursorThrottleMs: 50,
  maxBufferSize: 5000,
  flushIntervalMs: 10000,
  captureKeyboard: true,
  sanitizeKeys: false,
};

/**
 * GCS path contracts for capture data.
 * These MUST match what cursor-processor and typing-detector workers expect.
 */
export function cursorDataGcsPath(projectId: string, filename = 'events.json'): string {
  return `projects/${projectId}/cursor_data/${filename}`;
}

export function keyboardDataGcsPath(projectId: string, filename = 'events.json'): string {
  return `projects/${projectId}/keyboard_data/${filename}`;
}

/**
 * Sanitize a key value for privacy: replaces actual characters with their category.
 * Only applies when sanitizeKeys is enabled.
 */
export function sanitizeKeyValue(key: string): string {
  if (key.length === 1) {
    if (/[a-zA-Z]/.test(key)) return '[letter]';
    if (/[0-9]/.test(key)) return '[digit]';
    return '[symbol]';
  }
  return key;
}

/**
 * Validate a CursorEvent has required fields and reasonable values.
 */
export function validateCursorEvent(event: unknown): event is CursorEvent {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return (
    typeof e.x === 'number' && e.x >= 0 &&
    typeof e.y === 'number' && e.y >= 0 &&
    typeof e.timestampMs === 'number' && e.timestampMs >= 0 &&
    typeof e.type === 'string' &&
    ['mousemove', 'click', 'dblclick', 'contextmenu'].includes(e.type as string)
  );
}

/**
 * Validate a KeyboardEvent has required fields.
 */
export function validateKeyboardEvent(event: unknown): event is KeyboardEvent {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return (
    typeof e.key === 'string' &&
    typeof e.timestampMs === 'number' && e.timestampMs >= 0 &&
    typeof e.type === 'string' &&
    ['keydown', 'keyup'].includes(e.type as string)
  );
}
