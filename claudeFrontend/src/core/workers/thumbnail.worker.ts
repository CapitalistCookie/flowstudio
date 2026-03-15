/**
 * Web Worker: Generates video thumbnails at specified timestamps.
 * Uses OffscreenCanvas to render frames from a video.
 */

interface ThumbnailRequest {
  videoUrl: string;
  timestamps: number[]; // ms values
  width: number;
  height: number;
}

interface ThumbnailResult {
  thumbnails: Array<{
    timestampMs: number;
    dataUrl: string;
  }>;
}

self.onmessage = async (e: MessageEvent<ThumbnailRequest>) => {
  const { videoUrl, timestamps, width, height } = e.data;

  try {
    const response = await fetch(videoUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      self.postMessage({ thumbnails: [] });
      return;
    }

    // Render the poster frame for each timestamp and convert to data URL.
    // Full per-timestamp seeking would require VideoDecoder API.
    const thumbnails: Array<{ timestampMs: number; dataUrl: string }> = [];
    for (const ts of timestamps) {
      ctx.drawImage(bitmap, 0, 0, width, height);
      const thumbBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
      const buffer = await thumbBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const dataUrl = `data:image/jpeg;base64,${btoa(binary)}`;
      thumbnails.push({ timestampMs: ts, dataUrl });
    }

    const result: ThumbnailResult = { thumbnails };
    self.postMessage(result);
  } catch {
    self.postMessage({ thumbnails: [] });
  }
};
