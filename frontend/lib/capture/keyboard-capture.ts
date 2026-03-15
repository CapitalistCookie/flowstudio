'use client';

/**
 * Keyboard event capture during screen recording.
 * Sanitizes sensitive input (passwords, etc).
 */

interface KbEvent {
  key: string;
  timestamp: number;
  isKeyDown: boolean;
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
}

let events: KbEvent[] = [];
let startTime = 0;

const SENSITIVE_PATTERNS = /^(password|secret|token|key|credit|cvv|ssn)$/i;

function sanitizeKey(key: string): string {
  if (key.length === 1) return key;
  if (SENSITIVE_PATTERNS.test(key)) return '[REDACTED]';
  return key;
}

function handleKeyEvent(e: globalThis.KeyboardEvent) {
  // Don't capture in password fields
  const target = e.target as HTMLElement;
  if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'password') return;

  events.push({
    key: sanitizeKey(e.key),
    timestamp: Math.round(performance.now() - startTime),
    isKeyDown: e.type === 'keydown',
    modifiers: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey },
  });
}

export function startKeyboardCapture(): void {
  events = [];
  startTime = performance.now();
  window.addEventListener('keydown', handleKeyEvent);
  window.addEventListener('keyup', handleKeyEvent);
}

export function stopKeyboardCapture(): KbEvent[] {
  window.removeEventListener('keydown', handleKeyEvent);
  window.removeEventListener('keyup', handleKeyEvent);
  return [...events];
}

export function getKeyboardEvents() { return [...events]; }
