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

import { parseVoiceCommand, VOICE_EXAMPLES, type VoiceCommand } from "@/lib/voice/parseCommand";

/** Returning true means "handled, stop propagating to other handlers". */
export type VoiceHandler = (command: VoiceCommand) => boolean;

interface VoiceContextValue {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  lastCommand: VoiceCommand | null;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  /** Pages register their own handlers; the most recent one gets first refusal. */
  registerHandler: (handler: VoiceHandler) => () => void;
  /** Sends a message to the global polite live region. */
  announce: (message: string) => void;
  announcement: string;
}

const VoiceCommandContext = createContext<VoiceContextValue | null>(null);

export function VoiceCommandProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const handlersRef = useRef<VoiceHandler[]>([]);
  const shouldListenRef = useRef(false);

  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
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

  const dispatch = useCallback(
    (command: VoiceCommand) => {
      setLastCommand(command);

      for (let i = handlersRef.current.length - 1; i >= 0; i -= 1) {
        if (handlersRef.current[i](command)) return;
      }

      // Fallbacks that work from anywhere in the app.
      if (command.type === "navigate") {
        const path = command.page === "home" ? "/" : `/${command.page}`;
        router.push(path);
        announce(`Opening the ${command.page === "home" ? "home page" : `${command.page} page`}.`);
        return;
      }
      if (command.type === "selectShape") {
        router.push(`/shapes?shape=${command.shapeId}`);
        return;
      }
      if (command.type === "setFunction" || command.type === "setXMin" || command.type === "setXMax") {
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
        if (result.isFinal && text) {
          dispatch(parseVoiceCommand(text));
        }
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
  }, [dispatch]);

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
      transcript,
      lastCommand,
      error,
      startListening,
      stopListening,
      toggleListening,
      registerHandler,
      announce,
      announcement,
    }),
    [
      announce,
      announcement,
      error,
      isListening,
      isSupported,
      lastCommand,
      registerHandler,
      startListening,
      stopListening,
      toggleListening,
      transcript,
    ],
  );

  return (
    <VoiceCommandContext.Provider value={value}>
      {children}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </VoiceCommandContext.Provider>
  );
}

export function useVoiceCommands(): VoiceContextValue {
  const context = useContext(VoiceCommandContext);
  if (!context) {
    throw new Error("useVoiceCommands must be used inside a VoiceCommandProvider.");
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
