import type { Metadata } from "next";

import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { VoiceCommandProvider } from "@/components/VoiceCommandProvider";
import { VoiceBar } from "@/components/VoiceBar";

export const metadata: Metadata = {
  title: "Ondas — Hear the shape of mathematics",
  description:
    "Ondas turns 3D solids and 2D functions into spatial sound, so geometry and calculus can be explored by ear.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-200 antialiased">
        <VoiceCommandProvider>
          <a
            href="#main"
            className="sr-only-focusable fixed left-4 top-4 z-50 rounded-md bg-cyan-400 px-4 py-2 font-medium text-zinc-950"
          >
            Skip to main content
          </a>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
              {children}
            </main>
            <VoiceBar />
          </div>
        </VoiceCommandProvider>
      </body>
    </html>
  );
}
