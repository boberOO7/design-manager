import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { automaticLaborSql, concurrentAutomaticLaborRetry, createAutomaticLaborFixture } from "../helpers/automatic-labor-fixture";

test("simultaneous automatic labor retries share one calculation and stay within confirmed cost", async () => {
  test.setTimeout(90_000);
  const fixture = await createAutomaticLaborFixture();
  try {
    automaticLaborSql(`set role authenticated; select set_config('request.jwt.claim.sub','${fixture.employee.id}'::text,false);
      select public.save_daily_work_log(date '2026-08-03',jsonb_build_array(
        jsonb_build_object('activity_kind','task','task_id','${fixture.taskId}'::uuid,'minutes',120))); reset role;`);
    const digest = automaticLaborSql(`select private.finance_automatic_labor_basis('${fixture.studioId}'::uuid,'${fixture.obligationId}'::uuid)->>'digest'`);
    const requestId = randomUUID();
    const results = await concurrentAutomaticLaborRetry({
      apiUrl: fixture.apiUrl,
      serviceRoleKey: fixture.serviceRoleKey,
      admin: fixture.admin,
      studioId: fixture.studioId,
      obligationId: fixture.obligationId,
      digest,
      requestId,
    });

    expect(results[0]).toBeTruthy();
    expect(results[1]).toBe(results[0]);
    expect(automaticLaborSql(`select count(*) from public.finance_planning_requests where studio_id='${fixture.studioId}'::uuid
      and request_id='${requestId}'::uuid`)).toBe("1");
    expect(automaticLaborSql(`select count(*) from public.finance_labor_calculations where studio_id='${fixture.studioId}'::uuid
      and obligation_id='${fixture.obligationId}'::uuid`)).toBe("1");
    expect(automaticLaborSql(`select count(*) from public.finance_labor_allocation_revisions r
      join public.finance_labor_cost_pools p on p.id=r.entry_id where p.studio_id='${fixture.studioId}'::uuid
      and p.obligation_id='${fixture.obligationId}'::uuid`)).toBe("1");
    expect(automaticLaborSql(`select count(*) from public.finance_recognition_entries where studio_id='${fixture.studioId}'::uuid
      and obligation_id='${fixture.obligationId}'::uuid and kind='recognition'`)).toBe("1");
    expect(automaticLaborSql(`select sum(i.amount)<=1000 from public.finance_current_labor_allocations i
      join public.finance_labor_cost_pools p on p.id=i.entry_id where p.studio_id='${fixture.studioId}'::uuid
      and p.obligation_id='${fixture.obligationId}'::uuid`)).toBe("t");
  } finally {
    await fixture.dispose();
  }
});
