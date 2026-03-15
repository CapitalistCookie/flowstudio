import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TaskType } from '../src/types/enums.js';
import {
  TASK_CHAIN_DAG,
  TASK_DEPENDENCIES,
  INITIAL_TASK_TYPES,
  MAX_TASK_RETRIES,
} from '../src/constants.js';

/**
 * Edit plan versioning helper.
 * Creates versioned GCS paths for non-destructive edit plan storage.
 */
function editPlanGcsPath(projectId: string, version: number): string {
  return `projects/${projectId}/signals/edit_plan_v${version}.json`;
}

function latestEditPlanGcsPath(projectId: string): string {
  return `projects/${projectId}/signals/edit_plan.json`;
}

// ─── T26.1: Pipeline pauses at timeline ──────────────────────────────────────

describe('Pipeline Pause at Timeline', () => {
  test('TIMELINE_BUILD has no automatic downstream tasks', () => {
    expect(TASK_CHAIN_DAG[TaskType.TIMELINE_BUILD]).toEqual([]);
  });

  test('RENDER still has no downstream tasks', () => {
    expect(TASK_CHAIN_DAG[TaskType.RENDER]).toEqual([]);
  });

  test('RENDER depends on TIMELINE_BUILD', () => {
    expect(TASK_DEPENDENCIES[TaskType.RENDER]).toContain(TaskType.TIMELINE_BUILD);
  });

  test('DAG is still acyclic after modification', () => {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const tt of Object.values(TaskType)) {
      inDegree.set(tt, 0);
      adj.set(tt, []);
    }
    for (const [src, dsts] of Object.entries(TASK_CHAIN_DAG)) {
      for (const dst of dsts) {
        adj.get(src)!.push(dst);
        inDegree.set(dst, (inDegree.get(dst) ?? 0) + 1);
      }
    }
    const queue: string[] = [];
    for (const [node, deg] of inDegree) {
      if (deg === 0) queue.push(node);
    }
    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const neighbor of adj.get(node) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }
    expect(sorted.length).toBe(Object.values(TaskType).length);
  });

  test('every TaskType still in both DAG and DEPENDENCIES', () => {
    for (const tt of Object.values(TaskType)) {
      expect(TASK_CHAIN_DAG).toHaveProperty(tt);
      expect(TASK_DEPENDENCIES).toHaveProperty(tt);
    }
  });

  test('initial task types unchanged', () => {
    expect(INITIAL_TASK_TYPES).toContain(TaskType.AUDIO_EXTRACT);
    expect(INITIAL_TASK_TYPES).toContain(TaskType.VIDEO_SAMPLE);
    expect(INITIAL_TASK_TYPES).toContain(TaskType.CURSOR_PROCESS);
    expect(INITIAL_TASK_TYPES).toContain(TaskType.TYPING_DETECT);
    expect(INITIAL_TASK_TYPES).toHaveLength(4);
  });
});

// ─── T26.2: User approve creates render ──────────────────────────────────────

describe('User Approve → Render', () => {
  interface SimTask {
    id: string;
    projectId: string;
    taskType: TaskType;
    status: 'pending' | 'claimed' | 'completed' | 'failed';
    inputAssetIds: string[];
    outputAssetIds: string[];
  }

  class RepromptSimulator {
    tasks: SimTask[] = [];
    projectPhase = 'processing';
    private nextId = 1;

    addTask(taskType: TaskType, projectId: string, status: 'pending' | 'completed' = 'pending', outputAssetIds: string[] = []) {
      this.tasks.push({
        id: `task-${this.nextId++}`,
        projectId,
        taskType,
        status,
        inputAssetIds: [],
        outputAssetIds,
      });
    }

    userApproveTimeline(projectId: string): void {
      const tlTask = this.tasks.find(
        t => t.projectId === projectId && t.taskType === TaskType.TIMELINE_BUILD && t.status === 'completed',
      );
      if (!tlTask) throw new Error('No completed TIMELINE_BUILD task found');

      const existingRender = this.tasks.find(
        t => t.projectId === projectId && t.taskType === TaskType.RENDER,
      );
      if (existingRender) throw new Error('RENDER task already exists');

      this.tasks.push({
        id: `task-${this.nextId++}`,
        projectId,
        taskType: TaskType.RENDER,
        status: 'pending',
        inputAssetIds: tlTask.outputAssetIds,
        outputAssetIds: [],
      });
    }

    userRepromptEdits(projectId: string, feedback: string): void {
      const editTask = this.tasks.find(
        t => t.projectId === projectId && t.taskType === TaskType.EDIT_PLAN && t.status === 'completed',
      );
      if (!editTask) throw new Error('No completed EDIT_PLAN task');

      this.tasks.push({
        id: `task-${this.nextId++}`,
        projectId,
        taskType: TaskType.EDIT_PLAN,
        status: 'pending',
        inputAssetIds: editTask.inputAssetIds,
        outputAssetIds: [],
      });

      this.projectPhase = 'reprompting';
    }
  }

  test('userApproveTimeline creates RENDER task', () => {
    const sim = new RepromptSimulator();
    sim.addTask(TaskType.TIMELINE_BUILD, 'proj-1', 'completed', ['timeline-proj-1']);

    sim.userApproveTimeline('proj-1');

    const renderTask = sim.tasks.find(t => t.taskType === TaskType.RENDER);
    expect(renderTask).toBeDefined();
    expect(renderTask!.status).toBe('pending');
    expect(renderTask!.inputAssetIds).toContain('timeline-proj-1');
  });

  test('userApproveTimeline throws if no completed timeline', () => {
    const sim = new RepromptSimulator();
    sim.addTask(TaskType.TIMELINE_BUILD, 'proj-1', 'pending');

    expect(() => sim.userApproveTimeline('proj-1')).toThrow('No completed TIMELINE_BUILD');
  });

  test('userApproveTimeline prevents duplicate RENDER', () => {
    const sim = new RepromptSimulator();
    sim.addTask(TaskType.TIMELINE_BUILD, 'proj-1', 'completed', ['timeline-1']);
    sim.userApproveTimeline('proj-1');

    expect(() => sim.userApproveTimeline('proj-1')).toThrow('already exists');
  });

  test('userRepromptEdits creates new EDIT_PLAN task', () => {
    const sim = new RepromptSimulator();
    sim.addTask(TaskType.EDIT_PLAN, 'proj-1', 'completed', ['edit-plan-1']);

    sim.userRepromptEdits('proj-1', 'Make intro shorter');

    const editTasks = sim.tasks.filter(t => t.taskType === TaskType.EDIT_PLAN);
    expect(editTasks).toHaveLength(2);
    expect(editTasks[1]!.status).toBe('pending');
  });

  test('reprompt sets project phase to reprompting', () => {
    const sim = new RepromptSimulator();
    sim.addTask(TaskType.EDIT_PLAN, 'proj-1', 'completed');
    sim.userRepromptEdits('proj-1', 'Add zoom');

    expect(sim.projectPhase).toBe('reprompting');
  });
});

// ─── T26.3: Edit plan versioning ─────────────────────────────────────────────

describe('Edit Plan Versioning', () => {
  test('editPlanGcsPath creates versioned paths', () => {
    expect(editPlanGcsPath('proj-1', 1)).toBe('projects/proj-1/signals/edit_plan_v1.json');
    expect(editPlanGcsPath('proj-1', 2)).toBe('projects/proj-1/signals/edit_plan_v2.json');
    expect(editPlanGcsPath('proj-1', 3)).toBe('projects/proj-1/signals/edit_plan_v3.json');
  });

  test('latestEditPlanGcsPath returns unversioned path', () => {
    expect(latestEditPlanGcsPath('proj-1')).toBe('projects/proj-1/signals/edit_plan.json');
  });

  test('versioned paths do not conflict with each other', () => {
    const paths = [1, 2, 3, 4, 5].map(v => editPlanGcsPath('proj-1', v));
    const unique = new Set(paths);
    expect(unique.size).toBe(5);
  });

  test('versioned paths are distinct from latest path', () => {
    const latest = latestEditPlanGcsPath('proj-1');
    const v1 = editPlanGcsPath('proj-1', 1);
    expect(latest).not.toBe(v1);
  });
});

// ─── T26.5: Source video immutability ────────────────────────────────────────

describe('Source Video Immutability', () => {
  const ROOT = resolve(__dirname, '../../..');
  const WORKERS_DIR = resolve(ROOT, 'packages/workers');

  function readWorkerSource(name: string): string {
    return readFileSync(resolve(WORKERS_DIR, name, 'src/worker.ts'), 'utf-8');
  }

  test('no worker writes to source_video/ path', () => {
    const workerNames = [
      'audio-extract', 'video-sample', 'cursor-processor', 'typing-detector',
      'speech-transcription', 'video-understanding', 'ui-change-detector',
      'interaction-pattern', 'intent-graph', 'narrative-planner',
      'edit-planner', 'timeline-builder', 'render',
    ];

    for (const w of workerNames) {
      const src = readWorkerSource(w);
      const uploadLines = src.split('\n').filter(l =>
        l.includes('this.gcs.upload') && l.includes('source_video'),
      );
      expect(
        uploadLines.length,
        `${w} should not upload to source_video/`,
      ).toBe(0);
    }
  });

  test('render worker only reads source video, never writes it', () => {
    const src = readWorkerSource('render');
    expect(src).toContain('getSourceVideoPath');
    expect(src).toContain('this.gcs.download');
    const uploadToSource = src.split('\n').filter(l =>
      l.includes('upload') && l.includes('source_video'),
    );
    expect(uploadToSource.length).toBe(0);
  });

  test('render worker output goes to rendered_video/ not source_video/', () => {
    const src = readWorkerSource('render');
    expect(src).toContain('rendered_video/output.mp4');
  });
});

// ─── Pipeline simulator: full reprompt flow ──────────────────────────────────

describe('Full Reprompt Flow Simulation', () => {
  interface SimTask {
    id: string;
    projectId: string;
    taskType: TaskType;
    status: 'pending' | 'claimed' | 'completed' | 'failed';
    inputAssetIds: string[];
    outputAssetIds: string[];
    retryCount: number;
  }

  class FullSimulator {
    tasks: SimTask[] = [];
    projectPhase = 'processing';
    editPlanVersion = 0;
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
        });
      }
    }

    claimAndComplete(type: TaskType, projectId: string, outputAssetIds: string[] = []): void {
      const task = this.tasks.find(t => t.projectId === projectId && t.taskType === type && t.status === 'pending');
      if (!task) throw new Error(`No pending ${type} task`);
      task.status = 'completed';
      task.outputAssetIds = outputAssetIds;

      const downstream = TASK_CHAIN_DAG[type];
      if (!downstream || downstream.length === 0) return;

      const completedTypes = new Set(
        this.tasks.filter(t => t.projectId === projectId && t.status === 'completed').map(t => t.taskType),
      );

      for (const dsType of downstream) {
        if (this.tasks.some(t => t.projectId === projectId && t.taskType === dsType)) continue;
        const deps = TASK_DEPENDENCIES[dsType];
        if (!deps.every(d => completedTypes.has(d))) continue;

        this.tasks.push({
          id: `task-${this.nextId++}`,
          projectId,
          taskType: dsType,
          status: 'pending',
          inputAssetIds: outputAssetIds,
          outputAssetIds: [],
          retryCount: 0,
        });
      }
    }

    approveAndRender(projectId: string): void {
      const timeline = this.tasks.find(
        t => t.projectId === projectId && t.taskType === TaskType.TIMELINE_BUILD && t.status === 'completed',
      );
      if (!timeline) throw new Error('No completed TIMELINE_BUILD');
      this.tasks.push({
        id: `task-${this.nextId++}`,
        projectId,
        taskType: TaskType.RENDER,
        status: 'pending',
        inputAssetIds: timeline.outputAssetIds,
        outputAssetIds: [],
        retryCount: 0,
      });
    }

    reprompt(projectId: string): void {
      this.editPlanVersion++;
      this.tasks.push({
        id: `task-${this.nextId++}`,
        projectId,
        taskType: TaskType.EDIT_PLAN,
        status: 'pending',
        inputAssetIds: [],
        outputAssetIds: [],
        retryCount: 0,
      });
    }
  }

  test('pipeline stops at TIMELINE_BUILD, no RENDER auto-created', () => {
    const sim = new FullSimulator();
    sim.createInitialTasks('proj-1');

    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, 'proj-1', ['audio']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, 'proj-1', ['frames']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, 'proj-1', ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, 'proj-1', ['typing']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, 'proj-1', ['speech']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, 'proj-1', ['video']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, 'proj-1', ['ui']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, 'proj-1', ['clusters']);
    sim.claimAndComplete(TaskType.INTENT_GRAPH, 'proj-1', ['intents']);
    sim.claimAndComplete(TaskType.NARRATIVE_PLAN, 'proj-1', ['narrative']);
    sim.claimAndComplete(TaskType.EDIT_PLAN, 'proj-1', ['edits']);
    sim.claimAndComplete(TaskType.TIMELINE_BUILD, 'proj-1', ['timeline']);

    const renderTask = sim.tasks.find(t => t.taskType === TaskType.RENDER);
    expect(renderTask).toBeUndefined();
  });

  test('user approve creates RENDER, which can complete', () => {
    const sim = new FullSimulator();
    sim.createInitialTasks('proj-1');

    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, 'proj-1', ['audio']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, 'proj-1', ['frames']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, 'proj-1', ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, 'proj-1', ['typing']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, 'proj-1', ['speech']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, 'proj-1', ['video']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, 'proj-1', ['ui']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, 'proj-1', ['clusters']);
    sim.claimAndComplete(TaskType.INTENT_GRAPH, 'proj-1', ['intents']);
    sim.claimAndComplete(TaskType.NARRATIVE_PLAN, 'proj-1', ['narrative']);
    sim.claimAndComplete(TaskType.EDIT_PLAN, 'proj-1', ['edits']);
    sim.claimAndComplete(TaskType.TIMELINE_BUILD, 'proj-1', ['timeline']);

    sim.approveAndRender('proj-1');

    const renderTask = sim.tasks.find(t => t.taskType === TaskType.RENDER && t.status === 'pending');
    expect(renderTask).toBeDefined();
  });

  test('reprompt → new edit plan → new timeline → approve → render', () => {
    const sim = new FullSimulator();
    sim.createInitialTasks('proj-1');

    // Full pipeline to timeline
    sim.claimAndComplete(TaskType.AUDIO_EXTRACT, 'proj-1', ['audio']);
    sim.claimAndComplete(TaskType.VIDEO_SAMPLE, 'proj-1', ['frames']);
    sim.claimAndComplete(TaskType.CURSOR_PROCESS, 'proj-1', ['cursor']);
    sim.claimAndComplete(TaskType.TYPING_DETECT, 'proj-1', ['typing']);
    sim.claimAndComplete(TaskType.SPEECH_TRANSCRIPTION, 'proj-1', ['speech']);
    sim.claimAndComplete(TaskType.VIDEO_UNDERSTANDING, 'proj-1', ['video']);
    sim.claimAndComplete(TaskType.UI_CHANGE_DETECT, 'proj-1', ['ui']);
    sim.claimAndComplete(TaskType.INTERACTION_PATTERN, 'proj-1', ['clusters']);
    sim.claimAndComplete(TaskType.INTENT_GRAPH, 'proj-1', ['intents']);
    sim.claimAndComplete(TaskType.NARRATIVE_PLAN, 'proj-1', ['narrative']);
    sim.claimAndComplete(TaskType.EDIT_PLAN, 'proj-1', ['edits-v1']);
    sim.claimAndComplete(TaskType.TIMELINE_BUILD, 'proj-1', ['timeline-v1']);

    // Reprompt
    sim.reprompt('proj-1');
    expect(sim.editPlanVersion).toBe(1);

    // Complete the reprompted edit plan
    sim.claimAndComplete(TaskType.EDIT_PLAN, 'proj-1', ['edits-v2']);

    // Need new timeline for the new edit plan
    sim.tasks.push({
      id: 'task-manual-tl',
      projectId: 'proj-1',
      taskType: TaskType.TIMELINE_BUILD,
      status: 'pending',
      inputAssetIds: ['edits-v2'],
      outputAssetIds: [],
      retryCount: 0,
    });
    sim.claimAndComplete(TaskType.TIMELINE_BUILD, 'proj-1', ['timeline-v2']);

    // Now approve
    sim.approveAndRender('proj-1');

    const renderTask = sim.tasks.find(t => t.taskType === TaskType.RENDER && t.status === 'pending');
    expect(renderTask).toBeDefined();

    // Verify multiple versions of edit plan exist
    const editPlanTasks = sim.tasks.filter(t => t.taskType === TaskType.EDIT_PLAN && t.status === 'completed');
    expect(editPlanTasks.length).toBe(2);
  });
});
