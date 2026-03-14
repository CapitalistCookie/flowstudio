import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockLogger } from './mocks.js';

const mockSave = vi.fn();
const mockDownload = vi.fn();
const mockExists = vi.fn();
const mockGetSignedUrl = vi.fn();

const mockFile = vi.fn().mockImplementation(() => ({
  save: mockSave,
  download: mockDownload,
  exists: mockExists,
  getSignedUrl: mockGetSignedUrl,
}));

const mockBucket = vi.fn().mockImplementation(() => ({ file: mockFile }));

vi.mock('@google-cloud/storage', () => {
  return {
    Storage: class MockStorage {
      bucket(...args: any[]) {
        return mockBucket(...args);
      }
    },
  };
});

import { GcsClient } from '../src/gcs-client.js';

describe('GcsClient', () => {
  let gcs: GcsClient;
  let logger: MockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = new MockLogger();
    gcs = new GcsClient('flowstudio-assets', 'my-project', logger as any);
    mockSave.mockResolvedValue(undefined);
    mockDownload.mockResolvedValue([Buffer.from('content')]);
    mockExists.mockResolvedValue([true]);
    mockGetSignedUrl.mockResolvedValue(['https://signed.url']);
    mockFile.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // T2.7 — Path Cleaning: strips gs://bucket/ prefix
  test('upload strips gs://bucket/ prefix from paths', async () => {
    const p = gcs.upload(
      'gs://flowstudio-assets/projects/abc/audio.wav',
      Buffer.from('data'),
      'audio/wav',
    );
    await vi.runAllTimersAsync();
    await p;

    expect(mockFile).toHaveBeenCalledWith('projects/abc/audio.wav');
    expect(mockSave).toHaveBeenCalledWith(Buffer.from('data'), {
      contentType: 'audio/wav',
      resumable: false,
    });
  });

  test('upload works with raw paths (no gs:// prefix)', async () => {
    const p = gcs.upload('projects/abc/audio.wav', Buffer.from('data'), 'audio/wav');
    await vi.runAllTimersAsync();
    await p;
    expect(mockFile).toHaveBeenCalledWith('projects/abc/audio.wav');
  });

  test('download strips gs://bucket/ prefix', async () => {
    const p = gcs.download('gs://flowstudio-assets/projects/abc/audio.wav');
    await vi.runAllTimersAsync();
    const result = await p;
    expect(mockFile).toHaveBeenCalledWith('projects/abc/audio.wav');
    expect(result).toEqual(Buffer.from('content'));
  });

  test('exists strips gs://bucket/ prefix', async () => {
    const result = await gcs.exists('gs://flowstudio-assets/projects/abc/audio.wav');
    expect(mockFile).toHaveBeenCalledWith('projects/abc/audio.wav');
    expect(result).toBe(true);
  });

  // T2.6 — Upload with Retry: retries on failure
  test('upload retries on failure (up to 3 times)', async () => {
    let attempts = 0;
    mockSave.mockImplementation(async () => {
      attempts++;
      if (attempts < 3) throw new Error(`Fail attempt ${attempts}`);
    });

    const p = gcs.upload('path/file.txt', Buffer.from('data'), 'text/plain');
    await vi.runAllTimersAsync();
    await p;

    expect(attempts).toBe(3);
    expect(logger.logs.filter((l) => l.level === 'warn').length).toBe(2);
  });

  test('upload throws after all retries exhausted', async () => {
    mockSave.mockImplementation(async () => {
      throw new Error('persistent failure');
    });

    const p = gcs.upload('path/file.txt', Buffer.from('data'), 'text/plain');
    p.catch(() => {}); // prevent unhandled rejection warning during timer advancement
    await vi.runAllTimersAsync();

    await expect(p).rejects.toThrow('persistent failure');
  });

  test('download retries on failure', async () => {
    let attempts = 0;
    mockDownload.mockImplementation(async () => {
      attempts++;
      if (attempts < 2) throw new Error('transient');
      return [Buffer.from('ok')];
    });

    const p = gcs.download('path/file.txt');
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result).toEqual(Buffer.from('ok'));
    expect(attempts).toBe(2);
  });
});
