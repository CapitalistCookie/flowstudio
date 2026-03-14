import React from "react"
import { cn } from "@/lib/utils"

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  glowColor?: string
  intensity?: "low" | "medium" | "high"
}

export function GlassCard({ 
  children, 
  className, 
  glowColor = "rgba(245, 166, 35, 0.15)",
  intensity = "medium",
  ...props 
}: GlassCardProps) {
  const intensityMap = {
    low: "before:opacity-30",
    medium: "before:opacity-50",
    high: "before:opacity-80"
  }

  return (
    <div 
      className={cn(
        "relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden group",
        "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:pointer-events-none",
        intensityMap[intensity],
        className
      )}
      {...props}
    >
      {/* Glow depth */}
      <div 
        className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${glowColor}, transparent 40%)`,
        }}
      />
      
      {/* Content wrapper */}
      <div className="relative z-10">
        {children}
      </div>
      
      {/* Inner subtle glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] to-transparent pointer-events-none" />
    </div>
  )
}
