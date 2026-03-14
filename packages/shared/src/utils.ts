/** Generate a unique ID */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Current Unix timestamp in milliseconds */
export function nowMs(): number {
  return Date.now();
}

/** Safely parse JSON with a fallback */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Serialize to JSON string */
export function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

/** Build a GCS path for a project asset */
export function gcsAssetPath(
  bucket: string,
  projectId: string,
  assetType: string,
  filename: string,
): string {
  return `gs://${bucket}/projects/${projectId}/${assetType}/${filename}`;
}

/** Truncate string with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/** Sleep for ms */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
