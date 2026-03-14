import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskType, SignalType } from '@flowstudio/shared';
import { type TaskData, type WorkerDeps } from '@flowstudio/worker-shared';
import { TypingDetectorWorker } from '../src/worker.js';

// ─── Mock factory ───────────────────────────────────────────────────────────────

function createMockDeps(): WorkerDeps & {
  mockGcsUpload: ReturnType<typeof vi.fn>;
  mockGcsDownload: ReturnType<typeof vi.fn>;
} {
  const mockGcsUpload = vi.fn().mockResolvedValue(undefined);
  const mockGcsDownload = vi.fn().mockResolvedValue(Buffer.from('[]'));

  return {
    config: {
      stdbHost: 'localhost:3000',
      stdbModule: 'flowstudio',
      gcsBucket: 'test-bucket',
      gcsProjectId: 'test-project',
      workerId: 'typing-detector-test-1',
      workerName: 'typing-detector',
      concurrency: 2,
      pollIntervalMs: 100,
      healthPort: 0,
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    gcs: {
      upload: mockGcsUpload,
      download: mockGcsDownload,
      exists: vi.fn().mockResolvedValue(true),
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
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('TypingDetectorWorker', () => {
  let worker: TypingDetectorWorker;
  let mockGcsUpload: ReturnType<typeof vi.fn>;
  let mockGcsDownload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const deps = createMockDeps();
    mockGcsUpload = deps.mockGcsUpload;
    mockGcsDownload = deps.mockGcsDownload;
    worker = new TypingDetectorWorker(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeTask(overrides: Partial<TaskData> = {}): TaskData {
    return {
      id: 'task-1',
      projectId: 'proj-abc',
      taskType: 'TYPING_DETECT',
      inputAssetIds: ['keyboard-events.json'],
      config: {},
      ...overrides,
    };
  }

  function setKeyboardData(events: Array<{ key: string; timestampMs: number; type: string }>) {
    mockGcsDownload.mockResolvedValue(Buffer.from(JSON.stringify(events)));
  }

  // ─── T7.1: Normal typing burst ─────────────────────────────────────────────
  test('detects typing burst with >3 keys and <1500ms gap', async () => {
    const events = 'hello'.split('').map((key, i) => ({
      key, timestampMs: i * 200, type: 'keydown',
    }));
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.signalType).toBe(SignalType.TYPING_EVENT);
    expect(result.signals[0]!.payload.isPaste).toBe(false);
    expect(result.signals[0]!.payload.detectedText).toBe('hello');
  });

  test('typing burst has correct timing: startMs from first key, durationMs spans burst', async () => {
    const events = 'abcde'.split('').map((key, i) => ({
      key, timestampMs: 1000 + i * 200, type: 'keydown',
    }));
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.timestampMs).toBe(1000);
    expect(result.signals[0]!.durationMs).toBe(800);
  });

  // ─── T7.2: Paste event detection ───────────────────────────────────────────
  test('classifies >15 chars/sec as paste', async () => {
    const keys = 'abcdefghijklmnopqrst'.split('');
    const events = keys.map((key, i) => ({
      key, timestampMs: i * 50, type: 'keydown',
    }));
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.isPaste).toBe(true);
    expect(result.signals[0]!.payload.charactersPerSecond).toBeGreaterThan(15);
  });

  test('normal typing speed is not classified as paste', async () => {
    const events = 'hello world'.split('').map((key, i) => ({
      key, timestampMs: i * 150, type: 'keydown',
    }));
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.isPaste).toBe(false);
    expect(result.signals[0]!.payload.charactersPerSecond).toBeLessThan(15);
  });

  // ─── T7.3: Filters non-keydown events ──────────────────────────────────────
  test('ignores keyup events, only counts keydown', async () => {
    const events = [
      { key: 'a', timestampMs: 0, type: 'keydown' },
      { key: 'a', timestampMs: 50, type: 'keyup' },
      { key: 'b', timestampMs: 200, type: 'keydown' },
      { key: 'b', timestampMs: 250, type: 'keyup' },
      { key: 'c', timestampMs: 400, type: 'keydown' },
      { key: 'c', timestampMs: 450, type: 'keyup' },
      { key: 'd', timestampMs: 600, type: 'keydown' },
      { key: 'd', timestampMs: 650, type: 'keyup' },
    ];
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.detectedText).toBe('abcd');
  });

  test('fewer than 3 keydown events produces no signals', async () => {
    const events = [
      { key: 'a', timestampMs: 0, type: 'keydown' },
      { key: 'a', timestampMs: 50, type: 'keyup' },
      { key: 'b', timestampMs: 200, type: 'keydown' },
      { key: 'b', timestampMs: 250, type: 'keyup' },
    ];
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toEqual([]);
  });

  // ─── T7.4: Missing keyboard data (graceful) ───────────────────────────────
  test('returns empty signals when no input asset ID provided', async () => {
    const result = await worker.processTask(makeTask({ inputAssetIds: [] }));

    expect(result.outputAssetIds).toEqual([]);
    expect(result.signals).toEqual([]);
  });

  test('returns empty signals when GCS download fails', async () => {
    mockGcsDownload.mockRejectedValue(new Error('Not found'));

    const result = await worker.processTask(makeTask());

    expect(result.outputAssetIds).toEqual([]);
    expect(result.signals).toEqual([]);
  });

  // ─── T7.5: GCS output contract ────────────────────────────────────────────
  test('writes to projects/{id}/signals/typing_events.json', async () => {
    const events = 'abcde'.split('').map((key, i) => ({
      key, timestampMs: i * 200, type: 'keydown',
    }));
    setKeyboardData(events);

    await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-xyz/signals/typing_events.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('downloads from correct GCS keyboard_data path', async () => {
    setKeyboardData([]);

    await worker.processTask(makeTask({ projectId: 'p-123', inputAssetIds: ['kb.json'] }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/p-123/keyboard_data/kb.json');
  });

  test('does not upload to GCS when no signals produced', async () => {
    const events = [
      { key: 'a', timestampMs: 0, type: 'keydown' },
      { key: 'b', timestampMs: 200, type: 'keydown' },
    ];
    setKeyboardData(events);

    await worker.processTask(makeTask());

    expect(mockGcsUpload).not.toHaveBeenCalled();
  });

  // ─── Burst splitting ──────────────────────────────────────────────────────
  test('splits into multiple bursts at >1500ms gaps', async () => {
    const burst1 = 'abc'.split('').map((key, i) => ({
      key, timestampMs: i * 200, type: 'keydown',
    }));
    const burst2 = 'defg'.split('').map((key, i) => ({
      key, timestampMs: 3000 + i * 200, type: 'keydown',
    }));
    setKeyboardData([...burst1, ...burst2]);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]!.payload.detectedText).toBe('abc');
    expect(result.signals[0]!.timestampMs).toBe(0);
    expect(result.signals[1]!.payload.detectedText).toBe('defg');
    expect(result.signals[1]!.timestampMs).toBe(3000);
  });

  test('discards sub-threshold burst between two valid bursts', async () => {
    const burst1 = 'abcd'.split('').map((key, i) => ({
      key, timestampMs: i * 200, type: 'keydown',
    }));
    const tooShort = [
      { key: 'x', timestampMs: 3000, type: 'keydown' },
      { key: 'y', timestampMs: 3200, type: 'keydown' },
    ];
    const burst2 = 'efgh'.split('').map((key, i) => ({
      key, timestampMs: 6000 + i * 200, type: 'keydown',
    }));
    setKeyboardData([...burst1, ...tooShort, ...burst2]);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]!.payload.detectedText).toBe('abcd');
    expect(result.signals[1]!.payload.detectedText).toBe('efgh');
  });

  // ─── Special keys / detectedText filtering ────────────────────────────────
  test('filters multi-char keys (Shift, Control, etc.) from detectedText', async () => {
    const events = [
      { key: 'Shift', timestampMs: 0, type: 'keydown' },
      { key: 'H', timestampMs: 50, type: 'keydown' },
      { key: 'e', timestampMs: 200, type: 'keydown' },
      { key: 'l', timestampMs: 400, type: 'keydown' },
      { key: 'l', timestampMs: 600, type: 'keydown' },
      { key: 'o', timestampMs: 800, type: 'keydown' },
    ];
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.detectedText).toBe('Hello');
  });

  // ─── CPS edge case: zero-duration burst ────────────────────────────────────
  test('handles zero-duration burst (all same timestamp) without division error', async () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      key: String.fromCharCode(97 + i), timestampMs: 0, type: 'keydown',
    }));
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.charactersPerSecond).toBe(5);
    expect(result.signals[0]!.durationMs).toBe(0);
  });

  // ─── Signal shape ─────────────────────────────────────────────────────────
  test('signal confidence is always 0.85', async () => {
    const events = 'test'.split('').map((key, i) => ({
      key, timestampMs: i * 200, type: 'keydown',
    }));
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.confidence).toBe(0.85);
  });

  test('signal payload includes inputRegion placeholder', async () => {
    const events = 'test'.split('').map((key, i) => ({
      key, timestampMs: i * 200, type: 'keydown',
    }));
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.inputRegion).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  // ─── Metadata ─────────────────────────────────────────────────────────────
  test('worker declares TYPING_DETECT task type', () => {
    expect(worker.taskType).toBe(TaskType.TYPING_DETECT);
  });

  test('outputAssetIds is always empty', async () => {
    const events = 'hello'.split('').map((key, i) => ({
      key, timestampMs: i * 200, type: 'keydown',
    }));
    setKeyboardData(events);

    const result = await worker.processTask(makeTask());

    expect(result.outputAssetIds).toEqual([]);
  });
});
