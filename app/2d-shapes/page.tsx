import { Suspense } from "react";

import { SectionTutorial } from "@/components/SectionTutorial";
import { Shapes2DExplorer } from "@/components/Shapes2DExplorer";

export const metadata = {
  title: "Flat Waves — 2D shape library | Ondas",
  description:
    "Six plane figures explored by tracing their perimeter with stereo position and pitch.",
};

export default function Shapes2DPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-zinc-500">Loading the polygon library…</p>}>
      <SectionTutorial
        storageKey="ondas-tutorial-2d-shapes"
        script="Two-D shapes library. Select a shape to hear its perimeter. The sound will physically trace the outline of the shape in front of you. Left and right movements are mapped to your stereo balance, and the vertical height of the shape is mapped to the pitch of the tone."
      />
      <Shapes2DExplorer />
    </Suspense>
  );
}
