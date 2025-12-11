import { useState, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface UseWhisperTranscriptionOptions {
  language?: string;
  onTranscriptionComplete?: (transcript: string) => void;
  onError?: (error: Error) => void;
}

export function useWhisperTranscription(
  options: UseWhisperTranscriptionOptions = {},
) {
  const { language = "en", onTranscriptionComplete, onError } = options;

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transcribe = useCallback(
    async (audioBlob: Blob) => {
      setIsTranscribing(true);
      setError(null);

      try {
        const formData = new FormData();
        // Determine file extension based on blob type
        const extension = audioBlob.type.includes("webm")
          ? "webm"
          : audioBlob.type.includes("wav")
            ? "wav"
            : audioBlob.type.includes("mp3")
              ? "mp3"
              : "webm";
        formData.append("audio", audioBlob, `audio.${extension}`);
        formData.append("language", language);

        const response = await fetch(`${API_URL}/api/transcribe`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`,
          );
        }

        const data = await response.json();
        const transcript = data.transcript;

        if (!transcript || transcript.trim() === "") {
          throw new Error("Empty transcription received");
        }

        onTranscriptionComplete?.(transcript);
        return transcript;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Transcription failed");
        setError(error);
        onError?.(error);
        throw error;
      } finally {
        setIsTranscribing(false);
      }
    },
    [language, onTranscriptionComplete, onError],
  );

  return {
    transcribe,
    isTranscribing,
    error,
  };
}
