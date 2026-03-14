/**
 * Canvas-based timeline renderer — framework-agnostic.
 * No React imports. Receives state and renders to a canvas.
 */

import type { TimelineState, Track, Clip, TrackType } from '../types';
import { TRACK_COLORS, TIMELINE_COLORS } from './colors';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
}

const RULER_HEIGHT = 28;
const TRACK_HEADER_WIDTH = 0; // Headers are rendered as React components
const MIN_CLIP_WIDTH = 4;

function msToX(ms: number, state: TimelineState): number {
  return (ms - state.scrollOffsetMs) * state.pxPerMs;
}

function xToMs(x: number, state: TimelineState): number {
  return x / state.pxPerMs + state.scrollOffsetMs;
}

/** Get nice ruler tick interval based on zoom level */
function getTickInterval(pxPerMs: number): { major: number; minor: number; labelFormat: 'seconds' | 'minutes' } {
  const pxPerSecond = pxPerMs * 1000;

  if (pxPerSecond > 200) return { major: 1000, minor: 200, labelFormat: 'seconds' };
  if (pxPerSecond > 50) return { major: 5000, minor: 1000, labelFormat: 'seconds' };
  if (pxPerSecond > 20) return { major: 10000, minor: 2000, labelFormat: 'seconds' };
  if (pxPerSecond > 5) return { major: 30000, minor: 5000, labelFormat: 'seconds' };
  if (pxPerSecond > 2) return { major: 60000, minor: 10000, labelFormat: 'minutes' };
  return { major: 300000, minor: 60000, labelFormat: 'minutes' };
}

function formatRulerLabel(ms: number, format: 'seconds' | 'minutes'): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (format === 'minutes') {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${totalSeconds}s`;
}

function drawRuler(rc: RenderContext, state: TimelineState) {
  const { ctx, width } = rc;
  const { major, minor, labelFormat } = getTickInterval(state.pxPerMs);

  // Background
  ctx.fillStyle = TIMELINE_COLORS.ruler;
  ctx.fillRect(0, 0, width, RULER_HEIGHT);

  // Bottom border
  ctx.strokeStyle = TIMELINE_COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_HEIGHT);
  ctx.lineTo(width, RULER_HEIGHT);
  ctx.stroke();

  // Ticks
  const startMs = Math.floor(state.scrollOffsetMs / minor) * minor;
  const endMs = xToMs(width, state);

  ctx.textBaseline = 'bottom';
  ctx.font = '10px monospace';

  for (let ms = startMs; ms <= endMs; ms += minor) {
    const x = msToX(ms, state);
    if (x < 0) continue;

    const isMajor = ms % major === 0;

    ctx.strokeStyle = TIMELINE_COLORS.rulerText;
    ctx.globalAlpha = isMajor ? 0.8 : 0.3;
    ctx.beginPath();
    ctx.moveTo(x, isMajor ? RULER_HEIGHT - 14 : RULER_HEIGHT - 8);
    ctx.lineTo(x, RULER_HEIGHT);
    ctx.stroke();

    if (isMajor) {
      ctx.fillStyle = TIMELINE_COLORS.rulerText;
      ctx.globalAlpha = 0.8;
      ctx.fillText(formatRulerLabel(ms, labelFormat), x + 3, RULER_HEIGHT - 2);
    }
  }
  ctx.globalAlpha = 1;
}

function drawTracks(rc: RenderContext, state: TimelineState) {
  const { ctx, width, height } = rc;
  const sortedTracks = [...state.tracks].sort((a, b) => a.order - b.order);

  let y = RULER_HEIGHT;

  for (const track of sortedTracks) {
    const trackHeight = track.height;
    if (y + trackHeight > height) break;

    // Track background
    const colors = TRACK_COLORS[track.type];
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, y, width, trackHeight);

    // Track separator
    ctx.strokeStyle = TIMELINE_COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + trackHeight);
    ctx.lineTo(width, y + trackHeight);
    ctx.stroke();

    // Draw clips on this track
    const trackClips = state.clips.filter((c) => c.trackId === track.id);
    for (const clip of trackClips) {
      drawClip(rc, state, clip, track.type, y, trackHeight);
    }

    y += trackHeight;
  }

  // Fill remaining space
  if (y < height) {
    ctx.fillStyle = TIMELINE_COLORS.background;
    ctx.fillRect(0, y, width, height - y);
  }
}

function drawClip(
  rc: RenderContext,
  state: TimelineState,
  clip: Clip,
  trackType: TrackType,
  trackY: number,
  trackHeight: number
) {
  const { ctx } = rc;
  const x = msToX(clip.startMs, state);
  const w = Math.max(MIN_CLIP_WIDTH, clip.durationMs * state.pxPerMs);
  const padding = 2;
  const isSelected = state.selectedClipIds.includes(clip.id);
  const colors = TRACK_COLORS[trackType];

  // Clip body
  ctx.fillStyle = isSelected ? colors.clipSelected : colors.clip;
  ctx.globalAlpha = clip.muted ? 0.4 : 0.85;

  const radius = 4;
  ctx.beginPath();
  ctx.roundRect(x + padding, trackY + padding, w - padding * 2, trackHeight - padding * 2, radius);
  ctx.fill();

  // Selection outline
  if (isSelected) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Clip label
  if (w > 40) {
    ctx.fillStyle = colors.text;
    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + padding + 4, trackY, w - padding * 2 - 8, trackHeight);
    ctx.clip();
    ctx.fillText(clip.label, x + padding + 6, trackY + trackHeight / 2);
    ctx.restore();
  }

  // Locked indicator
  if (clip.locked) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('L', x + w - 14, trackY + 4);
  }
}

function drawPlayhead(rc: RenderContext, state: TimelineState) {
  const { ctx, height } = rc;
  const x = msToX(state.playheadMs, state);

  if (x < 0) return;

  // Playhead line
  ctx.strokeStyle = TIMELINE_COLORS.playhead;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();

  // Playhead triangle
  ctx.fillStyle = TIMELINE_COLORS.playhead;
  ctx.beginPath();
  ctx.moveTo(x - 6, 0);
  ctx.lineTo(x + 6, 0);
  ctx.lineTo(x, 10);
  ctx.closePath();
  ctx.fill();
}

function drawMarks(rc: RenderContext, state: TimelineState) {
  const { ctx, height } = rc;

  if (state.markInMs !== null) {
    const x = msToX(state.markInMs, state);
    ctx.strokeStyle = TIMELINE_COLORS.markIn;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (state.markOutMs !== null) {
    const x = msToX(state.markOutMs, state);
    ctx.strokeStyle = TIMELINE_COLORS.markOut;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Highlight range between marks
  if (state.markInMs !== null && state.markOutMs !== null) {
    const x1 = msToX(state.markInMs, state);
    const x2 = msToX(state.markOutMs, state);
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    ctx.fillStyle = TIMELINE_COLORS.selection;
    ctx.fillRect(left, RULER_HEIGHT, right - left, height - RULER_HEIGHT);
  }
}

export function renderTimeline(rc: RenderContext, state: TimelineState) {
  const { ctx, width, height, dpr } = rc;

  // Clear
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = TIMELINE_COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Draw layers bottom-to-top
  drawTracks(rc, state);
  drawMarks(rc, state);
  drawRuler(rc, state);
  drawPlayhead(rc, state);
}

/** Hit test: which clip (if any) is at canvas position (x, y)? */
export function hitTestClip(
  x: number,
  y: number,
  state: TimelineState
): Clip | null {
  const sortedTracks = [...state.tracks].sort((a, b) => a.order - b.order);
  let trackY = RULER_HEIGHT;

  for (const track of sortedTracks) {
    const trackHeight = track.height;
    if (y >= trackY && y < trackY + trackHeight) {
      // Check clips on this track
      const trackClips = state.clips.filter((c) => c.trackId === track.id);
      for (const clip of trackClips) {
        const clipX = msToX(clip.startMs, state);
        const clipW = Math.max(MIN_CLIP_WIDTH, clip.durationMs * state.pxPerMs);
        if (x >= clipX && x <= clipX + clipW) {
          return clip;
        }
      }
      return null;
    }
    trackY += trackHeight;
  }

  return null;
}

/** Convert canvas X to timeline ms */
export { xToMs, msToX };
