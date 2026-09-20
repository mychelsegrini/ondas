import { Suspense } from "react";

import { SurfaceExplorer } from "@/components/SurfaceExplorer";

export const metadata = {
  title: "Surface Waves — multivariable explorer | Ondas",
  description:
    "Hear z = f(x, y) as spatial sound: an Archimedean spiral through a 3D panner, with height mapped to pitch.",
};

export default function MultivariablePage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-zinc-500">Loading the surface explorer…</p>}>
      <SurfaceExplorer />
    </Suspense>
  );
}
