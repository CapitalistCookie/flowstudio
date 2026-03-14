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
    workerId: 'cursor-processor-test-1',
    workerName: 'cursor-processor',
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

import { CursorProcessorWorker } from '../src/worker.js';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('CursorProcessorWorker', () => {
  let worker: CursorProcessorWorker;

  beforeEach(() => {
    mockGcsUpload.mockResolvedValue(undefined);
    worker = new CursorProcessorWorker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeTask(overrides: Partial<TaskData> = {}): TaskData {
    return {
      id: 'task-1',
      projectId: 'proj-abc',
      taskType: 'CURSOR_PROCESS',
      inputAssetIds: ['cursor-events.json'],
      config: {},
      ...overrides,
    };
  }

  function setCursorData(events: Array<{ x: number; y: number; timestampMs: number; type: string }>) {
    mockGcsDownload.mockResolvedValue(Buffer.from(JSON.stringify(events)));
  }

  // ─── T6.1: Linear movement detection ──────────────────────────────────────
  test('classifies straight-line cursor movement as linear', async () => {
    // y = 0.5x, perfectly linear, R² = 1.0
    const events = Array.from({ length: 20 }, (_, i) => ({
      x: i * 10, y: i * 5, timestampMs: i * 100, type: 'move',
    }));
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.signalType).toBe(SignalType.CURSOR_MOVEMENT);
    expect(result.signals[0]!.payload.movementType).toBe('linear');
    expect(result.signals[0]!.payload.speed).toBeGreaterThan(5);
  });

  test('classifies vertical movement as linear (ssXX === 0 edge case)', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      x: 100, y: i * 10, timestampMs: i * 100, type: 'move',
    }));
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.movementType).toBe('linear');
  });

  // ─── T6.2: Erratic movement detection ─────────────────────────────────────
  test('classifies zigzag movement as erratic', async () => {
    // y alternates 0 ↔ 100 while x advances → very low R²
    const events = Array.from({ length: 20 }, (_, i) => ({
      x: i * 10, y: i % 2 === 0 ? 0 : 100, timestampMs: i * 100, type: 'move',
    }));
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.movementType).toBe('erratic');
  });

  // ─── T6.3: Hover detection ────────────────────────────────────────────────
  test('produces no signals for stationary cursor (hover filtered)', async () => {
    // All events at (100,100), speed = 0 → hover → not emitted
    const events = Array.from({ length: 10 }, (_, i) => ({
      x: 100, y: 100, timestampMs: i * 500, type: 'move',
    }));
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(0);
    expect(mockGcsUpload).not.toHaveBeenCalled();
  });

  // ─── T6.4: Segment split on time gap ──────────────────────────────────────
  test('splits into separate segments at >2000ms gaps', async () => {
    const segment1 = Array.from({ length: 10 }, (_, i) => ({
      x: i * 10, y: i * 5, timestampMs: i * 100, type: 'move',
    }));
    const segment2 = Array.from({ length: 10 }, (_, i) => ({
      x: 100 + i * 10, y: 50 + i * 5, timestampMs: 5000 + i * 100, type: 'move',
    }));
    setCursorData([...segment1, ...segment2]);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]!.timestampMs).toBe(0);
    expect(result.signals[0]!.durationMs).toBe(900);
    expect(result.signals[1]!.timestampMs).toBe(5000);
    expect(result.signals[1]!.durationMs).toBe(900);
  });

  // ─── T6.5: Missing cursor data (graceful) ────────────────────────────────
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

  test('returns empty signals for empty events array', async () => {
    setCursorData([]);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toEqual([]);
    expect(result.outputAssetIds).toEqual([]);
  });

  // ─── T6.6: GCS output contract ───────────────────────────────────────────
  test('writes signals to projects/{id}/signals/cursor_movements.json', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      x: i * 20, y: i * 10, timestampMs: i * 100, type: 'move',
    }));
    setCursorData(events);

    await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-xyz/signals/cursor_movements.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('downloads from correct GCS cursor_data path', async () => {
    setCursorData([]);

    await worker.processTask(makeTask({ projectId: 'p-123', inputAssetIds: ['events.json'] }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/p-123/cursor_data/events.json');
  });

  // ─── Click detection ──────────────────────────────────────────────────────
  test('classifies 2 slow stationary events as click', async () => {
    const events = [
      { x: 100, y: 100, timestampMs: 0, type: 'click' },
      { x: 100, y: 100, timestampMs: 500, type: 'click' },
    ];
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.movementType).toBe('click');
    expect(result.signals[0]!.durationMs).toBe(500);
  });

  // ─── Signal payload correctness ───────────────────────────────────────────
  test('limits positions in payload to 50', async () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      x: i * 5, y: i * 3, timestampMs: i * 50, type: 'move',
    }));
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.positions).toHaveLength(50);
  });

  test('signal confidence is 0.8', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      x: i * 20, y: i * 10, timestampMs: i * 100, type: 'move',
    }));
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.confidence).toBe(0.8);
  });

  test('signal durationMs matches segment time span', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      x: i * 20, y: i * 10, timestampMs: i * 100, type: 'move',
    }));
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.durationMs).toBe(900);
  });

  // ─── Metadata ─────────────────────────────────────────────────────────────
  test('worker declares CURSOR_PROCESS task type', () => {
    expect(worker.taskType).toBe(TaskType.CURSOR_PROCESS);
  });

  test('outputAssetIds is always empty', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      x: i * 20, y: i * 10, timestampMs: i * 100, type: 'move',
    }));
    setCursorData(events);

    const result = await worker.processTask(makeTask());

    expect(result.outputAssetIds).toEqual([]);
  });
});
