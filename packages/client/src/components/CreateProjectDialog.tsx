'use client';

import { useState } from 'react';
import { BRANDING } from '@flowstudio/shared';
import { useReducer } from '../lib/hooks.js';

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { callReducer } = useReducer();

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await callReducer('createProject', { name: name.trim(), ownerId: 'anonymous' });
      setName('');
      onClose();
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="rounded-lg p-6 w-full max-w-md"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <h2 className="text-lg font-bold mb-4">New Project</h2>
        <input
          type="text"
          placeholder="Project name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full rounded px-3 py-2 mb-4 text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-background)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-muted)',
          }}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-text)',
            }}
          >
            {loading ? 'Creating...' : `Create in ${BRANDING.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
