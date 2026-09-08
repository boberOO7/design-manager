alter table public.crm_leads
  add column country_code text,
  add column city_geonames_id bigint,
  add column expected_project_type_custom text,
  add column budget_amount numeric(14, 2),
  add column budget_currency text;

update public.crm_leads
set
  expected_project_type_custom = case
    when expected_project_type is null then null
    when lower(btrim(expected_project_type)) in (
      'private', 'residential', 'commercial', 'office', 'retail', 'public',
      'industrial', 'mixed_use', 'horeca', 'hospitality', 'medical', 'other'
    ) then null
    else nullif(btrim(expected_project_type), '')
  end,
  expected_project_type = case
    when expected_project_type is null or btrim(expected_project_type) = '' then null
    when lower(btrim(expected_project_type)) in ('private', 'residential') then 'private'
    when lower(btrim(expected_project_type)) in ('commercial', 'office', 'retail', 'public', 'industrial', 'mixed_use') then 'commercial'
    when lower(btrim(expected_project_type)) in ('horeca', 'hospitality') then 'horeca'
    when lower(btrim(expected_project_type)) = 'medical' then 'medical'
    else 'other'
  end;

update public.crm_leads
set country_code = case
  when country ~* '^\s*[a-z]{2}\s*$' then upper(btrim(country))
  when lower(btrim(country)) in ('ukraine', 'україна') then 'UA'
  else null
end
where country is not null;

with normalized as (
  select
    id,
    regexp_replace(budget_note, '[[:space:]]', '', 'g') as compact_budget
  from public.crm_leads
  where budget_note is not null
)
update public.crm_leads lead
set
  budget_amount = regexp_replace(normalized.compact_budget, '[\$₴]', '', 'g')::numeric,
  budget_currency = case when normalized.compact_budget like '%$%' then 'USD' else 'UAH' end
from normalized
where lead.id = normalized.id
  and normalized.compact_budget ~ '^(\$[0-9]{1,12}|[0-9]{1,12}\$|[0-9]{1,12}₴?|₴[0-9]{1,12})$';

alter table public.crm_leads
  add constraint crm_leads_country_iso_alpha_2
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add constraint crm_leads_city_geonames_id_positive
    check (city_geonames_id is null or city_geonames_id > 0),
  add constraint crm_leads_city_geonames_id_requires_city
    check (city_geonames_id is null or city is not null),
  add constraint crm_leads_expected_project_type_canonical
    check (expected_project_type is null or expected_project_type in ('private', 'commercial', 'horeca', 'medical', 'other')),
  add constraint crm_leads_expected_project_type_custom_length
    check (expected_project_type_custom is null or char_length(btrim(expected_project_type_custom)) between 1 and 100),
  add constraint crm_leads_expected_project_type_custom_consistency
    check (expected_project_type = 'other' or expected_project_type_custom is null),
  add constraint crm_leads_budget_semantics
    check (
      (budget_amount is null and budget_currency is null)
      or (budget_amount > 0 and budget_currency in ('UAH', 'USD'))
    );

grant update (
  country_code,
  city_geonames_id,
  expected_project_type_custom,
  budget_amount,
  budget_currency
) on table public.crm_leads to authenticated;
