'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FolderOpen } from 'lucide-react';
import type { FolderMeta } from '@/core/types';

interface MoveToFolderDialogProps {
  open: boolean;
  onClose: () => void;
  folders: FolderMeta[];
  currentFolderId: string;
  onMove: (folderId: string) => void;
}

export function MoveToFolderDialog({ open, onClose, folders, currentFolderId, onMove }: MoveToFolderDialogProps) {
  const sortedFolders = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to Folder</DialogTitle>
          <DialogDescription>Select a destination folder.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => { onMove(''); onClose(); }}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/40"
            style={{
              backgroundColor: currentFolderId === '' ? 'rgba(245, 166, 35, 0.08)' : undefined,
            }}
          >
            <FolderOpen className="h-4 w-4" style={{ color: 'var(--color-muted)' }} />
            <span>No folder (ungrouped)</span>
          </button>
          {sortedFolders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => { onMove(folder.id); onClose(); }}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/40"
              style={{
                backgroundColor: currentFolderId === folder.id ? 'rgba(245, 166, 35, 0.08)' : undefined,
              }}
            >
              <FolderOpen className="h-4 w-4" style={{ color: folder.color }} />
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
