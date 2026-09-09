import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

const workspacePath = new URL("./leads-workspace.tsx", import.meta.url);
const metadataControlsPath = new URL("../projects/project-metadata-controls.tsx", import.meta.url);
const cityComboboxPath = new URL("../projects/city-combobox.tsx", import.meta.url);
const projectFormPath = new URL("../projects/project-form.tsx", import.meta.url);

describe("CRM leads workspace contract", () => {
  it("reuses Project metadata controls and defaults new lead location to Ukraine", async () => {
    const [workspace, controls] = await Promise.all([readFile(workspacePath, "utf8"), readFile(metadataControlsPath, "utf8")]);
    expect(workspace).toContain("ProjectCountrySelect");
    expect(workspace).toContain("ProjectTypeSelect");
    expect(workspace).toContain("<CityCombobox");
    expect(controls).toContain('defaults.countryCode ?? "UA"');
    expect(controls).toContain('if (value !== "other") setProjectTypeCustom("")');
  });

  it("opens an accessible row into detail before editing", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain('aria-label={t("leads.openRecord"');
    expect(workspace).toContain('type="button"');
    expect(workspace).toContain("isNestedInteractiveTarget");
    expect(workspace).toContain('setView("detail")');
    expect(workspace).toContain('setView("edit")');
    expect(workspace).toContain("<LeadDetail");
  });

  it("keeps contact actions in detail and delete in a confirmed overflow action", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("mailto:");
    expect(workspace).toContain("tel:");
    expect(workspace).toContain("<Popover.Root");
    expect(workspace).toContain("window.confirm");
    expect(workspace).toContain("headerActions=");
    expect(workspace).toContain("<History");
    expect(workspace).not.toContain("<footer");
    expect(workspace).not.toContain("ExternalLink");
  });

  it("edits status directly and opens lifecycle history outside the detail body", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("updateLeadStatus");
    expect(workspace).toContain("loadLeadHistory");
    expect(workspace).toContain('setView("history")');
    expect(workspace).toContain("<LeadHistoryPanel");
    expect(workspace).not.toContain('name="status"');
  });

  it("explains when a follow-up date cannot schedule a reminder", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("!lead.responsible_admin_id ?");
    expect(en.Crm.reminder.needsResponsible).toBeTruthy();
    expect(uk.Crm.reminder.needsResponsible).toBeTruthy();
  });

  it("uses aligned shared city and date controls in the Lead form", async () => {
    const [workspace, cityCombobox, projectForm] = await Promise.all([
      readFile(workspacePath, "utf8"),
      readFile(cityComboboxPath, "utf8"),
      readFile(projectFormPath, "utf8"),
    ]);
    expect(cityCombobox).toContain('cn("relative", className)');
    expect(projectForm).toContain('<CityCombobox className="mt-2"');
    expect(workspace).toContain('<DatePicker name="first_contact_date"');
    expect(workspace).toContain('<DatePicker name="next_contact_date"');
    expect(workspace).not.toContain('name="first_contact_date" label={t("fields.firstContact")} type="date"');
  });

  it("uses localized source options and icon-led detail fields", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("CRM_LEAD_SOURCE_KEYS.map");
    expect(workspace).toContain('source === "other"');
    expect(workspace).toContain('name="source_custom"');
    for (const icon of ["Building2", "CircleDot", "Mail", "Phone", "Megaphone", "UserRound", "Shapes", "MapPin", "Ruler", "Banknote", "CalendarDays", "FileText", "StickyNote"]) {
      expect(workspace).toContain(`icon={${icon}}`);
    }
    expect(workspace).toContain("text-[var(--ui-text)]");
    expect(workspace).toContain("text-[var(--ui-text-muted)]");
    const expectedKeys = ["notSpecified", "website", "instagram", "referral", "partner", "other"];
    expect(Object.keys(en.Crm.sourceOptions)).toEqual(expectedKeys);
    expect(Object.keys(uk.Crm.sourceOptions)).toEqual(expectedKeys);
    expect(Object.values(en.Crm.sourceOptions).every(Boolean)).toBe(true);
    expect(Object.values(uk.Crm.sourceOptions).every(Boolean)).toBe(true);
  });

  it("reuses the Project form for atomic Lead conversion and aligns field values under labels", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("<ProjectForm action={createProjectFromLead.bind(null, lead.id)}");
    expect(workspace).toContain("getLeadProjectDefaults(lead, defaultStartDate)");
    expect(workspace).toContain("client_name: lead.client_name");
    expect(workspace).toContain("description: lead.request_description ?? undefined");
    expect(workspace).toContain('if (lead.status === "lost") return null');
    expect(workspace).toContain("function LeadProjectAction");
    expect(workspace).toContain("if (lead.project_id)");
    expect(workspace).toContain("ml-[1.625rem]");
    expect(workspace).not.toContain('className="mt-0.5 size-4 text-[var(--ui-text-muted)]"');
    expect(en.Crm.conversion.action).toBeTruthy();
    expect(uk.Crm.conversion.action).toBeTruthy();
    expect(Object.keys(en.Crm.conversion).sort()).toEqual(Object.keys(uk.Crm.conversion).sort());
    expect(Object.keys(en.Crm.history).sort()).toEqual(Object.keys(uk.Crm.history).sort());
    expect(uk.Crm.leadStatus.won).toBe("Виграно");
  });

  it("keeps Project actions in the header and uses structured contact and budget inputs", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    const headerStart = workspace.indexOf("function LeadHeaderActions");
    const detailStart = workspace.indexOf("function LeadDetail");
    const header = workspace.slice(headerStart, detailStart);
    const detail = workspace.slice(detailStart, workspace.indexOf("function LeadHistoryPanel"));
    expect(header).toContain('<LeadProjectAction lead={lead} onConvert={() => onConvert()} presentation="header" />');
    expect(header).toContain('t("conversion.openProject")');
    expect(header).toContain('t("conversion.action")');
    expect(detail).not.toContain('t("conversion.openProject")');
    expect(detail).not.toContain('t("conversion.action")');
    expect(workspace).toContain("<PhoneInput");
    expect(workspace).toContain('autoComplete="off"');
    expect(workspace).toContain('name="budget_amount"');
    expect(workspace).toContain('name="budget_currency"');
    expect(Object.keys(en.Crm.fields).sort()).toEqual(Object.keys(uk.Crm.fields).sort());
  });

  it("reuses the detail conversion action from the Leads table without opening the record", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    const table = workspace.slice(workspace.indexOf("<table"), workspace.indexOf("</table>"));
    const projectAction = workspace.slice(workspace.indexOf("function LeadProjectAction"), workspace.indexOf("function LeadDetail"));
    expect(table).toContain('<LeadProjectAction lead={item} onConvert={openConversion} presentation="table" />');
    expect(table).toContain('text-right"><span className="sr-only">{t("recordActions")}</span>');
    expect(workspace).toContain('function openConversion(item: CrmLead)');
    expect(workspace).toContain('setView("convert")');
    expect(projectAction).toContain('if (lead.project_id)');
    expect(projectAction).toContain('if (lead.status === "lost") return null');
    expect(projectAction).toContain('event.stopPropagation()');
    expect(projectAction).toContain('href={`/projects/${lead.project_id}`}');
  });

  it("keeps browser autofill out of Lead contact fields and uses a compact themed currency trigger", async () => {
    const [workspace, actionForm, cityCombobox] = await Promise.all([
      readFile(workspacePath, "utf8"),
      readFile(new URL("./action-form.tsx", import.meta.url), "utf8"),
      readFile(cityComboboxPath, "utf8"),
    ]);
    expect(actionForm).toContain('autoComplete="off"');
    expect(workspace).toContain('<TextField name="email" label={t("fields.email")} type="email" autoComplete="off"');
    expect(workspace).toContain('<PhoneInput autoComplete="off"');
    expect(cityCombobox).toContain('autoComplete="off"');
    expect(workspace).toContain('contentMinWidth="natural"');
    expect(workspace).toContain('min-w-0 flex-1 rounded-r-none');
    expect(workspace).toContain('data-currency-code className="text-[var(--ui-text-muted)]"');
    expect(workspace).not.toContain('[&_[data-currency-code]]:hidden');
    expect(workspace).toContain('bg-[var(--ui-action-primary)]');
    expect(workspace).toContain('text-[var(--ui-action-primary-text)]');
  });

  it("renders responsible administrators with the shared avatar Select pattern", async () => {
    const [fields, crmQuery] = await Promise.all([
      readFile(new URL("./crm-fields.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../data/queries/crm.ts", import.meta.url), "utf8"),
    ]);
    expect(fields).toContain('import { UserAvatar } from "@/components/ui/user-avatar"');
    expect(fields).toContain('textValue={admin.name}');
    expect(fields).toContain('imageUrl={admin.avatar_url}');
    expect(fields).toContain('size="boardCard"');
    expect(fields).toContain('<SelectItem value="">{emptyLabel}</SelectItem>');
    expect(crmQuery).toContain("full_name, avatar_url");
    expect(crmQuery).toContain("avatar_url: row.profile.avatar_url");
  });
});
