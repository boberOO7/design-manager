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
    form.set("joinedAt", "2024-08-24");
    form.set("birthDate", "1998-08-24");
    form.set("countryCode", "UA");
    form.set("city", "Kyiv");
    form.set("cityGeoNamesId", "703448");
    expect(studioMemberProfileSchema.safeParse(getStudioMemberProfileInput(form)).success).toBe(true);
  });

  it("rejects unsupported access roles before the mutation runs", () => {
    const form = new FormData();
    form.set("userId", userId);
    form.set("firstName", "Avery");
    form.set("lastName", "Stone");
    form.set("jobTitle", "Architect");
    form.set("systemRole", "owner");
    form.set("joinedAt", "");
    form.set("birthDate", "");
    form.set("countryCode", "");
    form.set("city", "");
    form.set("cityGeoNamesId", "");
    expect(studioMemberProfileSchema.safeParse(getStudioMemberProfileInput(form)).success).toBe(false);
  });

  it("allows both optional dates to be cleared", () => {
    const form = new FormData();
    form.set("userId", userId);
    form.set("firstName", "Avery");
    form.set("lastName", "Stone");
    form.set("jobTitle", "Architect");
    form.set("systemRole", "employee");
    form.set("joinedAt", "");
    form.set("birthDate", "");
    form.set("countryCode", "");
    form.set("city", "");
    form.set("cityGeoNamesId", "");
    expect(studioMemberProfileSchema.parse(getStudioMemberProfileInput(form))).toMatchObject({ joinedAt: null, birthDate: null });
  });

  it("normalizes the same nullable location fields as the self-service Profile", () => {
    const form = new FormData();
    form.set("userId", userId);
    form.set("firstName", "Avery");
    form.set("lastName", "Stone");
    form.set("jobTitle", "Architect");
    form.set("systemRole", "employee");
    form.set("joinedAt", "");
    form.set("birthDate", "");
    form.set("countryCode", " ua ");
    form.set("city", " Kyiv ");
    form.set("cityGeoNamesId", "703448");
    expect(studioMemberProfileSchema.parse(getStudioMemberProfileInput(form))).toMatchObject({ countryCode: "UA", city: "Kyiv", cityGeoNamesId: 703448 });
  });

  it("does not allow a city without a country", () => {
    const form = new FormData();
    form.set("userId", userId);
    form.set("firstName", "Avery");
    form.set("lastName", "Stone");
    form.set("jobTitle", "Architect");
    form.set("systemRole", "employee");
    form.set("joinedAt", "");
    form.set("birthDate", "");
    form.set("countryCode", "");
    form.set("city", "Kyiv");
    form.set("cityGeoNamesId", "");
    expect(studioMemberProfileSchema.safeParse(getStudioMemberProfileInput(form)).success).toBe(false);
  });
});
