'use client';

import { useEffect, type ReactNode } from 'react';
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
import { initSpacetimeDb, disconnectSpacetimeDb } from '../lib/spacetimedb';

export function StoreProvider({ children }: { children: ReactNode }) {
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

    // Connect to SpacetimeDB via native WebSocket SDK
    initSpacetimeDb({ projectStore, signalStore }).catch((err) => {
      console.error('[StoreProvider] STDB connection failed:', err);
      projectStore.getState().setLoading(false);
    });

    return () => {
      unsubNotifs();
      stopListening();
      disconnectSpacetimeDb();
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
