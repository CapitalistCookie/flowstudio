"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { FluxLogo } from "@/components/flux-logo"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

export default function LandingPage() {
  const router = useRouter()
  const mainRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    // Initial load animation
    const ctx = gsap.context(() => {
      // Hero entrance
      gsap.from(heroRef.current, {
        opacity: 0,
        y: 40,
        duration: 1.5,
        ease: "expo.out",
        delay: 0.5
      })

      // Video background parallax/scroll effect
      gsap.to(videoRef.current, {
        scrollTrigger: {
          trigger: mainRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true
        },
        y: 150,
        scale: 1.1
      })

      // Text reveal on scroll
      gsap.to(".scroll-reveal", {
        scrollTrigger: {
          trigger: ".scroll-reveal",
          start: "top 80%",
          end: "top 20%",
          scrub: 1
        },
        opacity: 0.2,
        y: -50
      })
    }, mainRef)

    return () => ctx.revert()
  }, [])

  const goToStart = () => {
    router.push("/sign-in")
  }

  return (
    <div ref={mainRef} className="relative min-h-[200vh] bg-background text-foreground overflow-x-hidden">
      {/* ── Background Elements ── */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <video 
          ref={videoRef}
          src="/assets/12778108_3840_2160_30fps.mp4" 
          autoPlay 
          loop 
          muted 
          playsInline
          className="h-full w-full object-cover opacity-[0.45] brightness-[0.8]"
        />
        {/* Overlays for premium compositing */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
        <div className="grid-texture absolute inset-0 opacity-[0.1]" />
      </div>

      {/* ── Header ── */}
      <nav className="relative z-50 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-8">
        <FluxLogo size="md" />
        <div className="flex items-center gap-6">
          <Button
            size="sm"
            onClick={goToStart}
            className="bg-flux-amber text-flux-charcoal font-bold px-6 border border-flux-amber/20 shadow-[0_0_20px_rgba(245,166,35,0.2)] hover:shadow-[0_0_30px_rgba(245,166,35,0.4)] transition-all hover:scale-105"
          >
            Get Started
          </Button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section ref={heroRef} className="relative z-10 flex flex-col items-center justify-center pt-32 pb-48 text-center min-h-[80vh]">
        <h1 className="max-w-5xl text-7xl font-black leading-[1.05] tracking-tighter sm:text-8xl lg:text-9xl scroll-reveal">
          Your demo. <br />
          <span className="bg-gradient-to-br from-flux-amber via-flux-amber to-flux-amber-muted bg-clip-text text-transparent italic">
            Already done.
          </span>
        </h1>
        
        <p className="mx-auto mt-12 max-w-2xl text-xl leading-relaxed text-muted-foreground/90 sm:text-2xl scroll-reveal">
          Stop fighting with keyframes. Record once and let our AI engine handle the cinematic polish, the zoom, and the flow.
        </p>
        
        <div className="mt-16 flex flex-col items-center justify-center gap-6 sm:flex-row scroll-reveal">
          <Button
            size="xl"
            onClick={goToStart}
            className="group h-18 gap-5 bg-flux-amber px-14 text-2xl font-black text-flux-charcoal transition-all hover:bg-flux-amber hover:scale-[1.05] active:scale-95 shadow-[0_0_50px_rgba(245,166,35,0.4)] hover:shadow-[0_0_70px_rgba(245,166,35,0.6)] border-b-4 border-flux-amber-muted"
          >
            Launch Editor
            <ArrowRight className="h-7 w-7 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </section>

      {/* ── Feature Demo / Below the Fold ── */}
      <section className="relative z-10 px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-flux-amber/30 to-flux-teal/30 blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200" />
            <div className="relative overflow-hidden rounded-[50px] border border-white/10 bg-black/60 backdrop-blur-3xl shadow-2xl">
              <div className="aspect-video w-full">
                <video 
                  src="/assets/12778108_3840_2160_30fps.mp4" 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-12 left-12 right-12 flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className="h-4 w-4 rounded-full bg-flux-amber animate-pulse shadow-[0_0_15px_rgba(245,166,35,1)]" />
                  <span className="text-xl font-bold tracking-[0.3em] uppercase text-white/90 drop-shadow-xl">Live Engine Preview</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer / Info */}
      <footer className="relative z-10 py-20 text-center opacity-40">
        <p className="text-sm font-medium tracking-widest uppercase">FlowStudio © 2026 • Cinematic Production Engine</p>
      </footer>
    </div>
  )
}