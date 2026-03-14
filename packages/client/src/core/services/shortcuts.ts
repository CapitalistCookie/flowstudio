/**
 * Framework-agnostic keyboard shortcut manager.
 * Registers shortcuts and dispatches to handlers.
 */

import type { ShortcutBinding } from '../types';

type ShortcutHandler = (e: KeyboardEvent) => void;

interface RegisteredShortcut {
  binding: ShortcutBinding;
  handler: ShortcutHandler;
}

const registry: RegisteredShortcut[] = [];
let listening = false;

function parseKeys(keys: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } {
  const parts = keys.toLowerCase().split('+').map((p) => p.trim());
  return {
    ctrl: parts.includes('ctrl') || parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta') || parts.includes('mod'),
    key: parts.filter((p) => !['ctrl', 'shift', 'alt', 'meta', 'mod'].includes(p))[0] || '',
  };
}

function matchesEvent(keys: string, e: KeyboardEvent): boolean {
  const parsed = parseKeys(keys);
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const modKey = isMac ? e.metaKey : e.ctrlKey;

  if (parsed.ctrl && !modKey) return false;
  if (parsed.shift && !e.shiftKey) return false;
  if (parsed.alt && !e.altKey) return false;

  const eventKey = e.key.toLowerCase();
  if (eventKey === ' ') return parsed.key === 'space';
  return eventKey === parsed.key;
}

function handleKeyDown(e: KeyboardEvent) {
  // Don't intercept shortcuts when typing in inputs
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return;
  }

  for (const { binding, handler } of registry) {
    if (matchesEvent(binding.keys, e)) {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
      return;
    }
  }
}

export function startListening() {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('keydown', handleKeyDown, true);
  listening = true;
}

export function stopListening() {
  if (!listening || typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleKeyDown, true);
  listening = false;
}

export function registerShortcut(
  binding: ShortcutBinding,
  handler: ShortcutHandler
): () => void {
  const entry: RegisteredShortcut = { binding, handler };
  registry.push(entry);

  if (!listening) startListening();

  return () => {
    const idx = registry.indexOf(entry);
    if (idx >= 0) registry.splice(idx, 1);
  };
}

export function getShortcuts(scope?: 'global' | 'studio'): ShortcutBinding[] {
  if (scope) return registry.filter((r) => r.binding.scope === scope).map((r) => r.binding);
  return registry.map((r) => r.binding);
}
