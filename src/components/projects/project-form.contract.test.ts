import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const formPath = new URL("./project-form.tsx", import.meta.url);
const modalPath = new URL("./project-creation-modal.tsx", import.meta.url);
const sharedModalPath = new URL("./project-form-modal.tsx", import.meta.url);
const editModalPath = new URL("./project-edit-modal.tsx", import.meta.url);
const contextPath = new URL("./project-context-band.tsx", import.meta.url);
const actionPath = new URL("../../app/(app)/projects/new/actions.ts", import.meta.url);
const editActionPath = new URL("../../app/(app)/projects/[projectId]/actions.ts", import.meta.url);
const metadataControlsPath = new URL("./project-metadata-controls.tsx", import.meta.url);
const completionDateFormPath = new URL("./project-completion-date-form.tsx", import.meta.url);
const projectPagePath = new URL("../../app/(app)/projects/[projectId]/page.tsx", import.meta.url);

describe("compact project creation contract", () => {
  it("uses one shared ordered form and omits manual project code entry", async () => {
    const source = await readFile(formPath, "utf8");
    const fields = ["project_name", "project_type", "project_type_custom", "client_name", "country_code", "city_search", "city", "city_geonames_id", "total_area_m2", "priority", "start_date", "due_date", "description"];
    const positions = fields.map((field) => source.indexOf(`name=\"${field}\"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source).not.toContain('name="project_code"');
  });

  it("opens from a client modal and navigates to the created project id", async () => {
    const [modal, sharedModal, action] = await Promise.all([readFile(modalPath, "utf8"), readFile(sharedModalPath, "utf8"), readFile(actionPath, "utf8")]);
    expect(modal).toContain("<ProjectFormModal");
    expect(sharedModal).toContain("<Dialog");
    expect(modal).toContain("router.push(`/projects/${projectId}`)");
    expect(action).toContain("return { projectId: data }");
    expect(action).not.toContain("service_role");
    expect(action).not.toContain("project_code:");
    expect(action).toContain('getTranslations("ProjectForm")');
    expect(action).not.toContain("Please correct the highlighted fields.");
    expect(action).not.toContain("Total area must be greater than zero");
  });

  it("opens editing through the same URL-preserving modal and refreshes the workspace", async () => {
    const [editModal, context, sharedModal, editAction] = await Promise.all([readFile(editModalPath, "utf8"), readFile(contextPath, "utf8"), readFile(sharedModalPath, "utf8"), readFile(editActionPath, "utf8")]);
    expect(editModal).toContain("<ProjectFormModal");
    expect(editModal).toContain('mode="edit"');
    expect(editModal).toContain("router.refresh()");
    expect(context).toContain("<ProjectEditModal");
    expect(context).not.toContain("/edit");
    expect(sharedModal).toContain("returnFocusRef={triggerRef}");
    expect(sharedModal).toContain("getProjectDialogCloseIntent(mode, isDirty, reason)");
    expect(editAction).toContain("revalidateProjectRoutes(project.id);\n  return { projectId: project.id };");
    expect(editAction).toContain('project.status === "completed"');
    expect(editAction).toContain('getTranslations("ProjectForm")');
    expect(editAction).not.toContain("Please correct the highlighted fields.");
    for (const field of ["name", "project_type", "project_type_custom", "country_code", "city", "city_geonames_id", "client_name", "description", "total_area_m2", "priority", "start_date", "due_date"]) {
      expect(context).toContain(`${field}: project.${field}`);
    }
  });

  it("focuses project name first in both modal modes and suppresses browser autofill", async () => {
    const source = await readFile(formPath, "utf8");
    expect(source).toContain("<input data-dialog-initial-focus name=\"project_name\"");
    expect(source).toContain('autoComplete="off" noValidate');
    expect(source).not.toContain('mode === "create" ? "" : undefined');
  });

  it("dispatches create and edit submissions without React action-form resets", async () => {
    const source = await readFile(formPath, "utf8");
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("const formData = new FormData(event.currentTarget);");
    expect(source).toContain("startTransition(() => formAction(formData));");
    expect(source).toContain("createProjectSchema(messages) : createEditProjectSchema(messages)");
    expect(source).not.toContain("action={formAction}");
  });

  it("keeps a GeoNames id separate from the browser-visible city search value", async () => {
    const [source, metadataControls] = await Promise.all([readFile(formPath, "utf8"), readFile(metadataControlsPath, "utf8")]);
    expect(source).toContain('name="city_search"');
    expect(source).toContain('<input type="hidden" name="city" value={metadata.city} />');
    expect(source).toContain('<input type="hidden" name="city_geonames_id" value={metadata.cityGeoNamesId ?? ""} />');
    expect(metadataControls).toContain("setCityGeoNamesId(undefined);");
  });

  it("exposes only the authoritative completion date for completed-project corrections", async () => {
    const [completionForm, page, editAction] = await Promise.all([readFile(completionDateFormPath, "utf8"), readFile(projectPagePath, "utf8"), readFile(editActionPath, "utf8")]);
    const correctionAction = editAction.slice(editAction.indexOf("export async function updateProjectCompletionDate"), editAction.indexOf("export async function archiveProject"));

    expect(page).toContain('project.status === "completed" && canManage');
    expect(page).toContain("<ProjectCompletionDateForm");
    expect(completionForm).toContain('name="completed_at"');
    expect(completionForm).toContain("defaultValue={completedAt}");
    expect(completionForm).toContain('useTranslations("ProjectForm")');
    expect(completionForm).toContain('form("saving") : form("save")');
    expect(correctionAction).toContain("project.status !== \"completed\"");
    expect(correctionAction).toContain(".update({ completed_at: parsed.data.completed_at })");
    expect(correctionAction).toContain('.eq("status", "completed")');
    expect(correctionAction).not.toContain("status:");
  });
});
