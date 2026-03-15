'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FolderOpen } from 'lucide-react'
import type { StdbFolder } from '@/lib/stdb/spacetimedb'

interface MoveToFolderDialogProps {
  open: boolean
  onClose: () => void
  folders: StdbFolder[]
  currentFolderId: string
  onMove: (folderId: string) => void
}

export function MoveToFolderDialog({ open, onClose, folders, currentFolderId, onMove }: MoveToFolderDialogProps) {
  const sortedFolders = [...folders].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to Folder</DialogTitle>
          <DialogDescription>Select a destination folder.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          <button
            onClick={() => { onMove(''); onClose() }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-secondary"
            style={{
              backgroundColor: currentFolderId === '' ? 'rgba(245, 166, 35, 0.08)' : undefined,
            }}
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span>No folder (ungrouped)</span>
          </button>
          {sortedFolders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => { onMove(folder.id); onClose() }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-secondary"
              style={{
                backgroundColor: currentFolderId === folder.id ? 'rgba(245, 166, 35, 0.08)' : undefined,
              }}
            >
              <FolderOpen className="h-4 w-4" style={{ color: folder.color }} />
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
