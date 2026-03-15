import { Storage } from '@google-cloud/storage';
import { Logger } from './logger.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class GcsClient {
  private readonly storage: Storage;
  private readonly bucket: string;
  private readonly logger: Logger;

  constructor(bucket: string, projectId: string, logger: Logger) {
    this.storage = new Storage({ projectId });
    this.bucket = bucket;
    this.logger = logger;
  }

  /** Upload a buffer to GCS with retries */
  async upload(gcsPath: string, data: Buffer, contentType: string): Promise<void> {
    const cleanPath = gcsPath.replace(`gs://${this.bucket}/`, '');
    await this.withRetry(`upload:${cleanPath}`, async () => {
      const file = this.storage.bucket(this.bucket).file(cleanPath);
      await file.save(data, { contentType, resumable: false });
    });
  }

  /** Download a file from GCS with retries */
  async download(gcsPath: string): Promise<Buffer> {
    const cleanPath = gcsPath.replace(`gs://${this.bucket}/`, '');
    return this.withRetry(`download:${cleanPath}`, async () => {
      const file = this.storage.bucket(this.bucket).file(cleanPath);
      const [contents] = await file.download();
      return contents;
    });
  }

  /** Generate a signed upload URL */
  async getSignedUploadUrl(gcsPath: string, expiresInMs: number = 15 * 60 * 1000): Promise<string> {
    const cleanPath = gcsPath.replace(`gs://${this.bucket}/`, '');
    const file = this.storage.bucket(this.bucket).file(cleanPath);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresInMs,
      contentType: 'application/octet-stream',
    });
    return url;
  }

  /** Generate a signed download URL */
  async getSignedDownloadUrl(gcsPath: string, expiresInMs: number = 15 * 60 * 1000): Promise<string> {
    const cleanPath = gcsPath.replace(`gs://${this.bucket}/`, '');
    const file = this.storage.bucket(this.bucket).file(cleanPath);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMs,
    });
    return url;
  }

  /** Check if a file exists */
  async exists(gcsPath: string): Promise<boolean> {
    const cleanPath = gcsPath.replace(`gs://${this.bucket}/`, '');
    const file = this.storage.bucket(this.bucket).file(cleanPath);
    const [exists] = await file.exists();
    return exists;
  }

  /** List files under a prefix. Returns bucket-relative paths. Excludes directory placeholders. */
  async listFiles(prefix: string): Promise<string[]> {
    const cleanPrefix = prefix.replace(`gs://${this.bucket}/`, '');
    const [files] = await this.storage.bucket(this.bucket).getFiles({ prefix: cleanPrefix });
    return files.map((f) => f.name).filter((name) => !name.endsWith('/'));
  }

  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn(`GCS ${operation} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms`, {
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
}
