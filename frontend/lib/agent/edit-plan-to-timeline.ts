import {
  PIXELS_PER_SECOND,
  type TimelineClip,
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_EFFECTS,
} from '@/components/editor-context';
import type { EditDecision } from './use-agent';

const msToPixels = (ms: number) => (ms / 1000) * PIXELS_PER_SECOND;

export function editPlanToTimelineClips(
  plan: EditDecision[],
  mediaId: string,
): TimelineClip[] {
  const batchId = Date.now();

  return plan.map((edit, index) => {
    const startTime = msToPixels(edit.outputStartMs);
    const duration = msToPixels(edit.outputEndMs - edit.outputStartMs);
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
    }

    let trackId: string;
    switch (edit.editType) {
      case 'overlay':
        trackId = 'Track 4';
        break;
      case 'zoom':
      case 'pan':
        trackId = 'Track 4';
        break;
      default:
        trackId = 'Track 3';
        break;
    }

    const shortReasoning =
      edit.reasoning.length > 40
        ? edit.reasoning.slice(0, 37) + '...'
        : edit.reasoning;

    return {
      id: `ai-${batchId}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      mediaId,
      trackId,
      startTime,
      duration: Math.max(duration, PIXELS_PER_SECOND * 0.5),
      mediaOffset,
      label: `${edit.editType}: ${shortReasoning}`,
      type: 'video' as const,
      transform,
      effects,
      aiReasoning: edit.reasoning,
      aiEditType: edit.editType,
    };
  });
}
