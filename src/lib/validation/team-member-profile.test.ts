import { describe, expect, it } from "vitest";
import { getFullName, getProfileNameParts, getStudioMemberProfileInput, studioMemberProfileSchema } from "./team-member-profile";

const userId = "22222222-2222-4222-8222-222222222222";

describe("team member profile validation", () => {
  it("preserves the existing full_name field by joining the edited name parts", () => {
    expect(getProfileNameParts("Avery Stone")).toEqual({ firstName: "Avery", lastName: "Stone" });
    expect(getFullName({ firstName: " Avery ", lastName: " Stone " })).toBe("Avery Stone");
  });

  it("accepts a professional role separately from an administrator access role", () => {
    const form = new FormData();
    form.set("userId", userId);
    form.set("firstName", "Avery");
    form.set("lastName", "Stone");
    form.set("jobTitle", "Architect");
    form.set("systemRole", "admin");
    expect(studioMemberProfileSchema.safeParse(getStudioMemberProfileInput(form)).success).toBe(true);
  });

  it("rejects unsupported access roles before the mutation runs", () => {
    const form = new FormData();
    form.set("userId", userId);
    form.set("firstName", "Avery");
    form.set("lastName", "Stone");
    form.set("jobTitle", "Architect");
    form.set("systemRole", "owner");
    expect(studioMemberProfileSchema.safeParse(getStudioMemberProfileInput(form)).success).toBe(false);
  });
});
