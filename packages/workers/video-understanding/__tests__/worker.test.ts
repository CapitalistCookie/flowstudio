import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskType, SignalType } from '@flowstudio/shared';
import { type TaskData, type WorkerDeps } from '@flowstudio/worker-shared';

// ─── Mock deps factory ──────────────────────────────────────────────────────────

function createMockDeps(): WorkerDeps & {
  mockGcsUpload: ReturnType<typeof vi.fn>;
  mockGcsDownload: ReturnType<typeof vi.fn>;
  mockGcsExists: ReturnType<typeof vi.fn>;
} {
  const mockGcsUpload = vi.fn().mockResolvedValue(undefined);
  const mockGcsDownload = vi.fn().mockResolvedValue(Buffer.from('fake-jpeg-data'));
  const mockGcsExists = vi.fn().mockResolvedValue(true);

  return {
    config: {
      stdbHost: 'localhost:3000',
      stdbModule: 'flowstudio',
      gcsBucket: 'test-bucket',
      gcsProjectId: 'test-project',
      workerId: 'video-understanding-test-1',
      workerName: 'video-understanding',
      concurrency: 2,
      pollIntervalMs: 100,
      healthPort: 0,
      googleAiApiKey: 'test-google-ai-key',
      googleAiModel: 'gemini-2.0-flash',
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

// ─── Gemini mock ───────────────────────────────────────────────────────────────

const mockGenerateContent = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  },
}));

import { VideoUnderstandingWorker } from '../src/worker.js';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('VideoUnderstandingWorker', () => {
  let worker: VideoUnderstandingWorker;
  let mockGcsUpload: ReturnType<typeof vi.fn>;
  let mockGcsDownload: ReturnType<typeof vi.fn>;
  let mockGcsExists: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const deps = createMockDeps();
    mockGcsUpload = deps.mockGcsUpload;
    mockGcsDownload = deps.mockGcsDownload;
    mockGcsExists = deps.mockGcsExists;
    worker = new VideoUnderstandingWorker(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeTask(overrides: Partial<TaskData> = {}): TaskData {
    return {
      id: 'task-1',
      projectId: 'proj-abc',
      taskType: 'VIDEO_UNDERSTANDING',
      inputAssetIds: ['frame-0000', 'frame-0001', 'frame-0002'],
      config: {},
      ...overrides,
    };
  }

  function setGeminiResponse(changes: Array<{ description: string; changeType: string; significance: number }>) {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(changes) },
    });
  }

  function setGeminiTextResponse(text: string) {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => text },
    });
  }

  // ─── T9.1: Frame batch processing ───────────────────────────────────────

  test('processes frames in batches of 4', async () => {
    const tenFrames = Array.from({ length: 10 }, (_, i) =>
      `frame-${String(i).padStart(4, '0')}`,
    );
    setGeminiResponse([]);

    await worker.processTask(makeTask({ inputAssetIds: tenFrames }));

    expect(mockGenerateContent).toHaveBeenCalledTimes(3); // 4 + 4 + 2
  });

  test('batch of 4 frames downloads all 4', async () => {
    const fourFrames = ['frame-0000', 'frame-0001', 'frame-0002', 'frame-0003'];
    setGeminiResponse([]);

    await worker.processTask(makeTask({
      projectId: 'proj-batch',
      inputAssetIds: fourFrames,
    }));

    expect(mockGcsDownload).toHaveBeenCalledTimes(4);
    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-batch/frame_sample/frame-0000.jpg');
    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-batch/frame_sample/frame-0003.jpg');
  });

  test('single frame batch also works', async () => {
    setGeminiResponse([]);

    await worker.processTask(makeTask({ inputAssetIds: ['frame-0000'] }));

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGcsDownload).toHaveBeenCalledTimes(1);
  });

  // ─── T9.2: Frame download from correct GCS path ─────────────────────────

  test('reads frames from projects/{id}/frame_sample/{assetId}.jpg', async () => {
    setGeminiResponse([]);

    await worker.processTask(makeTask({
      projectId: 'proj-frames',
      inputAssetIds: ['frame-0005'],
    }));

    expect(mockGcsExists).toHaveBeenCalledWith('projects/proj-frames/frame_sample/frame-0005.jpg');
    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-frames/frame_sample/frame-0005.jpg');
  });

  test('skips frames that do not exist in GCS', async () => {
    mockGcsExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    setGeminiResponse([]);

    await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001', 'frame-0002'],
    }));

    expect(mockGcsDownload).toHaveBeenCalledTimes(2);
  });

  test('skips entire batch if no frames exist', async () => {
    mockGcsExists.mockResolvedValue(false);
    setGeminiResponse([]);

    const result = await worker.processTask(makeTask({
      inputAssetIds: ['frame-0000', 'frame-0001'],
    }));

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.signals).toEqual([]);
  });

  // ─── T9.3: JSON extraction from LLM response ───────────────────────────

  test('extracts JSON array from Gemini response with surrounding text', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => `Here's my analysis:\n${JSON.stringify([
          { description: 'UI changed', changeType: 'navigation', significance: 0.8 },
        ])}\nHope that helps!`,
      },
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.signalType).toBe(SignalType.SCENE_CHANGE);
    expect(result.signals[0]!.payload.description).toBe('UI changed');
  });

  test('multiple changes in one response produce multiple signals', async () => {
    setGeminiResponse([
      { description: 'Navigation', changeType: 'navigation', significance: 0.9 },
      { description: 'Modal opened', changeType: 'modal', significance: 0.7 },
    ]);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]!.payload.description).toBe('Navigation');
    expect(result.signals[1]!.payload.description).toBe('Modal opened');
  });

  test('significance maps to signal confidence', async () => {
    setGeminiResponse([
      { description: 'High significance', changeType: 'navigation', significance: 0.95 },
    ]);

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.confidence).toBe(0.95);
    expect(result.signals[0]!.payload.changeScore).toBe(0.95);
  });

  test('empty array response produces zero signals', async () => {
    setGeminiResponse([]);

    const result = await worker.processTask(makeTask());

    expect(result.signals).toEqual([]);
  });

  // ─── T9.4: LLM returns non-JSON (graceful) ──────────────────────────────

  test('logs warning and continues when Gemini returns non-JSON', async () => {
    setGeminiTextResponse('I cannot analyze these frames, sorry.');

    const result = await worker.processTask(makeTask());

    expect(result.signals).toEqual([]);
  });

  test('continues processing subsequent batches after JSON parse failure', async () => {
    const eightFrames = Array.from({ length: 8 }, (_, i) =>
      `frame-${String(i).padStart(4, '0')}`,
    );

    mockGenerateContent
      .mockResolvedValueOnce({ response: { text: () => 'not json' } })
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify([
            { description: 'Change in batch 2', changeType: 'navigation', significance: 0.8 },
          ]),
        },
      });

    const result = await worker.processTask(makeTask({ inputAssetIds: eightFrames }));

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.description).toBe('Change in batch 2');
  });

  // ─── T9.5: Timestamp calculation ────────────────────────────────────────

  test('calculates timestamps using batch start index * 2000ms', async () => {
    const eightFrames = Array.from({ length: 8 }, (_, i) =>
      `frame-${String(i).padStart(4, '0')}`,
    );

    mockGenerateContent
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify([
            { description: 'Batch 0 change', changeType: 'navigation', significance: 0.5 },
          ]),
        },
      })
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify([
            { description: 'Batch 1 change', changeType: 'modal', significance: 0.7 },
          ]),
        },
      });

    const result = await worker.processTask(makeTask({ inputAssetIds: eightFrames }));

    expect(result.signals[0]!.timestampMs).toBe(0);       // batch start index 0 * 2000
    expect(result.signals[0]!.payload.frameIndex).toBe(0);
    expect(result.signals[1]!.timestampMs).toBe(8000);     // batch start index 4 * 2000
    expect(result.signals[1]!.payload.frameIndex).toBe(4);
  });

  test('signal durationMs is always 0', async () => {
    setGeminiResponse([
      { description: 'Some change', changeType: 'scroll', significance: 0.6 },
    ]);

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.durationMs).toBe(0);
  });

  // ─── T9.6: Output contract ──────────────────────────────────────────────

  test('writes to projects/{id}/signals/scene_descriptions.json', async () => {
    setGeminiResponse([
      { description: 'Change', changeType: 'navigation', significance: 0.8 },
    ]);

    await worker.processTask(makeTask({ projectId: 'proj-scene' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-scene/signals/scene_descriptions.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('signal file contains valid JSON array', async () => {
    setGeminiResponse([
      { description: 'Change', changeType: 'navigation', significance: 0.8 },
    ]);

    await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('scene_descriptions.json'),
    );
    const signals = JSON.parse(uploadCall![1].toString());
    expect(Array.isArray(signals)).toBe(true);
    expect(signals[0].signalType).toBe(SignalType.SCENE_CHANGE);
  });

  test('does not upload signal file when no signals produced', async () => {
    setGeminiResponse([]);

    await worker.processTask(makeTask());

    expect(mockGcsUpload).not.toHaveBeenCalled();
  });

  // ─── Missing API key ────────────────────────────────────────────────────

  test('throws descriptive error when GOOGLE_AI_API_KEY not set', async () => {
    const depsNoKey = createMockDeps();
    (depsNoKey.config as any).googleAiApiKey = undefined;

    const workerNoKey = new VideoUnderstandingWorker(depsNoKey);
    await expect(workerNoKey.processTask(makeTask())).rejects.toThrow('GOOGLE_AI_API_KEY');
  });

  // ─── Missing input ──────────────────────────────────────────────────────

  test('throws when no frame assets provided', async () => {
    await expect(
      worker.processTask(makeTask({ inputAssetIds: [] })),
    ).rejects.toThrow('No frame assets');
  });

  // ─── Gemini call verification ───────────────────────────────────────────

  test('sends frame data as base64 inline parts to Gemini', async () => {
    const fakeFrame = Buffer.from('jpeg-frame-bytes');
    mockGcsDownload.mockResolvedValue(fakeFrame);
    setGeminiResponse([]);

    await worker.processTask(makeTask({ inputAssetIds: ['frame-0000'] }));

    const callArgs = mockGenerateContent.mock.calls[0]![0];
    const imagePart = callArgs[0];
    expect(imagePart.inlineData.data).toBe(fakeFrame.toString('base64'));
    expect(imagePart.inlineData.mimeType).toBe('image/jpeg');
  });

  test('prompt text is included after image parts', async () => {
    setGeminiResponse([]);

    await worker.processTask(makeTask({ inputAssetIds: ['frame-0000'] }));

    const callArgs = mockGenerateContent.mock.calls[0]![0];
    const textPart = callArgs[callArgs.length - 1];
    expect(textPart.text).toContain('Analyze');
    expect(textPart.text).toContain('JSON');
  });

  // ─── Metadata ───────────────────────────────────────────────────────────

  test('worker declares VIDEO_UNDERSTANDING task type', () => {
    expect(worker.taskType).toBe(TaskType.VIDEO_UNDERSTANDING);
  });

  test('outputAssetIds is always empty', async () => {
    setGeminiResponse([
      { description: 'Change', changeType: 'navigation', significance: 0.8 },
    ]);

    const result = await worker.processTask(makeTask());

    expect(result.outputAssetIds).toEqual([]);
  });
});
