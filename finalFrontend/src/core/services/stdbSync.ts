/**
 * SpacetimeDB → Store synchronization service.
 * Bridges the existing StdbConnection (lib/stdb.ts) to Zustand stores.
 * Framework-agnostic — works with vanilla stores.
 */

import type { StoreApi } from 'zustand';
import type { ProjectStore } from '../stores/projectStore';
import type { SignalStoreType } from '../stores/signalStore';
import type { ProjectMeta, FolderMeta, SignalEntry } from '../types';
import type { Asset, Task, ProjectState } from '@flowstudio/shared';

interface SyncConfig {
  projectStore: StoreApi<ProjectStore>;
  signalStore: StoreApi<SignalStoreType>;
  /** The StdbConnection instance from lib/stdb.ts */
  connection: {
    subscribeTable: (
      table: string,
      cb: (rows: Record<string, unknown>[]) => void,
      intervalMs?: number
    ) => () => void;
  };
  /** Polling interval in ms */
  pollInterval?: number;
}

const unsubscribers: Array<() => void> = [];

export function startSync(config: SyncConfig) {
  const { projectStore, signalStore, connection, pollInterval = 3000 } = config;

  // Sync projects
  unsubscribers.push(
    connection.subscribeTable(
      'projects',
      (rows) => {
        const projects: ProjectMeta[] = rows.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          status: r.status as ProjectMeta['status'],
          createdAt: r.createdAt as number,
          updatedAt: r.updatedAt as number,
          ownerId: r.ownerId as string,
          starred: (r.starred as boolean) ?? false,
          folderId: (r.folderId as string) ?? '',
        }));
        projectStore.getState().setProjects(projects);
        projectStore.getState().setLoading(false);
      },
      pollInterval
    )
  );

  // Sync folders
  unsubscribers.push(
    connection.subscribeTable(
      'folders',
      (rows) => {
        const folders: FolderMeta[] = rows.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          ownerId: r.ownerId as string,
          color: r.color as string,
          sortOrder: r.sortOrder as number,
          createdAt: r.createdAt as number,
          updatedAt: r.updatedAt as number,
        }));
        projectStore.getState().setFolders(folders);
      },
      pollInterval
    )
  );

  // Sync assets (filtered by active project in the store)
  unsubscribers.push(
    connection.subscribeTable(
      'assets',
      (rows) => {
        const activeId = projectStore.getState().activeProjectId;
        if (!activeId) return;
        const assets = (rows as unknown as Asset[]).filter(
          (a) => a.projectId === activeId
        );
        projectStore.getState().setAssets(assets);
      },
      pollInterval
    )
  );

  // Sync tasks
  unsubscribers.push(
    connection.subscribeTable(
      'tasks',
      (rows) => {
        const activeId = projectStore.getState().activeProjectId;
        if (!activeId) return;
        const tasks = (rows as unknown as Task[]).filter(
          (t) => t.projectId === activeId
        );
        projectStore.getState().setTasks(tasks);
      },
      pollInterval
    )
  );

  // Sync project_state
  unsubscribers.push(
    connection.subscribeTable(
      'project_state',
      (rows) => {
        const activeId = projectStore.getState().activeProjectId;
        if (!activeId) return;
        const state = (rows as unknown as ProjectState[]).find(
          (s) => s.projectId === activeId
        );
        projectStore.getState().setProjectState(state ?? null);
      },
      pollInterval
    )
  );

  // Sync signals
  unsubscribers.push(
    connection.subscribeTable(
      'signals',
      (rows) => {
        const activeId = projectStore.getState().activeProjectId;
        if (!activeId) return;
        const signals: SignalEntry[] = (rows as unknown as SignalEntry[])
          .filter((s) => s.projectId === activeId);
        signalStore.getState().setSignals(signals);
      },
      pollInterval
    )
  );
}

export function stopSync() {
  for (const unsub of unsubscribers) unsub();
  unsubscribers.length = 0;
}
