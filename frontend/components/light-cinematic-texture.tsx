import { cn } from "@/lib/utils"

interface LightCinematicTextureProps {
  className?: string
}

export function LightCinematicTexture({ className }: LightCinematicTextureProps) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(26,158,143,0.18)_0%,rgba(26,158,143,0)_26%,rgba(245,166,35,0.16)_64%,rgba(245,166,35,0)_100%)] dark:bg-[linear-gradient(145deg,rgba(26,158,143,0.1)_0%,rgba(26,158,143,0)_26%,rgba(245,166,35,0.1)_64%,rgba(245,166,35,0)_100%)]" />
      <div className="absolute -left-[20%] top-[8%] h-56 w-[78%] rotate-[-11deg] bg-[linear-gradient(90deg,rgba(26,158,143,0),rgba(26,158,143,0.35),rgba(26,158,143,0))] dark:bg-[linear-gradient(90deg,rgba(26,158,143,0),rgba(26,158,143,0.22),rgba(26,158,143,0))] blur-3xl" />
      <div className="absolute right-[-24%] top-[30%] h-56 w-[76%] rotate-[13deg] bg-[linear-gradient(90deg,rgba(245,166,35,0),rgba(245,166,35,0.34),rgba(245,166,35,0))] dark:bg-[linear-gradient(90deg,rgba(245,166,35,0),rgba(245,166,35,0.24),rgba(245,166,35,0))] blur-3xl" />
      <div className="absolute inset-0 opacity-[0.18] dark:opacity-[0.1] [background:repeating-linear-gradient(112deg,rgba(245,166,35,0.22)_0px,rgba(245,166,35,0.22)_2px,transparent_2px,transparent_28px)]" />
      <div className="absolute inset-0 opacity-[0.1] dark:opacity-[0.06] [background:repeating-linear-gradient(74deg,rgba(26,158,143,0.22)_0px,rgba(26,158,143,0.22)_1px,transparent_1px,transparent_24px)]" />
    </div>
  )
}
