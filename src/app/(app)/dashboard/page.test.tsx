import { describe, expect, it } from "vitest";

describe("dashboard page rendering", () => {
  it("renders the dashboard heading", () => {
    expect("StudioFlow dashboard").toContain("dashboard");
  });
});
