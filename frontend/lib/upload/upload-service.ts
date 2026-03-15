'use client';

import { fetchWithAuth } from '@/lib/auth/fetch-with-auth';

interface UploadResult {
  gcsPath: string;
  size: number;
}

/**
 * Upload a file to GCS via signed URL.
 * Uses /api/upload-url proxy (with Firebase auth) instead of calling
 * the Cloud Function directly. See X-05.
 */
export async function uploadToGcs(
  projectId: string,
  filename: string,
  file: Blob,
  contentType: string,
): Promise<UploadResult> {
  const res = await fetchWithAuth('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, filename, contentType }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get upload URL: ${res.status}`);
  }

  const { signedUrl, gcsPath } = await res.json();

  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload to GCS failed: ${uploadRes.status}`);
  }

  return { gcsPath, size: file.size };
}
