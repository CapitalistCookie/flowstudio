'use client';

/**
 * Cursor event capture during screen recording.
 * Events are throttled to ~30Hz to avoid massive payloads.
 */

let events: Array<{x: number; y: number; timestamp: number; screenWidth: number; screenHeight: number; isClicking: boolean}> = [];
let lastCaptureTime = 0;
let startTime = 0;
const THROTTLE_MS = 33; // ~30Hz

function handleMouseMove(e: MouseEvent) {
  const now = performance.now();
  if (now - lastCaptureTime < THROTTLE_MS) return;
  lastCaptureTime = now;
  events.push({
    x: e.clientX,
    y: e.clientY,
    timestamp: Math.round(now - startTime),
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    isClicking: false,
  });
}

function handleClick(e: MouseEvent) {
  events.push({
    x: e.clientX,
    y: e.clientY,
    timestamp: Math.round(performance.now() - startTime),
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    isClicking: true,
  });
}

export function startCursorCapture(): void {
  events = [];
  startTime = performance.now();
  lastCaptureTime = 0;
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('click', handleClick);
}

export function stopCursorCapture(): typeof events {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('click', handleClick);
  return [...events];
}

export function getCursorEvents() { return [...events]; }
