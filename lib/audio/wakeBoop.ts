/**
 * A short low sine confirming the wake word was heard. Kept off the Tone.js
 * graphs so it cannot leak into a sonification scan.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx || ctx.state === "closed") ctx = new Ctor();
  return ctx;
}

/** ~90 ms, 196 Hz (G3), quiet enough not to mask the following TTS. */
export function playWakeBoop(): void {
  const audio = context();
  if (!audio) return;

  void audio.resume();
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(196, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.1);
  osc.addEventListener("ended", () => {
    osc.disconnect();
    gain.disconnect();
  });
}
