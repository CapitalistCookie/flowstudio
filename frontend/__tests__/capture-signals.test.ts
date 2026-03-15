/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startCursorCapture,
  stopCursorCapture,
  getCursorEvents,
} from '../lib/capture/cursor-capture';
import {
  startKeyboardCapture,
  stopKeyboardCapture,
  getKeyboardEvents,
} from '../lib/capture/keyboard-capture';

describe('capture-signals', () => {
  let perfNow = 0;

  beforeEach(() => {
    perfNow = 0;
    vi.stubGlobal('performance', {
      now: () => perfNow,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('cursor events structure', () => {
    it('matches expected schema (x, y, timestamp, screenWidth, screenHeight, isClicking)', () => {
      startCursorCapture();
      perfNow = 100;

      const clickEvent = new MouseEvent('click', { clientX: 150, clientY: 200 });
      window.dispatchEvent(clickEvent);

      const events = getCursorEvents();
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e).toMatchObject({
        x: 150,
        y: 200,
        screenWidth: expect.any(Number),
        screenHeight: expect.any(Number),
        isClicking: true,
      });
      expect(typeof e.timestamp).toBe('number');
      expect(e.timestamp).toBeGreaterThanOrEqual(0);

      stopCursorCapture();
    });

    it('mousemove events have isClicking false', () => {
      startCursorCapture();
      perfNow = 50; // Must be >= 33 to pass throttle for first event

      const moveEvent = new MouseEvent('mousemove', { clientX: 100, clientY: 50 });
      window.dispatchEvent(moveEvent);

      const events = getCursorEvents();
      expect(events).toHaveLength(1);
      expect(events[0].isClicking).toBe(false);
      expect(events[0].x).toBe(100);
      expect(events[0].y).toBe(50);

      stopCursorCapture();
    });
  });

  describe('cursor throttling', () => {
    it('does not capture mousemove events faster than 33ms', () => {
      startCursorCapture();

      perfNow = 0;
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));

      perfNow = 10;
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));

      perfNow = 20;
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }));

      perfNow = 25;
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 40 }));

      const eventsBeforeThrottle = getCursorEvents();
      // All 4 events within 25ms - throttle skips them (need >=33ms between captures)
      expect(eventsBeforeThrottle.length).toBe(0);

      perfNow = 40;
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));

      perfNow = 75;
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 60 }));

      const eventsAfterThrottle = getCursorEvents();
      expect(eventsAfterThrottle.length).toBe(2);

      stopCursorCapture();
    });
  });

  describe('keyboard events sanitize password fields', () => {
    it('does not capture keydown in password input', () => {
      startKeyboardCapture();

      const passwordInput = document.createElement('input');
      passwordInput.type = 'password';
      document.body.appendChild(passwordInput);

      const keyEvent = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      passwordInput.dispatchEvent(keyEvent);

      const events = getKeyboardEvents();
      expect(events).toHaveLength(0);

      document.body.removeChild(passwordInput);
      stopKeyboardCapture();
    });

    it('captures keydown in non-password inputs', () => {
      startKeyboardCapture();
      perfNow = 0;

      const textInput = document.createElement('input');
      textInput.type = 'text';
      document.body.appendChild(textInput);

      const keyEvent = new KeyboardEvent('keydown', {
        key: 'b',
        bubbles: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });
      textInput.dispatchEvent(keyEvent);

      const events = getKeyboardEvents();
      expect(events).toHaveLength(1);
      expect(events[0].key).toBe('b');
      expect(events[0].isKeyDown).toBe(true);

      document.body.removeChild(textInput);
      stopKeyboardCapture();
    });
  });
});
