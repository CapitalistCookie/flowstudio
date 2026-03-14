'use client';

import { type ReactNode, useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  children: ReactNode;
  className?: string;
}

export function ContextMenu({ items, children, className }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = () => setOpen(false);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div onContextMenu={handleContextMenu} className={className}>
      {children}
      {open && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-xl p-1 shadow-lg glass-strong"
          style={{
            left: position.x,
            top: position.y,
            color: 'var(--color-text)',
          }}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div
                key={`sep-${i}`}
                className="my-1 h-px mx-1"
                style={{ background: 'linear-gradient(90deg, transparent 0%, var(--color-border) 20%, var(--color-border) 80%, transparent 100%)' }}
              />
            ) : (
              <button
                key={item.label || `sep-${i}`}
                disabled={item.disabled}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/40',
                  item.disabled && 'opacity-50'
                )}
                style={{
                  color: item.destructive ? 'var(--color-error)' : 'var(--color-text)',
                }}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
