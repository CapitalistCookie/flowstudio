'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useTimelineStore } from '@/hooks/useStores';
import { TRACK_COLORS, TIMELINE_COLORS } from '@/core/timeline/colors';
import type { TrackType } from '@/core/types';

const MINIMAP_HEIGHT = 32;

export function TimelineMinimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const durationMs = useTimelineStore((s) => s.durationMs);
  const scrollOffsetMs = useTimelineStore((s) => s.scrollOffsetMs);
  const pxPerMs = useTimelineStore((s) => s.pxPerMs);
  const playheadMs = useTimelineStore((s) => s.playheadMs);
  const setScrollOffset = useTimelineStore((s) => s.setScrollOffset);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = MINIMAP_HEIGHT;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = TIMELINE_COLORS.ruler;
    ctx.fillRect(0, 0, width, height);

    if (durationMs <= 0) return;

    const scale = width / durationMs;
    const sortedTracks = [...tracks].sort((a, b) => a.order - b.order);
    const trackCount = sortedTracks.length || 1;
    const trackH = height / trackCount;

    // Draw clips
    sortedTracks.forEach((track, i) => {
      const trackClips = clips.filter((c) => c.trackId === track.id);
      const colors = TRACK_COLORS[track.type as TrackType];
      ctx.fillStyle = colors.clip;
      ctx.globalAlpha = 0.7;

      for (const clip of trackClips) {
        const x = clip.startMs * scale;
        const w = Math.max(1, clip.durationMs * scale);
        ctx.fillRect(x, i * trackH + 1, w, trackH - 2);
      }
    });

    ctx.globalAlpha = 1;

    // Viewport indicator
    const viewStartX = scrollOffsetMs * scale;
    const viewWidthMs = width / pxPerMs;
    const viewEndX = (scrollOffsetMs + viewWidthMs) * scale;

    ctx.strokeStyle = 'rgba(26, 25, 22, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewStartX, 0, viewEndX - viewStartX, height);

    // Playhead
    const playheadX = playheadMs * scale;
    ctx.strokeStyle = TIMELINE_COLORS.playhead;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [tracks, clips, durationMs, scrollOffsetMs, pxPerMs, playheadMs]);

  useEffect(() => {
    const raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container || durationMs <= 0) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clickMs = (x / rect.width) * durationMs;
      const viewWidthMs = rect.width / pxPerMs;
      setScrollOffset(Math.max(0, clickMs - viewWidthMs / 2));
    },
    [durationMs, pxPerMs, setScrollOffset]
  );

  return (
    <div
      ref={containerRef}
      className="w-full cursor-pointer"
      onClick={handleClick}
      style={{ height: MINIMAP_HEIGHT }}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
