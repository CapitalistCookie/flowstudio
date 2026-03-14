import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskType, SignalType } from '@flowstudio/shared';
import { type TaskData, type WorkerDeps } from '@flowstudio/worker-shared';

// ─── Anthropic mock ────────────────────────────────────────────────────────────

const mockMessagesCreate = vi.fn();

vi.mock('@anthropic-ai/vertex-sdk', () => ({
  AnthropicVertex: class {
    messages = { create: mockMessagesCreate };
  },
}));

import { IntentGraphWorker } from '../src/worker.js';

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
      workerId: 'intent-graph-test-1',
      workerName: 'intent-graph',
      concurrency: 2,
      pollIntervalMs: 100,
      healthPort: 0,
      vertexRegion: 'us-central1',
      vertexProjectId: 'test-project',
      anthropicModel: 'claude-sonnet-4-20250514',
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: 'task-1',
    projectId: 'proj-abc',
    taskType: 'INTENT_GRAPH',
    inputAssetIds: [],
    config: {},
    ...overrides,
  };
}

function makeValidIntentResponse(intents: Array<{
  intentId: string;
  parentIntentId: string | null;
  action: string;
  reasoning: string;
  confidence: number;
  startMs: number;
  endMs: number;
  relatedSignalIndices: number[];
}>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(intents) }],
  };
}

const defaultIntents = [
  {
    intentId: 'i1',
    parentIntentId: null,
    action: 'Writing code',
    reasoning: 'User is typing in an IDE',
    confidence: 0.95,
    startMs: 0,
    endMs: 30000,
    relatedSignalIndices: [0, 1, 2],
  },
];

function makeSpeechSignal(timestampMs: number) {
  return {
    signalType: SignalType.SPEECH_SEGMENT,
    timestampMs,
    durationMs: 2000,
    confidence: 0.95,
    payload: { text: 'Hello world', words: [], speakerId: '0', language: 'en' },
  };
}

function makeSceneSignal(timestampMs: number) {
  return {
    signalType: SignalType.SCENE_CHANGE,
    timestampMs,
    durationMs: 0,
    confidence: 0.8,
    payload: { description: 'Navigation to new page', changeScore: 0.8, frameIndex: 0 },
  };
}

function makeUISignal(timestampMs: number) {
  return {
    signalType: SignalType.UI_TRANSITION,
    timestampMs,
    durationMs: 2000,
    confidence: 0.7,
    payload: { transitionType: 'navigation', fromState: 'frame-0', toState: 'frame-1', diffScore: 0.9 },
  };
}

function makeClusterSignal(timestampMs: number) {
  return {
    signalType: SignalType.INTERACTION_CLUSTER,
    timestampMs,
    durationMs: 5000,
    confidence: 0.75,
    payload: { intent: 'form_interaction', clusterLabel: 'form_interaction (3 actions)' },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('IntentGraphWorker', () => {
  let worker: IntentGraphWorker;
  let mockGcsUpload: ReturnType<typeof vi.fn>;
  let mockGcsDownload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const deps = createMockDeps();
    mockGcsUpload = deps.mockGcsUpload;
    mockGcsDownload = deps.mockGcsDownload;
    mockMessagesCreate.mockResolvedValue(makeValidIntentResponse(defaultIntents));
    worker = new IntentGraphWorker(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function setGcsSignalFiles(files: Record<string, unknown[]>) {
    mockGcsDownload.mockImplementation(async (path: string) => {
      for (const [key, data] of Object.entries(files)) {
        if (path.includes(key)) {
          return Buffer.from(JSON.stringify(data));
        }
      }
      throw new Error(`File not found: ${path}`);
    });
  }

  // ─── T12.1: Reads all 4 signal files ────────────────────────────────────

  test('downloads speech_segments, scene_descriptions, ui_transitions, interaction_clusters', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [makeSceneSignal(2000)],
      'ui_transitions.json': [makeUISignal(4000)],
      'interaction_clusters.json': [makeClusterSignal(6000)],
    });

    await worker.processTask(makeTask());

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-abc/signals/speech_segments.json');
    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-abc/signals/scene_descriptions.json');
    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-abc/signals/ui_transitions.json');
    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-abc/signals/interaction_clusters.json');
  });

  // ─── T12.2: Claude prompt construction ──────────────────────────────────

  test('builds Claude prompt with sorted signals summary', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(5000)],
      'scene_descriptions.json': [makeSceneSignal(1000)],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    await worker.processTask(makeTask());

    const callArgs = mockMessagesCreate.mock.calls[0]![0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe('user');
    expect(callArgs.messages[0].content).toContain('upstream_signals');
  });

  test('signals are sorted by timestamp in prompt', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(5000)],
      'scene_descriptions.json': [makeSceneSignal(1000)],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    await worker.processTask(makeTask());

    const userContent = mockMessagesCreate.mock.calls[0]![0].messages[0].content;
    const scene1sPos = userContent.indexOf('1.0s');
    const speech5sPos = userContent.indexOf('5.0s');
    expect(scene1sPos).toBeLessThan(speech5sPos);
  });

  test('uses PROMPT_REGISTRY system prompt for intent-graph', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    await worker.processTask(makeTask());

    const systemPrompt = mockMessagesCreate.mock.calls[0]![0].system;
    expect(systemPrompt).toContain('intent');
  });

  test('calls Claude with configured model', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    await worker.processTask(makeTask());

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-20250514',
      }),
    );
  });

  // ─── T12.3: Intent hierarchy parsing ────────────────────────────────────

  test('parses Claude JSON response into INTENT_NODE signals', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    mockMessagesCreate.mockResolvedValue(makeValidIntentResponse([
      {
        intentId: 'i1', parentIntentId: null, action: 'Writing code',
        reasoning: 'User is typing', confidence: 0.95,
        startMs: 0, endMs: 30000, relatedSignalIndices: [0],
      },
      {
        intentId: 'i2', parentIntentId: 'i1', action: 'Fixing bug',
        reasoning: 'Sub-intent of coding', confidence: 0.85,
        startMs: 5000, endMs: 15000, relatedSignalIndices: [0, 1],
      },
    ]));

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]!.signalType).toBe(SignalType.INTENT_NODE);
    expect(result.signals[0]!.payload.intentId).toBe('i1');
    expect(result.signals[0]!.payload.parentIntentId).toBeNull();
    expect(result.signals[1]!.payload.intentId).toBe('i2');
    expect(result.signals[1]!.payload.parentIntentId).toBe('i1');
  });

  test('intent timestamps derive from startMs/endMs', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    mockMessagesCreate.mockResolvedValue(makeValidIntentResponse([{
      intentId: 'i1', parentIntentId: null, action: 'Test',
      reasoning: 'Test', confidence: 0.9,
      startMs: 5000, endMs: 15000, relatedSignalIndices: [],
    }]));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.timestampMs).toBe(5000);
    expect(result.signals[0]!.durationMs).toBe(10000);
  });

  test('confidence from intent is propagated to signal', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    mockMessagesCreate.mockResolvedValue(makeValidIntentResponse([{
      intentId: 'i1', parentIntentId: null, action: 'Test',
      reasoning: 'Test', confidence: 0.87,
      startMs: 0, endMs: 1000, relatedSignalIndices: [],
    }]));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.confidence).toBe(0.87);
  });

  test('relatedSignalIndices mapped to string IDs', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    mockMessagesCreate.mockResolvedValue(makeValidIntentResponse([{
      intentId: 'i1', parentIntentId: null, action: 'Test',
      reasoning: 'Test', confidence: 0.9,
      startMs: 0, endMs: 1000, relatedSignalIndices: [0, 2, 5],
    }]));

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.relatedSignalIds).toEqual(['0', '2', '5']);
  });

  // ─── T12.4: No upstream signals (throws) ────────────────────────────────

  test('throws when all 4 signal files are empty/missing', async () => {
    mockGcsDownload.mockRejectedValue(new Error('Not found'));

    await expect(worker.processTask(makeTask())).rejects.toThrow('No upstream signals');
  });

  // ─── T12.5: Partial signals (some missing) ─────────────────────────────

  test('works with subset of signals (only speech + scene)', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [makeSceneSignal(2000)],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals.length).toBeGreaterThan(0);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  test('works with only one signal source', async () => {
    mockGcsDownload.mockImplementation(async (path: string) => {
      if (path.includes('speech_segments.json')) {
        return Buffer.from(JSON.stringify([makeSpeechSignal(0)]));
      }
      throw new Error('Not found');
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals.length).toBeGreaterThan(0);
  });

  // ─── T12.6: Claude JSON parse failure → throws ─────────────────────────

  test('throws on invalid JSON from Claude (triggers retry)', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, I cannot analyze this.' }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse intent graph');
  });

  test('throws when Claude returns schema-invalid JSON', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify([{ invalid: 'not an intent object' }]),
      }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse intent graph');
  });

  // ─── T12.7: GCS output contract ────────────────────────────────────────

  test('writes to projects/{id}/signals/intent_graph.json', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    await worker.processTask(makeTask({ projectId: 'proj-intent' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-intent/signals/intent_graph.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('signal file contains valid JSON array of INTENT_NODE signals', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('intent_graph.json'),
    );
    const signals = JSON.parse(uploadCall![1].toString());
    expect(Array.isArray(signals)).toBe(true);
    expect(signals[0].signalType).toBe(SignalType.INTENT_NODE);
  });

  // ─── Metadata ──────────────────────────────────────────────────────────

  test('worker declares INTENT_GRAPH task type', () => {
    expect(worker.taskType).toBe(TaskType.INTENT_GRAPH);
  });

  test('outputAssetIds includes intent-graph-{projectId}', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    const result = await worker.processTask(makeTask({ projectId: 'proj-out' }));

    expect(result.outputAssetIds).toEqual(['intent-graph-proj-out']);
  });

  // ─── Signal payload shape ──────────────────────────────────────────────

  test('intent signal payload contains action and reasoning', async () => {
    setGcsSignalFiles({
      'speech_segments.json': [makeSpeechSignal(0)],
      'scene_descriptions.json': [],
      'ui_transitions.json': [],
      'interaction_clusters.json': [],
    });

    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.payload.action).toBe('Writing code');
    expect(result.signals[0]!.payload.reasoning).toBe('User is typing in an IDE');
    expect(result.signals[0]!.payload.confidence).toBe(0.95);
  });
});
