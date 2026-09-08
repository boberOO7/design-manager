create unique index crm_recruiting_cycles_one_active_idx
on public.crm_recruiting_cycles(candidate_id)
where outcome is null;

create or replace function public.create_crm_candidate(
  p_full_name text,
  p_email text,
  p_phone text,
  p_external_profile_url text,
  p_source text,
  p_responsible_admin_id uuid,
  p_internal_notes text,
  p_target_position text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid; v_candidate_id uuid;
begin
  select member.studio_id into strict v_studio_id
  from public.studio_members member
  join public.profiles profile on profile.id = member.user_id
  where member.user_id = (select auth.uid())
    and member.system_role = 'admin'
    and member.is_active
    and profile.is_active;

  insert into public.crm_candidates(
    studio_id, full_name, email, phone, external_profile_url, source,
    responsible_admin_id, internal_notes
  ) values (
    v_studio_id, btrim(p_full_name), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''),
    nullif(btrim(p_external_profile_url), ''), nullif(btrim(p_source), ''),
    p_responsible_admin_id, nullif(btrim(p_internal_notes), '')
  ) returning id into v_candidate_id;

  insert into public.crm_recruiting_cycles(studio_id, candidate_id, target_position)
  values (v_studio_id, v_candidate_id, btrim(p_target_position));

  return v_candidate_id;
exception
  when no_data_found or too_many_rows then raise exception 'admin_required';
end;
$$;
revoke all on function public.create_crm_candidate(text, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.create_crm_candidate(text, text, text, text, text, uuid, text, text) to authenticated;

create or replace function public.start_crm_recruiting_cycle(
  p_candidate_id uuid,
  p_target_position text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_candidate public.crm_candidates; v_cycle_id uuid;
begin
  select * into v_candidate from public.crm_candidates where id = p_candidate_id for update;
  if v_candidate.id is null then raise exception 'candidate_not_found'; end if;
  if not private.is_studio_admin(v_candidate.studio_id) then raise exception 'admin_required'; end if;
  if exists (
    select 1 from public.crm_recruiting_cycles cycle
    where cycle.candidate_id = p_candidate_id and cycle.outcome is null
  ) then raise exception 'active_recruiting_cycle_exists'; end if;

  insert into public.crm_recruiting_cycles(studio_id, candidate_id, target_position)
  values (v_candidate.studio_id, p_candidate_id, btrim(p_target_position))
  returning id into v_cycle_id;
  return v_cycle_id;
end;
$$;
revoke all on function public.start_crm_recruiting_cycle(uuid, text) from public, anon;
grant execute on function public.start_crm_recruiting_cycle(uuid, text) to authenticated;
