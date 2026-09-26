import { describe, it, expect } from "vitest";
import { tint } from "./color";

describe("tint", () => {
  it("mixes a CSS variable with transparent (defaults to 10%)", () => {
    expect(tint("var(--accent)")).toBe("color-mix(in srgb, var(--accent) 10%, transparent)");
  });

  it("accepts a custom percentage", () => {
    expect(tint("var(--crit)", 15)).toBe("color-mix(in srgb, var(--crit) 15%, transparent)");
  });
});
