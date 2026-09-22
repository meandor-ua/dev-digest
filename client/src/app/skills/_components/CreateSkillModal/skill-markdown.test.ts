import { describe, it, expect } from "vitest";
import { parseSkillMarkdown, preferredEntryIndex } from "./skill-markdown";

describe("parseSkillMarkdown", () => {
  it("takes name/description from frontmatter and strips it from the body", () => {
    const md = '---\nname: "test-quality"\ndescription: Flag happy-path-only tests.\n---\n\n# Rules\nCover the error branch.\n';
    expect(parseSkillMarkdown(md, "SKILL.md")).toEqual({
      name: "test-quality",
      description: "Flag happy-path-only tests.",
      body: "# Rules\nCover the error branch.",
    });
  });

  it("joins a folded (>) description block", () => {
    const md = "---\nname: x\ndescription: >\n  First line\n  second line\nlicense: MIT\n---\nbody";
    expect(parseSkillMarkdown(md, "SKILL.md").description).toBe("First line second line");
  });

  it("falls back to the first heading, then the file name, without frontmatter", () => {
    expect(parseSkillMarkdown("# Rule A\nbody", "a.md")).toMatchObject({
      name: "Rule A",
      description: "",
      body: "# Rule A\nbody",
    });
    expect(parseSkillMarkdown("no heading", "dir/rule.md").name).toBe("rule");
  });

  it("keeps a body that merely contains a --- rule", () => {
    const md = "# Title\n\n---\n\ntext";
    expect(parseSkillMarkdown(md, "a.md").body).toBe(md);
  });
});

describe("preferredEntryIndex", () => {
  it("prefers SKILL.md anywhere in the archive, else the first entry", () => {
    expect(preferredEntryIndex([{ filename: "README.md" }, { filename: "x/skill.md" }])).toBe(1);
    expect(preferredEntryIndex([{ filename: "a.md" }, { filename: "b.md" }])).toBe(0);
  });
});
