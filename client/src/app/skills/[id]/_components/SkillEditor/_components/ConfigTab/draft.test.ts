import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { rebaseDraft, draftPatch, useSkillDraft, type SkillDraft } from "./draft";

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

describe("useSkillDraft", () => {
  const skill: Skill = { id: "sk1", source: "manual", version: 3, evidence_files: null, ...base };
  const edit = (hook: { current: ReturnType<typeof useSkillDraft> }, body: string) =>
    act(() => hook.current.setDraft((d) => ({ ...d, body })));

  it("tracks dirtiness and reset() drops the unsaved edits", () => {
    const { result } = renderHook(() => useSkillDraft(skill));
    expect(result.current.dirty).toBe(false);
    edit(result, "draft");
    expect(result.current.dirty).toBe(true);
    act(() => result.current.reset());
    expect(result.current.draft.body).toBe("v3 body");
    expect(result.current.dirty).toBe(false);
  });

  it("discards the draft when a different skill is opened", () => {
    const { result, rerender } = renderHook(({ s }) => useSkillDraft(s), { initialProps: { s: skill } });
    edit(result, "draft for sk1");
    rerender({ s: { ...skill, id: "sk2", body: "sk2 body" } });
    expect(result.current.draft.body).toBe("sk2 body");
    expect(result.current.dirty).toBe(false);
  });

  it("keeps an unsaved body when the same skill changes elsewhere on the server", () => {
    const { result, rerender } = renderHook(({ s }) => useSkillDraft(s), { initialProps: { s: skill } });
    edit(result, "mine");
    rerender({ s: { ...skill, enabled: false } });
    expect(result.current.draft).toMatchObject({ body: "mine", enabled: false });
    expect(result.current.server.enabled).toBe(false);
  });
});
