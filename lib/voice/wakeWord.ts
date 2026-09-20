const WAKE_PATTERN = /^(?:hey|hi)\s+ondas\b/;

/** Strips punctuation so "Hey, Ondas!" and "hi ondas:" both match. */
export function normalizeWakeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasWakeWord(text: string): boolean {
  return WAKE_PATTERN.test(normalizeWakeText(text));
}

/**
 * Splits a transcript into the wake word (if any) and the command that follows.
 * The command is the original wording with only the leading wake phrase removed,
 * so the parser still sees "plot sine of x" rather than a fully normalised string.
 */
export function splitWakeWord(text: string): { hasWake: boolean; command: string } {
  const normalised = normalizeWakeText(text);
  if (!WAKE_PATTERN.test(normalised)) return { hasWake: false, command: text.trim() };

  const match = text.match(/^(?:hey|hi)[^\w]*ondas\b[^\w]*/i);
  const command = match ? text.slice(match[0].length).trim() : normalised.replace(WAKE_PATTERN, "").trim();
  return { hasWake: true, command };
}
