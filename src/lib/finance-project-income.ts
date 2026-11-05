import { z } from "zod";
import { expectedInputSchema } from "./finance-planning";

const optionalId = z.union([z.uuid(), z.literal("")]).default("");
export const projectIncomeSchema = expectedInputSchema.safeExtend({
  id: z.literal("").default(""),
  direction: z.literal("incoming"),
  projectId: z.uuid(),
  stream: z.enum(["contractor_bonus", "other"]),
  mode: z.enum(["expected", "received"]),
  contractorId: optionalId,
  accountId: optionalId,
  date: z.union([z.iso.date(), z.literal("")]).default(""),
}).superRefine((input, context) => {
  if (input.contractorId && input.stream !== "contractor_bonus") {
    context.addIssue({ code: "custom", path: ["contractorId"], message: "contractor_stream" });
  }
  if (input.mode === "received" && (!input.accountId || !input.date || input.commitment !== "agreed"
    || input.certainty !== "fixed" || input.established !== "true")) {
    context.addIssue({ code: "custom", path: ["mode"], message: "receipt_required" });
  }
});
