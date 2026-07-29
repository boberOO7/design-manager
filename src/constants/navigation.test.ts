import { describe, expect, it } from "vitest";
import type { Profile } from "@/types";
import { getNavigationItems, isNavigationItemActive } from "./navigation";

function profile(systemRole: Profile["system_role"]): Profile {
  return {
    id: "profile-id",
    full_name: "Studio User",
    email: "studio@example.com",
    job_title: "Designer",
    system_role: systemRole,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("application navigation", () => {
  it("hides administration from employees", () => {
    expect(getNavigationItems(profile("employee")).some((item) => item.href === "/admin")).toBe(false);
  });

  it("shows administration to administrators", () => {
    expect(getNavigationItems(profile("admin")).some((item) => item.href === "/admin")).toBe(true);
  });

  it("marks a workspace route active without matching unrelated prefixes", () => {
    expect(isNavigationItemActive("/projects/abc", "/projects")).toBe(true);
    expect(isNavigationItemActive("/project-settings", "/projects")).toBe(false);
  });
});
