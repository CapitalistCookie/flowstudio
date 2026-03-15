'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PRESET_COLORS = [
  '#F5A623',
  '#1A9E8F',
  '#6366F1',
  '#EC4899',
  '#22C55E',
  '#F59E0B',
  '#8B5CF6',
  '#EF4444',
]

interface CreateFolderDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, color: string) => void
}

export function CreateFolderDialog({ open, onClose, onCreate }: CreateFolderDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0]!)

  const handleCreate = () => {
    if (!name.trim()) return
    onCreate(name.trim(), color)
    setName('')
    setColor(PRESET_COLORS[0]!)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
          <DialogDescription>Organize your projects into folders.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Color</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 cursor-pointer rounded-full transition-all duration-200',
                    color === c ? 'scale-110 ring-2 ring-offset-2' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c, outlineColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>Create Folder</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
