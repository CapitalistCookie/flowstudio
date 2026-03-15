import { PIXELS_PER_SECOND, type TimelineClip, type MediaFile } from "@/components/editor-context"

export interface EditStats {
  outputSeconds: number
  secondsRemoved: number
  editCount: number
}

export function computeEditStats(
  timelineClips: TimelineClip[],
  mediaFiles: MediaFile[]
): EditStats {
  const videoClips = timelineClips.filter((c) => c.type === "video")

  const outputSeconds = videoClips.reduce((max, clip) => {
    const clipEnd = (clip.startTime + clip.duration) / PIXELS_PER_SECOND
    return Math.max(max, clipEnd)
  }, 0)

  const secondsRemoved = mediaFiles
    .filter((m) => m.type.startsWith("video"))
    .reduce((total, m) => {
      const clipsForMedia = videoClips.filter((c) => c.mediaId === m.id)
      const usedFromFile = clipsForMedia.reduce(
        (s, c) => s + c.duration / PIXELS_PER_SECOND, 0
      )
      return total + Math.max(0, m.durationSeconds - usedFromFile)
    }, 0)

  return {
    outputSeconds,
    secondsRemoved,
    editCount: videoClips.length,
  }
}
