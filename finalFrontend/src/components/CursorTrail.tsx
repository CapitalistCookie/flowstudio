"use client"

import { useEffect, useRef } from "react"

interface TrailPoint {
  x: number
  y: number
  alpha: number
  radius: number
}

/**
 * CursorTrail — asteroid-streak style cursor trail
 * Inspired by Dune iOS game: delicate comet trail,
 * amber-tinted particles that fade smoothly behind cursor.
 */
export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trailRef = useRef<TrailPoint[]>([])
  const mouseRef = useRef({ x: -100, y: -100 })
  const rafRef = useRef<number>(0)
  const lastPos = useRef({ x: -100, y: -100 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", onMouseMove)

    const MAX_TRAIL = 18
    const FADE_SPEED = 0.055

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const dx = mx - lastPos.current.x
      const dy = my - lastPos.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Only add a new point if cursor moved enough
      if (dist > 3) {
        trailRef.current.push({
          x: mx,
          y: my,
          alpha: 0.55,
          radius: 2.2,
        })
        lastPos.current = { x: mx, y: my }
      }

      // Keep trail at max length
      if (trailRef.current.length > MAX_TRAIL) {
        trailRef.current.splice(0, trailRef.current.length - MAX_TRAIL)
      }

      // Draw and fade trail points
      trailRef.current = trailRef.current
        .map((pt, i) => {
          const progress = i / trailRef.current.length
          const r = pt.radius * progress
          const alpha = pt.alpha * progress

          // Draw glow
          const gradient = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 3.5)
          gradient.addColorStop(0, `rgba(245, 166, 35, ${alpha * 0.7})`)
          gradient.addColorStop(0.4, `rgba(245, 166, 35, ${alpha * 0.2})`)
          gradient.addColorStop(1, `rgba(245, 166, 35, 0)`)

          ctx.beginPath()
          ctx.arc(pt.x, pt.y, r * 3.5, 0, Math.PI * 2)
          ctx.fillStyle = gradient
          ctx.fill()

          // Draw core dot
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, Math.max(0.5, r), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(245, 166, 35, ${alpha})`
          ctx.fill()

          return { ...pt, alpha: pt.alpha - FADE_SPEED }
        })
        .filter((pt) => pt.alpha > 0.01)

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouseMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden="true"
    />
  )
}
