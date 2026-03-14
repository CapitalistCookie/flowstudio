'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useReducer, getConnection } from '../lib/hooks';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Video, Upload } from 'lucide-react';

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { callReducer } = useReducer();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleChoice = async (path: 'record' | 'upload') => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const trimmedName = name.trim();
      await callReducer('createProject', {
        name: trimmedName,
        ownerId: 'anonymous',
        metadata: '{}',
      });

      // Query the DB directly to find the newly created project
      const conn = getConnection();
      const rows = await conn.queryTable('projects');
      const matching = rows.filter((r) => r.name === trimmedName);
      const sorted = matching.sort(
        (a, b) => (b.createdAt as number) - (a.createdAt as number)
      );
      const newProject = sorted[0];

      if (!newProject) {
        throw new Error('Project created but could not find it');
      }

      onClose();

      if (path === 'record') {
        router.push(`/record?projectId=${newProject.id}`);
      } else {
        router.push(`/project/${newProject.id}`);
      }
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
          <DialogTitle>Start a New Project</DialogTitle>
          <DialogDescription>
            Choose how to get started
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading && name.trim()) {
              handleChoice('upload');
            }
          }}
          autoFocus
        />

        {error && (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            onClick={() => handleChoice('record')}
            disabled={loading || !name.trim()}
            className="glass-card rounded-2xl p-5 text-left transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            style={{ border: '1px solid rgba(255, 255, 255, 0.6)' }}
          >
            <div
              className="rounded-xl p-2.5 w-fit mb-3"
              style={{ backgroundColor: 'rgba(26, 158, 143, 0.1)' }}
            >
              <Video className="h-5 w-5" style={{ color: 'var(--flux-teal)' }} />
            </div>
            <p className="font-semibold text-sm mb-1">Record a Video</p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Record your screen, then AI edits it
            </p>
          </button>

          <button
            onClick={() => handleChoice('upload')}
            disabled={loading || !name.trim()}
            className="glass-card rounded-2xl p-5 text-left transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            style={{ border: '1px solid rgba(255, 255, 255, 0.6)' }}
          >
            <div
              className="rounded-xl p-2.5 w-fit mb-3"
              style={{ backgroundColor: 'rgba(26, 158, 143, 0.1)' }}
            >
              <Upload className="h-5 w-5" style={{ color: 'var(--flux-teal)' }} />
            </div>
            <p className="font-semibold text-sm mb-1">Upload a Video</p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Already have a recording? Upload it.
            </p>
          </button>
        </div>

        {loading && (
          <p className="text-sm text-center" style={{ color: 'var(--color-muted)' }}>
            Creating project...
          </p>
        )}

        <div className="flex justify-center mt-1">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
