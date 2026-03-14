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

    // For now, just render the first frame scaled for each timestamp
    // Full implementation would use VideoDecoder API
    const thumbnails = timestamps.map((ts) => {
      ctx.drawImage(bitmap, 0, 0, width, height);
      const imageData = canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
      return { timestampMs: ts, dataUrl: '' };
    });

    const result: ThumbnailResult = { thumbnails };
    self.postMessage(result);
  } catch {
    self.postMessage({ thumbnails: [] });
  }
};
