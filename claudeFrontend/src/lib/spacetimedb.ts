'use client';

/**
 * SpacetimeDB native SDK connection singleton.
 *
 * Replaces the HTTP bridge (stdbConnection.ts) with WebSocket push via the SDK.
 * Provides getConnection(), typed reducer calls, and store sync helpers.
 */

import { DbConnection, type SubscriptionEventContext, type ErrorContext } from '../module_bindings';
import type { StoreApi } from 'zustand';
import type { ProjectStore } from '../core/stores/projectStore';
import type { SignalStoreType } from '../core/stores/signalStore';
import type { ProjectMeta, FolderMeta, SignalEntry } from '../core/types';
import type { Asset, Task } from '@flowstudio/shared';

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
  return connection?.isActive ?? false;
}

// ─── BigInt → Number helpers ─────────────────────────────────────────

function toNum(v: bigint | number): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

// ─── Store sync ──────────────────────────────────────────────────────

interface SyncConfig {
  projectStore: StoreApi<ProjectStore>;
  signalStore: StoreApi<SignalStoreType>;
}

let activeProjectId: string | null = null;

export function setActiveProjectForSync(id: string | null) {
  activeProjectId = id;
}

/**
 * Initialize the SpacetimeDB connection and wire table callbacks to stores.
 * Replaces initConnection() + startSdkSync().
 */
export function initSpacetimeDb(config: SyncConfig): Promise<void> {
  const { projectStore, signalStore } = config;

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
          .onApplied((ctx: SubscriptionEventContext) => {
            console.log('[STDB] Subscription applied — initial data loaded');
            subscriptionActive = true;

            // Hydrate stores from initial subscription data
            hydrateStores(conn, projectStore, signalStore);
            projectStore.getState().setLoading(false);
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

        // Wire table callbacks for real-time updates
        wireTableCallbacks(conn, projectStore, signalStore);
      })
      .onConnectError((_ctx: ErrorContext, err: Error) => {
        console.error('[STDB] Connection error:', err);
        reject(err);
      })
      .onDisconnect((_ctx: ErrorContext, err?: Error) => {
        console.log('[STDB] Disconnected', err?.message ?? '');
        subscriptionActive = false;
      })
      .build();
  });
}

/**
 * Hydrate stores from the SDK's in-memory cache after subscription applies.
 */
function hydrateStores(
  conn: DbConnection,
  projectStore: StoreApi<ProjectStore>,
  signalStore: StoreApi<SignalStoreType>,
) {
  // Projects
  const projects: ProjectMeta[] = [];
  for (const row of conn.db.projects.iter()) {
    projects.push(projectRowToMeta(row));
  }
  projectStore.getState().setProjects(projects);

  // Folders
  const folders: FolderMeta[] = [];
  for (const row of conn.db.folders.iter()) {
    folders.push(folderRowToMeta(row));
  }
  projectStore.getState().setFolders(folders);

  // Scope-filtered: assets, tasks, signals
  syncScopedData(conn, projectStore, signalStore);

  // project_state is PRIVATE (Phase 2) — set to null
  projectStore.getState().setProjectState(null);
}

/**
 * Sync assets, tasks, and signals for the active project only.
 */
function syncScopedData(
  conn: DbConnection,
  projectStore: StoreApi<ProjectStore>,
  signalStore: StoreApi<SignalStoreType>,
) {
  const pid = activeProjectId ?? projectStore.getState().activeProjectId;
  if (!pid) return;

  const assets: Asset[] = [];
  for (const row of conn.db.assets.iter()) {
    if (row.projectId === pid) {
      assets.push(assetRowToStore(row));
    }
  }
  projectStore.getState().setAssets(assets);

  const tasks: Task[] = [];
  for (const row of conn.db.tasks.iter()) {
    if (row.projectId === pid) {
      tasks.push(taskRowToStore(row));
    }
  }
  projectStore.getState().setTasks(tasks);

  const signals: SignalEntry[] = [];
  for (const row of conn.db.signals.iter()) {
    if (row.projectId === pid) {
      signals.push(signalRowToStore(row));
    }
  }
  signalStore.getState().setSignals(signals);
}

/**
 * Wire onInsert/onUpdate/onDelete callbacks on all 5 public tables
 * so stores update in real-time via WebSocket push.
 */
function wireTableCallbacks(
  conn: DbConnection,
  projectStore: StoreApi<ProjectStore>,
  signalStore: StoreApi<SignalStoreType>,
) {
  // ── Projects ─────────────────────────────────────────────────────
  conn.db.projects.onInsert((_ctx, row) => {
    const meta = projectRowToMeta(row);
    const current = projectStore.getState().projects;
    if (!current.find(p => p.id === meta.id)) {
      projectStore.getState().setProjects([...current, meta]);
    }
  });

  conn.db.projects.onUpdate((_ctx, _oldRow, newRow) => {
    const meta = projectRowToMeta(newRow);
    projectStore.getState().updateProject(meta.id, meta);
  });

  conn.db.projects.onDelete((_ctx, row) => {
    projectStore.getState().removeProject(row.id);
  });

  // ── Folders ──────────────────────────────────────────────────────
  conn.db.folders.onInsert((_ctx, row) => {
    const meta = folderRowToMeta(row);
    projectStore.getState().addFolder(meta);
  });

  conn.db.folders.onUpdate((_ctx, _oldRow, newRow) => {
    const meta = folderRowToMeta(newRow);
    const folders = projectStore.getState().folders.map(f =>
      f.id === meta.id ? meta : f
    );
    projectStore.getState().setFolders(folders);
  });

  conn.db.folders.onDelete((_ctx, row) => {
    projectStore.getState().removeFolder(row.id);
  });

  // ── Assets (scoped to active project) ────────────────────────────
  conn.db.assets.onInsert((_ctx, row) => {
    const pid = activeProjectId ?? projectStore.getState().activeProjectId;
    if (row.projectId !== pid) return;
    const asset = assetRowToStore(row);
    const current = projectStore.getState().assets;
    if (!current.find(a => a.id === asset.id)) {
      projectStore.getState().setAssets([...current, asset]);
    }
  });

  conn.db.assets.onUpdate((_ctx, _oldRow, newRow) => {
    const pid = activeProjectId ?? projectStore.getState().activeProjectId;
    if (newRow.projectId !== pid) return;
    const asset = assetRowToStore(newRow);
    const assets = projectStore.getState().assets.map(a =>
      a.id === asset.id ? asset : a
    );
    projectStore.getState().setAssets(assets);
  });

  conn.db.assets.onDelete((_ctx, row) => {
    const assets = projectStore.getState().assets.filter(a => a.id !== row.id);
    projectStore.getState().setAssets(assets);
  });

  // ── Tasks (scoped to active project) ─────────────────────────────
  conn.db.tasks.onInsert((_ctx, row) => {
    const pid = activeProjectId ?? projectStore.getState().activeProjectId;
    if (row.projectId !== pid) return;
    const task = taskRowToStore(row);
    const current = projectStore.getState().tasks;
    if (!current.find(t => t.id === task.id)) {
      projectStore.getState().setTasks([...current, task]);
    }
  });

  conn.db.tasks.onUpdate((_ctx, _oldRow, newRow) => {
    const pid = activeProjectId ?? projectStore.getState().activeProjectId;
    if (newRow.projectId !== pid) return;
    const task = taskRowToStore(newRow);
    const tasks = projectStore.getState().tasks.map(t =>
      t.id === task.id ? task : t
    );
    projectStore.getState().setTasks(tasks);
  });

  conn.db.tasks.onDelete((_ctx, row) => {
    const tasks = projectStore.getState().tasks.filter(t => t.id !== row.id);
    projectStore.getState().setTasks(tasks);
  });

  // ── Signals (scoped to active project) ───────────────────────────
  conn.db.signals.onInsert((_ctx, row) => {
    const pid = activeProjectId ?? projectStore.getState().activeProjectId;
    if (row.projectId !== pid) return;
    const signal = signalRowToStore(row);
    signalStore.getState().addSignal(signal);
  });

  conn.db.signals.onDelete((_ctx, row) => {
    const signals = signalStore.getState().signals.filter(s => s.id !== row.id);
    signalStore.getState().setSignals(signals);
  });
}

/**
 * Re-sync scoped data when the active project changes.
 * Called from project/[id]/page.tsx on mount.
 */
export function syncStoresForProject(
  projectStore: StoreApi<ProjectStore>,
  signalStore: StoreApi<SignalStoreType>,
) {
  if (!connection || !subscriptionActive) return;
  syncScopedData(connection, projectStore, signalStore);
}

/** Disconnect and clean up. */
export function disconnectSpacetimeDb() {
  if (connection) {
    connection.disconnect();
    connection = null;
    subscriptionActive = false;
  }
}

// ─── Row → Store type converters ─────────────────────────────────────

function projectRowToMeta(row: any): ProjectMeta {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ProjectMeta['status'],
    createdAt: toNum(row.createdAt),
    updatedAt: toNum(row.updatedAt),
    ownerId: row.ownerId,
    starred: row.starred ?? false,
    folderId: row.folderId ?? '',
  };
}

function folderRowToMeta(row: any): FolderMeta {
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

function assetRowToStore(row: any): Asset {
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

function taskRowToStore(row: any): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    taskType: row.taskType,
    status: row.status,
    workerId: row.workerId,
    inputAssetIds: row.inputAssetIds,
    outputAssetIds: row.outputAssetIds,
    config: row.config,
    createdAt: toNum(row.createdAt),
    claimedAt: toNum(row.claimedAt),
    completedAt: toNum(row.completedAt),
    failureReason: row.failureReason,
    retryCount: toNum(row.retryCount),
    maxRetries: toNum(row.maxRetries),
  };
}

function signalRowToStore(row: any): SignalEntry {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(row.payload); } catch { /* leave empty */ }
  return {
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId,
    signalType: row.signalType,
    timestampMs: toNum(row.timestampMs),
    durationMs: toNum(row.durationMs),
    confidence: toNum(row.confidence),
    payload,
    createdAt: toNum(row.createdAt),
  };
}
