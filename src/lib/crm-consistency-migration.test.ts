import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260914100625_align_crm_candidate_and_lead_invariants.sql", import.meta.url),
  "utf8",
);
const typedInputsMigration = readFileSync(
  new URL("../../supabase/migrations/20260914101809_type_crm_candidate_rpc_optional_inputs.sql", import.meta.url),
  "utf8",
);

describe("CRM consistency migration", () => {
  it("guards atomic Candidate create and update RPCs", () => {
    expect(migration).toContain("create_crm_candidate_with_cycle");
    expect(migration).toContain("update_crm_candidate_with_cycle");
    expect(migration).toContain("private.is_active_crm_admin(v_studio_id)");
    expect(migration).toContain("for update");
    expect(migration).toContain("coalesce(completed_at, now())");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
    expect(typedInputsMigration).toContain("nullif(btrim(p_responsible_admin_id), '')::uuid");
    expect(typedInputsMigration).toContain("nullif(btrim(p_outcome), '')::public.recruiting_outcome");
  });

  it("normalizes and constrains linked Lead status", () => {
    expect(migration).toContain("where project_id is not null");
    expect(migration).toContain("check (project_id is null or status = 'won')");
  });
});
