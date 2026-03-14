"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface FluxLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

export function FluxLogo({ size = "md", className }: FluxLogoProps) {
  const sizes = {
    sm: 156,
    md: 132,
    lg: 176,
  }

  return (
    <div className={cn("flex items-center justify-center leading-none", className)}>
      <Image
        src="/branding/flowstudio-logo-v3.png"
        alt="FlowStudio"
        width={sizes[size]}
        height={sizes[size]}
        className="block object-contain align-middle dark:hidden"
        priority={size !== "sm"}
      />
      <Image
        src="/branding/flowstudio-logo-dark-mode.png"
        alt="FlowStudio"
        width={sizes[size]}
        height={sizes[size]}
        className="hidden object-contain align-middle dark:block"
        priority={size !== "sm"}
      />
    </div>
  )
}
