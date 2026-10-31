import { expect, it } from "vitest";
import { projectFinanceLoadingRows } from "./project-finance-loading";

it("uses existing confirmed agreement counts without inventing rows for drafts or empty schedules", () => {
  expect(projectFinanceLoadingRows({
    orders: [{ id: "a", status: "confirmed" }, { id: "b", status: "confirmed" }, { id: "c", status: "draft" }, { id: "d", status: "confirmed" }],
    orderTotals: [{ order_id: "a", payment_count: 3 }, { order_id: "b", payment_count: 2 }, { order_id: "c", payment_count: 10 }, { order_id: "d", payment_count: 0 }],
  }, 1)).toEqual([3, 2]);
});

it("limits the placeholder to the same page window as planning, including partial groups", () => {
  const project = { orders: [{ id: "a", status: "confirmed" }, { id: "b", status: "confirmed" }], orderTotals: [{ order_id: "a", payment_count: 45 }, { order_id: "b", payment_count: 12 }] };
  expect(projectFinanceLoadingRows(project, 1)).toEqual([45, 5]);
  expect(projectFinanceLoadingRows(project, 2)).toEqual([7]);
  expect(projectFinanceLoadingRows(project, 3)).toEqual([]);
});
