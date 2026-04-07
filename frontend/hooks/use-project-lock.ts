'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { isConnected, getConnection, getProjectLock, setOnLockChanged, type StdbProjectLock } from '@/lib/stdb/spacetimedb';
import { useAuth } from '@/lib/auth/use-auth';

const RENEW_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface LockState {
  isEditor: boolean;
  lockHolder: { name: string; uid: string } | null;
  acquireLock: () => void;
  releaseLock: () => void;
  forceAcquire: () => void;
}

export function useProjectLock(projectId: string | null, role?: string): LockState {
  const { user } = useAuth();
  const [isEditor, setIsEditor] = useState(false);
  const [lockHolder, setLockHolder] = useState<{ name: string; uid: string } | null>(null);
  const renewRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateLockState = useCallback((lock: StdbProjectLock | null) => {
    if (!lock) {
      setIsEditor(false);
      setLockHolder(null);
    } else if (lock.lockedBy === user?.uid) {
      setIsEditor(true);
      setLockHolder(null);
    } else {
      setIsEditor(false);
      setLockHolder({ name: lock.lockedByName, uid: lock.lockedBy });
    }
  }, [user?.uid]);

  const acquireLock = useCallback(() => {
    // Viewers cannot acquire locks
    if (role === 'viewer') return;
    if (!projectId || !isConnected() || !user) return;
    const displayName = user.displayName || user.email || 'Anonymous';
    try {
      getConnection().reducers.acquireLock({ projectId, displayName });
    } catch (err) {
      console.warn('[Lock] Failed to acquire:', err);
    }
  }, [projectId, user, role]);

  const releaseLock = useCallback(() => {
    if (!projectId || !isConnected()) return;
    try {
      getConnection().reducers.releaseLock({ projectId });
    } catch (err) {
      console.warn('[Lock] Failed to release:', err);
    }
  }, [projectId]);

  const forceAcquire = useCallback(() => {
    if (!projectId || !isConnected() || !user) return;
    try {
      getConnection().reducers.forceReleaseLock({ projectId });
      // Acquire after force release
      setTimeout(() => {
        const displayName = user.displayName || user.email || 'Anonymous';
        try {
          getConnection().reducers.acquireLock({ projectId, displayName });
        } catch {}
      }, 200);
    } catch (err) {
      console.warn('[Lock] Failed to force acquire:', err);
    }
  }, [projectId, user]);

  useEffect(() => {
    if (!projectId || !isConnected() || !user) return;

    // Listen for lock changes
    setOnLockChanged((lock) => updateLockState(lock));

    // Initial check
    const currentLock = getProjectLock(projectId);
    updateLockState(currentLock);

    // Auto-acquire lock (skip for viewers)
    if (role === 'viewer') {
      // Viewers never acquire locks
    } else if (!currentLock) {
      acquireLock();
    } else if (currentLock.lockedBy === user.uid) {
      setIsEditor(true);
    }

    // Renew lock periodically
    renewRef.current = setInterval(() => {
      if (!isConnected() || !projectId) return;
      try {
        getConnection().reducers.renewLock({ projectId });
      } catch {}
    }, RENEW_INTERVAL_MS);

    // Cleanup
    const handleBeforeUnload = () => {
      try { getConnection().reducers.releaseLock({ projectId }); } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (renewRef.current) clearInterval(renewRef.current);
      setOnLockChanged(null);
      releaseLock();
    };
  }, [projectId, user, role, updateLockState, acquireLock, releaseLock]);

  return { isEditor, lockHolder, acquireLock, releaseLock, forceAcquire };
}
