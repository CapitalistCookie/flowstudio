export interface PromptTemplate {
  name: string;
  description: string;
  systemPrompt: string;
  userTemplate: string;
  defaultMaxTokens: number;
}

export const PROMPT_REGISTRY: Record<string, PromptTemplate> = {
  'intent-graph': {
    name: 'Intent Graph',
    description: 'Analyzes upstream signals (speech, scene, UI, interactions) to build a hierarchical intent graph of user actions.',
    systemPrompt: `You are analyzing a screen recording of someone using software. Based on signals extracted from the video, build an intent graph — a hierarchy of what the user was trying to accomplish.

Build a tree of intents where:
- Root intents are high-level goals (e.g., "Writing a blog post", "Debugging code")
- Child intents are sub-tasks (e.g., "Formatting text", "Searching for function")
- Each intent references the signal timestamps that support it

Respond with a JSON array of objects:
{
  "intentId": "string",
  "parentIntentId": "string | null",
  "action": "what the user is doing",
  "reasoning": "why you think this",
  "confidence": 0.0-1.0,
  "startMs": number,
  "endMs": number,
  "relatedSignalIndices": [number]
}`,
    userTemplate: '{{DATA}}',
    defaultMaxTokens: 4096,
  },

  'narrative-planner': {
    name: 'Narrative Planner',
    description: 'Converts an intent graph into a sequence of narrative beats for a compelling edited video.',
    systemPrompt: `You are a video editor creating a narrative structure for an edited video from a screen recording.

Create a sequence of narrative beats that would make a compelling, clear edited video:
- Each beat is a segment of the final video
- Beats should flow logically (setup → action → result)
- Remove dead time, repetition, and errors
- Highlight key moments and achievements

Respond with a JSON array:
{
  "beatIndex": number,
  "beatType": "setup" | "action" | "result" | "transition" | "highlight",
  "title": "short title",
  "description": "what happens in this beat",
  "suggestedDurationMs": number,
  "startMs": number,
  "endMs": number,
  "relatedIntentIds": ["string"]
}`,
    userTemplate: '{{DATA}}',
    defaultMaxTokens: 4096,
  },

  'edit-planner': {
    name: 'Edit Planner',
    description: 'Converts narrative beats into specific video edit decisions (cuts, speed changes, zooms, transitions).',
    systemPrompt: `You are a professional video editor. Convert these narrative beats into specific edit decisions.

For each beat, decide specific edits:
- Cut points (where to start/end clips)
- Speed changes (speedup boring parts, slow important parts)
- Zoom/pan on important UI elements
- Transitions between beats

Respond with a JSON array:
{
  "editType": "cut" | "trim" | "speedup" | "slowdown" | "zoom" | "pan" | "transition" | "overlay",
  "sourceStartMs": number,
  "sourceEndMs": number,
  "outputStartMs": number,
  "outputEndMs": number,
  "parameters": { speed?: number, zoomLevel?: number, transitionType?: string, ... },
  "reasoning": "why this edit"
}`,
    userTemplate: '{{DATA}}',
    defaultMaxTokens: 4096,
  },
};
