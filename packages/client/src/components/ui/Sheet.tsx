'use client';

import { type ReactNode, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Sheet({ open, onClose, side = 'right', title, children, className }: SheetProps) {
  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, handleEsc]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          'fixed top-0 z-50 h-full w-80 transition-transform duration-200',
          side === 'left' ? 'left-0' : 'right-0',
          className
        )}
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center justify-between p-4">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <button
            onClick={onClose}
            className="ml-auto rounded-sm opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 pt-0">{children}</div>
      </div>
    </>
  );
}
