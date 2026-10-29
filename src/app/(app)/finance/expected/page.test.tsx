import { beforeEach, expect, it, vi } from "vitest";
import FinanceExpectedPage from "./page";

const mocks = vi.hoisted(() => ({ foundation: vi.fn(), planning: vi.fn(), fx: vi.fn() }));
vi.mock("@/data/queries/finance", () => ({ getFinanceData: mocks.foundation, getFinancePlanning: mocks.planning }));
vi.mock("@/lib/finance-fx", () => ({ resolveFinanceFx: mocks.fx }));
vi.mock("@/lib/validation/project", () => ({ getKyivDateOnly: () => "2026-10-28" }));
vi.mock("@/components/finance/expected-workspace", () => ({ FinanceExpectedWorkspace: () => null }));

const usdItem = { id: "salary", currency: "USD", amount: 38.95, remaining_amount: 38.95, commitment: "agreed" };
const payout = { expected_item_id: "salary", component: "payout", obligation: { kind: "payroll" } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.foundation.mockResolvedValue({});
  mocks.planning.mockResolvedValue({ items: [usdItem], obligations: [payout] });
  mocks.fx.mockResolvedValue({ rate: "45.6008", source: "nbu", effectiveDate: "2026-10-28" });
});

it("provides a dated UAH estimate for USD payroll without changing the accrual", async () => {
  const page = await FinanceExpectedPage({ searchParams: Promise.resolve({}) });
  expect(mocks.fx).toHaveBeenCalledExactlyOnceWith("USD", "UAH", "2026-10-28", "nbu", "");
  expect(page.props.payrollUsdRate).toBe("45.6008");
  expect(page.props.items).toEqual([usdItem]);
});

it("does not fetch payroll rates for other payments or UAH salaries", async () => {
  for (const planning of [
    { items: [usdItem], obligations: [] },
    { items: [usdItem], obligations: [{ ...payout, component: "deductions" }] },
    { items: [{ ...usdItem, currency: "UAH" }], obligations: [payout] },
    { items: [{ ...usdItem, remaining_amount: 0 }], obligations: [payout] },
    { items: [{ ...usdItem, commitment: "cancelled" }], obligations: [payout] },
  ]) {
    mocks.planning.mockResolvedValue(planning);
    const page = await FinanceExpectedPage({ searchParams: Promise.resolve({}) });
    expect(page.props.payrollUsdRate).toBeUndefined();
  }
  expect(mocks.fx).not.toHaveBeenCalled();
});

it("keeps expected payments available when the indicative rate is unavailable", async () => {
  mocks.fx.mockRejectedValue(new Error("NBU unavailable"));
  const page = await FinanceExpectedPage({ searchParams: Promise.resolve({}) });
  expect(page.props.payrollUsdRate).toBeUndefined();
  expect(page.props.items).toEqual([usdItem]);
});
