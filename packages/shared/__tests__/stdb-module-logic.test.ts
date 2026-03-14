import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TaskType } from '../src/types/enums.js';
import {
  TASK_CHAIN_DAG,
  TASK_DEPENDENCIES,
  MAX_TASK_RETRIES,
  STALE_TASK_THRESHOLD_MS,
} from '../src/constants.js';

// ─── T18.1: DAG consistency — stdb-module matches shared constants ──────────

describe('T18.1 — DAG Consistency', () => {
  const stdbModulePath = resolve(__dirname, '../../stdb-module/src/index.ts');
  const stdbSource = readFileSync(stdbModulePath, 'utf-8');

  function extractStdbDag(varName: string): Record<string, string[]> {
    const pattern = new RegExp(
      `const ${varName}[^=]*=\\s*\\{([^}]+(?:\\{[^}]*\\}[^}]*)*)\\}`,
      's',
    );
    const match = stdbSource.match(pattern);
    if (!match) throw new Error(`Could not find ${varName} in stdb-module source`);

    const body = match[1];
    const dag: Record<string, string[]> = {};
    const linePattern = /(\w+):\s*\[([^\]]*)\]/g;
    let lineMatch;
    while ((lineMatch = linePattern.exec(body)) !== null) {
      const key = lineMatch[1];
      const values = lineMatch[2]
        .split(',')
        .map(v => v.trim().replace(/"/g, ''))
        .filter(Boolean);
      dag[key] = values;
    }
    return dag;
  }

  test('stdb-module TASK_CHAIN_DAG matches shared constants', () => {
    const stdbDag = extractStdbDag('TASK_CHAIN_DAG');

    for (const taskType of Object.values(TaskType)) {
      const sharedDownstream = TASK_CHAIN_DAG[taskType].map(t => t.toString());
      const stdbDownstream = stdbDag[taskType] ?? [];
      expect(stdbDownstream.sort()).toEqual(sharedDownstream.sort());
    }
  });

  test('stdb-module TASK_DEPENDENCIES matches shared constants', () => {
    const stdbDeps = extractStdbDag('TASK_DEPENDENCIES');

    for (const taskType of Object.values(TaskType)) {
      const sharedDeps = TASK_DEPENDENCIES[taskType].map(t => t.toString());
      const stdbD = stdbDeps[taskType] ?? [];
      expect(stdbD.sort()).toEqual(sharedDeps.sort());
    }
  });

  test('stdb-module MAX_TASK_RETRIES matches shared constant', () => {
    const match = stdbSource.match(/const MAX_TASK_RETRIES\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(MAX_TASK_RETRIES);
  });

  test('stdb-module STALE_TASK_THRESHOLD_MS matches shared constant', () => {
    const match = stdbSource.match(/const STALE_TASK_THRESHOLD_MS\s*=\s*BigInt\((\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)\)/);
    expect(match).not.toBeNull();
    const stdbThreshold = Number(match![1]) * Number(match![2]) * Number(match![3]);
    expect(stdbThreshold).toBe(STALE_TASK_THRESHOLD_MS);
  });
});

// ─── T18.2: Task State Machine ──────────────────────────────────────────────

describe('T18.2 — Task State Machine', () => {
  type TaskStatus = 'pending' | 'claimed' | 'completed' | 'failed';

  const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    pending: ['claimed'],
    claimed: ['completed', 'failed'],
    completed: [],
    failed: [],
  };

  function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
    return VALID_TRANSITIONS[from].includes(to);
  }

  test('pending → claimed is valid', () => {
    expect(isValidTransition('pending', 'claimed')).toBe(true);
  });

  test('claimed → completed is valid', () => {
    expect(isValidTransition('claimed', 'completed')).toBe(true);
  });

  test('claimed → failed is valid', () => {
    expect(isValidTransition('claimed', 'failed')).toBe(true);
  });

  test('completed → pending is invalid', () => {
    expect(isValidTransition('completed', 'pending')).toBe(false);
  });

  test('failed → claimed is invalid', () => {
    expect(isValidTransition('failed', 'claimed')).toBe(false);
  });

  test('pending → completed is invalid (must claim first)', () => {
    expect(isValidTransition('pending', 'completed')).toBe(false);
  });

  test('pending → failed is invalid (must claim first)', () => {
    expect(isValidTransition('pending', 'failed')).toBe(false);
  });

  test('completed → failed is invalid', () => {
    expect(isValidTransition('completed', 'failed')).toBe(false);
  });

  test('stdb-module claimTask enforces pending-only claiming', () => {
    const stdbSource = readFileSync(
      resolve(__dirname, '../../stdb-module/src/index.ts'),
      'utf-8',
    );
    expect(stdbSource).toContain('task.status !== "pending"');
  });
});

// ─── T18.3: Watchdog Stale Detection ────────────────────────────────────────

describe('T18.3 — Watchdog Stale Detection', () => {
  function isStale(claimedAtMs: number, nowMs: number): boolean {
    if (claimedAtMs === 0) return false;
    return (nowMs - claimedAtMs) > STALE_TASK_THRESHOLD_MS;
  }

  test('task is stale when claimed > 5 minutes ago', () => {
    const now = Date.now();
    const sixMinAgo = now - 6 * 60 * 1000;
    expect(isStale(sixMinAgo, now)).toBe(true);
  });

  test('task is NOT stale when claimed < 5 minutes ago', () => {
    const now = Date.now();
    const fourMinAgo = now - 4 * 60 * 1000;
    expect(isStale(fourMinAgo, now)).toBe(false);
  });

  test('task with claimedAt=0 is NOT stale (not yet claimed)', () => {
    expect(isStale(0, Date.now())).toBe(false);
  });

  test('task at exactly threshold boundary is NOT stale', () => {
    const now = Date.now();
    const exactThreshold = now - STALE_TASK_THRESHOLD_MS;
    expect(isStale(exactThreshold, now)).toBe(false);
  });

  test('task 1ms past threshold IS stale', () => {
    const now = Date.now();
    const justPastThreshold = now - STALE_TASK_THRESHOLD_MS - 1;
    expect(isStale(justPastThreshold, now)).toBe(true);
  });
});

// ─── T18.4: Watchdog Requeue vs Fail ────────────────────────────────────────

describe('T18.4 — Watchdog Requeue vs Fail', () => {
  function watchdogAction(retryCount: number, maxRetries: number): 'requeue' | 'fail' {
    if (retryCount >= maxRetries) return 'fail';
    return 'requeue';
  }

  test('stale task with retries remaining: requeued', () => {
    expect(watchdogAction(0, MAX_TASK_RETRIES)).toBe('requeue');
    expect(watchdogAction(1, MAX_TASK_RETRIES)).toBe('requeue');
    expect(watchdogAction(2, MAX_TASK_RETRIES)).toBe('requeue');
  });

  test('stale task without retries remaining: failed', () => {
    expect(watchdogAction(MAX_TASK_RETRIES, MAX_TASK_RETRIES)).toBe('fail');
    expect(watchdogAction(MAX_TASK_RETRIES + 1, MAX_TASK_RETRIES)).toBe('fail');
  });

  test('stdb-module watchdog uses retryCount >= maxRetries threshold', () => {
    const stdbSource = readFileSync(
      resolve(__dirname, '../../stdb-module/src/index.ts'),
      'utf-8',
    );
    expect(stdbSource).toContain('task.retryCount >= (task.maxRetries || MAX_TASK_RETRIES)');
  });
});

// ─── T18.5: generateId Uniqueness ───────────────────────────────────────────

describe('T18.5 — generateId Uniqueness', () => {
  function generateTestId(): string {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  test('generates unique IDs across 1000 invocations', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateTestId()));
    expect(ids.size).toBe(1000);
  });

  test('ID format is base36-timestamp-dash-random', () => {
    const id = generateTestId();
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  test('IDs have reasonable length (15-25 characters)', () => {
    const id = generateTestId();
    expect(id.length).toBeGreaterThanOrEqual(15);
    expect(id.length).toBeLessThanOrEqual(25);
  });

  test('stdb-module uses timestamp-based ID generation', () => {
    const stdbSource = readFileSync(
      resolve(__dirname, '../../stdb-module/src/index.ts'),
      'utf-8',
    );
    expect(stdbSource).toContain('toString(36)');
    expect(stdbSource).toContain('Math.random()');
  });
});

// ─── Reducer existence verification ─────────────────────────────────────────

describe('Reducer Existence', () => {
  const stdbSource = readFileSync(
    resolve(__dirname, '../../stdb-module/src/index.ts'),
    'utf-8',
  );

  const expectedReducers = [
    'createProject',
    'createAsset',
    'createTask',
    'claimTask',
    'findAndClaimTask',
    'completeTask',
    'failTask',
    'writeSignal',
    'ingestInteractionBatch',
    'updateProjectState',
    'updateWorkerConfig',
    'toggleProjectStar',
    'createFolder',
    'renameFolder',
    'deleteFolder',
    'moveProjectToFolder',
  ];

  for (const reducer of expectedReducers) {
    test(`${reducer} reducer exists`, () => {
      expect(stdbSource).toContain(`"${reducer}"`);
    });
  }
});

// ─── Table existence verification ───────────────────────────────────────────

describe('Table Existence', () => {
  const stdbSource = readFileSync(
    resolve(__dirname, '../../stdb-module/src/index.ts'),
    'utf-8',
  );

  const expectedTables = [
    'projects',
    'folders',
    'assets',
    'tasks',
    'signals',
    'project_state',
    'worker_configs',
  ];

  for (const tableName of expectedTables) {
    test(`${tableName} table exists`, () => {
      expect(stdbSource).toContain(`name: "${tableName}"`);
    });
  }
});

// ─── Index verification ─────────────────────────────────────────────────────

describe('BTree Index Verification', () => {
  const stdbSource = readFileSync(
    resolve(__dirname, '../../stdb-module/src/index.ts'),
    'utf-8',
  );

  test('tasks table has byTaskTypeStatus index for findAndClaimTask', () => {
    expect(stdbSource).toContain("name: 'byTaskTypeStatus'");
    expect(stdbSource).toContain("columns: ['taskType', 'status']");
  });

  test('tasks table has byProjectId index for completeTask dependency scan', () => {
    expect(stdbSource).toContain("columns: ['projectId']");
  });

  test('findAndClaimTask uses byTaskTypeStatus index', () => {
    expect(stdbSource).toContain('ctx.db.tasks.byTaskTypeStatus.filter');
  });

  test('completeTask uses byProjectId index for dependency scan', () => {
    expect(stdbSource).toContain('ctx.db.tasks.byProjectId.filter');
  });
});

// ─── Security checks ───────────────────────────────────────────────────────

describe('Security Checks', () => {
  const stdbSource = readFileSync(
    resolve(__dirname, '../../stdb-module/src/index.ts'),
    'utf-8',
  );

  test('project_state table is private (not public)', () => {
    const match = stdbSource.match(/table\(\s*\{[^}]*name:\s*"project_state"[^}]*\}/s);
    expect(match).not.toBeNull();
    expect(match![0]).toContain('public: false');
  });

  test('worker_configs table is private (not public)', () => {
    const match = stdbSource.match(/table\(\s*\{[^}]*name:\s*"worker_configs"[^}]*\}/s);
    expect(match).not.toBeNull();
    expect(match![0]).toContain('public: false');
  });

  test('ingestInteractionBatch enforces batch size limit', () => {
    expect(stdbSource).toContain('batch.length > 1000');
  });
});
