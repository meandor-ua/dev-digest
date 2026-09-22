import { describe, it, expect } from "vitest";
import { markdownLineKinds } from "./highlight";

describe("markdownLineKinds", () => {
  it("classifies heading levels, deeper than ### as h3", () => {
    expect(markdownLineKinds("# A\n## B\n### C\n#### D\ntext")).toEqual(["h1", "h2", "h3", "h3", "text"]);
  });

  it("needs a space after the hashes (a #tag is not a heading)", () => {
    expect(markdownLineKinds("#tag\n  # indented")).toEqual(["text", "text"]);
  });

  it("ignores # lines inside a code fence", () => {
    expect(markdownLineKinds("```sh\n# comment\n```\n# Real")).toEqual(["text", "text", "text", "h1"]);
  });
});
