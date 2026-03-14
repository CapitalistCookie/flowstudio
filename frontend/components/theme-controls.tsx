"use client"

import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"

const TOGGLE_ROUTES = ["/dashboard", "/projects", "/studio"]

export function ThemeControls() {
  const pathname = usePathname()

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
