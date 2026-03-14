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
    workerId: 'interaction-pattern-test-1',
    workerName: 'interaction-pattern',
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

import { InteractionPatternWorker } from '../src/worker.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: 'task-1',
    projectId: 'proj-abc',
    taskType: 'INTERACTION_PATTERN',
    inputAssetIds: [],
    config: {},
    ...overrides,
  };
}

function makeCursorSignal(timestampMs: number, durationMs = 500) {
  return {
    signalType: SignalType.CURSOR_MOVEMENT,
    timestampMs,
    durationMs,
    confidence: 0.8,
    payload: {
      movementType: 'linear',
      positions: [{ x: 100, y: 200 }, { x: 150, y: 250 }],
    },
  };
}

function makeTypingSignal(timestampMs: number, durationMs = 800) {
  return {
    signalType: SignalType.TYPING_EVENT,
    timestampMs,
    durationMs,
    confidence: 0.85,
    payload: {
      isPaste: false,
      detectedText: 'hello',
      inputRegion: { x: 50, y: 100, width: 200, height: 30 },
    },
  };
}

function setGcsFiles(files: Record<string, unknown[]>) {
  mockGcsDownload.mockImplementation(async (path: string) => {
    for (const [key, data] of Object.entries(files)) {
      if (path.includes(key)) {
        return Buffer.from(JSON.stringify(data));
      }
    }
    throw new Error(`File not found: ${path}`);
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('InteractionPatternWorker', () => {
  let worker: InteractionPatternWorker;

  beforeEach(() => {
    mockGcsUpload.mockResolvedValue(undefined);
    worker = new InteractionPatternWorker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── T11.1: Merges cursor and typing signals ────────────────────────────

  test('reads both cursor_movements.json and typing_events.json', async () => {
    setGcsFiles({
      'cursor_movements.json': [makeCursorSignal(1000)],
      'typing_events.json': [makeTypingSignal(2000)],
    });

    const result = await worker.processTask(makeTask());

    expect(mockGcsDownload).toHaveBeenCalledWith(
      'projects/proj-abc/signals/cursor_movements.json',
    );
    expect(mockGcsDownload).toHaveBeenCalledWith(
      'projects/proj-abc/signals/typing_events.json',
    );
    expect(result.signals.length).toBeGreaterThan(0);
  });

  test('merges signals sorted by timestamp', async () => {
    setGcsFiles({
      'cursor_movements.json': [makeCursorSignal(5000)],
      'typing_events.json': [makeTypingSignal(1000)],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.timestampMs).toBe(1000);
  });

  // ─── T11.2: 5-second window clustering ──────────────────────────────────

  test('clusters interactions within 5s windows', async () => {
    setGcsFiles({
      'cursor_movements.json': [
        makeCursorSignal(1000, 500),
        makeCursorSignal(2000, 500),
        makeCursorSignal(4000, 500),
      ],
      'typing_events.json': [
        makeTypingSignal(12000, 500),
        makeTypingSignal(13000, 500),
      ],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(2);
  });

  test('signals within 5s of each other are in one cluster', async () => {
    setGcsFiles({
      'cursor_movements.json': [
        makeCursorSignal(0, 100),
        makeCursorSignal(1000, 100),
        makeCursorSignal(3000, 100),
      ],
      'typing_events.json': [],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.interactions).toHaveLength(3);
  });

  test('cluster durationMs spans from first to last signal', async () => {
    setGcsFiles({
      'cursor_movements.json': [
        makeCursorSignal(1000, 500),
        makeCursorSignal(3000, 800),
      ],
      'typing_events.json': [],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.timestampMs).toBe(1000);
    expect(result.signals[0]!.durationMs).toBe(2800); // (3000+800) - 1000
  });

  // ─── T11.3: Intent inference: form_interaction ──────────────────────────

  test('cursor + typing in same cluster = form_interaction', async () => {
    setGcsFiles({
      'cursor_movements.json': [makeCursorSignal(1000)],
      'typing_events.json': [makeTypingSignal(2000)],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.intent).toBe('form_interaction');
  });

  // ─── T11.4: Intent inference: navigation ────────────────────────────────

  test('cursor only in cluster = navigation', async () => {
    setGcsFiles({
      'cursor_movements.json': [
        makeCursorSignal(1000),
        makeCursorSignal(2000),
      ],
      'typing_events.json': [],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.intent).toBe('navigation');
  });

  // ─── Intent inference: text_input ───────────────────────────────────────

  test('typing only in cluster = text_input', async () => {
    setGcsFiles({
      'cursor_movements.json': [],
      'typing_events.json': [
        makeTypingSignal(1000),
        makeTypingSignal(3000),
      ],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.intent).toBe('text_input');
  });

  // ─── T11.5: Both files missing (graceful) ──────────────────────────────

  test('returns empty signals when no data available', async () => {
    mockGcsDownload.mockRejectedValue(new Error('Not found'));

    const result = await worker.processTask(makeTask());

    expect(result.outputAssetIds).toEqual([]);
    expect(result.signals).toEqual([]);
  });

  test('works with only cursor data (typing file missing)', async () => {
    mockGcsDownload.mockImplementation(async (path: string) => {
      if (path.includes('cursor_movements.json')) {
        return Buffer.from(JSON.stringify([makeCursorSignal(1000)]));
      }
      throw new Error('Not found');
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.intent).toBe('navigation');
  });

  test('works with only typing data (cursor file missing)', async () => {
    mockGcsDownload.mockImplementation(async (path: string) => {
      if (path.includes('typing_events.json')) {
        return Buffer.from(JSON.stringify([makeTypingSignal(1000)]));
      }
      throw new Error('Not found');
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.intent).toBe('text_input');
  });

  // ─── T11.6: GCS output contract ────────────────────────────────────────

  test('writes to projects/{id}/signals/interaction_clusters.json', async () => {
    setGcsFiles({
      'cursor_movements.json': [makeCursorSignal(1000)],
      'typing_events.json': [],
    });

    await worker.processTask(makeTask({ projectId: 'proj-out' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-out/signals/interaction_clusters.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('signal file contains valid JSON array', async () => {
    setGcsFiles({
      'cursor_movements.json': [makeCursorSignal(1000)],
      'typing_events.json': [],
    });

    await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('interaction_clusters.json'),
    );
    const signals = JSON.parse(uploadCall![1].toString());
    expect(Array.isArray(signals)).toBe(true);
    expect(signals[0].signalType).toBe(SignalType.INTERACTION_CLUSTER);
  });

  test('does not upload signal file when no signals produced', async () => {
    mockGcsDownload.mockRejectedValue(new Error('Not found'));

    await worker.processTask(makeTask());

    expect(mockGcsUpload).not.toHaveBeenCalled();
  });

  // ─── Cluster label ─────────────────────────────────────────────────────

  test('cluster label includes intent and action count', async () => {
    setGcsFiles({
      'cursor_movements.json': [
        makeCursorSignal(1000),
        makeCursorSignal(2000),
        makeCursorSignal(3000),
      ],
      'typing_events.json': [],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.clusterLabel).toBe('navigation (3 actions)');
  });

  // ─── Signal shape ──────────────────────────────────────────────────────

  test('signal confidence is 0.75', async () => {
    setGcsFiles({
      'cursor_movements.json': [makeCursorSignal(1000)],
      'typing_events.json': [],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.confidence).toBe(0.75);
  });

  test('interactions include type and position', async () => {
    setGcsFiles({
      'cursor_movements.json': [makeCursorSignal(1000)],
      'typing_events.json': [],
    });

    const result = await worker.processTask(makeTask());
    const interactions = result.signals[0]!.payload.interactions;

    expect(interactions).toHaveLength(1);
    expect(interactions[0].type).toBe('click');
    expect(interactions[0].position).toEqual({ x: 100, y: 200 });
  });

  test('typing signal position extracted from inputRegion', async () => {
    setGcsFiles({
      'cursor_movements.json': [],
      'typing_events.json': [makeTypingSignal(1000)],
    });

    const result = await worker.processTask(makeTask());
    const interactions = result.signals[0]!.payload.interactions;

    expect(interactions[0].type).toBe('type');
    expect(interactions[0].position).toEqual({ x: 50, y: 100 });
  });

  // ─── Metadata ──────────────────────────────────────────────────────────

  test('worker declares INTERACTION_PATTERN task type', () => {
    expect(worker.taskType).toBe(TaskType.INTERACTION_PATTERN);
  });

  test('outputAssetIds is always empty', async () => {
    setGcsFiles({
      'cursor_movements.json': [makeCursorSignal(1000)],
      'typing_events.json': [],
    });

    const result = await worker.processTask(makeTask());

    expect(result.outputAssetIds).toEqual([]);
  });
});
