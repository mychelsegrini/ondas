"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Tone from "tone";

import { playWakeBoop } from "@/lib/audio/wakeBoop";
import { useNeuralSpeech } from "@/hooks/useNeuralSpeech";
import { SHAPES_2D } from "@/lib/shapes2d";
import {
  resolveShapeId,
  type VoiceCommand,
} from "@/lib/voice/parseCommand";
import { hasWakeWord, normalizeWakeText, splitWakeWord } from "@/lib/voice/wakeWord";

/** Returning true means "handled, stop propagating to other handlers". */
export type VoiceHandler = (command: VoiceCommand) => boolean;

export type CommandSource = "llm" | "local";

const TUTORIAL_STORAGE_KEY = "ondas-tutorial-played";
const RESTART_MS = 500;
const MAX_RESTARTS = 8;
const CONNECT_ERROR =
  "I'm sorry, I couldn't connect to the server. Please check your API keys.";

type LlmPayload = {
  route?: string | null;
  equation?: string | null;
  targetShape?: string | null;
  speedMultiplier?: number | null;
};

type VoiceApiResponse = {
  action?: string;
  payload?: LlmPayload;
  feedbackText?: string;
  command?: VoiceCommand;
  source?: CommandSource;
  error?: string;
  details?: string;
};

function normalizeRoute(route?: string | null): string | null {
  if (!route || typeof route !== "string") return null;
  const trimmed = route.trim();
  if (!trimmed || trimmed === "null") return null;
  if (trimmed === "home") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function speechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

interface VoiceContextValue {
  isSupported: boolean;
  isAudioReady: boolean;
  isListening: boolean;
  isRouting: boolean;
  /** True from the wake-word boop until the command is applied. */
  isAwake: boolean;
  transcript: string;
  lastCommand: VoiceCommand | null;
  lastSource: CommandSource | null;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  initializeAudio: () => Promise<void>;
  registerHandler: (handler: VoiceHandler) => () => void;
  announce: (message: string) => void;
  announcement: string;
  submitTranscript: (text: string) => Promise<void>;
  playNeuralTTS: (text: string) => Promise<void>;
  stopNeuralTTS: () => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { playNeuralTTS, stopNeuralTTS } = useNeuralSpeech();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const handlersRef = useRef<VoiceHandler[]>([]);
  const shouldListenRef = useRef(false);
  const requestIdRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartCountRef = useRef(0);
  const audioReadyRef = useRef(false);

  const [isSupported, setIsSupported] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [lastSource, setLastSource] = useState<CommandSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const announce = useCallback((message: string) => {
    setAnnouncement((previous) => (previous === message ? `${message}\u200b` : message));
  }, []);

  const registerHandler = useCallback((handler: VoiceHandler) => {
    handlersRef.current = [...handlersRef.current, handler];
    return () => {
      handlersRef.current = handlersRef.current.filter((candidate) => candidate !== handler);
    };
  }, []);

  const executeLlmAction = useCallback(
    (data: VoiceApiResponse) => {
      try {
        const payload = data.payload ?? {};
      switch (data.action) {
        case "NAVIGATE": {
          const route = normalizeRoute(payload.route);
          if (route) {
            console.log("🧭 Navigating to:", route);
            router.push(route);
          }
          break;
        }
        case "SET_2D_FUNC":
          if (payload.equation) {
            console.log("📈 Setting 2D function:", payload.equation);
            window.dispatchEvent(
              new CustomEvent("ondas-set-equation", { detail: payload.equation }),
            );
            router.push(`/functions?f=${encodeURIComponent(payload.equation)}`);
          }
          break;
        case "SET_MULTI_FUNC":
          if (payload.equation) {
            console.log("📈 Setting surface:", payload.equation);
            window.dispatchEvent(
              new CustomEvent("ondas-set-equation", { detail: payload.equation }),
            );
            router.push(`/multivariable?f=${encodeURIComponent(payload.equation)}`);
          }
          break;
        case "SELECT_SHAPE":
          if (payload.targetShape) {
            const shapeId =
              resolveShapeId(String(payload.targetShape)) ??
              String(payload.targetShape).trim().toLowerCase();
            console.log("🔷 Selecting shape:", shapeId);
            window.dispatchEvent(new CustomEvent("ondas-select-shape", { detail: shapeId }));
            const hinted = normalizeRoute(payload.route);
            if (hinted) {
              router.push(`${hinted.split("?")[0]}?shape=${encodeURIComponent(shapeId)}`);
            } else {
              const is2D = SHAPES_2D.some((shape) => shape.id === shapeId);
              router.push(`/${is2D ? "2d-shapes" : "3d-shapes"}?shape=${encodeURIComponent(shapeId)}`);
            }
          }
          break;
        case "SET_SPEED":
          if (payload.speedMultiplier != null && Number.isFinite(Number(payload.speedMultiplier))) {
            const speed = Number(payload.speedMultiplier);
            console.log("⏩ Setting speed:", speed);
            window.dispatchEvent(new CustomEvent("ondas-set-speed", { detail: speed }));
            router.push(`/functions?speed=${encodeURIComponent(String(speed))}`);
          }
          break;
        case "AUTO_PLAY":
          console.log("▶️ Auto play");
          router.push("/functions?play=1");
          break;
        case "ERROR":
        case "UNKNOWN":
        case "HELP":
        default:
          break;
      }

      const command = data.command;
      if (!command || command.type === "help" || command.type === "unknown") return;
      if (command.type === "skip") {
        try {
          sessionStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
        } catch {
          /* private mode */
        }
        stopNeuralTTS();
        for (let i = handlersRef.current.length - 1; i >= 0; i -= 1) {
          handlersRef.current[i](command);
        }
        return;
      }
      for (let i = handlersRef.current.length - 1; i >= 0; i -= 1) {
        if (handlersRef.current[i](command)) return;
      }
      } catch (error) {
        console.error("❌ executeLlmAction failed:", error, data);
      }
    },
    [router, stopNeuralTTS],
  );

  const submitTranscript = useCallback(
    async (text: string) => {
      const phrase = text.trim();
      if (!phrase) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsRouting(true);

      try {
        console.log("📡 Sending to /api/voice...", requestId);
        const response = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: phrase }),
        });

        let data: VoiceApiResponse = {};
        try {
          data = (await response.json()) as VoiceApiResponse;
        } catch (error) {
          console.error("❌ Complete Pipeline Failure:", error);
          if (requestIdRef.current !== requestId) return;
          try {
            await playNeuralTTS("Sorry, I encountered an error connecting to the server.");
          } catch (ttsError) {
            console.error("❌ ElevenLabs TTS Failed:", ttsError);
          }
          return;
        }

        if (!response.ok) {
          console.error("Frontend Voice API Error:", data);
          throw new Error(`Voice API returned status ${response.status}`);
        }

        console.log("🤖 Parsed LLM Command:", data, "source:", data.source);
        if (requestIdRef.current !== requestId) {
          console.log("⏭️ Stale response ignored", requestId);
          return;
        }
        setLastSource(data.source ?? "llm");
        if (data.command) setLastCommand(data.command);

        if (data.feedbackText) {
          void playNeuralTTS(data.feedbackText).catch((ttsError) => {
            console.error("❌ ElevenLabs TTS Failed:", ttsError);
          });
          announce(data.feedbackText);
        }

        executeLlmAction(data);
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          console.log("⏭️ Stale response ignored", requestId);
          return;
        }
        console.error("❌ Complete Pipeline Failure:", error);
        try {
          await playNeuralTTS("Sorry, I encountered an error connecting to the server.");
        } catch (ttsError) {
          console.error("❌ ElevenLabs TTS Failed:", ttsError);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsRouting(false);
          setIsAwake(false);
        }
      }
    },
    [announce, executeLlmAction, playNeuralTTS],
  );

  const submitRef = useRef(submitTranscript);
  submitRef.current = submitTranscript;
  const playRef = useRef(playNeuralTTS);
  playRef.current = playNeuralTTS;
  const stopRef = useRef(stopNeuralTTS);
  stopRef.current = stopNeuralTTS;
  const announceRef = useRef(announce);
  announceRef.current = announce;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const scheduleRestart = useCallback(
    (recognition: SpeechRecognition) => {
      if (!shouldListenRef.current) return;
      if (restartCountRef.current >= MAX_RESTARTS) {
        shouldListenRef.current = false;
        setIsListening(false);
        setError("Microphone disconnected. Press Shift + V to listen again.");
        void playRef.current(
          "Microphone disconnected. Press Shift V to listen again.",
        ).catch((error) => console.error("❌ ElevenLabs TTS Failed:", error));
        return;
      }
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!shouldListenRef.current) return;
        try {
          recognition.start();
        } catch (error) {
          const message = (error as Error).message ?? "";
          if (message.includes("already") || (error as Error).name === "InvalidStateError") {
            console.warn("Recognition already active, skipping start():", error);
            return;
          }
          console.error("❌ Voice Pipeline Error:", error);
        }
      }, RESTART_MS);
    },
    [clearRestartTimer],
  );

  const bindRecognition = useCallback(
    (recognition: SpeechRecognition) => {
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        console.log("🎙️ Mic started successfully");
        restartCountRef.current = 0;
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        if (!result?.isFinal) return;
        const rawTranscript = result[0]?.transcript ?? "";
        console.log("🗣️ User said:", rawTranscript);
        if (!rawTranscript.trim()) return;
        setTranscript(rawTranscript.trim());

        const cleaned = normalizeWakeText(rawTranscript);
        console.log("🧹 Cleaned transcript:", cleaned);
        if (!hasWakeWord(rawTranscript)) return;

        const { command } = splitWakeWord(rawTranscript);
        console.log("🚨 Wake word detected! Full command:", rawTranscript, "stripped:", command);
        stopRef.current();
        setIsAwake(true);
        void playWakeBoop().catch((error) => {
          console.warn("⚠️ Wake boop failed (continuing anyway):", error);
        });
        void submitRef.current(command || "help");
      };

      recognition.onerror = (event) => {
        console.error("❌ Voice Pipeline Error:", event.error);
        if (event.error === "not-allowed") {
          shouldListenRef.current = false;
          setIsListening(false);
          setIsAwake(false);
          setError("Microphone access was denied. Enable it in your browser to use voice commands.");
          return;
        }
        if (event.error !== "no-speech" && event.error !== "aborted" && event.error !== "network") {
          setError(`Speech recognition error: ${event.error}`);
          restartCountRef.current += 1;
        }
        scheduleRestart(recognition);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (shouldListenRef.current) scheduleRestart(recognition);
      };
    },
    [scheduleRestart],
  );

  const initializeAudio = useCallback(async () => {
    if (audioReadyRef.current) return;
    audioReadyRef.current = true;
    setIsAudioReady(true);

    try {
      await Tone.start();

      const Recognition = speechRecognitionCtor();
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        void navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => stream.getTracks().forEach((track) => track.stop()))
          .catch((error) => {
            console.error("❌ Voice Pipeline Error:", error);
            setError("Microphone access was denied. Enable it in your browser to use voice commands.");
          });
      }

      if (!Recognition) {
        setIsSupported(false);
        announceRef.current("Audio is ready. Voice commands are not supported in this browser.");
        return;
      }

      setIsSupported(true);
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onstart = null;
        try {
          recognitionRef.current.abort();
        } catch {
          /* already stopped */
        }
      }
      const recognition = new Recognition();
      bindRecognition(recognition);
      recognitionRef.current = recognition;
      shouldListenRef.current = true;
      restartCountRef.current = 0;
      try {
        recognition.start();
        announceRef.current("Listening for hey or hi.");
      } catch (error) {
        console.error("❌ Voice Pipeline Error:", error);
        scheduleRestart(recognition);
      }
    } catch (error) {
      console.error("❌ Voice Pipeline Error:", error);
      audioReadyRef.current = false;
      setIsAudioReady(false);
    }
  }, [bindRecognition, scheduleRestart]);

  useEffect(() => {
    setIsSupported(Boolean(speechRecognitionCtor()));
    return () => {
      shouldListenRef.current = false;
      clearRestartTimer();
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.onstart = null;
        try {
          recognition.abort();
        } catch (error) {
          console.error("❌ Voice Pipeline Error:", error);
        }
      }
      recognitionRef.current = null;
    };
  }, [clearRestartTimer]);

  const startListening = useCallback(() => {
    if (!audioReadyRef.current) {
      void initializeAudio();
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) return;
    shouldListenRef.current = true;
    restartCountRef.current = 0;
    setError(null);
    try {
      recognition.start();
      setIsListening(true);
      announce("Listening for hey or hi.");
    } catch (error) {
      const message = (error as Error).message ?? "";
      if (message.includes("already") || (error as Error).name === "InvalidStateError") {
        console.warn("Recognition already active, skipping start():", error);
        setIsListening(true);
        return;
      }
      console.error("❌ Voice Pipeline Error:", error);
      setIsListening(true);
    }
  }, [announce, initializeAudio]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    clearRestartTimer();
    setIsListening(false);
    setIsAwake(false);
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (error) {
      console.error("❌ Voice Pipeline Error:", error);
    }
    announce("Voice commands off.");
  }, [announce, clearRestartTimer]);

  const toggleListening = useCallback(() => {
    if (!audioReadyRef.current) {
      void initializeAudio();
      return;
    }
    if (isListening) stopListening();
    else startListening();
  }, [initializeAudio, isListening, startListening, stopListening]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "v" || !event.shiftKey || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      event.preventDefault();
      toggleListening();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleListening]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      isSupported,
      isAudioReady,
      isListening,
      isRouting,
      isAwake,
      transcript,
      lastCommand,
      lastSource,
      error,
      startListening,
      stopListening,
      toggleListening,
      initializeAudio,
      registerHandler,
      announce,
      announcement,
      submitTranscript,
      playNeuralTTS,
      stopNeuralTTS,
    }),
    [
      announce,
      announcement,
      error,
      initializeAudio,
      isAudioReady,
      isAwake,
      isListening,
      isRouting,
      isSupported,
      lastCommand,
      lastSource,
      playNeuralTTS,
      registerHandler,
      startListening,
      stopListening,
      stopNeuralTTS,
      submitTranscript,
      toggleListening,
      transcript,
    ],
  );

  return (
    <VoiceContext.Provider value={value}>
      {!isAudioReady ? (
        <button
          type="button"
          autoFocus
          className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-zinc-950 px-6 text-center"
          onClick={() => void initializeAudio()}
        >
          <span className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Click anywhere to initialize Audio & Voice Controls
          </span>
          <span className="mt-4 max-w-lg text-base text-zinc-400">
            Press Enter or click. Browsers block the microphone and speakers until you do.
          </span>
        </button>
      ) : null}
      {children}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </VoiceContext.Provider>
  );
}

export function useVoiceCommands(): VoiceContextValue {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useVoiceCommands must be used inside a VoiceProvider.");
  }
  return context;
}

export function useVoiceHandler(handler: VoiceHandler) {
  const { registerHandler } = useVoiceCommands();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return registerHandler((command) => handlerRef.current(command));
  }, [registerHandler]);
}

export { TUTORIAL_STORAGE_KEY };
