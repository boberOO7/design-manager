import { describe, expect, it } from "vitest";
import {
  getSafeConfirmationDestination,
  getSupportedEmailOtpType,
} from "./email-confirmation";

describe("email confirmation routing", () => {
  it("accepts only invite and recovery OTP types", () => {
    expect(getSupportedEmailOtpType("invite")).toBe("invite");
    expect(getSupportedEmailOtpType("recovery")).toBe("recovery");
    expect(getSupportedEmailOtpType("email")).toBeNull();
    expect(getSupportedEmailOtpType(null)).toBeNull();
  });

  it("prevents external and unsupported redirects", () => {
    expect(getSafeConfirmationDestination("/set-password")).toBe("/set-password");
    expect(getSafeConfirmationDestination("https://attacker.example")).toBeNull();
    expect(getSafeConfirmationDestination("//attacker.example")).toBeNull();
    expect(getSafeConfirmationDestination("/dashboard")).toBeNull();
  });
});
