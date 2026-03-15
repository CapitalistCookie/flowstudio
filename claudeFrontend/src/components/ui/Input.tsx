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
          'flex h-9 w-full rounded-xl px-3 py-2 text-sm outline-none placeholder:opacity-50 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow duration-200',
          className
        )}
        ref={ref}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: 'var(--color-text)',
          border: '1px solid rgba(230, 225, 215, 0.6)',
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.04)',
          ...style,
        }}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
