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
    workerId: 'timeline-builder-test-1',
    workerName: 'timeline-builder',
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

import { TimelineBuilderWorker } from '../src/worker.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: 'task-1',
    projectId: 'proj-abc',
    taskType: 'TIMELINE_BUILD',
    inputAssetIds: ['source-video-proj-abc'],
    config: {},
    ...overrides,
  };
}

function makeEditDecision(overrides: Record<string, unknown> = {}) {
  return {
    signalType: SignalType.EDIT_DECISION,
    timestampMs: 0,
    durationMs: 10000,
    confidence: 0.8,
    payload: {
      editType: 'cut',
      sourceStartMs: 0,
      sourceEndMs: 10000,
      outputStartMs: 0,
      outputEndMs: 10000,
      parameters: {},
      ...overrides,
    },
  };
}

const defaultEditDecisions = [
  makeEditDecision({
    editType: 'cut',
    sourceStartMs: 0,
    sourceEndMs: 10000,
    outputStartMs: 0,
    outputEndMs: 10000,
    parameters: {},
  }),
  makeEditDecision({
    editType: 'speedup',
    sourceStartMs: 10000,
    sourceEndMs: 40000,
    outputStartMs: 10000,
    outputEndMs: 25000,
    parameters: { speed: 2.0 },
  }),
  makeEditDecision({
    editType: 'zoom',
    sourceStartMs: 45000,
    sourceEndMs: 55000,
    outputStartMs: 25000,
    outputEndMs: 35000,
    parameters: { zoomLevel: 1.5 },
  }),
];

function setEditPlanData(edits: unknown[]) {
  mockGcsDownload.mockResolvedValue(Buffer.from(JSON.stringify(edits)));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('TimelineBuilderWorker', () => {
  let worker: TimelineBuilderWorker;

  beforeEach(() => {
    mockGcsUpload.mockResolvedValue(undefined);
    setEditPlanData(defaultEditDecisions);
    worker = new TimelineBuilderWorker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── T15.1: Video track construction ──────────────────────────────────

  test('creates video clips from edit decisions', async () => {
    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack).toHaveLength(3);
  });

  test('video clips have correct source time ranges', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 5000,
        sourceEndMs: 15000,
        outputStartMs: 0,
        outputEndMs: 10000,
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].sourceStartMs).toBe(5000);
    expect(timeline.videoTrack[0].sourceEndMs).toBe(15000);
  });

  test('video clips have correct output time ranges', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 0,
        sourceEndMs: 10000,
        outputStartMs: 5000,
        outputEndMs: 15000,
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].startMs).toBe(5000);
    expect(timeline.videoTrack[0].endMs).toBe(15000);
  });

  test('speedup edit produces speed effect on video clip', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'speedup',
        sourceStartMs: 0,
        sourceEndMs: 10000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: { speed: 2.0 },
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects).toEqual([
      { type: 'speed', params: { rate: 2.0 } },
    ]);
  });

  test('slowdown edit produces speed effect on video clip', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'slowdown',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 10000,
        parameters: { speed: 0.5 },
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects).toEqual([
      { type: 'speed', params: { rate: 0.5 } },
    ]);
  });

  test('zoom edit produces zoom effect on video clip', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'zoom',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: { zoomLevel: 2.0 },
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects).toEqual([
      { type: 'zoom', params: { level: 2.0 } },
    ]);
  });

  test('pan edit produces pan effect on video clip', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'pan',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: { x: 100, y: 50 },
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects).toEqual([
      { type: 'pan', params: { x: 100, y: 50 } },
    ]);
  });

  test('transition edit produces transition effect', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'transition',
        sourceStartMs: 0,
        sourceEndMs: 1000,
        outputStartMs: 0,
        outputEndMs: 1000,
        parameters: { transitionType: 'dissolve' },
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects[0].type).toBe('transition');
    expect(timeline.videoTrack[0].effects[0].params.transitionType).toBe('dissolve');
  });

  test('cut and trim edits have no effects', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: {},
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects).toEqual([]);
  });

  // ─── T15.2: Audio track construction ──────────────────────────────────

  test('creates audio clips mirroring video clips for non-visual edits', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 0,
        sourceEndMs: 10000,
        outputStartMs: 0,
        outputEndMs: 10000,
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack).toHaveLength(1);
    expect(timeline.audioTrack[0].trackType).toBe('audio');
  });

  test('zoom edits do NOT get audio clips', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'zoom',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: { zoomLevel: 1.5 },
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack).toHaveLength(0);
  });

  test('pan edits do NOT get audio clips', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'pan',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: {},
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack).toHaveLength(0);
  });

  test('overlay edits do NOT get audio clips', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'overlay',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: {},
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack).toHaveLength(0);
  });

  test('audio clip references audio-{projectId} as sourceAssetId', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
      }),
    ]);

    const result = await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack[0].sourceAssetId).toBe('audio-proj-xyz');
  });

  // ─── T15.3: Speed effect inheritance ──────────────────────────────────

  test('audio clips inherit speed effects from video clips', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'speedup',
        sourceStartMs: 0,
        sourceEndMs: 10000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: { speed: 2.0 },
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack[0].effects).toEqual([
      { type: 'speed', params: { rate: 2.0 } },
    ]);
  });

  test('slowdown audio clips inherit speed factor', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'slowdown',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 10000,
        parameters: { speed: 0.5 },
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack[0].effects).toEqual([
      { type: 'speed', params: { rate: 0.5 } },
    ]);
  });

  test('non-speed audio clips have empty effects', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack[0].effects).toEqual([]);
  });

  // ─── T15.4: Clip ordering ────────────────────────────────────────────

  test('clips sorted by outputStartMs', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 20000,
        sourceEndMs: 30000,
        outputStartMs: 20000,
        outputEndMs: 30000,
      }),
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 0,
        sourceEndMs: 10000,
        outputStartMs: 0,
        outputEndMs: 10000,
      }),
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 10000,
        sourceEndMs: 20000,
        outputStartMs: 10000,
        outputEndMs: 20000,
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    const startTimes = timeline.videoTrack.map((c: { startMs: number }) => c.startMs);
    expect(startTimes).toEqual([0, 10000, 20000]);
  });

  // ─── T15.5: Timeline JSON schema ─────────────────────────────────────

  test('timeline has videoTrack and audioTrack arrays', async () => {
    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(Array.isArray(timeline.videoTrack)).toBe(true);
    expect(Array.isArray(timeline.audioTrack)).toBe(true);
  });

  test('video clip has required fields', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'cut',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    const clip = timeline.videoTrack[0];
    expect(clip).toHaveProperty('trackIndex', 0);
    expect(clip).toHaveProperty('trackType', 'video');
    expect(clip).toHaveProperty('clipId');
    expect(clip).toHaveProperty('startMs');
    expect(clip).toHaveProperty('endMs');
    expect(clip).toHaveProperty('sourceAssetId');
    expect(clip).toHaveProperty('sourceStartMs');
    expect(clip).toHaveProperty('sourceEndMs');
    expect(clip).toHaveProperty('effects');
  });

  test('clip IDs are zero-padded to 4 digits', async () => {
    setEditPlanData([
      makeEditDecision({ editType: 'cut', sourceStartMs: 0, sourceEndMs: 1000, outputStartMs: 0, outputEndMs: 1000 }),
      makeEditDecision({ editType: 'cut', sourceStartMs: 1000, sourceEndMs: 2000, outputStartMs: 1000, outputEndMs: 2000 }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].clipId).toBe('clip-0000');
    expect(timeline.videoTrack[1].clipId).toBe('clip-0001');
  });

  test('audio clip IDs have -audio suffix', async () => {
    setEditPlanData([
      makeEditDecision({ editType: 'cut', sourceStartMs: 0, sourceEndMs: 5000, outputStartMs: 0, outputEndMs: 5000 }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.audioTrack[0].clipId).toBe('clip-0000-audio');
  });

  // ─── T15.6: GCS output contract ──────────────────────────────────────

  test('writes to projects/{id}/timeline/timeline.json', async () => {
    await worker.processTask(makeTask({ projectId: 'proj-timeline' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-timeline/timeline/timeline.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('downloads edit_plan.json from correct project path', async () => {
    await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-xyz/signals/edit_plan.json');
  });

  // ─── Signals ──────────────────────────────────────────────────────────

  test('produces TIMELINE_EVENT signals for all clips', async () => {
    const result = await worker.processTask(makeTask());

    for (const signal of result.signals) {
      expect(signal.signalType).toBe(SignalType.TIMELINE_EVENT);
    }
  });

  test('signal count equals video clips + audio clips', async () => {
    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    const expectedSignals = timeline.videoTrack.length + timeline.audioTrack.length;
    expect(result.signals).toHaveLength(expectedSignals);
  });

  test('timeline signals have confidence 1.0', async () => {
    const result = await worker.processTask(makeTask());

    for (const signal of result.signals) {
      expect(signal.confidence).toBe(1.0);
    }
  });

  // ─── Metadata ──────────────────────────────────────────────────────────

  test('worker declares TIMELINE_BUILD task type', () => {
    expect(worker.taskType).toBe(TaskType.TIMELINE_BUILD);
  });

  test('outputAssetIds includes timeline-{projectId}', async () => {
    const result = await worker.processTask(makeTask({ projectId: 'proj-out' }));

    expect(result.outputAssetIds).toEqual(['timeline-proj-out']);
  });

  // ─── Error paths ──────────────────────────────────────────────────────

  test('throws when edit_plan.json not in GCS', async () => {
    mockGcsDownload.mockRejectedValue(new Error('File not found'));

    await expect(worker.processTask(makeTask())).rejects.toThrow();
  });

  // ─── Default speed values ─────────────────────────────────────────────

  test('speedup defaults to rate 2.0 when speed param missing', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'speedup',
        sourceStartMs: 0,
        sourceEndMs: 10000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: {},
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects[0].params.rate).toBe(2.0);
  });

  test('slowdown defaults to rate 0.5 when speed param missing', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'slowdown',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 10000,
        parameters: {},
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects[0].params.rate).toBe(0.5);
  });

  test('zoom defaults to level 1.5 when zoomLevel param missing', async () => {
    setEditPlanData([
      makeEditDecision({
        editType: 'zoom',
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: {},
      }),
    ]);

    const result = await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('timeline.json'),
    );
    const timeline = JSON.parse(uploadCall![1].toString());
    expect(timeline.videoTrack[0].effects[0].params.level).toBe(1.5);
  });
});
