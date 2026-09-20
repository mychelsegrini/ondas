"use client";

import { AnimatePresence, motion } from "framer-motion";

import { useVoiceCommands } from "@/contexts/VoiceContext";

export function VoiceBar() {
  const {
    isSupported,
    isAudioReady,
    isListening,
    isRouting,
    isAwake,
    transcript,
    lastSource,
    toggleListening,
    error,
    announcement,
  } = useVoiceCommands();

  return (
    <div className="sticky bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
        <button
          type="button"
          onClick={toggleListening}
          disabled={!isSupported || !isAudioReady}
          aria-pressed={isListening}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            isListening
              ? isAwake
                ? "bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
                : "bg-fuchsia-500 text-zinc-950 hover:bg-fuchsia-400"
              : "bg-zinc-900 text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${
              isListening ? "animate-pulse bg-zinc-950" : "bg-emerald-400"
            }`}
          />
          {isListening ? (isAwake ? "Heard hey or hi" : "Listening for hey or hi") : "Start voice commands"}
          <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-medium opacity-70">
            Shift + V
          </kbd>
        </button>

        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {error ? (
              <motion.p
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="truncate text-sm text-rose-400"
              >
                {error}
              </motion.p>
            ) : !isSupported ? (
              <p className="truncate text-sm text-zinc-500">
                Voice commands need the Web Speech API. Use Chrome or Edge; every feature also works
                from the keyboard.
              </p>
            ) : isRouting ? (
              <motion.p
                key="routing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="truncate text-sm text-zinc-400"
              >
                Routing “{transcript}”…
              </motion.p>
            ) : transcript ? (
              <motion.p
                key={transcript}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="truncate text-sm text-zinc-300"
              >
                <span className="text-zinc-500">Heard: </span>
                <span className="font-mono text-cyan-300">{transcript}</span>
                {lastSource ? (
                  <span className="ml-2 text-xs text-zinc-600">
                    {lastSource === "llm" ? "via Muse" : "via local parser"}
                  </span>
                ) : null}
              </motion.p>
            ) : (
              <p className="truncate text-sm text-zinc-500">
                Try: <span className="font-mono text-zinc-400">Hey, plot sine of x</span> ·{" "}
                <span className="font-mono text-zinc-400">Hey, help</span>
              </p>
            )}
          </AnimatePresence>
        </div>

        {/* Mirrors the live region visually for sighted users and demo audiences. */}
        <p className="hidden max-w-md truncate text-sm text-zinc-400 lg:block" aria-hidden="true">
          {announcement}
        </p>
      </div>
    </div>
  );
}
