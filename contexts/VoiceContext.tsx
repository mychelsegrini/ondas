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

import { playWakeBoop } from "@/lib/audio/wakeBoop";
import { SHAPES_2D } from "@/lib/shapes2d";
import { feedbackFor } from "@/lib/voice/feedback";
import {
  pageToRoute,
  parseVoiceCommand,
  type VoiceCommand,
} from "@/lib/voice/parseCommand";
import { cancelSpeech, speak } from "@/lib/voice/speak";
import { hasWakeWord, splitWakeWord } from "@/lib/voice/wakeWord";

/** Returning true means "handled, stop propagating to other handlers". */
export type VoiceHandler = (command: VoiceCommand) => boolean;

export type CommandSource = "llm" | "local";

const TUTORIAL_STORAGE_KEY = "ondas-tutorial-played";

interface VoiceContextValue {
  isSupported: boolean;
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
  registerHandler: (handler: VoiceHandler) => () => void;
  announce: (message: string) => void;
  announcement: string;
  submitTranscript: (text: string) => Promise<void>;
  speak: typeof speak;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const handlersRef = useRef<VoiceHandler[]>([]);
  const shouldListenRef = useRef(false);
  const requestIdRef = useRef(0);
  /** Prevents a second boop while the same utterance is still coming in. */
  const boopedRef = useRef(false);

  const [isSupported, setIsSupported] = useState(false);
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

  const applyCommand = useCallback(
    (command: VoiceCommand, feedbackText?: string) => {
      setLastCommand(command);

      const spoken = (feedbackText ?? feedbackFor(command)).trim();
      if (command.type === "skip") {
        cancelSpeech();
        try {
          sessionStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
        } catch {
          /* private mode */
        }
        if (spoken) speak(spoken, true);
      } else if (spoken) {
        speak(spoken, true);
      }
      if (spoken) announce(spoken);

      if (command.type === "skip") {
        for (let i = handlersRef.current.length - 1; i >= 0; i -= 1) {
          handlersRef.current[i](command);
        }
        return;
      }

      // Conversational HELP is the whole action: do not let a page overwrite
      // the spoken answer with a generic command list.
      if (command.type === "help") return;

      for (let i = handlersRef.current.length - 1; i >= 0; i -= 1) {
        if (handlersRef.current[i](command)) return;
      }

      if (command.type === "navigate") {
        router.push(pageToRoute(command.page));
        return;
      }
      if (command.type === "selectShape") {
        const is2D = SHAPES_2D.some((shape) => shape.id === command.shapeId);
        router.push(`/${is2D ? "2d-shapes" : "3d-shapes"}?shape=${command.shapeId}`);
        return;
      }
      if (command.type === "setMultiFunction") {
        router.push(`/multivariable?f=${encodeURIComponent(command.expression)}`);
        return;
      }
      if (command.type === "setFunction") {
        router.push(`/functions?f=${encodeURIComponent(command.expression)}`);
        return;
      }
      if (command.type === "autoPlay") {
        router.push("/functions?play=1");
        return;
      }
      if (command.type === "setSpeed") {
        router.push(`/functions?speed=${command.value}`);
        return;
      }
      if (
        command.type === "setXMin" ||
        command.type === "setXMax" ||
        command.type === "setDomain"
      ) {
        router.push("/functions");
      }
    },
    [announce, router],
  );

  /**
   * Routes a command string (already stripped of the wake word). Used by the
   * recogniser and by tests. Speaks `feedbackText` before any navigation.
   */
  const submitTranscript = useCallback(
    async (text: string) => {
      const phrase = text.trim();
      if (!phrase) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsRouting(true);

      try {
        const response = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: phrase }),
        });
        if (!response.ok) throw new Error(`Voice router returned ${response.status}`);
        const data = (await response.json()) as {
          command: VoiceCommand;
          source: CommandSource;
          feedbackText?: string;
        };
        if (requestIdRef.current !== requestId) return;
        setLastSource(data.source);
        applyCommand(data.command, data.feedbackText);
      } catch {
        if (requestIdRef.current !== requestId) return;
        setLastSource("local");
        const command = parseVoiceCommand(phrase);
        applyCommand(command, feedbackFor(command));
      } finally {
        if (requestIdRef.current === requestId) {
          setIsRouting(false);
          setIsAwake(false);
        }
      }
    },
    [applyCommand],
  );

  const submitRef = useRef(submitTranscript);
  submitRef.current = submitTranscript;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        setTranscript(text);

        // Boop on the first interim chunk that contains the wake word so the
        // listener hears confirmation before they finish the sentence.
        if (!boopedRef.current && hasWakeWord(text)) {
          boopedRef.current = true;
          setIsAwake(true);
          playWakeBoop();
        }

        if (!result.isFinal || !text) continue;

        boopedRef.current = false;
        const { hasWake, command } = splitWakeWord(text);
        if (!hasWake) continue;

        if (!command) {
          speak("Yes?", true);
          announce("Listening for a command.");
          continue;
        }
        void submitRef.current(command);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed"
          ? "Microphone access was denied. Enable it in your browser to use voice commands."
          : `Speech recognition error: ${event.error}`,
      );
      shouldListenRef.current = false;
      setIsListening(false);
      setIsAwake(false);
    };

    recognition.onend = () => {
      boopedRef.current = false;
      if (shouldListenRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          /* restart raced with a manual stop */
        }
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      shouldListenRef.current = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* nothing to abort */
      }
      recognitionRef.current = null;
    };
  }, [announce]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    shouldListenRef.current = true;
    setError(null);
    try {
      recognition.start();
      setIsListening(true);
      announce("Listening for Hey Ondas.");
    } catch {
      setIsListening(true);
    }
  }, [announce]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    shouldListenRef.current = false;
    setIsListening(false);
    setIsAwake(false);
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
    announce("Voice commands off.");
  }, [announce]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

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
      registerHandler,
      announce,
      announcement,
      submitTranscript,
      speak,
    }),
    [
      announce,
      announcement,
      error,
      isAwake,
      isListening,
      isRouting,
      isSupported,
      lastCommand,
      lastSource,
      registerHandler,
      startListening,
      stopListening,
      submitTranscript,
      toggleListening,
      transcript,
    ],
  );

  return (
    <VoiceContext.Provider value={value}>
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
