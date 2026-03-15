'use client';

import { FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { FolderMeta } from '@/core/types';

interface FolderCardProps {
  folder: FolderMeta;
  projectCount: number;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function FolderCard({ folder, projectCount, onClick, onRename, onDelete }: FolderCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left glass-card rounded-2xl p-4 cursor-pointer relative group"
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="rounded-xl p-2"
          style={{ backgroundColor: `${folder.color}20` }}
        >
          <FolderOpen className="h-5 w-5" style={{ color: folder.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{folder.name}</h3>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          </p>
        </div>
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onRename}
            className="p-1 rounded-lg hover:bg-white/40 transition-colors"
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--color-muted)' }} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded-lg hover:bg-white/40 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--color-error)' }} />
          </button>
        </div>
      </div>
    </button>
  );
}
