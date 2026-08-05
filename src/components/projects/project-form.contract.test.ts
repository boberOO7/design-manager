import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const formPath = new URL("./project-form.tsx", import.meta.url);
const modalPath = new URL("./project-creation-modal.tsx", import.meta.url);
const actionPath = new URL("../../app/(app)/projects/new/actions.ts", import.meta.url);

describe("compact project creation contract", () => {
  it("uses one shared ordered form and omits manual project code entry", async () => {
    const source = await readFile(formPath, "utf8");
    const fields = ["name", "project_type", "client_name", "country_code", "city", "total_area_m2", "priority", "start_date", "due_date", "description"];
    const positions = fields.map((field) => source.indexOf(`name=\"${field}\"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source).not.toContain('name="project_code"');
  });

  it("opens from a client modal and navigates to the created project id", async () => {
    const [modal, action] = await Promise.all([readFile(modalPath, "utf8"), readFile(actionPath, "utf8")]);
    expect(modal).toContain("<Dialog");
    expect(modal).toContain("router.push(`/projects/${projectId}`)");
    expect(action).toContain("return { projectId: data.id }");
    expect(action).not.toContain("service_role");
    expect(action).not.toContain("project_code:");
  });
});
