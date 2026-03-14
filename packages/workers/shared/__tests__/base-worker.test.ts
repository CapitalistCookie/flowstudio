import { describe, test, expect, vi, beforeEach } from 'vitest';
import { TaskType } from '@flowstudio/shared';
import { MockStdbClient, MockLogger } from './mocks.js';

const sharedLogger = new MockLogger();
const sharedStdb = new MockStdbClient();

vi.mock('../src/config.js', () => ({
  loadConfig: () => ({
    stdbHost: 'localhost:3000',
    stdbModule: 'flowstudio',
    gcsBucket: 'test-bucket',
    gcsProjectId: 'test-project',
    workerId: 'test-worker-1',
    workerName: 'test-worker',
    concurrency: 2,
    pollIntervalMs: 100,
    healthPort: 0,
  }),
}));

vi.mock('../src/logger.js', () => {
  return {
    Logger: class {
      debug(msg: string, data?: Record<string, unknown>) { sharedLogger.debug(msg, data); }
      info(msg: string, data?: Record<string, unknown>) { sharedLogger.info(msg, data); }
      warn(msg: string, data?: Record<string, unknown>) { sharedLogger.warn(msg, data); }
      error(msg: string, data?: Record<string, unknown>) { sharedLogger.error(msg, data); }
    },
  };
});

vi.mock('../src/gcs-client.js', () => {
  return {
    GcsClient: class {
      async upload() {}
      async download() { return Buffer.from('test'); }
      async exists() { return true; }
    },
  };
});

vi.mock('../src/stdb-client.js', () => {
  return {
    StdbClient: class {
      async callReducer(name: string, args: Record<string, unknown>) {
        return sharedStdb.callReducer(name, args);
      }
      async queryTable(tableName: string) {
        return sharedStdb.queryTable(tableName);
      }
      get isConnected() { return true; }
      disconnect() {}
    },
  };
});

vi.mock('../src/health.js', () => {
  return {
    startHealthServer: () => ({
      close() {},
      once() {},
      address: () => ({ port: 9999 }),
    }),
  };
});

import { BaseWorker, type TaskData, type TaskResult } from '../src/base-worker.js';

class TestWorker extends BaseWorker {
  readonly taskType = TaskType.AUDIO_EXTRACT;
  public processTaskMock = vi.fn<(task: TaskData) => Promise<TaskResult>>();

  async processTask(task: TaskData): Promise<TaskResult> {
    return this.processTaskMock(task);
  }

  testHandleClaimedTask(task: TaskData) {
    return this.handleClaimedTask(task);
  }
}

describe('BaseWorker', () => {
  let worker: TestWorker;

  beforeEach(() => {
    sharedStdb.reducerCalls = [];
    sharedLogger.logs = [];
    worker = new TestWorker();
  });

  // T2.9 — Task Claiming Flow: processTask → writeSignal → completeTask
  test('handleClaimedTask calls processTask, writes signals, and completes', async () => {
    const taskData: TaskData = {
      id: 'task-1',
      projectId: 'proj-1',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: ['asset-1'],
      config: {},
    };

    worker.processTaskMock.mockResolvedValue({
      outputAssetIds: ['output-1'],
      signals: [
        {
          signalType: 'speech_segment',
          timestampMs: 0,
          durationMs: 5000,
          confidence: 0.9,
          payload: { text: 'hello' },
        },
      ],
    });

    await worker.testHandleClaimedTask(taskData);

    const reducerNames = sharedStdb.reducerCalls.map((c) => c.name);
    expect(reducerNames).toContain('writeSignal');
    expect(reducerNames).toContain('completeTask');

    const writeSignalCall = sharedStdb.reducerCalls.find((c) => c.name === 'writeSignal');
    expect(writeSignalCall!.args.projectId).toBe('proj-1');
    expect(writeSignalCall!.args.signalType).toBe('speech_segment');
    expect(writeSignalCall!.args.confidence).toBe(0.9);

    const completeCall = sharedStdb.reducerCalls.find((c) => c.name === 'completeTask');
    expect(completeCall!.args.taskId).toBe('task-1');
    expect(JSON.parse(completeCall!.args.outputAssetIds as string)).toEqual(['output-1']);
  });

  // T2.10 — Task Failure → failTask
  test('calls failTask when processTask throws', async () => {
    const taskData: TaskData = {
      id: 'task-2',
      projectId: 'proj-1',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: [],
      config: {},
    };

    worker.processTaskMock.mockRejectedValue(new Error('FFmpeg crashed'));

    await worker.testHandleClaimedTask(taskData);

    const failCall = sharedStdb.reducerCalls.find((c) => c.name === 'failTask');
    expect(failCall).toBeDefined();
    expect(failCall!.args.taskId).toBe('task-2');
    expect(failCall!.args.failureReason).toBe('FFmpeg crashed');
  });

  test('completeTask not called when processTask throws', async () => {
    const taskData: TaskData = {
      id: 'task-3',
      projectId: 'proj-1',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: [],
      config: {},
    };

    worker.processTaskMock.mockRejectedValue(new Error('boom'));

    await worker.testHandleClaimedTask(taskData);

    const completeCall = sharedStdb.reducerCalls.find((c) => c.name === 'completeTask');
    expect(completeCall).toBeUndefined();
  });

  test('writes multiple signals in order', async () => {
    const taskData: TaskData = {
      id: 'task-4',
      projectId: 'proj-1',
      taskType: 'AUDIO_EXTRACT',
      inputAssetIds: [],
      config: {},
    };

    worker.processTaskMock.mockResolvedValue({
      outputAssetIds: [],
      signals: [
        { signalType: 'speech_segment', timestampMs: 0, durationMs: 1000, confidence: 0.8, payload: {} },
        { signalType: 'speech_segment', timestampMs: 1000, durationMs: 2000, confidence: 0.9, payload: {} },
        { signalType: 'speech_segment', timestampMs: 3000, durationMs: 500, confidence: 0.7, payload: {} },
      ],
    });

    await worker.testHandleClaimedTask(taskData);

    const signalCalls = sharedStdb.reducerCalls.filter((c) => c.name === 'writeSignal');
    expect(signalCalls.length).toBe(3);
    expect(signalCalls[0]!.args.timestampMs).toBe(0);
    expect(signalCalls[1]!.args.timestampMs).toBe(1000);
    expect(signalCalls[2]!.args.timestampMs).toBe(3000);
  });
});
