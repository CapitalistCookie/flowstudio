import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskType } from '@flowstudio/shared';
import { type TaskData, type WorkerDeps } from '@flowstudio/worker-shared';

// ─── FFmpeg mock (using vi.hoisted to avoid initialization order issues) ──────

const {
  mockFfmpegInstance,
  capturedState,
  mockRm,
} = vi.hoisted(() => {
  const state = { filterComplex: null as string | null, outputOptions: [] as string[] };
  const instance: Record<string, any> = {};

  instance.complexFilter = vi.fn(function (filter: string) {
    state.filterComplex = filter;
    return instance;
  });
  instance.outputOptions = vi.fn(function (opts: string[]) {
    state.outputOptions.push(...opts);
    return instance;
  });
  instance.videoCodec = vi.fn(function () { return instance; });
  instance.audioCodec = vi.fn(function () { return instance; });
  instance.output = vi.fn(function () { return instance; });
  instance.on = vi.fn(function (event: string, cb: (...args: unknown[]) => void) {
    if (event === 'end') setTimeout(() => cb(), 0);
    return instance;
  });
  instance.run = vi.fn();

  return {
    mockFfmpegInstance: instance,
    capturedState: state,
    mockRm: vi.fn(async () => {}),
  };
});

vi.mock('fluent-ffmpeg', () => {
  const fn: any = vi.fn(() => mockFfmpegInstance);
  fn.setFfmpegPath = vi.fn();
  return { default: fn };
});

vi.mock('@ffmpeg-installer/ffmpeg', () => ({
  path: '/usr/local/bin/ffmpeg',
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    createWriteStream: vi.fn(() => {
      const writable: Record<string, any> = {};
      writable.write = vi.fn();
      writable.end = vi.fn();
      writable.on = vi.fn((event: string, cb: () => void) => {
        if (event === 'finish') setTimeout(cb, 0);
        return writable;
      });
      return writable;
    }),
    createReadStream: vi.fn(() => {
      const readable: Record<string, any> = {};
      readable.on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'data') setTimeout(() => cb(Buffer.from('rendered-video-data')), 0);
        if (event === 'end') setTimeout(() => cb(), 5);
        return readable;
      });
      return readable;
    }),
  };
});

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    mkdtemp: vi.fn(async () => '/tmp/render-test'),
    rm: mockRm,
  };
});

import { RenderWorker } from '../src/worker.js';

// ─── Mock factory ───────────────────────────────────────────────────────────────

function createMockDeps(): WorkerDeps & {
  mockGcsUpload: ReturnType<typeof vi.fn>;
  mockGcsDownload: ReturnType<typeof vi.fn>;
  mockGcsExists: ReturnType<typeof vi.fn>;
} {
  const mockGcsUpload = vi.fn().mockResolvedValue(undefined);
  const mockGcsDownload = vi.fn().mockResolvedValue(Buffer.from('[]'));
  const mockGcsExists = vi.fn().mockResolvedValue(true);

  return {
    config: {
      stdbHost: 'localhost:3000',
      stdbModule: 'flowstudio',
      gcsBucket: 'test-bucket',
      gcsProjectId: 'test-project',
      workerId: 'render-test-1',
      workerName: 'render',
      concurrency: 1,
      pollIntervalMs: 100,
      healthPort: 0,
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    gcs: {
      upload: mockGcsUpload,
      download: mockGcsDownload,
      exists: mockGcsExists,
      listFiles: vi.fn().mockResolvedValue([`projects/proj-abc/source_video/recording.webm`]),
      getSignedUploadUrl: vi.fn(),
      getSignedDownloadUrl: vi.fn(),
    } as any,
    stdb: {
      callReducer: vi.fn().mockResolvedValue(undefined),
      queryTable: vi.fn().mockImplementation(async (table: string) => {
        if (table === 'assets') {
          return [
            { projectId: 'proj-abc', assetType: 'source_video', gcsPath: 'projects/proj-abc/source_video/recording.webm' },
            { projectId: 'proj-xyz', assetType: 'source_video', gcsPath: 'projects/proj-xyz/source_video/video.mp4' },
            { projectId: 'proj-render', assetType: 'source_video', gcsPath: 'projects/proj-render/source_video/recording.webm' },
          ];
        }
        return [];
      }),
      isConnected: true,
      disconnect: vi.fn(),
    } as any,
    mockGcsUpload,
    mockGcsDownload,
    mockGcsExists,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: 'task-1',
    projectId: 'proj-abc',
    taskType: 'RENDER',
    inputAssetIds: ['source.mp4'],
    config: {},
    ...overrides,
  };
}

interface TimelineClip {
  clipId: string;
  startMs: number;
  endMs: number;
  sourceAssetId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  effects: Array<{ type: string; params: Record<string, unknown> }>;
}

function makeTimeline(videoTrack: TimelineClip[], audioTrack: TimelineClip[] = []) {
  return { videoTrack, audioTrack };
}

function makeVideoClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    clipId: 'clip-0000',
    startMs: 0,
    endMs: 10000,
    sourceAssetId: 'source.mp4',
    sourceStartMs: 0,
    sourceEndMs: 10000,
    effects: [],
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('RenderWorker', () => {
  let worker: RenderWorker;
  let mockGcsUpload: ReturnType<typeof vi.fn>;
  let mockGcsDownload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedState.filterComplex = null;
    capturedState.outputOptions = [];
    vi.clearAllMocks();

    const deps = createMockDeps();
    mockGcsUpload = deps.mockGcsUpload;
    mockGcsDownload = deps.mockGcsDownload;

    const singleClipTimeline = makeTimeline([
      makeVideoClip({ sourceStartMs: 0, sourceEndMs: 10000, startMs: 0, endMs: 10000 }),
    ]);
    setTimelineAndVideo(singleClipTimeline);
    worker = new RenderWorker(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function setTimelineAndVideo(timeline: { videoTrack: TimelineClip[]; audioTrack: TimelineClip[] }) {
    mockGcsDownload.mockImplementation(async (path: string) => {
      if (path.includes('timeline.json')) {
        return Buffer.from(JSON.stringify(timeline));
      }
      if (path.includes('source_video')) {
        return Buffer.from('fake-video-data');
      }
      throw new Error(`File not found: ${path}`);
    });
  }

  // ─── T16.1: Filter complex generation ─────────────────────────────────

  test('builds FFmpeg filter_complex from timeline', async () => {
    const timeline = makeTimeline([
      makeVideoClip({ clipId: 'clip-0000', sourceStartMs: 0, sourceEndMs: 5000 }),
      makeVideoClip({ clipId: 'clip-0001', sourceStartMs: 10000, sourceEndMs: 20000 }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).not.toBeNull();
    expect(capturedState.filterComplex).toContain('trim=');
    expect(capturedState.filterComplex).toContain('setpts=');
    expect(capturedState.filterComplex).toContain('concat=');
  });

  test('filter_complex includes trim with correct timestamps', async () => {
    const timeline = makeTimeline([
      makeVideoClip({ sourceStartMs: 5000, sourceEndMs: 15000 }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('trim=start=5:end=15');
  });

  test('filter_complex includes atrim for audio', async () => {
    const timeline = makeTimeline([
      makeVideoClip({ sourceStartMs: 0, sourceEndMs: 10000 }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('atrim=start=0:end=10');
    expect(capturedState.filterComplex).toContain('asetpts=PTS-STARTPTS');
  });

  // ─── T16.2: Speed change in filter ────────────────────────────────────

  test('setpts includes speed factor: (PTS-STARTPTS)/speed', async () => {
    const timeline = makeTimeline([
      makeVideoClip({
        sourceStartMs: 0,
        sourceEndMs: 10000,
        effects: [{ type: 'speed', params: { rate: 2.0 } }],
      }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('setpts=(PTS-STARTPTS)/2');
  });

  test('atempo matches speed factor', async () => {
    const timeline = makeTimeline([
      makeVideoClip({
        sourceStartMs: 0,
        sourceEndMs: 10000,
        effects: [{ type: 'speed', params: { rate: 2.0 } }],
      }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('atempo=2');
  });

  test('speed 1.0 (no effect) produces default setpts', async () => {
    const timeline = makeTimeline([
      makeVideoClip({ sourceStartMs: 0, sourceEndMs: 10000, effects: [] }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('setpts=(PTS-STARTPTS)/1');
  });

  // ─── T16.3: Concat order ──────────────────────────────────────────────

  test('concat=n=N:v=1:a=1 with correct N', async () => {
    const timeline = makeTimeline([
      makeVideoClip({ clipId: 'c0', sourceStartMs: 0, sourceEndMs: 5000 }),
      makeVideoClip({ clipId: 'c1', sourceStartMs: 5000, sourceEndMs: 10000 }),
      makeVideoClip({ clipId: 'c2', sourceStartMs: 10000, sourceEndMs: 15000 }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('concat=n=3:v=1:a=1');
  });

  test('single clip has concat=n=1', async () => {
    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('concat=n=1:v=1:a=1');
  });

  test('concat produces [outv] and [outa] output labels', async () => {
    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('[outv][outa]');
  });

  // ─── T16.4: Output codec settings ────────────────────────────────────

  test('uses libx264 video codec', async () => {
    await worker.processTask(makeTask());

    expect(mockFfmpegInstance.videoCodec).toHaveBeenCalledWith('libx264');
  });

  test('uses aac audio codec', async () => {
    await worker.processTask(makeTask());

    expect(mockFfmpegInstance.audioCodec).toHaveBeenCalledWith('aac');
  });

  test('uses CRF 23 and fast preset', async () => {
    await worker.processTask(makeTask());

    expect(capturedState.outputOptions).toContain('-crf');
    expect(capturedState.outputOptions).toContain('23');
    expect(capturedState.outputOptions).toContain('-preset');
    expect(capturedState.outputOptions).toContain('fast');
  });

  test('uses faststart movflags for streaming', async () => {
    await worker.processTask(makeTask());

    expect(capturedState.outputOptions).toContain('-movflags');
    expect(capturedState.outputOptions).toContain('+faststart');
  });

  // ─── T16.5: Missing timeline (throws) ─────────────────────────────────

  test('throws when timeline.json not in GCS', async () => {
    mockGcsDownload.mockRejectedValue(new Error('File not found: timeline.json'));

    await expect(worker.processTask(makeTask())).rejects.toThrow();
  });

  // ─── T16.6: Missing source video (throws) ─────────────────────────────

  test('throws when source video not in GCS', async () => {
    mockGcsDownload.mockImplementation(async (path: string) => {
      if (path.includes('timeline.json')) {
        return Buffer.from(JSON.stringify(makeTimeline([
          makeVideoClip({ sourceStartMs: 0, sourceEndMs: 5000 }),
        ])));
      }
      throw new Error('File not found: source video');
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow();
  });

  // ─── T16.7: GCS output contract ──────────────────────────────────────

  test('writes to projects/{id}/rendered_video/output.mp4', async () => {
    await worker.processTask(makeTask({ projectId: 'proj-render' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-render/rendered_video/output.mp4',
      expect.any(Buffer),
      'video/mp4',
    );
  });

  test('downloads timeline from correct project path', async () => {
    await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-xyz/timeline/timeline.json');
  });

  test('downloads source video from correct project path', async () => {
    const timeline = makeTimeline([makeVideoClip()]);
    mockGcsDownload.mockImplementation(async (path: string) => {
      if (path.includes('timeline.json')) return Buffer.from(JSON.stringify(timeline));
      return Buffer.from('fake-video');
    });

    await worker.processTask(makeTask({ projectId: 'proj-xyz', inputAssetIds: ['video.mp4'] }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-xyz/source_video/video.mp4');
  });

  // ─── Empty timeline ───────────────────────────────────────────────────

  test('empty timeline produces no filter_complex', async () => {
    setTimelineAndVideo(makeTimeline([], []));

    await worker.processTask(makeTask());

    expect(mockFfmpegInstance.complexFilter).not.toHaveBeenCalled();
  });

  // ─── Metadata ──────────────────────────────────────────────────────────

  test('worker declares RENDER task type', () => {
    expect(worker.taskType).toBe(TaskType.RENDER);
  });

  test('outputAssetIds includes rendered-{projectId}', async () => {
    const result = await worker.processTask(makeTask({ projectId: 'proj-out' }));

    expect(result.outputAssetIds).toEqual(['rendered-proj-out']);
  });

  test('returns empty signals array', async () => {
    const result = await worker.processTask(makeTask());

    expect(result.signals).toEqual([]);
  });

  // ─── Temp dir cleanup ─────────────────────────────────────────────────

  test('cleans up temp directory after success', async () => {
    await worker.processTask(makeTask());

    expect(mockRm).toHaveBeenCalledWith('/tmp/render-test', { recursive: true, force: true });
  });

  test('cleans up temp directory after failure', async () => {
    mockGcsDownload.mockRejectedValue(new Error('Failure'));

    try { await worker.processTask(makeTask()); } catch {}

    expect(mockRm).toHaveBeenCalledWith('/tmp/render-test', { recursive: true, force: true });
  });

  // ─── Filter chain structure ───────────────────────────────────────────

  test('each clip gets [v{i}] and [a{i}] labels', async () => {
    const timeline = makeTimeline([
      makeVideoClip({ clipId: 'c0', sourceStartMs: 0, sourceEndMs: 5000 }),
      makeVideoClip({ clipId: 'c1', sourceStartMs: 5000, sourceEndMs: 10000 }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('[v0]');
    expect(capturedState.filterComplex).toContain('[a0]');
    expect(capturedState.filterComplex).toContain('[v1]');
    expect(capturedState.filterComplex).toContain('[a1]');
  });

  test('concat input order matches clip order', async () => {
    const timeline = makeTimeline([
      makeVideoClip({ clipId: 'c0', sourceStartMs: 0, sourceEndMs: 5000 }),
      makeVideoClip({ clipId: 'c1', sourceStartMs: 5000, sourceEndMs: 10000 }),
    ]);
    setTimelineAndVideo(timeline);

    await worker.processTask(makeTask());

    expect(capturedState.filterComplex).toContain('[v0][a0][v1][a1]concat=n=2');
  });
});
