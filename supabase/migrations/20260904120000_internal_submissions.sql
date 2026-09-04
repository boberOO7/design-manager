create type public.submission_type as enum ('request', 'suggestion', 'complaint');
create type public.submission_status as enum (
  'new', 'accepted', 'in_progress', 'done', 'rejected',
  'discussion', 'planned', 'implemented',
  'reviewing', 'action_taken', 'closed'
);

alter type public.notification_type add value if not exists 'submission_created';
alter type public.notification_type add value if not exists 'submission_assigned';
alter type public.notification_type add value if not exists 'submission_status_changed';

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  type public.submission_type not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null check (length(btrim(description)) between 1 and 5000),
  status public.submission_status not null default 'new',
  author_id uuid references public.profiles(id),
  is_anonymous boolean not null default false,
  responsible_id uuid,
  priority text check (priority is null or priority in ('low', 'normal', 'high', 'urgent')),
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, studio_id),
  foreign key (studio_id, responsible_id) references public.studio_members(studio_id, user_id),
  check ((is_anonymous and type = 'complaint' and author_id is null) or (not is_anonymous and author_id is not null))
);

create table public.submission_admin_details (
  submission_id uuid primary key,
  studio_id uuid not null,
  internal_note text check (internal_note is null or length(internal_note) <= 5000),
  updated_at timestamptz not null default now(),
  foreign key (submission_id, studio_id) references public.submissions(id, studio_id) on delete cascade
);

create table public.submission_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  studio_id uuid not null,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (submission_id, studio_id) references public.submissions(id, studio_id) on delete cascade
);

create table public.submission_reactions (
  submission_id uuid not null,
  studio_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (submission_id, user_id),
  foreign key (submission_id, studio_id) references public.submissions(id, studio_id) on delete cascade
);

create index submissions_studio_created_idx on public.submissions(studio_id, created_at desc);
create index submissions_author_idx on public.submissions(author_id, created_at desc) where author_id is not null;
create index submissions_responsible_idx on public.submissions(responsible_id, created_at desc) where responsible_id is not null;
create index submission_comments_submission_idx on public.submission_comments(submission_id, created_at);
create index submission_reactions_submission_idx on public.submission_reactions(submission_id);

create trigger set_submissions_updated_at before update on public.submissions
for each row execute function public.set_updated_at();
create trigger set_submission_comments_updated_at before update on public.submission_comments
for each row execute function public.set_updated_at();
create trigger set_submission_admin_details_updated_at before update on public.submission_admin_details
for each row execute function public.set_updated_at();

create or replace function private.submission_status_is_valid(
  p_type public.submission_type,
  p_status public.submission_status
) returns boolean language sql immutable set search_path = '' as $$
  select case p_type
    when 'request' then p_status in ('new', 'accepted', 'in_progress', 'done', 'rejected')
    when 'suggestion' then p_status in ('new', 'discussion', 'accepted', 'planned', 'implemented', 'rejected')
    when 'complaint' then p_status in ('new', 'reviewing', 'action_taken', 'closed')
  end;
$$;

create or replace function private.submission_transition_is_valid(
  p_type public.submission_type,
  p_old public.submission_status,
  p_new public.submission_status
) returns boolean language sql immutable set search_path = '' as $$
  select p_old = p_new or case p_type
    when 'request' then (p_old, p_new) in (('new','accepted'),('accepted','in_progress'),('in_progress','done'),('new','rejected'),('accepted','rejected'),('in_progress','rejected'))
    when 'suggestion' then (p_old, p_new) in (('new','discussion'),('discussion','accepted'),('accepted','planned'),('planned','implemented'),('new','rejected'),('discussion','rejected'),('accepted','rejected'),('planned','rejected'))
    when 'complaint' then (p_old, p_new) in (('new','reviewing'),('reviewing','action_taken'),('action_taken','closed'))
  end;
$$;

create or replace function private.enforce_submission_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.submission_status_is_valid(new.type, new.status) then
    raise exception 'invalid_submission_status';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.studio_id is distinct from old.studio_id
      or new.type is distinct from old.type or new.title is distinct from old.title
      or new.description is distinct from old.description or new.author_id is distinct from old.author_id
      or new.is_anonymous is distinct from old.is_anonymous or new.created_at is distinct from old.created_at then
      raise exception 'submission_identity_is_immutable';
    end if;
    if not private.submission_transition_is_valid(old.type, old.status, new.status) then
      raise exception 'invalid_submission_transition';
    end if;
  end if;
  if new.responsible_id is not null and not exists (
    select 1 from public.studio_members member join public.profiles profile on profile.id = member.user_id
    where member.studio_id = new.studio_id and member.user_id = new.responsible_id
      and member.is_active and profile.is_active
  ) then raise exception 'responsible_must_be_active_studio_member'; end if;
  return new;
end;
$$;
revoke execute on function private.enforce_submission_write() from public, anon, authenticated;
create trigger enforce_submission_write_before_write before insert or update on public.submissions
for each row execute function private.enforce_submission_write();

create or replace function private.can_access_submission(p_submission_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.submissions submission
    where submission.id = p_submission_id and (
      private.is_studio_admin(submission.studio_id)
      or (submission.type = 'suggestion' and private.is_studio_member(submission.studio_id))
      or (not submission.is_anonymous and submission.author_id = (select auth.uid()))
      or (submission.type = 'request' and submission.responsible_id = (select auth.uid()) and private.is_studio_member(submission.studio_id))
    )
  );
$$;
revoke execute on function private.can_access_submission(uuid) from public, anon;
grant execute on function private.can_access_submission(uuid) to authenticated;

alter table public.submissions enable row level security;
alter table public.submission_admin_details enable row level security;
alter table public.submission_comments enable row level security;
alter table public.submission_reactions enable row level security;

revoke all on public.submissions, public.submission_admin_details, public.submission_comments, public.submission_reactions from anon, authenticated;
grant select on public.submissions to authenticated;
grant select on public.submission_admin_details to authenticated;
grant select, insert on public.submission_comments to authenticated;
grant select, insert, delete on public.submission_reactions to authenticated;

create policy submissions_select_authorized on public.submissions for select to authenticated
using ((select private.can_access_submission(id)));
create policy submission_admin_details_select_admin on public.submission_admin_details for select to authenticated
using ((select private.is_studio_admin(studio_id)));
create policy submission_comments_select_authorized on public.submission_comments for select to authenticated
using ((select private.can_access_submission(submission_id)));
create policy submission_comments_insert_authorized on public.submission_comments for insert to authenticated
with check (author_id = (select auth.uid()) and (select private.is_studio_member(studio_id)) and (select private.can_access_submission(submission_id)));
create policy submission_reactions_select_members on public.submission_reactions for select to authenticated
using ((select private.is_studio_member(studio_id)) and exists (select 1 from public.submissions submission where submission.id = submission_id and submission.type = 'suggestion'));
create policy submission_reactions_insert_self on public.submission_reactions for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.is_studio_member(studio_id)) and exists (select 1 from public.submissions submission where submission.id = submission_id and submission.studio_id = studio_id and submission.type = 'suggestion'));
create policy submission_reactions_delete_self on public.submission_reactions for delete to authenticated
using (user_id = (select auth.uid()) and (select private.is_studio_member(studio_id)));

create or replace function public.create_submission(
  p_type public.submission_type,
  p_title text,
  p_description text,
  p_anonymous boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_studio_id uuid; v_id uuid;
begin
  select member.studio_id into v_studio_id from public.studio_members member
  join public.profiles profile on profile.id = member.user_id
  where member.user_id = v_actor and member.is_active and profile.is_active;
  if v_studio_id is null then raise exception 'active_studio_membership_required'; end if;
  if p_anonymous and p_type <> 'complaint' then raise exception 'anonymous_complaints_only'; end if;
  insert into public.submissions(studio_id, type, title, description, author_id, is_anonymous)
  values (v_studio_id, p_type, btrim(p_title), btrim(p_description), case when p_anonymous then null else v_actor end, p_anonymous)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_submission(public.submission_type, text, text, boolean) from public, anon;
grant execute on function public.create_submission(public.submission_type, text, text, boolean) to authenticated;

create or replace function public.manage_submission(
  p_submission_id uuid,
  p_status public.submission_status,
  p_responsible_id uuid,
  p_priority text,
  p_deadline date,
  p_internal_note text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_studio_id uuid;
begin
  select studio_id into v_studio_id from public.submissions where id = p_submission_id for update;
  if v_studio_id is null or not private.is_studio_admin(v_studio_id) then raise exception 'admin_required'; end if;
  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then raise exception 'invalid_priority'; end if;
  update public.submissions set status = p_status, responsible_id = p_responsible_id,
    priority = p_priority, deadline = p_deadline where id = p_submission_id;
  insert into public.submission_admin_details(submission_id, studio_id, internal_note)
  values (p_submission_id, v_studio_id, nullif(btrim(p_internal_note), ''))
  on conflict (submission_id) do update set internal_note = excluded.internal_note;
end;
$$;
revoke all on function public.manage_submission(uuid, public.submission_status, uuid, text, date, text) from public, anon;
grant execute on function public.manage_submission(uuid, public.submission_status, uuid, text, date, text) to authenticated;

create or replace function private.notify_submission_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; actor uuid := (select auth.uid()); author_label text;
begin
  if tg_op = 'INSERT' and new.type in ('request', 'complaint') then
    author_label := case when new.is_anonymous then 'Anonymous' else coalesce((select full_name from public.profiles where id = new.author_id), 'A studio member') end;
    for recipient in select member.user_id from public.studio_members member join public.profiles profile on profile.id = member.user_id
      where member.studio_id = new.studio_id and member.system_role = 'admin' and member.is_active and profile.is_active
    loop
      perform private.create_notification('submission_created', new.studio_id, recipient,
        case when new.is_anonymous then null else new.author_id end,
        case when new.type = 'request' then 'New request' else 'New complaint' end,
        author_label || ': “' || new.title || '”', '/submissions?item=' || new.id,
        'submission', new.id, jsonb_build_object('type', new.type, 'anonymous', new.is_anonymous));
    end loop;
  elsif tg_op = 'UPDATE' then
    if new.responsible_id is distinct from old.responsible_id and new.responsible_id is not null then
      perform private.create_notification('submission_assigned', new.studio_id, new.responsible_id, actor,
        'New request assigned', 'You are responsible for “' || new.title || '”.',
        '/submissions?item=' || new.id, 'submission', new.id, jsonb_build_object('type', new.type));
    end if;
    if new.status is distinct from old.status and new.author_id is not null then
      perform private.create_notification('submission_status_changed', new.studio_id, new.author_id, actor,
        'Submission updated', '“' || new.title || '” is now ' || replace(new.status::text, '_', ' ') || '.',
        '/submissions?item=' || new.id, 'submission', new.id, jsonb_build_object('type', new.type, 'status', new.status));
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.notify_submission_change() from public, anon, authenticated;
create trigger notify_submission_change_after_write after insert or update on public.submissions
for each row execute function private.notify_submission_change();
