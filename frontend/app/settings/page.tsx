"use client"

import { useEffect, useState } from "react"
import { Moon, Sparkles, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"

export default function SettingsPage() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <WorkspaceSidebar active="settings" showProjectList={false} />

      <main className="flex-1 overflow-y-auto bg-background/50">
        <div className="mx-auto max-w-3xl px-8 py-12 lg:px-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Settings</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">Appearance</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Choose one mode and keep the editor experience consistent.
          </p>

          <section className="mt-8 rounded-2xl border border-border/70 bg-card/70 p-5 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-flux-amber" />
              Theme mode
            </div>

            {!mounted ? (
              <div className="h-14 rounded-xl border border-border bg-secondary/50" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`group flex min-h-14 items-center justify-between rounded-xl border px-4 text-left transition ${
                    !isDark
                      ? "border-flux-amber/60 bg-flux-amber/10 shadow-[0_0_0_1px_rgba(245,166,35,0.25)]"
                      : "border-border bg-background hover:bg-secondary/60"
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">Light</div>
                    <div className="text-xs text-muted-foreground">Clean canvas</div>
                  </div>
                  <Sun className={`h-4 w-4 ${!isDark ? "text-flux-amber" : "text-muted-foreground"}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`group flex min-h-14 items-center justify-between rounded-xl border px-4 text-left transition ${
                    isDark
                      ? "border-flux-amber/60 bg-flux-amber/10 shadow-[0_0_0_1px_rgba(245,166,35,0.25)]"
                      : "border-border bg-background hover:bg-secondary/60"
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">Dark</div>
                    <div className="text-xs text-muted-foreground">Cinematic focus</div>
                  </div>
                  <Moon className={`h-4 w-4 ${isDark ? "text-flux-amber" : "text-muted-foreground"}`} />
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
