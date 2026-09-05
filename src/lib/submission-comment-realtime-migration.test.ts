import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260905154439_enable_submission_comment_realtime.sql", "utf8");
const submissionsMigration = readFileSync("supabase/migrations/20260904120000_internal_submissions.sql", "utf8");

describe("submission comment realtime migration", () => {
  it("publishes only the existing comments table and remains safe if it was enabled manually", () => {
    expect(migration).toContain("pg_publication_tables");
    expect(migration).toContain("alter publication supabase_realtime add table public.submission_comments");
    expect(migration).not.toMatch(/submission_reactions|submission_admin_details/);
  });

  it("retains the existing request-scoped RLS visibility boundary", () => {
    expect(submissionsMigration).toContain("alter table public.submission_comments enable row level security");
    expect(submissionsMigration).toContain("create policy submission_comments_select_authorized");
    expect(submissionsMigration).toContain("private.can_access_submission(submission_id)");
  });
});
