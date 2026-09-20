/**
 * Sanity check for the analysis and voice engines: npm run check:math
 */
import { analyzeFunction, formatNumber } from "@/lib/math/analyze";
import { analyzeSurface } from "@/lib/math/surface";
import { parseVoiceCommand } from "@/lib/voice/parseCommand";

const CASES: Array<[string, number, number]> = [
  ["x^2", -5, 5],
  ["x^3 - 3*x", -3, 3],
  ["sin(x)", -6.283185, 6.283185],
  ["sin(x) * x", -10, 10],
  ["exp(-x^2)", -3, 3],
  ["x^4 - 4*x^2", -2.5, 2.5],
  ["1/x", -5, 5],
  ["tan(x)", -4.5, 4.5],
  ["abs(x)", -3, 3],
  ["sqrt(x)", -3, 3],
  ["log(x)", -2, 5],
  ["1/(x^2 - 4)", -5, 5],
];

for (const [expression, xMin, xMax] of CASES) {
  const analysis = analyzeFunction(expression, xMin, xMax);
  const summary = analysis.criticalPoints
    .map((p) => `${p.kind}@${formatNumber(p.x, 3)}`)
    .join(", ");
  const breaks = analysis.discontinuities
    .map((d) => `${d.kind}@${formatNumber(d.x, 3)}`)
    .join(", ");
  console.log(
    `${expression.padEnd(12)} [${xMin}, ${xMax}]  y:[${formatNumber(analysis.yMin)}, ${formatNumber(analysis.yMax)}]  ${analysis.error ?? (summary || "none")}  breaks: ${breaks || "none"}`,
  );
}

console.log("\nVoice commands:");
for (const phrase of [
  "set function to sine of x times x",
  "set function to sine x",
  "graph cosine x plus x squared",
  "plot one divided by x",
  "plot square root of x",
  "plot x squared minus four",
  "set x min to minus five",
  "set x max to twelve",
  "set the domain from minus three to three",
  "set speed to two x",
  "set speed to zero point five",
  "speed 3",
  "set speed to ten x",
  "go to the maximum",
  "next critical point",
  "select the sphere",
  "select the triangular prism",
  "select the triangle",
  "select the random point",
  "select the hexagon",
  "open the 2d shapes library",
  "open the 3d shapes library",
  "open the functions explorer",
  "open the surface explorer",
  "auto play",
  "hey ondas skip",
  "what 2d shapes are there",
  "set the surface to sine x times cosine y",
  "plot sine of x times cosine of y",
  "where am i",
  "stop",
  "banana",
]) {
  console.log(`  "${phrase}" ->`, JSON.stringify(parseVoiceCommand(phrase)));
}

console.log("\nSurfaces:");
for (const expression of ["sin(x)*cos(y)", "x^2 + y^2", "x^2 - y^2", "1/(x*y)"]) {
  const analysis = analyzeSurface(expression, 5, 3, 360);
  const features = analysis.features
    .slice(0, 6)
    .map((f) => `${f.kind}@(${formatNumber(f.x, 2)},${formatNumber(f.y, 2)})`)
    .join(", ");
  console.log(
    `${expression.padEnd(16)} z:[${formatNumber(analysis.zMin)}, ${formatNumber(analysis.zMax)}]  undefined:${(analysis.undefinedRatio * 100).toFixed(0)}%  ${analysis.error ?? (features || "none")}`,
  );
}
