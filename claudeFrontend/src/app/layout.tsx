import type React from "react";
import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { StoreProvider } from "@/components/StoreProvider";
import { CursorTrail } from "@/components/CursorTrail";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "FlowStudio",
  description: "Record once. Ship a polished demo.",
  icons: {
    icon: [{ url: "/flux-icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased grain-overlay" suppressHydrationWarning>
        {/* Ambient background blobs */}
        <div className="pointer-events-none fixed inset-0 z-[-2] overflow-hidden" aria-hidden="true">
          <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-[#F5A623]/[0.04] blur-[150px]" />
          <div className="absolute -bottom-32 -right-32 h-[450px] w-[450px] rounded-full bg-[#1A9E8F]/[0.03] blur-[130px]" />
        </div>
        <div className="pointer-events-none fixed inset-0 z-[-1] grid-texture opacity-30" />
        <CursorTrail />
        <StoreProvider>
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
