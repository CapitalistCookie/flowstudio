import { describe, it, expect } from 'vitest';
import { editPlanToTimelineClips } from '../lib/agent/edit-plan-to-timeline';
import { PIXELS_PER_SECOND } from '../components/editor-context';
import type { EditDecision } from '../lib/agent/use-agent';

const MEDIA_ID = 'media-1';

function makeEdit(overrides: Partial<EditDecision> = {}): EditDecision {
  return {
    editType: 'cut',
    sourceStartMs: 0,
    sourceEndMs: 5000,
    outputStartMs: 0,
    outputEndMs: 5000,
    parameters: {},
    reasoning: 'Test edit',
    ...overrides,
  };
}

describe('editPlanToTimelineClips', () => {
  it('returns empty array for empty plan', () => {
    expect(editPlanToTimelineClips([], MEDIA_ID)).toEqual([]);
  });

  it('converts a single cut to a timeline clip', () => {
    const plan: EditDecision[] = [makeEdit()];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);

    expect(clips).toHaveLength(1);
    const clip = clips[0];
    expect(clip.mediaId).toBe(MEDIA_ID);
    expect(clip.startTime).toBe(0);
    expect(clip.duration).toBe(5 * PIXELS_PER_SECOND);
    expect(clip.mediaOffset).toBe(0);
    expect(clip.type).toBe('video');
    expect(clip.aiEditType).toBe('cut');
    expect(clip.aiReasoning).toBe('Test edit');
    expect(clip.trackId).toBe('Track 3');
  });

  it('positions clips based on outputStartMs', () => {
    const plan: EditDecision[] = [
      makeEdit({ outputStartMs: 10000, outputEndMs: 20000 }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].startTime).toBe(10 * PIXELS_PER_SECOND);
    expect(clips[0].duration).toBe(10 * PIXELS_PER_SECOND);
  });

  it('sets mediaOffset from sourceStartMs', () => {
    const plan: EditDecision[] = [
      makeEdit({ sourceStartMs: 3000, sourceEndMs: 8000 }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].mediaOffset).toBe(3 * PIXELS_PER_SECOND);
  });

  it('applies zoom transform from parameters', () => {
    const plan: EditDecision[] = [
      makeEdit({ editType: 'zoom', parameters: { zoomLevel: 2.0 } }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].transform.scale).toBe(200);
    expect(clips[0].aiEditType).toBe('zoom');
    expect(clips[0].trackId).toBe('Track 4');
  });

  it('applies default zoom when zoomLevel not specified', () => {
    const plan: EditDecision[] = [
      makeEdit({ editType: 'zoom', parameters: {} }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].transform.scale).toBe(150);
  });

  it('applies pan transform', () => {
    const plan: EditDecision[] = [
      makeEdit({ editType: 'pan', parameters: { panX: 50, panY: -30 } }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].transform.positionX).toBe(50);
    expect(clips[0].transform.positionY).toBe(-30);
    expect(clips[0].trackId).toBe('Track 4');
  });

  it('places overlay edits on Track 4', () => {
    const plan: EditDecision[] = [
      makeEdit({ editType: 'overlay' }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].trackId).toBe('Track 4');
  });

  it('enforces minimum clip duration', () => {
    const plan: EditDecision[] = [
      makeEdit({ outputStartMs: 0, outputEndMs: 10 }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].duration).toBeGreaterThanOrEqual(PIXELS_PER_SECOND * 0.5);
  });

  it('truncates long reasoning in label', () => {
    const longReasoning = 'A'.repeat(100);
    const plan: EditDecision[] = [
      makeEdit({ reasoning: longReasoning }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].label.length).toBeLessThan(60);
    expect(clips[0].label).toContain('...');
    expect(clips[0].aiReasoning).toBe(longReasoning);
  });

  it('generates unique clip IDs', () => {
    const plan: EditDecision[] = [makeEdit(), makeEdit(), makeEdit()];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    const ids = clips.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    ids.forEach((id) => expect(id).toMatch(/^ai-/));
  });

  it('converts a full pipeline output', () => {
    const plan: EditDecision[] = [
      makeEdit({ editType: 'cut', sourceStartMs: 0, sourceEndMs: 5000, outputStartMs: 0, outputEndMs: 5000, reasoning: 'Opening' }),
      makeEdit({ editType: 'speedup', sourceStartMs: 5000, sourceEndMs: 25000, outputStartMs: 5000, outputEndMs: 15000, parameters: { speed: 2.0 }, reasoning: 'Fast forward' }),
      makeEdit({ editType: 'zoom', sourceStartMs: 25000, sourceEndMs: 30000, outputStartMs: 15000, outputEndMs: 20000, parameters: { zoomLevel: 1.5 }, reasoning: 'Zoom button' }),
      makeEdit({ editType: 'cut', sourceStartMs: 30000, sourceEndMs: 60000, outputStartMs: 20000, outputEndMs: 50000, reasoning: 'Closing' }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips).toHaveLength(4);

    expect(clips[0].startTime).toBe(0);
    expect(clips[1].startTime).toBe(5 * PIXELS_PER_SECOND);
    expect(clips[2].startTime).toBe(15 * PIXELS_PER_SECOND);
    expect(clips[2].transform.scale).toBe(150);
    expect(clips[3].startTime).toBe(20 * PIXELS_PER_SECOND);
  });
});
