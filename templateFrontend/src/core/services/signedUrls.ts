/**
 * Signed URL cache for GCS assets.
 * Fetches signed URLs via the upload function and caches them.
 */

interface CachedUrl {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CachedUrl>();
const CACHE_TTL_MS = 14 * 60 * 1000; // 14 min (URLs expire at 15 min)

export async function getSignedUrl(gcsPath: string): Promise<string> {
  const cached = cache.get(gcsPath);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const uploadFnUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_UPLOAD_FUNCTION_URL) ||
    'http://localhost:8081';

  const res = await fetch(`${uploadFnUrl}/generate-download-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gcsPath }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get signed URL: ${res.status}`);
  }

  const { url } = (await res.json()) as { url: string };

  cache.set(gcsPath, {
    url,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return url;
}

export function clearUrlCache() {
  cache.clear();
}
