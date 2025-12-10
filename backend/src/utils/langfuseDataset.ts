import { getLangfuse, safeLangfuseOperation } from "./langfuse.js";
import { calculateWER, type WERResult } from "./wer.js";
// Langfuse dataset types - using any for now as types may vary by version

export interface GoldenTestCase {
  id: string;
  category: string;
  description: string;
  expectedTranscript: string;
  audioFile: string;
  metadata?: Record<string, unknown>;
}

export interface TestCaseResult {
  testCaseId: string;
  category: string;
  expectedTranscript: string;
  actualTranscript: string;
  wer: WERResult;
  passed: boolean;
  threshold: number;
}

export async function uploadTestCasesToDataset(
  datasetName: string,
  testCases: GoldenTestCase[]
): Promise<void> {
  const langfuse = getLangfuse();
  if (!langfuse) {
    throw new Error("Langfuse is not enabled");
  }

  await safeLangfuseOperation(async (lf) => {
    // Create or get dataset
    try {
      await (lf as any).getDataset({ datasetName });
    } catch (error) {
      // Dataset doesn't exist, create it
      await (lf as any).createDataset({
        datasetName,
        description: "Golden test cases for audio transcription evaluation",
      });
    }

    // Upload test cases as dataset items
    for (const testCase of testCases) {
      try {
        await lf.createDatasetItem({
          datasetName,
          input: {
            audioFile: testCase.audioFile,
            metadata: testCase.metadata || {},
          },
          expectedOutput: testCase.expectedTranscript,
          metadata: {
            testCaseId: testCase.id,
            category: testCase.category,
            description: testCase.description,
          },
        });
      } catch (error) {
        console.error(`Failed to upload test case ${testCase.id}:`, error);
      }
    }

    console.log(`Uploaded ${testCases.length} test cases to dataset: ${datasetName}`);
  });
}

export function evaluateTranscription(
  expectedTranscript: string,
  actualTranscript: string,
  threshold: number = 0.15
): TestCaseResult {
  const wer = calculateWER(expectedTranscript, actualTranscript);
  const passed = wer.wer <= threshold;

  return {
    testCaseId: "",
    category: "",
    expectedTranscript,
    actualTranscript,
    wer,
    passed,
    threshold,
  };
}

export async function runEvaluation(
  traceId: string,
  testCase: GoldenTestCase,
  actualTranscript: string,
  threshold: number
): Promise<TestCaseResult> {
  const langfuse = getLangfuse();
  const result = evaluateTranscription(
    testCase.expectedTranscript,
    actualTranscript,
    threshold
  );

  result.testCaseId = testCase.id;
  result.category = testCase.category;

  // Log evaluation score to Langfuse
  if (langfuse) {
    await safeLangfuseOperation(async (lf) => {
      const trace = lf.trace({ id: traceId });

      // Score WER
      trace.score({
        name: "wer",
        value: result.wer.wer,
        comment: `WER for test case ${testCase.id} (${testCase.category})`,
      });

      // Score accuracy
      trace.score({
        name: "accuracy",
        value: result.wer.accuracy,
        comment: `Accuracy for test case ${testCase.id}`,
      });

      // Score pass/fail
      trace.score({
        name: "test-passed",
        value: result.passed ? 1 : 0,
        comment: result.passed
          ? "Test case passed"
          : `Test case failed: WER ${(result.wer.wer * 100).toFixed(2)}% exceeds threshold ${(threshold * 100).toFixed(2)}%`,
      });
    });
  }

  return result;
}

export async function batchEvaluate(
  testCases: Array<{
    testCase: GoldenTestCase;
    actualTranscript: string;
    traceId?: string;
  }>,
  thresholds: Record<string, number>
): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];

  for (const { testCase, actualTranscript, traceId } of testCases) {
    const threshold = thresholds[testCase.category] || 0.15;
    let result: TestCaseResult;

    if (traceId) {
      result = await runEvaluation(traceId, testCase, actualTranscript, threshold);
    } else {
      result = evaluateTranscription(
        testCase.expectedTranscript,
        actualTranscript,
        threshold
      );
      result.testCaseId = testCase.id;
      result.category = testCase.category;
    }

    results.push(result);
  }

  return results;
}

export function generateEvaluationReport(
  results: TestCaseResult[]
): {
  total: number;
  passed: number;
  failed: number;
  averageWER: number;
  averageAccuracy: number;
  byCategory: Record<string, { passed: number; failed: number; averageWER: number }>;
} {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const averageWER =
    results.reduce((sum, r) => sum + r.wer.wer, 0) / total;
  const averageAccuracy =
    results.reduce((sum, r) => sum + r.wer.accuracy, 0) / total;

  // Group by category
  const byCategory: Record<string, { passed: number; failed: number; averageWER: number }> = {};
  
  for (const result of results) {
    if (!byCategory[result.category]) {
      byCategory[result.category] = { passed: 0, failed: 0, averageWER: 0 };
    }
    if (result.passed) {
      byCategory[result.category].passed++;
    } else {
      byCategory[result.category].failed++;
    }
  }

  // Calculate average WER per category
  for (const category in byCategory) {
    const categoryResults = results.filter((r) => r.category === category);
    byCategory[category].averageWER =
      categoryResults.reduce((sum, r) => sum + r.wer.wer, 0) / categoryResults.length;
  }

  return {
    total,
    passed,
    failed,
    averageWER,
    averageAccuracy,
    byCategory,
  };
}
