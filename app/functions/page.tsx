import { Suspense } from "react";

import { FunctionExplorer } from "@/components/FunctionExplorer";
import { SectionTutorial } from "@/components/SectionTutorial";

export const metadata = {
  title: "Planar Waves — 2D function explorer | Ondas",
  description:
    "Plot any function of x and explore it by ear: pitch for height, stereo for position, timbre for slope, earcons for critical points.",
};

export default function FunctionsPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-zinc-500">Loading the function explorer…</p>}>
      <SectionTutorial
        storageKey="ondas-tutorial-functions"
        script="Functions section. Type an equation or say 'hey, plot sine of x'. Use your left and right arrow keys to move the cursor. As you move, the sound pans from your left to right ear to represent the X axis. The pitch of the sound represents the Y axis: high pitch means the graph is going up, low pitch means it is going down. You will hear special chimes when you cross a local maximum, minimum, or inflection point."
      />
      <FunctionExplorer />
    </Suspense>
  );
}
