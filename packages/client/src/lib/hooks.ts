'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { StdbConnection, type StdbConfig } from './stdb.js';
import type { Project, Task } from '@flowstudio/shared';

const STDB_CONFIG: StdbConfig = {
  host: process.env.NEXT_PUBLIC_STDB_HOST ?? 'ws://localhost:3000',
  module: process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio',
};

let globalConnection: StdbConnection | null = null;

function getConnection(): StdbConnection {
  if (!globalConnection) {
    globalConnection = new StdbConnection(STDB_CONFIG);
    globalConnection.connect();
  }
  return globalConnection;
}

/** Hook: subscribe to project list */
export function useProjects(): { projects: Project[]; loading: boolean } {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const conn = getConnection();
    const unsubscribe = conn.onTableUpdate((tableName, rows) => {
      if (tableName === 'projects') {
        setProjects(rows as Project[]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  return { projects, loading };
}

/** Hook: subscribe to tasks for a project */
export function useProjectTasks(projectId: string): { tasks: Task[]; loading: boolean } {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const conn = getConnection();
    const unsubscribe = conn.onTableUpdate((tableName, rows) => {
      if (tableName === 'tasks') {
        const projectTasks = (rows as Task[]).filter(t => t.projectId === projectId);
        setTasks(projectTasks);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [projectId]);

  return { tasks, loading };
}

/** Hook: call a reducer */
export function useReducer() {
  const callReducer = useCallback(async (name: string, args: Record<string, unknown>) => {
    const conn = getConnection();
    await conn.callReducer(name, args);
  }, []);

  return { callReducer };
}

/** Hook: connection status */
export function useConnectionStatus(): boolean {
  const [connected, setConnected] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const conn = getConnection();
    intervalRef.current = setInterval(() => {
      setConnected(conn.isConnected);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return connected;
}
