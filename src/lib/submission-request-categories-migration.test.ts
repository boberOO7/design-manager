import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260905205045_add_submission_request_categories.sql", "utf8");

describe("submission request categories migration", () => {
  it("adds a nullable compatibility column constrained to request categories", () => {
    expect(migration).toContain("add column request_category text");
    expect(migration).toContain("request_category is null or request_category in ('equipment', 'office', 'software', 'other')");
    expect(migration).toContain("type <> 'request' and request_category is null");
    expect(migration).not.toContain("alter column request_category set not null");
  });

  it("requires categories through the guarded creation RPC without changing RLS", () => {
    expect(migration).toContain("drop function public.create_submission(public.submission_type, text, text, boolean)");
    expect(migration).toContain("request_category_required");
    expect(migration).toContain("request_category_not_applicable");
    expect(migration).toContain("grant execute on function public.create_submission(public.submission_type, text, text, boolean, text) to authenticated");
    expect(migration).not.toMatch(/create policy|drop policy|disable row level security/i);
  });
});
