import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationNames = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();
const migrations = migrationNames.map((name) => readFileSync(resolve(migrationsDirectory, name), "utf8"));
const migration = readFileSync(resolve(migrationsDirectory, "20260728225825_stabilize_time_off_approval_and_notifications.sql"), "utf8");
const foundation = readFileSync(resolve(migrationsDirectory, "20260728153858_calendar_foundation.sql"), "utf8");
const insertPolicyFix = readFileSync(resolve(migrationsDirectory, "20260728171129_calendar_event_and_time_off_fixes.sql"), "utf8");
const notificationShapeFix = readFileSync(resolve(migrationsDirectory, "20260728224013_fix_notification_insert_shape.sql"), "utf8");

function functionSql(name: string): string {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = migration.indexOf(`revoke execute on function ${name}`, start);
  if (start < 0 || end < 0) throw new Error(`${name} was not found in the stabilization migration.`);
  return migration.slice(start, end);
}

describe("time-off stabilization migration contract", () => {
  it("is the only new consolidation migration and leaves historical trigger creation singular", () => {
    expect(migrationNames.at(-1)).toBe("20260728225825_stabilize_time_off_approval_and_notifications.sql");
    const history = migrations.join("\n");
    expect(history.match(/create trigger validate_time_off_request_before_write/g)).toHaveLength(1);
    expect(history.match(/create trigger notify_time_off_request_after_write/g)).toHaveLength(1);
  });

  it("keeps employee/admin insert initialization in the applied initializer and self-only policy", () => {
    expect(insertPolicyFix).toContain("create or replace function private.initialize_time_off_request_status()");
    expect(insertPolicyFix).toContain("new.status := 'approved'");
    expect(insertPolicyFix).toContain("new.status := 'pending'");
    expect(insertPolicyFix).toContain("create policy time_off_requests_insert_own");
    expect(insertPolicyFix).toContain("user_id = (select auth.uid())");
  });

  it("implements the complete update transition table and immutable fields", () => {
    const validation = functionSql("private.validate_time_off_request()");
    expect(validation).toContain("if old.status in ('approved', 'rejected') then");
    expect(validation).toContain("new.status <> 'cancelled'");
    expect(validation).toContain("new.status in ('approved', 'rejected')");
    expect(validation).toContain("if old.status = 'cancelled' then");
    expect(validation).toContain("Employees may only cancel their own pending request");
    expect(validation).toContain("Unsupported time-off status transition");
    for (const field of ["id", "studio_id", "user_id", "created_at", "request_type", "start_date", "end_date", "start_time", "end_time", "all_day", "private_note"]) {
      expect(validation).toContain(`new.${field} is distinct from old.${field}`);
    }
  });

  it("does not let an inactive owner block an admin update", () => {
    const validation = functionSql("private.validate_time_off_request()");
    const insertBranchEnd = validation.indexOf("return new;", validation.indexOf("if tg_op = 'INSERT'"));
    expect(validation.indexOf("Time-off user must be an active studio member")).toBeLessThan(insertBranchEnd);
    expect(validation.slice(insertBranchEnd + 1)).not.toContain("Time-off user must be an active studio member");
  });

  it("passes an enum-typed approval/rejection kind to create_notification", () => {
    const notification = functionSql("private.notify_time_off_request()");
    expect(notification).toContain("notification_kind public.notification_type");
    expect(notification).toContain("'time_off_request_approved'::public.notification_type");
    expect(notification).toContain("'time_off_request_rejected'::public.notification_type");
    expect(notification).toContain("perform private.create_notification(\n      notification_kind,");
  });

  it("keeps notifications actor-correct, recipient-safe, note-free, and transactional", () => {
    const notification = functionSql("private.notify_time_off_request()");
    expect(notification).toContain("select distinct member.user_id");
    expect(notification).toContain("member.is_active = true");
    expect(notification).toContain("profile.is_active = true");
    expect(notification).toContain("actor := new.reviewed_by");
    expect(notification).toContain("actor := (select auth.uid())");
    expect(notification).not.toContain("private_note");
    expect(notification).not.toContain("review_note");
    expect(notification).not.toContain("exception when others");
  });

  it("preserves RLS privacy and corrected ten-column notification insertion", () => {
    expect(foundation).toContain("create policy time_off_requests_select_own_or_admin");
    expect(foundation).toContain("create policy time_off_requests_update_own_or_admin");
    expect(foundation).not.toContain("with check (true)");
    expect(notificationShapeFix).toMatch(/insert into public\.notifications\s*\([\s\S]*?metadata[\s\S]*?\)\s*values\s*\([\s\S]*?coalesce\(p_metadata, '\{\}'::jsonb\)[\s\S]*?\);/);
  });

  it("hardens both shared client consumers against duplicate decisions", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/time-off-request-client.ts"), "utf8");
    const calendar = readFileSync(resolve(process.cwd(), "src/components/calendar/calendar-workspace.tsx"), "utf8");
    const administration = readFileSync(resolve(process.cwd(), "src/components/administration/administration-workspace.tsx"), "utf8");
    expect(client).toContain("/api/calendar/time-off/${encodeURIComponent(requestId)}");
    expect(calendar).toContain("updateTimeOffRequest(item.id, action, reviewNote)");
    expect(administration).toContain("updateTimeOffRequest(request.id, action, reviewNote)");
    expect(calendar).toContain("timeOffMutationInFlight.current");
    expect(administration).toContain("mutationInFlight.current");
    expect(calendar).toContain("catch { setError(\"The request could not be updated.\"); }");
    expect(administration).toContain("catch { setError(\"The request could not be updated.\"); }");
    expect(administration).toContain("const [reviewNote, setReviewNote]");
    expect(calendar).toContain("router.refresh()");
    expect(administration).toContain("applyAdministrationDecision(current, request)");
  });
});
