"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Download, X, Film, Monitor, FileImage } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

const formats = [
  { value: "mp4", label: "MP4", icon: Film, desc: "Most compatible" },
  { value: "webm", label: "WebM", icon: Monitor, desc: "Smaller size" },
  { value: "gif", label: "GIF", icon: FileImage, desc: "Social sharing" },
]

const qualities = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4k", label: "4K" },
]

interface ExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const [format, setFormat] = useState("mp4")
  const [quality, setQuality] = useState("1080p")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Demo</DialogTitle>
          <DialogDescription>
            Choose format and quality for your final output.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Format */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {formats.map((f) => {
                const Icon = f.icon
                return (
                  <button
                    key={f.value}
                    onClick={() => setFormat(f.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-md border p-3 text-center transition-colors cursor-pointer ${
                      format === f.value
                        ? "border-[oklch(0.78_0.16_75)] bg-[oklch(0.78_0.16_75_/_0.06)]"
                        : "border-border hover:border-border/80 hover:bg-accent"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${
                      format === f.value ? "text-[oklch(0.78_0.16_75)]" : "text-muted-foreground"
                    }`} />
                    <span className={`text-sm font-medium ${
                      format === f.value ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {f.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{f.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quality */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Quality</Label>
            <div className="grid grid-cols-3 gap-2">
              {qualities.map((q) => (
                <button
                  key={q.value}
                  onClick={() => setQuality(q.value)}
                  className={`rounded-md border p-2.5 text-sm font-mono text-center transition-colors cursor-pointer ${
                    quality === q.value
                      ? "border-[oklch(0.78_0.16_75)] bg-[oklch(0.78_0.16_75_/_0.06)] text-[oklch(0.78_0.16_75)]"
                      : "border-border text-muted-foreground hover:border-border/80 hover:bg-accent"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-2 bg-[oklch(0.78_0.16_75)] hover:bg-[oklch(0.72_0.18_75)] text-[oklch(0.15_0.02_75)]">
            <Download className="h-4 w-4" />
            Export Demo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
