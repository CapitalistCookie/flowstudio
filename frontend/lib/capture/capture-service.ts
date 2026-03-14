'use client';

/**
 * CaptureEngine — handles real screen recording with MediaRecorder.
 * Uses the Zustand capture store for state management.
 */

import { useCaptureStore, type CaptureStore } from './capture-store';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let timerInterval: ReturnType<typeof setInterval> | null = null;
let startTime = 0;

function getStore(): CaptureStore {
  return useCaptureStore.getState();
}

export async function startCapture(): Promise<void> {
  const store = getStore();

  try {
    store.setStatus('preparing');

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: store.audioEnabled,
    });

    let combinedStream = displayStream;

    if (store.sourceType === 'both') {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: false,
        });
        const tracks = [
          ...displayStream.getVideoTracks(),
          ...cameraStream.getVideoTracks(),
        ];
        if (store.audioEnabled) {
          tracks.push(...displayStream.getAudioTracks());
        }
        combinedStream = new MediaStream(tracks);
      } catch {
        // Camera unavailable — continue with screen only
      }
    }

    store.setStream(combinedStream);

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm;codecs=vp9',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      store.setBlobUrl(url);
      store.setStatus('done');
      cleanupTimer();
    };

    mediaRecorder.onerror = () => {
      store.setError('Recording failed');
      cleanupTimer();
      const stream = getStore().stream;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      store.setStream(null);
      mediaRecorder = null;
    };

    combinedStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (mediaRecorder?.state === 'recording') {
        stopCapture();
      }
    });

    mediaRecorder.start(1000);
    startTime = Date.now();
    store.setStatus('recording');

    timerInterval = setInterval(() => {
      getStore().setElapsedMs(Date.now() - startTime);
    }, 100);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start recording';
    store.setError(message);
  }
}

export function pauseCapture(): void {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.pause();
    getStore().setStatus('paused');
    cleanupTimer();
  }
}

export function resumeCapture(): void {
  if (mediaRecorder?.state === 'paused') {
    mediaRecorder.resume();
    const store = getStore();
    store.setStatus('recording');
    startTime = Date.now() - store.elapsedMs;
    cleanupTimer();
    timerInterval = setInterval(() => {
      getStore().setElapsedMs(Date.now() - startTime);
    }, 100);
  }
}

export function stopCapture(): void {
  getStore().setStatus('stopping');
  cleanupTimer();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  const stream = getStore().stream;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  getStore().setStream(null);
}

function cleanupTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export function discardCapture(): void {
  const blobUrl = getStore().blobUrl;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  getStore().reset();
}

/**
 * Get the recorded blob for upload.
 * Must be called while status is 'done'.
 */
export async function getRecordedBlob(): Promise<Blob | null> {
  const blobUrl = getStore().blobUrl;
  if (!blobUrl) return null;
  const response = await fetch(blobUrl);
  return response.blob();
}
