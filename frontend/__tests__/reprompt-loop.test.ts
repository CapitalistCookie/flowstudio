import { describe, it, expect } from 'vitest';
import type { EditDecision } from '../lib/agent/use-agent';
import { editPlanToTimelineClips } from '../lib/agent/edit-plan-to-timeline';
import { PIXELS_PER_SECOND, type TimelineClip } from '../components/editor-context';

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

describe('Reprompt Loop: Version Management', () => {
  it('each plan version produces distinct clip IDs', () => {
    const planV1 = [makeEdit({ reasoning: 'v1 edit' })];
    const planV2 = [makeEdit({ reasoning: 'v2 edit' })];

    const clipsV1 = editPlanToTimelineClips(planV1, MEDIA_ID);
    const clipsV2 = editPlanToTimelineClips(planV2, MEDIA_ID);

    expect(clipsV1[0].id).not.toBe(clipsV2[0].id);
  });

  it('AI clips can be filtered from manual clips by aiEditType', () => {
    const plan = [makeEdit(), makeEdit({ editType: 'zoom', parameters: { zoomLevel: 1.5 } })];
    const aiClips = editPlanToTimelineClips(plan, MEDIA_ID);

    const manualClip: TimelineClip = {
      id: 'manual-clip',
      mediaId: MEDIA_ID,
      trackId: 'Track 3',
      startTime: 0,
      duration: 100,
      mediaOffset: 0,
      label: 'Manual',
      type: 'video' as const,
      transform: { positionX: 0, positionY: 0, scale: 100, opacity: 100 },
      effects: { preset: 'none' as const, blur: 0, brightness: 100, contrast: 100, saturate: 100, hueRotate: 0 },
    };

    const allClips = [manualClip, ...aiClips];
    const manualOnly = allClips.filter((c) => !c.aiEditType);
    const aiOnly = allClips.filter((c) => !!c.aiEditType);

    expect(manualOnly).toHaveLength(1);
    expect(manualOnly[0].id).toBe('manual-clip');
    expect(aiOnly).toHaveLength(2);
  });

  it('replacing AI clips preserves manual clips', () => {
    const manualClips: TimelineClip[] = [
      {
        id: 'manual-1',
        mediaId: MEDIA_ID,
        trackId: 'Track 3',
        startTime: 0,
        duration: 50,
        mediaOffset: 0,
        label: 'Manual',
        type: 'video' as const,
        transform: { positionX: 0, positionY: 0, scale: 100, opacity: 100 },
        effects: { preset: 'none' as const, blur: 0, brightness: 100, contrast: 100, saturate: 100, hueRotate: 0 },
      },
    ];

    const v1Clips = editPlanToTimelineClips([makeEdit({ reasoning: 'v1' })], MEDIA_ID);
    const allV1 = [...manualClips, ...v1Clips];

    const v2Clips = editPlanToTimelineClips([makeEdit({ reasoning: 'v2' }), makeEdit({ editType: 'zoom', reasoning: 'zoom v2', parameters: { zoomLevel: 2 } })], MEDIA_ID);
    const withoutOldAi = allV1.filter((c) => !c.aiEditType);
    const allV2 = [...withoutOldAi, ...v2Clips];

    expect(allV2).toHaveLength(3);
    expect(allV2.find((c) => c.id === 'manual-1')).toBeDefined();
    expect(allV2.filter((c) => !!c.aiEditType)).toHaveLength(2);
  });
});

describe('Reprompt Loop: Edit Type Variety', () => {
  it('speedup edits have shorter output duration than source', () => {
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
    const outputDurationPx = clips[0].duration;
    const sourceDurationPx = (20000 / 1000) * PIXELS_PER_SECOND;
    expect(outputDurationPx).toBeLessThan(sourceDurationPx);
    expect(clips[0].aiEditType).toBe('speedup');
  });

  it('transition edits are placed on Track 1', () => {
    const plan = [makeEdit({ editType: 'transition' })];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].trackId).toBe('Track 1');
  });

  it('overlay edits are placed on Track 4 (higher track)', () => {
    const plan = [makeEdit({ editType: 'overlay' })];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].trackId).toBe('Track 4');
  });

  it('zoom and pan edits go to Track 4 for layering', () => {
    const plan = [
      makeEdit({ editType: 'zoom', parameters: { zoomLevel: 1.8 } }),
      makeEdit({ editType: 'pan', parameters: { panX: 100, panY: -50 } }),
    ];
    const clips = editPlanToTimelineClips(plan, MEDIA_ID);
    expect(clips[0].trackId).toBe('Track 4');
    expect(clips[1].trackId).toBe('Track 4');
  });
});

describe('Reprompt Loop: summarizeEditPlan output shape', () => {
  it('multi-edit plan produces readable summary', () => {
    const plan: EditDecision[] = [
      makeEdit({ editType: 'cut', outputStartMs: 0, outputEndMs: 5000 }),
      makeEdit({ editType: 'speedup', outputStartMs: 5000, outputEndMs: 15000 }),
      makeEdit({ editType: 'zoom', outputStartMs: 15000, outputEndMs: 20000 }),
    ];

    const editTypes = plan.reduce(
      (acc, e) => {
        acc[e.editType] = (acc[e.editType] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    expect(editTypes.cut).toBe(1);
    expect(editTypes.speedup).toBe(1);
    expect(editTypes.zoom).toBe(1);
    expect(Object.keys(editTypes)).toHaveLength(3);

    const totalDuration = plan.reduce((sum, e) => sum + (e.outputEndMs - e.outputStartMs), 0) / 1000;
    expect(totalDuration).toBe(20);
  });
});
