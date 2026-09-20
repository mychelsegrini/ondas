import * as Tone from "tone";

/**
 * A short 440 Hz sine confirming the wake word was heard. Uses Tone.js so it
 * shares the user-gesture-unlocked audio context with the rest of the app.
 */
export async function playWakeBoop(): Promise<void> {
  try {
    if (Tone.getContext().state !== "running") {
      await Tone.start().catch(() => undefined);
    }
    const osc = new Tone.Oscillator({
      frequency: 440,
      type: "sine",
      volume: -14,
    }).toDestination();
    osc.start();
    osc.stop("+0.1");
    window.setTimeout(() => {
      osc.dispose();
    }, 200);
  } catch (error) {
    console.error("❌ Voice Pipeline Error:", error);
  }
}
