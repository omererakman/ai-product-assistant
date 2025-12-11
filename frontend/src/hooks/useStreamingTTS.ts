import { useState, useCallback, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface UseStreamingTTSOptions {
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  rate?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: Error) => void;
}

export function useStreamingTTS(options: UseStreamingTTSOptions = {}) {
  const {
    voice = "alloy",
    rate = 1.0,
    onSpeechStart,
    onSpeechEnd,
    onError,
  } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);

  const playNextAudio = useCallback(() => {
    if (isPlayingRef.current) {
      return; // Already playing
    }

    if (audioQueueRef.current.length === 0) {
      // Queue is empty, check if we're still streaming
      if (!isStreaming) {
        // Streaming complete and queue empty
        isPlayingRef.current = false;
        setIsPlaying(false);
        onSpeechEnd?.();
      }
      return;
    }

    const blob = audioQueueRef.current.shift()!;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    if (rate !== 1.0 && "playbackRate" in audio) {
      audio.playbackRate = rate;
    }

    isPlayingRef.current = true;
    setIsPlaying(true);
    currentAudioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      isPlayingRef.current = false;
      setIsPlaying(false);

      // Play next chunk if available
      playNextAudio();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      isPlayingRef.current = false;
      setIsPlaying(false);

      const err = new Error("Audio playback failed");
      onError?.(err);

      // Try to play next chunk
      playNextAudio();
    };

    audio
      .play()
      .then(() => {
        if (!onSpeechStart) return;
        // Only call onSpeechStart for the first chunk
        if (audioQueueRef.current.length === 0 && !isStreaming) {
          onSpeechStart();
        }
      })
      .catch((playError) => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        isPlayingRef.current = false;
        setIsPlaying(false);

        const err =
          playError instanceof Error
            ? playError
            : new Error("Failed to play audio");
        onError?.(err);

        playNextAudio();
      });
  }, [rate, isStreaming, onSpeechStart, onSpeechEnd, onError]);

  const speakStreaming = useCallback(
    async (text: string) => {
      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Stop current playback
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      }

      // Clear queue
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsStreaming(true);

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(`${API_URL}/api/tts/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text, voice, rate }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error("Response body is null");
        }

        const reader = response.body.getReader();
        let hasStartedPlaying = false;

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            setIsStreaming(false);
            // If queue is empty and not playing, we're done
            if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
              onSpeechEnd?.();
            }
            break;
          }

          // Create blob from chunk
          const blob = new Blob([value], { type: "audio/mpeg" });
          audioQueueRef.current.push(blob);

          // Start playing if not already playing
          if (!isPlayingRef.current && !hasStartedPlaying) {
            hasStartedPlaying = true;
            onSpeechStart?.();
            playNextAudio();
          }
        }
      } catch (error) {
        setIsStreaming(false);
        setIsPlaying(false);
        isPlayingRef.current = false;

        if (error instanceof Error && error.name === "AbortError") {
          // Stream was cancelled, this is expected
          return;
        }

        const err =
          error instanceof Error ? error : new Error("Streaming TTS failed");
        console.error("Streaming TTS error:", err);
        onError?.(err);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [voice, rate, onSpeechStart, onSpeechEnd, onError, playNextAudio],
  );

  const cancel = useCallback(() => {
    // Cancel stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop current playback
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }

    // Clear queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsStreaming(false);
  }, []);

  return {
    speakStreaming,
    cancel,
    isStreaming,
    isPlaying,
  };
}
