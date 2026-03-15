'use client';

import { useState, useEffect, useCallback } from 'react';
import { callReducer, isConnected } from './connection';

/**
 * Hook for calling a SpacetimeDB reducer.
 * Returns a stable callable that auto-updates connection status.
 */
export function useStdbReducer() {
  const call = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      await callReducer(name, args);
    },
    [],
  );
  return call;
}

/**
 * Hook that polls SpacetimeDB connection status every second.
 */
export function useConnectionStatus(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = () => setConnected(isConnected());
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);

  return connected;
}
