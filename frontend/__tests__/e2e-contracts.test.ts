/**
 * E2E Contract Tests
 *
 * Validates that the frontend types, converter logic, and agent hook contracts
 * are consistent with what the gateway produces, ensuring the full pipeline
 * will work end-to-end when services are running.
 */
import { describe, it, expect } from 'vitest';
import type { EditDecision, EditPlanVersion } from '../lib/agent/use-agent';
import { editPlanToTimelineClips } from '../lib/agent/edit-plan-to-timeline';
import { PIXELS_PER_SECOND, DEFAULT_CLIP_TRANSFORM, DEFAULT_CLIP_EFFECTS, type TimelineClip } from '../components/editor-context';
import type { TimelineClipData } from '../lib/types';

const GATEWAY_EDIT_PLAN_RESPONSE = {
  run_id: 'rt-mock',
  status: 'completed',
  project_id: 'test-project',
  edit_plan: [
    {
      editType: 'cut',
      sourceStartMs: 0,
      sourceEndMs: 5000,
      outputStartMs: 0,
      outputEndMs: 5000,
      parameters: {},
      reasoning: 'Opening shot — keep the intro',
    },
    {
      editType: 'speedup',
      sourceStartMs: 5000,
      sourceEndMs: 25000,
      outputStartMs: 5000,
      outputEndMs: 15000,
      parameters: { speed: 2.0 },
      reasoning: 'Speed up the typing section',
    },
    {
      editType: 'zoom',
      sourceStartMs: 25000,
      sourceEndMs: 30000,
      outputStartMs: 15000,
      outputEndMs: 20000,
      parameters: { zoomLevel: 1.5 },
      reasoning: 'Zoom in on the button click',
    },
    {
      editType: 'cut',
      sourceStartMs: 30000,
      sourceEndMs: 60000,
      outputStartMs: 20000,
      outputEndMs: 50000,
      parameters: {},
      reasoning: 'Closing section — keep the outro',
    },
  ],
  intent_graph: [{ intent: 'demo_walkthrough' }],
  narrative_plan: [{ beat: 'intro' }, { beat: 'demo' }, { beat: 'outro' }],
};

const GATEWAY_REPROMPT_RESPONSE = {
  run_id: 'rt-mock-2',
  status: 'completed',
  project_id: 'test-project',
  edit_plan: [
    {
      editType: 'cut',
      sourceStartMs: 0,
      sourceEndMs: 5000,
      outputStartMs: 0,
      outputEndMs: 5000,
      parameters: {},
      reasoning: 'Opening shot — keep the intro',
    },
    {
      editType: 'speedup',
      sourceStartMs: 5000,
      sourceEndMs: 25000,
      outputStartMs: 5000,
      outputEndMs: 15000,
      parameters: { speed: 2.0 },
      reasoning: 'Speed up the typing section',
    },
    {
      editType: 'zoom',
      sourceStartMs: 25000,
      sourceEndMs: 30000,
      outputStartMs: 15000,
      outputEndMs: 20000,
      parameters: { zoomLevel: 2.0 },
      reasoning: 'Zoom in deeper on the button click per user request',
    },
    {
      editType: 'cut',
      sourceStartMs: 30000,
      sourceEndMs: 60000,
      outputStartMs: 20000,
      outputEndMs: 50000,
      parameters: {},
      reasoning: 'Closing section — keep the outro',
    },
  ],
};

describe('E2E Contract: Gateway → Frontend', () => {
  it('gateway edit_plan items parse into valid EditDecision[]', () => {
    const plan: EditDecision[] = GATEWAY_EDIT_PLAN_RESPONSE.edit_plan;

    for (const edit of plan) {
      expect(edit.editType).toBeTruthy();
      expect(edit.sourceStartMs).toBeGreaterThanOrEqual(0);
      expect(edit.sourceEndMs).toBeGreaterThan(edit.sourceStartMs);
      expect(edit.outputStartMs).toBeGreaterThanOrEqual(0);
      expect(edit.outputEndMs).toBeGreaterThan(edit.outputStartMs);
      expect(typeof edit.reasoning).toBe('string');
      expect(typeof edit.parameters).toBe('object');
    }
  });

  it('edit plan converts to valid timeline clips', () => {
    const plan: EditDecision[] = GATEWAY_EDIT_PLAN_RESPONSE.edit_plan;
    const clips = editPlanToTimelineClips(plan, 'media-1');

    expect(clips).toHaveLength(4);

    for (const clip of clips) {
      expect(clip.id).toBeTruthy();
      expect(clip.mediaId).toBe('media-1');
      expect(clip.type).toBe('video');
      expect(clip.startTime).toBeGreaterThanOrEqual(0);
      expect(clip.duration).toBeGreaterThan(0);
      expect(clip.aiEditType).toBeTruthy();
      expect(clip.aiReasoning).toBeTruthy();
    }
  });

  it('timeline clips have continuous output positions (no overlap)', () => {
    const plan: EditDecision[] = GATEWAY_EDIT_PLAN_RESPONSE.edit_plan;
    const clips = editPlanToTimelineClips(plan, 'media-1');

    const sortedByTrack3 = clips.filter((c) => c.trackId === 'Track 3').sort((a, b) => a.startTime - b.startTime);

    for (let i = 1; i < sortedByTrack3.length; i++) {
      const prev = sortedByTrack3[i - 1]!;
      const curr = sortedByTrack3[i]!;
      expect(curr.startTime).toBeGreaterThanOrEqual(prev.startTime + prev.duration);
    }
  });

  it('zoom clip has correct transform scale', () => {
    const plan: EditDecision[] = GATEWAY_EDIT_PLAN_RESPONSE.edit_plan;
    const clips = editPlanToTimelineClips(plan, 'media-1');
    const zoomClip = clips.find((c) => c.aiEditType === 'zoom');

    expect(zoomClip).toBeDefined();
    expect(zoomClip!.transform.scale).toBe(150);
    expect(zoomClip!.trackId).toBe('Track 4');
  });

  it('speedup clip has shorter output duration than source', () => {
    const plan: EditDecision[] = GATEWAY_EDIT_PLAN_RESPONSE.edit_plan;
    const clips = editPlanToTimelineClips(plan, 'media-1');
    const speedClip = clips.find((c) => c.aiEditType === 'speedup');

    expect(speedClip).toBeDefined();
    const outputDurationSec = speedClip!.duration / PIXELS_PER_SECOND;
    expect(outputDurationSec).toBe(10);
  });
});

describe('E2E Contract: Reprompt Flow', () => {
  it('reprompt response produces updated timeline clips', () => {
    const v1Plan: EditDecision[] = GATEWAY_EDIT_PLAN_RESPONSE.edit_plan;
    const v2Plan: EditDecision[] = GATEWAY_REPROMPT_RESPONSE.edit_plan;

    const v1Clips = editPlanToTimelineClips(v1Plan, 'media-1');
    const v2Clips = editPlanToTimelineClips(v2Plan, 'media-1');

    expect(v2Clips).toHaveLength(4);

    const v1Zoom = v1Clips.find((c) => c.aiEditType === 'zoom');
    const v2Zoom = v2Clips.find((c) => c.aiEditType === 'zoom');

    expect(v1Zoom!.transform.scale).toBe(150);
    expect(v2Zoom!.transform.scale).toBe(200);
  });

  it('version history tracks plan changes', () => {
    const history: EditPlanVersion[] = [];

    history.push({
      version: 1,
      plan: GATEWAY_EDIT_PLAN_RESPONSE.edit_plan,
      feedback: 'Initial generation',
      timestamp: new Date().toISOString(),
    });

    history.push({
      version: 2,
      plan: GATEWAY_REPROMPT_RESPONSE.edit_plan,
      feedback: 'Zoom in deeper on the button click',
      timestamp: new Date().toISOString(),
    });

    expect(history).toHaveLength(2);
    expect(history[0].plan[2].parameters.zoomLevel).toBe(1.5);
    expect(history[1].plan[2].parameters.zoomLevel).toBe(2.0);
  });

  it('AI clips replaced correctly on reprompt (manual clips preserved)', () => {
    const manualClip: TimelineClip = {
      id: 'manual-1',
      mediaId: 'media-1',
      trackId: 'Track 3',
      startTime: 0,
      duration: 50,
      mediaOffset: 0,
      label: 'Manual trim',
      type: 'video' as const,
      transform: { ...DEFAULT_CLIP_TRANSFORM },
      effects: { ...DEFAULT_CLIP_EFFECTS },
    };

    const v1AiClips = editPlanToTimelineClips(GATEWAY_EDIT_PLAN_RESPONSE.edit_plan, 'media-1');
    let timeline = [manualClip, ...v1AiClips];

    expect(timeline).toHaveLength(5);

    const v2AiClips = editPlanToTimelineClips(GATEWAY_REPROMPT_RESPONSE.edit_plan, 'media-1');
    const manualOnly = timeline.filter((c) => !c.aiEditType);
    timeline = [...manualOnly, ...v2AiClips];

    expect(timeline).toHaveLength(5);
    expect(timeline.find((c) => c.id === 'manual-1')).toBeDefined();
    expect(timeline.filter((c) => !!c.aiEditType)).toHaveLength(4);
  });
});

describe('E2E Contract: Timeline Clip Serialization', () => {
  it('AI clips serialize to TimelineClipData correctly', () => {
    const clips = editPlanToTimelineClips(GATEWAY_EDIT_PLAN_RESPONSE.edit_plan, 'media-1');

    const serialized: TimelineClipData[] = clips.map((clip) => ({
      id: clip.id,
      mediaId: clip.mediaId,
      trackId: clip.trackId,
      startTime: clip.startTime,
      duration: clip.duration,
      mediaOffset: clip.mediaOffset,
      label: clip.label,
      type: clip.type,
      transform: clip.transform,
      effects: clip.effects,
      aiReasoning: clip.aiReasoning,
      aiEditType: clip.aiEditType,
    }));

    expect(serialized).toHaveLength(4);
    for (const data of serialized) {
      expect(data.aiEditType).toBeTruthy();
      expect(data.aiReasoning).toBeTruthy();
    }

    const json = JSON.stringify(serialized);
    const deserialized = JSON.parse(json);
    expect(deserialized).toHaveLength(4);
    expect(deserialized[2].aiEditType).toBe('zoom');
  });
});
