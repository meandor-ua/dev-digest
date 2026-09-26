import { describe, it, expect } from "vitest";
import { toPercentages, categoryDonutSegments } from "./category-chart";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("toPercentages", () => {
  it("converts counts to shares of 100", () => {
    expect(toPercentages([3, 1])).toEqual([75, 25]);
  });

  it("always totals exactly 100 where naive rounding would not", () => {
    const thirds = toPercentages([1, 1, 1]);
    expect(sum(thirds)).toBe(100);
    expect(thirds.sort()).toEqual([33, 33, 34]);
    expect(sum(toPercentages([2, 2, 2, 1, 1, 1, 1]))).toBe(100);
  });

  it("gives the leftover point to the largest remainder", () => {
    // 2/3 = 66.67 → 67, 1/3 = 33.33 → 33
    expect(toPercentages([2, 1])).toEqual([67, 33]);
  });

  it("returns zeros for empty or all-zero input", () => {
    expect(toPercentages([])).toEqual([]);
    expect(toPercentages([0, 0])).toEqual([0, 0]);
  });
});

describe("categoryDonutSegments", () => {
  it("maps counts to percent segments with cycling palette colours", () => {
    const segs = categoryDonutSegments([
      { label: "security", value: 3 },
      { label: "bug", value: 1 },
    ]);
    expect(segs.map((s) => [s.label, s.value])).toEqual([["security", 75], ["bug", 25]]);
    expect(segs[0]!.color).toBe("var(--accent)");
  });
});
