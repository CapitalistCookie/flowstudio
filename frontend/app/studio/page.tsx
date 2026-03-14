"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { EditorShell } from "@/components/editor-shell"

function StudioContent() {
  const searchParams = useSearchParams()
  const mode = searchParams.get("edits")

  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans overflow-hidden">
      <EditorShell
        projectId="local-project"
        initialEditMode={mode === "tweak" || mode === "auto" ? mode : "none"}
      />
    </div>
  )
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={<div className="h-screen w-full bg-background" />}
    >
      <StudioContent />
    </Suspense>
  )
}
