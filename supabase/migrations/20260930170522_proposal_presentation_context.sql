-- Presentation-only context; Finance calculations, schedules and saved PDFs are unchanged.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('private.finance_proposal_source(uuid,uuid)'::regprocedure);
  definition:=replace(definition,
    '''area'',coalesce(pricing.area_snapshot,project.total_area_m2)::text,',
    '''area'',coalesce(pricing.area_snapshot,project.total_area_m2)::text,
    ''clientRatePerM2'',case when pricing.pricing_method=''area'' then
      (select gross_amount::text from private.finance_vat_parts(pricing.rate_per_m2,terms.vat_rate,terms.price_basis,4)) else null end,');
  execute definition;

  definition:=pg_get_functiondef('public.save_finance_project_proposal(uuid,uuid,uuid,jsonb,jsonb,text,uuid)'::regprocedure);
  definition:=replace(definition,
    'k not in (''projectTitle'',''clientName'',''contact'',''address'',''intro'')',
    'k not in (''projectTitle'',''clientName'',''contact'',''address'',''intro'',''studioContacts'')');
  definition:=replace(definition,
    'if char_length(btrim(p_presentation->>''projectTitle''))=0',
    'if p_presentation ? ''studioContacts'' and (jsonb_typeof(p_presentation->''studioContacts'') is distinct from ''string'' or char_length(p_presentation->>''studioContacts'')>300) then raise exception ''finance_input_invalid''; end if;
  if char_length(btrim(p_presentation->>''projectTitle''))=0');
  execute definition;
end;
$$;
