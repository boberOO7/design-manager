-- The management UI deliberately allows an admin to clear either field. The
-- defaults preserve that existing null behavior in generated RPC types.
create or replace function public.manage_submission(
  p_submission_id uuid,
  p_status public.submission_status,
  p_responsible_id uuid default null,
  p_priority text default 'normal',
  p_deadline date default null,
  p_internal_note text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid;
begin
  select studio_id into v_studio_id from public.submissions where id = p_submission_id for update;
  if v_studio_id is null or not private.is_studio_admin(v_studio_id) then raise exception 'admin_required'; end if;
  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then raise exception 'invalid_priority'; end if;
  update public.submissions set status = p_status, responsible_id = p_responsible_id,
    priority = coalesce(p_priority, 'normal'), deadline = p_deadline where id = p_submission_id;
  insert into public.submission_admin_details(submission_id, studio_id, internal_note)
  values (p_submission_id, v_studio_id, nullif(btrim(p_internal_note), ''))
  on conflict (submission_id) do update set internal_note = excluded.internal_note;
end;
$$;
