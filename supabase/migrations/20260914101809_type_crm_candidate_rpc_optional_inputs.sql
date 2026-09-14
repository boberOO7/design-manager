drop function public.create_crm_candidate_with_cycle(
  text, text, text, text, text, uuid, text, public.recruiting_stage,
  public.recruiting_outcome, date, timestamptz, text, text
);

create function public.create_crm_candidate_with_cycle(
  p_full_name text,
  p_email text,
  p_phone text,
  p_external_profile_url text,
  p_source text,
  p_responsible_admin_id text,
  p_target_position text,
  p_stage public.recruiting_stage,
  p_outcome text,
  p_next_contact_date text,
  p_interview_at text,
  p_interview_notes text,
  p_test_task_result text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_studio_id uuid;
  v_candidate_id uuid;
  v_outcome public.recruiting_outcome := nullif(btrim(p_outcome), '')::public.recruiting_outcome;
begin
  select member.studio_id into strict v_studio_id
  from public.studio_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.user_id = (select auth.uid())
    and member.system_role = 'admin'
    and member.is_active
    and profile.is_active;

  insert into public.crm_candidates (
    studio_id, full_name, email, phone, external_profile_url, source,
    responsible_admin_id
  ) values (
    v_studio_id, btrim(p_full_name), nullif(btrim(p_email), ''),
    nullif(btrim(p_phone), ''), nullif(btrim(p_external_profile_url), ''),
    nullif(btrim(p_source), ''), nullif(btrim(p_responsible_admin_id), '')::uuid
  ) returning id into v_candidate_id;

  insert into public.crm_recruiting_cycles (
    studio_id, candidate_id, target_position, stage, outcome,
    next_contact_date, interview_at, interview_notes, test_task_result,
    completed_at
  ) values (
    v_studio_id, v_candidate_id, btrim(p_target_position),
    case when v_outcome is null then p_stage else 'decision' end,
    v_outcome, nullif(btrim(p_next_contact_date), '')::date,
    nullif(btrim(p_interview_at), '')::timestamptz,
    nullif(btrim(p_interview_notes), ''), nullif(btrim(p_test_task_result), ''),
    case when v_outcome is null then null else now() end
  );

  return v_candidate_id;
exception
  when no_data_found or too_many_rows then raise exception 'admin_required';
end;
$$;

revoke all on function public.create_crm_candidate_with_cycle(
  text, text, text, text, text, text, text, public.recruiting_stage,
  text, text, text, text, text
) from public, anon;
grant execute on function public.create_crm_candidate_with_cycle(
  text, text, text, text, text, text, text, public.recruiting_stage,
  text, text, text, text, text
) to authenticated;

drop function public.update_crm_candidate_with_cycle(
  uuid, uuid, text, text, text, text, text, uuid, text,
  public.recruiting_stage, public.recruiting_outcome, date, timestamptz,
  text, text
);

create function public.update_crm_candidate_with_cycle(
  p_candidate_id uuid,
  p_cycle_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_external_profile_url text,
  p_source text,
  p_responsible_admin_id text,
  p_target_position text,
  p_stage public.recruiting_stage,
  p_outcome text,
  p_next_contact_date text,
  p_interview_at text,
  p_interview_notes text,
  p_test_task_result text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_studio_id uuid;
  v_outcome public.recruiting_outcome := nullif(btrim(p_outcome), '')::public.recruiting_outcome;
begin
  select candidate.studio_id into v_studio_id
  from public.crm_candidates as candidate
  where candidate.id = p_candidate_id
  for update;

  if v_studio_id is null then raise exception 'candidate_not_found'; end if;
  if not private.is_active_crm_admin(v_studio_id) then raise exception 'admin_required'; end if;

  perform 1
  from public.crm_recruiting_cycles as cycle
  where cycle.id = p_cycle_id
    and cycle.candidate_id = p_candidate_id
    and cycle.studio_id = v_studio_id
  for update;
  if not found then raise exception 'recruiting_cycle_not_found'; end if;

  update public.crm_candidates
  set full_name = btrim(p_full_name),
      email = nullif(btrim(p_email), ''),
      phone = nullif(btrim(p_phone), ''),
      external_profile_url = nullif(btrim(p_external_profile_url), ''),
      source = nullif(btrim(p_source), ''),
      responsible_admin_id = nullif(btrim(p_responsible_admin_id), '')::uuid
  where id = p_candidate_id
    and studio_id = v_studio_id;

  update public.crm_recruiting_cycles
  set target_position = btrim(p_target_position),
      stage = case when v_outcome is null then p_stage else 'decision' end,
      outcome = v_outcome,
      next_contact_date = nullif(btrim(p_next_contact_date), '')::date,
      interview_at = nullif(btrim(p_interview_at), '')::timestamptz,
      interview_notes = nullif(btrim(p_interview_notes), ''),
      test_task_result = nullif(btrim(p_test_task_result), ''),
      completed_at = case
        when v_outcome is null then null
        else coalesce(completed_at, now())
      end
  where id = p_cycle_id
    and candidate_id = p_candidate_id
    and studio_id = v_studio_id;

  return p_candidate_id;
end;
$$;

revoke all on function public.update_crm_candidate_with_cycle(
  uuid, uuid, text, text, text, text, text, text, text,
  public.recruiting_stage, text, text, text, text, text
) from public, anon;
grant execute on function public.update_crm_candidate_with_cycle(
  uuid, uuid, text, text, text, text, text, text, text,
  public.recruiting_stage, text, text, text, text, text
) to authenticated;
