'use client';

import { useState, useEffect, useCallback } from 'react';
import { StdbConnection, type StdbConfig } from './stdb';
import type { Project, Task } from '@flowstudio/shared';

const STDB_CONFIG: StdbConfig = {
  host: process.env.NEXT_PUBLIC_STDB_HOST ?? 'ws://localhost:3000',
  module: process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio',
};

let globalConnection: StdbConnection | null = null;

export function getConnection(): StdbConnection {
  if (!globalConnection) {
    globalConnection = new StdbConnection(STDB_CONFIG);
  }
  return globalConnection;
}

/** Hook: subscribe to project list */
export function useProjects(): { projects: Project[]; loading: boolean; error: string | null } {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const conn = getConnection();
    const unsubscribe = conn.subscribeTable('projects', (rows) => {
      setProjects(rows as unknown as Project[]);
      setLoading(false);
      setError(null);
    });

    const timeout = setTimeout(() => {
      setLoading((current) => {
        if (current) setError('Connection timeout — could not reach server');
        return false;
      });
    }, 10000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return { projects, loading, error };
}

/** Hook: subscribe to tasks for a project */
export function useProjectTasks(projectId: string): { tasks: Task[]; loading: boolean; error: string | null } {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const conn = getConnection();
    const unsubscribe = conn.subscribeTable('tasks', (rows) => {
      const projectTasks = (rows as unknown as Task[]).filter(t => t.projectId === projectId);
      setTasks(projectTasks);
      setLoading(false);
      setError(null);
    });

    const timeout = setTimeout(() => {
      setLoading((current) => {
        if (current) setError('Connection timeout — could not reach server');
        return false;
      });
    }, 10000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [projectId]);

  return { tasks, loading, error };
}

/** Hook: call a reducer with automatic table refresh */
export function useReducer() {
  const callReducer = useCallback(async (name: string, args: Record<string, unknown>) => {
    const conn = getConnection();
    await conn.callReducer(name, args);
    // Refresh relevant tables after mutation for immediate UI update
    await conn.refreshTable('projects');
    await conn.refreshTable('tasks');
  }, []);

  return { callReducer };
}

/** Hook: connection status (always true with HTTP) */
export function useConnectionStatus(): boolean {
  return true;
}
