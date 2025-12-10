import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './VoiceSettings.css';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

// Also export as a const for runtime use
export const TTS_VOICES: TTSVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh' | 'ar' | 'hi' | 'ru' | 'nl' | 'pl' | 'tr' | 'sv' | 'da' | 'no' | 'fi' | 'cs' | 'ro' | 'hu' | 'el' | 'th' | 'vi' | 'id' | 'uk' | 'he' | 'bg' | 'hr' | 'sk' | 'sl' | 'et' | 'lv' | 'lt' | 'mt' | 'ga' | 'cy';

export const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ru', name: 'Russian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'el', name: 'Greek' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'he', name: 'Hebrew' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'et', name: 'Estonian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'mt', name: 'Maltese' },
  { code: 'ga', name: 'Irish' },
  { code: 'cy', name: 'Welsh' },
];

interface VoiceSettingsProps {
  useNaturalTTS: boolean;
  ttsVoice: TTSVoice;
  ttsRate: number;
  language: LanguageCode;
  onNaturalTTSChange: (enabled: boolean) => void;
  onVoiceChange: (voice: TTSVoice) => void;
  onRateChange: (rate: number) => void;
  onLanguageChange: (language: LanguageCode) => void;
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
  language,
  onNaturalTTSChange,
  onVoiceChange,
  onRateChange,
  onLanguageChange,
  naturalTTSSupported = false,
}: VoiceSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Small delay to avoid immediate closure
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Calculate panel position based on button position
  useEffect(() => {
    if (isOpen && buttonRef.current && panelRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const headerHeight = 100; // Approximate header height
      const panelTop = Math.max(buttonRect.bottom + 8, headerHeight);
      panelRef.current.style.top = `${panelTop}px`;
      panelRef.current.style.right = `${window.innerWidth - buttonRect.right}px`;
      
      // Ensure panel doesn't go off-screen
      const panelHeight = panelRef.current.offsetHeight || 400;
      if (panelTop + panelHeight > window.innerHeight - 20) {
        panelRef.current.style.top = `${Math.max(headerHeight, window.innerHeight - panelHeight - 20)}px`;
      }
    }
  }, [isOpen]);

  return (
    <div className="voice-settings">
      <button
        ref={buttonRef}
        className="voice-settings-toggle"
        onClick={(e) => {
          e.stopPropagation();
          console.log('Settings button clicked, isOpen:', isOpen);
          setIsOpen(!isOpen);
        }}
        aria-label="Language and voice settings"
        aria-expanded={isOpen}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>Settings</span>
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div 
            className="voice-settings-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <div 
            ref={panelRef} 
            className="voice-settings-panel"
            style={{ 
              display: 'block', 
              visibility: 'visible', 
              opacity: 1,
              backgroundColor: '#ffffff',
              background: '#ffffff',
              zIndex: 2147483647,
              position: 'fixed'
            }}
          >
          <div className="voice-settings-header">
            <h3>Language & Voice Settings</h3>
            <button
              className="close-button"
              onClick={() => setIsOpen(false)}
              aria-label="Close settings"
            >
              ×
            </button>
          </div>

          <div className="voice-settings-content">
            {/* Language Selection */}
            <div className="setting-group">
              <label className="setting-label">Language</label>
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as LanguageCode)}
                className="language-select"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              <p className="setting-description">
                Language for both text and voice conversations. The assistant will respond in this language. Default: English.
              </p>
            </div>

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
        </>,
        document.body
      )}
    </div>
  );
}
