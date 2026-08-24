import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const projectListPath = new URL("./project-list.tsx", import.meta.url);
const projectContextPath = new URL("./project-context-band.tsx", import.meta.url);
const projectDetailsPath = new URL("../../app/(app)/projects/[projectId]/page.tsx", import.meta.url);
const archivePath = new URL("../../app/(app)/archive/page.tsx", import.meta.url);

describe("project-code visibility", () => {
  it("keeps project codes out of normal project UI surfaces", async () => {
    const [projectList, projectContext, projectDetails, archive] = await Promise.all([
      readFile(projectListPath, "utf8"),
      readFile(projectContextPath, "utf8"),
      readFile(projectDetailsPath, "utf8"),
      readFile(archivePath, "utf8"),
    ]);

    expect(projectList).not.toContain("{project.project_code}");
    expect(projectContext).not.toContain("{project.project_code}");
    expect(projectDetails).not.toContain('label: form("projectCode")');
    expect(archive).not.toContain("project.project_code ||");
  });
});
