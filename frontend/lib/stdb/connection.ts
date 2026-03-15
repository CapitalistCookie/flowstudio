'use client';

/**
 * SpacetimeDB connection manager — HTTP bridge.
 *
 * CRITICAL: The STDB HTTP API expects reducer args as a JSON ARRAY of
 * positional values, NOT a JSON object. See ARCHITECTURE.md §0g.
 *
 * SDK migration path: when `spacetime generate` produces typed bindings,
 * replace the HTTP calls with DbConnection.builder().build() and wire
 * table callbacks (onInsert/onUpdate/onDelete) to Zustand stores.
 */

const REDUCER_PARAMS: Record<string, readonly string[]> = {
  createProject: ['name', 'ownerId', 'metadata'],
  createAsset: ['projectId', 'assetType', 'gcsPath', 'sizeBytes', 'mimeType', 'durationMs', 'metadata'],
  createTask: ['projectId', 'taskType', 'inputAssetIds', 'config', 'maxRetries'],
  claimTask: ['taskId', 'workerId'],
  findAndClaimTask: ['taskType', 'workerId'],
  completeTask: ['taskId', 'outputAssetIds'],
  failTask: ['taskId', 'failureReason'],
  writeSignal: ['projectId', 'taskId', 'signalType', 'timestampMs', 'durationMs', 'confidence', 'payload'],
  ingestInteractionBatch: ['projectId', 'taskId', 'signalType', 'batchJson'],
  updateProjectState: ['projectId', 'currentPhase', 'status'],
  updateWorkerConfig: ['workerId', 'workerType', 'isActive', 'concurrency', 'metadata'],
  toggleProjectStar: ['projectId'],
  createFolder: ['name', 'ownerId', 'color', 'sortOrder'],
  renameFolder: ['folderId', 'name'],
  deleteFolder: ['folderId'],
  moveProjectToFolder: ['projectId', 'folderId'],
  approveTimeline: ['projectId'],
};

const HOST = process.env.NEXT_PUBLIC_STDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio';

function getHttpHost(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/stdb`;
  }
  const base = HOST.replace('wss://', 'https://').replace('ws://', 'http://');
  return base;
}

const HTTP_HOST = getHttpHost();

let initialised = false;
let onConnectCb: (() => void) | null = null;
let onDisconnectCb: (() => void) | null = null;

export function isConnected(): boolean {
  return initialised;
}

export async function initConnection(
  onConnect?: () => void,
  onDisconnect?: () => void,
): Promise<void> {
  if (initialised) return;

  onConnectCb = onConnect ?? null;
  onDisconnectCb = onDisconnect ?? null;

  try {
    const url = `${HTTP_HOST}/v1/database/${DB_NAME}/sql`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'SELECT 1',
    });
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

export async function queryTable(tableName: string): Promise<Record<string, unknown>[]> {
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
  const columns: string[] = schema.elements.map(
    (el: { name: { some: string } }) => {
      const raw = el.name.some;
      return raw.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    },
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

export async function callReducer(
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  const snakeName = name
    .replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
    .replace(/^_/, '');
  const url = `${HTTP_HOST}/v1/database/${DB_NAME}/call/${snakeName}`;

  const params = REDUCER_PARAMS[name];
  let body: string;
  if (params) {
    body = JSON.stringify(params.map((p) => args[p]));
  } else {
    console.warn(`[STDB] Unknown reducer "${name}" — sending as object (may fail)`);
    body = JSON.stringify(args);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Reducer ${name} failed: ${response.status} ${text}`);
  }
}

export function disconnect(): void {
  if (initialised) {
    initialised = false;
    onDisconnectCb?.();
    onConnectCb = null;
    onDisconnectCb = null;
  }
}

export { HTTP_HOST, DB_NAME };
