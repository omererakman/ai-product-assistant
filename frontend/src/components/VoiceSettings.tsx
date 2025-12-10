import React, { useState } from 'react';
import './VoiceSettings.css';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

// Also export as a const for runtime use
export const TTS_VOICES: TTSVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

interface VoiceSettingsProps {
  useNaturalTTS: boolean;
  ttsVoice: TTSVoice;
  ttsRate: number;
  onNaturalTTSChange: (enabled: boolean) => void;
  onVoiceChange: (voice: TTSVoice) => void;
  onRateChange: (rate: number) => void;
  naturalTTSSupported?: boolean;
}

const VOICE_DESCRIPTIONS: Record<TTSVoice, string> = {
  alloy: 'Neutral, balanced',
  echo: 'Warm, friendly',
  fable: 'Expressive, storytelling',
  onyx: 'Deep, authoritative',
  nova: 'Bright, energetic',
  shimmer: 'Soft, gentle',
};

export function VoiceSettings({
  useNaturalTTS,
  ttsVoice,
  ttsRate,
  onNaturalTTSChange,
  onVoiceChange,
  onRateChange,
  naturalTTSSupported = false,
}: VoiceSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="voice-settings">
      <button
        className="voice-settings-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Voice settings"
        aria-expanded={isOpen}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>Voice Settings</span>
      </button>

      {isOpen && (
        <div className="voice-settings-panel">
          <div className="voice-settings-header">
            <h3>Voice Settings</h3>
            <button
              className="close-button"
              onClick={() => setIsOpen(false)}
              aria-label="Close settings"
            >
              ×
            </button>
          </div>

          <div className="voice-settings-content">
            {/* Natural TTS Toggle */}
            <div className="setting-group">
              <label className="setting-label">
                <input
                  type="checkbox"
                  checked={useNaturalTTS}
                  onChange={(e) => onNaturalTTSChange(e.target.checked)}
                  disabled={!naturalTTSSupported}
                />
                <span>
                  Use Natural Voice (OpenAI TTS)
                  {!naturalTTSSupported && (
                    <span className="setting-hint"> (Not available - check backend)</span>
                  )}
                </span>
              </label>
              <p className="setting-description">
                Higher quality, more natural-sounding voice. Requires backend TTS endpoint.
              </p>
            </div>

            {/* Voice Selection */}
            {useNaturalTTS && naturalTTSSupported && (
              <div className="setting-group">
                <label className="setting-label">Voice</label>
                <div className="voice-options">
                  {(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as TTSVoice[]).map((voice) => (
                    <button
                      key={voice}
                      className={`voice-option ${ttsVoice === voice ? 'active' : ''}`}
                      onClick={() => onVoiceChange(voice)}
                      aria-pressed={ttsVoice === voice}
                    >
                      <span className="voice-name">{voice}</span>
                      <span className="voice-description">{VOICE_DESCRIPTIONS[voice]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Speech Rate */}
            <div className="setting-group">
              <label className="setting-label">
                Speech Rate: {ttsRate.toFixed(2)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={ttsRate}
                onChange={(e) => onRateChange(parseFloat(e.target.value))}
                className="rate-slider"
              />
              <div className="rate-labels">
                <span>Slow</span>
                <span>Normal</span>
                <span>Fast</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
