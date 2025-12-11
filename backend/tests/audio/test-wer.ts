/**
 * WER Testing Script
 * Runs golden test cases through transcription pipeline and calculates WER
 */

import { readFileSync, createReadStream } from "fs";
import { join } from "path";
import axios from "axios";
import FormData from "form-data";
import { formatWER, formatAccuracy } from "../../src/utils/wer.js";
import {
  uploadTestCasesToDataset,
  batchEvaluate,
  generateEvaluationReport,
  type GoldenTestCase,
} from "../../src/utils/langfuseDataset.js";

// Load golden test cases
const testCasesPath = join(process.cwd(), "tests/audio/golden-test-cases.json");
const testCasesData = JSON.parse(readFileSync(testCasesPath, "utf-8"));
const testCases: GoldenTestCase[] = testCasesData.testCases;
const categories = testCasesData.categories;

/**
 * Transcribe audio using the production API endpoint
 */
async function transcribeAudio(audioFile: string): Promise<string> {
  const filePath = join(process.cwd(), "tests/audio", audioFile);
  const baseUrl = process.env.TEST_API_URL || "http://localhost:3001";

  console.log(`Transcribing: ${audioFile}`);

  // Create form data with the audio file
  const form = new FormData();
  form.append("audio", createReadStream(filePath));

  try {
    // Call the actual transcription API using axios
    const response = await axios.post(`${baseUrl}/api/transcribe`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log(`✓ Transcribed: "${response.data.transcript}"`);
    return response.data.transcript;
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error(`✗ Error transcribing ${audioFile}:`, errorMessage);
    throw new Error(`Transcription failed: ${errorMessage}`);
  }
}

/**
 * Run WER evaluation on all test cases
 */
async function runWEREvaluation() {
  console.log("Starting WER Evaluation...");
  console.log(`Total test cases: ${testCases.length}\n`);

  // Upload test cases to Langfuse dataset (if enabled)
  if (
    process.env.LANGFUSE_ENABLED === "true" &&
    process.env.LANGFUSE_EVALUATION_ENABLED === "true"
  ) {
    try {
      console.log("Uploading test cases to Langfuse dataset...");
      await uploadTestCasesToDataset(
        "audio-transcription-golden-tests",
        testCases,
      );
      console.log("✓ Test cases uploaded to Langfuse\n");
    } catch (error) {
      console.error("Failed to upload to Langfuse:", error);
      console.log("Continuing with local evaluation...\n");
    }
  }

  // Prepare thresholds
  const thresholds: Record<string, number> = {};
  for (const [category, config] of Object.entries(categories)) {
    thresholds[category] = (config as any).werThreshold || 0.15;
  }

  // Run evaluations
  const evaluationInputs: Array<{
    testCase: GoldenTestCase;
    actualTranscript: string;
  }> = [];

  for (const testCase of testCases) {
    try {
      // Transcribe audio (replace with actual implementation)
      const actualTranscript = await transcribeAudio(testCase.audioFile);
      evaluationInputs.push({ testCase, actualTranscript });
    } catch (error) {
      console.error(`Failed to transcribe ${testCase.id}:`, error);
    }
  }

  // Evaluate all test cases
  const results = await batchEvaluate(evaluationInputs, thresholds);

  // Generate and display report
  const report = generateEvaluationReport(results);

  console.log("=".repeat(60));
  console.log("WER EVALUATION REPORT");
  console.log("=".repeat(60));
  console.log(`Total Test Cases: ${report.total}`);
  console.log(
    `Passed: ${report.passed} (${((report.passed / report.total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Failed: ${report.failed} (${((report.failed / report.total) * 100).toFixed(1)}%)`,
  );
  console.log(`Average WER: ${formatWER({ wer: report.averageWER } as any)}`);
  console.log(
    `Average Accuracy: ${formatAccuracy({ accuracy: report.averageAccuracy } as any)}`,
  );
  console.log("\nResults by Category:");
  console.log("-".repeat(60));

  for (const [category, stats] of Object.entries(report.byCategory)) {
    const categoryStats = stats as {
      passed: number;
      failed: number;
      averageWER: number;
    };
    console.log(`\n${category}:`);
    console.log(`  Passed: ${categoryStats.passed}`);
    console.log(`  Failed: ${categoryStats.failed}`);
    console.log(
      `  Average WER: ${formatWER({ wer: categoryStats.averageWER } as any)}`,
    );
    console.log(
      `  Threshold: ${formatWER({ wer: thresholds[category] } as any)}`,
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("Detailed Results:");
  console.log("-".repeat(60));

  for (const result of results) {
    const status = result.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`\n${status} - ${result.testCaseId} (${result.category})`);
    console.log(`  Expected: ${result.expectedTranscript}`);
    console.log(`  Actual:   ${result.actualTranscript}`);
    console.log(`  WER:      ${formatWER(result.wer)}`);
    console.log(`  Accuracy: ${formatAccuracy(result.wer)}`);
    console.log(`  Threshold: ${formatWER({ wer: result.threshold } as any)}`);
  }

  // Exit with error code if any tests failed
  if (report.failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runWEREvaluation().catch((error) => {
    console.error("Evaluation failed:", error);
    process.exit(1);
  });
}

export { runWEREvaluation };
