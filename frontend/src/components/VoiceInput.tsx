import React, { useCallback, useState, useEffect } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useWhisperTranscription } from '../hooks/useWhisperTranscription';
import './VoiceInput.css';

interface VoiceInputProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscript, disabled = false }: VoiceInputProps) {
  const [showRecordingOverlay, setShowRecordingOverlay] = useState(false);
  const [localError, setLocalError] = useState<Error | null>(null);

  const handleTranscriptionComplete = useCallback((transcript: string) => {
    setLocalError(null);
    onTranscript(transcript);
  }, [onTranscript]);

  const handleTranscriptionError = useCallback((error: Error) => {
    setLocalError(error);
    setShowRecordingOverlay(false);
  }, []);

  const {
    transcribe: transcribeAudio,
    isTranscribing,
    error: transcriptionError,
  } = useWhisperTranscription({
    onTranscriptionComplete: handleTranscriptionComplete,
    onError: handleTranscriptionError,
  });

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    setShowRecordingOverlay(false);
    setLocalError(null);
    try {
      await transcribeAudio(audioBlob);
    } catch (error) {
      console.error('Transcription error:', error);
    }
  }, [transcribeAudio]);

  const handleRecordingError = useCallback((error: Error) => {
    setLocalError(error);
    setShowRecordingOverlay(false);
  }, []);

  const {
    isRecording,
    recordingTime,
    error: recorderError,
    isSupported: recorderSupported,
    startRecording,
    stopRecording,
  } = useAudioRecorder({
    onRecordingComplete: handleRecordingComplete,
    onError: handleRecordingError,
  });

  useEffect(() => {
    setShowRecordingOverlay(isRecording);
  }, [isRecording]);

  const error = localError || recorderError || transcriptionError;
  const isLoading = isRecording || isTranscribing;

  if (!recorderSupported) {
    return null;
  }

  const handleToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <button
        className={`voice-button ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
        onClick={handleToggle}
        disabled={disabled || isTranscribing}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        title={isRecording ? 'Click to stop recording' : 'Click to start voice recording'}
      >
        {isTranscribing ? (
          <>
            <span className="voice-icon transcribing-icon">⏳</span>
            <span className="voice-status">Transcribing...</span>
          </>
        ) : isRecording ? (
          <>
            <span className="voice-icon recording-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="10" cy="10" r="8" />
              </svg>
            </span>
            <span className="voice-status">Recording</span>
          </>
        ) : (
          <>
            <span className="voice-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </span>
            <span className="voice-status">Voice</span>
          </>
        )}
      </button>

      {showRecordingOverlay && (
        <div className="recording-overlay">
          <div className="recording-modal">
            <div className="recording-header">
              <div className="recording-indicator">
                <div className="pulse-ring"></div>
                <div className="pulse-ring delay-1"></div>
                <div className="pulse-ring delay-2"></div>
                <svg className="mic-large" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>
              <h3>Recording...</h3>
              <div className="recording-time">{formatTime(recordingTime)}</div>
            </div>
            <div className="waveform-container">
              <div className="waveform">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="waveform-bar"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      height: `${20 + Math.random() * 60}%`,
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              className="stop-recording-button"
              onClick={stopRecording}
              aria-label="Stop recording"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop Recording
            </button>
          </div>
        </div>
      )}

      {isTranscribing && !showRecordingOverlay && (
        <div className="transcribing-indicator">
          <div className="transcribing-spinner"></div>
          <span>Transcribing your message...</span>
        </div>
      )}

      {error && (
        <div className="error-message" role="alert">
          <div className="error-content">
            <strong>Error:</strong> {error.message}
          </div>
          <button 
            className="error-dismiss"
            onClick={() => {
              setLocalError(null);
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
