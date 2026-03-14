import type React from "react"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { DM_Sans, JetBrains_Mono } from "next/font/google"
import { Toaster } from "sonner"
import { CursorTrail } from "@/components/cursor-trail"
import "./globals.css"

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["300", "400", "500", "600"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: "FlowStudio",
  description: "Record once. Ship a polished demo.",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
        <body className="font-sans antialiased grain-overlay" suppressHydrationWarning>
          <div className="pointer-events-none fixed inset-0 z-[-1] grid-texture opacity-50" />
          <CursorTrail />
          {children}
          <Toaster position="bottom-right" richColors />
        </body>
      </html>
    </ClerkProvider>
  )
}