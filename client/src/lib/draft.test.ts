/* The shared draft helpers behind both entity editors (skills, agents):
   rebase keeps a kept-mounted form in step with the server without losing the
   user's edits, and patch sends only what actually changed. */
import { describe, it, expect } from "vitest";
import { sameDraft, rebaseDraft, draftPatch } from "./draft";

interface D {
  name: string;
  enabled: boolean;
  body: string;
}
const FIELDS = ["name", "enabled", "body"] as const;
const base: D = { name: "A", enabled: true, body: "x" };

describe("draft helpers", () => {
  it("sameDraft compares only the listed fields", () => {
    expect(sameDraft(FIELDS, base, { ...base })).toBe(true);
    expect(sameDraft(FIELDS, base, { ...base, body: "y" })).toBe(false);
    // A field outside FIELDS is not part of the comparison.
    expect(sameDraft(["name"] as const, base, { ...base, body: "y" })).toBe(true);
  });

  it("rebase takes the server's value for untouched fields and keeps the user's edits", () => {
    const draft = { ...base, name: "user edit" };
    const server = { ...base, enabled: false, body: "server edit" };
    expect(rebaseDraft(FIELDS, draft, base, server)).toEqual({
      name: "user edit", // touched → kept
      enabled: false, // untouched → server wins
      body: "server edit",
    });
  });

  it("a field the user changed to the server's new value stays that value", () => {
    const draft = { ...base, enabled: false };
    const server = { ...base, enabled: false };
    expect(rebaseDraft(FIELDS, draft, base, server).enabled).toBe(false);
  });

  it("patch contains only the fields that differ from the server", () => {
    expect(draftPatch(FIELDS, { ...base, name: "B" }, base)).toEqual({ name: "B" });
    expect(draftPatch(FIELDS, base, base)).toEqual({});
    // False and empty string are real values, not "absent".
    expect(draftPatch(FIELDS, { ...base, enabled: false, body: "" }, base)).toEqual({
      enabled: false,
      body: "",
    });
  });
});
