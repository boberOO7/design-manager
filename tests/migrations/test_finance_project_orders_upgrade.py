"""Run with python3 tests/migrations/test_finance_project_orders_upgrade.py.

Requires the running local Supabase container. Replays the actual pre-order
migrations and applies the exact order migration in a disposable database.
Only Supabase-owned schema definitions are copied; development data is untouched.
"""

from pathlib import Path
import subprocess
import uuid


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase/migrations"
TARGET = MIGRATIONS / "20261004223225_finance_project_orders.sql"
CONTAINER = "supabase_db_design-manager"


def docker(*args, input=None):
    return subprocess.run(
        ["docker", "exec", "-i", CONTAINER, *args],
        input=input, text=True, capture_output=True, check=True,
    ).stdout


def sql(database, statement):
    return docker(
        "psql", "-X", "-U", "postgres", "-d", database,
        "-v", "ON_ERROR_STOP=1", "-qAt", input=statement,
    )


SEED = """
begin;
do $$ begin
  assert to_regclass('public.finance_project_orders') is null, 'test requires the real pre-order schema';
end $$;
create function pg_temp.fid(n integer) returns uuid language sql immutable as
$$select ('7a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.today() returns date language sql stable as $$select (now() at time zone 'Europe/Kyiv')::date$$;
create function pg_temp.month() returns date language sql stable as $$select date_trunc('month',pg_temp.today())::date$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'Order upgrade');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values(pg_temp.fid(10),'authenticated','authenticated','order-upgrade@test','{}','{}');
insert into public.profiles(id,full_name,email,system_role,is_active)
values(pg_temp.fid(10),'Order upgrade','order-upgrade@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active)
values(pg_temp.fid(1),pg_temp.fid(10),'admin',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'UAH','2026-01-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(20),pg_temp.fid(1),'USD bank','USD',0,pg_temp.fid(10));
insert into public.projects(id,studio_id,name,total_area_m2,start_date,created_by,status)
values(pg_temp.fid(30),pg_temp.fid(1),'123 Interior',100,'2026-01-01',pg_temp.fid(10),'active'),
  (pg_temp.fid(31),pg_temp.fid(1),'No commercial history',100,'2026-01-01',pg_temp.fid(10),'active');
create function pg_temp.cat(key text) returns uuid language sql stable as
$$select id from public.finance_categories where studio_id=pg_temp.fid(1) and default_key=key$$;
create function pg_temp.result(n integer) returns uuid language sql stable as
$$select result_id from public.finance_planning_requests where studio_id=pg_temp.fid(1) and request_id=pg_temp.fid(n)$$;
create function pg_temp.item(label text) returns uuid language sql stable as
$$select id from public.finance_expected_items where studio_id=pg_temp.fid(1) and description=label$$;
create function pg_temp.proposal(request integer,bytes text) returns uuid language plpgsql security definer set search_path='' as $$
declare source jsonb;
begin
  source:=public.get_finance_proposal_source(pg_temp.fid(1),pg_temp.fid(30));
  return public.save_finance_project_proposal(pg_temp.fid(1),pg_temp.fid(30),pg_temp.fid(request),source,
    jsonb_build_object('projectTitle',source->>'projectTitle','clientName',source->>'clientName','contact',source->>'contact',
      'address',source->>'address','intro','Original proposal','studioContacts','Historical contacts'),
    encode(convert_to(bytes,'UTF8'),'base64'),pg_temp.fid(10));
end $$;
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select public.save_finance_project_plan(pg_temp.fid(1),pg_temp.fid(100),pg_temp.fid(30),jsonb_build_object(
  'revision',0,'pricingMethod','area','area','100','rate','10','amount','1000','currency','USD','reason','Accepted interior design',
  'discountType','fixed','discountValue','100','vatRate','20','priceBasis','net','revenueTaxRate','6',
  'known','[]'::jsonb,'allowUnscheduled',false,'items',jsonb_build_array(
    jsonb_build_object('id','','name','Advance','amount','300','dueDate',pg_temp.today(),'percentage','33.3333','clientNote','Original note'),
    jsonb_build_object('id','','name','Stage 2','amount','300','dueDate',pg_temp.today(),'percentage','33.3333'),
    jsonb_build_object('id','','name','Final','amount','300','dueDate',pg_temp.today(),'percentage','33.3334'))));
select pg_temp.proposal(110,'%PDF-legacy-one');
select public.activate_finance_recognition(pg_temp.fid(1),pg_temp.fid(120),pg_temp.month());
select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(121),jsonb_build_object('sourceKind','project_terms',
  'sourceId',pg_temp.result(100),'classification','revenue','projectId',pg_temp.fid(30),'amount','100',
  'date',pg_temp.today(),'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),'description','Accepted interior work','reason','Earned value',
  'fx',jsonb_build_object('rate','42','source','manual','effectiveDate',pg_temp.today())));
select public.record_finance_recognition(pg_temp.fid(1),pg_temp.fid(122),jsonb_build_object('sourceKind','expected',
  'sourceId',pg_temp.item('Advance'),'classification','revenue','projectId',pg_temp.fid(30),'amount','50',
  'date',pg_temp.today(),'periodStart',pg_temp.month(),'periodEnd',pg_temp.today(),'description','Earned advance work','reason','Economic fact',
  'fx',jsonb_build_object('rate','41.5','source','manual','effectiveDate',pg_temp.today())));
select public.adjust_finance_recognition(pg_temp.fid(1),pg_temp.fid(123),pg_temp.result(122),jsonb_build_object(
  'operation','adjustment','amount','10','date',pg_temp.today(),'reason','Historical correction'));
select public.record_finance_expected_payment(pg_temp.fid(1),pg_temp.fid(130),pg_temp.item('Advance'),jsonb_build_object(
  'kind','incoming','date',pg_temp.today(),'amount','100','accountId',pg_temp.fid(20),'categoryId',pg_temp.cat('project_payments'),
  'fx',jsonb_build_object('rate','42.25','source','manual','effectiveDate',pg_temp.today())),100);
select public.close_finance_expected_remainder(pg_temp.fid(1),pg_temp.fid(131),pg_temp.item('Advance'),pg_temp.today(),
  'client_agreement','Historical closure',260);
select public.cancel_finance_project_expectation(pg_temp.fid(1),pg_temp.fid(132),jsonb_build_object('itemId',pg_temp.item('Stage 2'),
  'version',(select version from public.finance_expected_items where id=pg_temp.item('Stage 2')),'settledAmount','0','reason','Unpaid stage canceled'));
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(140),pg_temp.fid(30),jsonb_build_object(
  'stream','design','mode','design','revision',1,'amount','1200','currency','USD','reason','Price amendment',
  'discountType','fixed','discountValue','100','vatRate','20','priceBasis','net','revenueTaxRate','6'));
select pg_temp.proposal(141,'%PDF-legacy-two');
select public.save_finance_project_terms(pg_temp.fid(1),pg_temp.fid(150),pg_temp.fid(30),jsonb_build_object(
  'stream','supervision','mode','monthly','revision',0,'amount','100','currency','UAH','effectiveFrom',pg_temp.month(),'reason','Supervision agreement'));
reset role;
-- Capture complete history rows and exact native-currency totals before upgrade.
create temporary table original_history(table_name text primary key,snapshot jsonb not null);
do $$ declare table_name text; snapshot jsonb; begin
  foreach table_name in array array['finance_project_terms','finance_project_items','finance_project_proposals',
    'finance_project_plan_revisions','finance_expected_items','finance_allocations','finance_movements','finance_movement_entries',
    'finance_recognition_entries','finance_planning_requests','finance_settlement_adjustments','finance_project_totals'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',table_name) into snapshot;
    insert into original_history values(table_name,snapshot);
  end loop;
end $$;
create function pg_temp.assert_immutable(statement text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when raise_exception then
    if sqlerrm='finance_history_immutable' then return; end if;
    raise;
  end;
  raise exception 'Expected finance_history_immutable: %',statement;
end $$;
"""

VERIFY = """
do $$ declare original record; current_snapshot jsonb; strip_keys text[]; begin
  assert (select count(*)=1 from public.finance_project_orders), 'one existing project, one initial order';
  assert (select name='Основне замовлення' and is_default and status='confirmed' and project_id=pg_temp.fid(30)
    from public.finance_project_orders), 'legacy agreement becomes the confirmed default';
  assert not exists(select 1 from public.finance_project_orders where project_id=pg_temp.fid(31)), 'empty project remains empty';
  assert (select count(*)=2 and count(distinct order_id)=1 from public.finance_project_terms where stream='design'), 'entire terms chain attached';
  assert not exists(select 1 from public.finance_project_terms where stream='supervision' and order_id is not null), 'supervision remains project-level';
  assert (select count(*)=3 and count(distinct order_id)=1 from public.finance_project_items where stream='design'), 'all payments including canceled history attached';
  assert (select count(*)=2 and count(distinct order_id)=1 from public.finance_project_proposals), 'all proposals attached';
  for original in select * from original_history loop
    strip_keys:=case when original.table_name in ('finance_project_terms','finance_project_items','finance_project_proposals')
      then array['order_id']::text[] else array[]::text[] end;
    execute format('select coalesce(jsonb_agg(to_jsonb(r)-$1 order by (to_jsonb(r)-$1)::text),''[]''::jsonb) from public.%I r',original.table_name)
      into current_snapshot using strip_keys;
    assert current_snapshot=original.snapshot, 'historical rows/IDs/amounts/snapshots/bytes unchanged: '||original.table_name;
  end loop;
  assert (select amount=100 and fx_rate=42.25 and reporting_amount=4225 from public.finance_movement_entries), 'historical receipt FX intact';
  assert (select count(*)=3 from public.finance_recognition_entries), 'recognition and adjustment lineage unchanged';
  assert not exists(select 1 from public.finance_recognition_entries where source_snapshot ? 'order_id'), 'recognition snapshot never rewritten';
  assert (select count(*)=3 from pg_trigger where tgrelid in ('public.finance_project_terms'::regclass,'public.finance_project_items'::regclass,
    'public.finance_project_proposals'::regclass) and tgname in ('finance_project_terms_immutable','finance_project_items_immutable','finance_proposal_immutable')
    and tgenabled='O'), 'all commercial immutability triggers restored';
end $$;
select pg_temp.assert_immutable('update public.finance_project_terms set reason=''rewrite''');
select pg_temp.assert_immutable('update public.finance_project_items set context_label=''rewrite''');
select pg_temp.assert_immutable('update public.finance_project_proposals set pdf=convert_to(''%PDF-rewrite'',''UTF8'')');
select pg_temp.assert_immutable('delete from public.finance_project_proposals');
select pg_temp.assert_immutable('update public.finance_allocations set reason=''rewrite''');
select pg_temp.assert_immutable('delete from public.finance_recognition_entries');
rollback;
"""

ORPHAN_PAYMENT = """
insert into public.finance_expected_items(id,studio_id,direction,amount,currency,category_id,description,commitment,certainty,created_by)
values(pg_temp.fid(900),pg_temp.fid(1),'incoming',1,'USD',pg_temp.cat('project_payments'),'Orphan commercial payment','agreed','fixed',pg_temp.fid(10));
insert into public.finance_project_items(studio_id,expected_item_id,project_id,stream)
values(pg_temp.fid(1),pg_temp.fid(900),pg_temp.fid(31),'design');
"""

ORPHAN_PROPOSAL = """
insert into public.finance_project_proposals(studio_id,project_id,revision,request_id,snapshot,pdf,created_by)
values(pg_temp.fid(1),pg_temp.fid(31),1,pg_temp.fid(901),'{"schemaVersion":1,"projectTitle":"Orphan proposal"}',
  convert_to('%PDF-orphan','UTF8'),pg_temp.fid(10));
"""


def verify_preflight(database, anomaly, label):
    try:
        sql(database, SEED + anomaly + TARGET.read_text() + "\ncommit;")
    except subprocess.CalledProcessError as error:
        if "finance_order_backfill_orphan_history" not in error.stderr:
            raise
    else:
        raise AssertionError(f"preflight accepted {label}")
    assert sql(database, "select to_regclass('public.finance_project_orders') is null").strip() == "t"
    assert sql(database, "select count(*)=0 from public.finance_project_terms").strip() == "t"
    print(f"PASS: {label} stops the exact migration before schema/data changes")


def main():
    database = "orders_upgrade_" + uuid.uuid4().hex
    bootstrap = docker(
        "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only",
        "--section=pre-data", "--schema=auth", "--schema=storage", "--no-owner",
    )
    sql("postgres", f'create database "{database}"')
    try:
        sql(database, bootstrap + """
            alter table auth.users add primary key(id);
            alter table storage.buckets add primary key(id);
            create schema extensions;
            create extension pgcrypto with schema extensions;
            create publication supabase_realtime;
            grant usage on schema public,auth,extensions to authenticated;
        """)
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            if migration.name >= TARGET.name:
                break
            try:
                sql(database, "begin;\n" + migration.read_text() + "\ncommit;")
            except subprocess.CalledProcessError as error:
                raise RuntimeError(f"Pre-order replay failed at {migration.name}: {error.stderr}") from error
        sql(database, SEED + TARGET.read_text() + VERIFY)
        print("PASS: exact order migration backfills legacy revision/payment/proposal chains; all IDs, native totals, PDF bytes, cash, closures, recognition and historical FX preserved")
        verify_preflight(database, ORPHAN_PAYMENT, "orphan design payment")
        verify_preflight(database, ORPHAN_PROPOSAL, "orphan proposal")
    finally:
        sql("postgres", f'drop database "{database}"')


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr) from error
