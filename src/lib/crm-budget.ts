export const CRM_BUDGET_CURRENCIES = ["UAH", "USD"] as const;

export type CrmBudgetCurrency = (typeof CRM_BUDGET_CURRENCIES)[number];
export type ParsedCrmBudget = { amount: number; currency: CrmBudgetCurrency };

const budgetPattern = /^(?:\$(\d{1,12})|(\d{1,12})\$|₴?(\d{1,12})₴?)$/;

export function parseCrmBudgetInput(input: string): ParsedCrmBudget | null {
  const compact = input.trim().replace(/[\s\u00a0\u202f]+/g, "");
  if (!compact) return null;
  const match = budgetPattern.exec(compact);
  if (!match) return null;
  const rawAmount = match[1] ?? match[2] ?? match[3];
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return { amount, currency: compact.includes("$") ? "USD" : "UAH" };
}

export function formatCrmBudget(amount: number | string, currency: CrmBudgetCurrency): string {
  const numericAmount = typeof amount === "number" ? amount : Number(amount);
  const grouped = Math.trunc(numericAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return currency === "USD" ? `$${grouped}` : `${grouped} ₴`;
}

export function getCrmBudgetInputValue({ amount, currency, legacyNote }: { amount: number | null; currency: string | null; legacyNote: string | null }): string {
  if (amount !== null && (currency === "UAH" || currency === "USD")) return formatCrmBudget(amount, currency);
  return legacyNote ?? "";
}
