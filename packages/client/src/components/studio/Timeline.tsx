'use client';

import {
  useRef,
  useEffect,
  useCallback,
  useState,
} from 'react';
import { useTimelineStore } from '@/hooks/useStores';
import { useTimelineActions, useTimelineHistory } from '@/hooks/useTimeline';
import { usePlayback } from '@/hooks/usePlayback';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  renderTimeline,
  hitTestClip,
  xToMs,
  type RenderContext,
} from '@/core/timeline/renderer';
import type { TimelineState } from '@/core/types';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Trash2,
  Undo2,
  Redo2,
  Magnet,
  ZoomIn,
  ZoomOut,
  Plus,
} from 'lucide-react';

export function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Store state
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const playheadMs = useTimelineStore((s) => s.playheadMs);
  const durationMs = useTimelineStore((s) => s.durationMs);
  const pxPerMs = useTimelineStore((s) => s.pxPerMs);
  const scrollOffsetMs = useTimelineStore((s) => s.scrollOffsetMs);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);
  const markInMs = useTimelineStore((s) => s.markInMs);
  const markOutMs = useTimelineStore((s) => s.markOutMs);
  const snapResolutionMs = useTimelineStore((s) => s.snapResolutionMs);

  const setZoom = useTimelineStore((s) => s.setZoom);
  const setScrollOffset = useTimelineStore((s) => s.setScrollOffset);
  const setPlayheadMs = useTimelineStore((s) => s.setPlayheadMs);
  const toggleSnap = useTimelineStore((s) => s.toggleSnap);

  const { selectClip, deselectAll, removeClip, splitClip, addTrack } = useTimelineActions();
  const { undo, redo, canUndo, canRedo } = useTimelineHistory();
  const { toggle: togglePlayback, seek } = usePlayback();

  // Build state object for renderer
  const timelineState: TimelineState = {
    tracks,
    clips,
    playheadMs,
    durationMs,
    pxPerMs,
    scrollOffsetMs,
    selectedClipIds,
    markInMs,
    markOutMs,
    isPlaying,
    snapEnabled,
    snapResolutionMs,
  };

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rc: RenderContext = {
      ctx,
      width: rect.width,
      height: rect.height,
      dpr,
    };

    renderTimeline(rc, timelineState);
  }, [timelineState]);

  // Render on state changes
  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(render);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [render]);

  // Canvas interactions
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Click on ruler → seek
      if (y < 28) {
        const ms = xToMs(x, timelineState);
        setPlayheadMs(Math.max(0, ms));
        setIsDragging(true);
        return;
      }

      // Hit test clips
      const clip = hitTestClip(x, y, timelineState);
      if (clip) {
        selectClip(clip.id, e.shiftKey);
      } else {
        deselectAll();
        // Click on track area → seek
        const ms = xToMs(x, timelineState);
        setPlayheadMs(Math.max(0, ms));
        setIsDragging(true);
      }
    },
    [timelineState, selectClip, deselectAll, setPlayheadMs]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ms = xToMs(x, timelineState);
      setPlayheadMs(Math.max(0, ms));
    },
    [isDragging, timelineState, setPlayheadMs]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel → zoom/scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(pxPerMs * factor);
      } else {
        // Scroll
        const deltaMs = (e.deltaX + e.deltaY) / pxPerMs;
        setScrollOffset(scrollOffsetMs + deltaMs);
      }
    },
    [pxPerMs, scrollOffsetMs, setZoom, setScrollOffset]
  );

  const handleDeleteSelected = useCallback(() => {
    for (const id of selectedClipIds) {
      removeClip(id);
    }
  }, [selectedClipIds, removeClip]);

  const handleSplitSelected = useCallback(() => {
    for (const id of selectedClipIds) {
      splitClip(id, playheadMs);
    }
  }, [selectedClipIds, splitClip, playheadMs]);

  const handleAddTrack = useCallback(
    (type: 'video' | 'audio') => {
      addTrack({
        type,
        label: `${type} track`,
        height: type === 'audio' ? 48 : 64,
        muted: false,
        locked: false,
        visible: true,
      });
    },
    [addTrack]
  );

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-3 py-1.5 border-b"
        style={{ borderColor: 'rgba(148, 163, 184, 0.2)' }}
      >
        {/* Transport */}
        <Button variant="ghost" size="icon" onClick={() => seek(0)} className="h-7 w-7">
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={togglePlayback} className="h-7 w-7">
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seek(durationMs)} className="h-7 w-7">
          <SkipForward className="h-3.5 w-3.5" />
        </Button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(148, 163, 184, 0.2)' }} />

        {/* Edit */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSplitSelected}
          disabled={selectedClipIds.length === 0}
          className="h-7 w-7"
          title="Split at playhead"
        >
          <Scissors className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDeleteSelected}
          disabled={selectedClipIds.length === 0}
          className="h-7 w-7"
          title="Delete selected"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(148, 163, 184, 0.2)' }} />

        {/* Undo/redo */}
        <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo} className="h-7 w-7" title="Undo">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo} className="h-7 w-7" title="Redo">
          <Redo2 className="h-3.5 w-3.5" />
        </Button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(148, 163, 184, 0.2)' }} />

        {/* Snap */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSnap}
          className="h-7 w-7"
          title={snapEnabled ? 'Snap on' : 'Snap off'}
        >
          <Magnet
            className="h-3.5 w-3.5"
            style={{ color: snapEnabled ? 'var(--color-warning)' : undefined }}
          />
        </Button>

        {/* Zoom */}
        <Button variant="ghost" size="icon" onClick={() => setZoom(pxPerMs * 0.8)} className="h-7 w-7" title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setZoom(pxPerMs * 1.2)} className="h-7 w-7" title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>

        <div className="flex-1" />

        {/* Track count */}
        <Badge variant="outline" className="text-xs">
          {tracks.length} tracks
        </Badge>

        {/* Add track */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAddTrack('video')}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Video
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAddTrack('audio')}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Audio
        </Button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="block"
        />
      </div>
    </div>
  );
}
