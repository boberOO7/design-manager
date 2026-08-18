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

  it("derives the edit affordance from the canonical active studio membership", async () => {
    const source = await readFile(pagePath, "utf8");

    expect(source).toContain("getActiveStudioMembership()");
    expect(source).toContain("canEdit={Boolean(membership)}");
    expect(source).toContain("isAdmin={Boolean(adminMembership)}");
  });
});
