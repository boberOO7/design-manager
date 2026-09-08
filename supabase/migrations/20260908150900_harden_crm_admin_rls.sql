create or replace function private.is_active_crm_admin(target_studio_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.studio_members member
    join public.profiles profile on profile.id = member.user_id
    where member.studio_id = target_studio_id
      and member.user_id = (select auth.uid())
      and member.system_role = 'admin'
      and member.is_active
      and profile.is_active
  );
$$;
revoke execute on function private.is_active_crm_admin(uuid) from public, anon;
grant execute on function private.is_active_crm_admin(uuid) to authenticated;

drop policy crm_leads_select_admin on public.crm_leads;
drop policy crm_leads_insert_admin on public.crm_leads;
drop policy crm_leads_update_admin on public.crm_leads;
drop policy crm_leads_delete_admin on public.crm_leads;
drop policy crm_candidates_select_admin on public.crm_candidates;
drop policy crm_candidates_insert_admin on public.crm_candidates;
drop policy crm_candidates_update_admin on public.crm_candidates;
drop policy crm_candidates_delete_admin on public.crm_candidates;
drop policy crm_cycles_select_admin on public.crm_recruiting_cycles;
drop policy crm_cycles_insert_admin on public.crm_recruiting_cycles;
drop policy crm_cycles_update_admin on public.crm_recruiting_cycles;
drop policy crm_cycles_delete_admin on public.crm_recruiting_cycles;

create policy crm_leads_select_admin on public.crm_leads for select to authenticated using ((select private.is_active_crm_admin(studio_id)));
create policy crm_leads_insert_admin on public.crm_leads for insert to authenticated with check ((select private.is_active_crm_admin(studio_id)));
create policy crm_leads_update_admin on public.crm_leads for update to authenticated using ((select private.is_active_crm_admin(studio_id))) with check ((select private.is_active_crm_admin(studio_id)));
create policy crm_leads_delete_admin on public.crm_leads for delete to authenticated using ((select private.is_active_crm_admin(studio_id)));
create policy crm_candidates_select_admin on public.crm_candidates for select to authenticated using ((select private.is_active_crm_admin(studio_id)));
create policy crm_candidates_insert_admin on public.crm_candidates for insert to authenticated with check ((select private.is_active_crm_admin(studio_id)));
create policy crm_candidates_update_admin on public.crm_candidates for update to authenticated using ((select private.is_active_crm_admin(studio_id))) with check ((select private.is_active_crm_admin(studio_id)));
create policy crm_candidates_delete_admin on public.crm_candidates for delete to authenticated using ((select private.is_active_crm_admin(studio_id)));
create policy crm_cycles_select_admin on public.crm_recruiting_cycles for select to authenticated using ((select private.is_active_crm_admin(studio_id)));
create policy crm_cycles_insert_admin on public.crm_recruiting_cycles for insert to authenticated with check ((select private.is_active_crm_admin(studio_id)));
create policy crm_cycles_update_admin on public.crm_recruiting_cycles for update to authenticated using ((select private.is_active_crm_admin(studio_id))) with check ((select private.is_active_crm_admin(studio_id)));
create policy crm_cycles_delete_admin on public.crm_recruiting_cycles for delete to authenticated using ((select private.is_active_crm_admin(studio_id)));

create or replace function public.start_crm_recruiting_cycle(
  p_candidate_id uuid,
  p_target_position text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_candidate public.crm_candidates; v_cycle_id uuid;
begin
  select * into v_candidate from public.crm_candidates where id = p_candidate_id for update;
  if v_candidate.id is null then raise exception 'candidate_not_found'; end if;
  if not private.is_active_crm_admin(v_candidate.studio_id) then raise exception 'admin_required'; end if;
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
