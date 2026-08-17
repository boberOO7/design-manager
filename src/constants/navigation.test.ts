import { describe, expect, it } from "vitest";
import { getNavigationItems, isNavigationItemActive } from "./navigation";

describe("application navigation", () => {
  it("hides administration and archive from employees", () => {
    const items = getNavigationItems("employee");
    expect(items.some((item) => item.href === "/admin")).toBe(false);
    expect(items.some((item) => item.href === "/archive")).toBe(false);
  });

  it("shows administration and archive to administrators", () => {
    const items = getNavigationItems("admin");
    expect(items.some((item) => item.href === "/admin")).toBe(true);
    expect(items.some((item) => item.href === "/archive")).toBe(true);
  });

  it("marks a workspace route active without matching unrelated prefixes", () => {
    expect(isNavigationItemActive("/projects/abc", "/projects")).toBe(true);
    expect(isNavigationItemActive("/project-settings", "/projects")).toBe(false);
  });
});
