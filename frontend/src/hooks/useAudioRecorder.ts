import { useState, useRef, useCallback } from "react";
import { SpeechDetector } from "../utils/speechDetector.js";

interface UseAudioRecorderOptions {
  onRecordingComplete?: (
    audioBlob: Blob,
    hasSpeech?: boolean,
    stoppedByMaxTime?: boolean,
  ) => void;
  onError?: (error: Error) => void;
  autoStop?: boolean; // Auto-stop after silence
  silenceThreshold?: number; // Silence threshold in seconds (fixed, waits this long after user speaks)
  minRecordingTime?: number; // Minimum recording time in seconds
  maxRecordingTime?: number; // Maximum recording time in seconds (safety fallback)
  sharedStream?: MediaStream | null; // Optional shared MediaStream (for use with interruption monitoring)
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const {
    onRecordingComplete,
    onError,
    autoStop = false,
    silenceThreshold: initialSilenceThreshold = 2.0, // Fixed threshold: wait 2 seconds of silence
    minRecordingTime = 0.5, // Minimum 0.5 seconds
    maxRecordingTime = 10.0, // Maximum 10 seconds (safety fallback)
    sharedStream = null, // Optional shared stream
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const silenceThreshold = initialSilenceThreshold;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const maxTimeTimerRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const isSharedStreamRef = useRef(false);
  const speechDetectedRef = useRef<boolean>(false);
  const backgroundNoiseLevelRef = useRef<number>(0);
  const lastSpeechEndTimeRef = useRef<number>(0);
  const speechDetectorRef = useRef<SpeechDetector | null>(null);
  const stoppedByMaxTimeRef = useRef<boolean>(false);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      setRecordingTime(0);
      speechDetectedRef.current = false;
      stoppedByMaxTimeRef.current = false;

      let stream: MediaStream;
      if (sharedStream && sharedStream.active) {
        stream = sharedStream;
        isSharedStreamRef.current = true;
        console.log("[useAudioRecorder] Using shared MediaStream");
      } else {
        isSharedStreamRef.current = false;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (err: unknown) {
          const error =
            err instanceof Error ? err : new Error("Failed to get user media");
          if (
            error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError"
          ) {
            throw new Error(
              "Microphone permission denied. Please allow microphone access and try again.",
            );
          } else if (
            err.name === "NotFoundError" ||
            err.name === "DevicesNotFoundError"
          ) {
            throw new Error(
              "No microphone found. Please connect a microphone and try again.",
            );
          } else if (
            err.name === "NotReadableError" ||
            err.name === "TrackStartError"
          ) {
            throw new Error(
              "Microphone is already in use by another application.",
            );
          } else {
            throw new Error(
              `Failed to access microphone: ${err.message || "Unknown error"}`,
            );
          }
        }
      }

      streamRef.current = stream;

      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/mpeg",
      ];

      let selectedMimeType: string | undefined;
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const options: MediaRecorderOptions = selectedMimeType
        ? { mimeType: selectedMimeType }
        : {};

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (err: unknown) {
        try {
          mediaRecorder = new MediaRecorder(stream);
        } catch {
          stream.getTracks().forEach((track) => track.stop());
          const error =
            err instanceof Error
              ? err
              : new Error("Failed to create MediaRecorder");
          throw new Error(
            `Failed to create MediaRecorder: ${error.message || "Unsupported browser"}`,
          );
        }
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log("[onstop] MediaRecorder stopped, processing audio data...");
        console.log("[onstop] Audio chunks:", audioChunksRef.current.length);

        if (audioChunksRef.current.length === 0) {
          console.error("[onstop] No audio data recorded");
          const error = new Error("No audio data recorded. Please try again.");
          setError(error);
          onError?.(error);

          if (streamRef.current && !isSharedStreamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          } else {
            streamRef.current = null;
          }
          return;
        }

        const blobType =
          mediaRecorder.mimeType || selectedMimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });

        console.log("[onstop] Audio blob created:", {
          size: audioBlob.size,
          type: blobType,
        });

        if (audioBlob.size === 0) {
          console.error("[onstop] Audio blob is empty");
          const error = new Error("Recorded audio is empty. Please try again.");
          setError(error);
          onError?.(error);

          if (streamRef.current && !isSharedStreamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          } else {
            streamRef.current = null;
          }
          return;
        }

        console.log("[onstop] Calling onRecordingComplete callback");
        const hasSpeech = speechDetectedRef.current;
        const stoppedByMaxTime = stoppedByMaxTimeRef.current;
        console.log(
          `[onstop] Speech detection result: ${hasSpeech ? "SPEECH DETECTED" : "NO SPEECH"}, Stopped by max time: ${stoppedByMaxTime}`,
        );
        onRecordingComplete?.(audioBlob, hasSpeech, stoppedByMaxTime);

        speechDetectedRef.current = false;
        stoppedByMaxTimeRef.current = false;

        if (streamRef.current && !isSharedStreamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        } else {
          streamRef.current = null;
        }
      };

      mediaRecorder.onerror = (event: Event) => {
        const errorEvent = event as ErrorEvent;
        const errorMessage =
          errorEvent.error?.message || "Recording error occurred";
        const error = new Error(errorMessage);
        setError(error);
        setIsRecording(false);

        if (speechDetectorRef.current) {
          speechDetectorRef.current.dispose();
          speechDetectorRef.current = null;
        }

        if (streamRef.current && !isSharedStreamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        } else {
          streamRef.current = null;
        }

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        onError?.(error);
      };

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("No audio tracks available in the stream");
      }

      const enabledTracks = audioTracks.filter(
        (track) => track.enabled && track.readyState === "live",
      );
      if (enabledTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Audio tracks are not enabled or active");
      }

      mediaRecorderRef.current = mediaRecorder;

      try {
        if (mediaRecorder.state === "inactive") {
          mediaRecorder.start(1000);
        } else {
          console.warn(
            `MediaRecorder state is ${mediaRecorder.state}, expected 'inactive'`,
          );
        }
      } catch (err: unknown) {
        // Clean up stream
        stream.getTracks().forEach((track) => track.stop());
        const error =
          err instanceof Error ? err : new Error("Failed to start recording");
        throw new Error(
          `Failed to start recording: ${error.message || "Unknown error"}`,
        );
      }

      if (mediaRecorder.state !== "recording") {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(
          `Recording failed to start. State: ${mediaRecorder.state}`,
        );
      }

      setIsRecording(true);
      isRecordingRef.current = true;
      startTimeRef.current = Date.now();
      backgroundNoiseLevelRef.current = 0; // Reset background noise level for new recording
      lastSoundTimeRef.current = Date.now();
      lastSpeechEndTimeRef.current = Date.now();
      speechDetectedRef.current = false;

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      if (autoStop) {
        try {
          const audioContext = new (
            window.AudioContext ||
            (
              window as typeof window & {
                webkitAudioContext?: typeof AudioContext;
              }
            ).webkitAudioContext
          )();
          const analyser = audioContext.createAnalyser();
          const microphone = audioContext.createMediaStreamSource(stream);

          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.3;
          microphone.connect(analyser);

          audioContextRef.current = audioContext;
          analyserRef.current = analyser;

          if (!speechDetectorRef.current) {
            try {
              speechDetectorRef.current = new SpeechDetector(
                audioContext,
                analyser,
                microphone,
              );
              console.log(
                "[Speech Detection] FFT-based speech detector initialized in silence detection",
              );
            } catch (error) {
              console.warn(
                "[Speech Detection] Failed to initialize FFT detector in silence detection:",
                error,
              );
            }
          }

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const checkSilence = () => {
            if (
              !analyserRef.current ||
              !mediaRecorderRef.current ||
              !isRecordingRef.current
            ) {
              if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
              }
              return;
            }

            analyserRef.current.getByteFrequencyData(dataArray);

            const average =
              dataArray.reduce((sum, value) => sum + value, 0) /
              dataArray.length;
            const peak = Math.max(...Array.from(dataArray));

            const now = Date.now();
            const elapsed = (now - startTimeRef.current) / 1000;

            let isActualSpeech = false;
            if (speechDetectorRef.current) {
              try {
                const speechResult = speechDetectorRef.current.detectSpeech();
                isActualSpeech = speechResult.isSpeech;

                if (isActualSpeech) {
                  lastSoundTimeRef.current = now;
                  lastSpeechEndTimeRef.current = now;
                  speechDetectedRef.current = true;

                  if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = null;
                  }

                  console.log(
                    `[Speech Detection] ✅ Speech detected - Confidence: ${speechResult.confidence.toFixed(2)}, Centroid: ${speechResult.features.spectralCentroid.toFixed(0)}Hz, MFCC: ${speechResult.features.mfcc
                      .slice(0, 3)
                      .map((v) => v.toFixed(1))
                      .join(",")}`,
                  );
                } else {
                  if (elapsed % 2 < 0.1 && speechResult.confidence > 0.3) {
                    console.log(
                      `[Speech Detection] ⚠️ No speech (confidence: ${speechResult.confidence.toFixed(2)}, threshold: 0.50), Centroid: ${speechResult.features.spectralCentroid.toFixed(0)}Hz`,
                    );
                  }
                }
              } catch (error) {
                console.warn(
                  "[Speech Detection] Error in FFT detection, falling back to volume-based:",
                  error,
                );
                isActualSpeech = false;
              }
            }

            if (!speechDetectorRef.current) {
              const baseThreshold = 3;
              const noiseMultiplier = Math.min(
                backgroundNoiseLevelRef.current || 2,
                5,
              );
              const adaptiveThreshold = Math.max(
                baseThreshold,
                noiseMultiplier * 1.2,
              );

              if (elapsed < 0.5) {
                if (
                  backgroundNoiseLevelRef.current === 0 ||
                  average < backgroundNoiseLevelRef.current
                ) {
                  backgroundNoiseLevelRef.current = average;
                }
              }

              if (average > adaptiveThreshold) {
                lastSoundTimeRef.current = now;
                lastSpeechEndTimeRef.current = now;
                speechDetectedRef.current = true;
                isActualSpeech = true;
              }
            }

            if (elapsed % 1 < 0.1) {
              const silenceDuration =
                (now - lastSpeechEndTimeRef.current) / 1000;
              const detectionMethod = speechDetectorRef.current
                ? "FFT"
                : "Volume";
              console.log(
                `[Silence Detection] Elapsed: ${elapsed.toFixed(1)}s, Volume: ${average.toFixed(1)}, Peak: ${peak.toFixed(1)}, Silence: ${silenceDuration.toFixed(1)}s, SpeechDetected: ${speechDetectedRef.current}, Method: ${detectionMethod}`,
              );
            }

            if (elapsed < minRecordingTime) {
              if (isRecordingRef.current) {
                animationFrameRef.current = requestAnimationFrame(checkSilence);
              }
              return;
            }

            const silenceDuration = (now - lastSpeechEndTimeRef.current) / 1000;

            if (!speechDetectedRef.current) {
              if (isRecordingRef.current) {
                animationFrameRef.current = requestAnimationFrame(checkSilence);
              }
              return;
            }

            if (silenceDuration >= silenceThreshold) {
              console.log(
                `[Silence Detection] Silence detected for ${silenceDuration.toFixed(1)}s (threshold: ${silenceThreshold.toFixed(2)}s, after ${elapsed.toFixed(1)}s total), stopping recording...`,
              );
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
              }
              silenceTimerRef.current = window.setTimeout(() => {
                if (mediaRecorderRef.current && isRecordingRef.current) {
                  console.log(
                    "[Silence Detection] Auto-stopping recording after silence confirmation",
                  );

                  lastSpeechEndTimeRef.current = now;

                  if (maxTimeTimerRef.current) {
                    clearTimeout(maxTimeTimerRef.current);
                    maxTimeTimerRef.current = null;
                  }
                  stopRecording();
                }
              }, 100);
              return;
            }

            if (isRecordingRef.current) {
              animationFrameRef.current = requestAnimationFrame(checkSilence);
            }
          };

          setTimeout(() => {
            if (isRecordingRef.current) {
              console.log(
                `[Silence Detection] Starting silence detection (threshold: ${silenceThreshold.toFixed(2)}s, will wait for minimum recording time)`,
              );
              animationFrameRef.current = requestAnimationFrame(checkSilence);
            }
          }, 300);

          if (maxRecordingTime > 0) {
            maxTimeTimerRef.current = window.setTimeout(() => {
              if (mediaRecorderRef.current && isRecordingRef.current) {
                console.log(
                  `[Max Time] Maximum recording time (${maxRecordingTime}s) reached, stopping...`,
                );
                stoppedByMaxTimeRef.current = true; // Mark that we're stopping due to max time
                stopRecording();
              }
            }, maxRecordingTime * 1000);
          }
        } catch (err) {
          console.warn("Silence detection not available:", err);
          if (autoStop) {
            const fallbackTime = Math.min(maxRecordingTime * 1000, 5000);
            silenceTimerRef.current = window.setTimeout(() => {
              if (mediaRecorderRef.current && isRecordingRef.current) {
                console.log("[Fallback] Timeout reached, stopping recording");
                stoppedByMaxTimeRef.current = true;
                stopRecording();
              }
            }, fallbackTime);
          }
        }
      } else if (maxRecordingTime > 0) {
        maxTimeTimerRef.current = window.setTimeout(() => {
          if (mediaRecorderRef.current && isRecordingRef.current) {
            console.log(
              `[Max Time] Maximum recording time (${maxRecordingTime}s) reached, stopping...`,
            );
            stoppedByMaxTimeRef.current = true; // Mark that we're stopping due to max time
            stopRecording();
          }
        }, maxRecordingTime * 1000);
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to start recording");
      setError(error);
      setIsRecording(false);

      if (streamRef.current && !isSharedStreamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      } else {
        streamRef.current = null;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      onError?.(error);
    }
  }, [onRecordingComplete, onError, sharedStream]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecordingRef.current) {
      console.log("[stopRecording] Not recording, skipping stop");
      return;
    }

    console.log("[stopRecording] Stopping recording...", {
      state: mediaRecorderRef.current.state,
      isRecording: isRecordingRef.current,
      stoppedByMaxTime: stoppedByMaxTimeRef.current,
    });

    try {
      isRecordingRef.current = false;

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      if (maxTimeTimerRef.current) {
        clearTimeout(maxTimeTimerRef.current);
        maxTimeTimerRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
      analyserRef.current = null;

      if (speechDetectorRef.current) {
        speechDetectorRef.current.dispose();
        speechDetectorRef.current = null;
      }

      const recorder = mediaRecorderRef.current;
      if (recorder.state === "recording" || recorder.state === "paused") {
        console.log(
          "[stopRecording] MediaRecorder state:",
          recorder.state,
          "- calling stop()",
        );
        recorder.requestData();
        recorder.stop();
        console.log("[stopRecording] MediaRecorder.stop() called");
      } else {
        console.warn(
          "[stopRecording] MediaRecorder not in recording/paused state:",
          recorder.state,
        );
      }

      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch (err) {
      console.error("[stopRecording] Error stopping recording:", err);
      const error =
        err instanceof Error ? err : new Error("Failed to stop recording");
      setError(error);
      setIsRecording(false);
      isRecordingRef.current = false;

      if (streamRef.current && !isSharedStreamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      } else {
        streamRef.current = null;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      if (maxTimeTimerRef.current) {
        clearTimeout(maxTimeTimerRef.current);
        maxTimeTimerRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }

      onError?.(error);
    }
  }, [onError]);

  const isSupported =
    typeof window !== "undefined" &&
    "MediaRecorder" in window &&
    "mediaDevices" in navigator &&
    "getUserMedia" in navigator.mediaDevices;

  return {
    isRecording,
    recordingTime,
    error,
    isSupported,
    silenceThreshold, // Expose current threshold for UI
    startRecording,
    stopRecording,
  };
}
