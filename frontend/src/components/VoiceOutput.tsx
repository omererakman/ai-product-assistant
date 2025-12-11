import { useState, useEffect } from "react";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";

interface VoiceOutputProps {
  text: string;
  autoPlay?: boolean;
  disabled?: boolean;
  onSpeechEnd?: () => void;
}

export function VoiceOutput({
  text,
  autoPlay = false,
  disabled = false,
  onSpeechEnd,
}: VoiceOutputProps) {
  const { speak, cancel, isSpeaking, isSupported } = useSpeechSynthesis();
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    if (autoPlay && text && isSupported && !disabled && !hasPlayed) {
      // Use a custom utterance to detect when speech ends
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => {
        setHasPlayed(true);
        onSpeechEnd?.();
      };

      utterance.onerror = () => {
        setHasPlayed(true);
        onSpeechEnd?.();
      };

      window.speechSynthesis.speak(utterance);
      setHasPlayed(true);
    }
  }, [autoPlay, text, isSupported, disabled, hasPlayed, onSpeechEnd]);

  const handlePlay = () => {
    if (isSpeaking) {
      cancel();
    } else {
      speak(text);
      setHasPlayed(true);
    }
  };

  if (!isSupported || disabled || !text) {
    return null;
  }

  // Don't show button if auto-playing
  if (autoPlay) {
    return null;
  }

  return (
    <div className="voice-output">
      <button
        className={`voice-play-button ${isSpeaking ? "speaking" : ""}`}
        onClick={handlePlay}
        aria-label={isSpeaking ? "Stop speaking" : "Play response"}
        title={isSpeaking ? "Stop speaking" : "Listen to response"}
      >
        {isSpeaking ? (
          <>
            <svg
              className="voice-play-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            <span>Stop</span>
          </>
        ) : (
          <>
            <svg
              className="voice-play-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>{hasPlayed ? "Replay" : "Listen"}</span>
          </>
        )}
      </button>
    </div>
  );
}
