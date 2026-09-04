import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const directoryPath = new URL("./contractor-directory.tsx", import.meta.url);
const actionsPath = new URL("../../app/(app)/contractors/actions.ts", import.meta.url);
const pagePath = new URL("../../app/(app)/contractors/page.tsx", import.meta.url);

describe("contractor permissions", () => {
  it("shows editing to active members while retaining deletion for admins", async () => {
    const source = await readFile(directoryPath, "utf8");

    expect(source).toContain("canEdit, isAdmin");
    expect(source).toContain("{canEdit ? <td");
    expect(source).toContain("{isAdmin ? <Button type=\"button\" variant=\"ghost\" size=\"sm\" aria-label={t(\"deleteAria\"");
  });

  it("authorizes updates with active membership and deletion with active admin access", async () => {
    const source = await readFile(actionsPath, "utf8");
    const updateAction = source.slice(source.indexOf("export async function updateContractor"), source.indexOf("export async function deleteContractor"));
    const deleteAction = source.slice(source.indexOf("export async function deleteContractor"), source.indexOf("export async function updateContractorCategoryColor"));

    expect(updateAction).toContain("getActiveStudioMembership()");
    expect(updateAction).not.toContain("getActiveStudioAdmin()");
    expect(deleteAction).toContain("getActiveStudioAdmin()");
  });

  it("keeps category rename and deletion behind active admin authorization", async () => {
    const source = await readFile(actionsPath, "utf8");
    const renameAction = source.slice(source.indexOf("export async function renameContractorCategory"), source.indexOf("export async function deleteContractorCategory"));
    const deleteCategoryAction = source.slice(source.indexOf("export async function deleteContractorCategory"));

    expect(renameAction).toContain("getActiveStudioAdmin()");
    expect(renameAction).toContain('supabase.rpc("rename_contractor_category"');
    expect(deleteCategoryAction).toContain("getActiveStudioAdmin()");
    expect(deleteCategoryAction).toContain('supabase.rpc("delete_contractor_category"');
  });

  it("exposes category management only to administrators", async () => {
    const source = await readFile(directoryPath, "utf8");

    expect(source).toContain("{isAdmin ? <Popover.Root");
    expect(source).toContain("renameContractorCategory");
    expect(source).toContain("deleteContractorCategory");
    expect(source).not.toContain("window.confirm");
  });

  it("groups each category into a compact tokenized row with balanced actions", async () => {
    const source = await readFile(directoryPath, "utf8");
    const managementDialog = source.slice(
      source.indexOf('description={t("categoryManagement.description")}'),
      source.indexOf('description={t("categoryManagement.deleteDescription"'),
    );

    expect(managementDialog).toContain("space-y-2");
    expect(managementDialog).toContain("rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-3");
    expect(managementDialog).toContain('className="size-9 shrink-0 p-0 hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)]"');
    expect(managementDialog).toContain('className="size-9 shrink-0 p-0 text-[var(--ui-danger-text)] hover:bg-[color-mix(in_srgb,var(--ui-danger-surface)_55%,var(--ui-surface))]"');
    expect(managementDialog).toContain("sm:border-l sm:border-t-0 sm:pl-3");
  });

  it("derives the edit affordance from the canonical active studio membership", async () => {
    const source = await readFile(pagePath, "utf8");

    expect(source).toContain("getActiveStudioMembership()");
    expect(source).toContain("canEdit={Boolean(membership)}");
    expect(source).toContain("isAdmin={Boolean(adminMembership)}");
  });
});
