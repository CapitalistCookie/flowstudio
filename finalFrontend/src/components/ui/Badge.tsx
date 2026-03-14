'use client';

import { type HTMLAttributes, type CSSProperties } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors backdrop-blur-sm',
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
    backgroundColor: 'rgba(245, 166, 35, 0.15)',
    color: '#D4870A',
  },
  success: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    color: '#16A34A',
  },
  warning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#D97706',
  },
  error: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    color: '#DC2626',
  },
  outline: {
    borderColor: 'rgba(230, 225, 215, 0.6)',
    color: 'var(--color-muted)',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
