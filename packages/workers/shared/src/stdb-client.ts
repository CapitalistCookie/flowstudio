import { Logger } from './logger.js';

export interface StdbClientConfig {
  host: string;
  module: string;
  logger: Logger;
}

/**
 * SpacetimeDB client for workers (HTTP-only).
 *
 * Calls reducers via HTTP POST and queries tables via SQL over HTTP.
 * When the official SpacetimeDB TypeScript SDK supports generated bindings,
 * replace this class with DbConnection.builder() — the public API surface
 * (callReducer, queryTable, disconnect) is designed to make that swap minimal.
 *
 * What changes when migrating to the SDK:
 *  - Constructor → DbConnection.builder().withUri().withModuleName().build()
 *  - callReducer() → generated reducer functions (type-safe)
 *  - queryTable() → ctx.db.tableName.iter() with subscription
 *  - isConnected → connection.isActive
 *  - disconnect() → connection.disconnect()
 */
export class StdbClient {
  private readonly baseUrl: string;
  private readonly moduleName: string;
  private readonly logger: Logger;

  constructor(config: StdbClientConfig) {
    const cleanHost = config.host.replace(/^(wss?|https?):\/\//, '');
    const isSecure = config.host.startsWith('wss://') || config.host.startsWith('https://');
    this.baseUrl = `${isSecure ? 'https' : 'http'}://${cleanHost}`;
    this.moduleName = config.module;
    this.logger = config.logger;
    this.logger.info('StdbClient initialized', { baseUrl: this.baseUrl, module: this.moduleName });
  }

  /**
   * Call a SpacetimeDB reducer via HTTP POST.
   * SDK migration: replace with generated reducer call (e.g. FindAndClaimTask.call(conn, args))
   */
  async callReducer(reducerName: string, args: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/database/call/${this.moduleName}/${reducerName}`;
    this.logger.debug(`Calling reducer: ${reducerName}`, { args });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Reducer ${reducerName} failed (${response.status}): ${body}`);
    }
  }

  /**
   * Query a SpacetimeDB table via HTTP SQL endpoint.
   * Returns rows as objects with camelCase keys.
   * SDK migration: replace with ctx.db.tableName.iter() subscription callbacks.
   */
  async queryTable(tableName: string): Promise<Record<string, unknown>[]> {
    const url = `${this.baseUrl}/v1/database/${this.moduleName}/sql`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `SELECT * FROM ${tableName}`,
    });

    if (!response.ok) {
      throw new Error(`SQL query failed (${response.status}): ${await response.text()}`);
    }

    const results = (await response.json()) as Array<{
      schema: { elements: Array<{ name: { some: string } }> };
      rows: unknown[][];
    }>;
    if (!results?.[0]) return [];

    const { schema, rows } = results[0];
    const columns: string[] = schema.elements.map(
      (el: { name: { some: string } }) => {
        const raw = el.name.some;
        return raw.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
      }
    );

    return (rows as unknown[][]).map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        const val = row[i];
        obj[col] = typeof val === 'bigint' ? Number(val) : val;
      });
      return obj;
    });
  }

  /** HTTP client is always "connected". SDK version: return connection.isActive */
  get isConnected(): boolean {
    return true;
  }

  /** No-op for HTTP client. SDK version: connection.disconnect() */
  disconnect(): void {
    this.logger.info('StdbClient disconnected (no-op for HTTP)');
  }
}
