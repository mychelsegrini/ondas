import { NextResponse } from "next/server";

import {
  parseVoiceCommand,
  referencesY,
  resolveShapeId,
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
const API_URL =
  process.env.META_API_URL ?? `${BASE_URL.replace(/\/+$/, "")}/chat/completions`;
const MODEL = process.env.META_MODEL ?? "muse-spark-1.3";
const API_KEY = process.env.META_API_KEY ?? process.env.MODEL_API_KEY;
/** Voice control must feel instant; a slow model is worse than no model. */
const TIMEOUT_MS = Number(process.env.META_TIMEOUT_MS ?? 20000);

export type LlmAction =
  | "NAVIGATE"
  | "SET_2D_FUNC"
  | "SET_MULTI_FUNC"
  | "SELECT_SHAPE"
  | "AUTO_PLAY"
  | "SET_SPEED"
  | "HELP"
  | "SKIP"
  | "ERROR";

export interface LlmPayload {
  route?: string | null;
  equation?: string | null;
  targetShape?: string | null;
  speedMultiplier?: number | null;
}

export interface LlmCommand {
  action: LlmAction | "UNKNOWN";
  payload: LlmPayload;
  /** Exact sentence the client reads aloud before acting. */
  feedbackText: string;
}

export interface VoiceRouteResponse {
  action: LlmAction | "UNKNOWN" | "ERROR";
  payload: LlmPayload;
  feedbackText: string;
  command: VoiceCommand;
  source: "llm" | "local";
  transcript: string;
}

const CONNECT_ERROR =
  "I'm sorry, I couldn't connect to the server. Please check your API keys.";

const SYSTEM_PROMPT = `You are Muse, the intelligent voice assistant for 'Ondas', an accessible web application that sonifies mathematics for visually impaired users.
Your job is to interpret the user's spoken command and route them to the correct action.

### Critical Rules:
1. You must output ONLY valid JSON. No markdown formatting, no conversational filler before or after the JSON.
2. The 'feedbackText' will be read aloud by a TTS engine. It must be concise, natural, and contain NO markdown (no *, #, or \` symbols). Spell out symbols if necessary (e.g., "sine of x", not "sin(x)").
3. Always be helpful. If the user is confused or asks what they can do, guide them concisely.

### Application Knowledge Base:
- Sections Available: 2D Functions, Multivariable Calculus, 2D Shapes, and 3D Shapes.
- 2D Shapes Available: Square, Rectangle, Equilateral Triangle, Circle, Regular Pentagon, Regular Hexagon.
- 3D Shapes Available: Sphere, Cube, Pyramid, Cylinder, Cone, Ellipsoid, Rectangular Prism, Triangular Prism, and 'Single Random Point'.
- Functionalities: Users can plot equations, change the speed of the cursor (0.2x to 5x), and explore shapes via spatial audio.

### Expected JSON Schema:
{
  "action": "NAVIGATE" | "SET_2D_FUNC" | "SET_MULTI_FUNC" | "SELECT_SHAPE" | "SET_SPEED" | "HELP" | "UNKNOWN",
  "payload": {
    "route": "string or null",
    "equation": "string or null (format for math.js)",
    "targetShape": "string or null",
    "speedMultiplier": "number or null"
  },
  "feedbackText": "string (The exact words the TTS should say to the user)"
}

### Examples:
- User: "What 3D shapes do you have?"
  Response: {"action": "HELP", "payload": {}, "feedbackText": "In the 3D shapes library, we have a Sphere, Cube, Pyramid, Cylinder, Cone, Ellipsoid, Rectangular and Triangular prisms, and a single random spatial point."}
- User: "Plot x squared plus two"
  Response: {"action": "SET_2D_FUNC", "payload": {"equation": "x^2 + 2"}, "feedbackText": "Plotting function x squared plus two."}
- User: "Play the circle"
  Response: {"action": "SELECT_SHAPE", "payload": {"targetShape": "circle", "route": "/2d-shapes"}, "feedbackText": "Scanning the perimeter of a circle."}
- User: "Make it faster, 2x speed"
  Response: {"action": "SET_SPEED", "payload": {"speedMultiplier": 2}, "feedbackText": "Cursor speed set to 2x."}
`;

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
        "SET_SPEED",
        "HELP",
        "UNKNOWN",
      ],
    },
    payload: {
      type: "object",
      additionalProperties: false,
      required: ["route", "equation", "targetShape", "speedMultiplier"],
      properties: {
        route: { type: ["string", "null"] },
        equation: { type: ["string", "null"] },
        targetShape: { type: ["string", "null"] },
        speedMultiplier: { type: ["number", "null"] },
      },
    },
    feedbackText: { type: "string" },
  },
} as const;

/** Pulls the first JSON object out of a reply that may be wrapped in markdown fences. */
function extractJson(text: string): unknown | null {
  const stripped = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(stripped.slice(start, end + 1));
    } catch (parseError) {
      console.error("❌ Failed to parse LLM output as JSON:", stripped.slice(0, 800), parseError);
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
    const shapeId = resolveShapeId(payload.targetShape ?? "");
    if (!shapeId) return null;
    const page = payload.route ? routeToPage(payload.route) : null;
    const route = page === "2d-shapes" || page === "3d-shapes" ? pageToRoute(page) : undefined;
    return { type: "selectShape", shapeId, route };
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
  if (action === "ERROR") {
    return { type: "help", answer: result.feedbackText?.trim() || CONNECT_ERROR };
  }
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

function errorPayload(transcript: string): VoiceRouteResponse {
  return {
    action: "ERROR",
    payload: {},
    feedbackText: CONNECT_ERROR,
    command: { type: "help", answer: CONNECT_ERROR },
    source: "local",
    transcript,
  };
}

async function requestCompletion(
  transcript: string,
  forceJsonObject: boolean,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
      max_completion_tokens: 2048,
      response_format: forceJsonObject
        ? { type: "json_object" }
        : {
            type: "json_schema",
            json_schema: { name: "ondas_command", strict: true, schema: RESPONSE_SCHEMA },
          },
    }),
  });
}

async function callModel(transcript: string): Promise<LlmCommand | null> {
  if (!API_KEY) {
    console.error("❌ META_API_KEY is missing from environment variables.");
    return null;
  }

  console.log("🗣️ Sending to Muse (Meta LLM):", transcript);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response = await requestCompletion(transcript, false, controller.signal);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ LLM API Provider Error:", errorText);
      // Some gateways reject json_schema; retry with generic JSON mode.
      if (response.status === 400) {
        response = await requestCompletion(transcript, true, controller.signal);
        if (!response.ok) {
          console.error("❌ LLM API Provider Error:", await response.text());
          return null;
        }
      } else {
        return null;
      }
    }

    const body = await response.json();
    const content = readContent(body);
    if (!content) {
      console.error("❌ LLM empty model content:", JSON.stringify(body).slice(0, 800));
      return null;
    }

    const parsed = extractJson(content) as LlmCommand | null;
    if (!parsed || typeof parsed.action !== "string") {
      console.error("❌ Failed to parse LLM output as JSON:", content.slice(0, 800));
      return null;
    }
    const feedbackText =
      typeof parsed.feedbackText === "string" && parsed.feedbackText.trim()
        ? parsed.feedbackText.trim()
        : "";
    const command = { action: parsed.action, payload: parsed.payload ?? {}, feedbackText };
    console.log("✅ LLM Successfully Parsed:", command);
    return command;
  } catch (err) {
    console.error("❌ Internal Server Error in /api/voice:", err);
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
  } catch (error) {
    console.error("❌ Voice Pipeline Error:", error);
    return NextResponse.json(errorPayload(""));
  }

  if (!transcript) {
    return NextResponse.json(errorPayload(""));
  }
  if (transcript.length > 500) transcript = transcript.slice(0, 500);

  try {
    const llm = await callModel(transcript);
    const fromLlm = llm ? toVoiceCommand(llm, transcript) : null;

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
      console.log("[voice] source=llm action=", payload.action);
      return NextResponse.json(payload);
    }

    const local = parseVoiceCommand(transcript);
    if (local.type !== "unknown") {
      const shape = toLlmShape(local);
      const payload: VoiceRouteResponse = {
        action: shape.action,
        payload: shape.payload,
        feedbackText: shape.feedbackText,
        command: local,
        source: "local",
        transcript,
      };
      console.log("[voice] source=local action=", payload.action);
      return NextResponse.json(payload);
    }

    if (!llm) return NextResponse.json(errorPayload(transcript));

    const unclear =
      llm.feedbackText?.trim() ||
      "I did not catch that. Try saying hey, help.";
    return NextResponse.json({
      action: "UNKNOWN",
      payload: {},
      feedbackText: unclear,
      command: { type: "help", answer: unclear },
      source: "llm",
      transcript,
    } satisfies VoiceRouteResponse);
  } catch (error) {
    console.error("❌ Voice Pipeline Error:", error);
    return NextResponse.json(errorPayload(transcript));
  }
}
