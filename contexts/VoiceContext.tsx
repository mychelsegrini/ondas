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

import { SHAPES_2D } from "@/lib/shapes2d";
import {
  pageToRoute,
  parseVoiceCommand,
  VOICE_EXAMPLES,
  type VoiceCommand,
  type VoicePage,
} from "@/lib/voice/parseCommand";

/** Returning true means "handled, stop propagating to other handlers". */
export type VoiceHandler = (command: VoiceCommand) => boolean;

/** Where the interpretation came from, shown in the UI so it is never a mystery. */
export type CommandSource = "llm" | "local";

const PAGE_LABELS: Record<VoicePage, string> = {
  home: "home page",
  functions: "functions explorer",
  "2d-shapes": "2D shapes library",
  "3d-shapes": "3D shapes library",
  multivariable: "surface explorer",
};

interface VoiceContextValue {
  isSupported: boolean;
  isListening: boolean;
  /** True while a transcript is being routed by the language model. */
  isRouting: boolean;
  transcript: string;
  lastCommand: VoiceCommand | null;
  lastSource: CommandSource | null;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  /** Pages register their own handlers; the most recent one gets first refusal. */
  registerHandler: (handler: VoiceHandler) => () => void;
  /** Sends a message to the global polite live region. */
  announce: (message: string) => void;
  announcement: string;
  /** Routes a phrase exactly as if it had been spoken. Useful for testing. */
  submitTranscript: (text: string) => Promise<void>;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const handlersRef = useRef<VoiceHandler[]>([]);
  const shouldListenRef = useRef(false);
  /** Guards against an earlier, slower round trip overwriting a newer one. */
  const requestIdRef = useRef(0);

  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [lastSource, setLastSource] = useState<CommandSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const announce = useCallback((message: string) => {
    // Re-announce identical messages by nudging the string with a zero width space.
    setAnnouncement((previous) => (previous === message ? `${message}\u200b` : message));
  }, []);

  const registerHandler = useCallback((handler: VoiceHandler) => {
    handlersRef.current = [...handlersRef.current, handler];
    return () => {
      handlersRef.current = handlersRef.current.filter((candidate) => candidate !== handler);
    };
  }, []);

  /** Offers a command to the mounted pages, then to the app-wide fallbacks. */
  const applyCommand = useCallback(
    (command: VoiceCommand) => {
      setLastCommand(command);

      for (let i = handlersRef.current.length - 1; i >= 0; i -= 1) {
        if (handlersRef.current[i](command)) return;
      }

      // Fallbacks that work from anywhere in the app.
      if (command.type === "navigate") {
        router.push(pageToRoute(command.page));
        announce(`Opening the ${PAGE_LABELS[command.page]}.`);
        return;
      }
      if (command.type === "selectShape") {
        // The shape's own library page owns the command, so route by dimension.
        const is2D = SHAPES_2D.some((shape) => shape.id === command.shapeId);
        router.push(`/${is2D ? "2d-shapes" : "3d-shapes"}?shape=${command.shapeId}`);
        return;
      }
      if (command.type === "setMultiFunction") {
        // Carry the equation across the navigation so it is not lost.
        router.push(`/multivariable?f=${encodeURIComponent(command.expression)}`);
        announce(`Opening the surface explorer with z equals ${command.expression}.`);
        return;
      }
      if (command.type === "setFunction") {
        router.push(`/functions?f=${encodeURIComponent(command.expression)}`);
        announce(`Opening the functions explorer with y equals ${command.expression}.`);
        return;
      }
      if (command.type === "autoPlay") {
        router.push("/functions?play=1");
        announce("Opening the functions explorer to play the curve.");
        return;
      }
      if (command.type === "setSpeed") {
        router.push(`/functions?speed=${command.value}`);
        announce(`Opening the functions explorer at ${command.value} times speed.`);
        return;
      }
      if (
        command.type === "setXMin" ||
        command.type === "setXMax" ||
        command.type === "setDomain"
      ) {
        router.push("/functions");
        announce("Opening the functions explorer. Please repeat the command.");
        return;
      }
      if (command.type === "help") {
        announce(`Try saying: ${VOICE_EXAMPLES.slice(0, 5).join("; ")}.`);
        return;
      }
      if (command.type === "unknown") {
        announce(`Command not recognised: ${command.transcript}. Say help for examples.`);
      }
    },
    [announce, router],
  );

  /**
   * Sends the transcript to the language model router and applies whatever
   * comes back. The deterministic parser runs locally if the round trip fails,
   * so voice control survives an outage, a missing key, or being offline.
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
        const data = (await response.json()) as { command: VoiceCommand; source: CommandSource };
        if (requestIdRef.current !== requestId) return;
        setLastSource(data.source);
        applyCommand(data.command);
      } catch {
        if (requestIdRef.current !== requestId) return;
        setLastSource("local");
        applyCommand(parseVoiceCommand(phrase));
      } finally {
        if (requestIdRef.current === requestId) setIsRouting(false);
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
        if (result.isFinal && text) void submitRef.current(text);
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
    };

    recognition.onend = () => {
      // Chrome stops the service after a pause; restart to keep it always on.
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
  }, []);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    shouldListenRef.current = true;
    setError(null);
    try {
      recognition.start();
      setIsListening(true);
      announce("Voice commands on. Say help for examples.");
    } catch {
      setIsListening(true);
    }
  }, [announce]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    shouldListenRef.current = false;
    setIsListening(false);
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

  // Global shortcut so the microphone never requires a mouse: Shift + V.
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
    }),
    [
      announce,
      announcement,
      error,
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

/** Subscribes a page to voice commands for as long as it is mounted. */
export function useVoiceHandler(handler: VoiceHandler) {
  const { registerHandler } = useVoiceCommands();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return registerHandler((command) => handlerRef.current(command));
  }, [registerHandler]);
}
