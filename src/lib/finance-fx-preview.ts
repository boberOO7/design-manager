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
