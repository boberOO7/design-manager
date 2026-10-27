import { beforeEach, expect, it, vi } from "vitest";
import { getProjectStageConfiguration } from "./project-stage-columns";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
const custom = "custom_12345678-1234-1234-1234-123456789abc";
const row = { stage: custom, display_name: "Custom work", is_enabled: true, display_order: 1, kind: "work", progress_weight: 3, enabled_statuses: ["todo", "in_progress", "completed"], progress_method: "weighted", schedule_paused_on: null, schedule_pause_reason: null };
const snapshot = { version: 9, includeInProductivity: false, showProgress: true, rows: [row] };
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: snapshot, error: null }); });

it("loads dynamic stages and version from one snapshot without resurrecting removed legacy stages", async () => {
  const result = await getProjectStageConfiguration("project");
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_project_stage_configuration", { p_project_id: "project" });
  expect(result).toEqual({ version: 9, includeInProductivity: false, showProgress: true,
    stages: [{ stage: custom, displayName: "Custom work", isEnabled: true, displayOrder: 1, kind: "work", progressWeight: 3 }],
    columns: { [custom]: ["todo", "in_progress", "completed"] }, progressMethods: { [custom]: "weighted" }, schedulePause: { [custom]: null },
  });
});
it("retains additional-stage scheduling settings", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...snapshot, rows: [{ ...row, kind: "additional", schedule_paused_on: "2026-10-01", schedule_pause_reason: "waiting_for_client" }] }, error: null });
  const result = await getProjectStageConfiguration("project");
  expect(result.stages[0].kind).toBe("additional");
  expect(result.schedulePause[custom]).toEqual({ startedOn: "2026-10-01", reason: "waiting_for_client" });
});
it("fails closed for missing projects and unsupported stage metadata", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  await expect(getProjectStageConfiguration("project")).rejects.toThrow("Unable to load");
  mocks.rpc.mockResolvedValue({ data: { ...snapshot, rows: [{ ...row, kind: "unknown" }] }, error: null });
  await expect(getProjectStageConfiguration("project")).rejects.toThrow("Unable to load");
});
