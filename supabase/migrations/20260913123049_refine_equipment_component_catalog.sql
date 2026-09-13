-- Provider identity changes leave the old canonical row as append-only audit
-- history with no mappings. Keep real removed products searchable while hiding
-- these superseded normalization artifacts from autocomplete.
create or replace function public.search_equipment_catalog(p_type text, p_query text, p_manufacturer text default '', p_family text default '', p_field text default 'model')
returns table (value text)
language plpgsql stable security invoker set search_path = ''
set statement_timeout = '2s'
as $$
declare
  q text := lower(regexp_replace(btrim(coalesce(p_query, '')), '[[:space:]]+', ' ', 'g'));
  manufacturer_query text := lower(regexp_replace(btrim(coalesce(p_manufacturer, '')), '[[:space:]]+', ' ', 'g'));
  family_query text := lower(regexp_replace(btrim(coalesce(p_family, '')), '[[:space:]]+', ' ', 'g'));
  pattern text;
begin
  if length(q) > 160 or length(coalesce(p_manufacturer,'')) > 160 or length(coalesce(p_family,'')) > 160 then
    raise exception 'invalid_catalog_query';
  end if;
  pattern := replace(replace(replace(q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  if p_field = 'manufacturer' then
    return query select m.name from public.equipment_catalog_manufacturers m
      where m.catalog_type = p_type and (q = '' or m.search_name like '%' || pattern || '%')
      order by (m.search_name = q) desc, (m.search_name like pattern || '%') desc,
        m.popularity desc, m.product_count desc, m.name limit 10;
  elsif p_field = 'model' then
    if length(q) < 2 then return; end if;
    return query select m.model from public.equipment_catalog_models m
      where m.catalog_type = p_type
        and m.provider_product_count > 0
        and (manufacturer_query = '' or m.search_manufacturer = manufacturer_query)
        and (family_query = '' or m.search_family = family_query)
        and (m.search_model like pattern || '%' or
          (length(q) >= 3 and (m.search_model like '%' || pattern || '%' or m.search_model operator(extensions.%) q)))
      order by case when m.search_model = q then 0 when m.search_model like pattern || '%' then 1
          when m.search_model like '%' || pattern || '%' then 2 else 3 end,
        (m.is_current and coalesce(m.on_market, true)) desc, m.is_current desc,
        extensions.similarity(m.search_model, q) desc, m.popularity desc, m.model limit 12;
  else raise exception 'invalid_catalog_field';
  end if;
end;
$$;

revoke all on function public.search_equipment_catalog(text,text,text,text,text) from public, anon;
grant execute on function public.search_equipment_catalog(text,text,text,text,text) to authenticated, service_role;
