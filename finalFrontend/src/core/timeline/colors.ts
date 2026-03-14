/**
 * Timeline track colors — framework-agnostic.
 * Warm liquid glass theme for canvas rendering.
 */

import type { TrackType } from '../types';

export const TRACK_COLORS: Record<TrackType, { bg: string; clip: string; clipSelected: string; text: string }> = {
  video: {
    bg: '#FFFEF2',
    clip: '#F5A623',
    clipSelected: '#E09420',
    text: '#1A1916',
  },
  audio: {
    bg: '#F8F6F1',
    clip: '#1A9E8F',
    clipSelected: '#158A7D',
    text: '#1A1916',
  },
  overlay: {
    bg: '#F9F7F2',
    clip: '#D4A54A',
    clipSelected: '#C29540',
    text: '#1A1916',
  },
  text: {
    bg: '#FAF8F3',
    clip: '#8A8780',
    clipSelected: '#6E6C67',
    text: '#FFFEF2',
  },
};

export const TIMELINE_COLORS = {
  background: '#FFFEF2',
  ruler: '#F0EDE8',
  rulerText: '#8A8780',
  playhead: '#F5A623',
  grid: 'rgba(26, 25, 22, 0.06)',
  selection: 'rgba(245, 166, 35, 0.15)',
  snap: 'rgba(245, 166, 35, 0.5)',
  markIn: '#1A9E8F',
  markOut: '#DC2626',
};
