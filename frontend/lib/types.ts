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
