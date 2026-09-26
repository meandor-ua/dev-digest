import { describe, it, expect } from "vitest";
import { FEATURE_MODELS as SHARED } from "@/vendor/shared/contracts/platform";
import { FEATURE_MODELS } from "./feature-models";

// The client keeps a hand-mirrored copy of the shared registry (a runtime import
// of vendor/shared breaks the Next bundle). Tests can import it, so pin the two
// together: a changed label or default must be changed in both places.
describe("client FEATURE_MODELS mirror", () => {
  it("matches the vendored shared registry exactly", () => {
    expect(FEATURE_MODELS).toEqual(SHARED);
  });

  it("gives conventions no hardcoded model — it is resolved at runtime", () => {
    const conventions = FEATURE_MODELS.find((f) => f.id === "conventions")!;
    expect(conventions.defaultModel).toBeUndefined();
    expect(conventions.defaultProvider).toBeUndefined();
  });
});
