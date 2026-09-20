"use client";

import { useEffect } from "react";

import { useVoiceCommands } from "@/contexts/VoiceContext";

/**
 * Plays a section intro once per browser session, after the user has unlocked
 * audio. Session storage is the repeat guard so navigating away and back does
 * not restart the speech.
 */
export function SectionTutorial({ script, storageKey }: { script: string; storageKey: string }) {
  const { isAudioReady, playNeuralTTS } = useVoiceCommands();

  useEffect(() => {
    if (!isAudioReady) return;
    try {
      if (sessionStorage.getItem(storageKey) === "1") return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* private mode: play once this mount only */
    }
    void playNeuralTTS(script);
  }, [isAudioReady, playNeuralTTS, script, storageKey]);

  return (
    <p className="sr-only" aria-live="polite">
      {script}
    </p>
  );
}
