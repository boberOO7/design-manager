import { financeAmountText, financeAmountUnits } from "./finance";

// Indicative UI math. The database remains authoritative when recording a payment.
function units(value: string | number, digits: number): bigint | null {
  const match = String(value).replace(",", ".").match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > digits) return null;
  return BigInt(match[1]) * BigInt(10) ** BigInt(digits) + BigInt((match[2] ?? "").padEnd(digits, "0") || "0");
}

function decimal(value: bigint, digits: number): string {
  const factor = BigInt(10) ** BigInt(digits);
  return digits ? `${value / factor}.${String(value % factor).padStart(digits, "0")}` : String(value);
}

export function indicativeFinanceConversion(amount: string | number, rate: string, sourceDigits: number, targetDigits: number): string | null {
  const cash = units(amount, sourceDigits), fx = units(rate, 10);
  if (cash === null || fx === null || fx <= BigInt(0)) return null;
  const denominator = BigInt(10) ** BigInt(sourceDigits + 10);
  return decimal((cash * fx * BigInt(10) ** BigInt(targetDigits) + denominator / BigInt(2)) / denominator, targetDigits);
}

export function fullFinanceSettlementAmount(remaining: string | number, rate: string, accountDigits: number, obligationDigits: number): string | null {
  const obligation = units(remaining, obligationDigits), fx = units(rate, 10);
  if (obligation === null || fx === null || fx <= BigInt(0)) return null;
  const numerator = obligation * BigInt(10) ** BigInt(accountDigits + 10);
  const denominator = fx * BigInt(10) ** BigInt(obligationDigits);
  return decimal((numerator + denominator - BigInt(1)) / denominator, accountDigits);
}

export function actualFinanceSettlementRate(cash: string, equivalent: string, cashDigits: number, obligationDigits: number): string | null {
  const principal = units(cash.replace(",", "."), cashDigits), target = units(equivalent.replace(",", "."), obligationDigits);
  if (principal === null || target === null || principal <= BigInt(0) || target <= BigInt(0)) return null;
  const numerator = target * BigInt(10) ** BigInt(cashDigits + 10);
  const denominator = principal * BigInt(10) ** BigInt(obligationDigits);
  const rate = (numerator + denominator / BigInt(2)) / denominator;
  return rate > BigInt(0) && rate <= BigInt(1_000_000_000) * BigInt(10) ** BigInt(10) ? decimal(rate, 10) : null;
}

export function proposeFinanceAllocations(converted: string, remaining: string[], digits: number): string[] {
  let available = financeAmountUnits(converted, digits);
  return remaining.map(value => {
    const balance = financeAmountUnits(value, digits);
    const applied = balance < available ? balance : available;
    available -= applied;
    return financeAmountText(applied, digits);
  });
}

// Cumulative rounding conserves the one real native principal across the split.
// A positive contractual allocation must consume at least one native minor unit.
export function previewFinanceAllocationSplit(cash: string, rate: string, amounts: string[], cashDigits: number, obligationDigits: number) {
  const principal = financeAmountUnits(cash.replace(",", "."), cashDigits);
  const converted = indicativeFinanceConversion(cash.replace(",", "."), rate, cashDigits, obligationDigits);
  if (principal <= BigInt(0) || !converted) throw new Error("invalid");
  const budget = financeAmountUnits(converted, obligationDigits);
  const fx = financeAmountUnits(rate.replace(",", "."), 10);
  let cumulative = BigInt(0), used = BigInt(0);
  const allocations = amounts.map(value => {
    const amount = financeAmountUnits(value.trim().replace(",", "."), obligationDigits);
    if (amount < BigInt(0)) throw new Error("invalid");
    cumulative += amount;
    if (cumulative > budget) throw new Error("overallocated");
    const numerator = cumulative * BigInt(10) ** BigInt(cashDigits + 10);
    const denominator = fx * BigInt(10) ** BigInt(obligationDigits);
    const next = amount === BigInt(0) ? used : cumulative === budget ? principal : (numerator + denominator - BigInt(1)) / denominator;
    if (next > principal || (amount > BigInt(0) && next <= used)) throw new Error("unrepresentable");
    const native = next - used;
    used = next;
    return { amount: financeAmountText(amount, obligationDigits), paymentAmount: financeAmountText(native, cashDigits) };
  });
  return { allocations, converted, advance: financeAmountText(principal - used, cashDigits) };
}
