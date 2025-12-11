import { useState, useCallback, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Global function to stop all audio instances
const stopAllGlobalAudio = () => {
  // Stop all HTML audio elements in DOM
  const allAudioElements = document.querySelectorAll("audio");
  allAudioElements.forEach((audioEl) => {
    if (!audioEl.paused) {
      console.log("🛑 Stopping DOM audio element");
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.src = "";
    }
  });

  // Cancel all speech synthesis
  window.speechSynthesis.cancel();
};

export type AudioSource =
  | { type: "natural-tts"; text: string; voice: string; rate: number }
  | { type: "audio-blob"; blob: Blob; rate?: number }
  | { type: "browser-tts"; text: string; rate: number };

interface UseAudioPlaybackManagerOptions {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onPlaybackError?: (error: Error) => void;
}

export function useAudioPlaybackManager(
  options: UseAudioPlaybackManagerOptions = {},
) {
  const { onPlaybackStart, onPlaybackEnd, onPlaybackError } = options;

  const [isPlaying, setIsPlaying] = useState(false);

  // Track current audio instance
  const currentAudioRef = useRef<{
    type: "html-audio" | "speech-synthesis";
    instance: HTMLAudioElement | SpeechSynthesisUtterance;
    cleanup?: () => void;
  } | null>(null);

  // Stop all audio immediately and synchronously
  const stop = useCallback(() => {
    // First, stop ALL audio globally (safety measure)
    stopAllGlobalAudio();

    if (!currentAudioRef.current) {
      setIsPlaying(false);
      return;
    }

    const { type, instance, cleanup } = currentAudioRef.current;

    try {
      if (type === "html-audio") {
        const audio = instance as HTMLAudioElement;
        // Stop immediately - pause, reset, and clear
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
        // Remove all event listeners to prevent callbacks
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
        audio.load(); // Reload to ensure it's stopped
      } else if (type === "speech-synthesis") {
        // Cancel all speech synthesis (not just current)
        window.speechSynthesis.cancel();
      }

      cleanup?.();
    } catch (error) {
      console.warn("Error stopping audio:", error);
    }

    // Clear reference immediately
    currentAudioRef.current = null;
    setIsPlaying(false);
  }, []);

  // Play audio blob using HTMLAudioElement
  const playAudioBlob = useCallback(
    async (blob: Blob, rate: number) => {
      // CRITICAL: Stop ALL audio globally before creating new audio element
      stopAllGlobalAudio();
      stop();

      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      if (rate !== 1.0 && "playbackRate" in audio) {
        audio.playbackRate = rate;
      }

      // Create promise that resolves when audio finishes
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          console.warn("Audio playback timeout");
          URL.revokeObjectURL(audioUrl);
          setIsPlaying(false);
          // Stop the audio element
          audio.pause();
          audio.currentTime = 0;
          audio.src = "";
          if (currentAudioRef.current?.instance === audio) {
            currentAudioRef.current = null;
          }
          reject(new Error("Playback timeout"));
        }, 60000); // 60 second timeout

        audio.onended = () => {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(audioUrl);
          // Only clear if this is still the current audio (prevent race conditions)
          if (currentAudioRef.current?.instance === audio) {
            currentAudioRef.current = null;
            setIsPlaying(false);
            onPlaybackEnd?.();
          } else {
            console.log(
              "⚠️ Audio ended but was not current audio (already replaced)",
            );
          }
          resolve();
        };

        audio.onerror = () => {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(audioUrl);
          // Only clear if this is still the current audio (prevent race conditions)
          if (currentAudioRef.current?.instance === audio) {
            currentAudioRef.current = null;
            setIsPlaying(false);
          }
          const err = new Error("Audio playback failed");
          onPlaybackError?.(err);
          reject(err);
        };

        // Store reference
        currentAudioRef.current = {
          type: "html-audio",
          instance: audio,
          cleanup: () => {
            URL.revokeObjectURL(audioUrl);
            // Ensure audio is fully stopped during cleanup
            if (!audio.paused) {
              audio.pause();
            }
            audio.currentTime = 0;
            audio.src = "";
          },
        };

        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            onPlaybackStart?.();
          })
          .catch((playError) => {
            clearTimeout(timeoutId);
            URL.revokeObjectURL(audioUrl);
            const err =
              playError instanceof Error
                ? playError
                : new Error("Failed to play audio");
            onPlaybackError?.(err);
            reject(err);
          });
      });
    },
    [stop, onPlaybackStart, onPlaybackEnd, onPlaybackError],
  );

  // Play using browser TTS
  const playBrowserTTS = useCallback(
    async (text: string, rate: number) => {
      // CRITICAL: Stop any existing audio before creating new utterance
      stopAllGlobalAudio();
      stop();

      return new Promise<void>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => {
          setIsPlaying(true);
          onPlaybackStart?.();
        };

        utterance.onend = () => {
          if (currentAudioRef.current?.instance === utterance) {
            currentAudioRef.current = null;
            setIsPlaying(false);
            onPlaybackEnd?.();
          }
          resolve();
        };

        utterance.onerror = () => {
          if (currentAudioRef.current?.instance === utterance) {
            currentAudioRef.current = null;
            setIsPlaying(false);
          }
          const error = new Error("Browser TTS failed");
          onPlaybackError?.(error);
          reject(error);
        };

        currentAudioRef.current = {
          type: "speech-synthesis",
          instance: utterance,
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [stop, onPlaybackStart, onPlaybackEnd, onPlaybackError],
  );

  // Play audio from various sources
  const play = useCallback(
    async (source: AudioSource) => {
      // CRITICAL: Stop ALL audio globally first (prevents old responses from playing)
      stopAllGlobalAudio();
      stop();

      // Wait for audio to fully stop before starting new playback
      // Poll until actually stopped (with timeout)
      const maxWaitTime = 500; // Max 500ms wait
      const pollInterval = 50; // Check every 50ms
      let waited = 0;

      // Check both state and ref to ensure audio is stopped
      while ((isPlaying || currentAudioRef.current) && waited < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        waited += pollInterval;
      }

      if (waited >= maxWaitTime && (isPlaying || currentAudioRef.current)) {
        console.warn("⚠️ Audio did not stop within timeout, forcing stop");
        stopAllGlobalAudio();
        stop();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      try {
        if (source.type === "natural-tts") {
          // Fetch audio from backend
          const response = await fetch(`${API_URL}/api/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: source.text,
              voice: source.voice,
              rate: source.rate,
            }),
          });

          if (!response.ok) {
            throw new Error("TTS request failed");
          }

          const audioBlob = await response.blob();
          await playAudioBlob(audioBlob, source.rate);
        } else if (source.type === "audio-blob") {
          await playAudioBlob(source.blob, source.rate || 1.0);
        } else if (source.type === "browser-tts") {
          await playBrowserTTS(source.text, source.rate);
        }
      } catch (error) {
        const err =
          error instanceof Error ? error : new Error("Playback failed");
        onPlaybackError?.(err);
        setIsPlaying(false);
        currentAudioRef.current = null;
        throw err;
      }
    },
    [stop, playAudioBlob, playBrowserTTS, onPlaybackError],
  );

  return {
    play,
    stop,
    isPlaying,
  };
}
