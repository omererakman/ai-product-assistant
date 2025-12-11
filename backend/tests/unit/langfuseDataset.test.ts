import { describe, test, expect } from "vitest";
import {
  evaluateTranscription,
  generateEvaluationReport,
  type TestCaseResult,
} from "../../src/utils/langfuseDataset.js";

describe("Langfuse Dataset Utilities", () => {
  describe("evaluateTranscription", () => {
    test("should evaluate perfect transcription", () => {
      const result = evaluateTranscription("hello world", "hello world", 0.15);

      expect(result.passed).toBe(true);
      expect(result.wer.wer).toBe(0);
      expect(result.wer.accuracy).toBe(1);
      expect(result.threshold).toBe(0.15);
    });

    test("should evaluate transcription with errors", () => {
      const result = evaluateTranscription(
        "hello world test",
        "hello there test",
        0.15,
      );

      expect(result.wer.wer).toBeGreaterThan(0);
      expect(result.wer.wer).toBeLessThan(1);
      expect(result.expectedTranscript).toBe("hello world test");
      expect(result.actualTranscript).toBe("hello there test");
    });

    test("should fail when WER exceeds threshold", () => {
      const result = evaluateTranscription(
        "hello world",
        "goodbye there",
        0.15,
      );

      expect(result.passed).toBe(false);
      expect(result.wer.wer).toBeGreaterThan(0.15);
    });

    test("should pass when WER is below threshold", () => {
      const result = evaluateTranscription(
        "the quick brown fox",
        "the quick brown fox jumps",
        0.5,
      );

      expect(result.passed).toBe(true);
    });

    test("should use default threshold of 0.15", () => {
      const result = evaluateTranscription("hello world", "hello world");

      expect(result.threshold).toBe(0.15);
      expect(result.passed).toBe(true);
    });
  });

  describe("generateEvaluationReport", () => {
    test("should generate report for all passed tests", () => {
      const results: TestCaseResult[] = [
        {
          testCaseId: "1",
          category: "clean-speech",
          expectedTranscript: "hello",
          actualTranscript: "hello",
          wer: {
            wer: 0,
            substitutions: 0,
            deletions: 0,
            insertions: 0,
            totalWords: 1,
            correctWords: 1,
            accuracy: 1,
          },
          passed: true,
          threshold: 0.15,
        },
        {
          testCaseId: "2",
          category: "clean-speech",
          expectedTranscript: "world",
          actualTranscript: "world",
          wer: {
            wer: 0,
            substitutions: 0,
            deletions: 0,
            insertions: 0,
            totalWords: 1,
            correctWords: 1,
            accuracy: 1,
          },
          passed: true,
          threshold: 0.15,
        },
      ];

      const report = generateEvaluationReport(results);
      expect(report.total).toBe(2);
      expect(report.passed).toBe(2);
      expect(report.failed).toBe(0);
      expect(report.averageWER).toBe(0);
      expect(report.averageAccuracy).toBe(1);
    });

    test("should generate report with failures", () => {
      const results: TestCaseResult[] = [
        {
          testCaseId: "1",
          category: "clean-speech",
          expectedTranscript: "hello",
          actualTranscript: "hello",
          wer: {
            wer: 0,
            substitutions: 0,
            deletions: 0,
            insertions: 0,
            totalWords: 1,
            correctWords: 1,
            accuracy: 1,
          },
          passed: true,
          threshold: 0.15,
        },
        {
          testCaseId: "2",
          category: "noisy-speech",
          expectedTranscript: "world",
          actualTranscript: "word",
          wer: {
            wer: 1,
            substitutions: 1,
            deletions: 0,
            insertions: 0,
            totalWords: 1,
            correctWords: 0,
            accuracy: 0,
          },
          passed: false,
          threshold: 0.15,
        },
      ];

      const report = generateEvaluationReport(results);
      expect(report.total).toBe(2);
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(1);
      expect(report.averageWER).toBe(0.5);
      expect(report.averageAccuracy).toBe(0.5);
    });

    test("should group results by category", () => {
      const results: TestCaseResult[] = [
        {
          testCaseId: "1",
          category: "clean-speech",
          expectedTranscript: "hello",
          actualTranscript: "hello",
          wer: {
            wer: 0,
            substitutions: 0,
            deletions: 0,
            insertions: 0,
            totalWords: 1,
            correctWords: 1,
            accuracy: 1,
          },
          passed: true,
          threshold: 0.15,
        },
        {
          testCaseId: "2",
          category: "clean-speech",
          expectedTranscript: "world",
          actualTranscript: "world",
          wer: {
            wer: 0,
            substitutions: 0,
            deletions: 0,
            insertions: 0,
            totalWords: 1,
            correctWords: 1,
            accuracy: 1,
          },
          passed: true,
          threshold: 0.15,
        },
        {
          testCaseId: "3",
          category: "noisy-speech",
          expectedTranscript: "test",
          actualTranscript: "best",
          wer: {
            wer: 1,
            substitutions: 1,
            deletions: 0,
            insertions: 0,
            totalWords: 1,
            correctWords: 0,
            accuracy: 0,
          },
          passed: false,
          threshold: 0.15,
        },
      ];

      const report = generateEvaluationReport(results);
      expect(report.byCategory["clean-speech"]).toBeDefined();
      expect(report.byCategory["clean-speech"].passed).toBe(2);
      expect(report.byCategory["clean-speech"].failed).toBe(0);
      expect(report.byCategory["noisy-speech"]).toBeDefined();
      expect(report.byCategory["noisy-speech"].passed).toBe(0);
      expect(report.byCategory["noisy-speech"].failed).toBe(1);
    });

    test("should calculate average WER per category", () => {
      const results: TestCaseResult[] = [
        {
          testCaseId: "1",
          category: "category-a",
          expectedTranscript: "hello",
          actualTranscript: "hello",
          wer: {
            wer: 0,
            substitutions: 0,
            deletions: 0,
            insertions: 0,
            totalWords: 1,
            correctWords: 1,
            accuracy: 1,
          },
          passed: true,
          threshold: 0.15,
        },
        {
          testCaseId: "2",
          category: "category-a",
          expectedTranscript: "world",
          actualTranscript: "word",
          wer: {
            wer: 0.5,
            substitutions: 0,
            deletions: 1,
            insertions: 0,
            totalWords: 2,
            correctWords: 1,
            accuracy: 0.5,
          },
          passed: false,
          threshold: 0.15,
        },
      ];

      const report = generateEvaluationReport(results);
      expect(report.byCategory["category-a"].averageWER).toBe(0.25);
    });

    test("should handle empty results array", () => {
      const report = generateEvaluationReport([]);
      expect(report.total).toBe(0);
      expect(report.passed).toBe(0);
      expect(report.failed).toBe(0);
      expect(report.averageWER).toBeNaN();
      expect(report.averageAccuracy).toBeNaN();
    });
  });
});
