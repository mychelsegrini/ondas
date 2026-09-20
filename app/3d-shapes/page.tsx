import { Suspense } from "react";

import { ShapesExplorer } from "@/components/ShapesExplorer";

export const metadata = {
  title: "Spatial Waves — 3D shape library | Ondas",
  description: "Ten mathematical solids explored through an automatic spatial audio scan.",
};

export default function ShapesPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-zinc-500">Loading the shape library…</p>}>
      <ShapesExplorer />
    </Suspense>
  );
}
