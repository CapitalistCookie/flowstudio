"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface FluxLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

export function FluxLogo({ size = "md", className }: FluxLogoProps) {
  const sizes = {
    sm: 80,
    md: 120,
    lg: 160,
  }

  return (
    <div className={cn("flex items-center", className)}>
      <Image
        src="/branding/flowstudio-logo-v3.png"
        alt="FlowStudio"
        width={sizes[size]}
        height={sizes[size]}
        className="object-contain"
        priority={size !== "sm"}
      />
    </div>
  )
}
