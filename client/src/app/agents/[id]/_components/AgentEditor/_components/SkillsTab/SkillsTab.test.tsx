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
    DndContext: (props: {
      onDragEnd?: typeof onDragEnd;
      sensors?: typeof sensors;
      children?: React.ReactNode;
    }) => {
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

function mkLinked(id: string, name: string, order: number): AgentSkillItem {
  return { agent_id: "ag1", skill_id: id, order, name, type: "rubric" };
}

function mkSkill(
  id: string,
  name: string,
  enabled = true,
  source: SkillWithStats["source"] = "manual",
): SkillWithStats {
  return {
    id,
    name,
    description: "",
    type: "rubric",
    source,
    body: "",
    enabled,
    version: 1,
    is_dangerous: false,
    evidence_files: null,
  };
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
  it("shows an empty state when the workspace has no skills at all", () => {
    skills = [];
    availableSkills = [];
    renderTab();
    expect(screen.getByText("No skills in this workspace yet.")).toBeInTheDocument();
  });

  it("shows unlinked skills below linked ones, with a linked count", () => {
    skills = [mkLinked("s1", "Secrets", 0)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming")];
    renderTab();
    expect(screen.getByText("Secrets")).toBeInTheDocument();
    expect(screen.getByText("Naming")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 linked")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Unlink Secrets from this agent" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Link Naming to this agent" })).not.toBeChecked();
  });

  it("links an unlinked skill when its checkbox is checked, appending it to the linked set", () => {
    skills = [mkLinked("s1", "Secrets", 0)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming")];
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Link Naming to this agent" }));
    expect(mutate).toHaveBeenCalledWith(["s1", "s2"], expect.anything());
  });

  it("unlinks a linked skill when its checkbox is unchecked", () => {
    skills = [mkLinked("s1", "Secrets", 0), mkLinked("s2", "Naming", 1)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming")];
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Unlink Naming from this agent" }));
    expect(mutate).toHaveBeenCalledWith(["s1"], expect.anything());
  });

  it("swaps the reorder hint for a filter hint while filtering", () => {
    skills = [mkLinked("s1", "Secrets", 0), mkLinked("s2", "Naming", 1)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming")];
    renderTab();
    const filter = screen.getByPlaceholderText("Filter skills…");
    fireEvent.change(filter, { target: { value: "sec" } });
    expect(screen.getByText("Clear the filter to reorder skills.")).toBeInTheDocument();
    expect(screen.getByText("Secrets")).toBeInTheDocument();
    expect(screen.queryByText("Naming")).not.toBeInTheDocument();
  });

  it("persists the new order when a linked skill is dropped", () => {
    skills = [mkLinked("s1", "A", 0), mkLinked("s2", "B", 1), mkLinked("s3", "C", 2)];
    availableSkills = [mkSkill("s1", "A"), mkSkill("s2", "B"), mkSkill("s3", "C")];
    renderTab();
    onDragEnd!({ active: { id: "s3" }, over: { id: "s1" } }); // drag C above A
    expect(mutate).toHaveBeenCalledWith(["s3", "s1", "s2"], expect.anything());
  });

  it("never resends a dangerous skill still linked in a stale cache", () => {
    skills = [mkLinked("s1", "A", 0), mkLinked("s2", "Injected", 1), mkLinked("s3", "C", 2)];
    availableSkills = [
      mkSkill("s1", "A"),
      { ...mkSkill("s2", "Injected", false), is_dangerous: true },
      mkSkill("s3", "C"),
    ];
    renderTab();
    onDragEnd!({ active: { id: "s3" }, over: { id: "s1" } });
    expect(mutate).toHaveBeenCalledWith(["s3", "s1"], expect.anything());
  });

  it("does not save when dropped onto itself or outside the list", () => {
    skills = [mkLinked("s1", "A", 0), mkLinked("s2", "B", 1)];
    availableSkills = [mkSkill("s1", "A"), mkSkill("s2", "B")];
    renderTab();
    onDragEnd!({ active: { id: "s1" }, over: { id: "s1" } });
    onDragEnd!({ active: { id: "s1" }, over: null });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("disables dragging while a filter is active", () => {
    skills = [mkLinked("s1", "Secrets", 0), mkLinked("s2", "Naming", 1)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming")];
    renderTab();
    expect(screen.getByLabelText("Drag to reorder Secrets")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "sec" } });
    // an inert drag handle is aria-hidden instead of exposing a stale label
    expect(screen.queryByLabelText("Drag to reorder Secrets")).not.toBeInTheDocument();
  });

  it("never allows dragging an unlinked skill", () => {
    skills = [mkLinked("s1", "Secrets", 0)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming")];
    renderTab();
    expect(screen.queryByLabelText("Drag to reorder Naming")).not.toBeInTheDocument();
  });

  it("clears the filter when Escape is pressed in the filter input", () => {
    skills = [mkLinked("s1", "Secrets", 0), mkLinked("s2", "Naming", 1)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming")];
    renderTab();
    const filter = screen.getByPlaceholderText("Filter skills…");
    fireEvent.change(filter, { target: { value: "sec" } });
    expect(screen.queryByText("Naming")).not.toBeInTheDocument();
    fireEvent.keyDown(filter, { key: "Escape" });
    expect(filter).toHaveValue("");
    expect(screen.getByText("Naming")).toBeInTheDocument();
    expect(screen.getByText("Secrets")).toBeInTheDocument();
    // dragging is re-enabled once the filter is cleared
    expect(screen.getByLabelText("Drag to reorder Secrets")).toBeInTheDocument();
  });

  it("lets Escape bubble when the filter is already empty", () => {
    skills = [mkLinked("s1", "Secrets", 0)];
    availableSkills = [mkSkill("s1", "Secrets")];
    renderTab();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    fireEvent.keyDown(screen.getByPlaceholderText("Filter skills…"), { key: "Escape" });
    document.removeEventListener("keydown", outer);
    expect(outer).toHaveBeenCalled();
  });

  it("shows the orange 'Disabled' label for a globally-disabled skill, linked or not", () => {
    skills = [mkLinked("s1", "Secrets", 0), mkLinked("s2", "Naming", 1)];
    availableSkills = [
      mkSkill("s1", "Secrets", true),
      mkSkill("s2", "Naming", false), // globally disabled, still linked
      mkSkill("s3", "Unlinked disabled", false), // globally disabled, not linked
    ];
    renderTab();
    const labels = screen.getAllByText("Disabled");
    expect(labels).toHaveLength(2);
  });

  it("shows the orange 'Needs vetting' label instead of 'Disabled' for a disabled, non-manual skill, linked or not", () => {
    skills = [mkLinked("s1", "Secrets", 0), mkLinked("s2", "Naming", 1)];
    availableSkills = [
      mkSkill("s1", "Secrets", true),
      mkSkill("s2", "Naming", false, "imported_url"), // disabled + imported, still linked
      mkSkill("s3", "Unlinked unvetted", false, "imported_url"), // disabled + imported, not linked
    ];
    renderTab();
    expect(screen.getAllByText("Needs vetting")).toHaveLength(2);
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
  });

  it("cannot link an unlinked globally-disabled skill by clicking its checkbox", () => {
    skills = [mkLinked("s1", "Secrets", 0)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming", false)];
    renderTab();
    const checkbox = screen.getByRole("checkbox", { name: "Link Naming to this agent" });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("still allows unlinking a linked skill even though it is globally disabled", () => {
    skills = [mkLinked("s1", "Secrets", 0), mkLinked("s2", "Naming", 1)];
    availableSkills = [mkSkill("s1", "Secrets"), mkSkill("s2", "Naming", false)];
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Unlink Naming from this agent" }));
    expect(mutate).toHaveBeenCalledWith(["s1"], expect.anything());
  });

  it("gives each row's checkbox and the filter an accessible name", () => {
    skills = [mkLinked("s1", "Secrets", 0)];
    availableSkills = [mkSkill("s1", "Secrets")];
    renderTab();
    expect(screen.getByRole("checkbox", { name: "Unlink Secrets from this agent" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Filter skills" })).toBeInTheDocument();
  });

  it("registers a keyboard sensor so reordering is not mouse-only", async () => {
    skills = [mkLinked("s1", "A", 0), mkLinked("s2", "B", 1)];
    availableSkills = [mkSkill("s1", "A"), mkSkill("s2", "B")];
    renderTab();
    const { KeyboardSensor } = await import("@dnd-kit/core");
    expect(sensors?.map((d) => d.sensor)).toContain(KeyboardSensor);
  });
});
