'use client';

import { useRef, useEffect } from 'react';
import { usePlayback } from '@/hooks/usePlayback';
import { useUIStore } from '@/hooks/useStores';
import { PipelineOverlay } from '@/components/studio/PipelineOverlay';
import { Button } from '@/components/ui/Button';
import { formatTimecode } from '@/lib/utils';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
} from 'lucide-react';

export function VideoPreview() {
  const { isPlaying, playheadMs, durationMs, toggle, seek } = usePlayback();
  const toggleFullscreen = useUIStore((s) => s.togglePreviewFullscreen);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync video element with playhead (when we have an actual video source)
  useEffect(() => {
    if (videoRef.current && !isNaN(videoRef.current.duration)) {
      const targetTime = playheadMs / 1000;
      if (Math.abs(videoRef.current.currentTime - targetTime) > 0.1) {
        videoRef.current.currentTime = targetTime;
      }
    }
  }, [playheadMs]);

  const skipBack = () => seek(Math.max(0, playheadMs - 5000));
  const skipForward = () => seek(Math.min(durationMs, playheadMs + 5000));

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Video area */}
      <div className="flex-1 flex items-center justify-center relative">
        <div
          className="aspect-video max-h-full max-w-full rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'rgba(26, 25, 22, 0.04)' }}
        >
          <video
            ref={videoRef}
            className="max-h-full max-w-full rounded-lg"
            style={{ display: 'none' /* Show when source available */ }}
          />
          <Play className="h-12 w-12 opacity-30" style={{ color: 'var(--color-muted)' }} />
        </div>

        <PipelineOverlay />

        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <Maximize2 className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* Transport controls */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
          {formatTimecode(playheadMs)}
        </span>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={skipBack} className="h-8 w-8">
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={skipForward} className="h-8 w-8">
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <span className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
          {formatTimecode(durationMs)}
        </span>
      </div>
    </div>
  );
}
