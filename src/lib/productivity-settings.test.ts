import { expect, it } from "vitest";
import { getProductivityStageRatios, productivityStagePercentSchema } from "./productivity-settings";

it.each([0, 30, 37.5, 100])("accepts %s percent and derives the complementary share", percent => {
  expect(productivityStagePercentSchema.safeParse(percent).success).toBe(true);
  const ratios = getProductivityStageRatios(percent);
  expect(ratios.stage_1).toBe(percent / 100);
  expect(ratios.stage_1 + ratios.stage_3).toBeCloseTo(1);
});

it.each([-1, 100.1, NaN, Infinity, null, "30"])("rejects invalid percentage %s", percent => {
  expect(productivityStagePercentSchema.safeParse(percent).success).toBe(false);
});
