import {
  PIXELS_PER_SECOND,
  type TimelineClip,
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_EFFECTS,
} from '@/components/editor-context';
import type { EditDecision } from './use-agent';

const msToPixels = (ms: number) => (ms / 1000) * PIXELS_PER_SECOND;

/**
 * Layered track assignment:
 * - V2 (top): zoom, pan, overlay — visual transforms
 * - V1: trim, cut, speedup, slowdown, transition — structural/speed edits
 */
function getTrackForEditType(editType: string): string {
  switch (editType) {
    case 'zoom':
    case 'pan':
    case 'overlay':
      return 'V2';
    case 'trim':
    case 'cut':
    case 'speedup':
    case 'slowdown':
    case 'transition':
      return 'V1';
    default:
      return 'V1';
  }
}

const MAX_LABEL_REASONING = 40;

function buildLabel(edit: EditDecision): string {
  const shortReasoning =
    edit.reasoning.length > MAX_LABEL_REASONING
      ? edit.reasoning.slice(0, MAX_LABEL_REASONING - 3) + '...'
      : edit.reasoning;

  switch (edit.editType) {
    case 'speedup': {
      const speed = (edit.parameters.speed as number) ?? 2.0;
      return `speedup ${speed}x: ${shortReasoning}`;
    }
    case 'slowdown': {
      const speed = (edit.parameters.speed as number) ?? 0.5;
      return `slowdown ${speed}x: ${shortReasoning}`;
    }
    case 'transition': {
      const type = (edit.parameters.transitionType as string) ?? 'crossfade';
      return `transition (${type}): ${shortReasoning}`;
    }
    default:
      return `${edit.editType}: ${shortReasoning}`;
  }
}

function computeDuration(edit: EditDecision): number {
  const outputDurationMs = edit.outputEndMs - edit.outputStartMs;
  const sourceDurationMs = edit.sourceEndMs - edit.sourceStartMs;

  switch (edit.editType) {
    case 'speedup': {
      const speed = (edit.parameters.speed as number) ?? 2.0;
      return msToPixels(sourceDurationMs / speed);
    }
    case 'slowdown': {
      const speed = (edit.parameters.speed as number) ?? 0.5;
      return msToPixels(sourceDurationMs / speed);
    }
    case 'trim':
    case 'cut':
      return msToPixels(outputDurationMs);
    default:
      return msToPixels(outputDurationMs);
  }
}

export function editPlanToTimelineClips(
  plan: EditDecision[],
  mediaId: string,
): TimelineClip[] {
  if (plan.length === 0) return [];

  const batchId = Date.now();

  return plan.map((edit, index) => {
    const startTime = msToPixels(edit.outputStartMs);
    const durationPx = computeDuration(edit);
    const duration = Math.max(durationPx, PIXELS_PER_SECOND * 0.5);
    const mediaOffset = msToPixels(edit.sourceStartMs);

    const transform = { ...DEFAULT_CLIP_TRANSFORM };
    const effects = { ...DEFAULT_CLIP_EFFECTS };

    switch (edit.editType) {
      case 'zoom':
        transform.scale = ((edit.parameters.zoomLevel as number) ?? 1.5) * 100;
        break;
      case 'pan':
        transform.positionX = (edit.parameters.panX as number) ?? 0;
        transform.positionY = (edit.parameters.panY as number) ?? 0;
        break;
      case 'overlay':
        transform.opacity = 70;
        break;
    }

    const trackId = getTrackForEditType(edit.editType);
    const label = buildLabel(edit);

    const clip: TimelineClip = {
      id: `ai-${batchId}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      mediaId,
      trackId,
      startTime,
      duration,
      mediaOffset,
      label,
      type: 'video' as const,
      transform,
      effects,
      aiReasoning: edit.reasoning,
      aiEditType: edit.editType,
    };

    if (edit.editType === 'speedup' || edit.editType === 'slowdown') {
      clip.aiEditParameters = {
        speed: (edit.parameters.speed as number) ?? (edit.editType === 'speedup' ? 2.0 : 0.5),
      };
    }
    if (edit.editType === 'transition') {
      clip.aiEditParameters = {
        transitionType: (edit.parameters.transitionType as string) ?? 'crossfade',
      };
    }

    return clip;
  });
}
