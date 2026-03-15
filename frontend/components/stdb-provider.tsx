'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { initConnection, isConnected, disconnect } from '@/lib/stdb/connection';

type StdbStatus = 'connecting' | 'connected' | 'error' | 'disabled';

const StdbContext = createContext<{ status: StdbStatus }>({ status: 'connecting' });

export function useStdbStatus() {
  return useContext(StdbContext).status;
}

export function StdbProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StdbStatus>('connecting');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = async () => {
      if (!mounted) return;
      setStatus('connecting');

      try {
        await initConnection(
          () => { if (mounted) setStatus('connected'); },
          () => { if (mounted) setStatus('error'); },
        );
      } catch {
        if (mounted) {
          setStatus('error');
          retryTimer = setTimeout(() => {
            if (mounted) setRetryCount((c) => c + 1);
          }, 5000);
        }
      }
    };

    connect();

    return () => {
      mounted = false;
      clearTimeout(retryTimer);
      disconnect();
    };
  }, [retryCount]);

  return (
    <StdbContext.Provider value={{ status }}>
      {children}
      {status === 'error' && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-amber-500/50 bg-amber-950/90 px-4 py-2 text-sm text-amber-200 shadow-lg backdrop-blur-sm">
          <span className="mr-2">⚠</span>
          SpacetimeDB unavailable — retrying...
        </div>
      )}
    </StdbContext.Provider>
  );
}
