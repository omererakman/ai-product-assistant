import { useState, useCallback, useEffect } from "react";
import { useAudioPlaybackManager } from "./useAudioPlaybackManager";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface UseNaturalTTSOptions {
  enabled?: boolean; // Enable OpenAI TTS (requires backend endpoint)
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  rate?: number; // Speech rate (0.25 to 4.0)
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: Error) => void;
}

export function useNaturalTTS(options: UseNaturalTTSOptions = {}) {
  const {
    enabled = false, // Disabled by default - requires backend setup
    voice = "alloy",
    rate = 1.0,
    onSpeechStart,
    onSpeechEnd,
    onError,
  } = options;

  const [isSupported, setIsSupported] = useState(false);

  const audioManager = useAudioPlaybackManager({
    onPlaybackStart: onSpeechStart,
    onPlaybackEnd: onSpeechEnd,
    onPlaybackError: onError,
  });

  useEffect(() => {
    if (enabled) {
      fetch(`${API_URL}/api/tts/health`)
        .then((res) => {
          if (res.ok) {
            setIsSupported(true);
            console.log("✅ Natural TTS (OpenAI) is available and enabled");
          } else {
            setIsSupported(false);
            console.warn(
              "⚠️ Natural TTS health check failed, falling back to browser TTS",
            );
          }
        })
        .catch((error) => {
          setIsSupported(false);
          console.warn(
            "⚠️ Natural TTS backend not available, falling back to browser TTS:",
            error,
          );
        });
    } else {
      setIsSupported(false);
      console.log("ℹ️ Natural TTS is disabled, using browser TTS");
    }
  }, [enabled]);

  const speak = useCallback(
    async (text: string) => {
      console.log("🔊 useNaturalTTS.speak called:", {
        enabled,
        isSupported,
        voice,
        rate,
        textLength: text.length,
      });

      if (audioManager.isPlaying) {
        console.log("🛑 Stopping existing audio before starting new TTS");
        audioManager.stop();

        const maxWaitTime = 500;
        const pollInterval = 50;
        let waited = 0;

        while (audioManager.isPlaying && waited < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          waited += pollInterval;
        }

        if (waited >= maxWaitTime) {
          console.warn(
            "⚠️ Audio did not stop within timeout, proceeding anyway",
          );
          audioManager.stop();
        }
      }

      if (enabled && isSupported) {
        console.log(
          `🎤 Using Natural TTS (OpenAI) with voice: ${voice}, rate: ${rate}`,
        );
        await audioManager.play({
          type: "natural-tts",
          text,
          voice,
          rate,
        });
      } else {
        console.warn(
          "⚠️ Using Browser TTS (robotic). Enable Natural TTS in settings for better quality.",
        );
        await audioManager.play({
          type: "browser-tts",
          text,
          rate,
        });
      }
    },
    [enabled, isSupported, voice, rate, audioManager],
  );

  const cancel = useCallback(() => {
    console.log("🛑 Canceling TTS...");
    audioManager.stop();
  }, [audioManager]);

  return {
    speak,
    cancel,
    isSpeaking: audioManager.isPlaying,
    isSupported,
  };
}
