export type CaptureStatus =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'done';

export type CaptureSourceType = 'screen' | 'camera' | 'both';

/** Cursor event shape from cursor-capture (x, y, timestamp, viewport, isClicking) */
export interface CursorEventRecord {
  x: number;
  y: number;
  timestamp: number;
  screenWidth: number;
  screenHeight: number;
  isClicking: boolean;
}

/** Keyboard event shape from keyboard-capture */
export interface KeyboardEventRecord {
  key: string;
  timestamp: number;
  isKeyDown: boolean;
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
}

export interface CaptureState {
  status: CaptureStatus;
  elapsedMs: number;
  stream: MediaStream | null;
  blobUrl: string | null;
  error: string | null;
  sourceType: CaptureSourceType;
  audioEnabled: boolean;
  cursorEvents: CursorEventRecord[];
  keyboardEvents: KeyboardEventRecord[];
}
