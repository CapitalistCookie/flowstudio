import { TaskType } from './types/enums.js';

/** Max retries for failed tasks */
export const MAX_TASK_RETRIES = 3;

/** Watchdog interval in seconds */
export const WATCHDOG_INTERVAL_SECS = 30;

/** How long before a claimed task is considered stale (ms) */
export const STALE_TASK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** GCS path prefix for project assets */
export const GCS_PATH_PREFIX = 'projects';

/** Default worker concurrency */
export const DEFAULT_WORKER_CONCURRENCY = 2;

/** Task chaining DAG — maps a completed task type to the next tasks to create.
 *  When ALL dependencies for a downstream task are met, it gets created. */
export const TASK_CHAIN_DAG: Record<TaskType, TaskType[]> = {
  [TaskType.AUDIO_EXTRACT]: [TaskType.SPEECH_TRANSCRIPTION],
  [TaskType.VIDEO_SAMPLE]: [TaskType.VIDEO_UNDERSTANDING, TaskType.UI_CHANGE_DETECT],
  [TaskType.CURSOR_PROCESS]: [TaskType.INTERACTION_PATTERN],
  [TaskType.TYPING_DETECT]: [TaskType.INTERACTION_PATTERN],
  [TaskType.SPEECH_TRANSCRIPTION]: [TaskType.INTENT_GRAPH],
  [TaskType.VIDEO_UNDERSTANDING]: [TaskType.INTENT_GRAPH],
  [TaskType.UI_CHANGE_DETECT]: [TaskType.INTENT_GRAPH],
  [TaskType.INTERACTION_PATTERN]: [TaskType.INTENT_GRAPH],
  [TaskType.INTENT_GRAPH]: [TaskType.NARRATIVE_PLAN],
  [TaskType.NARRATIVE_PLAN]: [TaskType.EDIT_PLAN],
  [TaskType.EDIT_PLAN]: [TaskType.TIMELINE_BUILD],
  [TaskType.TIMELINE_BUILD]: [TaskType.RENDER],
  [TaskType.RENDER]: [],
};

/** Reverse map: what tasks must complete before a task type can start */
export const TASK_DEPENDENCIES: Record<TaskType, TaskType[]> = {
  [TaskType.AUDIO_EXTRACT]: [],
  [TaskType.VIDEO_SAMPLE]: [],
  [TaskType.CURSOR_PROCESS]: [],
  [TaskType.TYPING_DETECT]: [],
  [TaskType.SPEECH_TRANSCRIPTION]: [TaskType.AUDIO_EXTRACT],
  [TaskType.VIDEO_UNDERSTANDING]: [TaskType.VIDEO_SAMPLE],
  [TaskType.UI_CHANGE_DETECT]: [TaskType.VIDEO_SAMPLE],
  [TaskType.INTERACTION_PATTERN]: [TaskType.CURSOR_PROCESS, TaskType.TYPING_DETECT],
  [TaskType.INTENT_GRAPH]: [
    TaskType.SPEECH_TRANSCRIPTION,
    TaskType.VIDEO_UNDERSTANDING,
    TaskType.UI_CHANGE_DETECT,
    TaskType.INTERACTION_PATTERN,
  ],
  [TaskType.NARRATIVE_PLAN]: [TaskType.INTENT_GRAPH],
  [TaskType.EDIT_PLAN]: [TaskType.NARRATIVE_PLAN],
  [TaskType.TIMELINE_BUILD]: [TaskType.EDIT_PLAN],
  [TaskType.RENDER]: [TaskType.TIMELINE_BUILD],
};

/** Initial task types created when a project starts processing */
export const INITIAL_TASK_TYPES: TaskType[] = [
  TaskType.AUDIO_EXTRACT,
  TaskType.VIDEO_SAMPLE,
  TaskType.CURSOR_PROCESS,
  TaskType.TYPING_DETECT,
];
