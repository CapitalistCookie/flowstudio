'use client';

/**
 * SpacetimeDB React hooks.
 *
 * Provides `useStdbReducer()` for calling reducers and
 * `useConnectionStatus()` for checking connectivity.
 *
 * These replace the hooks previously exported from `lib/hooks.ts`.
 * When generated SDK bindings are available, the reducer hook can be
 * replaced with the SDK's typed `useReducer` / `connection.reducers.*`.
 */

import { useState, useEffect, useCallback } from 'react';
import { callReducer, isConnected } from './stdbConnection';

/** Hook: call a SpacetimeDB reducer by name. */
export function useStdbReducer() {
  const call = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      await callReducer(name, args);
    },
    [],
  );

  return { callReducer: call };
}

/** Hook: connection status (polls every 1 s). */
export function useConnectionStatus(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = () => setConnected(isConnected());
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  return connected;
}
