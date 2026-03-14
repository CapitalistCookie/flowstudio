"use client"

import { useEffect, useRef, useState } from "react"

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [isInteractive, setIsInteractive] = useState(false)

  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  const target = useRef({ x: 0, y: 0 })
  const ring = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)")
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    setEnabled(media.matches && !reduceMotion.matches)
  }, [])

  useEffect(() => {
    if (!enabled) return

    const move = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY }

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`
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

    const animate = () => {
      ring.current.x += (target.current.x - ring.current.x) * 0.2
      ring.current.y += (target.current.y - ring.current.y) * 0.2

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.current.x}px, ${ring.current.y}px, 0)`
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    window.addEventListener("mousemove", move)
    window.addEventListener("mousedown", down)
    window.addEventListener("mouseup", up)
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mousedown", down)
      window.removeEventListener("mouseup", up)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        className={`pointer-events-none fixed left-0 top-0 z-[10001] h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-[width,height,background-color,border-color,box-shadow] duration-150 ${
          isInteractive
            ? "h-10 w-10 border-flux-amber/70 bg-flux-amber/10 shadow-[0_0_24px_rgba(245,166,35,0.25)]"
            : "border-flux-teal/60 bg-transparent"
        } ${isPressed ? "scale-90" : "scale-100"}`}
      />
      <div
        ref={dotRef}
        aria-hidden
        className={`pointer-events-none fixed left-0 top-0 z-[10002] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[background-color,transform] duration-100 ${
          isInteractive ? "bg-flux-amber" : "bg-flux-teal"
        } ${isPressed ? "scale-75" : "scale-100"}`}
      />
    </>
  )
}
