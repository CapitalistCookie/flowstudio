'use client';

import { type HTMLAttributes, type CSSProperties } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: '',
        success: '',
        warning: '',
        error: '',
        outline: 'border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const VARIANT_STYLES: Record<string, CSSProperties> = {
  default: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-text)',
  },
  success: {
    backgroundColor: 'var(--color-success)',
    color: 'var(--color-background)',
  },
  warning: {
    backgroundColor: 'var(--color-warning)',
    color: 'var(--color-background)',
  },
  error: {
    backgroundColor: 'var(--color-error)',
    color: 'var(--color-text)',
  },
  outline: {
    borderColor: 'var(--color-muted)',
    color: 'var(--color-muted)',
    backgroundColor: 'transparent',
  },
};

function Badge({ className, variant, style, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      style={{ ...VARIANT_STYLES[variant ?? 'default'], ...style }}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
