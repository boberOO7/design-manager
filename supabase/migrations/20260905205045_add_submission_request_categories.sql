alter table public.submissions
  add column request_category text;

alter table public.submissions
  add constraint submissions_request_category_check
  check (
    (type = 'request' and (request_category is null or request_category in ('equipment', 'office', 'software', 'other')))
    or (type <> 'request' and request_category is null)
  );

drop function public.create_submission(public.submission_type, text, text, boolean);

create function public.create_submission(
  p_type public.submission_type,
  p_title text,
  p_description text,
  p_anonymous boolean default false,
  p_request_category text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_studio_id uuid; v_id uuid;
begin
  select member.studio_id into v_studio_id from public.studio_members member
  join public.profiles profile on profile.id = member.user_id
  where member.user_id = v_actor and member.is_active and profile.is_active;
  if v_studio_id is null then raise exception 'active_studio_membership_required'; end if;
  if p_anonymous and p_type <> 'complaint' then raise exception 'anonymous_complaints_only'; end if;
  if p_type = 'request' and (p_request_category is null or p_request_category not in ('equipment', 'office', 'software', 'other')) then
    raise exception 'request_category_required';
  end if;
  if p_type <> 'request' and p_request_category is not null then
    raise exception 'request_category_not_applicable';
  end if;
  insert into public.submissions(studio_id, type, title, description, request_category, author_id, is_anonymous)
  values (v_studio_id, p_type, btrim(p_title), btrim(p_description), p_request_category, case when p_anonymous then null else v_actor end, p_anonymous)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_submission(public.submission_type, text, text, boolean, text) from public, anon;
grant execute on function public.create_submission(public.submission_type, text, text, boolean, text) to authenticated;
