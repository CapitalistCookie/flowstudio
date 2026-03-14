'use client';

import { BRANDING } from '@flowstudio/shared';
import { useConnectionStatus } from '../lib/hooks';

export function Header() {
  const connected = useConnectionStatus();

  return (
    <header
      className="border-b px-6 py-4 flex items-center justify-between"
      style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
          {BRANDING.name}
        </h1>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {BRANDING.tagline}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: connected ? 'var(--color-success)' : 'var(--color-error)' }}
        />
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </header>
  );
}
