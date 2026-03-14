"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { ThemeToggle } from "@/components/theme-toggle"

const TOGGLE_ROUTES = ["/dashboard", "/projects", "/studio"]

export function ThemeControls() {
  const pathname = usePathname()
  const { setTheme } = useTheme()

  useEffect(() => {
    // Always boot the app into light mode on launch.
    setTheme("light")
  }, [setTheme])

  const showToggle = TOGGLE_ROUTES.some((route) => pathname.startsWith(route))

  if (!showToggle) {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-[120]">
      <ThemeToggle />
    </div>
  )
}
