/**
 * Converters between STDB row types and local editor types.
 * Handles JSON serialization/deserialization of transform, effects, config fields.
 */

import type { TimelineClip, MediaFile } from '@/components/editor-context';
import { DEFAULT_CLIP_TRANSFORM, DEFAULT_CLIP_EFFECTS } from '@/components/editor-context';
import type { EffectBlockData, ClipTransform, ClipEffects } from '@/lib/types';
import type { TimelineClipRow, MediaFileRow, EffectBlockRow } from './module_bindings';

// ─── Timeline Clips ─────────────────────────────────────────────────

export function stdbClipToLocalClip(row: TimelineClipRow): TimelineClip {
  let transform: ClipTransform = { ...DEFAULT_CLIP_TRANSFORM };
  let effects: ClipEffects = { ...DEFAULT_CLIP_EFFECTS };

  try { transform = { ...DEFAULT_CLIP_TRANSFORM, ...JSON.parse(row.transform) }; } catch {}
  try { effects = { ...DEFAULT_CLIP_EFFECTS, ...JSON.parse(row.effects) }; } catch {}

  return {
    id: row.id,
    mediaId: row.mediaFileId,
    trackId: row.trackId,
    startTime: row.startTime,
    duration: row.duration,
    mediaOffset: row.mediaOffset,
    label: row.label,
    type: row.clipType as 'video' | 'audio',
    transform,
    effects,
    aiReasoning: row.aiReasoning || undefined,
  };
}

export function localClipToStdbClip(clip: TimelineClip, projectId: string, sortOrder: number) {
  return {
    id: clip.id,
    projectId,
    mediaFileId: clip.mediaId,
    trackId: clip.trackId,
    startTime: clip.startTime,
    duration: clip.duration,
    mediaOffset: clip.mediaOffset,
    label: clip.label,
    clipType: clip.type,
    transform: JSON.stringify(clip.transform),
    effects: JSON.stringify(clip.effects),
    aiReasoning: clip.aiReasoning ?? '',
    sortOrder,
  };
}

// ─── Media Files ────────────────────────────────────────────────────

export function stdbMediaToLocalMedia(row: MediaFileRow): MediaFile {
  const durationSec = row.durationSeconds;
  const min = Math.floor(durationSec / 60);
  const sec = Math.floor(durationSec % 60);
  const durationStr = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

  let captions;
  try {
    captions = row.captionsJson ? JSON.parse(row.captionsJson) : undefined;
  } catch {}

  return {
    id: row.id,
    name: row.name,
    duration: durationStr,
    durationSeconds: durationSec,
    type: row.fileType,
    thumbnail: null,
    objectUrl: row.gcsUrl,
    storageUrl: row.gcsUrl,
    storagePath: row.gcsPath,
    captions,
  };
}

export function localMediaToStdbMedia(media: MediaFile, projectId: string) {
  return {
    id: media.id,
    projectId,
    name: media.name,
    durationSeconds: media.durationSeconds,
    fileType: media.type,
    gcsPath: media.storagePath ?? '',
    gcsUrl: media.storageUrl ?? media.objectUrl,
    sizeBytes: BigInt(0),
    captionsJson: media.captions ? JSON.stringify(media.captions) : '[]',
  };
}

// ─── Effect Blocks ──────────────────────────────────────────────────

export function stdbEffectToLocalEffect(row: EffectBlockRow): EffectBlockData {
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(row.config); } catch {}

  return {
    id: row.id,
    effectType: row.effectType as EffectBlockData['effectType'],
    startTime: row.startTime,
    duration: row.duration,
    config,
  };
}

export function localEffectToStdbEffect(effect: EffectBlockData, projectId: string) {
  return {
    id: effect.id,
    projectId,
    effectType: effect.effectType,
    startTime: effect.startTime,
    duration: effect.duration,
    config: JSON.stringify(effect.config ?? {}),
  };
}
