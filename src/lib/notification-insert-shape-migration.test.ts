import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const patchMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260728224013_fix_notification_insert_shape.sql"), "utf8");
const notificationsMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260728214907_in_app_notifications.sql"), "utf8");

function topLevelExpressions(sql: string): string[] {
  const expressions: string[] = [];
  let depth = 0;
  let expressionStart = 0;

  for (let index = 0; index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] === ")") depth -= 1;
    if (sql[index] === "," && depth === 0) {
      expressions.push(sql.slice(expressionStart, index).trim());
      expressionStart = index + 1;
    }
  }

  expressions.push(sql.slice(expressionStart).trim());
  return expressions.filter(Boolean);
}

function insertParts(sql: string): { columns: string[]; values: string[] } {
  const match = /insert into public\.notifications\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\);/.exec(sql);
  if (!match?.[1] || !match[2]) throw new Error("Notification INSERT was not found.");
  return {
    columns: topLevelExpressions(match[1]),
    values: topLevelExpressions(match[2]),
  };
}

describe("notification INSERT shape patch", () => {
  it("uses exactly ten target columns and ten values", () => {
    const { columns, values } = insertParts(patchMigration);
    expect(columns).toEqual([
      "studio_id", "recipient_id", "actor_id", "notification_type", "title",
      "body", "href", "entity_type", "entity_id", "metadata",
    ]);
    expect(values).toEqual([
      "p_studio_id", "p_recipient_id", "p_actor_id", "p_notification_type", "bounded_title",
      "bounded_body", "p_href", "p_entity_type", "p_entity_id", "coalesce(p_metadata, '{}'::jsonb)",
    ]);
  });

  it("preserves recipient, self-notification, and generated-text hardening", () => {
    expect(patchMigration).toContain("if p_recipient_id is null or p_recipient_id = p_actor_id then");
    expect(patchMigration).toContain("and member.is_active");
    expect(patchMigration).toContain("and profile.is_active");
    expect(patchMigration).toContain("bounded_title := left(p_title, 160)");
    expect(patchMigration).toContain("bounded_body := left(p_body, 500)");
    expect(patchMigration).toContain("set search_path = ''");
    expect(patchMigration).toContain("from public, anon, authenticated");
  });

  it("notifies each active administrator once for an employee pending request", () => {
    expect(notificationsMigration).toContain("if tg_op = 'INSERT' and new.status = 'pending' then");
    expect(notificationsMigration).toContain("select distinct member.user_id");
    expect(notificationsMigration).toContain("and member.system_role = 'admin'");
    expect(notificationsMigration).toContain("member.is_active and profile.is_active");
    expect(notificationsMigration).toContain("'time_off_request_submitted'");
  });

  it("does not swallow a notification failure into a duplicate source insert", () => {
    expect(notificationsMigration).toContain("after insert or update on public.time_off_requests");
    expect(notificationsMigration).not.toContain("exception when others");
  });
});
