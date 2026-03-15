'use client';

const UPLOAD_FUNCTION_URL =
  process.env.NEXT_PUBLIC_UPLOAD_FUNCTION_URL ?? 'http://localhost:8081';

interface UploadResult {
  gcsPath: string;
  size: number;
}

/**
 * Upload a file to GCS via signed URL.
 * 1. Requests a signed upload URL from the Cloud Function
 * 2. PUTs the file directly to GCS
 */
export async function uploadToGcs(
  projectId: string,
  filename: string,
  file: Blob,
  contentType: string,
): Promise<UploadResult> {
  const res = await fetch(`${UPLOAD_FUNCTION_URL}/generate-upload-url`, {
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
