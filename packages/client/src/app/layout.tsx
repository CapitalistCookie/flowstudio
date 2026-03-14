import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FlowStudio",
  description: "AI-powered video editing platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
