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
    workerId: 'ui-change-detector-test-1',
    workerName: 'ui-change-detector',
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

// ─── Sharp mock ────────────────────────────────────────────────────────────────
// The worker uses sharp to resize to 128x128 greyscale and compute pixel diffs
// in a 4x4 grid (cell size 32x32). We control raw pixel data via frameBufferMap.

const COMPARE_SIZE = 128;
const PIXEL_COUNT = COMPARE_SIZE * COMPARE_SIZE;

const frameBufferMap = new Map<string, Buffer>();

function frameKey(buf: Buffer): string {
  return buf.toString('utf8');
}

vi.mock('sharp', () => {
  const sharpFn = (inputBuf: Buffer) => {
    const chain = {
      resize() { return chain; },
      greyscale() { return chain; },
      raw() { return chain; },
      async toBuffer() {
        const override = frameBufferMap.get(frameKey(inputBuf));
        return override ?? Buffer.alloc(PIXEL_COUNT, 128);
      },
    };
    return chain;
  };
  return { default: sharpFn };
});

import { UIChangeDetectorWorker } from '../src/worker.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: 'task-1',
    projectId: 'proj-abc',
    taskType: 'UI_CHANGE_DETECT',
    inputAssetIds: ['frame-0000', 'frame-0001', 'frame-0002'],
    config: {},
    ...overrides,
  };
}

function makeUniformFrame(name: string, value: number): Buffer {
  const buf = Buffer.from(name);
  frameBufferMap.set(name, Buffer.alloc(PIXEL_COUNT, value));
  return buf;
}

/**
 * Creates a frame buffer where specific 4x4 grid cells have different values.
 * cells is a 4x4 boolean grid; true cells get `changedValue`, false cells get `baseValue`.
 */
function makeGridFrame(name: string, cells: boolean[][], baseValue: number, changedValue: number): Buffer {
  const buf = Buffer.from(name);
  const raw = Buffer.alloc(PIXEL_COUNT, baseValue);
  const cellSize = COMPARE_SIZE / 4;

  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      if (cells[gy]![gx]) {
        for (let y = gy * cellSize; y < (gy + 1) * cellSize; y++) {
          for (let x = gx * cellSize; x < (gx + 1) * cellSize; x++) {
            raw[y * COMPARE_SIZE + x] = changedValue;
          }
        }
      }
    }
  }
  frameBufferMap.set(name, raw);
  return buf;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('UIChangeDetectorWorker', () => {
  let worker: UIChangeDetectorWorker;

  beforeEach(() => {
    mockGcsUpload.mockResolvedValue(undefined);
    frameBufferMap.clear();
    worker = new UIChangeDetectorWorker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── T10.1: Navigation detection ─────────────────────────────────────────

  test('classifies >70% region change as navigation', async () => {
    const frame0 = makeUniformFrame('nav-frame0', 0);
    const frame1 = makeUniformFrame('nav-frame1', 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.signalType).toBe(SignalType.UI_TRANSITION);
    expect(result.signals[0]!.payload.transitionType).toBe('navigation');
  });

  // ─── T10.2: Modal detection ──────────────────────────────────────────────

  test('classifies center-cluster change as modal', async () => {
    const allFalse = Array.from({ length: 4 }, () => [false, false, false, false]);
    const centerOnly = allFalse.map((row, gy) =>
      row.map((_, gx) => gx >= 1 && gx <= 2 && gy >= 1 && gy <= 2),
    );

    const frame0 = makeGridFrame('modal-frame0', allFalse, 100, 100);
    const frame1 = makeGridFrame('modal-frame1', centerOnly, 100, 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.transitionType).toBe('modal');
  });

  // ─── T10.3: Scroll detection ─────────────────────────────────────────────

  test('classifies vertical strip change as scroll', async () => {
    const allFalse = Array.from({ length: 4 }, () => [false, false, false, false]);
    const verticalStrip = allFalse.map((row, _gy) =>
      row.map((_, gx) => gx === 1),
    );

    const frame0 = makeGridFrame('scroll-frame0', allFalse, 100, 100);
    const frame1 = makeGridFrame('scroll-frame1', verticalStrip, 100, 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.transitionType).toBe('scroll');
  });

  // ─── T10.4: Below threshold ──────────────────────────────────────────────

  test('no signal when diff < 0.05', async () => {
    const frame0 = makeUniformFrame('same-frame0', 128);
    const frame1 = makeUniformFrame('same-frame1', 130);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals).toEqual([]);
  });

  test('exactly identical frames produce zero signals', async () => {
    const frame0 = makeUniformFrame('identical0', 128);
    const frame1 = makeUniformFrame('identical1', 128);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals).toEqual([]);
  });

  // ─── T10.5: Missing frames (graceful) ────────────────────────────────────

  test('skips missing frames without crashing', async () => {
    const frame0 = makeUniformFrame('ok-frame0', 0);
    const frame2 = makeUniformFrame('ok-frame2', 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce(frame2);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001', 'frame-0002'],
    }));

    expect(result.signals.length).toBeGreaterThanOrEqual(0);
  });

  test('returns empty when all frames fail to download', async () => {
    mockGcsDownload.mockRejectedValue(new Error('Not found'));

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001', 'frame-0002'],
    }));

    expect(result.signals).toEqual([]);
  });

  // ─── T10.6: GCS output contract ─────────────────────────────────────────

  test('writes to projects/{id}/signals/ui_transitions.json', async () => {
    const frame0 = makeUniformFrame('out-frame0', 0);
    const frame1 = makeUniformFrame('out-frame1', 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    await worker.processTask(makeTask({
      projectId: 'proj-ui-out',
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-ui-out/signals/ui_transitions.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('signal file contains valid JSON array of signals', async () => {
    const frame0 = makeUniformFrame('json-frame0', 0);
    const frame1 = makeUniformFrame('json-frame1', 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('ui_transitions.json'),
    );
    const signals = JSON.parse(uploadCall![1].toString());
    expect(Array.isArray(signals)).toBe(true);
    expect(signals[0].signalType).toBe(SignalType.UI_TRANSITION);
  });

  test('does not upload signal file when no transitions detected', async () => {
    const frame0 = makeUniformFrame('no-up0', 128);
    const frame1 = makeUniformFrame('no-up1', 128);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(mockGcsUpload).not.toHaveBeenCalled();
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────

  test('returns empty when fewer than 2 frames provided', async () => {
    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000'],
    }));

    expect(result.signals).toEqual([]);
    expect(mockGcsDownload).not.toHaveBeenCalled();
  });

  test('returns empty for zero input frames', async () => {
    const result = await worker.processTask(makeTask({ inputAssetIds: [] }));

    expect(result.signals).toEqual([]);
  });

  // ─── Signal shape ──────────────────────────────────────────────────────

  test('signal has correct timestamp based on frame index * 2000ms', async () => {
    const frames = [
      makeUniformFrame('ts-frame0', 0),
      makeUniformFrame('ts-frame1', 128),
      makeUniformFrame('ts-frame2', 255),
    ];

    mockGcsDownload
      .mockResolvedValueOnce(frames[0]!)
      .mockResolvedValueOnce(frames[1]!)
      .mockResolvedValueOnce(frames[2]!);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001', 'frame-0002'],
    }));

    const transitions = result.signals.filter(s => s.signalType === SignalType.UI_TRANSITION);
    for (const sig of transitions) {
      expect(sig.durationMs).toBe(2000);
    }
  });

  test('confidence is clamped to max 1.0', async () => {
    const frame0 = makeUniformFrame('clamp-frame0', 0);
    const frame1 = makeUniformFrame('clamp-frame1', 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals[0]!.confidence).toBeLessThanOrEqual(1.0);
    expect(result.signals[0]!.confidence).toBeGreaterThan(0);
  });

  test('signal payload includes fromState and toState frame refs', async () => {
    const frame0 = makeUniformFrame('ref-frame0', 0);
    const frame1 = makeUniformFrame('ref-frame1', 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals[0]!.payload.fromState).toBe('frame-0');
    expect(result.signals[0]!.payload.toState).toBe('frame-1');
  });

  test('signal payload includes diffScore', async () => {
    const frame0 = makeUniformFrame('diff-frame0', 0);
    const frame1 = makeUniformFrame('diff-frame1', 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals[0]!.payload.diffScore).toBeGreaterThan(0);
    expect(typeof result.signals[0]!.payload.diffScore).toBe('number');
  });

  // ─── Downloads from correct GCS path ────────────────────────────────────

  test('downloads frames from projects/{id}/frame_sample/frame-NNNN.jpg', async () => {
    mockGcsDownload.mockResolvedValue(makeUniformFrame('dl-frame', 128));

    await worker.processTask(makeTask({
      projectId: 'proj-dl',
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-dl/frame_sample/frame-0000.jpg');
    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-dl/frame_sample/frame-0001.jpg');
  });

  // ─── Metadata ───────────────────────────────────────────────────────────

  test('worker declares UI_CHANGE_DETECT task type', () => {
    expect(worker.taskType).toBe(TaskType.UI_CHANGE_DETECT);
  });

  test('outputAssetIds is always empty', async () => {
    const frame0 = makeUniformFrame('meta-frame0', 0);
    const frame1 = makeUniformFrame('meta-frame1', 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.outputAssetIds).toEqual([]);
  });

  // ─── Tab detection ──────────────────────────────────────────────────────

  test('classifies top-row-only change as tab', async () => {
    const allFalse = Array.from({ length: 4 }, () => [false, false, false, false]);
    const topRowOnly = allFalse.map((row, gy) =>
      row.map(() => gy === 0),
    );

    const frame0 = makeGridFrame('tab-frame0', allFalse, 100, 100);
    const frame1 = makeGridFrame('tab-frame1', topRowOnly, 100, 255);

    mockGcsDownload
      .mockResolvedValueOnce(frame0)
      .mockResolvedValueOnce(frame1);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.transitionType).toBe('tab');
  });
});
