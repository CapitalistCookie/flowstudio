'use client';

import { Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LockStatusBannerProps {
  isEditor: boolean;
  lockHolder: { name: string; uid: string } | null;
  onAcquireLock: () => void;
  onForceAcquire: () => void;
  isOwner: boolean;
}

export function LockStatusBanner({
  isEditor,
  lockHolder,
  onAcquireLock,
  onForceAcquire,
  isOwner,
}: LockStatusBannerProps) {
  // Don't show banner if user is the editor
  if (isEditor) return null;

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-amber-500/10 px-4 py-2">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Lock className="h-4 w-4 text-amber-500" />
        {lockHolder ? (
          <span>{lockHolder.name} is currently editing</span>
        ) : (
          <span>Read-only mode — no one is editing</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!lockHolder && (
          <Button variant="ghost" size="sm" className="gap-2" onClick={onAcquireLock}>
            <Unlock className="h-3.5 w-3.5" />
            Start editing
          </Button>
        )}
        {lockHolder && isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-amber-400 hover:text-amber-300"
            onClick={onForceAcquire}
          >
            <Unlock className="h-3.5 w-3.5" />
            Take over editing
          </Button>
        )}
      </div>
    </div>
  );
}
