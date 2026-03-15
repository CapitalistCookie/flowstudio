/**
 * Shared mock infrastructure for all worker tests.
 * Reusable by downstream worker packages via import.
 */

export class MockGcsClient {
  private store = new Map<string, Buffer>();

  async upload(path: string, data: Buffer): Promise<void> {
    this.store.set(this.clean(path), data);
  }

  async download(path: string): Promise<Buffer> {
    const data = this.store.get(this.clean(path));
    if (!data) throw new Error(`File not found: ${path}`);
    return data;
  }

  async exists(path: string): Promise<boolean> {
    return this.store.has(this.clean(path));
  }

  private clean(path: string): string {
    return path.replace(/^gs:\/\/[^/]+\//, '');
  }
}

/**
 * Mock DbConnection that records reducer calls for assertion.
 * Mirrors the shape of the real DbConnection from module_bindings.
 */
export class MockDbConnection {
  public reducerCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  public isActive = true;

  readonly reducers = {
    writeSignal: async (args: Record<string, unknown>) => {
      this.reducerCalls.push({ name: 'writeSignal', args });
    },
    completeTask: async (args: Record<string, unknown>) => {
      this.reducerCalls.push({ name: 'completeTask', args });
    },
    failTask: async (args: Record<string, unknown>) => {
      this.reducerCalls.push({ name: 'failTask', args });
    },
    findAndClaimTask: async (args: Record<string, unknown>) => {
      this.reducerCalls.push({ name: 'findAndClaimTask', args });
    },
    updateWorkerConfig: async (args: Record<string, unknown>) => {
      this.reducerCalls.push({ name: 'updateWorkerConfig', args });
    },
    registerIdentity: async (args: Record<string, unknown>) => {
      this.reducerCalls.push({ name: 'registerIdentity', args });
    },
    registerWorkerIdentity: async (args: Record<string, unknown>) => {
      this.reducerCalls.push({ name: 'registerWorkerIdentity', args });
    },
  };

  readonly db = {
    tasks: {
      onInsert: (_cb: any) => {},
      onUpdate: (_cb: any) => {},
    },
  };

  disconnect(): void {}
}

export class MockLogger {
  public logs: Array<{ level: string; msg: string; data?: Record<string, unknown> }> = [];

  debug(msg: string, data?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', msg, data });
  }
  info(msg: string, data?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', msg, data });
  }
  warn(msg: string, data?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', msg, data });
  }
  error(msg: string, data?: Record<string, unknown>): void {
    this.logs.push({ level: 'error', msg, data });
  }
}
