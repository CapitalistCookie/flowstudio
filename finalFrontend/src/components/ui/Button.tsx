'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'hover-glow-amber',
        outline: 'border backdrop-blur-sm hover-glow-amber',
        ghost: 'backdrop-blur-sm',
        destructive: '',
        link: 'underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    const variantStyles: Record<string, React.CSSProperties> = {
      default: {
        background: 'linear-gradient(135deg, #F5A623 0%, #E09420 100%)',
        color: 'var(--color-text)',
      },
      outline: {
        borderColor: 'rgba(230, 225, 215, 0.6)',
        color: 'var(--color-text)',
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
      },
      ghost: {
        color: 'var(--color-text)',
        backgroundColor: 'transparent',
      },
      destructive: {
        backgroundColor: 'var(--color-error)',
        color: '#FFFFFF',
      },
      link: {
        color: 'var(--color-primary)',
        backgroundColor: 'transparent',
      },
    };

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ ...variantStyles[variant ?? 'default'], ...style }}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
