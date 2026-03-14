"use client"

import dynamic from "next/dynamic"

const ProjectsView = dynamic(
  () => import("@/components/projects-view").then((mod) => mod.ProjectsView),
  { ssr: false }
)

export default function ProjectsPage() {
  return <ProjectsView />
}
