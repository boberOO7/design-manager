import { describe, expect, it } from "vitest";
import { passwordRecoverySchema } from "./password-recovery";

describe("passwordRecoverySchema", () => {
  it("trims and normalizes valid email addresses", () => {
    expect(passwordRecoverySchema.parse({ email: "  Employee@Example.COM " })).toEqual({
      email: "employee@example.com",
    });
  });

  it("rejects invalid email addresses", () => {
    expect(passwordRecoverySchema.safeParse({ email: "invalid" }).success).toBe(false);
  });
});
