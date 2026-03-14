import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskType, SignalType } from '@flowstudio/shared';
import { type TaskData } from '@flowstudio/worker-shared';

// ─── Mock layer ────────────────────────────────────────────────────────────────

const mockGcsUpload = vi.fn<(path: string, data: Buffer, contentType: string) => Promise<void>>();
const mockGcsDownload = vi.fn<(path: string) => Promise<Buffer>>();

vi.mock('../../shared/src/config.js', () => ({
  loadConfig: () => ({
    stdbHost: 'localhost:3000',
    stdbModule: 'flowstudio',
    gcsBucket: 'test-bucket',
    gcsProjectId: 'test-project',
    workerId: 'video-sample-test-1',
    workerName: 'video-sample',
    concurrency: 2,
    pollIntervalMs: 100,
    healthPort: 0,
  }),
}));

vi.mock('../../shared/src/logger.js', () => ({
  Logger: class {
    debug() {}
    info() {}
    warn() {}
    error() {}
  },
}));

vi.mock('../../shared/src/gcs-client.js', () => ({
  GcsClient: class {
    async upload(path: string, data: Buffer, contentType: string) {
      return mockGcsUpload(path, data, contentType);
    }
    async download(path: string) {
      return mockGcsDownload(path);
    }
    async exists() { return true; }
  },
}));

vi.mock('../../shared/src/stdb-client.js', () => ({
  StdbClient: class {
    async callReducer() {}
    async queryTable() { return []; }
    get isConnected() { return true; }
    disconnect() {}
  },
}));

vi.mock('../../shared/src/health.js', () => ({
  startHealthServer: () => ({
    close() {},
    once() {},
    address: () => ({ port: 9999 }),
  }),
}));

// ─── FFmpeg mock ───────────────────────────────────────────────────────────────

let ffmpegOutputOptions: string[] = [];
let ffmpegOutputPath = '';

vi.mock('fluent-ffmpeg', () => {
  const ffmpegFn = (_inputPath: string) => {
    const chain = {
      outputOptions(opts: string[]) { ffmpegOutputOptions = opts; return chain; },
      output(path: string) { ffmpegOutputPath = path; return chain; },
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

// ─── Sharp mock ────────────────────────────────────────────────────────────────
// Two code paths:
//   1) Main resize: sharp(buf).resize(1280, 720, {fit:'inside'}).jpeg({quality:85}).toBuffer()
//   2) Frame diff:  sharp(buf).resize(64, 64).greyscale().raw().toBuffer()

const sharpResizeCalls: Array<{ width: number; height: number; opts?: unknown }> = [];
const sharpJpegCalls: Array<{ quality: number }> = [];

/**
 * Per-frame raw pixel buffers returned by the diff path.
 * Key: full buffer content as string → output raw pixels.
 * When not found, returns a default "identical" buffer.
 */
const rawPixelOverrides = new Map<string, Buffer>();
const PIXELS_64x64 = 64 * 64;

function bufferKey(buf: Buffer): string {
  return buf.toString('utf8');
}

vi.mock('sharp', () => {
  const sharpFn = (inputBuf: Buffer) => {
    let isGreyscale = false;
    let isRaw = false;
    let resizeW = 0;
    let resizeH = 0;

    const chain = {
      resize(w: number, h: number, opts?: unknown) {
        resizeW = w;
        resizeH = h;
        sharpResizeCalls.push({ width: w, height: h, opts });
        return chain;
      },
      jpeg(opts: { quality: number }) {
        sharpJpegCalls.push(opts);
        return chain;
      },
      greyscale() { isGreyscale = true; return chain; },
      raw() { isRaw = true; return chain; },
      async toBuffer() {
        if (isGreyscale && isRaw && resizeW === 64 && resizeH === 64) {
          const override = rawPixelOverrides.get(bufferKey(inputBuf));
          return override ?? Buffer.alloc(PIXELS_64x64, 128);
        }
        return Buffer.from(`resized-${resizeW}x${resizeH}`);
      },
    };
    return chain;
  };
  return { default: sharpFn };
});

// ─── Filesystem mocks ──────────────────────────────────────────────────────────
// Simulate FFmpeg having written frame-0001.jpg .. frame-NNNN.jpg into framesDir

let simulatedFrameCount = 5;

/**
 * Per-frame file content buffers returned by readFile.
 * Key: frame filename (e.g. "frame-0001.jpg")
 */
const frameFileContents = new Map<string, Buffer>();

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/video-sample-test123'),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockImplementation(async () => {
    return Array.from({ length: simulatedFrameCount }, (_, i) =>
      `frame-${String(i + 1).padStart(4, '0')}.jpg`,
    );
  }),
  readFile: vi.fn().mockImplementation(async (filePath: string) => {
    const filename = filePath.split('/').pop()!;
    return frameFileContents.get(filename) ?? Buffer.from(`raw-frame-${filename}`);
  }),
}));

vi.mock('node:fs', () => {
  return {
    createWriteStream: () => {
      const { EventEmitter } = require('node:events');
      const emitter = new EventEmitter();
      return Object.assign(emitter, {
        write() {},
        end() { process.nextTick(() => emitter.emit('finish')); },
      });
    },
  };
});

import { VideoSampleWorker } from '../src/worker.js';
import { rm, readdir } from 'node:fs/promises';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('VideoSampleWorker', () => {
  let worker: VideoSampleWorker;

  beforeEach(() => {
    ffmpegOutputOptions = [];
    ffmpegOutputPath = '';
    sharpResizeCalls.length = 0;
    sharpJpegCalls.length = 0;
    rawPixelOverrides.clear();
    frameFileContents.clear();
    simulatedFrameCount = 5;
    mockGcsUpload.mockResolvedValue(undefined);
    mockGcsDownload.mockResolvedValue(Buffer.from('fake-video-bytes'));
    vi.mocked(rm).mockResolvedValue(undefined);
    worker = new VideoSampleWorker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeTask(overrides: Partial<TaskData> = {}): TaskData {
    return {
      id: 'task-1',
      projectId: 'proj-abc',
      taskType: 'VIDEO_SAMPLE',
      inputAssetIds: ['recording.mp4'],
      config: {},
      ...overrides,
    };
  }

  // ─── T5.1: Frame extraction at 2s intervals ───────────────────────────────
  test('extracts frames at default 2s interval via FFmpeg', async () => {
    await worker.processTask(makeTask());

    expect(ffmpegOutputOptions).toEqual(['-vf', 'fps=1/2', '-q:v', '2']);
    expect(ffmpegOutputPath).toBe('/tmp/video-sample-test123/frames/frame-%04d.jpg');
  });

  test('uses custom sample interval from config', async () => {
    await worker.processTask(makeTask({ config: { sampleIntervalSecs: 5 } }));

    expect(ffmpegOutputOptions).toEqual(['-vf', 'fps=1/5', '-q:v', '2']);
  });

  test('produces correct number of output assets for 5 frames', async () => {
    simulatedFrameCount = 5;

    const result = await worker.processTask(makeTask());

    expect(result.outputAssetIds).toHaveLength(5);
  });

  // ─── T5.2: Asset ID format matches GCS filenames ──────────────────────────
  test('outputAssetIds match GCS frame filenames (frame-NNNN)', async () => {
    simulatedFrameCount = 3;

    const result = await worker.processTask(makeTask());

    expect(result.outputAssetIds).toEqual(['frame-0000', 'frame-0001', 'frame-0002']);

    // Verify GCS uploads use matching paths
    const uploadPaths = mockGcsUpload.mock.calls.map(c => c[0]);
    expect(uploadPaths).toEqual([
      'projects/proj-abc/frame_sample/frame-0000.jpg',
      'projects/proj-abc/frame_sample/frame-0001.jpg',
      'projects/proj-abc/frame_sample/frame-0002.jpg',
    ]);
  });

  // ─── T5.3: Scene change detection ─────────────────────────────────────────
  test('detects scene changes when frame diff exceeds 0.3 threshold', async () => {
    simulatedFrameCount = 3;

    // Frame 1: dark pixels (0), Frame 2: bright pixels (255) → diff = 1.0
    // Frame 3: also bright (255) → diff from frame 2 = 0.0
    const frame1Buf = Buffer.from('raw-frame-frame-0001.jpg');
    const frame2Buf = Buffer.from('raw-frame-frame-0002.jpg');
    const frame3Buf = Buffer.from('raw-frame-frame-0003.jpg');

    frameFileContents.set('frame-0001.jpg', frame1Buf);
    frameFileContents.set('frame-0002.jpg', frame2Buf);
    frameFileContents.set('frame-0003.jpg', frame3Buf);

    rawPixelOverrides.set(bufferKey(frame1Buf), Buffer.alloc(PIXELS_64x64, 0));
    rawPixelOverrides.set(bufferKey(frame2Buf), Buffer.alloc(PIXELS_64x64, 255));
    rawPixelOverrides.set(bufferKey(frame3Buf), Buffer.alloc(PIXELS_64x64, 255));

    const result = await worker.processTask(makeTask());

    // Only frame 1→2 transition should trigger (diff=1.0 > 0.3)
    // Frame 2→3 should NOT trigger (diff=0.0)
    const sceneSignals = result.signals.filter(s => s.signalType === SignalType.SCENE_CHANGE);
    expect(sceneSignals).toHaveLength(1);
    expect(sceneSignals[0]!.confidence).toBe(1.0);
    expect(sceneSignals[0]!.timestampMs).toBe(2000); // frame index 1 * 2s * 1000
    expect(sceneSignals[0]!.payload.frameIndex).toBe(1);
    expect(sceneSignals[0]!.payload.changeScore).toBe(1.0);
  });

  test('no scene change signals when all frames are identical', async () => {
    simulatedFrameCount = 4;
    // Default rawPixelOverrides returns identical buffers (all 128), so diff = 0.0

    const result = await worker.processTask(makeTask());

    const sceneSignals = result.signals.filter(s => s.signalType === SignalType.SCENE_CHANGE);
    expect(sceneSignals).toHaveLength(0);
  });

  test('scene change signal includes before/after GCS paths', async () => {
    simulatedFrameCount = 2;

    const frame1Buf = Buffer.from('raw-frame-frame-0001.jpg');
    const frame2Buf = Buffer.from('raw-frame-frame-0002.jpg');
    frameFileContents.set('frame-0001.jpg', frame1Buf);
    frameFileContents.set('frame-0002.jpg', frame2Buf);
    rawPixelOverrides.set(bufferKey(frame1Buf), Buffer.alloc(PIXELS_64x64, 0));
    rawPixelOverrides.set(bufferKey(frame2Buf), Buffer.alloc(PIXELS_64x64, 255));

    const result = await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    expect(result.signals[0]!.payload.beforeFrameGcs).toBe(
      'projects/proj-xyz/frame_sample/frame-0000.jpg',
    );
    expect(result.signals[0]!.payload.afterFrameGcs).toBe(
      'projects/proj-xyz/frame_sample/frame-0001.jpg',
    );
  });

  // ─── T5.4: Frame resolution ────────────────────────────────────────────────
  test('resizes frames to 1280x720 JPEG quality 85', async () => {
    simulatedFrameCount = 1;

    await worker.processTask(makeTask());

    const mainResizes = sharpResizeCalls.filter(c => c.width === 1280 && c.height === 720);
    expect(mainResizes.length).toBeGreaterThanOrEqual(1);
    expect(mainResizes[0]!.opts).toEqual({ fit: 'inside' });

    expect(sharpJpegCalls.length).toBeGreaterThanOrEqual(1);
    expect(sharpJpegCalls[0]!.quality).toBe(85);
  });

  // ─── T5.5: Zero-padding to 4 digits ───────────────────────────────────────
  test('frame IDs are zero-padded to 4 digits', async () => {
    simulatedFrameCount = 2;

    const result = await worker.processTask(makeTask());

    for (const id of result.outputAssetIds) {
      expect(id).toMatch(/^frame-\d{4}$/);
    }
    expect(result.outputAssetIds[0]).toBe('frame-0000');
    expect(result.outputAssetIds[1]).toBe('frame-0001');
  });

  // ─── GCS source path contract ─────────────────────────────────────────────
  test('downloads from correct GCS source path', async () => {
    await worker.processTask(makeTask({ projectId: 'p-123', inputAssetIds: ['video.mp4'] }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/p-123/source_video/video.mp4');
  });

  // ─── GCS upload content type ──────────────────────────────────────────────
  test('uploads frames as image/jpeg', async () => {
    simulatedFrameCount = 1;

    await worker.processTask(makeTask());

    expect(mockGcsUpload).toHaveBeenCalledWith(
      expect.stringContaining('frame_sample/frame-0000.jpg'),
      expect.any(Buffer),
      'image/jpeg',
    );
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────
  test('throws when no input asset ID provided', async () => {
    await expect(worker.processTask(makeTask({ inputAssetIds: [] }))).rejects.toThrow(
      'No input asset ID provided',
    );
  });

  test('cleans up temp directory on success', async () => {
    await worker.processTask(makeTask());

    expect(rm).toHaveBeenCalledWith('/tmp/video-sample-test123', {
      recursive: true,
      force: true,
    });
  });

  test('cleans up temp directory even on failure', async () => {
    mockGcsDownload.mockRejectedValue(new Error('GCS down'));

    await expect(worker.processTask(makeTask())).rejects.toThrow('GCS down');

    expect(rm).toHaveBeenCalledWith('/tmp/video-sample-test123', {
      recursive: true,
      force: true,
    });
  });

  test('worker declares VIDEO_SAMPLE task type', () => {
    expect(worker.taskType).toBe(TaskType.VIDEO_SAMPLE);
  });

  // ─── Scene change confidence clamped to 1.0 ──────────────────────────────
  test('scene change confidence is clamped to max 1.0', async () => {
    simulatedFrameCount = 2;

    const frame1Buf = Buffer.from('raw-frame-frame-0001.jpg');
    const frame2Buf = Buffer.from('raw-frame-frame-0002.jpg');
    frameFileContents.set('frame-0001.jpg', frame1Buf);
    frameFileContents.set('frame-0002.jpg', frame2Buf);
    // Maximum possible diff = 1.0, should be clamped at 1.0 by Math.min
    rawPixelOverrides.set(bufferKey(frame1Buf), Buffer.alloc(PIXELS_64x64, 0));
    rawPixelOverrides.set(bufferKey(frame2Buf), Buffer.alloc(PIXELS_64x64, 255));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.confidence).toBeLessThanOrEqual(1.0);
  });
});
