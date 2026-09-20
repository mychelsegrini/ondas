"use client";

import { useEffect, useRef, useState } from "react";

import { TUTORIAL_STORAGE_KEY, useVoiceCommands, useVoiceHandler } from "@/contexts/VoiceContext";
import { speak } from "@/lib/voice/speak";

export const TUTORIAL_SCRIPT =
  "Welcome to Ondas, where you can hear the shape of mathematics. You can use your left and right arrow keys to explore functions. Say 'Hey Ondas' followed by a command to navigate, plot equations, or ask for help. Say 'Hey Ondas, skip' at any time to stop this tutorial.";

function alreadyPlayed(): boolean {
  try {
    return sessionStorage.getItem(TUTORIAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markPlayed() {
  try {
    sessionStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

/**
 * First-load spoken tutorial. Browsers often block speech until a gesture, so
 * we try on mount and retry on the first key or click if the utterance never
 * started.
 */
export function HomeOnboarding() {
  const { isSupported, isListening, startListening } = useVoiceCommands();
  const [status, setStatus] = useState<"pending" | "playing" | "done">(
    alreadyPlayed() ? "done" : "pending",
  );
  const skippedRef = useRef(false);
  const startedRef = useRef(alreadyPlayed());

  const play = (alsoListen: boolean) => {
    if (skippedRef.current || alreadyPlayed()) {
      setStatus("done");
      return;
    }
    startedRef.current = true;
    markPlayed();
    setStatus("playing");
    speak(TUTORIAL_SCRIPT, true);
    if (alsoListen && isSupported && !isListening) startListening();
  };

  useVoiceHandler((command) => {
    if (command.type !== "skip") return false;
    skippedRef.current = true;
    markPlayed();
    setStatus("done");
    return true;
  });

  useEffect(() => {
    if (alreadyPlayed()) {
      setStatus("done");
      return;
    }

    play(false);

    const onGesture = () => {
      if (skippedRef.current) return;
      const synth = window.speechSynthesis;
      const blocked = !synth.speaking && !synth.pending;
      if (blocked) {
        // Mount-time speak was swallowed; replay after the gesture.
        startedRef.current = false;
        try {
          sessionStorage.removeItem(TUTORIAL_STORAGE_KEY);
        } catch {
          /* private mode */
        }
      }
      play(true);
    };

    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    // Once per visit; the session flag is the repeat guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "done") return null;

  return (
    <p className="sr-only" aria-live="polite">
      {status === "playing"
        ? TUTORIAL_SCRIPT
        : "Welcome tutorial is ready. Press any key or click to hear it. Say Hey Ondas, skip to stop it."}
    </p>
  );
}
