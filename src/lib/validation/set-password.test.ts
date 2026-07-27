import { describe, expect, it } from "vitest";
import { setPasswordSchema } from "./set-password";

describe("setPasswordSchema", () => {
  it("accepts a matching six-character password", () => {
    expect(setPasswordSchema.safeParse({
      password: "sixsix",
      password_confirmation: "sixsix",
    }).success).toBe(true);
  });

  it("rejects short or mismatched passwords", () => {
    expect(setPasswordSchema.safeParse({
      password: "short",
      password_confirmation: "different",
    }).success).toBe(false);
  });
});
