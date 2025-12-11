export interface WERResult {
  wer: number; // Word Error Rate (0-1, where 0 is perfect)
  substitutions: number;
  deletions: number;
  insertions: number;
  totalWords: number;
  correctWords: number;
  accuracy: number;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized.split(" ").filter((word) => word.length > 0);
}

export function calculateWER(reference: string, hypothesis: string): WERResult {
  const refWords = tokenize(reference);
  const hypWords = tokenize(hypothesis);

  const n = refWords.length;
  const m = hypWords.length;

  if (n === 0) {
    // If reference is empty, all hypothesis words are insertions
    return {
      wer: m > 0 ? 1 : 0,
      substitutions: 0,
      deletions: 0,
      insertions: m,
      totalWords: n,
      correctWords: 0,
      accuracy: m > 0 ? 0 : 1,
    };
  }

  if (m === 0) {
    // If hypothesis is empty, all reference words are deletions
    return {
      wer: 1,
      substitutions: 0,
      deletions: n,
      insertions: 0,
      totalWords: n,
      correctWords: 0,
      accuracy: 0,
    };
  }

  // Dynamic programming table
  // dp[i][j] = minimum operations to transform refWords[0..i-1] to hypWords[0..j-1]
  const dp: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(0));

  // Track operations for detailed breakdown
  const operations: Array<Array<"match" | "sub" | "del" | "ins">> = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill("match"));

  // Initialize base cases
  for (let i = 0; i <= n; i++) {
    dp[i][0] = i; // Deletions
    if (i > 0) operations[i][0] = "del";
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j; // Insertions
    if (j > 0) operations[0][j] = "ins";
  }

  // Fill the DP table
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        // Match
        dp[i][j] = dp[i - 1][j - 1];
        operations[i][j] = "match";
      } else {
        // Find minimum of substitution, deletion, insertion
        const sub = dp[i - 1][j - 1] + 1; // Substitution
        const del = dp[i - 1][j] + 1; // Deletion
        const ins = dp[i][j - 1] + 1; // Insertion

        if (sub <= del && sub <= ins) {
          dp[i][j] = sub;
          operations[i][j] = "sub";
        } else if (del <= ins) {
          dp[i][j] = del;
          operations[i][j] = "del";
        } else {
          dp[i][j] = ins;
          operations[i][j] = "ins";
        }
      }
    }
  }

  // Backtrack to count operations
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let correctWords = 0;

  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    const op = operations[i][j];

    if (op === "match") {
      correctWords++;
      i--;
      j--;
    } else if (op === "sub") {
      substitutions++;
      i--;
      j--;
    } else if (op === "del") {
      deletions++;
      i--;
    } else {
      // ins
      insertions++;
      j--;
    }
  }

  const totalErrors = substitutions + deletions + insertions;
  const wer = n > 0 ? totalErrors / n : 0;
  const accuracy = 1 - wer;

  return {
    wer,
    substitutions,
    deletions,
    insertions,
    totalWords: n,
    correctWords,
    accuracy: Math.max(0, accuracy), // Ensure non-negative
  };
}

/**
 * Format WER result as percentage string
 */
export function formatWER(result: WERResult): string {
  return `${(result.wer * 100).toFixed(2)}%`;
}

/**
 * Format accuracy as percentage string
 */
export function formatAccuracy(result: WERResult): string {
  return `${(result.accuracy * 100).toFixed(2)}%`;
}

/**
 * Check if WER meets threshold
 */
export function isWERAcceptable(
  result: WERResult,
  threshold: number = 0.15,
): boolean {
  return result.wer <= threshold;
}
