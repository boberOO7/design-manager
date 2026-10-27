import { z } from "zod";

export const DEFAULT_PRODUCTIVITY_STAGE_1_PERCENT = 20;
export const productivityStagePercentSchema = z.number().min(0).max(100);

export function getProductivityStageRatios(stageOnePercent: number) {
  return { stage_1: stageOnePercent / 100, stage_3: (100 - stageOnePercent) / 100 };
}
