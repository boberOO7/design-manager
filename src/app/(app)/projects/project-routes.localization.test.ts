import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import uk from "../../../../messages/uk.json";

const newProjectPage = new URL("./new/page.tsx", import.meta.url);
const editProjectPage = new URL("./[projectId]/edit/page.tsx", import.meta.url);

describe("project create and edit route localization", () => {
  it("connects route headings, descriptions, and metadata to canonical messages", async () => {
    const [newSource, editSource] = await Promise.all([
      readFile(newProjectPage, "utf8"),
      readFile(editProjectPage, "utf8"),
    ]);

    expect(newSource).toContain('getTranslations("Projects")');
    expect(newSource).toContain('title={t("newProject")}');
    expect(newSource).toContain('description={t("newProjectDescription")}');
    expect(newSource).toContain('title: t("newProjectMetadata")');
    expect(newSource).not.toContain('title="New project"');

    expect(editSource).toContain('getTranslations("Projects")');
    expect(editSource).toContain('title={t("editProject")}');
    expect(editSource).toContain('t("editProjectDescription", { projectName: project.name })');
    expect(editSource).toContain('title: t("editProjectMetadata")');
    expect(editSource).not.toContain('title="Edit project"');
  });

  it("provides the required English and Ukrainian route copy", () => {
    expect(en.Projects.newProject).toBe("New project");
    expect(en.Projects.newProjectDescription).toBe("Create a project for your studio.");
    expect(en.Projects.editProject).toBe("Edit project");
    expect(en.Projects.editProjectDescription).toBe("Update {projectName}.");
    expect(uk.Projects.newProject).toBe("Новий проєкт");
    expect(uk.Projects.newProjectDescription).toBe("Створіть новий проєкт для вашої студії.");
    expect(uk.Projects.editProject).toBe("Редагувати проєкт");
    expect(uk.Projects.editProjectDescription).toBe("Оновіть проєкт {projectName}.");
  });
});
