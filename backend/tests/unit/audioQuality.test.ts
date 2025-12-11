import { describe, test, expect } from "vitest";
import {
  calculateAudioQualityMetrics,
  isAudioQualityAcceptable,
  getQualityAssessment,
  type AudioMetadata,
  type AudioQualityMetrics,
} from "../../src/utils/audioQuality.js";

describe("Audio Quality Utilities", () => {
  describe("calculateAudioQualityMetrics", () => {
    test("should calculate metrics for high quality audio", () => {
      const metadata: AudioMetadata = {
        mimeType: "audio/webm",
        duration: 5.0,
        fileSize: 60000,
        sampleRate: 16000,
        bitrate: 64,
      };

      const result = calculateAudioQualityMetrics(metadata);
      expect(result.qualityScore).toBeGreaterThan(60);
      expect(result.duration).toBe(5.0);
      expect(result.fileSize).toBe(60000);
      expect(result.sampleRate).toBe(16000);
      expect(result.bitrate).toBe(64);
    });

    test("should calculate metrics for low quality audio", () => {
      const metadata: AudioMetadata = {
        mimeType: "audio/mpeg",
        duration: 5.0,
        fileSize: 10000,
        sampleRate: 8000,
        bitrate: 16,
      };

      const result = calculateAudioQualityMetrics(metadata);
      expect(result.qualityScore).toBeLessThan(60);
      expect(result.sampleRate).toBe(8000);
    });

    test("should handle missing optional fields", () => {
      const metadata: AudioMetadata = {
        mimeType: "audio/webm",
        duration: 3.0,
        fileSize: 30000,
      };

      const result = calculateAudioQualityMetrics(metadata);
      expect(result.duration).toBe(3.0);
      expect(result.fileSize).toBe(30000);
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
    });

    test("should clamp quality score between 0 and 100", () => {
      const veryLowQuality: AudioMetadata = {
        mimeType: "audio/mpeg",
        duration: 1.0,
        fileSize: 100,
        sampleRate: 4000,
        bitrate: 8,
      };

      const result = calculateAudioQualityMetrics(veryLowQuality);
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
    });

    test("should prefer webm/opus format", () => {
      const webmMetadata: AudioMetadata = {
        mimeType: "audio/webm",
        duration: 5.0,
        fileSize: 50000,
        sampleRate: 16000,
      };

      const mp3Metadata: AudioMetadata = {
        mimeType: "audio/mpeg",
        duration: 5.0,
        fileSize: 50000,
        sampleRate: 16000,
      };

      const webmResult = calculateAudioQualityMetrics(webmMetadata);
      const mp3Result = calculateAudioQualityMetrics(mp3Metadata);
      expect(webmResult.qualityScore).toBeGreaterThan(mp3Result.qualityScore);
    });

    test("should calculate SNR and RMS estimates", () => {
      const metadata: AudioMetadata = {
        mimeType: "audio/webm",
        duration: 5.0,
        fileSize: 50000,
        sampleRate: 16000,
      };

      const result = calculateAudioQualityMetrics(metadata);
      expect(result.snr).toBeGreaterThanOrEqual(0);
      expect(result.rms).toBeGreaterThanOrEqual(0);
      expect(result.rms).toBeLessThanOrEqual(1);
    });
  });

  describe("isAudioQualityAcceptable", () => {
    test("should return true for acceptable quality", () => {
      const metrics: AudioQualityMetrics = {
        snr: 40,
        rms: 0.4,
        duration: 5.0,
        fileSize: 50000,
        sampleRate: 16000,
        qualityScore: 70,
      };

      expect(isAudioQualityAcceptable(metrics, 30)).toBe(true);
    });

    test("should return false for unacceptable quality", () => {
      const metrics: AudioQualityMetrics = {
        snr: 20,
        rms: 0.2,
        duration: 5.0,
        fileSize: 50000,
        sampleRate: 8000,
        qualityScore: 25,
      };

      expect(isAudioQualityAcceptable(metrics, 30)).toBe(false);
    });

    test("should use default threshold of 30", () => {
      const metrics: AudioQualityMetrics = {
        snr: 35,
        rms: 0.35,
        duration: 5.0,
        fileSize: 50000,
        qualityScore: 50,
      };

      expect(isAudioQualityAcceptable(metrics)).toBe(true);
    });
  });

  describe("getQualityAssessment", () => {
    test("should return excellent for high quality score", () => {
      const metrics: AudioQualityMetrics = {
        snr: 50,
        rms: 0.5,
        duration: 5.0,
        fileSize: 60000,
        sampleRate: 16000,
        qualityScore: 85,
      };

      const assessment = getQualityAssessment(metrics);
      expect(assessment.level).toBe("excellent");
      expect(assessment.message).toContain("excellent");
    });

    test("should return good for medium-high quality score", () => {
      const metrics: AudioQualityMetrics = {
        snr: 40,
        rms: 0.4,
        duration: 5.0,
        fileSize: 50000,
        sampleRate: 16000,
        qualityScore: 65,
      };

      const assessment = getQualityAssessment(metrics);
      expect(assessment.level).toBe("good");
      expect(assessment.message).toContain("good");
    });

    test("should return fair for medium quality score", () => {
      const metrics: AudioQualityMetrics = {
        snr: 30,
        rms: 0.3,
        duration: 5.0,
        fileSize: 30000,
        sampleRate: 8000,
        qualityScore: 45,
      };

      const assessment = getQualityAssessment(metrics);
      expect(assessment.level).toBe("fair");
      expect(assessment.message).toContain("fair");
      expect(assessment.suggestions.length).toBeGreaterThan(0);
    });

    test("should return poor for low quality score", () => {
      const metrics: AudioQualityMetrics = {
        snr: 15,
        rms: 0.15,
        duration: 5.0,
        fileSize: 10000,
        sampleRate: 4000,
        qualityScore: 25,
      };

      const assessment = getQualityAssessment(metrics);
      expect(assessment.level).toBe("poor");
      expect(assessment.message).toContain("poor");
      expect(assessment.suggestions.length).toBeGreaterThan(0);
    });

    test("should suggest improvements for short recordings", () => {
      const metrics: AudioQualityMetrics = {
        snr: 40,
        rms: 0.4,
        duration: 0.3,
        fileSize: 50000,
        sampleRate: 16000,
        qualityScore: 70,
      };

      const assessment = getQualityAssessment(metrics);
      expect(assessment.suggestions.some((s) => s.includes("short"))).toBe(
        true,
      );
    });

    test("should suggest improvements for low sample rate", () => {
      const metrics: AudioQualityMetrics = {
        snr: 30,
        rms: 0.3,
        duration: 5.0,
        fileSize: 30000,
        sampleRate: 8000,
        qualityScore: 45,
      };

      const assessment = getQualityAssessment(metrics);
      expect(
        assessment.suggestions.some(
          (s) => s.includes("sample rate") || s.includes("microphone"),
        ),
      ).toBe(true);
    });
  });
});
