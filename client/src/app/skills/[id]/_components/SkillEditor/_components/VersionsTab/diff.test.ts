import { describe, it, expect } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("returns all 'same' for identical text", () => {
    const text = "line1\nline2\nline3";
    const result = diffLines(text, text);

    expect(result).toHaveLength(3);
    expect(result.every((d) => d.kind === "same")).toBe(true);
    expect(result.map((d) => d.text)).toEqual(["line1", "line2", "line3"]);
  });

  it("handles pure addition", () => {
    const old = "line1\nline2";
    const newText = "line1\nline2\nline3\nline4";
    const result = diffLines(old, newText);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ kind: "same", text: "line1" });
    expect(result[1]).toEqual({ kind: "same", text: "line2" });
    expect(result[2]).toEqual({ kind: "add", text: "line3" });
    expect(result[3]).toEqual({ kind: "add", text: "line4" });
  });

  it("handles pure deletion", () => {
    const old = "line1\nline2\nline3\nline4";
    const newText = "line1\nline2";
    const result = diffLines(old, newText);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ kind: "same", text: "line1" });
    expect(result[1]).toEqual({ kind: "same", text: "line2" });
    expect(result[2]).toEqual({ kind: "del", text: "line3" });
    expect(result[3]).toEqual({ kind: "del", text: "line4" });
  });

  it("handles modification in the middle", () => {
    const old = "line1\nline2\nline3";
    const newText = "line1\nmodified2\nline3";
    const result = diffLines(old, newText);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ kind: "same", text: "line1" });
    expect(result[1]).toEqual({ kind: "del", text: "line2" });
    expect(result[2]).toEqual({ kind: "add", text: "modified2" });
    expect(result[3]).toEqual({ kind: "same", text: "line3" });
  });

  it("handles empty inputs", () => {
    const result1 = diffLines("", "");
    expect(result1).toHaveLength(1);
    expect(result1[0]).toEqual({ kind: "same", text: "" });

    const result2 = diffLines("line1", "");
    expect(result2).toHaveLength(2);
    expect(result2[0]).toEqual({ kind: "del", text: "line1" });
    expect(result2[1]).toEqual({ kind: "add", text: "" });

    const result3 = diffLines("", "line1");
    expect(result3).toHaveLength(2);
    expect(result3[0]).toEqual({ kind: "del", text: "" });
    expect(result3[1]).toEqual({ kind: "add", text: "line1" });
  });

  it("preserves line ordering", () => {
    const old = "a\nb\nc";
    const newText = "a\nx\nb\ny\nc";
    const result = diffLines(old, newText);

    const kinds = result.map((d) => d.kind);
    const expected = ["same", "add", "same", "add", "same"];
    expect(kinds).toEqual(expected);

    expect(result.map((d) => d.text)).toEqual(["a", "x", "b", "y", "c"]);
  });
});
