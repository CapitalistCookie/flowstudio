"use client"

import { useEffect, useRef, useState } from "react"

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [isInteractive, setIsInteractive] = useState(false)
  const [visible, setVisible] = useState(false)

  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)")
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    setEnabled(media.matches && !reduceMotion.matches)
  }, [])

  useEffect(() => {
    if (!enabled) {
      document.body.classList.remove("custom-cursor-active")
      return
    }

    document.body.classList.add("custom-cursor-active")

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

    window.addEventListener("mousemove", move)
    window.addEventListener("mousedown", down)
    window.addEventListener("mouseup", up)
    window.addEventListener("mouseleave", leave)
    window.addEventListener("mouseenter", enter)

    return () => {
      document.body.classList.remove("custom-cursor-active")
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mousedown", down)
      window.removeEventListener("mouseup", up)
      window.removeEventListener("mouseleave", leave)
      window.removeEventListener("mouseenter", enter)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <>
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
