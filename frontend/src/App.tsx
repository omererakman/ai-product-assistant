import { useState, useRef, useEffect } from "react";
import "./App.css";
import { VoiceInput } from "./components/VoiceInput";
import { VoiceOutput } from "./components/VoiceOutput";
import { TurnTakingIndicator } from "./components/TurnTakingIndicator";
import { VoiceSettings } from "./components/VoiceSettings";
import { Orders } from "./components/Orders";
import type { TTSVoice } from "./components/VoiceSettings";
import type { LanguageCode } from "@shared/constants/languages";
import { useContinuousVoiceConversation } from "./hooks/useContinuousVoiceConversation";
import { useStreamingChat } from "./hooks/useStreamingChat";
import { API_URL } from "./utils/config";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  orderId?: string;
  sources?: Array<{
    id: string;
    text: string;
    sourceId: string;
    metadata: Record<string, unknown>;
  }>;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [view, setView] = useState<"chat" | "orders">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Language and voice settings state - declared early so it can be used in hooks
  const [useNaturalTTS, setUseNaturalTTS] = useState(true);
  const [ttsVoice, setTtsVoice] = useState<TTSVoice>("nova");
  const [ttsRate, setTtsRate] = useState(1.0);
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [naturalTTSSupported, setNaturalTTSSupported] = useState(false);

  const {
    streamingText,
    isStreaming,
    sendMessage: sendStreamingMessage,
  } = useStreamingChat({
    sessionId,
    language,
    onComplete: (response) => {
      const assistantMessage: Message = {
        role: "assistant",
        content: response.text,
        timestamp: new Date().toISOString(),
        orderId: response.orderId,
        sources: response.sources,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setLoading(false);
    },
    onError: (error) => {
      console.error("Streaming chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setLoading(false);
    },
  });

  useEffect(() => {
    fetch(`${API_URL}/api/tts/health`)
      .then((res) => {
        if (res.ok) {
          setNaturalTTSSupported(true);
          setUseNaturalTTS(true);
          console.log(
            "✅ Natural TTS backend is available - using OpenAI TTS for natural voice",
          );
        } else {
          setNaturalTTSSupported(false);
          console.warn(
            "⚠️ Natural TTS health check failed - using browser TTS",
          );
        }
      })
      .catch((error) => {
        setNaturalTTSSupported(false);
        setUseNaturalTTS(false);
        console.warn(
          "⚠️ Natural TTS backend not available - using browser TTS:",
          error,
        );
      });
  }, []);

  const {
    isActive: isVoiceConversationActive,
    isProcessing: isVoiceProcessing,
    currentState: voiceState,
    isRecording: isVoiceRecording,
    startConversation: startVoiceConversation,
    stopConversation: stopVoiceConversation,
    stopSpeaking: stopTTS,
    isSpeaking: isTTSSpeaking,
    isSupported: isVoiceSupported,
  } = useContinuousVoiceConversation({
    sessionId,
    useNaturalTTS,
    ttsVoice,
    ttsRate,
    language,
    onMessage: (message) => {
      const newMessage: Message = {
        role: message.role,
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        orderId: message.orderId,
        sources: message.sources,
      };
      setMessages((prev) => [...prev, newMessage]);
    },
    onError: (error) => {
      console.error("Voice conversation error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading || isStreaming) {
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageToSend = input.trim();
    setInput("");
    setLoading(true);

    try {
      await sendStreamingMessage(messageToSend);
    } catch {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleVoiceTranscript = async (transcript: string) => {
    if (isVoiceConversationActive) {
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: transcript,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: transcript,
          sessionId,
          language,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: data.timestamp,
        orderId: data.orderId,
        sources: data.sources,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    try {
      await fetch(`${API_URL}/api/chat/history/${sessionId}`, {
        method: "DELETE",
      });
      setMessages([]);
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  };

  if (view === "orders") {
    return <Orders onBack={() => setView("chat")} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Product Assistant</h1>
        <p>Ask about products and place orders naturally</p>
        <div className="header-actions">
          <VoiceSettings
            useNaturalTTS={useNaturalTTS}
            ttsVoice={ttsVoice}
            ttsRate={ttsRate}
            language={language}
            onNaturalTTSChange={setUseNaturalTTS}
            onVoiceChange={setTtsVoice}
            onRateChange={setTtsRate}
            onLanguageChange={setLanguage}
            naturalTTSSupported={naturalTTSSupported}
          />
          {isVoiceSupported && (
            <>
              <button
                onClick={
                  isVoiceConversationActive
                    ? stopVoiceConversation
                    : startVoiceConversation
                }
                className={`voice-conversation-button ${isVoiceConversationActive ? "active" : ""}`}
                aria-label={
                  isVoiceConversationActive
                    ? "Stop voice conversation"
                    : "Start voice conversation"
                }
                disabled={loading && !isVoiceConversationActive}
              >
                {isVoiceConversationActive ? (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    <span>Stop Voice</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    <span>Voice Chat</span>
                  </>
                )}
              </button>
              <span className="header-separator">|</span>
            </>
          )}
          <button
            onClick={clearChat}
            className="clear-button"
            aria-label="Clear chat history"
          >
            Clear Chat
          </button>
          <button
            onClick={() => setView("orders")}
            className="orders-button"
            aria-label="View orders"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span>Orders</span>
          </button>
        </div>
      </header>

      <div className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Welcome! 👋</h2>
              <p>I can help you:</p>
              <ul>
                <li>Find products and check prices</li>
                <li>Answer questions about product specifications</li>
                <li>Process orders when you're ready to buy</li>
              </ul>
              <p>Try asking: "What's the price of the iPhone 15 Pro?"</p>
              <p
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.875rem",
                  opacity: 0.75,
                }}
              >
                💡 Tip: Switch to Voice mode to speak your questions!
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`message ${message.role === "user" ? "user-message" : "assistant-message"}`}
            >
              <div className="message-content">
                <div className="message-text">{message.content}</div>
                {message.role === "assistant" && !isVoiceConversationActive && (
                  <VoiceOutput text={message.content} autoPlay={false} />
                )}
                {message.orderId && (
                  <div className="order-confirmation">
                    <strong>Order ID:</strong> {message.orderId}
                  </div>
                )}
                {message.sources && message.sources.length > 0 && (
                  <details className="sources">
                    <summary>Sources ({message.sources.length})</summary>
                    <ul>
                      {message.sources.map((source, idx) => (
                        <li key={idx}>
                          <strong>{source.sourceId}</strong>
                          <p>{source.text.substring(0, 150)}...</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="message-timestamp">
                  {message.timestamp
                    ? new Date(message.timestamp).toLocaleTimeString()
                    : ""}
                </div>
              </div>
            </div>
          ))}

          {/* Show streaming text if available */}
          {isStreaming && streamingText && (
            <div className="message assistant-message">
              <div className="message-content">
                <div className="message-text streaming">{streamingText}</div>
                <div className="loading-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          {(loading || isVoiceProcessing) && !isStreaming && (
            <div className="message assistant-message">
              <div className="message-content">
                <div className="loading-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                {isVoiceConversationActive && (
                  <div className="voice-status-indicator">
                    {voiceState === "listening" &&
                      isVoiceConversationActive && (
                        <span>
                          <span className="recording-pulse">🎤</span>{" "}
                          Listening... (speak now)
                        </span>
                      )}
                    {voiceState === "processing" && (
                      <span>
                        <span className="transcribing-spinner-small">⏳</span>{" "}
                        Processing...
                      </span>
                    )}
                    {voiceState === "speaking" && (
                      <span>
                        <span className="speaking-pulse">🔊</span> Speaking
                        response...
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {isVoiceConversationActive && (
            <>
              <TurnTakingIndicator state={voiceState} />
              <div className="voice-conversation-status">
                <div className="voice-status-badge">
                  <div className="pulse-dot"></div>
                  <span>
                    {voiceState === "listening" &&
                      isVoiceRecording &&
                      "🎤 Listening - Speak now (auto-stops after silence)"}
                    {voiceState === "listening" &&
                      !isVoiceRecording &&
                      "⏳ Waiting for microphone..."}
                    {voiceState === "processing" && "⏳ Processing..."}
                    {voiceState === "speaking" && (
                      <>
                        🔊 Speaking response...
                        {useNaturalTTS && naturalTTSSupported ? (
                          <span className="tts-badge natural">
                            {" "}
                            🎤 Natural Voice (OpenAI)
                          </span>
                        ) : (
                          <span className="tts-badge browser">
                            {" "}
                            ⚠️ Browser TTS (Robotic)
                          </span>
                        )}
                      </>
                    )}
                    {voiceState === "idle" &&
                      "Voice conversation active - Speak naturally"}
                  </span>
                </div>
                {voiceState === "listening" && (
                  <button
                    onClick={stopVoiceConversation}
                    className="stop-voice-button"
                    aria-label="Stop voice conversation"
                  >
                    Stop Recording
                  </button>
                )}
                {(voiceState === "speaking" || isTTSSpeaking) && (
                  <button
                    onClick={stopTTS}
                    className="stop-speaking-button"
                    aria-label="Stop speaking"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop Speaking
                  </button>
                )}
              </div>
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <div className="input-wrapper">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
              rows={3}
              disabled={loading || isStreaming}
              className="message-input"
            />
            <div className="input-actions">
              {!isVoiceConversationActive && (
                <>
                  <VoiceInput
                    onTranscript={handleVoiceTranscript}
                    disabled={loading || isVoiceConversationActive}
                    language={language}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={loading || isStreaming || !input.trim()}
                    className="send-button"
                    aria-label="Send message"
                  >
                    {loading ? (
                      <>
                        <span className="send-spinner"></span>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </>
              )}
              {isVoiceConversationActive && (
                <div className="voice-conversation-input-disabled">
                  <p>
                    Voice conversation mode is active. Speak naturally to
                    continue the conversation.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
