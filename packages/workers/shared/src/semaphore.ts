/**
 * Simple counting semaphore for limiting concurrent operations.
 */
export class Semaphore {
  private current = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {
    if (max < 1) throw new Error('Semaphore max must be >= 1');
  }

  /** Acquire a permit. Resolves when a slot is available. */
  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  /** Release a permit, allowing queued waiters to proceed. */
  release(): void {
    if (this.current <= 0) {
      throw new Error('Semaphore: release without acquire');
    }
    this.current--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  /** Run an async function with semaphore protection. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** Current number of active permits */
  get activeCount(): number {
    return this.current;
  }

  /** Number of waiters in queue */
  get waitingCount(): number {
    return this.queue.length;
  }
}
