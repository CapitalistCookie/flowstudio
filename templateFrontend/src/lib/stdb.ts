'use client';

/**
 * SpacetimeDB connection manager for the browser client.
 * Uses HTTP endpoints for data fetching and reducer calls.
 * STDB v2 WebSocket requires BSATN binary protocol for client messages,
 * so we use HTTP polling instead until the official TS SDK is integrated.
 */

export interface StdbConfig {
  host: string;
  module: string;
}

export class StdbConnection {
  private readonly config: StdbConfig;
  private readonly httpHost: string;
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private tableCallbacks: Map<string, Array<(rows: Record<string, unknown>[]) => void>> = new Map();

  constructor(config: StdbConfig) {
    this.config = config;
    this.httpHost = config.host
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');
  }

  /** Query a table via HTTP SQL endpoint */
  async queryTable(tableName: string): Promise<Record<string, unknown>[]> {
    const url = `${this.httpHost}/v1/database/${this.config.module}/sql`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `SELECT * FROM ${tableName}`,
    });
    if (!response.ok) {
      throw new Error(`SQL query failed: ${response.status}`);
    }
    const results = await response.json();
    if (!results?.[0]) return [];

    const { schema, rows } = results[0];
    const columns: string[] = schema.elements.map((el: { name: { some: string } }) => {
      // Convert snake_case column names to camelCase for JS
      const raw = el.name.some;
      return raw.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    });

    return (rows as unknown[][]).map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  /** Subscribe to a table with periodic HTTP polling */
  subscribeTable(tableName: string, callback: (rows: Record<string, unknown>[]) => void, intervalMs = 3000): () => void {
    if (!this.tableCallbacks.has(tableName)) {
      this.tableCallbacks.set(tableName, []);
    }
    this.tableCallbacks.get(tableName)!.push(callback);

    // Do an immediate fetch
    this.queryTable(tableName).then(callback).catch((err) => {
      console.error(`[StDB] Initial fetch of ${tableName} failed:`, err);
    });

    // Start polling if not already polling this table
    if (!this.pollTimers.has(tableName)) {
      const timer = setInterval(async () => {
        try {
          const rows = await this.queryTable(tableName);
          const cbs = this.tableCallbacks.get(tableName) ?? [];
          for (const cb of cbs) cb(rows);
        } catch (err) {
          console.error(`[StDB] Poll of ${tableName} failed:`, err);
        }
      }, intervalMs);
      this.pollTimers.set(tableName, timer);
    }

    // Return unsubscribe function
    return () => {
      const cbs = this.tableCallbacks.get(tableName);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) cbs.splice(idx, 1);
        if (cbs.length === 0) {
          const timer = this.pollTimers.get(tableName);
          if (timer) clearInterval(timer);
          this.pollTimers.delete(tableName);
          this.tableCallbacks.delete(tableName);
        }
      }
    };
  }

  /** Call a reducer via HTTP */
  async callReducer(name: string, args: Record<string, unknown>): Promise<void> {
    const snakeName = name.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    const url = `${this.httpHost}/v1/database/${this.config.module}/call/${snakeName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Reducer ${name} failed: ${response.status} ${text}`);
    }
  }

  /** Force refresh a table (call after a mutation for immediate UI update) */
  async refreshTable(tableName: string): Promise<void> {
    try {
      const rows = await this.queryTable(tableName);
      const cbs = this.tableCallbacks.get(tableName) ?? [];
      for (const cb of cbs) cb(rows);
    } catch (err) {
      console.error(`[StDB] Refresh of ${tableName} failed:`, err);
    }
  }

  disconnect(): void {
    for (const timer of this.pollTimers.values()) {
      clearInterval(timer);
    }
    this.pollTimers.clear();
    this.tableCallbacks.clear();
  }
}
