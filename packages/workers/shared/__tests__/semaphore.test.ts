import { describe, test, expect } from 'vitest';
import { Semaphore } from '../src/semaphore.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('Semaphore', () => {
  // T2.1 — Basic Acquire/Release: up to max concurrent
  test('allows up to max concurrent, then queues', async () => {
    const sem = new Semaphore(2);
    const order: number[] = [];
    const task = (id: number, delay: number) =>
      sem.run(async () => {
        order.push(id);
        await sleep(delay);
      });

    await Promise.all([task(1, 80), task(2, 80), task(3, 10)]);
    // Tasks 1 and 2 acquire immediately (max 2); task 3 waits for one to release
    expect(order.slice(0, 2)).toEqual([1, 2]);
    expect(order).toContain(3);
  });

  // T2.2 — Over-Release Guard
  test('throws on release without acquire', () => {
    const sem = new Semaphore(1);
    expect(() => sem.release()).toThrow('Semaphore: release without acquire');
  });

  // T2.3 — activeCount tracks correctly
  test('activeCount tracks correctly', async () => {
    const sem = new Semaphore(3);
    expect(sem.activeCount).toBe(0);
    await sem.acquire();
    expect(sem.activeCount).toBe(1);
    await sem.acquire();
    expect(sem.activeCount).toBe(2);
    sem.release();
    expect(sem.activeCount).toBe(1);
    sem.release();
    expect(sem.activeCount).toBe(0);
  });

  test('constructor rejects max < 1', () => {
    expect(() => new Semaphore(0)).toThrow('Semaphore max must be >= 1');
    expect(() => new Semaphore(-1)).toThrow('Semaphore max must be >= 1');
  });

  test('waitingCount reflects queued waiters', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem.waitingCount).toBe(0);

    const p1 = sem.acquire();
    const p2 = sem.acquire();
    expect(sem.waitingCount).toBe(2);

    sem.release();
    await p1;
    expect(sem.waitingCount).toBe(1);

    sem.release();
    await p2;
    expect(sem.waitingCount).toBe(0);

    sem.release();
  });

  test('run releases semaphore even when fn throws', async () => {
    const sem = new Semaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(sem.activeCount).toBe(0);
  });
});
