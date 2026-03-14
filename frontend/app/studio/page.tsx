"use client"

import dynamic from "next/dynamic"

const EditorShell = dynamic(
  () => import("@/components/editor-shell").then((mod) => mod.EditorShell),
  { ssr: false }
)

export default function StudioPage() {
  return <EditorShell />
}
