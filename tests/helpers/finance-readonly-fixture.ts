import { randomUUID } from "node:crypto";
import { createAutomaticLaborFixture, automaticLaborSql } from "./automatic-labor-fixture";
import { getKyivDateOnly } from "../../src/lib/validation/project";

export async function createFinanceReadFixture(recognitionEnabled = true) {
  const today = getKyivDateOnly(), month = `${today.slice(0, 7)}-01`;
  const fixture = await createAutomaticLaborFixture({ periodStart: month, setupPending: true });
  const scheduleId = randomUUID();
  try {
    // Deliberately leave occurrences unmaterialized: reads must not create them.
    automaticLaborSql(`insert into public.finance_schedules(id,studio_id,kind,created_by)
      values('${scheduleId}','${fixture.studioId}','recurring','${fixture.admin.id}');
      insert into public.finance_schedule_terms(id,studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,commitment,certainty,reason,created_by)
      values('${randomUUID()}','${fixture.studioId}','${scheduleId}',1,'Read boundary eligible service',3100,'UAH',
        (select id from public.finance_categories where studio_id='${fixture.studioId}' and default_key='rent'),1,31,0,date '${month}',
        'agreed','fixed','Isolated read boundary test','${fixture.admin.id}');
      ${recognitionEnabled ? "" : `update public.finance_settings set recognition_start_month=null where studio_id='${fixture.studioId}';`}`);
    return { ...fixture, today, month, scheduleId, dispose: async () => {
      automaticLaborSql(`begin; set local session_replication_role=replica;
        delete from public.finance_expense_service_policies where studio_id='${fixture.studioId}'; commit;`);
      await fixture.dispose();
    } };
  } catch (error) { await fixture.dispose(); throw error; }
}

/** Compare every persisted Finance row belonging to this fixture, including audit/valuation. */
export function financeSnapshot(studioId: string) {
  if (!/^[0-9a-f-]{36}$/.test(studioId)) throw new Error("Invalid fixture studio");
  return automaticLaborSql(`do $$declare t record; rows jsonb; snapshot jsonb:='{}'; begin
    for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname like 'finance_%'
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='studio_id' and not a.attisdropped) order by c.relname loop
      execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r where studio_id=$1',t.relname) into rows using '${studioId}'::uuid;
      snapshot:=snapshot||jsonb_build_object(t.relname,rows);
    end loop;
    perform set_config('test.finance_snapshot',md5(snapshot::text),false);
  end $$; select current_setting('test.finance_snapshot');`);
}

export function recognitionSnapshot(studioId: string) {
  return automaticLaborSql(`select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.finance_recognition_entries r where studio_id='${studioId}'`);
}
