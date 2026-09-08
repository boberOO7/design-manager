alter table public.crm_leads
  drop constraint crm_leads_expected_project_type_custom_consistency,
  add constraint crm_leads_expected_project_type_custom_consistency
    check (
      expected_project_type_custom is null
      or coalesce(expected_project_type = 'other', false)
    );
