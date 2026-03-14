'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg px-3 py-2 text-sm outline-none placeholder:opacity-50 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        style={{
          backgroundColor: 'var(--color-background)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-muted)',
          ...style,
        }}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
