import { describe, test, expect } from 'vitest';
import {
  IntentGraphOutputSchema,
  NarrativePlanOutputSchema,
  EditPlanOutputSchema,
} from '../src/schemas.js';

// ─── T1.6: IntentGraphOutputSchema valid data ───────────────────────────────
describe('IntentGraphOutputSchema', () => {
  test('accepts valid data', () => {
    const valid = [
      {
        intentId: 'i1',
        parentIntentId: null,
        action: 'click button',
        reasoning: 'user moved cursor to submit area',
        confidence: 0.9,
        startMs: 0,
        endMs: 1000,
        relatedSignalIndices: [0, 1],
      },
    ];
    expect(IntentGraphOutputSchema.safeParse(valid).success).toBe(true);
  });

  // ─── T1.7: Rejects confidence > 1 ──────────────────────────────────────────
  test('rejects confidence > 1', () => {
    const invalid = [
      {
        intentId: 'i1',
        parentIntentId: null,
        action: 'x',
        reasoning: 'y',
        confidence: 1.5,
        startMs: 0,
        endMs: 100,
        relatedSignalIndices: [],
      },
    ];
    expect(IntentGraphOutputSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects negative confidence', () => {
    const invalid = [
      {
        intentId: 'i1',
        parentIntentId: null,
        action: 'x',
        reasoning: 'y',
        confidence: -0.1,
        startMs: 0,
        endMs: 100,
        relatedSignalIndices: [],
      },
    ];
    expect(IntentGraphOutputSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects negative timestamps', () => {
    const invalid = [
      {
        intentId: 'i1',
        parentIntentId: null,
        action: 'x',
        reasoning: 'y',
        confidence: 0.5,
        startMs: -10,
        endMs: 100,
        relatedSignalIndices: [],
      },
    ];
    expect(IntentGraphOutputSchema.safeParse(invalid).success).toBe(false);
  });

  test('accepts empty array', () => {
    expect(IntentGraphOutputSchema.safeParse([]).success).toBe(true);
  });
});

// ─── NarrativePlanOutputSchema ────────────────────────────────────────────────
describe('NarrativePlanOutputSchema', () => {
  test('accepts valid beat', () => {
    const valid = [
      {
        beatIndex: 0,
        beatType: 'setup' as const,
        title: 'Introduction',
        description: 'Setting the scene',
        suggestedDurationMs: 5000,
        startMs: 0,
        endMs: 5000,
        relatedIntentIds: ['i1'],
      },
    ];
    expect(NarrativePlanOutputSchema.safeParse(valid).success).toBe(true);
  });

  test('rejects invalid beatType', () => {
    const invalid = [
      {
        beatIndex: 0,
        beatType: 'invalid_type',
        title: 'x',
        description: 'y',
        suggestedDurationMs: 1000,
        startMs: 0,
        endMs: 1000,
        relatedIntentIds: [],
      },
    ];
    expect(NarrativePlanOutputSchema.safeParse(invalid).success).toBe(false);
  });

  test('accepts all 5 beat types', () => {
    const beatTypes = ['setup', 'action', 'result', 'transition', 'highlight'] as const;
    for (const bt of beatTypes) {
      const data = [
        {
          beatIndex: 0,
          beatType: bt,
          title: 'test',
          description: 'test',
          suggestedDurationMs: 1000,
          startMs: 0,
          endMs: 1000,
          relatedIntentIds: [],
        },
      ];
      expect(NarrativePlanOutputSchema.safeParse(data).success).toBe(true);
    }
  });
});

// ─── EditPlanOutputSchema ─────────────────────────────────────────────────────
describe('EditPlanOutputSchema', () => {
  test('accepts valid edit decision', () => {
    const valid = [
      {
        editType: 'cut' as const,
        sourceStartMs: 0,
        sourceEndMs: 5000,
        outputStartMs: 0,
        outputEndMs: 5000,
        parameters: {},
        reasoning: 'Remove dead time',
      },
    ];
    expect(EditPlanOutputSchema.safeParse(valid).success).toBe(true);
  });

  test('accepts all edit types', () => {
    const editTypes = ['cut', 'trim', 'speedup', 'slowdown', 'zoom', 'pan', 'transition', 'overlay'] as const;
    for (const et of editTypes) {
      const data = [
        {
          editType: et,
          sourceStartMs: 0,
          sourceEndMs: 1000,
          outputStartMs: 0,
          outputEndMs: 1000,
          parameters: {},
          reasoning: 'test',
        },
      ];
      expect(EditPlanOutputSchema.safeParse(data).success).toBe(true);
    }
  });

  test('rejects invalid edit type', () => {
    const invalid = [
      {
        editType: 'delete',
        sourceStartMs: 0,
        sourceEndMs: 1000,
        outputStartMs: 0,
        outputEndMs: 1000,
        parameters: {},
        reasoning: 'test',
      },
    ];
    expect(EditPlanOutputSchema.safeParse(invalid).success).toBe(false);
  });

  test('supports parameters with arbitrary keys', () => {
    const valid = [
      {
        editType: 'zoom' as const,
        sourceStartMs: 5000,
        sourceEndMs: 8000,
        outputStartMs: 3000,
        outputEndMs: 6000,
        parameters: { zoomLevel: 2.0, centerX: 640, centerY: 360 },
        reasoning: 'Zoom into code editor',
      },
    ];
    expect(EditPlanOutputSchema.safeParse(valid).success).toBe(true);
  });
});
