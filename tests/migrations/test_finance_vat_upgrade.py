"""Run with python3 tests/migrations/test_finance_vat_upgrade.py.

Requires the running local Supabase container. Replays the real pre-VAT
migrations in a disposable database; never resets the development database.
"""

from pathlib import Path
import subprocess
import uuid


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase/migrations"
TARGET = MIGRATIONS / "20260929112931_finance_project_vat_net_gross.sql"
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
  assert not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='finance_allocations'
      and column_name='net_amount'), 'test requires pre-VAT schema';
end $$;
create function pg_temp.fid(n integer) returns uuid language sql immutable as
$$select ('67000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.studios(id,name) values(pg_temp.fid(1),'VAT upgrade');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values(pg_temp.fid(10),'authenticated','authenticated','vat-upgrade@test','{}','{}');
insert into public.profiles(id,full_name,email,system_role,is_active)
values(pg_temp.fid(10),'VAT upgrade','vat-upgrade@test','admin',true);
insert into public.studio_members(studio_id,user_id,system_role,is_active)
values(pg_temp.fid(1),pg_temp.fid(10),'admin',true);
insert into public.finance_settings(studio_id,base_currency,cutover_date,created_by)
values(pg_temp.fid(1),'USD','2026-01-01',pg_temp.fid(10));
insert into public.finance_accounts(id,studio_id,name,currency,opening_balance,created_by)
values(pg_temp.fid(20),pg_temp.fid(1),'USD bank','USD',0,pg_temp.fid(10));
select set_config('request.jwt.claim.sub',pg_temp.fid(10)::text,true);
set local role authenticated;
select public.finalize_finance_setup(pg_temp.fid(1));
select public.save_finance_expected_item(pg_temp.fid(1),pg_temp.fid(100),
  jsonb_build_object('direction','incoming','amount','100','currency','USD',
    'categoryId',(select id from public.finance_categories
      where studio_id=pg_temp.fid(1) and default_key='project_payments'),
    'commitment','agreed','certainty','fixed','established',true,'description','Legacy'));
select public.record_finance_movement(pg_temp.fid(1),pg_temp.fid(200),
  jsonb_build_object('kind','incoming','date','2026-09-02','accountId',pg_temp.fid(20),
    'amount','100','categoryId',(select id from public.finance_categories
      where studio_id=pg_temp.fid(1) and default_key='project_payments')));
select public.allocate_finance_payment(pg_temp.fid(1),pg_temp.fid(300),
  (select result_id from public.finance_planning_requests where request_id=pg_temp.fid(100)),
  (select id from public.finance_movements where request_id=pg_temp.fid(200)),40);
reset role;
create temp table original_allocation as select to_jsonb(a) snapshot from public.finance_allocations a;
create function pg_temp.assert_immutable(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when raise_exception then
    if sqlerrm='finance_history_immutable' then return; end if;
    raise;
  end;
  raise exception 'Expected finance_history_immutable: %',statement;
end $$;
select pg_temp.assert_immutable('update public.finance_allocations set reason=''rewrite''');
select pg_temp.assert_immutable('delete from public.finance_allocations');
"""

VERIFY = """
do $$ begin
  assert (select count(*)=1 from public.finance_allocations), 'legacy row preserved';
  assert (select amount=40 and net_amount=amount and vat_amount=0
    from public.finance_allocations), 'legacy amount is all net, zero VAT';
  assert (select to_jsonb(a)-'net_amount'-'vat_amount'=o.snapshot
    from public.finance_allocations a cross join original_allocation o), 'history unchanged';
  assert (select tgenabled='O' from pg_trigger
    where tgrelid='public.finance_allocations'::regclass
      and tgname='finance_allocations_immutable'), 'immutability trigger restored';
end $$;
-- Run as the table owner so RLS/privileges cannot mask a disabled trigger.
select pg_temp.assert_immutable('update public.finance_allocations set reason=''rewrite''');
select pg_temp.assert_immutable('delete from public.finance_allocations');
rollback;
"""


def main():
    database = "vat_upgrade_" + uuid.uuid4().hex
    # Only Supabase-owned schema definitions are copied, never local user data.
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
            sql(database, "begin;\n" + migration.read_text() + "\ncommit;")
        sql(database, SEED + TARGET.read_text() + VERIFY)
        print("PASS: pre-VAT allocation backfilled; history unchanged; UPDATE/DELETE rejected")
    finally:
        sql("postgres", f'drop database "{database}"')


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr) from error
