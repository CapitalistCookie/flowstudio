'use client';

/**
 * SpacetimeDB connection manager.
 *
 * Architecture is SDK-shaped: once `spacetime generate` produces typed bindings,
 * swap the HTTP calls here for DbConnection.builder().build() and wire table
 * callbacks (onInsert/onUpdate/onDelete) to the Zustand stores.
 *
 * Until then, reducer calls go through the HTTP /call/ endpoint and table reads
 * go through the HTTP /sql endpoint (used by stdbSdkSync.ts).
 */

const HOST = process.env.NEXT_PUBLIC_STDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio';
const HTTP_HOST = HOST.replace('wss://', 'https://').replace('ws://', 'http://');

/** Whether the connection layer has been initialised */
let initialised = false;
/** Stored callbacks for lifecycle events */
let onConnectCb: (() => void) | null = null;
let onDisconnectCb: (() => void) | null = null;

// ─── Public API ──────────────────────────────────────────────────────

/** Returns true once initConnection() has been called successfully. */
export function isConnected(): boolean {
  return initialised;
}

/**
 * Initialise the connection.
 *
 * With the HTTP-only bridge this is a lightweight probe — we issue a trivial
 * SQL query to confirm the module is reachable, then flag the connection as
 * active.  When SDK bindings become available this will become a real
 * DbConnection.builder().build() call with WebSocket push.
 */
export async function initConnection(
  onConnect?: () => void,
  onDisconnect?: () => void,
): Promise<void> {
  if (initialised) return;

  onConnectCb = onConnect ?? null;
  onDisconnectCb = onDisconnect ?? null;

  try {
    // Probe: verify the module is reachable
    const url = `${HTTP_HOST}/v1/database/${DB_NAME}/sql`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'SELECT 1',
    });
    // Accept any response — even a 400 means the server is reachable
    // (STDB may reject `SELECT 1` if no table exists, but we just need connectivity)
    if (res.ok || res.status < 500) {
      initialised = true;
      onConnectCb?.();
    } else {
      throw new Error(`STDB probe failed: ${res.status}`);
    }
  } catch (err) {
    console.error('[STDB] Connection probe failed:', err);
    throw err;
  }
}

/**
 * Query a table via the HTTP SQL endpoint.
 *
 * Returns rows with column names converted from snake_case to camelCase.
 * BigInt values (u64) are converted to Number for store compatibility.
 */
export async function queryTable(tableName: string): Promise<Record<string, unknown>[]> {
  // Validate table name to prevent SQL injection
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  const url = `${HTTP_HOST}/v1/database/${DB_NAME}/sql`;
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
    const raw = el.name.some;
    return raw.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
  });

  return (rows as unknown[][]).map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      // Convert BigInt values to Number (STDB u64 fields)
      const val = row[i];
      obj[col] = typeof val === 'bigint' ? Number(val) : val;
    });
    return obj;
  });
}

/**
 * Call a reducer via the HTTP /call/ endpoint.
 *
 * When SDK bindings are available, this will become
 * `connection.reducers.someReducer(...)`.
 */
export async function callReducer(name: string, args: Record<string, unknown>): Promise<void> {
  const snakeName = name.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
  const url = `${HTTP_HOST}/v1/database/${DB_NAME}/call/${snakeName}`;

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

/** Tear down the connection. */
export function disconnect(): void {
  if (initialised) {
    initialised = false;
    onDisconnectCb?.();
    onConnectCb = null;
    onDisconnectCb = null;
  }
}

// ─── Convenience re-exports for migration ────────────────────────────

export { HTTP_HOST, DB_NAME };
