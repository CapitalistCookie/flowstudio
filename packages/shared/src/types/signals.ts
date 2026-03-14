/** Payload for SPEECH_SEGMENT signals */
export interface SpeechSegmentPayload {
  text: string;
  words: Array<{
    word: string;
    startMs: number;
    endMs: number;
    confidence: number;
  }>;
  speakerId: string;
  language: string;
}

/** Payload for SCENE_CHANGE signals */
export interface SceneChangePayload {
  frameIndex: number;
  changeScore: number;   // 0-1, how dramatic the change
  description: string;
  beforeFrameGcs: string;
  afterFrameGcs: string;
}

/** Payload for UI_TRANSITION signals */
export interface UITransitionPayload {
  fromState: string;
  toState: string;
  transitionType: 'navigation' | 'modal' | 'scroll' | 'tab' | 'other';
  affectedRegion: { x: number; y: number; width: number; height: number };
  diffScore: number;
}

/** Payload for CURSOR_MOVEMENT signals */
export interface CursorMovementPayload {
  positions: Array<{ x: number; y: number; timestampMs: number }>;
  movementType: 'linear' | 'erratic' | 'hover' | 'click';
  speed: number;           // pixels per second average
}

/** Payload for TYPING_EVENT signals */
export interface TypingEventPayload {
  detectedText: string;
  inputRegion: { x: number; y: number; width: number; height: number };
  charactersPerSecond: number;
  isPaste: boolean;
}

/** Payload for INTERACTION_CLUSTER signals */
export interface InteractionClusterPayload {
  interactions: Array<{
    type: 'click' | 'type' | 'scroll' | 'hover';
    timestampMs: number;
    position: { x: number; y: number };
  }>;
  intent: string;
  clusterLabel: string;
}

/** Payload for INTENT_NODE signals */
export interface IntentNodePayload {
  intentId: string;
  parentIntentId: string | null;
  action: string;
  reasoning: string;
  confidence: number;
  relatedSignalIds: string[];
}

/** Payload for NARRATIVE_BEAT signals */
export interface NarrativeBeatPayload {
  beatIndex: number;
  beatType: 'setup' | 'action' | 'result' | 'transition' | 'highlight';
  title: string;
  description: string;
  suggestedDurationMs: number;
  relatedIntentIds: string[];
}

/** Payload for EDIT_DECISION signals */
export interface EditDecisionPayload {
  editType: 'cut' | 'trim' | 'speedup' | 'slowdown' | 'zoom' | 'pan' | 'transition' | 'overlay';
  sourceStartMs: number;
  sourceEndMs: number;
  outputStartMs: number;
  outputEndMs: number;
  parameters: Record<string, unknown>;
  reasoning: string;
}

/** Payload for TIMELINE_EVENT signals */
export interface TimelineEventPayload {
  trackIndex: number;
  trackType: 'video' | 'audio' | 'overlay' | 'text';
  clipId: string;
  startMs: number;
  endMs: number;
  sourceAssetId: string;
  effects: Array<{ type: string; params: Record<string, unknown> }>;
}

/** Union of all signal payloads */
export type SignalPayload =
  | SpeechSegmentPayload
  | SceneChangePayload
  | UITransitionPayload
  | CursorMovementPayload
  | TypingEventPayload
  | InteractionClusterPayload
  | IntentNodePayload
  | NarrativeBeatPayload
  | EditDecisionPayload
  | TimelineEventPayload;
