'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LockTakeoverDialogProps {
  open: boolean;
  lockHolderName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LockTakeoverDialog({ open, lockHolderName, onConfirm, onCancel }: LockTakeoverDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-foreground">Take over editing?</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          <strong>{lockHolderName}</strong> is currently editing this project.
          Taking over will remove their edit access. Any unsaved changes they have may be lost.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={onConfirm}>
            Take over
          </Button>
        </div>
      </div>
    </div>
  );
}
