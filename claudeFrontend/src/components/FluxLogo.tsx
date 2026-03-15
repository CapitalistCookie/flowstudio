"use client"

import { cn } from "@/lib/utils"

interface FluxLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
  showText?: boolean
}

export function FluxLogo({ size = "md", className, showText = true }: FluxLogoProps) {
  const sizeMap = {
    sm: { px: 24, cls: "h-6 w-6" },
    md: { px: 32, cls: "h-8 w-8" },
    lg: { px: 48, cls: "h-12 w-12" },
  }
  const { cls } = sizeMap[size]

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(cls, "relative flex-shrink-0")}
        style={{
          filter: 'drop-shadow(0 0 8px rgba(245, 166, 35, 0.3))',
        }}
      >
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
          <defs>
            <radialGradient id="orb-core" cx="40%" cy="38%" r="50%">
              <stop offset="0%" stopColor="#FBC96B" />
              <stop offset="45%" stopColor="#F5A623" />
              <stop offset="85%" stopColor="#D4870A" />
              <stop offset="100%" stopColor="#B87108" />
            </radialGradient>
            <radialGradient id="orb-highlight" cx="35%" cy="30%" r="35%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="rgba(245,166,35,0)" />
              <stop offset="100%" stopColor="rgba(245,166,35,0.12)" />
            </radialGradient>
          </defs>
          {/* Outer glow */}
          <circle cx="24" cy="24" r="22" fill="url(#orb-glow)" />
          {/* Main orb */}
          <circle cx="24" cy="24" r="16" fill="url(#orb-core)" />
          {/* Glass highlight */}
          <circle cx="24" cy="24" r="16" fill="url(#orb-highlight)" />
          {/* Inner refraction arc */}
          <ellipse cx="20" cy="19" rx="7" ry="5" fill="rgba(255,255,255,0.2)" transform="rotate(-15 20 19)" />
        </svg>
      </div>
      {showText && (
        <span className="text-sm font-semibold text-foreground tracking-tight">
          FlowStudio
        </span>
      )}
    </div>
  )
}
