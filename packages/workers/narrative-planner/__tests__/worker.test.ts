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
    workerId: 'narrative-planner-test-1',
    workerName: 'narrative-planner',
    concurrency: 2,
    pollIntervalMs: 100,
    healthPort: 0,
    vertexRegion: 'us-central1',
    vertexProjectId: 'test-project',
    anthropicModel: 'claude-sonnet-4-20250514',
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

// ─── Anthropic mock ────────────────────────────────────────────────────────────

const mockMessagesCreate = vi.fn();

vi.mock('@anthropic-ai/vertex-sdk', () => ({
  AnthropicVertex: class {
    messages = { create: mockMessagesCreate };
  },
}));

import { NarrativePlannerWorker } from '../src/worker.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: 'task-1',
    projectId: 'proj-abc',
    taskType: 'NARRATIVE_PLAN',
    inputAssetIds: ['intent-graph-proj-abc'],
    config: {},
    ...overrides,
  };
}

function makeValidNarrativeResponse(beats: Array<{
  beatIndex: number;
  beatType: 'setup' | 'action' | 'result' | 'transition' | 'highlight';
  title: string;
  description: string;
  suggestedDurationMs: number;
  startMs: number;
  endMs: number;
  relatedIntentIds: string[];
}>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(beats) }],
  };
}

const defaultBeats = [
  {
    beatIndex: 0,
    beatType: 'setup' as const,
    title: 'Opening the project',
    description: 'User opens the IDE and navigates to the project folder',
    suggestedDurationMs: 5000,
    startMs: 0,
    endMs: 10000,
    relatedIntentIds: ['i1'],
  },
  {
    beatIndex: 1,
    beatType: 'action' as const,
    title: 'Writing the function',
    description: 'User writes a new utility function with tests',
    suggestedDurationMs: 15000,
    startMs: 10000,
    endMs: 45000,
    relatedIntentIds: ['i1', 'i2'],
  },
  {
    beatIndex: 2,
    beatType: 'result' as const,
    title: 'Tests pass',
    description: 'All tests pass and the user commits',
    suggestedDurationMs: 3000,
    startMs: 45000,
    endMs: 55000,
    relatedIntentIds: ['i3'],
  },
];

function makeIntentGraph() {
  return [
    {
      signalType: SignalType.INTENT_NODE,
      timestampMs: 0,
      durationMs: 30000,
      confidence: 0.95,
      payload: {
        intentId: 'i1',
        parentIntentId: null,
        action: 'Writing code',
        reasoning: 'User is typing in IDE',
        relatedSignalIds: ['0', '1'],
      },
    },
    {
      signalType: SignalType.INTENT_NODE,
      timestampMs: 10000,
      durationMs: 20000,
      confidence: 0.85,
      payload: {
        intentId: 'i2',
        parentIntentId: 'i1',
        action: 'Creating utility function',
        reasoning: 'New file created',
        relatedSignalIds: ['2'],
      },
    },
  ];
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('NarrativePlannerWorker', () => {
  let worker: NarrativePlannerWorker;

  beforeEach(() => {
    mockGcsUpload.mockResolvedValue(undefined);
    mockGcsDownload.mockResolvedValue(Buffer.from(JSON.stringify(makeIntentGraph())));
    mockMessagesCreate.mockResolvedValue(makeValidNarrativeResponse(defaultBeats));
    worker = new NarrativePlannerWorker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── T13.1: Reads intent graph ────────────────────────────────────────

  test('downloads intent_graph.json from GCS', async () => {
    await worker.processTask(makeTask());

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-abc/signals/intent_graph.json');
  });

  test('reads intent graph from correct project path', async () => {
    await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-xyz/signals/intent_graph.json');
  });

  // ─── T13.2: Claude prompt with intents ─────────────────────────────────

  test('sends intent hierarchy to Claude for narrative planning', async () => {
    await worker.processTask(makeTask());

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockMessagesCreate.mock.calls[0]![0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe('user');
    expect(callArgs.messages[0].content).toContain('intent_graph');
  });

  test('uses PROMPT_REGISTRY system prompt for narrative-planner', async () => {
    await worker.processTask(makeTask());

    const systemPrompt = mockMessagesCreate.mock.calls[0]![0].system;
    expect(systemPrompt).toContain('narrative');
  });

  test('calls Claude with configured model', async () => {
    await worker.processTask(makeTask());

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-20250514',
      }),
    );
  });

  test('respects prompt overrides from task config', async () => {
    const customTask = makeTask({
      config: {
        promptOverrides: {
          systemPrompt: 'Custom system prompt for testing',
          maxTokens: 8192,
        },
      },
    });

    await worker.processTask(customTask);

    const callArgs = mockMessagesCreate.mock.calls[0]![0];
    expect(callArgs.system).toContain('Custom system prompt for testing');
    expect(callArgs.max_tokens).toBe(8192);
  });

  test('uses buildSecurePrompt for XML-fenced data', async () => {
    await worker.processTask(makeTask());

    const userContent = mockMessagesCreate.mock.calls[0]![0].messages[0].content;
    expect(userContent).toContain('<signal_data type="intent_graph">');
    expect(userContent).toContain('</signal_data>');
  });

  // ─── T13.3: Beat types ─────────────────────────────────────────────────

  test('produces beats of types: setup, action, result, transition, highlight', async () => {
    const allTypesBeats = [
      { beatIndex: 0, beatType: 'setup' as const, title: 'Setup', description: 'desc', suggestedDurationMs: 3000, startMs: 0, endMs: 5000, relatedIntentIds: [] },
      { beatIndex: 1, beatType: 'action' as const, title: 'Action', description: 'desc', suggestedDurationMs: 5000, startMs: 5000, endMs: 15000, relatedIntentIds: [] },
      { beatIndex: 2, beatType: 'result' as const, title: 'Result', description: 'desc', suggestedDurationMs: 3000, startMs: 15000, endMs: 20000, relatedIntentIds: [] },
      { beatIndex: 3, beatType: 'transition' as const, title: 'Transition', description: 'desc', suggestedDurationMs: 1000, startMs: 20000, endMs: 22000, relatedIntentIds: [] },
      { beatIndex: 4, beatType: 'highlight' as const, title: 'Highlight', description: 'desc', suggestedDurationMs: 5000, startMs: 22000, endMs: 30000, relatedIntentIds: [] },
    ];
    mockMessagesCreate.mockResolvedValue(makeValidNarrativeResponse(allTypesBeats));

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(5);
    const beatTypes = result.signals.map(s => s.payload.beatType);
    expect(beatTypes).toEqual(['setup', 'action', 'result', 'transition', 'highlight']);
  });

  test('each beat becomes a NARRATIVE_BEAT signal', async () => {
    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(3);
    for (const signal of result.signals) {
      expect(signal.signalType).toBe(SignalType.NARRATIVE_BEAT);
    }
  });

  // ─── T13.4: Beat ordering ─────────────────────────────────────────────

  test('beats are ordered by beatIndex', async () => {
    const result = await worker.processTask(makeTask());

    const indices = result.signals.map(s => s.payload.beatIndex);
    expect(indices).toEqual([0, 1, 2]);
  });

  test('beat timestamps derive from startMs/endMs', async () => {
    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.timestampMs).toBe(0);
    expect(result.signals[0]!.durationMs).toBe(10000);
    expect(result.signals[1]!.timestampMs).toBe(10000);
    expect(result.signals[1]!.durationMs).toBe(35000);
    expect(result.signals[2]!.timestampMs).toBe(45000);
    expect(result.signals[2]!.durationMs).toBe(10000);
  });

  test('signal confidence is set to 0.85', async () => {
    const result = await worker.processTask(makeTask());

    for (const signal of result.signals) {
      expect(signal.confidence).toBe(0.85);
    }
  });

  // ─── T13.5: Missing intent graph (throws) ─────────────────────────────

  test('throws when intent_graph.json not in GCS', async () => {
    mockGcsDownload.mockRejectedValue(new Error('File not found: intent_graph.json'));

    await expect(worker.processTask(makeTask())).rejects.toThrow();
  });

  // ─── T13.6: GCS output contract ───────────────────────────────────────

  test('writes to projects/{id}/signals/narrative_plan.json', async () => {
    await worker.processTask(makeTask({ projectId: 'proj-narrative' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-narrative/signals/narrative_plan.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('uploaded file contains valid JSON array of NARRATIVE_BEAT signals', async () => {
    await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('narrative_plan.json'),
    );
    expect(uploadCall).toBeDefined();
    const signals = JSON.parse(uploadCall![1].toString());
    expect(Array.isArray(signals)).toBe(true);
    expect(signals.length).toBe(3);
    expect(signals[0].signalType).toBe(SignalType.NARRATIVE_BEAT);
  });

  // ─── Claude response failures ──────────────────────────────────────────

  test('throws on invalid JSON from Claude', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, I cannot analyze this.' }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse narrative beats');
  });

  test('throws when Claude returns schema-invalid JSON', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify([{ invalid: 'not a beat object' }]),
      }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse narrative beats');
  });

  test('throws when Claude returns beat with invalid beatType', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          beatIndex: 0,
          beatType: 'invalid_type',
          title: 'Test',
          description: 'Test',
          suggestedDurationMs: 1000,
          startMs: 0,
          endMs: 1000,
          relatedIntentIds: [],
        }]),
      }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse narrative beats');
  });

  test('throws when Claude returns empty text', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '' }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse narrative beats');
  });

  // ─── Metadata ──────────────────────────────────────────────────────────

  test('worker declares NARRATIVE_PLAN task type', () => {
    expect(worker.taskType).toBe(TaskType.NARRATIVE_PLAN);
  });

  test('outputAssetIds includes narrative-{projectId}', async () => {
    const result = await worker.processTask(makeTask({ projectId: 'proj-out' }));

    expect(result.outputAssetIds).toEqual(['narrative-proj-out']);
  });

  // ─── Signal payload shape ──────────────────────────────────────────────

  test('beat signal payload contains all required fields', async () => {
    const result = await worker.processTask(makeTask());

    const payload = result.signals[0]!.payload;
    expect(payload.beatIndex).toBe(0);
    expect(payload.beatType).toBe('setup');
    expect(payload.title).toBe('Opening the project');
    expect(payload.description).toBe('User opens the IDE and navigates to the project folder');
    expect(payload.suggestedDurationMs).toBe(5000);
    expect(payload.relatedIntentIds).toEqual(['i1']);
  });

  test('beat signal payload preserves relatedIntentIds array', async () => {
    const result = await worker.processTask(makeTask());

    expect(result.signals[1]!.payload.relatedIntentIds).toEqual(['i1', 'i2']);
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  test('handles single beat response', async () => {
    mockMessagesCreate.mockResolvedValue(makeValidNarrativeResponse([{
      beatIndex: 0,
      beatType: 'highlight',
      title: 'Key moment',
      description: 'The most important part',
      suggestedDurationMs: 10000,
      startMs: 0,
      endMs: 10000,
      relatedIntentIds: ['i1'],
    }]));

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.payload.beatType).toBe('highlight');
  });

  test('handles Claude response with surrounding text', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: `Here's the narrative plan:\n${JSON.stringify(defaultBeats)}\nHope that helps!`,
      }],
    });

    const result = await worker.processTask(makeTask());
    expect(result.signals).toHaveLength(3);
  });
});
