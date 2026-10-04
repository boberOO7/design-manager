import { z } from "zod";
import { forecastReportSchema } from "./finance-forecast";
import { financeRateSchema } from "./finance-movements";
import { planningAmount } from "./finance-planning";
const money = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const identity = { id: z.uuid() };
export const scenarioAssumptionSchema = z.discriminatedUnion("type", [
  z.object({ ...identity, type:z.literal("income_delay"),itemId:z.uuid(),date:z.iso.date() }),
  z.object({ ...identity, type:z.literal("expense_change"),itemId:z.uuid(),date:z.iso.date().optional(),amount:z.string().regex(/^\d+(?:\.\d+)?$/).optional() }).refine(v => v.date !== undefined || v.amount !== undefined),
  z.object({ ...identity,type:z.literal("expense"),description:z.string().trim().min(1).max(2000),categoryId:z.uuid(),currency:z.string(),amount:planningAmount,date:z.iso.date(),repeat:z.enum(["once","monthly"]),endDate:z.iso.date().optional() }),
  z.object({ ...identity,type:z.literal("order"),description:z.string().trim().min(1).max(2000),categoryId:z.uuid(),currency:z.string(),payments:z.array(z.object({id:z.uuid(),date:z.iso.date(),amount:planningAmount})).min(1) }),
  z.object({ ...identity,type:z.literal("fx"),currency:z.string(),rate:financeRateSchema }),
]);
export const scenarioAssumptionsSchema = z.array(scenarioAssumptionSchema);
export type ScenarioAssumption = z.infer<typeof scenarioAssumptionSchema>;
export const scenarioInputSchema = z.object({ requestId:z.uuid(),scenarioId:z.union([z.uuid(),z.literal("")]).default(""),revision:z.coerce.number().int().min(0),baseId:z.uuid(),
  name:z.string().trim().min(1).max(120),reason:z.string().trim().min(1).max(2000),assumptions:scenarioAssumptionsSchema,rebaseConfirmed:z.enum(["true","false"]).default("false") });
export const scenarioReportSchema = forecastReportSchema.extend({ daily:z.array(z.object({date:z.iso.date(),amount:money})),
  riskIncomplete:z.boolean().default(false),lowPoint:z.object({date:z.iso.date(),amount:money}).nullable(), firstDeficit:z.iso.date().nullable(), incomplete:z.boolean() });
export type ScenarioReport = z.infer<typeof scenarioReportSchema>;
export const scenarioNativeInputsSchema = z.object({ version:z.literal(2),asOf:z.iso.date(),currency:z.string(),horizon:z.string(),scenario:z.string(),
  expected:z.array(z.object({id:z.uuid(),description:z.string(),direction:z.enum(["incoming","outgoing"]),currency:z.string(),remaining_amount:money,
    expected_payment_date:z.iso.date().nullable(),due_date:z.iso.date().nullable(),version:z.number().int(),commitment:z.enum(["agreed","tentative"])})),
  categories:z.array(z.object({id:z.uuid(),name:z.string(),direction:z.enum(["incoming","outgoing"]),nature:z.string(),archivedAt:z.string().nullable().optional(),default_key:z.string().nullable().optional(),custom_name:z.boolean().optional()})),
  currencies:z.array(z.object({code:z.string(),minorUnits:z.number().int()})) });
export const scenarioRevisionSchema = z.object({id:z.uuid(),scenarioId:z.uuid(),revision:z.number().int(),name:z.string(),baseId:z.uuid(),baseName:z.string(),asOf:z.iso.date(),
  assumptions:scenarioAssumptionsSchema,reason:z.string(),createdAt:z.string(),history:z.array(z.object({revision:z.number().int(),name:z.string(),baseId:z.uuid(),reason:z.string(),createdAt:z.string(),assumptions:scenarioAssumptionsSchema})).default([]),report:scenarioReportSchema.nullable(),
  rebasePreview:z.object({changes:z.array(z.object({id:z.uuid(),label:z.string(),status:z.enum(["changed","missing","added"]),before:z.unknown(),after:z.unknown()})),
    invalidItemIds:z.array(z.uuid()),cashChanged:z.boolean()}).nullable() });
export const scenarioWorkspaceSchema = z.object({bases:z.array(z.object({id:z.uuid(),name:z.string(),asOf:z.iso.date(),createdAt:z.string(),nativeVersion:z.number().nullable()})),
  base:z.object({id:z.uuid(),name:z.string(),inputs:scenarioNativeInputsSchema}).nullable(), baseline:scenarioReportSchema.nullable(), sourceChanged:z.boolean(), scenarios:z.array(scenarioRevisionSchema) });
export type ScenarioWorkspace = z.infer<typeof scenarioWorkspaceSchema>;
