import { describe, it, expect } from "vitest";
import { formatTokens, estimateTokens } from "./tokens";

describe("formatTokens", () => {
  it("rounds input to whole k and output to one decimal", () => {
    expect(formatTokens(8000, 1300)).toBe("8k→1.3k");
    expect(formatTokens(12400, 1550)).toBe("12k→1.6k");
  });
  it("handles zero", () => {
    expect(formatTokens(0, 0)).toBe("0k→0.0k");
  });
});

describe("estimateTokens", () => {
  it("rounds characters / 4 up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});
