import { describe, test, expect } from 'vitest';
import { TaskType } from '../src/types/enums.js';
import {
  TASK_CHAIN_DAG,
  TASK_DEPENDENCIES,
  INITIAL_TASK_TYPES,
  MAX_TASK_RETRIES,
} from '../src/constants.js';

// ─── Pipeline Simulator ─────────────────────────────────────────────────────────
// Simulates the SpacetimeDB completeTask/failTask reducer logic using in-memory state.
// This lets us integration-test DAG chaining without a live SpacetimeDB instance.

interface SimTask {
  id: string;
  projectId: string;
  taskType: TaskType;
  status: 'pending' | 'claimed' | 'completed' | 'failed';
  inputAssetIds: string[];
  outputAssetIds: string[];
  retryCount: number;
  maxRetries: number;
}

class PipelineSimulator {
  tasks: SimTask[] = [];
  projectPhase = 'processing';
  private nextId = 1;

  createInitialTasks(projectId: string): void {
    for (const tt of INITIAL_TASK_TYPES) {
      this.tasks.push({
        id: `task-${this.nextId++}`,
        projectId,
        taskType: tt,
        status: 'pending',
        inputAssetIds: [],
        outputAssetIds: [],
        retryCount: 0,
        maxRetries: MAX_TASK_RETRIES,
      });
    }
  }

  claimTask(taskId: string, workerId: string): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== 'pending') throw new Error(`Cannot claim ${task.status} task`);
    task.status = 'claimed';
  }

  completeTask(taskId: string, outputAssetIds: string[] = []): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.status = 'completed';
    task.outputAssetIds = outputAssetIds;

    const completedType = task.taskType;
    const projectId = task.projectId;

    const downstreamTypes = TASK_CHAIN_DAG[completedType];
    if (!downstreamTypes || downstreamTypes.length === 0) {
      if (completedType === TaskType.RENDER) {
        this.projectPhase = 'ready';
      } else if (completedType === TaskType.TIMELINE_BUILD) {
        this.projectPhase = 'preview';
      }
      return;
    }

    const completedTypesSet = new Set<TaskType>();
    const existingTaskTypes = new Set<TaskType>();
    for (const t of this.tasks) {
      if (t.projectId === projectId) {
        if (t.status === 'completed') completedTypesSet.add(t.taskType);
        existingTaskTypes.add(t.taskType);
      }
    }
    completedTypesSet.add(completedType);

    for (const dsType of downstreamTypes) {
      if (existingTaskTypes.has(dsType)) continue;
      const deps = TASK_DEPENDENCIES[dsType];
      if (!deps) continue;
      if (!deps.every(dep => completedTypesSet.has(dep))) continue;

      const upstreamAssetIds: string[] = [];
      for (const t of this.tasks) {
        if (t.projectId === projectId && t.status === 'completed' && deps.includes(t.taskType)) {
          upstreamAssetIds.push(...t.outputAssetIds);
        }
      }

      this.tasks.push({
        id: `task-${this.nextId++}`,
        projectId,
        taskType: dsType,
        status: 'pending',
        inputAssetIds: upstreamAssetIds,
        outputAssetIds: [],
        retryCount: 0,
        maxRetries: MAX_TASK_RETRIES,
      });
    }
  }

  failTask(taskId: string): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.status = 'failed';

    if (task.retryCount < task.maxRetries) {
      this.tasks.push({
        id: `task-${this.nextId++}`,
        projectId: task.projectId,
        taskType: task.taskType,
        status: 'pending',
        inputAssetIds: task.inputAssetIds,
        outputAssetIds: [],
        retryCount: task.retryCount + 1,
        maxRetries: task.maxRetries,
      });
    } else {
      this.projectPhase = 'failed';
    }
  }

  getPendingOfType(type: TaskType): SimTask | undefined {
    return this.tasks.find(t => t.taskType === type && t.status === 'pending');
  }

  getCompletedTypes(): Set<TaskType> {
    return new Set(
      this.tasks.filter(t => t.status === 'completed').map(t => t.taskType),
    );
  }

  claimAndComplete(type: TaskType, outputAssetIds: string[] = []): void {
    const task = this.getPendingOfType(type);
    if (!task) throw new Error(`No pending ${type} task`);
    this.claimTask(task.id, 'worker-1');
    this.completeTask(task.id, outputAssetIds);
  }

  userApproveTimeline(projectId: string): void {
    const timeline = this.tasks.find(
      t => t.projectId === projectId && t.taskType === TaskType.TIMELINE_BUILD && t.status === 'completed',
    );
    if (!timeline) throw new Error('No completed TIMELINE_BUILD task');
    this.tasks.push({
      id: `task-${this.nextId++}`,
      projectId,
      taskType: TaskType.RENDER,
      status: 'pending',
      inputAssetIds: timeline.outputAssetIds,
      outputAssetIds: [],
      retryCount: 0,
      maxRetries: MAX_TASK_RETRIES,
    });
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Pipeline DAG Integration', () => {
  let sim: PipelineSimulator;

  beforeEach(() => {
    sim = new PipelineSimulator();
    sim.createInitialTasks('proj-1');
  });

  // ─── T17.1: Single-dependency chain ───────────────────────────────────

  test('AUDIO_EXTRACT completion creates SPEECH_TRANSCRIPTION', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio-proj-1']);

    const st = sim.getPendingOfType(TaskType.SPEECH_TRANSCRIPTION);
    expect(st).toBeDefined();
    expect(st!.inputAssetIds).toEqual(['audio-proj-1']);
  });

  test('VIDEO_SAMPLE completion creates VIDEO_UNDERSTANDING and UI_CHANGE_DETECT', () => {
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['frame-0000', 'frame-0001']);

    expect(sim.getPendingOfType(TaskType.VIDEO_UNDERSTANDING)).toBeDefined();
    expect(sim.getPendingOfType(TaskType.UI_CHANGE_DETECT)).toBeDefined();
  });

  test('CURSOR_PROCESS completion creates INTERACTION_PATTERN only if TYPING_DETECT also done', () => {
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor-data']);

    expect(sim.getPendingOfType(TaskType.INTERACTION_PATTERN)).toBeUndefined();

    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing-data']);

    expect(sim.getPendingOfType(TaskType.INTERACTION_PATTERN)).toBeDefined();
  });

  // ─── T17.2: Multi-dependency gating (INTENT_GRAPH) ────────────────────

  test('INTENT_GRAPH only created when ALL 4 deps complete', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, ['speech']);

    expect(sim.getPendingOfType(TaskType.INTENT_GRAPH)).toBeUndefined();

    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['frames']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, ['scenes']);

    expect(sim.getPendingOfType(TaskType.INTENT_GRAPH)).toBeUndefined();

    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, ['ui']);

    expect(sim.getPendingOfType(TaskType.INTENT_GRAPH)).toBeUndefined();

    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, ['clusters']);

    expect(sim.getPendingOfType(TaskType.INTENT_GRAPH)).toBeDefined();
  });

  test('INTENT_GRAPH inputAssetIds includes outputs from all 4 upstream tasks', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, ['speech-out']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['frames']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, ['video-out']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, ['ui-out']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, ['cluster-out']);

    const ig = sim.getPendingOfType(TaskType.INTENT_GRAPH);
    expect(ig).toBeDefined();
    expect(ig!.inputAssetIds).toContain('speech-out');
    expect(ig!.inputAssetIds).toContain('video-out');
    expect(ig!.inputAssetIds).toContain('ui-out');
    expect(ig!.inputAssetIds).toContain('cluster-out');
  });

  // ─── T17.3: Duplicate prevention ──────────────────────────────────────

  test('does not create duplicate task if type already exists', () => {
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing']);

    const interactionTasks = sim.tasks.filter(t => t.taskType === TaskType.INTERACTION_PATTERN);
    expect(interactionTasks).toHaveLength(1);
  });

  test('completing second dep after first does not duplicate downstream', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, ['speech']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['frames']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, ['video']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, ['ui']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, ['clusters']);

    const igTasks = sim.tasks.filter(t => t.taskType === TaskType.INTENT_GRAPH);
    expect(igTasks).toHaveLength(1);
  });

  // ─── T17.4: Output asset propagation ──────────────────────────────────

  test('downstream task inputAssetIds = union of upstream outputAssetIds', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio-out']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, ['speech-out-1', 'speech-out-2']);

    const ig = sim.tasks.find(t => t.taskType === TaskType.SPEECH_TRANSCRIPTION && t.status === 'completed');
    expect(ig).toBeDefined();

    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['frames']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, ['vu-1']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, ['ucd-1']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cp-1']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['td-1']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, ['ip-1']);

    const intentGraph = sim.getPendingOfType(TaskType.INTENT_GRAPH);
    expect(intentGraph).toBeDefined();
    expect(intentGraph!.inputAssetIds).toContain('speech-out-1');
    expect(intentGraph!.inputAssetIds).toContain('speech-out-2');
    expect(intentGraph!.inputAssetIds).toContain('vu-1');
    expect(intentGraph!.inputAssetIds).toContain('ucd-1');
    expect(intentGraph!.inputAssetIds).toContain('ip-1');
  });

  // ─── T17.5: Terminal completion (RENDER → project ready) ──────────────

  test('TIMELINE_BUILD completion sets project phase to preview', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['frames']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, ['speech']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, ['video']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, ['ui']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, ['clusters']);
    sim.claimAndComplete(TaskType.INTENT_GRAPH, ['intents']);
    sim.claimAndComplete(TaskType.NARRATIVE_PLAN, ['narrative']);
    sim.claimAndComplete(TaskType.EDIT_PLAN, ['edits']);
    sim.claimAndComplete(TaskType.TIMELINE_BUILD, ['timeline']);

    expect(sim.projectPhase).toBe('preview');
  });

  test('RENDER completion (after user approval) sets project phase to ready', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['frames']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, ['speech']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, ['video']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, ['ui']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, ['clusters']);
    sim.claimAndComplete(TaskType.INTENT_GRAPH, ['intents']);
    sim.claimAndComplete(TaskType.NARRATIVE_PLAN, ['narrative']);
    sim.claimAndComplete(TaskType.EDIT_PLAN, ['edits']);
    sim.claimAndComplete(TaskType.TIMELINE_BUILD, ['timeline']);
    sim.userApproveTimeline('proj-1');
    sim.claimAndComplete(TaskType.RENDER, ['rendered']);

    expect(sim.projectPhase).toBe('ready');
  });

  // ─── T17.6: Full pipeline traversal ───────────────────────────────────

  test('full pipeline from initial tasks through user approval to RENDER', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['frames']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing']);

    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, ['speech']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, ['video']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, ['ui']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, ['clusters']);

    sim.claimAndComplete(TaskType.INTENT_GRAPH, ['intents']);
    sim.claimAndComplete(TaskType.NARRATIVE_PLAN, ['narrative']);
    sim.claimAndComplete(TaskType.EDIT_PLAN, ['edits']);
    sim.claimAndComplete(TaskType.TIMELINE_BUILD, ['timeline']);

    expect(sim.projectPhase).toBe('preview');

    sim.userApproveTimeline('proj-1');
    sim.claimAndComplete(TaskType.RENDER, ['rendered']);

    const completedTypes = sim.getCompletedTypes();
    expect(completedTypes.size).toBe(13);
    for (const tt of Object.values(TaskType)) {
      expect(completedTypes.has(tt)).toBe(true);
    }

    expect(sim.projectPhase).toBe('ready');
  });

  // ─── T17.7: Partial failure → retry → continue ───────────────────────

  test('failed task with retries remaining creates new pending task', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);

    const stTask = sim.getPendingOfType(TaskType.SPEECH_TRANSCRIPTION);
    expect(stTask).toBeDefined();
    sim.claimTask(stTask!.id, 'worker-1');
    sim.failTask(stTask!.id);

    const retryTask = sim.tasks.find(
      t => t.taskType === TaskType.SPEECH_TRANSCRIPTION && t.status === 'pending',
    );
    expect(retryTask).toBeDefined();
    expect(retryTask!.retryCount).toBe(1);
  });

  test('retry task preserves inputAssetIds from original', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio-out']);

    const stTask = sim.getPendingOfType(TaskType.SPEECH_TRANSCRIPTION);
    sim.claimTask(stTask!.id, 'worker-1');
    sim.failTask(stTask!.id);

    const retryTask = sim.tasks.find(
      t => t.taskType === TaskType.SPEECH_TRANSCRIPTION && t.status === 'pending',
    );
    expect(retryTask!.inputAssetIds).toEqual(stTask!.inputAssetIds);
  });

  // ─── T17.8: Terminal failure → project failed ─────────────────────────

  test('max retries exhausted sets project to failed', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);

    for (let i = 0; i <= MAX_TASK_RETRIES; i++) {
      const stTask = sim.getPendingOfType(TaskType.SPEECH_TRANSCRIPTION);
      if (!stTask) break;
      sim.claimTask(stTask.id, 'worker-1');
      sim.failTask(stTask.id);
    }

    expect(sim.projectPhase).toBe('failed');
  });

  test('failing below max retries does NOT set project to failed', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['audio']);

    const stTask = sim.getPendingOfType(TaskType.SPEECH_TRANSCRIPTION);
    sim.claimTask(stTask!.id, 'worker-1');
    sim.failTask(stTask!.id);

    expect(sim.projectPhase).toBe('processing');
  });

  // ─── Initial tasks ───────────────────────────────────────────────────

  test('initial tasks are AUDIO_EXTRACT, VIDEO_SAMPLE, CURSOR_PROCESS, TYPING_DETECT', () => {
    const initialTypes = sim.tasks.map(t => t.taskType);
    expect(initialTypes).toContain(TaskType.AUDIO_EXTRACT);
    expect(initialTypes).toContain(TaskType.VIDEO_SAMPLE);
    expect(initialTypes).toContain(TaskType.CURSOR_PROCESS);
    expect(initialTypes).toContain(TaskType.TYPING_DETECT);
    expect(initialTypes).toHaveLength(4);
  });

  test('initial tasks all start as pending', () => {
    for (const task of sim.tasks) {
      expect(task.status).toBe('pending');
    }
  });

  // ─── Ordering independence ────────────────────────────────────────────

  test('completing deps in any order still triggers downstream', () => {
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['typing']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['cursor']);

    expect(sim.getPendingOfType(TaskType.INTERACTION_PATTERN)).toBeDefined();
  });

  // ─── Linear chain portion ─────────────────────────────────────────────

  test('INTENT_GRAPH → NARRATIVE_PLAN → EDIT_PLAN → TIMELINE_BUILD is linear, RENDER is manual', () => {
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, ['a']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, ['v']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, ['c']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, ['t']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, ['st']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, ['vu']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, ['ucd']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, ['ip']);

    sim.claimAndComplete(TaskType.INTENT_GRAPH, ['ig']);
    expect(sim.getPendingOfType(TaskType.NARRATIVE_PLAN)).toBeDefined();

    sim.claimAndComplete(TaskType.NARRATIVE_PLAN, ['np']);
    expect(sim.getPendingOfType(TaskType.EDIT_PLAN)).toBeDefined();

    sim.claimAndComplete(TaskType.EDIT_PLAN, ['ep']);
    expect(sim.getPendingOfType(TaskType.TIMELINE_BUILD)).toBeDefined();

    sim.claimAndComplete(TaskType.TIMELINE_BUILD, ['tl']);
    expect(sim.getPendingOfType(TaskType.RENDER)).toBeUndefined();
    expect(sim.projectPhase).toBe('preview');

    sim.userApproveTimeline('proj-1');
    expect(sim.getPendingOfType(TaskType.RENDER)).toBeDefined();
  });
});
