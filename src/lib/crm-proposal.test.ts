import { describe, expect, it } from "vitest";
import { createLeadProposalSource, resolveLeadProposalIdentity } from "./crm-proposal";
import { proposalCommercialTermsSchema } from "./proposal-commercial-terms";
import { createProposalSnapshot, proposalPresentation, proposalSnapshotSchema } from "./finance-proposal";
import type { ProposalCommercialTerms } from "./proposal-commercial-terms";

import { proposalLead, leadQuoteTerms, quoteContacts } from "./crm-proposal.test-fixtures";

describe("lead commercial proposal", () => {
  it("accepts the reported pasted number/title and points validation at the actual field", () => {
    expect(resolveLeadProposalIdentity("546 Бімба", "Клініка")).toEqual({ number: "546", title: "Бімба" });
    expect(resolveLeadProposalIdentity("546", "Клініка")).toEqual({ number: "546", title: "Клініка" });
    const invalidNumber = proposalCommercialTermsSchema.safeParse({ ...leadQuoteTerms, number: "Бімба" });
    expect(invalidNumber.success ? [] : invalidNumber.error.issues.map(issue => issue.path)).toEqual([["number"]]);
    const missingRate = proposalCommercialTermsSchema.safeParse({ ...leadQuoteTerms, pricingMethod: "area", amount: "", area: "100", rate: "" });
    expect(missingRate.success ? [] : missingRate.error.issues.map(issue => issue.path)).toEqual([["rate"]]);
  });
  it("uses explicit quote terms and Finance rounding without a project or lead-budget price", () => {
    const source = createLeadProposalSource(proposalLead, leadQuoteTerms, { code: "EUR", minor_units: 2 }, quoteContacts, 1, "2026-11-03");
    expect(source).toMatchObject({ schemaVersion: 3, projectId: null, leadId: proposalLead.id, projectNumber: "336",
      gross: "4320.00", vatAmount: "720.00", clientName: "Олена", address: "Київ, вул. Миру, 1" });
    expect(source.rows.map(row => row.gross)).toEqual(["1296.00", "2160.00", "864.00"]);
    expect(source).not.toHaveProperty("internal_notes");
    expect(source).not.toHaveProperty("budget_amount");
    const snapshot = createProposalSnapshot(source, { ...proposalPresentation(source), projectTitle: "Нова клініка", designVariant: "folded-plane", showPercentages: false });
    expect(snapshot).toMatchObject({ leadId: proposalLead.id, gross: "4320.00", projectTitle: "Нова клініка", showPercentages: false });
    expect(source.projectTitle).toBe("Клініка");
    expect(proposalSnapshotSchema.safeParse({ ...source, projectId: proposalLead.id }).success).toBe(false);
  });

  it("supports area pricing and rejects unbalanced or zero-sized payment schedules", () => {
    const terms = { ...leadQuoteTerms, pricingMethod: "area", amount: "", area: "100", rate: "40", discountType: "none", discountValue: "0", vatRate: null, priceBasis: null } satisfies ProposalCommercialTerms;
    const source = createLeadProposalSource(proposalLead, terms, { code: "EUR", minor_units: 2 }, quoteContacts, 2, "2026-11-03");
    expect(source).toMatchObject({ gross: "4000.00", area: "100", clientRatePerM2: "40.00", revision: 2 });
    expect(() => createLeadProposalSource(proposalLead, { ...terms, payments: terms.payments.slice(0, 1) }, { code: "EUR", minor_units: 2 }, quoteContacts, 1, "2026-11-03")).toThrow();
    expect(() => createLeadProposalSource(proposalLead, { ...terms, amount: "0.01", pricingMethod: "fixed" }, { code: "EUR", minor_units: 2 }, quoteContacts, 1, "2026-11-03")).toThrow();
  });
});
