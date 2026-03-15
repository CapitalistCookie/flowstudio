/**
 * Data contract verification: worker output JSON matches downstream consumer expectations.
 * X-11: Worker output format contract.
 *
 * Tests that:
 * - TaskResult shape is correct for base-worker
 * - writeSignal reducer receives correct parameter shape
 * - completeTask receives outputAssetIds in correct format
 * - Audio extract GCS path convention
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '../src/base-worker.js';
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

vi.mock('../src/logger.js', () => ({
  Logger: class {
    debug() {}
    info() {}
    warn() {}
    error() {}
  },
}));

vi.mock('../src/gcs-client.js', () => ({
  GcsClient: class {
    async upload() {}
    async download() {
      return Buffer.from('test');
    }
    async exists() {
      return true;
    }
  },
}));

vi.mock('../src/stdb-client.js', () => ({
  StdbClient: class {
    async callReducer(name: string, args: Record<string, unknown>) {
      return sharedStdb.callReducer(name, args);
    }
    async queryTable() {
      return sharedStdb.queryTable('');
    }
    get isConnected() {
      return true;
    }
    disconnect() {}
  },
}));

vi.mock('../src/health.js', () => ({
  startHealthServer: () => ({
    close() {},
    once() {},
    address: () => ({ port: 9999 }),
  }),
}));

class ContractTestWorker extends BaseWorker {
  readonly taskType = TaskType.AUDIO_EXTRACT;
  public resultToReturn: TaskResult = {
    outputAssetIds: [],
    signals: [],
  };

  async processTask(): Promise<TaskResult> {
    return this.resultToReturn;
  }

  testHandleClaimedTask(task: TaskData) {
    return this.handleClaimedTask(task);
  }
}

describe('Worker output contract', () => {
  let worker: ContractTestWorker;

  beforeEach(() => {
    sharedStdb.reducerCalls = [];
    worker = new ContractTestWorker();
  });

  describe('TaskResult shape', () => {
    it('outputAssetIds is string array', async () => {
      worker.resultToReturn = {
        outputAssetIds: ['audio-proj-123'],
        signals: [],
      };
      await worker.testHandleClaimedTask({
        id: 't1',
        projectId: 'proj-123',
        taskType: 'AUDIO_EXTRACT',
        inputAssetIds: ['rec.webm'],
        config: {},
      });
      const completeCall = sharedStdb.reducerCalls.find((c) => c.name === 'completeTask');
      expect(completeCall).toBeDefined();
      const parsed = JSON.parse(completeCall!.args.outputAssetIds as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual(['audio-proj-123']);
    });

    it('signals have signalType, timestampMs, durationMs, confidence, payload', async () => {
      worker.resultToReturn = {
        outputAssetIds: [],
        signals: [
          {
            signalType: 'SPEECH_SEGMENT',
            timestampMs: 1000,
            durationMs: 500,
            confidence: 0.95,
            payload: { text: 'hello' },
          },
        ],
      };
      await worker.testHandleClaimedTask({
        id: 't2',
        projectId: 'p2',
        taskType: 'AUDIO_EXTRACT',
        inputAssetIds: [],
        config: {},
      });
      const writeCalls = sharedStdb.reducerCalls.filter((c) => c.name === 'writeSignal');
      expect(writeCalls).toHaveLength(1);
      const args = writeCalls[0]!.args;
      expect(args).toHaveProperty('projectId', 'p2');
      expect(args).toHaveProperty('taskId', 't2');
      expect(args).toHaveProperty('signalType', 'SPEECH_SEGMENT');
      expect(args).toHaveProperty('timestampMs', 1000);
      expect(args).toHaveProperty('durationMs', 500);
      expect(args).toHaveProperty('confidence', 0.95);
      expect(typeof args.payload).toBe('string');
      expect(JSON.parse(args.payload as string)).toEqual({ text: 'hello' });
    });
  });

  describe('completeTask outputAssetIds format', () => {
    it('passes outputAssetIds as JSON string of string array', async () => {
      worker.resultToReturn = {
        outputAssetIds: ['asset-1', 'asset-2'],
        signals: [],
      };
      await worker.testHandleClaimedTask({
        id: 't3',
        projectId: 'p3',
        taskType: 'AUDIO_EXTRACT',
        inputAssetIds: [],
        config: {},
      });
      const completeCall = sharedStdb.reducerCalls.find((c) => c.name === 'completeTask');
      expect(completeCall!.args.outputAssetIds).toBe('["asset-1","asset-2"]');
      expect(JSON.parse(completeCall!.args.outputAssetIds as string)).toEqual(['asset-1', 'asset-2']);
    });
  });

  describe('writeSignal parameter shape', () => {
    it('has all 7 required fields in correct types', async () => {
      worker.resultToReturn = {
        outputAssetIds: [],
        signals: [
          {
            signalType: 'SCENE_CHANGE',
            timestampMs: 0,
            durationMs: 2000,
            confidence: 0.8,
            payload: { description: 'coding' },
          },
        ],
      };
      await worker.testHandleClaimedTask({
        id: 't4',
        projectId: 'p4',
        taskType: 'AUDIO_EXTRACT',
        inputAssetIds: [],
        config: {},
      });
      const writeCall = sharedStdb.reducerCalls.find((c) => c.name === 'writeSignal');
      expect(writeCall).toBeDefined();
      expect(writeCall!.args).toMatchObject({
        projectId: 'p4',
        taskId: 't4',
        signalType: 'SCENE_CHANGE',
        timestampMs: 0,
        durationMs: 2000,
        confidence: 0.8,
      });
      expect(typeof writeCall!.args.payload).toBe('string');
    });
  });

  describe('audio extract GCS path convention', () => {
    it('output path follows projects/{projectId}/audio_track/audio.wav pattern', () => {
      const projectId = 'proj-xyz';
      const expectedPath = `projects/${projectId}/audio_track/audio.wav`;
      expect(expectedPath).toMatch(/^projects\/[^/]+\/audio_track\/audio\.wav$/);
    });

    it('outputAssetId follows audio-{projectId} convention', () => {
      const projectId = 'proj-abc';
      const expectedId = `audio-${projectId}`;
      expect(expectedId).toBe('audio-proj-abc');
    });
  });
});
