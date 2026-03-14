"use client"

import dynamic from "next/dynamic"

const RecordView = dynamic(
  () => import("@/components/record-view").then((mod) => mod.RecordView),
  { ssr: false }
)

export default function RecordPage() {
  return <RecordView />
}
