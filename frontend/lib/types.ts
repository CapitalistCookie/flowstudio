export interface ClipTransform {
  positionX: number
  positionY: number
  scale: number
  opacity: number
}

export type EffectPreset = "none" | "grayscale" | "sepia" | "invert" | "glitch" | "vhs" | "ascii" | "cyberpunk" | "noir"

export interface ClipEffects {
  preset: EffectPreset
  blur: number        // 0-20px
  brightness: number  // 0-200%
  contrast: number    // 0-200%
  saturate: number    // 0-200%
  hueRotate: number   // 0-360deg
  chromakey?: {
    enabled: boolean
    keyColor: string      // Hex color to remove (e.g., "#00FF00")
    similarity: number    // 0-1: How close colors must be to be removed
    smoothness: number    // 0-1: Edge softness
    spill: number         // 0-1: Spill suppression strength
  }
}

export interface TimelineClipData {
  id: string
  mediaId: string
  trackId: string
  startTime: number
  duration: number
  mediaOffset?: number 
  label: string
  type: "video" | "audio"
  transform?: ClipTransform 
  effects?: ClipEffects
  aiReasoning?: string
  aiEditType?: string
}

export interface Caption {
  word: string
  start: number  // seconds into source media
  end: number    // seconds into source media
}

export interface MediaFileData {
  id: string
  name: string
  duration: string
  durationSeconds: number
  type: string
  storagePath: string 
  storageUrl: string 
  thumbnail: string | null 
  captions?: Caption[] 
  twelveLabsVideoId?: string 
  twelveLabsIndexId?: string 
  twelveLabsStatus?: "pending" | "indexing" | "ready" | "failed"
}

// FluxStudio data contracts

export type ProjectStatus = "recording" | "analyzing" | "review" | "ready" | "exported"

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  resolution: string
  frame_rate: number
  duration: string
  thumbnail: string | null
  confidence: number
  created_at: string
  updated_at: string
  category: string
}

export type TimelineEventType = "chapter" | "cut" | "zoom" | "caption" | "highlight"

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  label: string
  startTime: number
  endTime: number
}

export interface TimelineTrack {
  id: string
  type: "video" | "audio" | "caption" | "effects"
  label: string
  events: TimelineEvent[]
}

export interface MediaAsset {
  id: string
  filename: string
  type: "video" | "audio" | "subtitle" | "image"
  size: string
  duration?: string
}

export interface IntentStream {
  id: string
  name: string
  description: string
  icon: string
  eventCount: number
}
