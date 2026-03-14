"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { FluxLogo } from "@/components/flux-logo"

export default function LandingPage() {
  const router = useRouter()

  const goToStart = () => {
    router.push("/sign-in")
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 z-0">
        <img
          src="/assets/image_2026-03-14_010105433_imgupscaler.ai_General_4K.jpg"
          alt="FlowStudio cinematic backdrop"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(245,166,35,0.32),transparent_35%),radial-gradient(circle_at_80%_72%,rgba(255,255,255,0.10),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.18),rgba(0,0,0,0.7))]" />
      </div>

      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-8">
        <FluxLogo size="md" className="brightness-0 invert" />
        <Button
          size="sm"
          onClick={goToStart}
          className="cursor-pointer border border-white/35 bg-white/5 px-5 font-semibold text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition hover:bg-white hover:text-black"
        >
          Get Started
        </Button>
      </header>

      <section className="relative z-20 mx-auto flex min-h-[86vh] w-full max-w-7xl items-end px-6 pb-20 pt-8">
        <div className="max-w-3xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
            AI-native video workflow
          </p>
          <h1 className="text-5xl font-bold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Build polished product demos
            <span className="mt-2 block text-flux-amber">without touching a timeline first.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/85 sm:text-xl">
            Record once. FlowStudio identifies intent, structures the narrative, and assembles a presentable cut you can refine in minutes.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button
              onClick={goToStart}
              className="group h-12 cursor-pointer gap-2 rounded-xl border border-white/35 bg-white/5 px-7 text-base font-bold text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition hover:bg-white hover:text-black"
            >
              Start recording
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>

            <button
              onClick={() => router.push("/projects")}
              className="inline-flex h-12 cursor-pointer items-center rounded-xl border border-white/20 bg-white/8 px-5 text-sm font-semibold text-white/92 transition hover:bg-white/16"
            >
              View projects
            </button>
          </div>

          <div className="mt-10 inline-flex items-center gap-6 rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-sm text-white/75 backdrop-blur-md">
            <span>Capture</span>
            <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
            <span>Auto edit</span>
            <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
            <span>Ship</span>
          </div>
        </div>
      </section>

      <footer className="relative z-20 px-6 pb-8 text-center text-xs font-medium tracking-[0.18em] text-white/45 sm:text-left">
        FLOWSTUDIO 2026
      </footer>
    </main>
  )
}