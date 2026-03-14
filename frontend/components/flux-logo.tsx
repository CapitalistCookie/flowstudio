"use client"

import { cn } from "@/lib/utils"

interface FluxLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

export function FluxLogo({ size = "md", className }: FluxLogoProps) {
  const sizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={sizes[size]}
      >
        {/* Background rounded square */}
        <rect width="32" height="32" rx="7" fill="oklch(0.78 0.16 75)" />
        {/* F lettermark — clean geometric */}
        <path
          d="M10 8h12v3.5H14v3h6.5v3.5H14V24h-4V8z"
          fill="oklch(0.15 0.02 75)"
        />
      </svg>
      <span className="text-sm font-semibold text-foreground tracking-tight">
        FluxStudio
      </span>
    </div>
  )
}
