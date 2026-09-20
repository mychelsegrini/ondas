"use client";

import { useEffect, useRef } from "react";

import { TUTORIAL_STORAGE_KEY, useVoiceCommands, useVoiceHandler } from "@/contexts/VoiceContext";

export const TUTORIAL_SCRIPT =
  "Welcome to Ondas, where you can hear the shape of mathematics. Say 'hey, skip' at any time to stop this tutorial. You can use your left and right arrow keys to explore functions, or say 'hey' followed by a command to navigate, plot equations, or ask for help.";

const ONBOARDING_KEY = "ondas_onboarding_played";

function alreadyPlayed(): boolean {
  try {
    return (
      sessionStorage.getItem(ONBOARDING_KEY) === "true" ||
      sessionStorage.getItem(TUTORIAL_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function markPlayed() {
  try {
    sessionStorage.setItem(ONBOARDING_KEY, "true");
    sessionStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

/**
 * Spoken welcome. The returned node is identical on the server and the first
 * client paint so it cannot shift the home page DOM.
 */
export function HomeOnboarding() {
  const { isAudioReady, playNeuralTTS, stopNeuralTTS } = useVoiceCommands();
  const skippedRef = useRef(false);

  useVoiceHandler((command) => {
    if (command.type !== "skip") return false;
    skippedRef.current = true;
    markPlayed();
    stopNeuralTTS();
    return true;
  });

  useEffect(() => {
    if (!isAudioReady || skippedRef.current || alreadyPlayed()) return;
    markPlayed();
    void playNeuralTTS(TUTORIAL_SCRIPT);
  }, [isAudioReady, playNeuralTTS]);

  return <div aria-live="polite" className="sr-only" aria-hidden="true" />;
}
