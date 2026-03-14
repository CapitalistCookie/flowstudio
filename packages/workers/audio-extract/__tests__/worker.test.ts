import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskType } from '@flowstudio/shared';
import { type TaskData, type WorkerDeps } from '@flowstudio/worker-shared';

// ─── Mock deps factory ──────────────────────────────────────────────────────────

function createMockDeps(): WorkerDeps & {
  mockGcsUpload: ReturnType<typeof vi.fn>;
  mockGcsDownload: ReturnType<typeof vi.fn>;
  mockGcsExists: ReturnType<typeof vi.fn>;
} {
  const mockGcsUpload = vi.fn().mockResolvedValue(undefined);
  const mockGcsDownload = vi.fn().mockResolvedValue(Buffer.from('fake-video-bytes'));
  const mockGcsExists = vi.fn().mockResolvedValue(true);

  return {
    config: {
      stdbHost: 'localhost:3000',
      stdbModule: 'flowstudio',
      gcsBucket: 'test-bucket',
      gcsProjectId: 'test-project',
      workerId: 'audio-extract-test-1',
      workerName: 'audio-extract',
      concurrency: 2,
      pollIntervalMs: 100,
      healthPort: 0,
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    gcs: {
      upload: mockGcsUpload,
      download: mockGcsDownload,
      exists: mockGcsExists,
      getSignedUploadUrl: vi.fn(),
      getSignedDownloadUrl: vi.fn(),
    } as any,
    stdb: {
      callReducer: vi.fn().mockResolvedValue(undefined),
      queryTable: vi.fn().mockResolvedValue([]),
      isConnected: true,
      disconnect: vi.fn(),
    } as any,
    mockGcsUpload,
    mockGcsDownload,
    mockGcsExists,
  };
}

// ─── FFmpeg mock ────────────────────────────────────────────────────────────────

let ffmpegCalls: {
  input: string;
  noVideo: boolean;
  audioCodec: string | null;
  audioFrequency: number | null;
  audioChannels: number | null;
  outputPath: string | null;
};

function resetFfmpegCalls() {
  ffmpegCalls = {
    input: '',
    noVideo: false,
    audioCodec: null,
    audioFrequency: null,
    audioChannels: null,
    outputPath: null,
  };
}

vi.mock('fluent-ffmpeg', () => {
  const ffmpegFn = (inputPath: string) => {
    ffmpegCalls.input = inputPath;
    const chain = {
      noVideo() { ffmpegCalls.noVideo = true; return chain; },
      audioCodec(c: string) { ffmpegCalls.audioCodec = c; return chain; },
      audioFrequency(f: number) { ffmpegCalls.audioFrequency = f; return chain; },
      audioChannels(ch: number) { ffmpegCalls.audioChannels = ch; return chain; },
      output(path: string) { ffmpegCalls.outputPath = path; return chain; },
      on(event: string, cb: (...args: unknown[]) => void) {
        if (event === 'end') {
          Promise.resolve().then(() => cb());
        }
        return chain;
      },
      run() { return chain; },
    };
    return chain;
  };
  ffmpegFn.setFfmpegPath = () => {};
  return { default: ffmpegFn };
});

vi.mock('@ffmpeg-installer/ffmpeg', () => ({
  path: '/usr/local/bin/ffmpeg',
}));

// Mock fs operations to avoid actual filesystem I/O
const writtenFiles = new Map<string, Buffer>();

vi.mock('node:fs', async () => {
  const { EventEmitter } = await import('node:events');

  return {
    createWriteStream: (filePath: string) => {
      const emitter = new EventEmitter();
      let chunks: Buffer[] = [];
      return Object.assign(emitter, {
        write(data: Buffer) { chunks.push(data); },
        end() {
          writtenFiles.set(filePath, Buffer.concat(chunks));
          process.nextTick(() => emitter.emit('finish'));
        },
      });
    },
    createReadStream: (filePath: string) => {
      const { Readable } = require('node:stream');
      const data = writtenFiles.get(filePath) ?? Buffer.from('mock-wav-audio-data');
      const stream = new Readable({
        read() {
          this.push(data);
          this.push(null);
        },
      });
      return stream;
    },
  };
});

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/audio-extract-test123'),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { AudioExtractWorker } from '../src/worker.js';
import { rm } from 'node:fs/promises';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AudioExtractWorker', () => {
  let worker: AudioExtractWorker;
  let mockGcsUpload: ReturnType<typeof vi.fn>;
  let mockGcsDownload: ReturnType<typeof vi.fn>;
  let mockGcsExists: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetFfmpegCalls();
    writtenFiles.clear();
    const deps = createMockDeps();
    mockGcsUpload = deps.mockGcsUpload;
    mockGcsDownload = deps.mockGcsDownload;
    mockGcsExists = deps.mockGcsExists;
    vi.mocked(rm).mockResolvedValue(undefined);
    worker = new AudioExtractWorker(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── T4.1: Happy path — extract audio from valid video ─────────────────────
  test('processes video and produces output with correct asset ID', async () => {
    const task: TaskData = {
      id: 'task-1',
      projectId: 'proj-abc',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['recording.mp4'],
      config: {},
    };

    const result = await worker.processTask(task);

    expect(result.outputAssetIds).toEqual(['audio-proj-abc']);
    expect(result.signals).toEqual([]);
  });

  // ─── T4.2: Missing source video ────────────────────────────────────────────
  test('throws when no input asset ID provided', async () => {
    const task: TaskData = {
      id: 'task-2',
      projectId: 'proj-abc',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: [],
      config: {},
    };

    await expect(worker.processTask(task)).rejects.toThrow('No input asset ID provided');
  });

  // ─── T4.3: FFmpeg called with correct codec/frequency/channels ─────────────
  test('calls FFmpeg with mono 16kHz pcm_s16le settings', async () => {
    const task: TaskData = {
      id: 'task-3',
      projectId: 'proj-abc',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['video.mp4'],
      config: {},
    };

    await worker.processTask(task);

    expect(ffmpegCalls.noVideo).toBe(true);
    expect(ffmpegCalls.audioCodec).toBe('pcm_s16le');
    expect(ffmpegCalls.audioFrequency).toBe(16000);
    expect(ffmpegCalls.audioChannels).toBe(1);
  });

  // ─── T4.4: GCS path contract ──────────────────────────────────────────────
  test('downloads from correct GCS source path', async () => {
    const task: TaskData = {
      id: 'task-4',
      projectId: 'proj-xyz',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['my-recording.mp4'],
      config: {},
    };

    await worker.processTask(task);

    expect(mockGcsDownload).toHaveBeenCalledWith(
      'projects/proj-xyz/source_video/my-recording.mp4',
    );
  });

  test('uploads to correct GCS output path', async () => {
    const task: TaskData = {
      id: 'task-5',
      projectId: 'proj-xyz',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['my-recording.mp4'],
      config: {},
    };

    await worker.processTask(task);

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-xyz/audio_track/audio.wav',
      expect.any(Buffer),
      'audio/wav',
    );
  });

  // ─── Temp directory cleanup ────────────────────────────────────────────────
  test('cleans up temp directory on success', async () => {
    const task: TaskData = {
      id: 'task-6',
      projectId: 'proj-abc',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['video.mp4'],
      config: {},
    };

    await worker.processTask(task);

    expect(rm).toHaveBeenCalledWith('/tmp/audio-extract-test123', {
      recursive: true,
      force: true,
    });
  });

  test('cleans up temp directory even when GCS download fails', async () => {
    mockGcsDownload.mockRejectedValue(new Error('GCS unavailable'));

    const task: TaskData = {
      id: 'task-7',
      projectId: 'proj-abc',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['video.mp4'],
      config: {},
    };

    await expect(worker.processTask(task)).rejects.toThrow('GCS unavailable');

    expect(rm).toHaveBeenCalledWith('/tmp/audio-extract-test123', {
      recursive: true,
      force: true,
    });
  });

  // ─── FFmpeg output path ────────────────────────────────────────────────────
  test('FFmpeg outputs to temp directory', async () => {
    const task: TaskData = {
      id: 'task-8',
      projectId: 'proj-abc',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['video.mp4'],
      config: {},
    };

    await worker.processTask(task);

    expect(ffmpegCalls.outputPath).toBe('/tmp/audio-extract-test123/audio.wav');
    expect(ffmpegCalls.input).toBe('/tmp/audio-extract-test123/input.mp4');
  });

  // ─── TaskType ──────────────────────────────────────────────────────────────
  test('worker declares AUDIO_EXTRACT task type', () => {
    expect(worker.taskType).toBe(TaskType.AUDIO_EXTRACT);
  });

  // ─── Signals are empty for audio extraction ────────────────────────────────
  test('returns empty signals array (audio extraction produces no signals)', async () => {
    const task: TaskData = {
      id: 'task-9',
      projectId: 'proj-abc',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['video.mp4'],
      config: {},
    };

    const result = await worker.processTask(task);
    expect(result.signals).toHaveLength(0);
  });
});
