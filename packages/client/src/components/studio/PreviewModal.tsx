'use client';

import { useEffect, useCallback } from 'react';
import { usePlayback } from '@/hooks/usePlayback';
import { Button } from '@/components/ui/Button';
import { formatTimecode } from '@/lib/utils';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from 'lucide-react';

interface PreviewModalProps {
  onClose: () => void;
}

export function PreviewModal({ onClose }: PreviewModalProps) {
  const { isPlaying, playheadMs, durationMs, toggle, seek } = usePlayback();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Space for play/pause is handled by useStudioShortcuts — no duplicate handler
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Close button */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Video area */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className="aspect-video max-h-[80vh] max-w-[90vw] rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-background)' }}
        >
          <Play className="h-16 w-16 opacity-30" style={{ color: 'var(--color-muted)' }} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 p-4">
        <span className="text-sm font-mono" style={{ color: 'var(--color-muted)' }}>
          {formatTimecode(playheadMs)}
        </span>

        <Button variant="ghost" size="icon" onClick={() => seek(Math.max(0, playheadMs - 5000))}>
          <SkipBack className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggle} className="h-12 w-12">
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seek(Math.min(durationMs, playheadMs + 5000))}>
          <SkipForward className="h-5 w-5" />
        </Button>

        <span className="text-sm font-mono" style={{ color: 'var(--color-muted)' }}>
          {formatTimecode(durationMs)}
        </span>
      </div>
    </div>
  );
}
