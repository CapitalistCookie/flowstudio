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
    workerId: 'edit-planner-test-1',
    workerName: 'edit-planner',
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

import { EditPlannerWorker } from '../src/worker.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: 'task-1',
    projectId: 'proj-abc',
    taskType: 'EDIT_PLAN',
    inputAssetIds: ['narrative-proj-abc'],
    config: {},
    ...overrides,
  };
}

function makeValidEditResponse(edits: Array<{
  editType: 'cut' | 'trim' | 'speedup' | 'slowdown' | 'zoom' | 'pan' | 'transition' | 'overlay';
  sourceStartMs: number;
  sourceEndMs: number;
  outputStartMs: number;
  outputEndMs: number;
  parameters: Record<string, unknown>;
  reasoning: string;
}>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(edits) }],
  };
}

const defaultEdits = [
  {
    editType: 'cut' as const,
    sourceStartMs: 0,
    sourceEndMs: 10000,
    outputStartMs: 0,
    outputEndMs: 10000,
    parameters: {},
    reasoning: 'Opening segment - keep the setup',
  },
  {
    editType: 'speedup' as const,
    sourceStartMs: 10000,
    sourceEndMs: 40000,
    outputStartMs: 10000,
    outputEndMs: 25000,
    parameters: { speed: 2.0 },
    reasoning: 'Speed up the repetitive coding section',
  },
  {
    editType: 'zoom' as const,
    sourceStartMs: 45000,
    sourceEndMs: 55000,
    outputStartMs: 25000,
    outputEndMs: 35000,
    parameters: { zoomLevel: 1.5 },
    reasoning: 'Zoom into the terminal showing test results',
  },
];

function makeNarrativePlan() {
  return [
    {
      signalType: SignalType.NARRATIVE_BEAT,
      timestampMs: 0,
      durationMs: 10000,
      confidence: 0.85,
      payload: {
        beatIndex: 0,
        beatType: 'setup',
        title: 'Opening the project',
        description: 'User opens the IDE',
        suggestedDurationMs: 5000,
        relatedIntentIds: ['i1'],
      },
    },
  ];
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('EditPlannerWorker', () => {
  let worker: EditPlannerWorker;

  beforeEach(() => {
    mockGcsUpload.mockResolvedValue(undefined);
    mockGcsDownload.mockResolvedValue(Buffer.from(JSON.stringify(makeNarrativePlan())));
    mockMessagesCreate.mockResolvedValue(makeValidEditResponse(defaultEdits));
    worker = new EditPlannerWorker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── T14.1: Reads narrative plan ──────────────────────────────────────

  test('downloads narrative_plan.json from GCS', async () => {
    await worker.processTask(makeTask());

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-abc/signals/narrative_plan.json');
  });

  test('reads narrative plan from correct project path', async () => {
    await worker.processTask(makeTask({ projectId: 'proj-xyz' }));

    expect(mockGcsDownload).toHaveBeenCalledWith('projects/proj-xyz/signals/narrative_plan.json');
  });

  // ─── T14.2: Edit types ────────────────────────────────────────────────

  test('produces edit decisions: cut, trim, speedup, slowdown, zoom, pan, transition, overlay', async () => {
    const allTypeEdits = [
      { editType: 'cut' as const, sourceStartMs: 0, sourceEndMs: 5000, outputStartMs: 0, outputEndMs: 5000, parameters: {}, reasoning: 'cut' },
      { editType: 'trim' as const, sourceStartMs: 5000, sourceEndMs: 8000, outputStartMs: 5000, outputEndMs: 8000, parameters: {}, reasoning: 'trim' },
      { editType: 'speedup' as const, sourceStartMs: 8000, sourceEndMs: 16000, outputStartMs: 8000, outputEndMs: 12000, parameters: { speed: 2.0 }, reasoning: 'speedup' },
      { editType: 'slowdown' as const, sourceStartMs: 16000, sourceEndMs: 18000, outputStartMs: 12000, outputEndMs: 16000, parameters: { speed: 0.5 }, reasoning: 'slowdown' },
      { editType: 'zoom' as const, sourceStartMs: 18000, sourceEndMs: 22000, outputStartMs: 16000, outputEndMs: 20000, parameters: { zoomLevel: 1.5 }, reasoning: 'zoom' },
      { editType: 'pan' as const, sourceStartMs: 22000, sourceEndMs: 25000, outputStartMs: 20000, outputEndMs: 23000, parameters: { x: 100, y: 50 }, reasoning: 'pan' },
      { editType: 'transition' as const, sourceStartMs: 25000, sourceEndMs: 26000, outputStartMs: 23000, outputEndMs: 24000, parameters: { transitionType: 'crossfade' }, reasoning: 'transition' },
      { editType: 'overlay' as const, sourceStartMs: 26000, sourceEndMs: 30000, outputStartMs: 24000, outputEndMs: 28000, parameters: { text: 'Great job!' }, reasoning: 'overlay' },
    ];
    mockMessagesCreate.mockResolvedValue(makeValidEditResponse(allTypeEdits));

    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(8);
    const editTypes = result.signals.map(s => s.payload.editType);
    expect(editTypes).toEqual(['cut', 'trim', 'speedup', 'slowdown', 'zoom', 'pan', 'transition', 'overlay']);
  });

  test('each edit becomes an EDIT_DECISION signal', async () => {
    const result = await worker.processTask(makeTask());

    expect(result.signals).toHaveLength(3);
    for (const signal of result.signals) {
      expect(signal.signalType).toBe(SignalType.EDIT_DECISION);
    }
  });

  // ─── T14.3: Time range mapping ────────────────────────────────────────

  test('edit decisions have valid source and output time ranges', async () => {
    const result = await worker.processTask(makeTask());

    for (const signal of result.signals) {
      expect(signal.payload.sourceStartMs).toBeLessThanOrEqual(signal.payload.sourceEndMs as number);
      expect(signal.payload.outputStartMs).toBeLessThanOrEqual(signal.payload.outputEndMs as number);
    }
  });

  test('signal timestampMs equals sourceStartMs', async () => {
    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.timestampMs).toBe(0);
    expect(result.signals[1]!.timestampMs).toBe(10000);
    expect(result.signals[2]!.timestampMs).toBe(45000);
  });

  test('signal durationMs equals sourceEndMs - sourceStartMs', async () => {
    const result = await worker.processTask(makeTask());

    expect(result.signals[0]!.durationMs).toBe(10000);
    expect(result.signals[1]!.durationMs).toBe(30000);
    expect(result.signals[2]!.durationMs).toBe(10000);
  });

  test('signal confidence is set to 0.8', async () => {
    const result = await worker.processTask(makeTask());

    for (const signal of result.signals) {
      expect(signal.confidence).toBe(0.8);
    }
  });

  // ─── T14.4: Zod schema validation ────────────────────────────────────

  test('rejects edit with invalid editType', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          editType: 'invalid_type',
          sourceStartMs: 0,
          sourceEndMs: 1000,
          outputStartMs: 0,
          outputEndMs: 1000,
          parameters: {},
          reasoning: 'test',
        }]),
      }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse edit decisions');
  });

  test('rejects edit with negative timestamps', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          editType: 'cut',
          sourceStartMs: -100,
          sourceEndMs: 1000,
          outputStartMs: 0,
          outputEndMs: 1000,
          parameters: {},
          reasoning: 'test',
        }]),
      }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse edit decisions');
  });

  test('rejects edit with missing reasoning field', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          editType: 'cut',
          sourceStartMs: 0,
          sourceEndMs: 1000,
          outputStartMs: 0,
          outputEndMs: 1000,
          parameters: {},
        }]),
      }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse edit decisions');
  });

  // ─── T14.5: GCS output contract ──────────────────────────────────────

  test('writes to projects/{id}/signals/edit_plan.json', async () => {
    await worker.processTask(makeTask({ projectId: 'proj-edit' }));

    expect(mockGcsUpload).toHaveBeenCalledWith(
      'projects/proj-edit/signals/edit_plan.json',
      expect.any(Buffer),
      'application/json',
    );
  });

  test('uploaded file contains valid JSON array of EDIT_DECISION signals', async () => {
    await worker.processTask(makeTask());

    const uploadCall = mockGcsUpload.mock.calls.find(
      (c) => (c[0] as string).includes('edit_plan.json'),
    );
    expect(uploadCall).toBeDefined();
    const signals = JSON.parse(uploadCall![1].toString());
    expect(Array.isArray(signals)).toBe(true);
    expect(signals.length).toBe(3);
    expect(signals[0].signalType).toBe(SignalType.EDIT_DECISION);
  });

  // ─── Claude prompt ────────────────────────────────────────────────────

  test('sends narrative beats to Claude for edit planning', async () => {
    await worker.processTask(makeTask());

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockMessagesCreate.mock.calls[0]![0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.messages[0].content).toContain('narrative_beats');
  });

  test('uses PROMPT_REGISTRY system prompt for edit-planner', async () => {
    await worker.processTask(makeTask());

    const systemPrompt = mockMessagesCreate.mock.calls[0]![0].system;
    expect(systemPrompt).toContain('edit');
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
          systemPrompt: 'Custom edit planner prompt',
          maxTokens: 8192,
        },
      },
    });

    await worker.processTask(customTask);

    const callArgs = mockMessagesCreate.mock.calls[0]![0];
    expect(callArgs.system).toContain('Custom edit planner prompt');
    expect(callArgs.max_tokens).toBe(8192);
  });

  // ─── Error paths ──────────────────────────────────────────────────────

  test('throws when narrative_plan.json not in GCS', async () => {
    mockGcsDownload.mockRejectedValue(new Error('File not found'));

    await expect(worker.processTask(makeTask())).rejects.toThrow();
  });

  test('throws on empty Claude response', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '' }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse edit decisions');
  });

  test('throws on non-JSON Claude response', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'I cannot make edit decisions for this content.' }],
    });

    await expect(worker.processTask(makeTask())).rejects.toThrow('Failed to parse edit decisions');
  });

  // ─── Metadata ──────────────────────────────────────────────────────────

  test('worker declares EDIT_PLAN task type', () => {
    expect(worker.taskType).toBe(TaskType.EDIT_PLAN);
  });

  test('outputAssetIds includes edit-plan-{projectId}', async () => {
    const result = await worker.processTask(makeTask({ projectId: 'proj-out' }));

    expect(result.outputAssetIds).toEqual(['edit-plan-proj-out']);
  });

  // ─── Signal payload shape ──────────────────────────────────────────────

  test('edit signal payload contains all required fields', async () => {
    const result = await worker.processTask(makeTask());

    const payload = result.signals[0]!.payload;
    expect(payload.editType).toBe('cut');
    expect(payload.sourceStartMs).toBe(0);
    expect(payload.sourceEndMs).toBe(10000);
    expect(payload.outputStartMs).toBe(0);
    expect(payload.outputEndMs).toBe(10000);
    expect(payload.parameters).toEqual({});
    expect(payload.reasoning).toBe('Opening segment - keep the setup');
  });

  test('speedup edit preserves speed parameter', async () => {
    const result = await worker.processTask(makeTask());

    const speedupSignal = result.signals.find(s => s.payload.editType === 'speedup');
    expect(speedupSignal).toBeDefined();
    expect((speedupSignal!.payload.parameters as Record<string, unknown>).speed).toBe(2.0);
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  test('handles Claude response with surrounding text', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: `Here are the edit decisions:\n${JSON.stringify(defaultEdits)}\nDone!`,
      }],
    });

    const result = await worker.processTask(makeTask());
    expect(result.signals).toHaveLength(3);
  });
});
