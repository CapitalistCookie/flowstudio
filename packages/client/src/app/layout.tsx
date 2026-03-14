import type { Metadata } from "next";
import { BRANDING } from "@flowstudio/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: BRANDING.name,
  description: BRANDING.tagline,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
