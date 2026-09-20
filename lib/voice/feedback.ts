import type { VoiceCommand, VoicePage } from "@/lib/voice/parseCommand";

const PAGE_FEEDBACK: Record<VoicePage, string> = {
  home: "Opening the home page.",
  functions: "Opening the functions explorer.",
  "2d-shapes": "Opening 2D shapes library.",
  "3d-shapes": "Opening 3D shapes library.",
  multivariable: "Navigating to Multivariable Calculus.",
};

const TWO_D_SHAPES =
  "We currently have a Square, Rectangle, Equilateral Triangle, Circle, Pentagon, and Hexagon.";
const THREE_D_SHAPES =
  "The 3D library has a random point, sphere, cube, rectangular prism, triangular prism, cylinder, cone, pyramid, and ellipsoid.";

/** Turns a mathjs snippet into something that reads naturally aloud. */
export function speakEquation(expression: string): string {
  return expression
    .replace(/\*/g, " times ")
    .replace(/\//g, " over ")
    .replace(/\^2\b/g, " squared")
    .replace(/\^3\b/g, " cubed")
    .replace(/\^/g, " to the power of ")
    .replace(/\bsin\b/gi, "sine")
    .replace(/\bcos\b/gi, "cosine")
    .replace(/\btan\b/gi, "tangent")
    .replace(/\bsqrt\b/gi, "square root")
    .replace(/\bexp\b/gi, "e to the")
    .replace(/\blog10\b/gi, "log")
    .replace(/\s+/g, " ")
    .trim();
}

export function cannedHelpAnswer(question: string): string | null {
  const text = question.toLowerCase();
  if (/\b(2d|two d|two dimensional|flat)\b.*\bshape/.test(text) || /\bshape\b.*\b(2d|two d)\b/.test(text)) {
    return TWO_D_SHAPES;
  }
  if (/\b(3d|three d|three dimensional|solid)\b.*\bshape/.test(text) || /\bshape\b.*\b(3d|three d)\b/.test(text)) {
    return THREE_D_SHAPES;
  }
  if (/\b(surface|multivariable|two variable)\b/.test(text)) {
    return "The surface explorer plots z equals f of x and y, and scans it along a spiral. Try saying plot sine of x times cosine of y.";
  }
  if (/\b(how|what can i|commands|help)\b/.test(text)) {
    return "Say Hey Ondas, then a command. You can navigate, plot an equation, select a shape, auto play, or ask what shapes we have.";
  }
  return null;
}

export function defaultHelpText(): string {
  return "Say Hey Ondas followed by a command to navigate, plot equations, or ask for help. For example: Hey Ondas, open 3D shapes. Or Hey Ondas, plot sine of x.";
}

/** Spoken confirmation for a parsed command when the model did not supply one. */
export function feedbackFor(command: VoiceCommand): string {
  switch (command.type) {
    case "navigate":
      return PAGE_FEEDBACK[command.page];
    case "setFunction":
      return `Plotting function ${speakEquation(command.expression)}.`;
    case "setMultiFunction":
      return `Plotting the surface ${speakEquation(command.expression)}.`;
    case "selectShape":
      return `Selecting the ${command.shapeId.replace(/-/g, " ")}.`;
    case "autoPlay":
      return "Playing the curve.";
    case "setSpeed":
      return `Setting speed to ${command.value} times.`;
    case "setXMin":
      return `Setting x min to ${command.value}.`;
    case "setXMax":
      return `Setting x max to ${command.value}.`;
    case "setDomain":
      return `Setting the domain from ${command.min} to ${command.max}.`;
    case "skip":
      return "Tutorial skipped.";
    case "help":
      return command.answer ?? cannedHelpAnswer("help") ?? defaultHelpText();
    case "audio":
      return command.action === "stop" ? "Audio stopped." : "Audio on.";
    case "describe":
      return "Reading the current position.";
    case "moveCursor":
      return `Moving ${command.direction}.`;
    case "jump":
      return `Jumping to the ${command.target}.`;
    case "unknown":
      return "I did not catch that. Say Hey Ondas, help for examples.";
  }
}
