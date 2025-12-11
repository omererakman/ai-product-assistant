import { describe, test, expect } from "vitest";
import {
  calculateWER,
  formatWER,
  formatAccuracy,
  isWERAcceptable,
  type WERResult,
} from "../../src/utils/wer.js";

describe("WER Utilities", () => {
  describe("calculateWER", () => {
    test("should return perfect match (WER = 0) for identical strings", () => {
      const result = calculateWER("hello world", "hello world");
      expect(result.wer).toBe(0);
      expect(result.accuracy).toBe(1);
      expect(result.correctWords).toBe(2);
      expect(result.substitutions).toBe(0);
      expect(result.deletions).toBe(0);
      expect(result.insertions).toBe(0);
    });

    test("should handle single word substitution", () => {
      const result = calculateWER("hello world", "hello there");
      expect(result.wer).toBe(0.5);
      expect(result.substitutions).toBe(1);
      expect(result.deletions).toBe(0);
      expect(result.insertions).toBe(0);
      expect(result.correctWords).toBe(1);
    });

    test("should handle word deletion", () => {
      const result = calculateWER("hello world test", "hello world");
      expect(result.wer).toBeCloseTo(0.333, 2);
      expect(result.deletions).toBe(1);
      expect(result.substitutions).toBe(0);
      expect(result.insertions).toBe(0);
    });

    test("should handle word insertion", () => {
      const result = calculateWER("hello world", "hello world test");
      expect(result.wer).toBe(0.5);
      expect(result.insertions).toBe(1);
      expect(result.deletions).toBe(0);
      expect(result.substitutions).toBe(0);
    });

    test("should handle multiple errors", () => {
      const result = calculateWER("the quick brown fox", "the slow red cat");
      expect(result.wer).toBeGreaterThan(0);
      expect(result.substitutions).toBeGreaterThan(0);
      expect(result.totalWords).toBe(4);
    });

    test("should handle empty reference", () => {
      const result = calculateWER("", "hello world");
      expect(result.wer).toBe(1);
      expect(result.insertions).toBe(2);
      expect(result.totalWords).toBe(0);
      expect(result.accuracy).toBe(0);
    });

    test("should handle empty hypothesis", () => {
      const result = calculateWER("hello world", "");
      expect(result.wer).toBe(1);
      expect(result.deletions).toBe(2);
      expect(result.insertions).toBe(0);
      expect(result.accuracy).toBe(0);
    });

    test("should handle both empty strings", () => {
      const result = calculateWER("", "");
      expect(result.wer).toBe(0);
      expect(result.accuracy).toBe(1);
      expect(result.totalWords).toBe(0);
    });

    test("should normalize punctuation and case", () => {
      const result1 = calculateWER("Hello, World!", "hello world");
      const result2 = calculateWER("Hello World", "hello world");
      expect(result1.wer).toBe(result2.wer);
      expect(result1.wer).toBe(0);
    });

    test("should handle extra whitespace", () => {
      const result = calculateWER("hello   world", "hello world");
      expect(result.wer).toBe(0);
    });

    test("should handle complex transcription errors", () => {
      const reference = "I want to buy an iPhone fifteen pro";
      const hypothesis = "I want to buy an iPhone 15 pro";
      const result = calculateWER(reference, hypothesis);
      expect(result.wer).toBeGreaterThan(0);
      expect(result.wer).toBeLessThan(1);
    });
  });

  describe("formatWER", () => {
    test("should format WER as percentage", () => {
      const result: WERResult = {
        wer: 0.15,
        substitutions: 1,
        deletions: 0,
        insertions: 0,
        totalWords: 10,
        correctWords: 9,
        accuracy: 0.85,
      };
      expect(formatWER(result)).toBe("15.00%");
    });

    test("should format zero WER correctly", () => {
      const result: WERResult = {
        wer: 0,
        substitutions: 0,
        deletions: 0,
        insertions: 0,
        totalWords: 5,
        correctWords: 5,
        accuracy: 1,
      };
      expect(formatWER(result)).toBe("0.00%");
    });

    test("should format high WER correctly", () => {
      const result: WERResult = {
        wer: 0.75,
        substitutions: 3,
        deletions: 0,
        insertions: 0,
        totalWords: 4,
        correctWords: 1,
        accuracy: 0.25,
      };
      expect(formatWER(result)).toBe("75.00%");
    });
  });

  describe("formatAccuracy", () => {
    test("should format accuracy as percentage", () => {
      const result: WERResult = {
        wer: 0.15,
        substitutions: 1,
        deletions: 0,
        insertions: 0,
        totalWords: 10,
        correctWords: 9,
        accuracy: 0.85,
      };
      expect(formatAccuracy(result)).toBe("85.00%");
    });

    test("should format perfect accuracy correctly", () => {
      const result: WERResult = {
        wer: 0,
        substitutions: 0,
        deletions: 0,
        insertions: 0,
        totalWords: 5,
        correctWords: 5,
        accuracy: 1,
      };
      expect(formatAccuracy(result)).toBe("100.00%");
    });
  });

  describe("isWERAcceptable", () => {
    test("should return true for WER below threshold", () => {
      const result: WERResult = {
        wer: 0.1,
        substitutions: 1,
        deletions: 0,
        insertions: 0,
        totalWords: 10,
        correctWords: 9,
        accuracy: 0.9,
      };
      expect(isWERAcceptable(result, 0.15)).toBe(true);
    });

    test("should return false for WER above threshold", () => {
      const result: WERResult = {
        wer: 0.2,
        substitutions: 2,
        deletions: 0,
        insertions: 0,
        totalWords: 10,
        correctWords: 8,
        accuracy: 0.8,
      };
      expect(isWERAcceptable(result, 0.15)).toBe(false);
    });

    test("should return true for WER equal to threshold", () => {
      const result: WERResult = {
        wer: 0.15,
        substitutions: 1,
        deletions: 0,
        insertions: 0,
        totalWords: 10,
        correctWords: 9,
        accuracy: 0.85,
      };
      expect(isWERAcceptable(result, 0.15)).toBe(true);
    });

    test("should use default threshold of 0.15", () => {
      const result: WERResult = {
        wer: 0.1,
        substitutions: 1,
        deletions: 0,
        insertions: 0,
        totalWords: 10,
        correctWords: 9,
        accuracy: 0.9,
      };
      expect(isWERAcceptable(result)).toBe(true);
    });
  });
});
