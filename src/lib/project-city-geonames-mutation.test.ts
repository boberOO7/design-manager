import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const createActionPath = new URL("../app/(app)/projects/new/actions.ts", import.meta.url);
const editActionPath = new URL("../app/(app)/projects/[projectId]/actions.ts", import.meta.url);
const projectQueryPath = new URL("../data/queries/project-by-id.ts", import.meta.url);

describe("project city GeoNames mutations", () => {
  it("persists the optional identifier on create and edit, while retaining the city fallback", async () => {
    const [createAction, editAction] = await Promise.all([readFile(createActionPath, "utf8"), readFile(editActionPath, "utf8")]);
    expect(createAction).toContain("city: project.city || null");
    expect(createAction).toContain("city_geonames_id: project.city_geonames_id ?? null");
    expect(editAction).toContain("city: values.city || null");
    expect(editAction).toContain("city_geonames_id: values.city_geonames_id ?? null");
  });

  it("selects the id with the project metadata needed for localized rendering", async () => {
    const source = await readFile(projectQueryPath, "utf8");
    expect(source).toContain("city, city_geonames_id, client_name");
  });
});
