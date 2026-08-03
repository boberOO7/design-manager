import { describe, expect, it } from "vitest";
import { getUserInitials } from "./user-avatar";

describe("getUserInitials", () => {
  it("uses the first and last name initials after normalizing spaces", () => {
    expect(getUserInitials("  Ada   Lovelace ")).toBe("AL");
  });

  it("uses up to two characters for a one-word name", () => {
    expect(getUserInitials("Cher")).toBe("CH");
  });

  it("supports Ukrainian names and missing values safely", () => {
    expect(getUserInitials("Марія Іваненко")).toBe("МІ");
    expect(getUserInitials("   ")).toBe("");
    expect(getUserInitials(null)).toBe("");
  });
});
