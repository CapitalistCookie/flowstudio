/**
 * SpacetimeDB SDK -> Store synchronization.
 *
 * Uses HTTP SQL polling until generated bindings enable push subscriptions.
 * Architecture is ready for SDK push — just swap poll loops with
 * onInsert/onUpdate/onDelete callbacks from the SDK connection.
 *
 * NOTE: `project_state` and `worker_configs` tables are private (Phase 2)
 * and are NOT queried here.  projectState in the store is set to null.
 */

import type { StoreApi } from 'zustand';
import type { ProjectStore } from '../stores/projectStore';
import type { SignalStoreType } from '../stores/signalStore';
import type { ProjectMeta, FolderMeta, SignalEntry } from '../types';
import type { Asset, Task } from '@flowstudio/shared';
import { queryTable } from '../../lib/stdbConnection';

interface SyncConfig {
  projectStore: StoreApi<ProjectStore>;
  signalStore: StoreApi<SignalStoreType>;
  pollInterval?: number;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let syncFn: (() => Promise<void>) | null = null;

export function startSdkSync(config: SyncConfig) {
  const { projectStore, signalStore, pollInterval = 3000 } = config;

  const sync = async () => {
    try {
      // ── Sync projects ──────────────────────────────────────────────
      const projectRows = await queryTable('projects');
      const projects: ProjectMeta[] = projectRows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        status: r.status as ProjectMeta['status'],
        createdAt: Number(r.createdAt),
        updatedAt: Number(r.updatedAt),
        ownerId: r.ownerId as string,
        starred: (r.starred as boolean) ?? false,
        folderId: (r.folderId as string) ?? '',
      }));
      projectStore.getState().setProjects(projects);
      projectStore.getState().setLoading(false);

      // ── Sync folders ───────────────────────────────────────────────
      const folderRows = await queryTable('folders');
      const folders: FolderMeta[] = folderRows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        ownerId: r.ownerId as string,
        color: r.color as string,
        sortOrder: Number(r.sortOrder),
        createdAt: Number(r.createdAt),
        updatedAt: Number(r.updatedAt),
      }));
      projectStore.getState().setFolders(folders);

      // ── Scope-filtered queries (active project) ────────────────────
      const activeId = projectStore.getState().activeProjectId;

      if (activeId) {
        // Sync assets
        const assetRows = await queryTable('assets');
        const assets = (assetRows as unknown as Asset[]).filter(
          (a) => a.projectId === activeId,
        );
        projectStore.getState().setAssets(assets);

        // Sync tasks
        const taskRows = await queryTable('tasks');
        const tasks = (taskRows as unknown as Task[]).filter(
          (t) => t.projectId === activeId,
        );
        projectStore.getState().setTasks(tasks);

        // Sync signals
        const signalRows = await queryTable('signals');
        const signals = (signalRows as unknown as SignalEntry[]).filter(
          (s) => s.projectId === activeId,
        );
        signalStore.getState().setSignals(signals);
      }

      // project_state is PRIVATE (Phase 2) — set to null
      projectStore.getState().setProjectState(null);
    } catch (err) {
      console.error('[SdkSync] Poll failed:', err);
    }
  };

  // Store sync function for external calls
  syncFn = sync;

  // Initial sync
  sync();

  // Periodic poll
  pollTimer = setInterval(sync, pollInterval);
}

/** Force an immediate sync (called after mutations for UI responsiveness) */
export async function forceSync() {
  if (syncFn) await syncFn();
}

export function stopSdkSync() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
