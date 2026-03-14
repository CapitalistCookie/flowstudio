"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={cn("h-10 w-[132px] rounded-full border border-border/70 bg-card/70", className)} />
  }

  const isDark = resolvedTheme === "dark"

  return (
    <div
      className={cn(
        "relative inline-grid h-10 grid-cols-2 rounded-full border border-border/70 bg-card/80 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-md",
        className
      )}
      role="radiogroup"
      aria-label="Theme"
    >
      <motion.div
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-gradient-to-r from-flux-amber/85 to-[#E59219] shadow-[0_6px_18px_rgba(245,166,35,0.35)]"
        animate={{ x: isDark ? "100%" : "0%" }}
        transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }}
      />

      <button
        type="button"
        role="radio"
        aria-checked={!isDark}
        onClick={() => setTheme("light")}
        className={cn(
          "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition",
          isDark ? "text-muted-foreground" : "text-[oklch(0.17_0.02_75)]"
        )}
      >
        <Sun className="h-3.5 w-3.5" />
        Light
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={isDark}
        onClick={() => setTheme("dark")}
        className={cn(
          "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition",
          isDark ? "text-[oklch(0.17_0.02_75)]" : "text-muted-foreground"
        )}
      >
        <Moon className="h-3.5 w-3.5" />
        Dark
      </button>
    </div>
  )
}
