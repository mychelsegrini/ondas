/**
 * Sanity check for the analysis and voice engines: npm run check:math
 */
import { analyzeFunction, formatNumber } from "@/lib/math/analyze";
import { parseVoiceCommand } from "@/lib/voice/parseCommand";

const CASES: Array<[string, number, number]> = [
  ["x^2", -5, 5],
  ["x^3 - 3*x", -3, 3],
  ["sin(x)", -6.283185, 6.283185],
  ["sin(x) * x", -10, 10],
  ["exp(-x^2)", -3, 3],
  ["x^4 - 4*x^2", -2.5, 2.5],
  ["1/x", -5, 5],
  ["tan(x)", -3, 3],
  ["abs(x)", -3, 3],
];

for (const [expression, xMin, xMax] of CASES) {
  const analysis = analyzeFunction(expression, xMin, xMax);
  const summary = analysis.criticalPoints
    .map((p) => `${p.kind}@${formatNumber(p.x, 3)}`)
    .join(", ");
  console.log(
    `${expression.padEnd(12)} [${xMin}, ${xMax}]  y:[${formatNumber(analysis.yMin)}, ${formatNumber(analysis.yMax)}]  ${analysis.error ?? (summary || "none")}`,
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
  "go to the maximum",
  "next critical point",
  "select the sphere",
  "open the shapes library",
  "where am i",
  "stop",
  "banana",
]) {
  console.log(`  "${phrase}" ->`, JSON.stringify(parseVoiceCommand(phrase)));
}
