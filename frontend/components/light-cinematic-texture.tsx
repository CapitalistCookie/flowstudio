import { cn } from "@/lib/utils"

interface LightCinematicTextureProps {
  className?: string
}

export function LightCinematicTexture({ className }: LightCinematicTextureProps) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(26,158,143,0.12)_0%,rgba(26,158,143,0)_26%,rgba(245,166,35,0.11)_64%,rgba(245,166,35,0)_100%)]" />
      <div className="absolute -left-[20%] top-[8%] h-56 w-[78%] rotate-[-11deg] bg-[linear-gradient(90deg,rgba(26,158,143,0),rgba(26,158,143,0.30),rgba(26,158,143,0))] blur-3xl" />
      <div className="absolute right-[-24%] top-[30%] h-56 w-[76%] rotate-[13deg] bg-[linear-gradient(90deg,rgba(245,166,35,0),rgba(245,166,35,0.32),rgba(245,166,35,0))] blur-3xl" />
      <div className="absolute inset-0 opacity-[0.14] [background:repeating-linear-gradient(112deg,rgba(245,166,35,0.22)_0px,rgba(245,166,35,0.22)_2px,transparent_2px,transparent_28px)]" />
      <div className="absolute inset-0 opacity-[0.08] [background:repeating-linear-gradient(74deg,rgba(26,158,143,0.22)_0px,rgba(26,158,143,0.22)_1px,transparent_1px,transparent_24px)]" />
    </div>
  )
}
