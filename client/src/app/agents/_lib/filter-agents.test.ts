import { describe, it, expect } from "vitest";
import type { Agent } from "@devdigest/shared";
import { filterAgents } from "./filter-agents";

const agent = (name: string, description: string) => ({ id: name, name, description }) as Agent;
const AGENTS = [agent("Security Reviewer", "Flags secrets"), agent("Test Quality", "Coverage gaps")];

describe("filterAgents", () => {
  it("returns every agent for a blank query", () => {
    expect(filterAgents(AGENTS, "   ")).toBe(AGENTS);
  });

  it("matches name or description case-insensitively", () => {
    expect(filterAgents(AGENTS, "SECURITY").map((a) => a.name)).toEqual(["Security Reviewer"]);
    expect(filterAgents(AGENTS, "coverage").map((a) => a.name)).toEqual(["Test Quality"]);
  });
});
