export type CaptureStatus =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'done';

export type CaptureSourceType = 'screen' | 'camera' | 'both';

export interface CaptureState {
  status: CaptureStatus;
  elapsedMs: number;
  stream: MediaStream | null;
  blobUrl: string | null;
  error: string | null;
  sourceType: CaptureSourceType;
  audioEnabled: boolean;
}
