'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { isConnected, getConnection, getProjectPresence, setOnPresenceChanged, type StdbPresenceUser } from '@/lib/stdb/spacetimedb';
import { useAuth } from '@/lib/auth/use-auth';

const HEARTBEAT_INTERVAL_MS = 10_000; // 10 seconds

export interface PresenceUser {
  id: string;
  firebaseUid: string;
  displayName: string;
  color: string;
  currentTimelinePosition: number;
  isMe: boolean;
}

export function usePresence(projectId: string | null) {
  const { user } = useAuth();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [myColor, setMyColor] = useState<string>('#4ECDC4');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTimeRef = useRef(0);

  // Update current time for heartbeat (called from editor context)
  const updateTimelinePosition = useCallback((time: number) => {
    currentTimeRef.current = time;
  }, []);

  useEffect(() => {
    if (!projectId || !isConnected() || !user) return;

    const displayName = user.displayName || user.email || 'Anonymous';

    // Join project
    try {
      getConnection().reducers.joinProject({ projectId, displayName });
    } catch (err) {
      console.warn('[Presence] Failed to join:', err);
    }

    // Start heartbeat
    heartbeatRef.current = setInterval(() => {
      if (!isConnected()) return;
      try {
        getConnection().reducers.heartbeatPresence({
          currentTimelinePosition: currentTimeRef.current,
        });
      } catch {}
    }, HEARTBEAT_INTERVAL_MS);

    // Listen for presence changes
    const handlePresenceChanged = (rows: StdbPresenceUser[]) => {
      const mapped = rows.map((r): PresenceUser => ({
        id: r.id,
        firebaseUid: r.firebaseUid,
        displayName: r.displayName,
        color: r.color,
        currentTimelinePosition: r.currentTimelinePosition,
        isMe: r.firebaseUid === user.uid,
      }));
      setUsers(mapped);
      const me = mapped.find(u => u.isMe);
      if (me) setMyColor(me.color);
    };
    setOnPresenceChanged(handlePresenceChanged);

    // Initial load
    const initial = getProjectPresence(projectId);
    handlePresenceChanged(initial);

    // Cleanup
    const handleBeforeUnload = () => {
      try { getConnection().reducers.leaveProject({}); } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      setOnPresenceChanged(null);
      try { getConnection().reducers.leaveProject({}); } catch {}
    };
  }, [projectId, user]);

  return { users, myColor, updateTimelinePosition };
}
