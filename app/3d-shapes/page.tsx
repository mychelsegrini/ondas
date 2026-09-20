import { Suspense } from "react";

import { SectionTutorial } from "@/components/SectionTutorial";
import { ShapesExplorer } from "@/components/ShapesExplorer";

export const metadata = {
  title: "Spatial Waves — 3D shape library | Ondas",
  description: "Mathematical solids explored through an automatic spatial audio scan.",
};

export default function ShapesPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-zinc-500">Loading the shape library…</p>}>
      <SectionTutorial
        storageKey="ondas-tutorial-3d-shapes"
        script="Three-D shapes library. Select a shape to begin its continuous spatial scan. The sound will move entirely around your head in 360 degrees to represent the X and Y coordinates. The pitch of the sound represents the Z axis: the taller the shape is at that specific point, the higher the frequency."
      />
      <ShapesExplorer />
    </Suspense>
  );
}
