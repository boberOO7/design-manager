import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createFinanceReadFixture, financeSnapshot, recognitionSnapshot } from "../../tests/helpers/finance-readonly-fixture";
import { automaticLaborSql } from "../../tests/helpers/automatic-labor-fixture";
import type { Database } from "@/types/database.types";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
import { processAutomaticExpenses } from "./finance-automatic-expenses";

afterEach(() => vi.unstubAllEnvs());
describe.skipIf(process.env.FINANCE_READONLY_DB_TEST !== "1")("isolated Finance read/worker boundary", () => {
  it("keeps reads pure, scopes authorization and recognizes exactly once under concurrent worker runs", async () => {
    const fixture = await createFinanceReadFixture();
    const other = await createFinanceReadFixture();
    try {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", fixture.apiUrl);
      vi.stubEnv("SUPABASE_SECRET_KEY", fixture.serviceRoleKey);
      const service = createClient<Database>(fixture.apiUrl, fixture.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const admin = createClient<Database>(fixture.apiUrl, fixture.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const employee = createClient<Database>(fixture.apiUrl, fixture.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      expect((await admin.auth.signInWithPassword(fixture.admin)).error).toBeNull();
      expect((await employee.auth.signInWithPassword(fixture.employee)).error).toBeNull();
      const before = financeSnapshot(fixture.studioId), otherBefore = financeSnapshot(other.studioId);
      for (const read of [
        admin.rpc("prepare_finance_overview_fx_context", { p_studio_id: fixture.studioId }),
        admin.rpc("calculate_finance_forecast", { p_studio_id: fixture.studioId }),
        admin.rpc("get_finance_overview", { p_studio_id: fixture.studioId }),
        admin.rpc("get_finance_management_reporting", { p_studio_id: fixture.studioId }),
        admin.rpc("preview_finance_labor_activation", { p_studio_id: fixture.studioId, p_input: { effectiveFrom: fixture.today, capacityFrom: fixture.month } }),
      ]) expect((await read).error).toBeNull();
      expect(financeSnapshot(fixture.studioId)).toBe(before);
      expect((await employee.rpc("prepare_finance_automatic_expenses", { p_studio_id: fixture.studioId })).error?.message).toContain("finance_admin_required");
      expect((await admin.rpc("prepare_finance_automatic_expenses", { p_studio_id: other.studioId })).error?.message).toContain("finance_admin_required");
      expect((await admin.rpc("prepare_finance_automatic_expenses", {})).error?.message).toContain("finance_admin_required");
      expect(financeSnapshot(other.studioId)).toBe(otherBefore);

      const discovery = await service.rpc("prepare_finance_automatic_expenses", { p_studio_id: fixture.studioId });
      expect(discovery.error).toBeNull();
      const candidates = Array.isArray(discovery.data) ? discovery.data : [];
      const candidate = candidates.find(row => row && typeof row === "object" && !Array.isArray(row) && row.action === "recognize");
      expect(candidate).toBeTruthy();
      expect(recognitionSnapshot(fixture.studioId)).toBe("[]");
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || typeof candidate.sourceId !== "string" || typeof candidate.month !== "string" || typeof candidate.digest !== "string") throw new Error("Missing fixture candidate");
      const input = { p_studio_id: fixture.studioId, p_source_id: candidate.sourceId, p_month: candidate.month, p_digest: candidate.digest };
      expect((await employee.rpc("process_finance_automatic_expense", input)).error?.message).toContain("finance_admin_required");
      const foreignSource = await service.rpc("process_finance_automatic_expense", { ...input, p_studio_id: other.studioId });
      expect(foreignSource.error).toBeNull();
      expect(foreignSource.data).toBeNull();
      expect(financeSnapshot(other.studioId)).toBe(otherBefore);
      const concurrent = await Promise.all([processAutomaticExpenses(fixture.studioId), processAutomaticExpenses(fixture.studioId)]);
      // A concurrent preparation can invalidate an older source digest; that run
      // may reject stale work, but at least one must succeed and the ledger stays unique.
      expect(concurrent.reduce((sum, result) => sum + result.processed, 0)).toBeGreaterThanOrEqual(1);
      expect(concurrent.reduce((sum, result) => sum + result.failed, 0)).toBeLessThanOrEqual(1);
      expect(automaticLaborSql(`select count(*) from public.finance_recognition_entries where studio_id='${fixture.studioId}'`)).toBe("1");
      const ledger = recognitionSnapshot(fixture.studioId);
      expect(await processAutomaticExpenses(fixture.studioId)).toEqual({ processed: 0, failed: 0 });
      expect(recognitionSnapshot(fixture.studioId)).toBe(ledger);
      expect(financeSnapshot(other.studioId)).toBe(otherBefore);
      // Existing daily worker maintains payment coverage even before recognition is enabled.
      automaticLaborSql(`update public.finance_settings set recognition_start_month=null where studio_id='${other.studioId}'`);
      expect(await processAutomaticExpenses(other.studioId)).toEqual({ processed: 0, failed: 0 });
      expect(automaticLaborSql(`select count(*)>0 from public.finance_obligations where studio_id='${other.studioId}' and schedule_id='${other.scheduleId}'`)).toBe("t");
      expect(recognitionSnapshot(other.studioId)).toBe("[]");
    } finally { await fixture.dispose(); await other.dispose(); }
  }, 60_000);
});
