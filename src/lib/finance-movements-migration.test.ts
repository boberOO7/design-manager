import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("supabase/migrations/20260916221929_finance_actual_movements.sql","utf8");
describe("Finance ledger migration boundary",()=>{
  it("protects events and entries using strongest Finance authorization and caller-context views",()=>{
    expect(sql.match(/enable row level security/g)).toHaveLength(2);
    expect(sql.match(/security_invoker=true/g)).toHaveLength(2);
    expect(sql).toContain("private.is_finance_admin(p_studio_id)");
    expect(sql).toContain("unique(studio_id, request_id)");
    expect(sql).toContain("foreign key(studio_id,account_id,currency)");
    expect(sql).toContain("finance_history_immutable");
    expect(sql).not.toMatch(/grant (?:insert|update|delete|all)/i);
  });
});
