import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EmptyTab } from "./EmptyTab";

afterEach(cleanup);

describe("EmptyTab", () => {
  it("renders the placeholder title and body it is given", () => {
    render(<EmptyTab icon="FlaskConical" title="No evals yet" body="Evals land in a later lesson." />);
    expect(screen.getByText("No evals yet")).toBeInTheDocument();
    expect(screen.getByText("Evals land in a later lesson.")).toBeInTheDocument();
  });
});
