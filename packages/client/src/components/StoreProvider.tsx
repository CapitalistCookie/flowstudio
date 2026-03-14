'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import {
  StoreContext,
  projectStore,
  timelineStore,
  uiStore,
  captureStore,
  signalStore,
} from '../hooks/useStores';
import { subscribeNotifications } from '../core/services/notifications';
import { startListening, stopListening } from '../core/services/shortcuts';
import { startSync, stopSync } from '../core/services/stdbSync';
import { StdbConnection, type StdbConfig } from '../lib/stdb';

const STDB_CONFIG: StdbConfig = {
  host: process.env.NEXT_PUBLIC_STDB_HOST ?? 'ws://localhost:3000',
  module: process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio',
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Wire notifications → sonner
    const unsubNotifs = subscribeNotifications((notification) => {
      const opts = { duration: notification.durationMs, description: notification.description };
      switch (notification.type) {
        case 'success':
          toast.success(notification.title, opts);
          break;
        case 'error':
          toast.error(notification.title, opts);
          break;
        case 'warning':
          toast.warning(notification.title, opts);
          break;
        default:
          toast.info(notification.title, opts);
      }
    });

    // Start keyboard shortcut listener
    startListening();

    // Start SpacetimeDB → store sync
    const conn = new StdbConnection(STDB_CONFIG);
    startSync({
      projectStore,
      signalStore,
      connection: conn,
      pollInterval: 3000,
    });

    return () => {
      unsubNotifs();
      stopListening();
      stopSync();
      conn.disconnect();
    };
  }, []);

  return (
    <StoreContext.Provider
      value={{ projectStore, timelineStore, uiStore, captureStore, signalStore }}
    >
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          },
        }}
      />
    </StoreContext.Provider>
  );
}
