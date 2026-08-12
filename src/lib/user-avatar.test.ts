import { describe, expect, it } from "vitest";
import { getAvatarFileValidationError, getAvatarImageUrl, getUserInitials, isAvatarObjectPath } from "./user-avatar";

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

describe("avatar upload helpers", () => {
  it("accepts only supported image types up to 5 MB", () => {
    expect(getAvatarFileValidationError({ type: "image/webp", size: 5 * 1024 * 1024 })).toBeNull();
    expect(getAvatarFileValidationError({ type: "image/gif", size: 10 })).toBe("unsupported_type");
    expect(getAvatarFileValidationError({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe("file_too_large");
  });

  it("recognizes controlled object paths while preserving legacy URLs", () => {
    expect(isAvatarObjectPath("user-id/image.webp")).toBe(true);
    expect(isAvatarObjectPath("user-id/nested/image.webp")).toBe(false);
    expect(getAvatarImageUrl("https://example.com/avatar.png")).toBe("https://example.com/avatar.png");
  });
});
