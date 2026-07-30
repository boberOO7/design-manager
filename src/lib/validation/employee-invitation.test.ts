import { describe, expect, it } from "vitest";
import {
  employeeInvitationSchema,
  getEmployeeInvitationPayload,
  PROFESSIONAL_ROLES,
} from "./employee-invitation";

describe("employeeInvitationSchema", () => {
  it("trims input and normalizes the email address", () => {
    const result = employeeInvitationSchema.parse({
      email: "  Employee@Example.COM ",
      full_name: "  Jane Designer  ",
      job_title: "Designer",
    });

    expect(result).toEqual({
      email: "employee@example.com",
      full_name: "Jane Designer",
      job_title: "Designer",
    });
  });

  it("exposes the only supported professional roles", () => {
    expect(PROFESSIONAL_ROLES).toEqual(["Designer", "Architect"]);
  });

  it("rejects missing, invalid, and unsupported employee details", () => {
    const result = employeeInvitationSchema.safeParse({
      email: "not-an-email",
      full_name: " ",
      job_title: "Project manager",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
      expect(result.error.flatten().fieldErrors.full_name).toBeDefined();
      expect(result.error.flatten().fieldErrors.job_title).toBeDefined();
    }
  });

  it("creates the Auth invitation payload with the selected professional role", () => {
    const invitation = employeeInvitationSchema.parse({
      email: "architect@example.com",
      full_name: "Alex Architect",
      job_title: "Architect",
    });

    expect(getEmployeeInvitationPayload(invitation)).toEqual({
      email: "architect@example.com",
      data: {
        full_name: "Alex Architect",
        job_title: "Architect",
      },
    });
  });
});
