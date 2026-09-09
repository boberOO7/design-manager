export const CRM_BUDGET_CURRENCIES = ["UAH", "USD", "EUR", "PLN"] as const;

export type CrmBudgetCurrency = (typeof CRM_BUDGET_CURRENCIES)[number];
export type ParsedCrmBudget = { amount: number; currency: CrmBudgetCurrency };

const budgetPattern = /^\d{1,12}$/;

export function isCrmBudgetCurrency(value: string | null | undefined): value is CrmBudgetCurrency {
  return CRM_BUDGET_CURRENCIES.some((currency) => currency === value);
}

export function parseCrmBudgetInput(input: string, currency: CrmBudgetCurrency): ParsedCrmBudget | null {
  const compact = input.trim().replace(/[\s\u00a0\u202f]+/g, "");
  if (!compact) return null;
  if (!budgetPattern.test(compact)) return null;
  const amount = Number(compact);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return { amount, currency };
}

export function formatCrmBudget(amount: number | string, currency: CrmBudgetCurrency): string {
  const numericAmount = typeof amount === "number" ? amount : Number(amount);
  const grouped = Math.trunc(numericAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (currency === "USD") return `$${grouped}`;
  if (currency === "EUR") return `€${grouped}`;
  if (currency === "PLN") return `${grouped} zł`;
  return `${grouped} ₴`;
}

export function getCrmBudgetInputValue({ amount, currency }: { amount: number | null; currency: string | null }): string {
  if (amount === null || !isCrmBudgetCurrency(currency)) return "";
  return Math.trunc(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
