"use client"

import { EditorShell } from "@/components/editor-shell"

export default function StudioPage() {
  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans overflow-hidden">
      <EditorShell projectId="local-project" />
    </div>
  )
}
