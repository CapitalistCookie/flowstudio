'use client';

/**
 * SpacetimeDB native SDK connection singleton for the production frontend.
 *
 * Replaces the HTTP bridge (connection.ts) with WebSocket push via the SDK.
 * Provides getConnection(), typed reducer calls, and store sync helpers.
 *
 * Firebase ID token is passed to STDB for authenticated connections.
 * Token refresh is handled via onIdTokenChanged listener.
 */

import { DbConnection, type SubscriptionEventContext, type ErrorContext } from './module_bindings';
import type { ProjectStatus } from '@flowstudio/shared';

// ─── Connection singleton ────────────────────────────────────────────

const HOST = process.env.NEXT_PUBLIC_STDB_HOST ?? 'ws://localhost:3000';
const MODULE = process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio';

let connection: DbConnection | null = null;
let subscriptionActive = false;
let currentUid: string | null = null;

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

export interface StdbFolder {
  id: string;
  name: string;
  ownerId: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
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
type OnFoldersChanged = (folders: StdbFolder[]) => void;

let onConnectCb: OnConnectCallback | null = null;
let onDisconnectCb: OnDisconnectCallback | null = null;
let onProjectsChangedCb: OnProjectsChanged | null = null;
let onFoldersChangedCb: OnFoldersChanged | null = null;

export function setOnProjectsChanged(cb: OnProjectsChanged | null) {
  onProjectsChangedCb = cb;
}

export function setOnFoldersChanged(cb: OnFoldersChanged | null) {
  onFoldersChangedCb = cb;
}

function notifyProjectsChanged() {
  if (!onProjectsChangedCb || !connection) return;
  const projects: StdbProject[] = [];
  for (const row of connection.db.projects.iter()) {
    projects.push(projectRowToStore(row));
  }
  onProjectsChangedCb(projects);
}

function notifyFoldersChanged() {
  if (!onFoldersChangedCb || !connection) return;
  const folders: StdbFolder[] = [];
  for (const row of connection.db.folders.iter()) {
    folders.push(folderRowToStore(row));
  }
  onFoldersChangedCb(folders);
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

function folderRowToStore(row: any): StdbFolder {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    color: row.color,
    sortOrder: toNum(row.sortOrder),
    createdAt: toNum(row.createdAt),
    updatedAt: toNum(row.updatedAt),
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

// ─── Token refresh ───────────────────────────────────────────────────

let tokenRefreshCleanup: (() => void) | null = null;

/**
 * Set up a Firebase token refresh listener.
 * When the token changes (e.g., near expiry), reconnect to STDB with the new token.
 */
function setupTokenRefresh() {
  if (tokenRefreshCleanup) return;

  try {
    // Dynamic import to keep this module importable in non-Firebase contexts
    const { getFirebaseAuth } = require('@/lib/auth/firebase-config');
    const { onIdTokenChanged } = require('firebase/auth');
    const auth = getFirebaseAuth();

    let initialFire = true;
    const unsubscribe = onIdTokenChanged(auth, async (user: any) => {
      // Skip the initial fire — we already connected with the token
      if (initialFire) {
        initialFire = false;
        return;
      }

      if (user && connection) {
        console.log('[STDB] Firebase token refreshed, reconnecting...');
        const newToken = await user.getIdToken();
        // Reconnect with new token
        disconnectSpacetimeDb();
        await initSpacetimeDb(onConnectCb ?? undefined, onDisconnectCb ?? undefined, newToken, currentUid ?? undefined);
      }
    });

    tokenRefreshCleanup = unsubscribe;
  } catch {
    // Firebase not available — skip token refresh (e.g., during SSR or tests)
  }
}

// ─── Init ────────────────────────────────────────────────────────────

/**
 * Initialize the SpacetimeDB WebSocket connection.
 * Subscribes to all public tables and wires reactive callbacks.
 *
 * @param onConnect - called when subscription is applied
 * @param onDisconnect - called on disconnect
 * @param firebaseToken - optional Firebase ID token for authenticated connection
 * @param firebaseUid - optional Firebase UID for subscription filtering and identity registration
 */
export function initSpacetimeDb(
  onConnect?: OnConnectCallback,
  onDisconnect?: OnDisconnectCallback,
  firebaseToken?: string,
  firebaseUid?: string,
): Promise<void> {
  if (connection && subscriptionActive) {
    onConnect?.();
    return Promise.resolve();
  }

  // Validate and store UID for subscription filtering
  if (firebaseUid && !/^[a-zA-Z0-9._-]+$/.test(firebaseUid)) {
    throw new Error('Invalid firebaseUid format');
  }
  currentUid = firebaseUid ?? null;

  onConnectCb = onConnect ?? null;
  onDisconnectCb = onDisconnect ?? null;

  return new Promise<void>((resolve, reject) => {
    const builder = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(MODULE);

    // Use Firebase token if provided, otherwise no token (anonymous)
    if (firebaseToken) {
      builder.withToken(firebaseToken);
    }

    connection = builder
      .onConnect((conn: DbConnection, identity: any, token: string) => {
        console.log('[STDB] Connected, identity:', identity.toHexString());

        // Subscribe to all 5 public tables
        conn.subscriptionBuilder()
          .onApplied(async (_ctx: SubscriptionEventContext) => {
            console.log('[STDB] Subscription applied — initial data loaded');
            subscriptionActive = true;
            wireTableCallbacks(conn);
            if (currentUid) {
              try {
                await conn.reducers.registerIdentity({ firebaseUid: currentUid });
              } catch (err) {
                console.error('[STDB] Failed to register identity:', err);
              }
            }
            onConnectCb?.();
            resolve();
          })
          .onError((ctx: any) => {
            console.error('[STDB] Subscription error:', ctx);
          })
          .subscribe([
            currentUid
              ? `SELECT * FROM projects WHERE ownerId = '${currentUid}'`
              : 'SELECT * FROM projects WHERE 1=0',
            currentUid
              ? `SELECT * FROM folders WHERE ownerId = '${currentUid}'`
              : 'SELECT * FROM folders WHERE 1=0',
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

    // Set up token refresh after successful build
    setupTokenRefresh();
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

  conn.db.folders.onInsert(() => notifyFoldersChanged());
  conn.db.folders.onUpdate(() => notifyFoldersChanged());
  conn.db.folders.onDelete(() => notifyFoldersChanged());
}

/** Disconnect and clean up. */
export function disconnectSpacetimeDb() {
  if (tokenRefreshCleanup) {
    tokenRefreshCleanup();
    tokenRefreshCleanup = null;
  }
  if (connection) {
    connection.disconnect();
    connection = null;
    subscriptionActive = false;
    currentUid = null;
    onConnectCb = null;
    onDisconnectCb = null;
    onProjectsChangedCb = null;
    onFoldersChangedCb = null;
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

/** Get all folders from the SDK cache. */
export function getFolders(): StdbFolder[] {
  if (!connection || !subscriptionActive) return [];
  const folders: StdbFolder[] = [];
  for (const row of connection.db.folders.iter()) {
    folders.push(folderRowToStore(row));
  }
  return folders;
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
