/**
 * Zero-latency spoken feedback via the native speech synthesizer.
 * Picks a local English voice when the OS provides one.
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (cachedVoice !== undefined) return cachedVoice;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    cachedVoice = null;
    return null;
  }

  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;
  cachedVoice =
    pool.find((voice) => voice.localService && /en-US/i.test(voice.lang)) ??
    pool.find((voice) => voice.default) ??
    pool.find((voice) => voice.localService) ??
    pool[0] ??
    null;
  return cachedVoice;
}

function attachVoice(utterance: SpeechSynthesisUtterance) {
  const voice = pickEnglishVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "en-US";
  }
}

/**
 * Speaks `text` aloud. When `interrupt` is true (the default), any in-flight
 * utterance is cancelled first so a new confirmation is never queued behind
 * an old one.
 */
export function speak(text: string, interrupt = true): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  if (interrupt) window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.rate = 1.05;
  utterance.pitch = 1;
  attachVoice(utterance);

  // Chrome can report an empty voice list until this event fires.
  if (!utterance.voice) {
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        cachedVoice = undefined;
        attachVoice(utterance);
      },
      { once: true },
    );
  }

  window.speechSynthesis.speak(utterance);
}

export function cancelSpeech(): void {
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
}
