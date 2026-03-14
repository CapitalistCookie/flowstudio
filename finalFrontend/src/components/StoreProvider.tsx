'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import { initConnection, disconnect } from '../lib/stdbConnection';
import { startSdkSync, stopSdkSync } from '../core/services/stdbSdkSync';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Wire notifications -> sonner
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

    // Connect to SpacetimeDB and start store sync
    initConnection(
      () => setConnected(true),
      () => setConnected(false),
    )
      .then(() => {
        startSdkSync({ projectStore, signalStore, pollInterval: 3000 });
      })
      .catch((err) => {
        console.error('[StoreProvider] STDB connection failed:', err);
        // Start sync anyway — individual poll attempts will retry
        startSdkSync({ projectStore, signalStore, pollInterval: 3000 });
      });

    return () => {
      unsubNotifs();
      stopListening();
      stopSdkSync();
      disconnect();
    };
  }, []);

  return (
    <StoreContext.Provider
      value={{ projectStore, timelineStore, uiStore, captureStore, signalStore }}
    >
      {children}
      <Toaster
        position="bottom-right"
        richColors
        toastOptions={{
          style: {
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          },
        }}
      />
    </StoreContext.Provider>
  );
}
