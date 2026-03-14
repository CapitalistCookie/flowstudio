"use client"

import dynamic from "next/dynamic"

const DashboardView = dynamic(
  () => import("@/components/dashboard-view").then((mod) => mod.DashboardView),
  { ssr: false }
)

export default function DashboardPage() {
  return <DashboardView />
}
