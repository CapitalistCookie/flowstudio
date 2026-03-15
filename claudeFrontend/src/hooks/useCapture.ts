'use client';

import { useCallback } from 'react';
import { useCaptureStore, captureStore } from './useStores';
import {
  startCapture,
  stopCapture,
  pauseCapture,
  resumeCapture,
  discardCapture,
} from '../core/services/capture';

export function useCapture() {
  const status = useCaptureStore((s) => s.status);
  const elapsedMs = useCaptureStore((s) => s.elapsedMs);
  const blobUrl = useCaptureStore((s) => s.blobUrl);
  const errorMessage = useCaptureStore((s) => s.errorMessage);
  const sourceType = useCaptureStore((s) => s.sourceType);
  const audioEnabled = useCaptureStore((s) => s.audioEnabled);

  const start = useCallback(() => startCapture(captureStore), []);
  const stop = useCallback(() => stopCapture(captureStore), []);
  const pause = useCallback(() => pauseCapture(captureStore), []);
  const resume = useCallback(() => resumeCapture(captureStore), []);
  const discard = useCallback(() => discardCapture(captureStore), []);

  const setSourceType = useCaptureStore((s) => s.setSourceType);
  const toggleAudio = useCaptureStore((s) => s.toggleAudio);

  return {
    status,
    elapsedMs,
    blobUrl,
    errorMessage,
    sourceType,
    audioEnabled,
    start,
    stop,
    pause,
    resume,
    discard,
    setSourceType,
    toggleAudio,
  };
}
