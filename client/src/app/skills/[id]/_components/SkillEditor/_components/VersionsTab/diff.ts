/**
 * Computes differences between two text bodies using an LCS (Longest Common Subsequence) algorithm.
 * Each line is treated as a unit of comparison.
 * Falls back to simple "all delete then add" for very large inputs (>2000 lines).
 */

export type DiffKind = "same" | "add" | "del";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/**
 * Diffuses two text bodies and returns an array of DiffLine objects representing the changes.
 * Each line in the text is compared; additions and deletions are marked accordingly.
 *
 * @param oldText The original text body (version being restored from)
 * @param newText The current text body
 * @returns Array of diff lines with kind and text
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Fallback for very large inputs: just mark all as delete then add
  if (oldLines.length > 2000 || newLines.length > 2000) {
    const result: DiffLine[] = [];
    oldLines.forEach((line) => result.push({ kind: "del", text: line }));
    newLines.forEach((line) => result.push({ kind: "add", text: line }));
    return result;
  }

  // Compute LCS using dynamic programming
  const lcs = computeLCS(oldLines, newLines);

  // Build diff from LCS
  return buildDiff(oldLines, newLines, lcs);
}

/**
 * Computes the Longest Common Subsequence using dynamic programming.
 * Returns a 2D table where dp[i][j] represents the length of LCS
 * for oldLines[0..i-1] and newLines[0..j-1].
 */
function computeLCS(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;

  // Initialize DP table with explicit type casting
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    const row: number[] = [];
    for (let j = 0; j <= n; j++) {
      row.push(0);
    }
    dp.push(row);
  }

  // Fill the DP table
  for (let i = 1; i <= m; i++) {
    const prevRow = dp[i - 1];
    const currRow = dp[i];
    const oldLine = oldLines[i - 1];

    if (!prevRow || !currRow || oldLine === undefined) {
      continue;
    }

    for (let j = 1; j <= n; j++) {
      const newLine = newLines[j - 1];
      if (newLine === undefined) {
        continue;
      }

      if (oldLine === newLine) {
        currRow[j] = (prevRow[j - 1] ?? 0) + 1;
      } else {
        currRow[j] = Math.max(prevRow[j] ?? 0, currRow[j - 1] ?? 0);
      }
    }
  }

  return dp;
}

/**
 * Safely gets a value from the LCS table with bounds checking.
 */
function getLcsValue(lcs: number[][], i: number, j: number): number {
  if (i < 0 || j < 0 || !lcs[i]) {
    return 0;
  }
  return lcs[i][j] ?? 0;
}

/**
 * Builds the diff by backtracking through the LCS table.
 * Marks lines as "same", "add", or "del" based on their presence in the LCS.
 */
function buildDiff(
  oldLines: string[],
  newLines: string[],
  lcs: number[][]
): DiffLine[] {
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  // Backtrack through the DP table
  while (i > 0 || j > 0) {
    const oldLine = i > 0 ? oldLines[i - 1] : undefined;
    const newLine = j > 0 ? newLines[j - 1] : undefined;

    if (i > 0 && j > 0 && oldLine === newLine && oldLine !== undefined) {
      // Line is in both: same
      result.unshift({ kind: "same", text: oldLine });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || getLcsValue(lcs, i, j - 1) >= getLcsValue(lcs, i - 1, j))) {
      // Line is in new but not old: add
      result.unshift({ kind: "add", text: newLine ?? "" });
      j--;
    } else if (i > 0) {
      // Line is in old but not new: del
      result.unshift({ kind: "del", text: oldLine ?? "" });
      i--;
    }
  }

  return result;
}
