import { z } from 'zod';

/** Schema for intent graph worker output */
export const IntentGraphOutputSchema = z.array(z.object({
  intentId: z.string().max(200),
  parentIntentId: z.string().max(200).nullable(),
  action: z.string().max(500),
  reasoning: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  relatedSignalIndices: z.array(z.number().nonnegative()),
}));

export type IntentGraphOutput = z.infer<typeof IntentGraphOutputSchema>;

/** Schema for narrative planner worker output */
export const NarrativePlanOutputSchema = z.array(z.object({
  beatIndex: z.number().nonnegative(),
  beatType: z.enum(['setup', 'action', 'result', 'transition', 'highlight']),
  title: z.string().max(200),
  description: z.string().max(1000),
  suggestedDurationMs: z.number().nonnegative(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  relatedIntentIds: z.array(z.string().max(200)),
}));

export type NarrativePlanOutput = z.infer<typeof NarrativePlanOutputSchema>;

/** Schema for edit planner worker output */
export const EditPlanOutputSchema = z.array(z.object({
  editType: z.enum(['cut', 'trim', 'speedup', 'slowdown', 'zoom', 'pan', 'transition', 'overlay']),
  sourceStartMs: z.number().nonnegative(),
  sourceEndMs: z.number().nonnegative(),
  outputStartMs: z.number().nonnegative(),
  outputEndMs: z.number().nonnegative(),
  parameters: z.record(z.unknown()),
  reasoning: z.string().max(1000),
}));

export type EditPlanOutput = z.infer<typeof EditPlanOutputSchema>;

/** Map of worker type to its output schema */
export const WORKER_SCHEMAS = {
  'intent-graph': IntentGraphOutputSchema,
  'narrative-planner': NarrativePlanOutputSchema,
  'edit-planner': EditPlanOutputSchema,
} as const;

export type WorkerType = keyof typeof WORKER_SCHEMAS;
