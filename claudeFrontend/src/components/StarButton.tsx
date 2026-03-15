'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarButtonProps {
  starred: boolean;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}

export function StarButton({ starred, onClick, className }: StarButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      className={cn(
        'p-1 rounded-lg transition-all duration-200 hover:scale-110',
        starred ? 'text-[#F5A623]' : 'text-[#C4BEB5] hover:text-[#F5A623]/60',
        className
      )}
      title={starred ? 'Unstar' : 'Star'}
    >
      <Star
        className="h-4 w-4"
        fill={starred ? 'currentColor' : 'none'}
        strokeWidth={starred ? 0 : 2}
      />
    </button>
  );
}
