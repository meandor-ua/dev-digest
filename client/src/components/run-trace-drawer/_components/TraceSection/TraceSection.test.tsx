import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TraceSection } from "./TraceSection";

afterEach(cleanup);

describe("TraceSection", () => {
  it("shows its body by default and collapses it when the header is clicked", () => {
    render(
      <TraceSection icon="Gauge" title="Stats" right={<span>2/2</span>}>
        <p>body</p>
      </TraceSection>,
    );
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Stats"));
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("starts collapsed with defaultOpen={false}", () => {
    render(
      <TraceSection icon="Code" title="Raw output" defaultOpen={false}>
        <p>body</p>
      </TraceSection>,
    );
    expect(screen.queryByText("body")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Raw output"));
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});
