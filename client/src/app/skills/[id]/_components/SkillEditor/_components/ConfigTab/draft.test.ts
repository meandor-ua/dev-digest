import { describe, it, expect } from "vitest";
import { rebaseDraft, draftPatch, type SkillDraft } from "./draft";

const base: SkillDraft = { name: "N", description: "D", type: "rubric", body: "v3 body", enabled: true };

describe("rebaseDraft", () => {
  it("takes the server's value for untouched fields (e.g. a restore changed the body)", () => {
    const server = { ...base, body: "v1 body" };
    expect(rebaseDraft(base, base, server)).toEqual(server);
  });

  it("keeps the user's unsaved edits while picking up other server changes", () => {
    const draft = { ...base, description: "edited" };
    const server = { ...base, enabled: false };
    expect(rebaseDraft(draft, base, server)).toEqual({ ...base, description: "edited", enabled: false });
  });

  it("keeps the user's edit when the server changed the same field", () => {
    const draft = { ...base, body: "mine" };
    expect(rebaseDraft(draft, base, { ...base, body: "theirs" }).body).toBe("mine");
  });
});

describe("draftPatch", () => {
  it("contains only the fields that differ from the server", () => {
    expect(draftPatch({ ...base, body: "new" }, base)).toEqual({ body: "new" });
    expect(draftPatch(base, base)).toEqual({});
  });
});
