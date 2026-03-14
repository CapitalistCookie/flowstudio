"use client"

import { useRouter } from "next/navigation"
import { motion, useScroll, useTransform } from "framer-motion"
import { ArrowRight, ArrowUpRight, Play, Zap, Scissors, Mic2, Captions, Eye, Clock3 } from "lucide-react"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { FluxLogo } from "@/components/flux-logo"

function FeatureCard({ title, description, index }: { title: string; description: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="group relative border border-border bg-card p-7 transition-all duration-200 hover:border-[#F5A623]/30 hover:shadow-sm"
    >
      <span className="font-mono text-[11px] text-muted-foreground tracking-widest">0{index + 1}</span>
      <h3 className="mt-4 text-base font-medium tracking-tight text-foreground">{title}</h3>
      <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  )
}

function FakeEditorPreview() {
  const tracks = [
    { label: "VIDEO", color: "#F5A623", segments: [{ left: "0%", width: "16%", label: "Opening" }, { left: "17%", width: "22%", label: "Overview" }, { left: "40%", width: "32%", label: "Feature Demo" }, { left: "73%", width: "18%", label: "CTA" }] },
    { label: "EFFECTS", color: "#1A9E8F", segments: [{ left: "20%", width: "9%", label: "↗ zoom" }, { left: "50%", width: "11%", label: "↗ zoom" }, { left: "34%", width: "5%", label: "✂ cut" }] },
    { label: "CAPTIONS", color: "#8A8780", segments: [{ left: "0%", width: "91%", label: "Auto-captions" }] },
  ]

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      {/* Fake top bar */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
            <div className="h-2.5 w-2.5 rounded-full bg-primary/40" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#1A9E8F]/40" />
          </div>
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">Launch Video v4 · 1920×1080 · 30fps</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Saved</div>
          <div className="rounded bg-[#F5A623] px-3 py-1 text-[11px] font-semibold text-[#1A1916]">Export</div>
        </div>
      </div>

      {/* Fake video preview area */}
      <div className="flex border-b border-border">
        {/* Left media panel */}
        <div className="w-36 shrink-0 border-r border-border bg-secondary/30 p-3">
          <div className="mb-2 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Media</div>
          {["recording_07.webm", "narration.wav", "captions.srt"].map((f, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-1.5">
              <div className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-[#F5A623]" : i === 1 ? "bg-[#1A9E8F]" : "bg-muted-foreground"}`} />
              <span className="truncate font-mono text-[10px] text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>

        {/* Center video */}
        <div className="flex flex-1 items-center justify-center bg-[#1A1916]/4 py-6">
          <div className="relative aspect-video w-64 overflow-hidden rounded-lg bg-[#1A1916]/8 ring-1 ring-border">
            <div className="absolute inset-0 bg-gradient-to-br from-[#F5A623]/5 to-[#1A9E8F]/5" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/80 shadow-sm">
                <Play className="h-4 w-4 text-foreground ml-0.5" />
              </div>
            </div>
            <div className="absolute bottom-2 right-2 rounded bg-card/80 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              01:09:14
            </div>
          </div>
        </div>

        {/* Right inspector */}
        <div className="w-36 shrink-0 border-l border-border bg-secondary/30 p-3">
          <div className="mb-2 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Analysis</div>
          {[["Confidence", "96%", "#F5A623"], ["Dead time", "−0:41", "#1A9E8F"], ["Zoom events", "2", "#F5A623"], ["Captions", "98%", "#1A9E8F"]].map(([l, v, c]) => (
            <div key={l} className="mb-2">
              <div className="font-mono text-[9px] text-muted-foreground">{l}</div>
              <div className="font-mono text-[11px] font-semibold" style={{ color: c as string }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">00:00</span>
          <div className="flex-1 h-px bg-border" />
          <span className="font-mono text-[10px] text-muted-foreground">01:52</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {tracks.map((track) => (
            <div key={track.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 font-mono text-[9px] text-muted-foreground">{track.label}</span>
              <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-secondary">
                {track.segments.map((seg, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full rounded-sm border px-1.5 flex items-center"
                    style={{
                      left: seg.left,
                      width: seg.width,
                      backgroundColor: `${track.color}18`,
                      borderColor: `${track.color}44`,
                    }}
                  >
                    <span className="truncate font-mono text-[8px] whitespace-nowrap" style={{ color: track.color }}>
                      {seg.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute top-2 h-full w-px bg-[#F5A623]/50" style={{ left: "43.5%" }} />
      </div>
    </div>
  )
}

const features = [
  { title: "Intent-aware recording", description: "Six parallel data streams capture not just pixels — but cursor velocity, dwell time, click targets, and speech intent while you demo." },
  { title: "Dead time removal", description: "Pause detection cuts the silence between actions automatically. Every breath removed before you open the editor." },
  { title: "Auto zoom scheduling", description: "High-value clicks are identified and scheduled for zoom-in transitions. The viewer's eye lands exactly where it should." },
  { title: "Caption generation", description: "Speech transcription placed automatically on the timeline, synchronized to your narration layer. No SRT wrangling." },
  { title: "Semantic segmentation", description: "The AI groups your recording into logical chapters: opening, features, closing. The structure is pre-built." },
  { title: "One-click export", description: "Review the pre-populated timeline, adjust if needed. Export is the final act — not the beginning of post-production." },
]

export default function LandingPage() {
  const router = useRouter()
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 60])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-background">

      {/* ── Navigation ── */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative z-20 flex items-center justify-between px-8 py-5 lg:px-16"
      >
        <FluxLogo />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/projects")} className="text-muted-foreground hover:text-foreground">
            Projects
          </Button>
          <Button
            onClick={() => router.push("/dashboard")}
            className="gap-2 bg-foreground hover:bg-foreground/90 text-background"
          >
            Open Dashboard
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </motion.nav>

      {/* ── Hero ── */}
      <motion.section
        ref={heroRef}
        style={{ y: heroY, opacity: heroOpacity }}
        className="relative z-10 flex flex-col items-center px-6 pb-24 pt-16 lg:pt-20 lg:px-16"
      >
        {/* Ambient light blob */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-96 w-[800px] rounded-full bg-[#F5A623]/6 blur-[120px]" />

        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mb-6 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#F5A623]" />
          GenAI Genesis Hackathon · Bitdeer Prize Submission · 2026
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl text-center text-5xl font-medium tracking-tight text-foreground sm:text-6xl lg:text-7xl leading-[1.06]"
        >
          Your demo.
          <br />
          <span className="text-muted-foreground">Already done.</span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.5 }}
          className="mt-7 max-w-lg text-center text-lg text-muted-foreground leading-relaxed"
        >
          Record your product. FlowStudio analyzes intent signals, cuts dead time, schedules zooms, and hands you a polished timeline — before you touch the editor.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.65 }}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button
            size="lg"
            className="h-12 gap-2 bg-[#F5A623] hover:bg-[#E09420] text-[#1A1916] font-medium px-7"
            onClick={() => router.push("/dashboard")}
          >
            Open Dashboard
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 gap-2 border-border px-7 text-foreground hover:bg-secondary"
            onClick={() => router.push("/dashboard")}
          >
            <Play className="h-3.5 w-3.5" />
            Get Started
          </Button>
        </motion.div>

        {/* Trust marks */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.85 }}
          className="mt-12 flex items-center gap-6 text-xs text-muted-foreground/60"
        >
          <span>Record once</span>
          <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
          <span>AI edits automatically</span>
          <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
          <span>Export in seconds</span>
        </motion.div>

        {/* Editor Preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-16 w-full max-w-5xl"
        >
          {/* Fade at top to blend into background */}
          <div className="pointer-events-none absolute inset-x-0 -top-px z-10 h-16 bg-gradient-to-b from-background to-transparent" />
          <FakeEditorPreview />
          {/* Fade at bottom */}
          <div className="pointer-events-none absolute inset-x-0 -bottom-px z-10 h-24 bg-gradient-to-t from-background to-transparent" />
        </motion.div>
      </motion.section>

      {/* ── How it works ── */}
      <section className="relative z-10 border-t border-border py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-8 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 max-w-lg"
          >
            <span className="font-mono text-xs text-[#F5A623] tracking-widest uppercase">How it works</span>
            <h2 className="mt-3 text-3xl font-medium tracking-tight text-foreground">Three steps to a polished demo.</h2>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { step: "01", title: "Record", desc: "Screen-capture with live intent signal collection. Cursor, clicks, keyboard, speech — all six streams captured simultaneously.", color: "#F5A623" },
              { step: "02", title: "Analyze", desc: "AI processes intent data in 3–5 seconds. Timeline segments appear. Edit markers populate. You watch the AI work.", color: "#1A9E8F" },
              { step: "03", title: "Export", desc: "Pre-built timeline. Review, adjust, export. The hard part is already done before you open the editor.", color: "#F5A623" },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative border border-border bg-card p-8"
              >
                <div className="mb-6 font-mono text-4xl font-semibold" style={{ color: item.color }}>
                  {item.step}
                </div>
                <h3 className="text-lg font-medium tracking-tight text-foreground">{item.title}</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                {i < 2 && (
                  <div className="absolute -right-px top-1/2 hidden md:flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-border bg-background z-10">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 border-t border-border py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-8 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 flex items-end justify-between"
          >
            <div>
              <span className="font-mono text-xs text-[#1A9E8F] tracking-widest uppercase">Capabilities</span>
              <h2 className="mt-3 text-3xl font-medium tracking-tight text-foreground">Intent over aesthetics.</h2>
            </div>
            <p className="hidden max-w-xs text-sm text-muted-foreground md:block">
              Every edit decision is grounded in behavior, not guesswork.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-px md:grid-cols-2 lg:grid-cols-3 bg-border">
            {features.map((f, i) => (
              <FeatureCard key={f.title} title={f.title} description={f.description} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── For who ── */}
      <section className="relative z-10 border-t border-border py-20 lg:py-24">
        <div className="mx-auto max-w-6xl px-8 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10"
          >
            <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase">Who uses it</span>
          </motion.div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { role: "Founders", desc: "Ship demos that look like a team made them." },
              { role: "Educators", desc: "Tutorials without the post-production bottleneck." },
              { role: "PMs", desc: "Launch videos ready before the meeting ends." },
              { role: "L&D teams", desc: "40 training videos. Non-technical authors." },
            ].map((item, i) => (
              <motion.div
                key={item.role}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="border border-border bg-card p-6"
              >
                <div className="text-sm font-medium text-foreground">{item.role}</div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 border-t border-border py-28 lg:py-36">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-[500px] rounded-full bg-[#F5A623]/5 blur-[100px]" />
        <div className="mx-auto max-w-2xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
              Record.
              <br />
              <span className="text-muted-foreground">Done.</span>
            </h2>
            <p className="mt-6 text-muted-foreground max-w-md mx-auto leading-relaxed">
              The editing step should feel like it never existed. FlowStudio makes that real.
            </p>
            <div className="mt-10">
              <Button
                size="lg"
                className="h-12 gap-2 bg-[#F5A623] hover:bg-[#E09420] text-[#1A1916] font-medium px-8"
                onClick={() => router.push("/dashboard")}
              >
                Get Started Free
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-border px-8 py-10 lg:px-16">
        <div className="mx-auto max-w-6xl flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-4">
            <FluxLogo size="sm" />
            <span className="text-xs text-muted-foreground">© 2026 FlowStudio · GenAI Genesis Hackathon</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <button onClick={() => router.push("/dashboard")} className="hover:text-foreground transition-colors cursor-pointer">Dashboard</button>
            <button onClick={() => router.push("/projects")} className="hover:text-foreground transition-colors cursor-pointer">Projects</button>
            <button onClick={() => router.push("/studio")} className="hover:text-foreground transition-colors cursor-pointer">Studio</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
