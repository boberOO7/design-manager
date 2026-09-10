import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

const workspacePath = new URL("./candidates-workspace.tsx", import.meta.url);
const crmQueryPath = new URL("../../data/queries/crm.ts", import.meta.url);

describe("CRM candidates workspace contract", () => {
  it("uses the Lead row interaction guard for Candidate records", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("function isNestedInteractiveTarget");
    expect(workspace).toContain("onClick={(event) => { if (!isNestedInteractiveTarget(event.target, event.currentTarget)) openRecord(candidate); }}");
    expect(workspace).toContain('aria-label={t("candidates.openRecord"');
    expect(workspace).toContain('setView("detail")');
  });

  it("reuses shared Lead contact, assignee, and date controls", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("<PhoneInput autoComplete=\"off\"");
    expect(workspace).toContain('type="email" autoComplete="off"');
    expect(workspace).toContain('<AdminField admins={admins}');
    expect(workspace).toContain("<DatePicker name=\"next_contact_date\"");
    expect(workspace).toContain("<TimePicker");
    expect(workspace).not.toContain('type="datetime-local"');
    expect(workspace).not.toContain('type="date"');
  });

  it("uses the supported localized StudioFlow positions and preserves legacy stored values", async () => {
    const [workspace, query] = await Promise.all([readFile(workspacePath, "utf8"), readFile(crmQueryPath, "utf8")]);
    expect(workspace).toContain("function PositionField");
    expect(workspace).toContain("ProfessionalRole");
    expect(workspace).toContain("getCanonicalRoleTranslationKey");
    expect(workspace).toContain("preservedValue");
    expect(workspace).toContain('name="target_position"');
    const positionField = workspace.slice(workspace.indexOf("function PositionField"), workspace.indexOf("function CandidateSourceField"));
    expect(positionField).not.toContain('value="other"');
    expect(query).not.toContain("function getCrmStudioPositions");
  });

  it("uses read-first detail actions and keeps localized copy aligned", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("function CandidateHeaderActions");
    expect(workspace).toContain("<MoreHorizontal");
    expect(workspace).toContain("window.confirm");
    expect(workspace).toContain("function CandidateDetail");
    expect(workspace).not.toContain('variant="outline" className="border-[var(--ui-danger-border)]"');
    expect(Object.keys(en.Crm.candidates).sort()).toEqual(Object.keys(uk.Crm.candidates).sort());
    expect(en.Crm.candidates.openRecord).toBeTruthy();
    expect(uk.Crm.candidates.editDescription).toBeTruthy();
    expect(en.Crm.fields.interviewNotes).toBe("First impression");
    expect(uk.Crm.fields.interviewNotes).toBe("Перше враження");
  });

  it("keeps the editor focused on structured fields with one Save action", async () => {
    const [workspace, actions] = await Promise.all([
      readFile(workspacePath, "utf8"),
      readFile(new URL("../../app/(app)/crm/actions.ts", import.meta.url), "utf8"),
    ]);
    expect(workspace).toContain("function CandidateCycleFields");
    expect(workspace).toContain("saveCandidateEditor.bind(null, selected.id, latest.id)");
    expect(workspace).not.toContain("saveContact");
    expect(workspace).not.toContain("saveCycle");
    expect(workspace).not.toContain("internal_notes");
    expect(workspace).not.toContain("decision_notes");
    expect(actions).toContain("function saveCandidateEditor");
    expect(workspace).toContain('<Textarea className="resize-y" name="interview_notes" rows={3}');
    expect(workspace).toContain('<Textarea className="resize-y" name="test_task_result" rows={3}');
    expect(workspace).toContain('label={t("fields.interviewNotes")} value={cycle.interview_notes} multiline');
    expect(actions).toContain("interview_notes: nullable(value.interview_notes)");
    expect(actions).not.toContain("decision_notes: nullable");
  });
});
