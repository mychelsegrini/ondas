import { FunctionExplorer } from "@/components/FunctionExplorer";

export const metadata = {
  title: "Planar Waves — 2D function explorer | Ondas",
  description:
    "Plot any function of x and explore it by ear: pitch for height, stereo for position, timbre for slope, earcons for critical points.",
};

export default function FunctionsPage() {
  return <FunctionExplorer />;
}
