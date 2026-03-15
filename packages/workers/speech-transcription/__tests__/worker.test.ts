import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskType, SignalType } from '@flowstudio/shared';
import { type TaskData, type WorkerDeps } from '@flowstudio/worker-shared';

// ─── Mock deps factory ──────────────────────────────────────────────────────────

function createMockDeps(): WorkerDeps & {
  mockGcsUpload: ReturnType<typeof vi.fn>;
  mockGcsDownload: ReturnType<typeof vi.fn>;
} {
  const mockGcsUpload = vi.fn().mockResolvedValue(undefined);
  const mockGcsDownload = vi.fn().mockResolvedValue(Buffer.from('fake-audio-data'));

  return {
    config: {
      stdbHost: 'localhost:3000',
      stdbModule: 'flowstudio',
      gcsBucket: 'test-bucket',
      gcsProjectId: 'test-project',
      workerId: 'speech-transcription-test-1',
      workerName: 'speech-transcription',
      concurrency: 2,
      pollIntervalMs: 100,
      healthPort: 0,
      deepgramApiKey: 'test-deepgram-key',
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

// ─── Deepgram mock ────────────────────────────────────────────────────────────

const mockTranscribeFile = vi.fn();

vi.mock('@deepgram/sdk', () => ({
  createClient: () => ({
    listen: {
      prerecorded: {
        transcribeFile: mockTranscribeFile,
      },
    },
  }),
}));

import { SpeechTranscriptionWorker } from '../src/worker.js';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SpeechTranscriptionWorker', () => {
  let worker: SpeechTranscriptionWorker;
  let mockGcsUpload: ReturnType<typeof vi.fn>;
  let mockGcsDownload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const deps = createMockDeps();
    mockGcsUpload = deps.mockGcsUpload;
    mockGcsDownload = deps.mockGcsDownload;
    worker = new SpeechTranscriptionWorker(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeTask(overrides: Partial<TaskData> = {}): TaskData {
    return {
      id: 'task-1',
      projectId: 'proj-abc',
      taskType: 'SPEECH_TRANSCRIPTION',
      inputAssetIds: ['audio-proj-abc'],
      config: {},
      ...overrides,
    };
  }

  function makeDeepgramResponse(utterances: Array<{
    transcript: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: number;
    words?: Array<{ word: string; start: number; end: number; confidence: number }>;
  }>, detectedLanguage = 'en') {
    return {
      result: {
        results: {
          utterances,
          channels: [{ detected_language: detectedLanguage }],
        },
      },
    };
  }

  // ─── T8.1: Deepgram utterances → SPEECH_SEGMENT signals ──────────────────

  test('converts Deepgram utterances to SPEECH_SEGMENT signals', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      {
        transcript: 'Hello world',
        start: 0, end: 2.5, confidence: 0.98, speaker: 0,
        words: [
          { word: 'Hello', start: 0, end: 0.5, confidence: 0.98 },
          { word: 'world', start: 0.6, end: 1.0, confidence: 0.95 },
        ],
      },
    ]));

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.signalType).toBe(SignalType.SPEECH_SEGMENT);
    expect(result.signals[0]!.payload.text).toBe('Hello world');
  });

  test('word-level timing is preserved in milliseconds', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      {
        transcript: 'Hello world',
        start: 1.5, end: 3.0, confidence: 0.98,
        words: [
          { word: 'Hello', start: 1.5, end: 2.0, confidence: 0.98 },
          { word: 'world', start: 2.1, end: 3.0, confidence: 0.95 },
        ],
      },
    ]));

    const result = await worker.processTask(makeTask());
    const words = result.signals[0]!.payload.words;

    expect(words).toHaveLength(2);
    expect(words[0]).toEqual({ word: 'Hello', startMs: 1500, endMs: 2000, confidence: 0.98 });
    expect(words[1]).toEqual({ word: 'world', startMs: 2100, endMs: 3000, confidence: 0.95 });
  });

  test('signal timestampMs and durationMs derived from utterance start/end', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      {
        transcript: 'Testing timestamps',
        start: 5.0, end: 8.5, confidence: 0.90,
        words: [],
      },
    ]));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.timestampMs).toBe(5000);
    expect(result.signals[0]!.durationMs).toBe(3500);
  });

  test('multiple utterances produce multiple signals', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      { transcript: 'First sentence.', start: 0, end: 2.0, confidence: 0.95, words: [] },
      { transcript: 'Second sentence.', start: 3.0, end: 5.0, confidence: 0.92, words: [] },
      { transcript: 'Third sentence.', start: 6.0, end: 8.0, confidence: 0.88, words: [] },
    ]));

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(3);
    expect(result.signals[0]!.payload.text).toBe('First sentence.');
    expect(result.signals[1]!.payload.text).toBe('Second sentence.');
    expect(result.signals[2]!.payload.text).toBe('Third sentence.');
  });

  test('speaker ID preserved as string from Deepgram', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      { transcript: 'Speaker one', start: 0, end: 1.0, confidence: 0.95, speaker: 0, words: [] },
      { transcript: 'Speaker two', start: 2.0, end: 3.0, confidence: 0.90, speaker: 1, words: [] },
    ]));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.speakerId).toBe('0');
    expect(result.signals[1]!.payload.speakerId).toBe('1');
  });

  test('defaults speaker to "0" when not provided', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      { transcript: 'No speaker info', start: 0, end: 1.0, confidence: 0.95, words: [] },
    ]));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.speakerId).toBe('0');
  });

  test('confidence from utterance is propagated to signal', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      { transcript: 'Confident speech', start: 0, end: 1.0, confidence: 0.97, words: [] },
    ]));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.confidence).toBe(0.97);
  });

  test('detected language propagated to signal payload', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse(
      [{ transcript: 'Hola mundo', start: 0, end: 1.0, confidence: 0.95, words: [] }],
      'es',
    ));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.language).toBe('es');
  });

  test('defaults language to "en" when not detected', async () => {
    mockTranscribeFile.mockResolvedValue({
      result: {
        results: {
          utterances: [
            { transcript: 'Hello', start: 0, end: 1.0, confidence: 0.95, words: [] },
          ],
          channels: [{}],
        },
      },
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.language).toBe('en');
  });

  // ─── T8.2: Transcript JSON upload ────────────────────────────────────────

  test('uploads full transcript to projects/{id}/transcript/transcript.json', async () => {
    const deepgramResult = makeDeepgramResponse([
      { transcript: 'Hello', start: 0, end: 1.0, confidence: 0.95, words: [] },
    ]);
    mockTranscribeFile.mockResolvedValue(deepgramResult);

    await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-xyz/transcript/transcript.json',
      expect.any(Buffer),
      'application/json',
    );

    const transcriptUploadCall = mockGcsUpload.mock.calls.find(
      (c) => c[0] === 'projects/proj-xyz/transcript/transcript.json',
    );
    const uploadedData = JSON.parse(transcriptUploadCall![1].toString());
    expect(uploadedData.results.utterances).toBeDefined();
  });

  // ─── T8.3: Signal file upload ────────────────────────────────────────────

  test('writes speech segments to projects/{id}/signals/speech_segments.json', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      { transcript: 'Hello', start: 0, end: 1.0, confidence: 0.95, words: [] },
    ]));

    await worker.processTask(makeTask({ projectId: 'proj-signals' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-signals/signals/speech_segments.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('signal file contains valid JSON array of signals', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      { transcript: 'Hello', start: 0, end: 1.0, confidence: 0.95, words: [] },
      { transcript: 'World', start: 2.0, end: 3.0, confidence: 0.90, words: [] },
    ]));

    await worker.processTask(makeTask());

    const signalUploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('signals/speech_segments.json'),
    );
    const signals = JSON.parse(signalUploadCall![1].toString());
    expect(Array.isArray(signals)).toBe(true);
    expect(signals).toHaveLength(2);
    expect(signals[0].signalType).toBe(SignalType.SPEECH_SEGMENT);
  });

  // ─── T8.4: Missing API key ───────────────────────────────────────────────

  test('throws descriptive error when DEEPGRAM_API_KEY not set', async () => {
    const depsNoKey = createMockDeps();
    (depsNoKey.config as any).deepgramApiKey = undefined;

    const workerNoKey = new SpeechTranscriptionWorker(depsNoKey);
    await expect(workerNoKey.processTask(makeTask())).rejects.toThrow('DEEPGRAM_API_KEY');
  });

  // ─── T8.5: Empty audio (no speech) ───────────────────────────────────────

  test('produces zero signals for silent audio (empty utterances)', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([]));

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(0);
  });

  test('does not upload signal file when no signals produced', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([]));

    await worker.processTask(makeTask());

    const signalUploads = mockGcsUpload.mock.calls.filter(
      (c) => (c[0] as string).includes('signals/'),
    );
    expect(signalUploads).toHaveLength(0);
  });

  test('still uploads transcript even for silent audio', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([]));

    await worker.processTask(makeTask({ projectId: 'silent-proj' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/silent-proj/transcript/transcript.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  // ─── GCS path contracts ─────────────────────────────────────────────────

  test('downloads audio from projects/{id}/audio_track/audio.wav', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([]));

    await worker.processTask(makeTask({ projectId: 'p-audio' }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/p-audio/audio_track/audio.wav');
  });

  // ─── Deepgram call configuration ────────────────────────────────────────

  test('calls Deepgram with correct transcription options', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([]));

    await worker.processTask(makeTask());

    expect(mockTranscribeFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        model: 'nova-2',
        smart_format: true,
        utterances: true,
        diarize: true,
        punctuate: true,
      }),
    );
  });

  // ─── Missing input ──────────────────────────────────────────────────────

  test('throws when no input asset ID provided', async () => {
    await expect(
      worker.processTask(makeTask({ inputAssetIds: [] })),
    ).rejects.toThrow('No input asset ID');
  });

  // ─── Deepgram failure ───────────────────────────────────────────────────

  test('throws when Deepgram returns no result', async () => {
    mockTranscribeFile.mockResolvedValue({ result: null });

    await expect(worker.processTask(makeTask())).rejects.toThrow('no result');
  });

  // ─── Metadata ───────────────────────────────────────────────────────────

  test('worker declares SPEECH_TRANSCRIPTION task type', () => {
    expect(worker.taskType).toBe(TaskType.SPEECH_TRANSCRIPTION);
  });

  test('outputAssetIds includes transcript-{projectId}', async () => {
    mockTranscribeFile.mockResolvedValue(makeDeepgramResponse([
      { transcript: 'Hello', start: 0, end: 1.0, confidence: 0.95, words: [] },
    ]));

    const result = await worker.processTask(makeTask({ projectId: 'proj-out' }));

    expect(result.outputAssetIds).toEqual(['transcript-proj-out']);
  });
});
