import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("src/components/office/equipment-workspace.tsx", "utf8");
const form = readFileSync("src/components/office/equipment-form.tsx", "utf8");
const actions = readFileSync("src/app/(app)/office/equipment/actions.ts", "utf8");
const page = readFileSync("src/app/(app)/office/equipment/page.tsx", "utf8");
const query = readFileSync("src/data/queries/equipment.ts", "utf8");
const shell = readFileSync("src/components/office/office-shell.tsx", "utf8");
const cron = readFileSync("src/app/api/equipment/maintenance-notifications/route.ts", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");

describe("Equipment application flow", () => {
  it("keeps navigation and page loading admin-only", () => {
    expect(shell).toContain('{ href: "/office/equipment", key: "equipment", icon: MonitorCog, adminOnly: true }');
    expect(shell).toContain("tabs.filter((tab) => !tab.adminOnly || isAdmin)");
    expect(page).toContain("getActiveStudioAdmin()");
    expect(page).toContain('if (!admin) redirect("/office")');
    expect(query).toContain("getEquipmentData(admin: ActiveStudioMembership)");
  });

  it("provides workstation CRUD and employee assignment controls", () => {
    expect(actions).toContain("export async function createWorkstation");
    expect(actions).toContain("export async function updateWorkstation");
    expect(actions).toContain("export async function deleteWorkstation");
    expect(actions).toContain("assigned_employee_id: parsed.data.assignedEmployeeId");
    expect(workspace).toContain('name="assignedEmployeeId"');
    expect(workspace).toContain('<SelectItem value="__none">{t("workstation.unassigned")}</SelectItem>');
  });

  it("creates numbered workstations atomically with compact optional bulk assignment", () => {
    expect(actions).toContain("export async function createWorkstations");
    expect(actions).toContain('rpc("create_workstations"');
    expect(workspace).toContain('t("workstation.form.quantity")');
    expect(workspace).toContain('t("workstation.form.startingNumber")');
    expect(workspace).toContain('t("workstation.form.assignEmployees")');
    expect(workspace).toContain("data-quantity-stepper");
    expect(workspace).toContain("data-workstation-editor");
    expect(workspace).toContain('types: ["workstation-rows"]');
    expect(workspace).toContain('sticky top-0 z-10 hidden gap-3 border-b');
    expect(workspace).toContain('className="sm:sr-only"');
    expect(workspace).toContain('t("workstation.numberLabel", { number: item.number })');
    expect(workspace).toContain("editor.startViewTransition");
    expect(workspace).toContain("activeTransition.skipTransition()");
    expect(workspace).toContain("transition.ready.catch");
    expect(workspace).toContain("if (!expectedCancellation) reportError(reason)");
    expect(styles).toContain("[data-workstation-editor]:active-view-transition-type(workstation-rows)");
    expect(styles).not.toContain(":root:active-view-transition-type(workstation-rows)");
  });

  it("provides equipment CRUD, lifecycle changes, and persistent retired records", () => {
    expect(actions).toContain("export async function createEquipment");
    expect(actions).toContain("export async function updateEquipment");
    expect(actions).toContain("export async function deleteEquipment");
    expect(actions).toContain("display_name: equipmentDisplayName(input)");
    expect(actions).toContain("lifecycle_state: input.lifecycleState");
    expect(form).toContain("EQUIPMENT_LIFECYCLE_STATES.filter");
    expect(workspace).toContain('t(`states.${item.lifecycleState}`)');
    expect(workspace).not.toContain('item.lifecycleState === "retired" ? null');
    expect(form).toContain('name="displayName" maxLength={160}');
  });

  it("supports attach, detach, and reassignment without duplicating equipment", () => {
    expect(actions).toContain("export async function assignEquipment");
    expect(actions).toContain(".update({ workstation_id: parsed.data.workstationId })");
    expect(workspace).toContain("equipmentItem.workstationId !== item.id");
    expect(workspace).toContain("assignEquipment({ equipmentId, workstationId: null })");
    expect(workspace).toContain("assignEquipment({ equipmentId: attachId, workstationId })");
    expect(query).toContain("equipmentByWorkstation");
  });

  it("groups workstation equipment and progressively reveals computer specifications", () => {
    expect(workspace).toContain('t("groups.computers")');
    expect(workspace).toContain('t("groups.monitors")');
    expect(workspace).toContain('t("groups.peripherals")');
    expect(form).toContain('type === "laptop"');
    expect(form).toContain('name="pcConfiguration"');
    expect(form).toContain('CPU_FAMILIES[cpu.manufacturer]');
    expect(form).toContain('GPU_FAMILIES[gpu.vendor]');
    expect(form).toContain('config.drives.map');
  });

  it("keeps maintenance visible, notes optional, and configuration in one animated accordion", () => {
    expect(workspace).not.toContain('t("workstation.eyebrow")}</span><strong');
    expect(form).toContain('aria-expanded={isOpen}');
    expect(form).toContain('aria-controls={id}');
    expect(form).toContain('inert={!isOpen}');
    expect(form).toContain('ResizeObserver');
    expect(form).toContain('transition-[height,opacity]');
    expect(form).not.toContain('motion-reduce:transition-none');
    expect(form).toContain('openSection === key');
    expect(form).toContain('<fieldset className="shrink-0 rounded-');
    expect(form).toContain('<FormField className="w-full" label={t("form.notes")} optional');
  });

  it("uses caller-context Supabase mutations with explicit studio and record filters", () => {
    expect(actions.match(/getActiveStudioAdmin\(\)/g)?.length).toBeGreaterThanOrEqual(7);
    expect(actions).toContain('.eq("studio_id", admin.studio_id)');
    expect(actions).toContain("revalidatePath(\"/office/equipment\")");
    expect(actions).not.toContain("createAdminClient");
  });

  it("provides the recurring maintenance queue and guarded service workflow", () => {
    expect(workspace).toContain('"maintenance"');
    expect(workspace).toContain("getMaintenanceUrgency");
    expect(workspace).toContain("startEquipmentService");
    expect(workspace).toContain("completeEquipmentService");
    expect(workspace).toContain("recordEquipmentHistory");
    expect(form).toContain('name="recurringMaintenanceEnabled"');
    expect(query).toContain('from("equipment_service_events")');
    expect(actions.match(/getActiveStudioAdmin\(\)/g)?.length).toBeGreaterThanOrEqual(10);
    expect(actions).not.toContain("createAdminClient");
  });

  it("protects the idempotent notification worker with the existing cron secret pattern", () => {
    expect(cron).toContain("timingSafeEqual");
    expect(cron).toContain("process.env.CRON_SECRET");
    expect(cron).toContain('rpc("generate_equipment_maintenance_notifications")');
  });
});
