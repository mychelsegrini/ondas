import { Suspense } from "react";

import { Shapes2DExplorer } from "@/components/Shapes2DExplorer";

export const metadata = {
  title: "Flat Waves — 2D shape library | Ondas",
  description:
    "Six plane figures explored by tracing their perimeter with stereo position and pitch.",
};

export default function Shapes2DPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-zinc-500">Loading the polygon library…</p>}>
      <Shapes2DExplorer />
    </Suspense>
  );
}
