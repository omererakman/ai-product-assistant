export interface AudioQualityMetrics {
  snr: number; // Signal-to-Noise Ratio (dB)
  rms: number; // Root Mean Square amplitude (0-1)
  duration: number; // Duration in seconds
  fileSize: number; // File size in bytes
  sampleRate?: number; // Sample rate in Hz
  bitrate?: number; // Bitrate in kbps
  qualityScore: number; // Overall quality score (0-100)
}

export interface AudioMetadata {
  mimeType: string;
  duration?: number;
  fileSize: number;
  sampleRate?: number;
  bitrate?: number;
}

export function calculateAudioQualityMetrics(
  metadata: AudioMetadata
): AudioQualityMetrics {
  const { mimeType, duration, fileSize, sampleRate, bitrate } = metadata;

  // Estimate quality score based on available metrics
  let qualityScore = 50; // Base score

  // File size vs duration ratio (compression efficiency)
  if (duration && duration > 0) {
    const bytesPerSecond = fileSize / duration;
    // Optimal range: 8-16 KB/s for speech (varies by codec)
    if (bytesPerSecond >= 8000 && bytesPerSecond <= 16000) {
      qualityScore += 20;
    } else if (bytesPerSecond >= 4000 && bytesPerSecond < 8000) {
      qualityScore += 10;
    } else if (bytesPerSecond < 4000) {
      qualityScore -= 10; // Too compressed
    }
  }

  // Sample rate check (16kHz is optimal for Whisper)
  if (sampleRate) {
    if (sampleRate >= 16000) {
      qualityScore += 15;
    } else if (sampleRate >= 8000) {
      qualityScore += 5;
    } else {
      qualityScore -= 15; // Too low
    }
  }

  // Bitrate check
  if (bitrate) {
    if (bitrate >= 64) {
      qualityScore += 10;
    } else if (bitrate >= 32) {
      qualityScore += 5;
    } else {
      qualityScore -= 5;
    }
  }

  // MIME type check (prefer webm/opus for web)
  if (mimeType.includes("webm") || mimeType.includes("opus")) {
    qualityScore += 5;
  }

  // Clamp score between 0 and 100
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  // Estimate SNR (simplified - would need actual audio analysis)
  // Higher quality score = better estimated SNR
  const estimatedSNR = qualityScore * 0.6; // Scale to reasonable SNR range

  // Estimate RMS (simplified - would need actual audio analysis)
  // Assume good audio has RMS around 0.3-0.5
  const estimatedRMS = qualityScore / 200; // Scale to 0-0.5 range

  return {
    snr: estimatedSNR,
    rms: estimatedRMS,
    duration: duration || 0,
    fileSize,
    sampleRate,
    bitrate,
    qualityScore,
  };
}

export function isAudioQualityAcceptable(
  metrics: AudioQualityMetrics,
  minQualityScore: number = 30
): boolean {
  return metrics.qualityScore >= minQualityScore;
}

export function getQualityAssessment(
  metrics: AudioQualityMetrics
): {
  level: "excellent" | "good" | "fair" | "poor";
  message: string;
  suggestions: string[];
} {
  const { qualityScore, duration, sampleRate } = metrics;

  let level: "excellent" | "good" | "fair" | "poor";
  let message: string;
  const suggestions: string[] = [];

  if (qualityScore >= 80) {
    level = "excellent";
    message = "Audio quality is excellent";
  } else if (qualityScore >= 60) {
    level = "good";
    message = "Audio quality is good";
  } else if (qualityScore >= 40) {
    level = "fair";
    message = "Audio quality is fair - transcription may have errors";
    suggestions.push("Try speaking closer to the microphone");
    suggestions.push("Reduce background noise");
  } else {
    level = "poor";
    message = "Audio quality is poor - transcription may fail";
    suggestions.push("Move to a quieter location");
    suggestions.push("Speak louder and closer to the microphone");
    suggestions.push("Check microphone connection");
  }

  if (duration && duration < 0.5) {
    suggestions.push("Recording is too short - speak for at least 0.5 seconds");
  }

  if (sampleRate && sampleRate < 16000) {
    suggestions.push("Sample rate is low - use a better microphone if possible");
  }

  return { level, message, suggestions };
}
