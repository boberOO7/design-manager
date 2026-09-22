-- Adopt a studio's existing travel classification without renaming its history.
create or replace function private.trip_category(p_studio uuid,p_direction text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if p_direction='incoming' then
    select id into result from public.finance_categories where studio_id=p_studio and default_key='other_income';
  else
    select id into result from public.finance_categories where studio_id=p_studio and (default_key='business_travel'
      or (lower(btrim(name))='business travel' and direction='outgoing' and nature='operating'))
      order by (default_key='business_travel') desc nulls last limit 1;
    if result is null then
      insert into public.finance_categories(studio_id,name,direction,nature,default_key,custom_name)
      values(p_studio,'Business travel','outgoing','operating','business_travel',false) returning id into result;
    end if;
  end if;
  return result;
end $$;

