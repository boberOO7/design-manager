import { z } from "zod";
import { afterAll, beforeAll, expect, it } from "vitest";
import { automaticLaborSql, createAutomaticLaborFixture } from "../../../tests/helpers/automatic-labor-fixture";
import { sqlId } from "../../../tests/helpers/task-review-fixture";

let fixture: Awaited<ReturnType<typeof createAutomaticLaborFixture>>;
beforeAll(async () => { fixture = await createAutomaticLaborFixture(); }, 60_000);
afterAll(async () => { if (fixture) await fixture.dispose(); });

it("normalizes internal time without allocating it to a project or direct labor", () => {
  const { studioId, employee, taskId, projectId, obligationId } = fixture;
  // A salaried administrator still uses the existing capacity calculation.
  automaticLaborSql(`update public.studio_members set system_role='admin' where studio_id=${sqlId(studioId)} and user_id=${sqlId(employee.id)};`);
  function save(taskMinutes: number, internalMinutes: number) {
    const entries = [
      ...(taskMinutes ? [{ activity_kind: "task", task_id: taskId, review_round_id: null, minutes: taskMinutes }] : []),
      ...(internalMinutes ? [{ activity_kind: "internal", internal_activity_type: "team_walkthrough", task_id: null, review_round_id: null, minutes: internalMinutes }] : []),
    ];
    automaticLaborSql(`select set_config('request.jwt.claim.sub',${sqlId(employee.id)}::text,false);
      select public.save_daily_work_log('2026-08-03','${JSON.stringify(entries)}'::jsonb);`);
  }
  function shares() {
    return z.record(z.uuid(), z.number()).parse(JSON.parse(automaticLaborSql(`select private.finance_automatic_labor_basis_at_fx(${sqlId(studioId)},${sqlId(obligationId)},null)->'shares';`)));
  }
  save(360, 0);
  expect(shares()).toEqual({ [projectId]: 360 });
  save(360, 360);
  expect(shares()).toEqual({ [projectId]: 180 }); // Same rule as internal-project time.
  save(180, 180);
  expect(shares()).toEqual({ [projectId]: 180 }); // Capacity is still the minimum denominator.
  save(0, 360);
  expect(shares()).toEqual({});
});
