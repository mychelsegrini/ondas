import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "pFZP5JQG7iQjIQuC4Bku";
/** Flash keeps command confirmations snappy; override for a slower studio model. */
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";
const OUTPUT_FORMAT = "mp3_44100_128";
const MAX_CHARS = 2500;

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "ElevenLabs is not configured. Set ELEVENLABS_API_KEY." },
      { status: 503 },
    );
  }

  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with text." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "A non-empty text field is required." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}`);
  url.searchParams.set("output_format", OUTPUT_FORMAT);

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
    }),
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.warn(`[tts] ElevenLabs returned ${upstream.status}: ${detail}`);
    return NextResponse.json(
      { error: "The voice engine could not speak that just now." },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
