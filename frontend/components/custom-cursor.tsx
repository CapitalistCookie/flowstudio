"use client"

import { useEffect, useRef, useState } from "react"

interface TrailPoint {
  x: number
  y: number
  alpha: number
  radius: number
  vx: number
  vy: number
  twinkle: number
}

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [isInteractive, setIsInteractive] = useState(false)
  const [visible, setVisible] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<TrailPoint[]>([])
  const rafRef = useRef<number | null>(null)
  const lastPointRef = useRef({ x: -100, y: -100 })

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)")
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    setEnabled(media.matches && !reduceMotion.matches)
  }, [])

  useEffect(() => {
    if (!enabled) {
      document.body.classList.remove("custom-cursor-active")
      document.documentElement.classList.remove("custom-cursor-active")
      return
    }

    document.body.classList.add("custom-cursor-active")
    document.documentElement.classList.add("custom-cursor-active")

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    const resize = () => {
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const move = (e: MouseEvent) => {
      setVisible(true)

      if (dotRef.current) {
        dotRef.current.style.left = `${e.clientX}px`
        dotRef.current.style.top = `${e.clientY}px`
      }

      if (ringRef.current) {
        ringRef.current.style.left = `${e.clientX}px`
        ringRef.current.style.top = `${e.clientY}px`
      }

      const dx = e.clientX - lastPointRef.current.x
      const dy = e.clientY - lastPointRef.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 2.5) {
        const safeDist = dist || 1
        trailRef.current.push({
          x: e.clientX,
          y: e.clientY,
          alpha: 0.58,
          radius: 2,
          vx: dx / safeDist,
          vy: dy / safeDist,
          twinkle: Math.random() * 0.65 + 0.35,
        })
        lastPointRef.current = { x: e.clientX, y: e.clientY }
      }

      const hovered = e.target as HTMLElement | null
      if (!hovered) return

      const interactive = Boolean(
        hovered.closest(
          "button, a, [role='button'], [role='menuitem'], input, textarea, select, summary, [data-cursor='interactive']"
        )
      )
      setIsInteractive(interactive)
    }

    const down = () => setIsPressed(true)
    const up = () => setIsPressed(false)
    const leave = () => setVisible(false)
    const enter = () => setVisible(true)

    const renderTrail = () => {
      if (!canvas || !ctx) {
        rafRef.current = requestAnimationFrame(renderTrail)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const maxTrail = 120
      if (trailRef.current.length > maxTrail) {
        trailRef.current.splice(0, trailRef.current.length - maxTrail)
      }

      trailRef.current = trailRef.current
        .map((pt, i) => {
          const progress = i / Math.max(1, trailRef.current.length)
          const alpha = pt.alpha * progress
          const width = Math.max(0.6, pt.radius * progress)
          const streakLength = 18 * progress + 5
          const tailX = pt.x - pt.vx * streakLength
          const tailY = pt.y - pt.vy * streakLength

          const streakGradient = ctx.createLinearGradient(pt.x, pt.y, tailX, tailY)
          streakGradient.addColorStop(0, `rgba(255, 195, 84, ${alpha * 0.85})`)
          streakGradient.addColorStop(0.35, `rgba(245, 166, 35, ${alpha * 0.42})`)
          streakGradient.addColorStop(1, "rgba(245, 166, 35, 0)")

          ctx.beginPath()
          ctx.moveTo(pt.x, pt.y)
          ctx.lineTo(tailX, tailY)
          ctx.strokeStyle = streakGradient
          ctx.lineWidth = width
          ctx.lineCap = "round"
          ctx.stroke()

          const sparkleSize = (1.2 + progress * 2.6) * pt.twinkle
          ctx.strokeStyle = `rgba(255, 232, 168, ${alpha * 0.55})`
          ctx.lineWidth = Math.max(0.45, width * 0.45)

          // 4-point star sparkle (no dot particles).
          ctx.beginPath()
          ctx.moveTo(pt.x - sparkleSize, pt.y)
          ctx.lineTo(pt.x + sparkleSize, pt.y)
          ctx.moveTo(pt.x, pt.y - sparkleSize)
          ctx.lineTo(pt.x, pt.y + sparkleSize)
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(pt.x - sparkleSize * 0.65, pt.y - sparkleSize * 0.65)
          ctx.lineTo(pt.x + sparkleSize * 0.65, pt.y + sparkleSize * 0.65)
          ctx.moveTo(pt.x + sparkleSize * 0.65, pt.y - sparkleSize * 0.65)
          ctx.lineTo(pt.x - sparkleSize * 0.65, pt.y + sparkleSize * 0.65)
          ctx.stroke()

          return { ...pt, alpha: pt.alpha - 0.0022 }
        })
        .filter((pt) => pt.alpha > 0.01)

      rafRef.current = requestAnimationFrame(renderTrail)
    }

    window.addEventListener("mousemove", move)
    window.addEventListener("mousedown", down)
    window.addEventListener("mouseup", up)
    window.addEventListener("mouseleave", leave)
    window.addEventListener("mouseenter", enter)
    rafRef.current = requestAnimationFrame(renderTrail)

    return () => {
      document.body.classList.remove("custom-cursor-active")
      document.documentElement.classList.remove("custom-cursor-active")
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mousedown", down)
      window.removeEventListener("mouseup", up)
      window.removeEventListener("mouseleave", leave)
      window.removeEventListener("mouseenter", enter)
      window.removeEventListener("resize", resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`pointer-events-none fixed inset-0 z-[10000] transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={ringRef}
        aria-hidden
        className={`pointer-events-none fixed z-[10001] h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-[width,height,background-color,border-color,box-shadow,opacity,transform] duration-150 ${
          isInteractive
            ? "h-10 w-10 border-flux-amber/70 bg-flux-amber/10 shadow-[0_0_24px_rgba(245,166,35,0.25)]"
            : "border-flux-teal/60 bg-transparent"
        } ${isPressed ? "scale-90" : "scale-100"} ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ left: -100, top: -100 }}
      />
      <div
        ref={dotRef}
        aria-hidden
        className={`pointer-events-none fixed z-[10002] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[background-color,opacity,transform] duration-100 ${
          isInteractive ? "bg-flux-amber" : "bg-flux-teal"
        } ${isPressed ? "scale-75" : "scale-100"} ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ left: -100, top: -100 }}
      />
    </>
  )
}
