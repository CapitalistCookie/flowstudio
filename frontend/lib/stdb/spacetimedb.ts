'use client';

/**
 * SpacetimeDB native SDK connection singleton for the production frontend.
 *
 * Replaces the HTTP bridge (connection.ts) with WebSocket push via the SDK.
 * Provides getConnection(), typed reducer calls, and store sync helpers.
 *
 * Reference: claudeFrontend/src/lib/spacetimedb.ts
 */

import { DbConnection, type SubscriptionEventContext, type ErrorContext } from './module_bindings';
import type { ProjectStatus } from '@flowstudio/shared';

// ─── Connection singleton ────────────────────────────────────────────

const HOST = process.env.NEXT_PUBLIC_STDB_HOST ?? 'ws://localhost:3000';
const MODULE = process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio';
const TOKEN_KEY = 'stdb_auth_token';

let connection: DbConnection | null = null;
let subscriptionActive = false;

export function getConnection(): DbConnection {
  if (!connection) throw new Error('SpacetimeDB not connected. Call initSpacetimeDb() first.');
  return connection;
}

export function isConnected(): boolean {
  return connection !== null && subscriptionActive;
}

// ─── BigInt → Number helpers ─────────────────────────────────────────

function toNum(v: bigint | number): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

// ─── Store sync types ────────────────────────────────────────────────

export interface StdbProject {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
  metadata: string;
  starred: boolean;
  folderId: string;
}

export interface StdbAsset {
  id: string;
  projectId: string;
  assetType: string;
  gcsPath: string;
  sizeBytes: number;
  mimeType: string;
  durationMs: number;
  createdAt: number;
  metadata: string;
}

// ─── Callbacks ───────────────────────────────────────────────────────

type OnConnectCallback = () => void;
type OnDisconnectCallback = () => void;
type OnProjectsChanged = (projects: StdbProject[]) => void;

let onConnectCb: OnConnectCallback | null = null;
let onDisconnectCb: OnDisconnectCallback | null = null;
let onProjectsChangedCb: OnProjectsChanged | null = null;

export function setOnProjectsChanged(cb: OnProjectsChanged | null) {
  onProjectsChangedCb = cb;
}

function notifyProjectsChanged() {
  if (!onProjectsChangedCb || !connection) return;
  const projects: StdbProject[] = [];
  for (const row of connection.db.projects.iter()) {
    projects.push(projectRowToStore(row));
  }
  onProjectsChangedCb(projects);
}

// ─── Row converters ──────────────────────────────────────────────────

function projectRowToStore(row: any): StdbProject {
  return {
    id: row.id,
    name: row.name,
    status: row.status as string,
    createdAt: toNum(row.createdAt),
    updatedAt: toNum(row.updatedAt),
    ownerId: row.ownerId,
    metadata: row.metadata,
    starred: row.starred ?? false,
    folderId: row.folderId ?? '',
  };
}

function assetRowToStore(row: any): StdbAsset {
  return {
    id: row.id,
    projectId: row.projectId,
    assetType: row.assetType,
    gcsPath: row.gcsPath,
    sizeBytes: toNum(row.sizeBytes),
    mimeType: row.mimeType,
    durationMs: toNum(row.durationMs),
    createdAt: toNum(row.createdAt),
    metadata: row.metadata,
  };
}

// ─── Init ────────────────────────────────────────────────────────────

/**
 * Initialize the SpacetimeDB WebSocket connection.
 * Subscribes to all public tables and wires reactive callbacks.
 */
export function initSpacetimeDb(
  onConnect?: OnConnectCallback,
  onDisconnect?: OnDisconnectCallback,
): Promise<void> {
  if (connection && subscriptionActive) {
    onConnect?.();
    return Promise.resolve();
  }

  onConnectCb = onConnect ?? null;
  onDisconnectCb = onDisconnect ?? null;

  return new Promise<void>((resolve, reject) => {
    const savedToken = typeof localStorage !== 'undefined'
      ? localStorage.getItem(TOKEN_KEY) ?? undefined
      : undefined;

    connection = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(MODULE)
      .withToken(savedToken)
      .onConnect((conn: DbConnection, identity: any, token: string) => {
        console.log('[STDB] Connected, identity:', identity.toHexString());
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(TOKEN_KEY, token);
        }

        // Subscribe to all 5 public tables
        conn.subscriptionBuilder()
          .onApplied((_ctx: SubscriptionEventContext) => {
            console.log('[STDB] Subscription applied — initial data loaded');
            subscriptionActive = true;
            wireTableCallbacks(conn);
            onConnectCb?.();
            resolve();
          })
          .onError((ctx: any) => {
            console.error('[STDB] Subscription error:', ctx);
          })
          .subscribe([
            'SELECT * FROM projects',
            'SELECT * FROM folders',
            'SELECT * FROM assets',
            'SELECT * FROM tasks',
            'SELECT * FROM signals',
          ]);
      })
      .onConnectError((_ctx: ErrorContext, err: Error) => {
        console.error('[STDB] Connection error:', err);
        reject(err);
      })
      .onDisconnect((_ctx: ErrorContext, err?: Error) => {
        console.log('[STDB] Disconnected', err?.message ?? '');
        subscriptionActive = false;
        onDisconnectCb?.();
      })
      .build();
  });
}

/**
 * Wire onInsert/onUpdate/onDelete callbacks on tables
 * to notify the project store of changes.
 */
function wireTableCallbacks(conn: DbConnection) {
  conn.db.projects.onInsert(() => notifyProjectsChanged());
  conn.db.projects.onUpdate(() => notifyProjectsChanged());
  conn.db.projects.onDelete(() => notifyProjectsChanged());
}

/** Disconnect and clean up. */
export function disconnectSpacetimeDb() {
  if (connection) {
    connection.disconnect();
    connection = null;
    subscriptionActive = false;
    onConnectCb = null;
    onDisconnectCb = null;
  }
}

// ─── Query helpers ───────────────────────────────────────────────────

/** Get all projects from the SDK cache. */
export function getProjects(): StdbProject[] {
  if (!connection || !subscriptionActive) return [];
  const projects: StdbProject[] = [];
  for (const row of connection.db.projects.iter()) {
    projects.push(projectRowToStore(row));
  }
  return projects;
}

/** Get all assets for a project from the SDK cache. */
export function getProjectAssets(projectId: string): StdbAsset[] {
  if (!connection || !subscriptionActive) return [];
  const assets: StdbAsset[] = [];
  for (const row of connection.db.assets.iter()) {
    if (row.projectId === projectId) {
      assets.push(assetRowToStore(row));
    }
  }
  return assets;
}
