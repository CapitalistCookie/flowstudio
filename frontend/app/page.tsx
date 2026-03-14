"use client"

import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FluxLogo } from "@/components/flux-logo"
import { GlassCard } from "@/components/ui/glass-card"

export default function LandingPage() {
  const router = useRouter()

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-[#070605] overflow-hidden selection:bg-[#F5A623]/30">
      
      {/* Background Cinematic Atmosphere */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#F5A623]/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#1A9E8F]/5 blur-[150px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,transparent_0%,#070605_80%)]" />
      </div>

      {/* Navigation */}
      <nav className="absolute top-0 w-full flex items-center justify-between px-8 py-6 lg:px-16 z-50">
        <FluxLogo />
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => router.push("/sign-in")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign in
        </Button>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-4xl px-6 flex flex-col items-center text-center">
        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          <GlassCard className="p-1 px-4 mb-8 inline-flex items-center gap-2 border-[#F5A623]/20 bg-[#F5A623]/5">
            <Sparkles className="h-3.5 w-3.5 text-[#F5A623]" />
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#F5A623]/80">
              FlowStudio GenAI Submission
            </span>
          </GlassCard>
        </motion.div>

        <motion.h1 
          className="text-6xl md:text-8xl font-medium tracking-tight text-white mb-6 leading-[0.95]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Your demo.<br />
          <span className="text-[#8A8780]">Already done.</span>
        </motion.h1>

        <motion.p 
          className="text-lg md:text-xl text-[#8A8780] max-w-lg mb-12 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          Record once. Our AI analyzes your intent, removes dead air, and schedules cinematic zooms automatically.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <Button
            size="lg"
            className="h-14 px-10 text-lg rounded-full bg-white text-black hover:bg-[#F5A623] hover:text-black transition-all duration-500 group relative overflow-hidden"
            onClick={() => router.push("/sign-in")}
          >
            <span className="relative z-10 flex items-center gap-3">
              Get Started
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          </Button>
        </motion.div>

        {/* Ambient Glow behind button */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[-100px] w-64 h-32 bg-[#F5A623]/10 blur-[60px] rounded-full pointer-events-none" />
      </main>

      {/* Footer Branding */}
      <footer className="absolute bottom-8 text-[11px] font-mono text-[#4A4740] tracking-widest uppercase">
        Cinematic Demo Intelligence · 2026
      </footer>

      {/* Mouse Follow Light Effect */}
      <div 
        className="pointer-events-none fixed inset-0 z-30 transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(245, 166, 35, 0.03), transparent 80%)`
        }}
      />
    </div>
  )
}
