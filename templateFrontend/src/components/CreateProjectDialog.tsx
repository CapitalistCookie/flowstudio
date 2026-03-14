'use client';

import { useState, useEffect } from 'react';
import { BRANDING } from '@flowstudio/shared';
import { useReducer } from '../lib/hooks';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { callReducer } = useReducer();

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await callReducer('createProject', { name: name.trim(), ownerId: 'anonymous', metadata: '{}' });
      setName('');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      console.error('Failed to create project:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Create a new project in {BRANDING.name}
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleCreate(); }}
          autoFocus
        />

        {error && (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            type="button"
          >
            {loading ? 'Creating...' : 'Create Project'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
