import { useState, useCallback, useRef, useEffect } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { useWhisperTranscription } from "./useWhisperTranscription";
import { useNaturalTTS } from "./useNaturalTTS";
import { useSharedAudioContext } from "./useSharedAudioContext";
import { API_URL } from "../utils/config";

interface UseContinuousVoiceConversationOptions {
  sessionId: string;
  onMessage?: (message: {
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
  }) => void;
  onError?: (error: Error) => void;
  useNaturalTTS?: boolean;
  ttsVoice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  ttsRate?: number;
  language?: string;
}

type ConversationState = "idle" | "listening" | "processing" | "speaking";

const STATE_TRANSITION_DEBOUNCE_MS = 50;
const RECORDING_START_DELAY_MS = 500;
const CONVERSATION_TIMEOUT_MS = 30000;

const STOP_KEYWORDS = [
  "stop",
  "end",
  "end conversation",
  "goodbye",
  "bye",
  "exit",
  "quit",
  "finish",
  "done",
  "that's all",
  "thank you",
  "thanks",
  "no more",
  "cancel",
];

const containsStopKeyword = (transcript: string): boolean => {
  const normalized = transcript.toLowerCase().trim();
  const cleaned = normalized.replace(/[.,!?;:]/g, " ");
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

  return STOP_KEYWORDS.some((keyword) => {
    if (normalized === keyword) return true;
    if (words.includes(keyword)) return true;
    const keywordRegex = new RegExp(
      `\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    return keywordRegex.test(normalized);
  });
};

export function useContinuousVoiceConversation(
  options: UseContinuousVoiceConversationOptions,
) {
  const {
    sessionId,
    onMessage,
    onError,
    useNaturalTTS: enableNaturalTTS = false,
    ttsVoice = "alloy",
    ttsRate = 1.0,
    language = "en",
  } = options;

  const [isActive, setIsActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentState, setCurrentState] = useState<ConversationState>("idle");

  const { unlockAudioContext } = useSharedAudioContext();

  const sessionActiveRef = useRef(false);
  const stateRef = useRef<ConversationState>("idle");
  const sharedStreamRef = useRef<MediaStream | null>(null);
  const [sharedStream, setSharedStream] = useState<MediaStream | null>(null);
  const stateTransitionTimerRef = useRef<number | null>(null);
  const pendingStateRef = useRef<ConversationState | null>(null);
  const ttsCanceledRef = useRef(false);
  const ttsExplicitlyStoppedRef = useRef(false);
  // currentResponseIdRef kept for potential future use
  // const currentResponseIdRef = useRef<number>(0);
  const conversationStartTimeRef = useRef<number | null>(null);
  const speechDetectedInConversationRef = useRef<boolean>(false);
  const conversationTimeoutRef = useRef<number | null>(null);
  const accumulatedResponseRef = useRef("");
  const streamingAbortControllerRef = useRef<AbortController | null>(null);
  const ttsSpeakingRef = useRef(false);
  const startRecordingRef = useRef<() => Promise<void>>(async () => {});

  const transitionTo = useCallback((newState: ConversationState) => {
    if (stateRef.current === newState) {
      return;
    }

    if (stateTransitionTimerRef.current) {
      clearTimeout(stateTransitionTimerRef.current);
      stateTransitionTimerRef.current = null;
    }

    pendingStateRef.current = newState;
    stateTransitionTimerRef.current = window.setTimeout(() => {
      if (pendingStateRef.current === newState && sessionActiveRef.current) {
        console.log(`State: ${stateRef.current} → ${newState}`);
        stateRef.current = newState;
        setCurrentState(newState);
        pendingStateRef.current = null;
      }
      stateTransitionTimerRef.current = null;
    }, STATE_TRANSITION_DEBOUNCE_MS);
  }, []);

  const endConversationWithTimeout = useCallback(() => {
    if (!sessionActiveRef.current) return;

    console.log("⏱️ Ending conversation due to 30s timeout without speech");

    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
      conversationTimeoutRef.current = null;
    }

    const timeoutMessage = {
      role: "assistant" as const,
      content:
        "I didn't hear anything. Feel free to start a new conversation whenever you're ready!",
      timestamp: new Date().toISOString(),
    };
    onMessage?.(timeoutMessage);

    setIsProcessing(false);
    transitionTo("idle");
    sessionActiveRef.current = false;
    setIsActive(false);
    conversationStartTimeRef.current = null;
    speechDetectedInConversationRef.current = false;
  }, [onMessage, transitionTo]);

  const naturalTTS = useNaturalTTS({
    enabled: enableNaturalTTS,
    voice: ttsVoice,
    rate: ttsRate,
    onSpeechStart: () => {
      if (!ttsCanceledRef.current) {
        console.log("🎤 TTS started");
        stateRef.current = "speaking";
        setCurrentState("speaking");
        setIsProcessing(false);
        ttsSpeakingRef.current = true;
      }
    },
    onSpeechEnd: () => {
      if (!ttsCanceledRef.current) {
        console.log("✅ TTS ended");
        ttsSpeakingRef.current = false;
        speechDetectedInConversationRef.current = false;
        conversationStartTimeRef.current = Date.now();
        if (conversationTimeoutRef.current) {
          clearTimeout(conversationTimeoutRef.current);
        }
        conversationTimeoutRef.current = window.setTimeout(() => {
          if (
            sessionActiveRef.current &&
            !speechDetectedInConversationRef.current
          ) {
            console.log(
              "⏱️ 30 seconds passed without speech. Ending conversation...",
            );
            endConversationWithTimeout();
          }
        }, CONVERSATION_TIMEOUT_MS);

        if (sessionActiveRef.current) {
          stateRef.current = "listening";
          setCurrentState("listening");
          setIsProcessing(false);
          setTimeout(() => {
            if (
              sessionActiveRef.current &&
              stateRef.current === "listening" &&
              !naturalTTS.isSpeaking &&
              !ttsSpeakingRef.current
            ) {
              startRecordingRef.current();
            }
          }, RECORDING_START_DELAY_MS);
        } else {
          setIsProcessing(false);
          transitionTo("idle");
        }
      }
      ttsCanceledRef.current = false;
    },
    onError: (error) => {
      console.error("❌ TTS error:", error);
      ttsSpeakingRef.current = false;
      if (sessionActiveRef.current) {
        stateRef.current = "listening";
        setCurrentState("listening");
        setIsProcessing(false);
        setTimeout(() => {
          if (sessionActiveRef.current && stateRef.current === "listening") {
            startRecordingRef.current();
          }
        }, RECORDING_START_DELAY_MS);
      }
    },
  });

  const speakRef = useRef(naturalTTS.speak);
  useEffect(() => {
    speakRef.current = naturalTTS.speak;
  }, [naturalTTS.speak]);

  const cancelTTSRef = useRef(naturalTTS.cancel);
  useEffect(() => {
    cancelTTSRef.current = naturalTTS.cancel;
  }, [naturalTTS.cancel]);

  const isSpeakingFromTTS = naturalTTS.isSpeaking;

  const cancelTTSImmediate = useCallback(() => {
    ttsCanceledRef.current = true;
    ttsSpeakingRef.current = false; // Mark TTS as stopped
    cancelTTSRef.current();
  }, []);

  const {
    isRecording,
    startRecording: startMainRecording,
    stopRecording: stopMainRecording,
    isSupported: recorderSupported,
  } = useAudioRecorder({
    autoStop: true,
    silenceThreshold: 2.0, // Wait 2 seconds of silence before processing (after user speaks)
    minRecordingTime: 0.5, // Minimum recording time
    maxRecordingTime: 60.0, // Set high - we'll handle timeout at conversation level, not per recording
    sharedStream: sharedStream, // Pass shared stream from state
    onRecordingComplete: async (
      audioBlob: Blob,
      hasSpeech?: boolean,
      _stoppedByMaxTime?: boolean,
    ) => {
      if (!sessionActiveRef.current) return;

      stopMainRecording();

      if (hasSpeech === false || hasSpeech === undefined) {
        console.log(
          "⚠️ No speech detected in this recording, continuing to listen...",
        );

        if (
          conversationStartTimeRef.current &&
          !speechDetectedInConversationRef.current
        ) {
          const elapsed = Date.now() - conversationStartTimeRef.current;
          if (elapsed >= CONVERSATION_TIMEOUT_MS) {
            console.log(
              "⏱️ 30 seconds passed without speech. Ending conversation...",
            );
            endConversationWithTimeout();
            return;
          }
        }

        if (sessionActiveRef.current) {
          stateRef.current = "listening";
          setCurrentState("listening");
          setIsProcessing(false);
          setTimeout(() => {
            if (sessionActiveRef.current && stateRef.current === "listening") {
              startRecording();
            }
          }, 100);
        }
        return;
      }

      console.log("✅ User spoke + 2s silence detected, transcribing...");

      speechDetectedInConversationRef.current = true;
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
        conversationTimeoutRef.current = null;
      }

      stateRef.current = "processing";
      setCurrentState("processing");
      setIsProcessing(true);

      try {
        await transcribeAudio(audioBlob);
      } catch (error) {
        console.log("Transcription error (will silently retry):", error);
        const err =
          error instanceof Error ? error : new Error("Transcription failed");

        if (
          err.message.includes("Empty transcription") ||
          err.message.includes("Failed to transcribe")
        ) {
          console.log("No transcription received, continuing to listen...");
          if (sessionActiveRef.current) {
            setIsProcessing(false);
            stateRef.current = "listening";
            setCurrentState("listening");
            setTimeout(() => {
              if (
                sessionActiveRef.current &&
                stateRef.current === "listening"
              ) {
                startRecording();
              }
            }, 100);
          }
          return;
        }

        console.log("Transcription error, restarting recording...");
        if (sessionActiveRef.current) {
          setIsProcessing(false);
          stateRef.current = "listening";
          setCurrentState("listening");
          setTimeout(() => {
            if (sessionActiveRef.current && stateRef.current === "listening") {
              startRecording();
            }
          }, 100);
        } else {
          setIsProcessing(false);
          transitionTo("idle");
        }
      }
    },
    onError: (error) => {
      console.error("Recording error:", error);
      onError?.(error);
      setIsProcessing(false);
      transitionTo("idle");
    },
  });

  const startRecording = useCallback(async () => {
    if (isRecording) {
      console.log("⏸️ Already recording, skipping duplicate start");
      return;
    }

    if (stateRef.current === "processing") {
      console.log("⏸️ Cannot start recording - processing");
      return;
    }

    if (
      !ttsExplicitlyStoppedRef.current &&
      (ttsSpeakingRef.current || isSpeakingFromTTS)
    ) {
      console.log("⏸️ Cannot start recording - TTS still speaking");
      return;
    }

    if (ttsExplicitlyStoppedRef.current) {
      ttsExplicitlyStoppedRef.current = false;
    }

    if (
      stateRef.current === "speaking" &&
      !ttsSpeakingRef.current &&
      !isSpeakingFromTTS
    ) {
      console.log("⚠️ State says speaking but TTS stopped, proceeding...");
      stateRef.current = "listening";
      setCurrentState("listening");
    }

    if (
      !ttsExplicitlyStoppedRef.current &&
      stateRef.current === "speaking" &&
      (ttsSpeakingRef.current || isSpeakingFromTTS)
    ) {
      console.log("⏸️ Cannot start recording - TTS speaking");
      return;
    }

    if (!sharedStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
        });
        sharedStreamRef.current = stream;
        setSharedStream(stream);
      } catch (error) {
        console.error("Failed to get media stream:", error);
        stateRef.current = "idle";
        setCurrentState("idle");
        setIsProcessing(false);
        onError?.(
          error instanceof Error
            ? error
            : new Error("Failed to access microphone"),
        );
        return;
      }
    }

    stateRef.current = "listening";
    setCurrentState("listening");

    try {
      await startMainRecording();
    } catch (error) {
      console.error("Error starting recording:", error);
      stateRef.current = "idle";
      setCurrentState("idle");
      setIsProcessing(false);
      onError?.(
        error instanceof Error ? error : new Error("Failed to start recording"),
      );
    }
  }, [startMainRecording, onError, isRecording, isSpeakingFromTTS]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  // stopRecording kept for potential future use
  // const stopRecording = useCallback(() => {
  //   stopMainRecording();
  // }, [stopMainRecording]);

  const stopSpeakingAndListen = useCallback(async () => {
    console.log("🛑 User stopped TTS, waiting for user to speak...");

    ttsExplicitlyStoppedRef.current = true;
    cancelTTSImmediate();
    ttsSpeakingRef.current = false;

    if (isRecording) {
      stopMainRecording();
    }

    if (sessionActiveRef.current) {
      stateRef.current = "listening";
      setCurrentState("listening");
      setIsProcessing(false);

      setTimeout(() => {
        if (sessionActiveRef.current && stateRef.current === "listening") {
          startRecording();
        }
      }, RECORDING_START_DELAY_MS);
    }
  }, [cancelTTSImmediate, isRecording, stopMainRecording, startRecording]);

  const endConversationWithStop = useCallback(() => {
    if (!sessionActiveRef.current) return;

    console.log("🛑 Ending conversation - user requested to stop");

    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
      conversationTimeoutRef.current = null;
    }

    const stopMessage = {
      role: "assistant" as const,
      content:
        "Goodbye! Feel free to start a new conversation whenever you're ready!",
      timestamp: new Date().toISOString(),
    };
    onMessage?.(stopMessage);

    setIsProcessing(false);
    transitionTo("idle");
    sessionActiveRef.current = false;
    setIsActive(false);
    conversationStartTimeRef.current = null;
    speechDetectedInConversationRef.current = false;

    if (isRecording) {
      stopMainRecording();
    }
    cancelTTSImmediate();
  }, [
    onMessage,
    transitionTo,
    isRecording,
    stopMainRecording,
    cancelTTSImmediate,
  ]);

  const processStreamingText = useCallback((text: string) => {
    accumulatedResponseRef.current = text;
  }, []);

  const streamChatResponse = useCallback(
    async (transcript: string) => {
      if (!sessionActiveRef.current) return;

      if (streamingAbortControllerRef.current) {
        streamingAbortControllerRef.current.abort();
      }

      accumulatedResponseRef.current = "";
      ttsCanceledRef.current = false;
      const abortController = new AbortController();
      streamingAbortControllerRef.current = abortController;

      try {
        const response = await fetch(`${API_URL}/api/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: transcript,
            sessionId,
            language,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(
            `HTTP error! status: ${response.status}, message: ${errorText}`,
          );
        }

        if (!response.body) {
          throw new Error("Response body is null");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullResponse = "";
        let metadata: {
          agent?: string;
          orderCreated?: boolean;
          orderId?: string;
          sources?: Array<{
            id: string;
            text: string;
            sourceId: string;
            metadata: Record<string, unknown>;
          }>;
        } | null = null;
        let ttsTriggered = false; // Track if TTS has been triggered

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            if (
              fullResponse.trim() &&
              sessionActiveRef.current &&
              !ttsCanceledRef.current &&
              !ttsTriggered
            ) {
              console.log(
                "🎤 Triggering TTS from stream end:",
                fullResponse.substring(0, 50) + "...",
              );
              ttsTriggered = true;
              speakRef.current(fullResponse);
            } else if (!ttsTriggered) {
              console.log("⚠️ Not triggering TTS:", {
                hasResponse: !!fullResponse.trim(),
                sessionActive: sessionActiveRef.current,
                ttsCanceled: ttsCanceledRef.current,
                fullResponseLength: fullResponse.length,
                ttsTriggered,
              });
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "token" && data.content) {
                  fullResponse += data.content;
                  processStreamingText(fullResponse);
                } else if (data.type === "metadata") {
                  metadata = data;
                } else if (data.type === "done") {
                  fullResponse = data.finalText || fullResponse;
                  metadata = {
                    agent: data.agent,
                    orderCreated: data.orderCreated,
                    orderId: data.orderId,
                    sources: data.sources,
                  };
                  if (
                    fullResponse.trim() &&
                    sessionActiveRef.current &&
                    !ttsCanceledRef.current &&
                    !ttsTriggered
                  ) {
                    console.log(
                      "🎤 Triggering TTS from done event:",
                      fullResponse.substring(0, 50) + "...",
                    );
                    ttsTriggered = true;
                    speakRef.current(fullResponse);
                  }
                } else if (data.type === "error") {
                  throw new Error(data.error || "Unknown error");
                }
              } catch {
                // Ignore parse errors for malformed JSON lines
              }
            }
          }
        }

        const assistantMessage = {
          role: "assistant" as const,
          content: fullResponse,
          timestamp: new Date().toISOString(),
          orderId: metadata?.orderId,
          sources: metadata?.sources,
        };

        onMessage?.(assistantMessage);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        const err =
          error instanceof Error
            ? error
            : new Error("Failed to stream message");
        onError?.(err);
        setIsProcessing(false);
        transitionTo("idle");
      } finally {
        streamingAbortControllerRef.current = null;
      }
    },
    [sessionId, onMessage, onError, processStreamingText, transitionTo],
  );

  const { transcribe: transcribeAudio, isTranscribing } =
    useWhisperTranscription({
      language,
      onTranscriptionComplete: async (transcript: string) => {
        if (!sessionActiveRef.current) return;

        console.log("Transcription complete:", transcript);

        if (containsStopKeyword(transcript)) {
          console.log("🛑 Stop keyword detected in transcript:", transcript);
          const userMessage = {
            role: "user" as const,
            content: transcript,
          };
          onMessage?.(userMessage);
          endConversationWithStop();
          return;
        }

        const userMessage = {
          role: "user" as const,
          content: transcript,
        };
        onMessage?.(userMessage);

        try {
          await streamChatResponse(transcript);
        } catch (error) {
          console.error("Error sending message:", error);
          const err =
            error instanceof Error
              ? error
              : new Error("Failed to send message");
          onError?.(err);
          setIsProcessing(false);
          transitionTo("idle");
        }
      },
      onError: (error) => {
        console.log("Transcription error (silent retry):", error);
        if (sessionActiveRef.current) {
          setIsProcessing(false);
          stateRef.current = "listening";
          setCurrentState("listening");
          if (
            conversationStartTimeRef.current &&
            !speechDetectedInConversationRef.current
          ) {
            const elapsed = Date.now() - conversationStartTimeRef.current;
            if (elapsed >= CONVERSATION_TIMEOUT_MS) {
              endConversationWithTimeout();
              return;
            }
          }
          setTimeout(() => {
            if (sessionActiveRef.current && stateRef.current === "listening") {
              startRecording();
            }
          }, 100);
        } else {
          setIsProcessing(false);
          transitionTo("idle");
        }
      },
    });

  const startConversation = useCallback(async () => {
    if (!recorderSupported) {
      onError?.(new Error("Voice recording is not supported in this browser"));
      return;
    }

    console.log("Starting voice conversation...");

    conversationStartTimeRef.current = Date.now();
    speechDetectedInConversationRef.current = false;

    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
    }
    conversationTimeoutRef.current = window.setTimeout(() => {
      if (
        sessionActiveRef.current &&
        !speechDetectedInConversationRef.current
      ) {
        console.log(
          "⏱️ 30 seconds passed without speech. Ending conversation...",
        );
        endConversationWithTimeout();
      }
    }, CONVERSATION_TIMEOUT_MS);

    try {
      await unlockAudioContext();
    } catch (error) {
      console.warn("Could not unlock audio context:", error);
    }

    if (!sharedStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
        });
        sharedStreamRef.current = stream;
        setSharedStream(stream);
      } catch (error) {
        console.error("Failed to get media stream:", error);
        onError?.(
          error instanceof Error
            ? error
            : new Error("Failed to access microphone"),
        );
        return;
      }
    }

    sessionActiveRef.current = true;
    setIsActive(true);
    setIsProcessing(true);
    transitionTo("listening");

    setTimeout(() => {
      if (sessionActiveRef.current) {
        startRecording();
      }
    }, 100);
  }, [
    recorderSupported,
    startRecording,
    unlockAudioContext,
    onError,
    transitionTo,
    endConversationWithTimeout,
  ]);

  const stopConversation = useCallback(() => {
    console.log("Stopping voice conversation...");

    sessionActiveRef.current = false;
    setIsActive(false);
    setIsProcessing(false);
    transitionTo("idle");

    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
      conversationTimeoutRef.current = null;
    }

    conversationStartTimeRef.current = null;
    speechDetectedInConversationRef.current = false;

    if (isRecording) {
      stopMainRecording();
    }

    cancelTTSImmediate();

    if (stateTransitionTimerRef.current) {
      clearTimeout(stateTransitionTimerRef.current);
      stateTransitionTimerRef.current = null;
    }

    if (sharedStreamRef.current) {
      sharedStreamRef.current.getTracks().forEach((track) => track.stop());
      sharedStreamRef.current = null;
      setSharedStream(null);
    }
  }, [isRecording, stopMainRecording, cancelTTSImmediate, transitionTo]);

  useEffect(() => {
    return () => {
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
        conversationTimeoutRef.current = null;
      }

      if (stateTransitionTimerRef.current) {
        clearTimeout(stateTransitionTimerRef.current);
        stateTransitionTimerRef.current = null;
      }

      if (sharedStreamRef.current) {
        sharedStreamRef.current.getTracks().forEach((track) => track.stop());
        sharedStreamRef.current = null;
        setSharedStream(null);
      }
    };
  }, []);

  return {
    isActive,
    isProcessing,
    currentState,
    isRecording,
    isTranscribing,
    isSpeaking: isSpeakingFromTTS,
    startConversation,
    stopConversation,
    stopSpeaking: stopSpeakingAndListen,
    isSupported: recorderSupported,
  };
}
