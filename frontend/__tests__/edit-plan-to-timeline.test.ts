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
    expect(clip.trackId).toBe('V1');
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
    expect(clips[0].trackId).toBe('V2');
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
    expect(clips[0].trackId).toBe('V2');
  });

  it('places overlay edits on V2 with 70% opacity', () => {
    const plan: EditDecision[] = [
      makeEdit({ editType: 'overlay' }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].trackId).toBe('V2');
    expect(clips[0].transform.opacity).toBe(70);
  });

  it('each edit type maps to correct track', () => {
    const trackAssertions: Array<{ editType: string; expectedTrack: string }> = [
      { editType: 'zoom', expectedTrack: 'V2' },
      { editType: 'pan', expectedTrack: 'V2' },
      { editType: 'overlay', expectedTrack: 'V2' },
      { editType: 'trim', expectedTrack: 'V1' },
      { editType: 'cut', expectedTrack: 'V1' },
      { editType: 'speedup', expectedTrack: 'V1' },
      { editType: 'slowdown', expectedTrack: 'V1' },
      { editType: 'transition', expectedTrack: 'V1' },
    ];
    for (const { editType, expectedTrack } of trackAssertions) {
      const plan = [makeEdit({ editType: editType as EditDecision['editType'], parameters: editType === 'speedup' ? { speed: 2 } : editType === 'slowdown' ? { speed: 0.5 } : editType === 'transition' ? { transitionType: 'crossfade' } : {} })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].trackId).toBe(expectedTrack);
    }
  });

  it('speedup edits have timeline duration = source duration / speedFactor', () => {
    const plan: EditDecision[] = [
      makeEdit({
        editType: 'speedup',
        sourceStartMs: 0,
        sourceEndMs: 20000,
        outputStartMs: 0,
        outputEndMs: 10000,
        parameters: { speed: 2.0 },
      }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].duration).toBe(10 * PIXELS_PER_SECOND);
    expect(clips[0].aiEditParameters?.speed).toBe(2.0);
    expect(clips[0].label).toMatch(/speedup 2x/);
  });

  it('slowdown edits have timeline duration = source duration / slowFactor', () => {
    const plan: EditDecision[] = [
      makeEdit({
        editType: 'slowdown',
        sourceStartMs: 0,
        sourceEndMs: 4000,
        outputStartMs: 0,
        outputEndMs: 8000,
        parameters: { speed: 0.5 },
      }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].duration).toBe(8 * PIXELS_PER_SECOND);
    expect(clips[0].aiEditParameters?.speed).toBe(0.5);
    expect(clips[0].label).toMatch(/slowdown 0\.5x/);
  });

  it('transition edits have label showing transition type', () => {
    const plan: EditDecision[] = [
      makeEdit({ editType: 'transition', parameters: { transitionType: 'dissolve' }, reasoning: 'Smooth cut' }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].label).toMatch(/transition \(dissolve\)/);
    expect(clips[0].aiEditParameters?.transitionType).toBe('dissolve');
  });

  it('trim edits use output range for duration', () => {
    const plan: EditDecision[] = [
      makeEdit({
        editType: 'trim',
        sourceStartMs: 2000,
        sourceEndMs: 8000,
        outputStartMs: 0,
        outputEndMs: 4000,
      }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].duration).toBe(4 * PIXELS_PER_SECOND);
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

  describe('track assignment by edit type', () => {
    it('maps each edit type to the correct track', () => {
      const trackExpectations: Array<{ editType: string; expectedTrack: string }> = [
        { editType: 'cut', expectedTrack: 'V1' },
        { editType: 'trim', expectedTrack: 'V1' },
        { editType: 'speedup', expectedTrack: 'V1' },
        { editType: 'slowdown', expectedTrack: 'V1' },
        { editType: 'zoom', expectedTrack: 'V2' },
        { editType: 'pan', expectedTrack: 'V2' },
        { editType: 'transition', expectedTrack: 'V1' },
        { editType: 'overlay', expectedTrack: 'V2' },
      ];
      for (const { editType, expectedTrack } of trackExpectations) {
        const plan = [makeEdit({ editType, parameters: editType === 'speedup' ? { speed: 2 } : editType === 'slowdown' ? { speed: 0.5 } : {} })];
        const clips = editPlanToTimelineClips(plan, MEDIA_ID);
        expect(clips).toHaveLength(1);
        expect(clips[0].trackId).toBe(expectedTrack);
        expect(clips[0].aiEditType).toBe(editType);
      }
    });
  });

  describe('transform and effects per edit type', () => {
    it('zoom edits have correct scale (zoomLevel * 100)', () => {
      const plan = [makeEdit({ editType: 'zoom', parameters: { zoomLevel: 2.5 } })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].transform.scale).toBe(250);
    });

    it('pan edits have correct position from panX/panY', () => {
      const plan = [makeEdit({ editType: 'pan', parameters: { panX: 100, panY: -50 } })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].transform.positionX).toBe(100);
      expect(clips[0].transform.positionY).toBe(-50);
    });

    it('overlay edits have 70% opacity', () => {
      const plan = [makeEdit({ editType: 'overlay' })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].transform.opacity).toBe(70);
    });

    it('speedup edits store speed in aiEditParameters', () => {
      const plan = [makeEdit({ editType: 'speedup', parameters: { speed: 2.5 } })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].aiEditParameters?.speed).toBe(2.5);
      expect(clips[0].label).toContain('2.5x');
    });

    it('slowdown edits store speed in aiEditParameters', () => {
      const plan = [makeEdit({ editType: 'slowdown', parameters: { speed: 0.5 } })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].aiEditParameters?.speed).toBe(0.5);
      expect(clips[0].label).toContain('0.5x');
    });

    it('transition edits have label with transitionType', () => {
      const plan = [makeEdit({ editType: 'transition', parameters: { transitionType: 'dissolve' }, reasoning: 'Smooth' })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].label).toContain('dissolve');
      expect(clips[0].aiEditParameters?.transitionType).toBe('dissolve');
    });
  });

  describe('duration handling', () => {
    it('speedup: timeline duration = source duration / speedFactor', () => {
      const plan = [
        makeEdit({
          editType: 'speedup',
          sourceStartMs: 0,
          sourceEndMs: 20000,
          outputStartMs: 0,
          outputEndMs: 10000,
          parameters: { speed: 2.0 },
        }),
      ];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      const expectedDurationPx = (20000 / 1000 / 2) * PIXELS_PER_SECOND;
      expect(clips[0].duration).toBe(expectedDurationPx);
    });

    it('slowdown: timeline duration = source duration / slowFactor', () => {
      const plan = [
        makeEdit({
          editType: 'slowdown',
          sourceStartMs: 0,
          sourceEndMs: 4000,
          outputStartMs: 0,
          outputEndMs: 8000,
          parameters: { speed: 0.5 },
        }),
      ];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      const expectedDurationPx = (4000 / 1000 / 0.5) * PIXELS_PER_SECOND;
      expect(clips[0].duration).toBe(expectedDurationPx);
    });

    it('trim: timeline duration matches output range', () => {
      const plan = [
        makeEdit({
          editType: 'trim',
          sourceStartMs: 5000,
          sourceEndMs: 15000,
          outputStartMs: 0,
          outputEndMs: 8000,
        }),
      ];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].duration).toBe((8000 / 1000) * PIXELS_PER_SECOND);
    });
  });

  describe('rich labels', () => {
    it('label includes edit type and truncated reasoning', () => {
      const plan = [makeEdit({ editType: 'cut', reasoning: 'Keep intro' })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].label).toMatch(/cut.*Keep intro/);
    });

    it('long reasoning is truncated with ellipsis', () => {
      const long = 'A'.repeat(100);
      const plan = [makeEdit({ reasoning: long })];
      const clips = editPlanToTimelineClips(plan, MEDIA_ID);
      expect(clips[0].label).toContain('...');
      expect(clips[0].aiReasoning).toBe(long);
    });
  });
});
