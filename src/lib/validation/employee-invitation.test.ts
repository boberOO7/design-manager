import { describe, expect, it } from "vitest";
import { employeeInvitationSchema } from "./employee-invitation";

describe("employeeInvitationSchema", () => {
  it("trims input and normalizes the email address", () => {
    const result = employeeInvitationSchema.parse({
      email: "  Employee@Example.COM ",
      full_name: "  Jane Designer  ",
      job_title: "  Interior Designer  ",
    });

    expect(result).toEqual({
      email: "employee@example.com",
      full_name: "Jane Designer",
      job_title: "Interior Designer",
    });
  });

  it("rejects missing and invalid employee details", () => {
    const result = employeeInvitationSchema.safeParse({
      email: "not-an-email",
      full_name: " ",
      job_title: " ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
      expect(result.error.flatten().fieldErrors.full_name).toBeDefined();
      expect(result.error.flatten().fieldErrors.job_title).toBeDefined();
    }
  });
});
