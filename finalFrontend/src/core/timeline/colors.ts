/**
 * Timeline track colors — framework-agnostic.
 * Warm cinematic light theme for canvas rendering.
 */

import type { TrackType } from '../types';

export const TRACK_COLORS: Record<TrackType, { bg: string; clip: string; clipSelected: string; text: string }> = {
  video: {
    bg: '#F5F2ED',
    clip: '#F5A623',
    clipSelected: '#E09420',
    text: '#1A1916',
  },
  audio: {
    bg: '#F0EFEA',
    clip: '#1A9E8F',
    clipSelected: '#158A7D',
    text: '#1A1916',
  },
  overlay: {
    bg: '#F2F0EB',
    clip: '#8C5E14',
    clipSelected: '#A87428',
    text: '#F5F2ED',
  },
  text: {
    bg: '#F3F1EC',
    clip: '#56544F',
    clipSelected: '#6E6C67',
    text: '#F5F2ED',
  },
};

export const TIMELINE_COLORS = {
  background: '#F5F2ED',
  ruler: '#EDE9E2',
  rulerText: '#8A8780',
  playhead: '#DC2626',
  grid: 'rgba(26, 25, 22, 0.08)',
  selection: 'rgba(245, 166, 35, 0.2)',
  snap: 'rgba(245, 158, 11, 0.5)',
  markIn: '#1A9E8F',
  markOut: '#DC2626',
};
