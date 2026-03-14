import { describe, test, expect } from 'vitest';
import {
  TASK_CHAIN_DAG,
  TASK_DEPENDENCIES,
  INITIAL_TASK_TYPES,
} from '../src/constants.js';
import { TaskType } from '../src/types/enums.js';

// ─── T1.1: DAG ↔ DEPENDENCIES are inverses ──────────────────────────────────
describe('DAG consistency', () => {
  test('TASK_CHAIN_DAG and TASK_DEPENDENCIES are inverses', () => {
    for (const [upstream, downstreams] of Object.entries(TASK_CHAIN_DAG)) {
      for (const ds of downstreams) {
        expect(
          TASK_DEPENDENCIES[ds],
          `TASK_DEPENDENCIES[${ds}] should include ${upstream}`,
        ).toContain(upstream);
      }
    }
  });

  // ─── T1.2: Every TaskType in both maps ──────────────────────────────────────
  test('every TaskType appears in both DAG and DEPENDENCIES', () => {
    for (const tt of Object.values(TaskType)) {
      expect(TASK_CHAIN_DAG).toHaveProperty(tt);
      expect(TASK_DEPENDENCIES).toHaveProperty(tt);
    }
  });

  // ─── T1.3: DAG has no cycles (Kahn's algorithm) ────────────────────────────
  test('DAG has no cycles', () => {
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

  // ─── T1.4: INITIAL_TASK_TYPES have empty deps ──────────────────────────────
  test('initial task types have empty dependencies', () => {
    for (const tt of INITIAL_TASK_TYPES) {
      expect(TASK_DEPENDENCIES[tt]).toEqual([]);
    }
  });

  // ─── T1.5: RENDER is terminal ──────────────────────────────────────────────
  test('RENDER has no downstream tasks', () => {
    expect(TASK_CHAIN_DAG[TaskType.RENDER]).toEqual([]);
  });

  // RENDER is manually triggered (user approval), so it's excluded from auto-chain inverse check
  const MANUALLY_TRIGGERED: Set<string> = new Set([TaskType.RENDER]);

  test('every auto-chained dependency in TASK_DEPENDENCIES appears as upstream in TASK_CHAIN_DAG', () => {
    for (const [downstream, deps] of Object.entries(TASK_DEPENDENCIES)) {
      if (MANUALLY_TRIGGERED.has(downstream)) continue;
      for (const dep of deps) {
        expect(
          TASK_CHAIN_DAG[dep as TaskType],
          `TASK_CHAIN_DAG[${dep}] should include ${downstream}`,
        ).toContain(downstream);
      }
    }
  });

  test('RENDER has TIMELINE_BUILD as dependency but is manually triggered', () => {
    expect(TASK_DEPENDENCIES[TaskType.RENDER]).toContain(TaskType.TIMELINE_BUILD);
    expect(TASK_CHAIN_DAG[TaskType.TIMELINE_BUILD]).not.toContain(TaskType.RENDER);
  });
});
