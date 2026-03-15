/**
 * Core NLE types — framework-agnostic.
 * No React imports allowed in core/.
 */

// NOTE: ProjectMeta and FolderMeta extend/differ from the STDB schema types.
// These remain as frontend-specific types even after SDK migration.

// ─── Timeline ───────────────────────────────────────────────────────

export type TrackType = 'video' | 'audio' | 'overlay' | 'text';

export interface Clip {
  id: string;
  trackId: string;
  /** Source asset ID from SpacetimeDB */
  assetId: string;
  /** Label shown in the timeline */
  label: string;
  /** Start position in timeline (ms) */
  startMs: number;
  /** Duration in timeline (ms) */
  durationMs: number;
  /** Offset into the source media (ms) */
  sourceOffsetMs: number;
  /** Source media total duration (ms) */
  sourceDurationMs: number;
  /** Opacity 0-1 (video/overlay only) */
  opacity: number;
  /** Volume 0-1 (audio only) */
  volume: number;
  /** Playback speed multiplier */
  speed: number;
  /** Whether the clip is locked from editing */
  locked: boolean;
  /** Whether the clip is muted */
  muted: boolean;
  /** Color override for the clip block */
  color?: string;
  /** Link to a signal ID (for signal↔clip linking) */
  signalId?: string;
}

export interface Track {
  id: string;
  type: TrackType;
  label: string;
  /** Track height in pixels */
  height: number;
  /** Whether the track is muted */
  muted: boolean;
  /** Whether the track is locked */
  locked: boolean;
  /** Whether the track is visible */
  visible: boolean;
  /** Order index (0 = topmost) */
  order: number;
}

export interface TimelineState {
  tracks: Track[];
  clips: Clip[];
  /** Current playhead position in ms */
  playheadMs: number;
  /** Total timeline duration in ms */
  durationMs: number;
  /** Zoom level: pixels per millisecond */
  pxPerMs: number;
  /** Horizontal scroll offset in ms */
  scrollOffsetMs: number;
  /** Selected clip IDs */
  selectedClipIds: string[];
  /** In/out mark points for range selection */
  markInMs: number | null;
  markOutMs: number | null;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Snap-to-grid enabled */
  snapEnabled: boolean;
  /** Snap resolution in ms */
  snapResolutionMs: number;
}

// ─── Project ────────────────────────────────────────────────────────

export type ProjectPhase = 'created' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface ProjectMeta {
  id: string;
  name: string;
  status: ProjectPhase;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
  thumbnailUrl?: string;
  starred: boolean;
  folderId: string;
}

export interface FolderMeta {
  id: string;
  name: string;
  ownerId: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// ─── UI ─────────────────────────────────────────────────────────────

export type PanelId = 'assets' | 'preview' | 'properties' | 'timeline';

export interface PanelLayout {
  /** Panel sizes as percentages */
  sizes: number[];
}

export interface UIState {
  /** Which panel is focused */
  activePanel: PanelId | null;
  /** Whether the asset panel is collapsed */
  assetPanelCollapsed: boolean;
  /** Whether the properties panel is collapsed */
  propertiesPanelCollapsed: boolean;
  /** Panel layout sizes */
  layout: PanelLayout;
  /** Currently open modal */
  activeModal: string | null;
  /** Whether preview is fullscreen */
  previewFullscreen: boolean;
}

// ─── Capture ────────────────────────────────────────────────────────

export type CaptureStatus = 'idle' | 'preparing' | 'recording' | 'paused' | 'stopping' | 'done' | 'error';

export interface CaptureState {
  status: CaptureStatus;
  /** Recording duration in ms */
  elapsedMs: number;
  /** MediaStream being captured */
  stream: MediaStream | null;
  /** Recorded blob URL */
  blobUrl: string | null;
  /** Error message if status === 'error' */
  errorMessage: string | null;
  /** Source type */
  sourceType: 'screen' | 'camera' | 'both';
  /** Whether audio is being captured */
  audioEnabled: boolean;
  /** Whether cursor overlay is enabled */
  cursorOverlay: boolean;
  /** Whether typing detection is enabled */
  typingDetection: boolean;
}

// ─── Signals ────────────────────────────────────────────────────────

export interface SignalEntry {
  id: string;
  projectId: string;
  taskId: string;
  signalType: string;
  timestampMs: number;
  durationMs: number;
  confidence: number;
  payload: Record<string, unknown>;
  createdAt: number;
}

// ─── Notifications ──────────────────────────────────────────────────

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  durationMs: number;
}

// ─── Keyboard shortcuts ─────────────────────────────────────────────

export interface ShortcutBinding {
  /** Unique action ID */
  action: string;
  /** Key combo string, e.g. "Ctrl+Z", "Space" */
  keys: string;
  /** Human-readable label */
  label: string;
  /** Whether this shortcut is enabled globally or only in studio */
  scope: 'global' | 'studio';
}
