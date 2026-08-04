import { describe, expect, it } from "vitest";
import { editProjectSchema, projectSchema } from "./project";

const project = {
  name: "Apartment renovation",
  project_code: "SF-042",
  project_type: "Residential",
  city: "Kyiv",
  client_name: "Olena K.",
  description: "",
  total_area_m2: 96,
  priority: "normal",
  start_date: "2026-08-03",
  due_date: "",
};

describe("project form metadata", () => {
  it("accepts optional project type and city on create and edit", () => {
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(editProjectSchema.safeParse(project).success).toBe(true);
  });

  it("keeps metadata within the project form validation limits", () => {
    expect(projectSchema.safeParse({ ...project, project_type: "x".repeat(101) }).success).toBe(false);
    expect(projectSchema.safeParse({ ...project, city: "x".repeat(101) }).success).toBe(false);
  });
});
