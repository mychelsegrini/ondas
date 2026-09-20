"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One shared speaker for the whole tab. Tutorials, command confirmations and
 * "yes?" prompts all interrupt each other instead of stacking.
 */
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentAbort: AbortController | null = null;
let playGeneration = 0;

function releaseAudio() {
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.removeAttribute("src");
    currentAudio.load();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export function stopNeuralTTS() {
  playGeneration += 1;
  releaseAudio();
}

export function isNeuralBusy(): boolean {
  return currentAbort !== null || Boolean(currentAudio && !currentAudio.paused);
}

/**
 * Fetches ElevenLabs audio through `/api/tts` and plays it. A later call
 * always wins: the in-flight request is aborted and the current element is
 * paused before the new clip starts.
 */
export function useNeuralSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const playNeuralTTS = useCallback(async (text: string) => {
    const spoken = text.trim();
    if (!spoken) return;

    const generation = playGeneration + 1;
    playGeneration = generation;
    releaseAudio();
    if (mountedRef.current) {
      setError(null);
      setIsSpeaking(true);
    }

    const abort = new AbortController();
    currentAbort = abort;
    const timer = window.setTimeout(() => abort.abort(), 8000);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spoken }),
        signal: abort.signal,
      });
      if (playGeneration !== generation) return;
      if (!response.ok) {
        throw new Error(`TTS returned ${response.status}`);
      }

      const blob = await response.blob();
      if (playGeneration !== generation) return;

      const url = URL.createObjectURL(blob);
      currentUrl = url;
      const audio = new Audio(url);
      currentAudio = audio;
      audio.addEventListener("ended", () => {
        if (playGeneration !== generation) return;
        releaseAudio();
        if (mountedRef.current) setIsSpeaking(false);
      });
      audio.addEventListener("error", () => {
        if (playGeneration !== generation) return;
        releaseAudio();
        if (mountedRef.current) {
          setIsSpeaking(false);
          setError("The spoken voice could not be played.");
        }
      });
      await audio.play();
    } catch (err) {
      if (playGeneration !== generation) return;
      releaseAudio();
      if (mountedRef.current) {
        setIsSpeaking(false);
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message ?? "The spoken voice could not be played.");
        }
      }
      if ((err as Error).name !== "AbortError") throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  const stop = useCallback(() => {
    stopNeuralTTS();
    if (mountedRef.current) setIsSpeaking(false);
  }, []);

  return { playNeuralTTS, stopNeuralTTS: stop, isSpeaking, error };
}
