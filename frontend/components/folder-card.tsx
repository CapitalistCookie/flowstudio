'use client'

import { motion } from 'framer-motion'
import { FolderOpen, Pencil, Trash2 } from 'lucide-react'
import type { StdbFolder } from '@/lib/stdb/spacetimedb'

interface FolderCardProps {
  folder: StdbFolder
  projectCount: number
  onClick: () => void
  onRename: () => void
  onDelete: () => void
}

export function FolderCard({ folder, projectCount, onClick, onRename, onDelete }: FolderCardProps) {
  return (
    <motion.article
      variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-flux-amber/35 hover:shadow-md"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${folder.color}20` }}
        >
          <FolderOpen className="h-5 w-5" style={{ color: folder.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{folder.name}</h3>
          <p className="text-xs text-muted-foreground">
            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          </p>
        </div>
        <div
          className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onRename}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.article>
  )
}
