'use client';

import { cn } from '@/lib/utils';

interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Separator({ orientation = 'horizontal', className }: SeparatorProps) {
  return (
    <div
      className={cn(
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      style={{
        background: orientation === 'horizontal'
          ? 'linear-gradient(90deg, transparent 0%, var(--color-border) 15%, var(--color-border) 85%, transparent 100%)'
          : 'linear-gradient(180deg, transparent 0%, var(--color-border) 15%, var(--color-border) 85%, transparent 100%)',
      }}
      role="separator"
    />
  );
}
