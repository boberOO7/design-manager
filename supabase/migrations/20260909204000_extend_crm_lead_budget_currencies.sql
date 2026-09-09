alter table public.crm_leads
  drop constraint crm_leads_budget_semantics;

alter table public.crm_leads
  add constraint crm_leads_budget_semantics check (
    (budget_amount is null and budget_currency is null)
    or (
      budget_amount > 0
      and budget_currency in ('UAH', 'USD', 'EUR', 'PLN')
    )
  );
