'use client';

import { fetchWithAuth } from '@/lib/auth/fetch-with-auth';

interface MediaUploadResult {
  gcsPath: string;
  gcsUrl: string;
  size: number;
}

/**
 * Upload an editor media file to GCS via signed URL.
 * Uses the same /api/upload-url proxy as video uploads but with
 * the media_files folder path and supports images.
 */
export async function uploadEditorMedia(
  projectId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<MediaUploadResult> {
  const filename = `${Date.now()}_${file.name}`;
  const contentType = file.type || 'application/octet-stream';

  onProgress?.(10);

  const res = await fetchWithAuth('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      filename,
      contentType,
      folder: 'media_files',
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get upload URL: ${res.status}`);
  }

  const { signedUrl, gcsPath } = await res.json();

  onProgress?.(40);

  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload to GCS failed: ${uploadRes.status}`);
  }

  onProgress?.(100);

  const bucketUrl = process.env.NEXT_PUBLIC_GCS_BUCKET_URL ?? 'https://storage.googleapis.com/flowstudio-assets';
  // gcsPath comes back as gs://bucket/path — extract the path portion
  const pathPortion = gcsPath.replace(/^gs:\/\/[^/]+\//, '');
  const gcsUrl = `${bucketUrl}/${pathPortion}`;

  return { gcsPath, gcsUrl, size: file.size };
}
