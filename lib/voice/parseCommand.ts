import { SHAPES } from "@/lib/shapes";
import { SHAPES_2D } from "@/lib/shapes2d";
import { digitsFromWords, parseSpokenNumber } from "@/lib/voice/numberWords";

export type VoicePage = "home" | "functions" | "2d-shapes" | "3d-shapes";

export type VoiceCommand =
  | { type: "setFunction"; expression: string }
  | { type: "setXMin"; value: number }
  | { type: "setXMax"; value: number }
  | { type: "setDomain"; min: number; max: number }
  | { type: "setSpeed"; value: number }
  | { type: "selectShape"; shapeId: string }
  | { type: "navigate"; page: VoicePage }
  | { type: "moveCursor"; direction: "left" | "right"; fast: boolean }
  | { type: "jump"; target: "max" | "min" | "inflection" | "start" | "end" | "next" | "previous" }
  | { type: "audio"; action: "start" | "stop" }
  | { type: "describe" }
  | { type: "help" }
  | { type: "unknown"; transcript: string };

const SPOKEN_MATH: Array<[RegExp, string]> = [
  [/\bsquare root of\b/g, "sqrt"],
  [/\bsquare root\b/g, "sqrt"],
  [/\bnatural log(?:arithm)? of\b/g, "log"],
  [/\bnatural log(?:arithm)?\b/g, "log"],
  [/\blog(?:arithm)? of\b/g, "log10"],
  [/\bsine of\b/g, "sin"],
  [/\bsine\b/g, "sin"],
  [/\bcosine of\b/g, "cos"],
  [/\bcosine\b/g, "cos"],
  [/\btangent of\b/g, "tan"],
  [/\btangent\b/g, "tan"],
  [/\babsolute value of\b/g, "abs"],
  [/\bexponential of\b/g, "exp"],
  [/\bsquared\b/g, "^2"],
  [/\bcubed\b/g, "^3"],
  [/\bto the power of\b/g, "^"],
  [/\bto the\b/g, "^"],
  [/\braised to\b/g, "^"],
  [/\bplus\b/g, "+"],
  [/\bminus\b/g, "-"],
  [/\bnegative\b/g, "-"],
  [/\btimes\b/g, "*"],
  [/\bmultiplied by\b/g, "*"],
  [/\bdivided by\b/g, "/"],
  [/\bover\b/g, "/"],
  [/\bopen (?:parenthesis|bracket|paren)\b/g, "("],
  [/\bclose (?:parenthesis|bracket|paren)\b/g, ")"],
  [/\bof\b/g, ""],
];

/**
 * Turns dictated mathematics into a mathjs expression:
 * "sine of x times x squared" -> "sin(x)*x^2".
 */
export function normalizeSpokenMath(input: string): string {
  let text = ` ${input.toLowerCase().trim()} `;
  text = text.replace(/[,]/g, " ");
  text = digitsFromWords(text);

  for (const [pattern, replacement] of SPOKEN_MATH) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/\bex\b/g, "x")
    .replace(/\bpie\b/g, "pi")
    .replace(/\s+/g, "");

  // "sin x" is unambiguous to a human but not to a parser. Wrap only the operand
  // that follows, so "sin x times x" becomes sin(x)*x rather than sin(x*x).
  text = text.replace(
    /(sin|cos|tan|sqrt|abs|exp|log10|log)(?!\()(-?(?:\d+(?:\.\d+)?|pi|x|e))(\^-?\d+(?:\.\d+)?)?/g,
    (_match, fn: string, operand: string, power?: string) => `${fn}(${operand}${power ?? ""})`,
  );

  // Dictation rarely includes closing parentheses, so balance whatever is left.
  const open = (text.match(/\(/g) ?? []).length;
  const close = (text.match(/\)/g) ?? []).length;
  if (open > close) text += ")".repeat(open - close);

  return text;
}

const SHAPE_ALIASES: Record<string, string> = {
  ball: "sphere",
  globe: "sphere",
  box: "cube",
  tube: "cylinder",
  "ice cream cone": "cone",
  egg: "ellipsoid",
  cuboid: "rectangular-prism",
  "rectangular prism": "rectangular-prism",
  "triangular prism": "triangular-prism",
  "random point": "random-point",
  random: "random-point",
  "oblong": "rectangle",
  "three sided": "triangle",
  "five sided": "pentagon",
  "six sided": "hexagon",
  round: "circle",
};

/**
 * Resolves a spoken shape name across both libraries. The longest match wins,
 * so "triangular prism" is never mistaken for "triangle".
 */
function matchShape(text: string): string | null {
  const cleaned = text.replace(/\b(the|shape|solid|figure|polygon)\b/g, " ");
  const candidates: Array<[string, string]> = [
    ...[...SHAPES, ...SHAPES_2D].flatMap((shape) => {
      const spoken = shape.id.replace(/-/g, " ");
      return [
        [shape.name.toLowerCase(), shape.id] as [string, string],
        [spoken, shape.id] as [string, string],
      ];
    }),
    ...Object.entries(SHAPE_ALIASES),
  ];

  let best: { id: string; length: number } | null = null;
  for (const [needle, id] of candidates) {
    if (cleaned.includes(needle) && (!best || needle.length > best.length)) {
      best = { id, length: needle.length };
    }
  }
  return best?.id ?? null;
}

export const MIN_SPEED = 0.2;
export const MAX_SPEED = 5;

export function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(value * 10) / 10));
}

export function parseVoiceCommand(rawTranscript: string): VoiceCommand {
  const transcript = rawTranscript.toLowerCase().trim().replace(/[.!?]+$/, "");
  if (!transcript) return { type: "unknown", transcript: rawTranscript };

  if (/\b(help|what can i say|commands)\b/.test(transcript)) return { type: "help" };

  if (/\b(stop|mute|silence|pause)\b/.test(transcript)) return { type: "audio", action: "stop" };
  if (/\b(start|enable|unmute|turn on)\b.*\b(audio|sound|tone)\b/.test(transcript)) {
    return { type: "audio", action: "start" };
  }

  if (/\b(where am i|describe|read out|current position|status)\b/.test(transcript)) {
    return { type: "describe" };
  }

  // Speed control: "set speed to two x", "speed 0.5", "faster", "slower".
  const speed = transcript.match(
    /\b(?:set\s+)?(?:the\s+)?speed\b\s*(?:to|=|is|at)?\s*(.+)$/,
  );
  if (speed) {
    const value = parseSpokenNumber(speed[1].replace(/\bx\b/g, " "));
    if (value !== null) return { type: "setSpeed", value: clampSpeed(value) };
  }

  // Navigation between the surfaces. Dimension is checked before the generic
  // "shapes" fallback so "2d shapes" never lands on the 3D library.
  if (/\b(go to|open|show|navigate to)\b/.test(transcript)) {
    if (/\b(2d|two d|two dimensional|flat|polygon)\b.*\b(shape|library|polygon)\b/.test(transcript)) {
      return { type: "navigate", page: "2d-shapes" };
    }
    if (/\b(3d|three d|three dimensional|spatial|solid)\b/.test(transcript)) {
      return { type: "navigate", page: "3d-shapes" };
    }
    if (/\b(function|graph|explorer|plot|curve)\b/.test(transcript)) {
      return { type: "navigate", page: "functions" };
    }
    if (/\b(shape|library)\b/.test(transcript)) return { type: "navigate", page: "3d-shapes" };
    if (/\b(home|start page|menu)\b/.test(transcript)) return { type: "navigate", page: "home" };
  }

  // Shape selection: "select the sphere", "play the torus", "scan a cube".
  if (/\b(select|play|scan|choose|listen to)\b/.test(transcript)) {
    const shapeId = matchShape(transcript);
    if (shapeId) return { type: "selectShape", shapeId };
  }

  // Domain in one sentence: "set the domain from minus five to five".
  const domain = transcript.match(/\b(?:domain|range)\b.*?\bfrom\b(.+?)\bto\b(.+)$/);
  if (domain) {
    const min = parseSpokenNumber(domain[1]);
    const max = parseSpokenNumber(domain[2]);
    if (min !== null && max !== null) return { type: "setDomain", min, max };
  }

  const xMin = transcript.match(/\bx\s*(?:min|minimum|start|from)\b\s*(?:to|=|is|at)?\s*(.+)$/);
  if (xMin) {
    const value = parseSpokenNumber(xMin[1]);
    if (value !== null) return { type: "setXMin", value };
  }

  const xMax = transcript.match(/\bx\s*(?:max|maximum|end|to)\b\s*(?:to|=|is|at)?\s*(.+)$/);
  if (xMax) {
    const value = parseSpokenNumber(xMax[1]);
    if (value !== null) return { type: "setXMax", value };
  }

  // Cursor navigation.
  if (/\b(jump|go)\b.*\b(maximum|max|peak)\b/.test(transcript)) return { type: "jump", target: "max" };
  if (/\b(jump|go)\b.*\b(minimum|min|valley|bottom)\b/.test(transcript)) return { type: "jump", target: "min" };
  if (/\binflection\b/.test(transcript)) return { type: "jump", target: "inflection" };
  if (/\b(next|following)\s+(point|critical)/.test(transcript)) return { type: "jump", target: "next" };
  if (/\b(previous|last)\s+(point|critical)/.test(transcript)) return { type: "jump", target: "previous" };
  if (/\bgo to (?:the )?(?:start|beginning)\b/.test(transcript)) return { type: "jump", target: "start" };
  if (/\bgo to (?:the )?end\b/.test(transcript)) return { type: "jump", target: "end" };
  if (/\b(move|go|step)\b.*\bright\b/.test(transcript)) {
    return { type: "moveCursor", direction: "right", fast: /\b(fast|far|a lot|quickly)\b/.test(transcript) };
  }
  if (/\b(move|go|step)\b.*\bleft\b/.test(transcript)) {
    return { type: "moveCursor", direction: "left", fast: /\b(fast|far|a lot|quickly)\b/.test(transcript) };
  }

  // Function entry. Kept last so more specific commands win.
  const fn = transcript.match(
    /\b(?:set (?:the )?function (?:to|as|equals?)?|function is|function|plot|graph|draw|y equals|y =)\b(.+)$/,
  );
  if (fn) {
    const expression = normalizeSpokenMath(fn[1]);
    if (expression) return { type: "setFunction", expression };
  }

  return { type: "unknown", transcript: rawTranscript };
}

export const VOICE_EXAMPLES: string[] = [
  "set function to sine x times x",
  "set x min to minus five",
  "set x max to ten",
  "set the domain from minus three to three",
  "set speed to two x",
  "go to the maximum",
  "next critical point",
  "move right",
  "where am I",
  "select the sphere",
  "select the hexagon",
  "open the 2d shapes library",
  "stop",
];
