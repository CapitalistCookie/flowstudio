/**
 * Timeline track colors — framework-agnostic.
 * Uses CSS variable values for canvas rendering.
 */

import type { TrackType } from '../types';

export const TRACK_COLORS: Record<TrackType, { bg: string; clip: string; clipSelected: string; text: string }> = {
  video: {
    bg: '#1a1f2e',
    clip: '#6366F1',
    clipSelected: '#818CF8',
    text: '#F8FAFC',
  },
  audio: {
    bg: '#1a2420',
    clip: '#22C55E',
    clipSelected: '#4ADE80',
    text: '#F8FAFC',
  },
  overlay: {
    bg: '#2a1a2e',
    clip: '#8B5CF6',
    clipSelected: '#A78BFA',
    text: '#F8FAFC',
  },
  text: {
    bg: '#2a2420',
    clip: '#F59E0B',
    clipSelected: '#FBBF24',
    text: '#0F172A',
  },
};

export const TIMELINE_COLORS = {
  background: '#0F172A',
  ruler: '#1E293B',
  rulerText: '#94A3B8',
  playhead: '#EF4444',
  grid: 'rgba(148, 163, 184, 0.1)',
  selection: 'rgba(99, 102, 241, 0.3)',
  snap: 'rgba(245, 158, 11, 0.5)',
  markIn: '#22C55E',
  markOut: '#EF4444',
};
