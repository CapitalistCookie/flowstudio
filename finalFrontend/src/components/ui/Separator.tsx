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
      style={{ backgroundColor: 'var(--color-border)' }}
      role="separator"
    />
  );
}
