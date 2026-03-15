import { serializeReducerArgs, reducerToSnakeCase } from '@flowstudio/shared';
import { Logger } from './logger.js';

export interface StdbClientConfig {
  host: string;
  module: string;
  logger: Logger;
}

/**
 * SpacetimeDB client for workers (HTTP-only).
 *
 * CRITICAL: The STDB HTTP API expects reducer args as a JSON ARRAY of
 * positional values, NOT a JSON object. See ARCHITECTURE.md §0g.
 * We use serializeReducerArgs() from @flowstudio/shared to ensure
 * correct serialization order.
 */
export class StdbClient {
  private readonly baseUrl: string;
  private readonly moduleName: string;
  private readonly logger: Logger;

  constructor(config: StdbClientConfig) {
    const cleanHost = config.host.replace(/^https?:\/\//, '');
    const isSecure = config.host.startsWith('https://');
    this.baseUrl = `${isSecure ? 'https' : 'http'}://${cleanHost}`;
    this.moduleName = config.module;
    this.logger = config.logger;
    this.logger.info('StdbClient initialized', { baseUrl: this.baseUrl, module: this.moduleName });
  }

  async callReducer(reducerName: string, args: Record<string, unknown>): Promise<void> {
    const snakeName = reducerToSnakeCase(reducerName);
    const url = `${this.baseUrl}/v1/database/${this.moduleName}/call/${snakeName}`;
    this.logger.debug(`Calling reducer: ${reducerName}`, { args });

    let body: string;
    try {
      body = serializeReducerArgs(reducerName, args);
    } catch {
      this.logger.warn(`Unknown reducer "${reducerName}", falling back to object`);
      body = JSON.stringify(args);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Reducer ${reducerName} failed (${response.status}): ${text}`);
    }
  }

  /**
   * Query a SpacetimeDB table via HTTP SQL endpoint.
   * Returns rows as objects with camelCase keys.
   * SDK migration: replace with ctx.db.tableName.iter() subscription callbacks.
   */
  async queryTable(tableName: string): Promise<Record<string, unknown>[]> {
    // Validate table name to prevent SQL injection
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }

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
