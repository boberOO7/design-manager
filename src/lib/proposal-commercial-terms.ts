import { z } from "zod";
import { projectPlanSchema } from "./finance-project-plan";

const plan = projectPlanSchema.shape;
export const proposalCommercialTermsSchema = z.object({
  number: z.string().trim().regex(/^\d+$/),
  pricingMethod: plan.pricingMethod, amount: z.union([plan.amount, z.literal("")]),
  area: plan.area, rate: plan.rate, currency: plan.currency,
  discountType: plan.discountType, discountValue: plan.discountValue,
  vatRate: plan.vatRate, priceBasis: plan.priceBasis,
  payments: z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(2000),
    percentage: z.string().regex(/^\d{1,3}(?:\.\d{1,4})?$/), note: z.string().trim().max(300),
  })).min(1),
}).superRefine((value, context) => {
  if ((value.vatRate === null) !== (value.priceBasis === null)) context.addIssue({ code: "custom", path: ["vatRate"], message: "vat" });
  for (const field of value.pricingMethod === "fixed" ? ["amount"] as const : ["area", "rate"] as const) {
    if (!plan.amount.safeParse(value[field]).success) context.addIssue({ code: "custom", path: [field], message: "amount" });
  }
  if (new Set(value.payments.map(item => item.id)).size !== value.payments.length) context.addIssue({ code: "custom", path: ["payments"], message: "duplicate" });
});
export type ProposalCommercialTerms = z.infer<typeof proposalCommercialTermsSchema>;

export const leadProposalContextSchema = z.object({
  title: z.string(), area: z.string(), currency: z.string(), terms: proposalCommercialTermsSchema.nullable(),
  currencies: z.array(z.object({ code: z.string(), minor_units: z.number().int().min(0).max(4) })),
});
export type LeadProposalContext = z.infer<typeof leadProposalContextSchema>;
