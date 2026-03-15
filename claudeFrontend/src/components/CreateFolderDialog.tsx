'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const PRESET_COLORS = [
  '#F5A623',
  '#1A9E8F',
  '#6366F1',
  '#EC4899',
  '#22C55E',
  '#F59E0B',
  '#8B5CF6',
  '#EF4444',
];

interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
}

export function CreateFolderDialog({ open, onClose, onCreate }: CreateFolderDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]!);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName('');
    setColor(PRESET_COLORS[0]!);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
          <DialogDescription>Organize your projects into folders.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Color</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full transition-all duration-200',
                    color === c ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c, outlineColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>Create Folder</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
