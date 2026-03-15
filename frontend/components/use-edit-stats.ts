import { useMemo } from "react"
import { useEditor } from "./editor-context"
import { computeEditStats } from "@/lib/compute-edit-stats"

export type { EditStats } from "@/lib/compute-edit-stats"
export { computeEditStats } from "@/lib/compute-edit-stats"

export function useEditStats() {
  const { timelineClips, mediaFiles } = useEditor()
  return useMemo(() => computeEditStats(timelineClips, mediaFiles), [timelineClips, mediaFiles])
}
