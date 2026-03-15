/** Task types corresponding to each worker in the pipeline */
export enum TaskType {
  AUDIO_EXTRACT = 'AUDIO_EXTRACT',
  VIDEO_SAMPLE = 'VIDEO_SAMPLE',
  CURSOR_PROCESS = 'CURSOR_PROCESS',
  TYPING_DETECT = 'TYPING_DETECT',
  SPEECH_TRANSCRIPTION = 'SPEECH_TRANSCRIPTION',
  VIDEO_UNDERSTANDING = 'VIDEO_UNDERSTANDING',
  UI_CHANGE_DETECT = 'UI_CHANGE_DETECT',
  INTERACTION_PATTERN = 'INTERACTION_PATTERN',
  INTENT_GRAPH = 'INTENT_GRAPH',
  NARRATIVE_PLAN = 'NARRATIVE_PLAN',
  EDIT_PLAN = 'EDIT_PLAN',
  TIMELINE_BUILD = 'TIMELINE_BUILD',
  RENDER = 'RENDER',
}

/** Task status lifecycle */
export enum TaskStatus {
  PENDING = 'pending',
  CLAIMED = 'claimed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STALE = 'stale',
}

/** Project lifecycle status */
export enum ProjectStatus {
  CREATED = 'created',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

/** Asset types */
export enum AssetType {
  SOURCE_VIDEO = 'source_video',
  AUDIO_TRACK = 'audio_track',
  FRAME_SAMPLE = 'frame_sample',
  THUMBNAIL = 'thumbnail',
  RENDERED_VIDEO = 'rendered_video',
  TRANSCRIPT = 'transcript',
}

/** Colors for presence avatars */
export const PRESENCE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
] as const;

/** Signal types produced by workers */
export enum SignalType {
  SPEECH_SEGMENT = 'speech_segment',
  SCENE_CHANGE = 'scene_change',
  UI_TRANSITION = 'ui_transition',
  CURSOR_MOVEMENT = 'cursor_movement',
  TYPING_EVENT = 'typing_event',
  INTERACTION_CLUSTER = 'interaction_cluster',
  INTENT_NODE = 'intent_node',
  NARRATIVE_BEAT = 'narrative_beat',
  EDIT_DECISION = 'edit_decision',
  TIMELINE_EVENT = 'timeline_event',
}
