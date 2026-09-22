import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkillItem, SkillWithStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
let skills: AgentSkillItem[] | undefined;
let availableSkills: SkillWithStats[] = [];

// jsdom can't drive dnd-kit's pointer sensor, so capture the DndContext's
// onDragEnd and call it directly with a synthetic drop event.
let onDragEnd: ((e: { active: { id: string }; over: { id: string } | null }) => void) | undefined;
let sensors: Array<{ sensor: unknown }> | undefined;
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: { onDragEnd?: typeof onDragEnd; sensors?: typeof sensors; children?: React.ReactNode }) => {
      onDragEnd = props.onDragEnd;
      sensors = props.sensors;
      return <>{props.children}</>;
    },
  };
});

vi.mock("@/lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: skills, isLoading: false }),
  useSetAgentSkills: () => ({ mutate }),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: availableSkills, isLoading: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  onDragEnd = undefined;
});

function mk(id: string, name: string, order: number, enabled: boolean): AgentSkillItem {
  return { agent_id: "ag1", skill_id: id, order, enabled, name, type: "rubric" };
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <SkillsTab agentId="ag1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("shows an empty state when the agent has no linked skills", () => {
    skills = [];
    renderTab();
    expect(screen.getByText("No skills linked to this agent yet.")).toBeInTheDocument();
  });

  it("renders linked skills with an enabled count", () => {
    skills = [mk("s1", "Secrets", 0, true), mk("s2", "Naming", 1, false)];
    renderTab();
    expect(screen.getByText("Secrets")).toBeInTheDocument();
    expect(screen.getByText("Naming")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
  });

  it("persists the full set when a skill is toggled", () => {
    skills = [mk("s1", "Secrets", 0, true), mk("s2", "Naming", 1, false)];
    renderTab();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!); // enable "Naming"
    expect(mutate).toHaveBeenCalledWith(
      [
        { skill_id: "s1", enabled: true },
        { skill_id: "s2", enabled: true },
      ],
      expect.anything(),
    );
  });

  it("swaps the reorder hint for a filter hint while filtering", () => {
    skills = [mk("s1", "Secrets", 0, true), mk("s2", "Naming", 1, true)];
    renderTab();
    const filter = screen.getByPlaceholderText("Filter skills…");
    fireEvent.change(filter, { target: { value: "sec" } });
    expect(screen.getByText("Clear the filter to reorder skills.")).toBeInTheDocument();
    expect(screen.getByText("Secrets")).toBeInTheDocument();
    expect(screen.queryByText("Naming")).not.toBeInTheDocument();
  });
  it("persists the new order (keeping enabled flags) when a skill is dropped", () => {
    skills = [mk("s1", "A", 0, true), mk("s2", "B", 1, false), mk("s3", "C", 2, true)];
    renderTab();
    onDragEnd!({ active: { id: "s3" }, over: { id: "s1" } }); // drag C above A
    expect(mutate).toHaveBeenCalledWith(
      [
        { skill_id: "s3", enabled: true },
        { skill_id: "s1", enabled: true },
        { skill_id: "s2", enabled: false },
      ],
      expect.anything(),
    );
  });

  it("does not save when dropped onto itself or outside the list", () => {
    skills = [mk("s1", "A", 0, true), mk("s2", "B", 1, true)];
    renderTab();
    onDragEnd!({ active: { id: "s1" }, over: { id: "s1" } });
    onDragEnd!({ active: { id: "s1" }, over: null });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("disables dragging while a filter is active", () => {
    skills = [mk("s1", "Secrets", 0, true), mk("s2", "Naming", 1, true)];
    renderTab();
    expect(screen.getByLabelText("Drag to reorder Secrets")).toHaveAttribute("role", "button");
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "sec" } });
    // dnd-kit's attributes (role="button") are only spread on draggable rows;
    // an inert handle is hidden from assistive tech instead of mislabelled.
    expect(screen.queryByLabelText("Drag to reorder Secrets")).not.toBeInTheDocument();
  });
  it("clears the filter when Escape is pressed in the filter input", () => {
    skills = [mk("s1", "Secrets", 0, true), mk("s2", "Naming", 1, true)];
    renderTab();
    const filter = screen.getByPlaceholderText("Filter skills…");
    fireEvent.change(filter, { target: { value: "sec" } });
    expect(screen.queryByText("Naming")).not.toBeInTheDocument();
    fireEvent.keyDown(filter, { key: "Escape" });
    expect(filter).toHaveValue("");
    expect(screen.getByText("Naming")).toBeInTheDocument();
    expect(screen.getByText("Secrets")).toBeInTheDocument();
    // dragging is re-enabled once the filter is cleared
    expect(screen.getByLabelText("Drag to reorder Secrets")).toHaveAttribute("role", "button");
  });

  it("lets Escape bubble when the filter is already empty", () => {
    skills = [mk("s1", "Secrets", 0, true)];
    renderTab();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    fireEvent.keyDown(screen.getByPlaceholderText("Filter skills…"), { key: "Escape" });
    document.removeEventListener("keydown", outer);
    expect(outer).toHaveBeenCalled();
  });

  it("attaches a skill via dropdown, appending with enabled=true", () => {
    skills = [mk("s1", "Secrets", 0, true)];
    availableSkills = [
      { id: "s1", name: "Secrets", description: "", type: "rubric", enabled: true, source: "manual", body: "", version: 1, evidence_files: null, agent_count: 1, pull_frequency_pct: 50, accept_rate_pct: 100 },
      { id: "s2", name: "Naming", description: "", type: "convention", enabled: true, source: "manual", body: "", version: 1, evidence_files: null, agent_count: 0, pull_frequency_pct: 0, accept_rate_pct: 100 },
    ];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Attach skill/ }));
    expect(screen.queryByRole("button", { name: /^Secrets/ })).not.toBeInTheDocument(); // already linked
    fireEvent.click(screen.getByRole("button", { name: /Naming/ }));
    expect(mutate).toHaveBeenCalledWith(
      [
        { skill_id: "s1", enabled: true },
        { skill_id: "s2", enabled: true },
      ],
      expect.anything(),
    );
  });

  it("detaches a skill via the X button", () => {
    skills = [mk("s1", "Secrets", 0, true), mk("s2", "Naming", 1, true)];
    renderTab();
    const removeButtons = screen.getAllByTitle("Remove from this agent");
    fireEvent.click(removeButtons[1]!); // remove "Naming"
    expect(mutate).toHaveBeenCalledWith(
      [{ skill_id: "s1", enabled: true }],
      expect.anything(),
    );
  });

  it("shows 'Disabled globally' hint for unvetted attached skills", () => {
    skills = [
      mk("s1", "Secrets", 0, true),
      mk("s2", "Naming", 1, true), // will be globally disabled
    ];
    availableSkills = [
      { id: "s1", name: "Secrets", description: "", type: "rubric", enabled: true, source: "manual", body: "", version: 1, evidence_files: null, agent_count: 1, pull_frequency_pct: 50, accept_rate_pct: 100 },
      { id: "s2", name: "Naming", description: "", type: "convention", enabled: false, source: "manual", body: "", version: 1, evidence_files: null, agent_count: 0, pull_frequency_pct: 0, accept_rate_pct: 100 }, // globally disabled
    ];
    renderTab();
    expect(screen.getByText("Disabled globally — won’t be injected until enabled")).toBeInTheDocument();
  });

  it("gives each row's checkbox and the filter an accessible name", () => {
    skills = [mk("s1", "Secrets", 0, true)];
    renderTab();
    expect(screen.getByRole("checkbox", { name: "Enable Secrets for this agent" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Filter linked skills" })).toBeInTheDocument();
  });

  it("registers a keyboard sensor so reordering is not mouse-only", async () => {
    skills = [mk("s1", "A", 0, true), mk("s2", "B", 1, true)];
    renderTab();
    const { KeyboardSensor } = await import("@dnd-kit/core");
    expect(sensors?.map((d) => d.sensor)).toContain(KeyboardSensor);
  });
});
