begin;

insert into public.studios (id, name) values ('77000000-0000-0000-0000-000000000001', 'Template checklist test');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('77000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'template-checklist-admin@example.test', '{}', '{}', now(), now());
insert into public.profiles (id, full_name, email, system_role)
values ('77000000-0000-0000-0000-000000000010', 'Template checklist admin', 'template-checklist-admin@example.test', 'admin');
insert into public.studio_members (studio_id, user_id, system_role)
values ('77000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000010', 'admin');

select set_config('request.jwt.claim.sub', '77000000-0000-0000-0000-000000000010', true);
set local role authenticated;

do $test$
  declare
    checklist_id uuid;
    template_id uuid;
    first_project_id uuid;
    second_project_id uuid;
    first_task_id uuid;
  begin
    checklist_id := public.save_checklist_template(
      '77000000-0000-0000-0000-000000000001', 'Review checklist',
      '[{"title":"First item","weight":2},{"title":"Second item","weight":3}]'::jsonb
    );
    template_id := public.save_project_template(
      '77000000-0000-0000-0000-000000000001', 'private', 'Project checklist template', true, false,
      jsonb_build_array(
        jsonb_build_object('stage','stage_1','title','First task','priority','normal','checklist_template_id',checklist_id),
        jsonb_build_object('stage','stage_1','title','Second task','priority','normal')
      )
    );
    first_project_id := public.create_project_from_template(
      '{"studio_id":"77000000-0000-0000-0000-000000000001","name":"First snapshot","project_type":"private","country_code":"UA","total_area_m2":80,"priority":"normal","start_date":"2026-09-24"}'::jsonb,
      '[]'::jsonb, template_id
    );
    select id into first_task_id from public.tasks where project_id = first_project_id and title = 'First task';
    if (select array_agg(title order by position) from public.task_checklist_items where task_id = first_task_id)
      is distinct from array['First item','Second item']::text[] then
      raise exception 'The created task did not receive ordered checklist items';
    end if;
    if (select array_agg(weight order by position) from public.task_checklist_items where task_id = first_task_id)
      is distinct from array[2,3]::numeric[] then
      raise exception 'The created task did not receive checklist weights';
    end if;
    if (select count(*) from public.tasks where project_id = first_project_id and stage = 'stage_1' and priority = 'normal') <> 2 then
      raise exception 'The project template did not retain its task defaults';
    end if;

    perform public.save_checklist_template(
      '77000000-0000-0000-0000-000000000001', 'Review checklist',
      '[{"title":"Updated item","weight":5}]'::jsonb, checklist_id
    );
    perform public.save_project_template(
      '77000000-0000-0000-0000-000000000001', 'private', 'Project checklist template', true, false,
      jsonb_build_array(jsonb_build_object('stage','stage_1','title','Renamed task','priority','normal','checklist_template_id',checklist_id)),
      template_id
    );
    if (select array_agg(title order by position) from public.task_checklist_items where task_id = first_task_id)
      is distinct from array['First item','Second item']::text[]
      or (select title from public.tasks where id = first_task_id) <> 'First task' then
      raise exception 'Editing templates changed an already-created project';
    end if;

    second_project_id := public.create_project_from_template(
      '{"studio_id":"77000000-0000-0000-0000-000000000001","name":"Second snapshot","project_type":"private","country_code":"UA","total_area_m2":80,"priority":"normal","start_date":"2026-09-24"}'::jsonb,
      '[]'::jsonb, template_id
    );
    if (select array_agg(item.title order by item.position)
        from public.tasks as task join public.task_checklist_items as item on item.task_id = task.id
        where task.project_id = second_project_id and task.title = 'Renamed task')
      is distinct from array['Updated item']::text[] then
      raise exception 'Future projects did not use the edited checklist template';
    end if;
  end
  $test$;
rollback;
