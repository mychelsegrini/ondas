import { NextResponse } from "next/server";

import {
  MAX_SPEED,
  MIN_SPEED,
  parseVoiceCommand,
  referencesY,
  routeToPage,
  clampSpeed,
  pageToRoute,
  type VoiceCommand,
} from "@/lib/voice/parseCommand";
import { defaultHelpText, feedbackFor } from "@/lib/voice/feedback";

export const runtime = "nodejs";
/** The router depends on a live upstream call, so it must never be cached. */
export const dynamic = "force-dynamic";

/**
 * Meta Model API is OpenAI-compatible, so any compatible gateway works by
 * overriding these. Defaults target Meta's hosted endpoint.
 */
const BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
const MODEL = process.env.META_MODEL ?? "muse-spark-1.3";
const API_KEY = process.env.META_API_KEY ?? process.env.MODEL_API_KEY;
/** Voice control must feel instant; a slow model is worse than no model. */
const TIMEOUT_MS = Number(process.env.META_TIMEOUT_MS ?? 4000);

export type LlmAction =
  | "NAVIGATE"
  | "SET_2D_FUNC"
  | "SET_MULTI_FUNC"
  | "SELECT_SHAPE"
  | "AUTO_PLAY"
  | "SET_SPEED"
  | "HELP"
  | "SKIP";

export interface LlmPayload {
  route?: string;
  equation?: string;
  targetShape?: string;
  speedMultiplier?: number;
}

export interface LlmCommand {
  action: LlmAction | "UNKNOWN";
  payload: LlmPayload;
  /** Exact sentence the client reads aloud before acting. */
  feedbackText: string;
}

export interface VoiceRouteResponse {
  action: LlmAction | "UNKNOWN";
  payload: LlmPayload;
  feedbackText: string;
  command: VoiceCommand;
  source: "llm" | "local";
  transcript: string;
}

const SYSTEM_PROMPT = `You are the command router and spoken assistant for "Ondas", an audio application that teaches mathematics to blind and low-vision users by turning it into sound.

The user has already said the wake phrase "Hey Ondas" or "Hi Ondas". You receive only the command that followed it.

Return ONLY a JSON object. No prose, no markdown, no code fences.

Schema:
{
  "action": "NAVIGATE" | "SET_2D_FUNC" | "SET_MULTI_FUNC" | "SELECT_SHAPE" | "AUTO_PLAY" | "SET_SPEED" | "HELP" | "SKIP" | "UNKNOWN",
  "payload": {
    "route": string,
    "equation": string,
    "targetShape": string,
    "speedMultiplier": number
  },
  "feedbackText": "The exact sentence the app will read aloud BEFORE it performs the action."
}

feedbackText is required. Keep it to one or two short sentences. Speak as a calm assistant.

feedbackText rules:
- NAVIGATE: confirm before it happens. Examples: "Opening 3D shapes library." "Navigating to Multivariable Calculus." "Opening the functions explorer."
- SET_2D_FUNC: read the equation clearly. Example: "Plotting function sine of x."
- SET_MULTI_FUNC: "Plotting the surface sine of x times cosine of y."
- SELECT_SHAPE: "Selecting the cylinder."
- AUTO_PLAY: "Playing the curve."
- SET_SPEED: "Setting speed to two times."
- SKIP: the user wants to stop the welcome tutorial. "Tutorial skipped."
- HELP: answer the question clearly and concisely. If they ask "What 2D shapes are there?", say "We currently have a Square, Rectangle, Equilateral Triangle, Circle, Pentagon, and Hexagon." If they ask about 3D shapes, list: random point, sphere, cube, rectangular prism, triangular prism, cylinder, cone, pyramid, ellipsoid. If they just say help, explain that they can navigate, plot equations, select shapes, or auto play.
- UNKNOWN: "I did not catch that. Say Hey Ondas, help for examples."

Actions:
- NAVIGATE: payload.route is one of "/", "/functions", "/2d-shapes", "/3d-shapes", "/multivariable".
  "/functions" explores curves y = f(x). "/multivariable" explores surfaces z = f(x, y).
  "/2d-shapes" is flat polygons. "/3d-shapes" is solids.
- SET_2D_FUNC: payload.equation is a mathjs expression in x ONLY. Example: "sin(x)*x".
- SET_MULTI_FUNC: payload.equation is a mathjs expression in x AND y. Example: "sin(x)*cos(y)".
  Any equation that mentions y must use SET_MULTI_FUNC, never SET_2D_FUNC.
- SELECT_SHAPE: payload.targetShape is exactly one of:
  random-point, sphere, cube, rectangular-prism, triangular-prism, cylinder, cone, pyramid, ellipsoid,
  square, rectangle, triangle, circle, pentagon, hexagon.
- AUTO_PLAY: no payload. Use for "play it", "sweep the curve", "auto play".
- SET_SPEED: payload.speedMultiplier is a number between ${MIN_SPEED} and ${MAX_SPEED}.
- HELP: questions and "what can I say". Put the full spoken answer in feedbackText. payload may be empty.
- SKIP: "skip", "skip the tutorial", "stop the intro". payload may be empty.

The input is raw speech, so expect dictated mathematics. Convert it to mathjs syntax:
"sine of x times x" -> "sin(x)*x"; "x squared plus three" -> "x^2+3";
"one over x" -> "1/x"; "e to the minus x squared" -> "exp(-x^2)".
Speech recognition usually transcribes the variable y as the word "why".

Examples:
"open 3d shapes" -> {"action":"NAVIGATE","payload":{"route":"/3d-shapes"},"feedbackText":"Opening 3D shapes library."}
"plot sine of x" -> {"action":"SET_2D_FUNC","payload":{"equation":"sin(x)"},"feedbackText":"Plotting function sine of x."}
"what 2D shapes are there?" -> {"action":"HELP","payload":{},"feedbackText":"We currently have a Square, Rectangle, Equilateral Triangle, Circle, Pentagon, and Hexagon."}
"skip" -> {"action":"SKIP","payload":{},"feedbackText":"Tutorial skipped."}`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "payload", "feedbackText"],
  properties: {
    action: {
      type: "string",
      enum: [
        "NAVIGATE",
        "SET_2D_FUNC",
        "SET_MULTI_FUNC",
        "SELECT_SHAPE",
        "AUTO_PLAY",
        "SET_SPEED",
        "HELP",
        "SKIP",
        "UNKNOWN",
      ],
    },
    payload: {
      type: "object",
      additionalProperties: false,
      properties: {
        route: { type: "string" },
        equation: { type: "string" },
        targetShape: { type: "string" },
        speedMultiplier: { type: "number" },
      },
    },
    feedbackText: { type: "string" },
  },
} as const;

/** Pulls the first JSON object out of a reply that may be wrapped in prose. */
function extractJson(text: string): unknown | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Reads the assistant text out of either the OpenAI-compatible or native shape. */
function readContent(body: unknown): string | null {
  const data = body as {
    choices?: Array<{ message?: { content?: unknown } }>;
    completion_message?: { content?: { text?: string } | string };
  };

  const openAi = data.choices?.[0]?.message?.content;
  if (typeof openAi === "string") return openAi;
  // Some gateways return content as an array of parts.
  if (Array.isArray(openAi)) {
    const joined = openAi
      .map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? ""))
      .join("");
    if (joined) return joined;
  }

  const native = data.completion_message?.content;
  if (typeof native === "string") return native;
  if (native && typeof native === "object" && typeof native.text === "string") return native.text;

  return null;
}

/**
 * Converts the LLM schema into the app's internal command. Everything is
 * re-validated here: the model is a parser, not a trusted source of routes,
 * shape ids or numbers.
 */
function toVoiceCommand(result: LlmCommand, transcript: string): VoiceCommand | null {
  const { action, payload } = result;

  if (action === "NAVIGATE") {
    const page = routeToPage(payload.route ?? "");
    return page ? { type: "navigate", page } : null;
  }
  if (action === "SET_2D_FUNC") {
    const equation = payload.equation?.trim();
    if (!equation) return null;
    // Trust the app's own rule over the model's labelling.
    return referencesY(equation)
      ? { type: "setMultiFunction", expression: equation }
      : { type: "setFunction", expression: equation };
  }
  if (action === "SET_MULTI_FUNC") {
    const equation = payload.equation?.trim();
    return equation ? { type: "setMultiFunction", expression: equation } : null;
  }
  if (action === "SELECT_SHAPE") {
    const shapeId = payload.targetShape?.trim().toLowerCase().replace(/\s+/g, "-");
    return shapeId ? { type: "selectShape", shapeId } : null;
  }
  if (action === "AUTO_PLAY") return { type: "autoPlay" };
  if (action === "SET_SPEED") {
    const value = Number(payload.speedMultiplier);
    return Number.isFinite(value) ? { type: "setSpeed", value: clampSpeed(value) } : null;
  }
  if (action === "HELP") {
    const answer = result.feedbackText?.trim() || defaultHelpText();
    return { type: "help", answer };
  }
  if (action === "SKIP") return { type: "skip" };
  return { type: "unknown", transcript };
}

/** Expresses an internal command back in the LLM schema, for the client. */
function toLlmShape(command: VoiceCommand): LlmCommand {
  const feedbackText = feedbackFor(command);
  switch (command.type) {
    case "navigate":
      return { action: "NAVIGATE", payload: { route: pageToRoute(command.page) }, feedbackText };
    case "setFunction":
      return { action: "SET_2D_FUNC", payload: { equation: command.expression }, feedbackText };
    case "setMultiFunction":
      return { action: "SET_MULTI_FUNC", payload: { equation: command.expression }, feedbackText };
    case "selectShape":
      return { action: "SELECT_SHAPE", payload: { targetShape: command.shapeId }, feedbackText };
    case "autoPlay":
      return { action: "AUTO_PLAY", payload: {}, feedbackText };
    case "setSpeed":
      return { action: "SET_SPEED", payload: { speedMultiplier: command.value }, feedbackText };
    case "help":
      return { action: "HELP", payload: {}, feedbackText };
    case "skip":
      return { action: "SKIP", payload: {}, feedbackText };
    default:
      return { action: "UNKNOWN", payload: {}, feedbackText };
  }
}

async function callModel(transcript: string): Promise<LlmCommand | null> {
  if (!API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
        // Muse Spark is a reasoning model and is tuned for default sampling,
        // so temperature is deliberately left unset.
        max_completion_tokens: 512,
        response_format: {
          type: "json_schema",
          json_schema: { name: "ondas_command", strict: true, schema: RESPONSE_SCHEMA },
        },
      }),
    });

    if (!response.ok) {
      console.warn(`[voice] model returned ${response.status}: ${await response.text()}`);
      return null;
    }

    const content = readContent(await response.json());
    if (!content) return null;

    const parsed = extractJson(content) as LlmCommand | null;
    if (!parsed || typeof parsed.action !== "string") return null;
    const feedbackText =
      typeof parsed.feedbackText === "string" && parsed.feedbackText.trim()
        ? parsed.feedbackText.trim()
        : "";
    return { action: parsed.action, payload: parsed.payload ?? {}, feedbackText };
  } catch (err) {
    // Timeouts and network faults fall through to the deterministic parser.
    console.warn("[voice] model call failed:", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  let transcript = "";
  try {
    const body = (await request.json()) as { transcript?: unknown };
    transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!transcript) {
    return NextResponse.json({ error: "A non-empty transcript is required." }, { status: 400 });
  }
  if (transcript.length > 500) transcript = transcript.slice(0, 500);

  const llm = await callModel(transcript);
  const fromLlm = llm ? toVoiceCommand(llm, transcript) : null;

  // The local parser is the safety net. Voice is a primary input for this
  // app's users, so it has to keep working with no key, no network, or a
  // model reply that does not survive validation.
  if (fromLlm && fromLlm.type !== "unknown") {
    const feedbackText = llm!.feedbackText || feedbackFor(fromLlm);
    const payload: VoiceRouteResponse = {
      action: llm!.action,
      payload: llm!.payload ?? {},
      feedbackText,
      command: fromLlm,
      source: "llm",
      transcript,
    };
    return NextResponse.json(payload);
  }

  const local = parseVoiceCommand(transcript);
  const shape = toLlmShape(local);
  const payload: VoiceRouteResponse = {
    action: shape.action,
    payload: shape.payload,
    feedbackText: shape.feedbackText,
    command: local,
    source: "local",
    transcript,
  };
  return NextResponse.json(payload);
}
