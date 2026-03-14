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

export class MockStdbClient {
  public reducerCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  private tables: Record<string, Record<string, unknown>[]> = {};

  async callReducer(name: string, args: Record<string, unknown>): Promise<void> {
    this.reducerCalls.push({ name, args });
  }

  async queryTable(tableName: string): Promise<Record<string, unknown>[]> {
    return this.tables[tableName] ?? [];
  }

  setTableData(tableName: string, rows: Record<string, unknown>[]): void {
    this.tables[tableName] = rows;
  }

  get isConnected(): boolean {
    return true;
  }

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
