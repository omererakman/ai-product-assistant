import { useEffect, useRef, useMemo } from 'react';
import './TurnTakingIndicator.css';

interface TurnTakingIndicatorProps {
  state: 'idle' | 'listening' | 'processing' | 'speaking';
  onCueDismiss?: () => void;
}

export function TurnTakingIndicator({
  state,
  onCueDismiss
}: TurnTakingIndicatorProps) {
  const prevStateRef = useRef(state);
  const audioPlayedRef = useRef(false);

  // Track previous state in effect (runs after render)
  useEffect(() => {
    prevStateRef.current = state;
  }, [state]);

  // Derive showCue from state transition - computed during render
  const showCue = useMemo(() => {
    const wasSpeaking = prevStateRef.current === 'speaking';
    const isListening = state === 'listening';
    return isListening && wasSpeaking;
  }, [state]);

  // Reset audio flag when cue should be hidden
  useEffect(() => {
    if (!showCue) {
      audioPlayedRef.current = false;
    }
  }, [showCue]);

  // Play subtle audio cue when it's user's turn (only once)
  useEffect(() => {
    if (showCue && !audioPlayedRef.current) {
      // Create a subtle audio cue using Web Audio API
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // Pleasant tone
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.15);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
        
        audioPlayedRef.current = true;
      } catch (error) {
        console.warn('Could not play audio cue:', error);
      }
    }
  }, [showCue]);

  if (!showCue || state !== 'listening') {
    return null;
  }

  return (
    <div className="turn-taking-indicator" role="status" aria-live="polite">
      <div className="turn-taking-content">
        <div className="pulse-dot"></div>
        <span className="turn-taking-text">Your turn to speak...</span>
      </div>
      {onCueDismiss && (
        <button
          className="dismiss-cue"
          onClick={() => {
            audioPlayedRef.current = true; // Mark as played so it doesn't show again
            onCueDismiss();
          }}
          aria-label="Dismiss turn-taking cue"
        >
          ×
        </button>
      )}
    </div>
  );
}
