/** Wake words are just "hey" or "hi". Chrome rarely transcribes "Ondas" correctly. */
const WAKE_PATTERN = /^(hey|hi)\b/;

/** Turns "Hey, play the cube." into "hey play the cube". */
export function normalizeWakeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasWakeWord(text: string): boolean {
  return WAKE_PATTERN.test(normalizeWakeText(text));
}

/**
 * Splits a transcript into the wake word (if any) and the command that follows.
 * The command keeps the original wording so spoken math keeps its operators.
 */
export function splitWakeWord(text: string): { hasWake: boolean; command: string } {
  const cleaned = normalizeWakeText(text);
  const cleanedMatch = cleaned.match(/^(hey|hi)\s*/);
  if (!cleanedMatch || !WAKE_PATTERN.test(cleaned)) return { hasWake: false, command: text.trim() };

  const original = text.match(/^(?:hey|hi)\b[^\w]*/i);
  const command = original
    ? text.slice(original[0].length).trim()
    : cleaned.slice(cleanedMatch[0].length).trim();
  return { hasWake: true, command };
}
