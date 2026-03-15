/**
 * CaptureEngine — handles screen recording with MediaRecorder.
 * Framework-agnostic. Talks to the capture store for state updates.
 */

import type { StoreApi } from 'zustand';
import type { CaptureStoreType } from '../stores/captureStore';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let timerInterval: ReturnType<typeof setInterval> | null = null;
let startTime = 0;

export async function startCapture(
  captureStore: StoreApi<CaptureStoreType>
): Promise<void> {
  const state = captureStore.getState();

  try {
    captureStore.getState().setStatus('preparing');

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: state.audioEnabled,
    });

    let combinedStream = displayStream;

    // If both screen + camera requested, merge streams
    if (state.sourceType === 'both') {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: false,
        });
        const tracks = [
          ...displayStream.getVideoTracks(),
          ...cameraStream.getVideoTracks(),
        ];
        if (state.audioEnabled) {
          tracks.push(...displayStream.getAudioTracks());
        }
        combinedStream = new MediaStream(tracks);
      } catch {
        // Camera unavailable — continue with screen only
      }
    }

    captureStore.getState().setStream(combinedStream);

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
      captureStore.getState().setBlobUrl(url);
      captureStore.getState().setStatus('done');
      cleanupTimer();
    };

    mediaRecorder.onerror = () => {
      captureStore.getState().setError('Recording failed');
      cleanupTimer();
      // Stop all tracks so browser recording indicator clears
      const stream = captureStore.getState().stream;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      captureStore.getState().setStream(null);
      mediaRecorder = null;
    };

    // Handle user stopping screen share via browser UI
    combinedStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (mediaRecorder?.state === 'recording') {
        stopCapture(captureStore);
      }
    });

    mediaRecorder.start(1000); // Collect data every second
    startTime = Date.now();
    captureStore.getState().setStatus('recording');

    // Timer for elapsed
    timerInterval = setInterval(() => {
      captureStore.getState().setElapsedMs(Date.now() - startTime);
    }, 100);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start recording';
    captureStore.getState().setError(message);
  }
}

export function pauseCapture(captureStore: StoreApi<CaptureStoreType>) {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.pause();
    captureStore.getState().setStatus('paused');
    cleanupTimer();
  }
}

export function resumeCapture(captureStore: StoreApi<CaptureStoreType>) {
  if (mediaRecorder?.state === 'paused') {
    mediaRecorder.resume();
    captureStore.getState().setStatus('recording');
    startTime = Date.now() - captureStore.getState().elapsedMs;
    cleanupTimer(); // Clear any existing timer to prevent interval leak
    timerInterval = setInterval(() => {
      captureStore.getState().setElapsedMs(Date.now() - startTime);
    }, 100);
  }
}

export function stopCapture(captureStore: StoreApi<CaptureStoreType>) {
  captureStore.getState().setStatus('stopping');
  cleanupTimer();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  // Stop all tracks
  const stream = captureStore.getState().stream;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  captureStore.getState().setStream(null);
}

function cleanupTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export function discardCapture(captureStore: StoreApi<CaptureStoreType>) {
  const blobUrl = captureStore.getState().blobUrl;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  captureStore.getState().reset();
}
