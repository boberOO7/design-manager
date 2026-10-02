-- Proposal copy overrides only row notes. Canonical Finance rows and old revisions stay intact.
do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid)'::regprocedure);
  updated:=replace(definition,
    $old$(p_presentation-'studioContactPerson')$old$,
    $new$(p_presentation-'studioContactPerson'-'stageNotes')$new$);
  if updated=definition then raise exception 'proposal_snapshot_merge_not_found'; end if;
  definition:=updated;
  updated:=replace(definition,
    $old$'designVariant','studioContactPerson')$old$,
    $new$'designVariant','studioContactPerson','stageNotes')$new$);
  if updated=definition then raise exception 'proposal_presentation_allowlist_not_found'; end if;
  definition:=updated;
  updated:=replace(definition,
    $old$select * into old from public.finance_project_proposals where studio_id=p_studio_id and request_id=p_request_id;$old$,
    $new$if p_presentation ? 'stageNotes' then
    if jsonb_typeof(p_presentation->'stageNotes') is distinct from 'array' or
      jsonb_typeof(p_source->'rows') is distinct from 'array' then raise exception 'finance_input_invalid'; end if;
    if exists(select 1 from jsonb_array_elements(p_presentation->'stageNotes') n where jsonb_typeof(n) is distinct from 'object') then raise exception 'finance_input_invalid'; end if;
    if exists(select 1 from jsonb_array_elements(p_presentation->'stageNotes') n where
      jsonb_typeof(n->'id') is distinct from 'string' or jsonb_typeof(n->'note') is distinct from 'string' or
      char_length(n->>'note')>300 or exists(select 1 from jsonb_object_keys(n) k where k not in ('id','note')) or
      not exists(select 1 from jsonb_array_elements(p_source->'rows') r where r->>'id'=n->>'id')
    ) or (select count(distinct n->>'id') from jsonb_array_elements(p_presentation->'stageNotes') n)<>jsonb_array_length(p_presentation->'stageNotes') then raise exception 'finance_input_invalid'; end if;
    snapshot:=jsonb_set(snapshot,'{rows}',coalesce((
      select jsonb_agg(r.value||jsonb_build_object('note',coalesce((
        select n->'note' from jsonb_array_elements(p_presentation->'stageNotes') n where n->>'id'=r.value->>'id'
      ),r.value->'note')) order by r.ordinality)
      from jsonb_array_elements(snapshot->'rows') with ordinality r(value,ordinality)
    ),'[]'::jsonb));
  end if;
  select * into old from public.finance_project_proposals where studio_id=p_studio_id and request_id=p_request_id;$new$);
  if updated=definition then raise exception 'proposal_snapshot_validation_not_found'; end if;
  execute updated;
end;
$$;
