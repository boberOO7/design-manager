import { describe, expect, it } from "vitest";
import { editProjectSchema, getKyivDateOnly, getProjectFormInput, projectSchema } from "./project";

const project = {
  name: "Apartment renovation",
  project_type: "residential",
  country_code: "UA",
  city: "Kyiv",
  city_geonames_id: 703448,
  client_name: "Olena K.",
  description: "",
  total_area_m2: 96,
  priority: "normal",
  start_date: "2026-08-03",
  due_date: "",
};

describe("project form metadata", () => {
  it("accepts canonical project type, ISO country, and city on create and edit", () => {
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(editProjectSchema.safeParse(project).success).toBe(true);
  });

  it("keeps metadata within the project form validation limits", () => {
    expect(projectSchema.safeParse({ ...project, project_type: "Residential" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...project, country_code: "ZZ" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...project, city: "x".repeat(101) }).success).toBe(false);
    expect(projectSchema.safeParse({ ...project, city_geonames_id: "not-an-id" }).success).toBe(false);
  });

  it("accepts a null project type but requires a country", () => {
    expect(projectSchema.safeParse({ ...project, project_type: "" }).success).toBe(true);
    expect(projectSchema.safeParse({ ...project, country_code: "" }).success).toBe(false);
  });

  it("uses the Europe/Kyiv calendar day for new planned starts", () => {
    expect(getKyivDateOnly(new Date("2026-08-05T21:30:00.000Z"))).toBe("2026-08-06");
  });

  it("maps browser-safe project field names back to canonical values", () => {
    const formData = new FormData();
    formData.set("project_name", project.name);
    formData.set("city", project.city);
    formData.set("city_geonames_id", String(project.city_geonames_id));
    expect(getProjectFormInput(formData)).toMatchObject({ name: project.name, city: project.city, city_geonames_id: String(project.city_geonames_id) });
    expect(getProjectFormInput(formData)).not.toHaveProperty("project_name");
  });
});
