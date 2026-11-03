import type { Database } from "@/types/database.types";
import { parseProposalProjectName, proposalSnapshotSchema, type StudioContactDetails } from "./finance-proposal";
import { proposalCommercialTermsSchema, type ProposalCommercialTerms } from "./proposal-commercial-terms";
import { projectAreaValue, projectClientPaymentSchedule, projectDiscountAmounts, projectMoneyText, projectMoneyUnits, projectPaymentAmounts, projectVatAmounts } from "./finance-project-plan";

export function resolveLeadProposalIdentity(number: string, title: string) {
  const parsed = parseProposalProjectName(number);
  return { number: parsed.number ?? number.trim(),
    title: parsed.number && parsed.title !== number.trim() ? parsed.title : title.trim() };
}

export function createLeadProposalSource(lead: Database["public"]["Tables"]["crm_leads"]["Row"], termsInput: ProposalCommercialTerms,
  currency: { code: string; minor_units: number }, contacts: StudioContactDetails, revision: number, date: string) {
  const terms = proposalCommercialTermsSchema.parse(termsInput);
  if (terms.currency !== currency.code) throw new Error("currency");
  const digits = currency.minor_units;
  const list = terms.pricingMethod === "area" ? projectAreaValue(terms.area, terms.rate, digits) : terms.amount;
  const discount = projectDiscountAmounts(list, terms.discountType, terms.discountValue, digits);
  const amounts = projectVatAmounts(discount.agreed, terms.vatRate, terms.priceBasis, digits);
  const listAmounts = projectVatAmounts(list, terms.vatRate, terms.priceBasis, digits);
  const percentages = terms.payments.map(item => item.percentage);
  projectPaymentAmounts(amounts.gross, percentages, digits);
  const grossRows = projectClientPaymentSchedule(amounts.gross, percentages, terms.vatRate, terms.priceBasis, digits).grossAmounts;
  if (grossRows.some(amount => projectMoneyUnits(amount, digits) <= BigInt(0))) throw new Error("amount");
  return proposalSnapshotSchema.parse({
    schemaVersion: 3, projectId: null, leadId: lead.id, leadUpdatedAt: lead.updated_at,
    commercialTerms: terms, projectNumber: terms.number, revision, date,
    projectTitle: lead.company || lead.client_name, clientName: lead.client_name,
    contact: lead.phone || lead.email || "", address: [lead.city, lead.site_address].filter(Boolean).join(", "), intro: "",
    studioContactDetails: contacts, currency: currency.code, minorUnits: digits,
    area: terms.pricingMethod === "area" ? terms.area : lead.approximate_area?.toString() ?? null,
    clientRatePerM2: terms.pricingMethod === "area" ? projectVatAmounts(projectAreaValue("1", terms.rate, digits), terms.vatRate, terms.priceBasis, digits).gross : null,
    gross: amounts.gross, vatRate: terms.vatRate, vatAmount: amounts.vat,
    pricing: { listAmount: list, priceBasis: terms.priceBasis, discountType: terms.discountType, discountValue: terms.discountValue,
      discountAmount: discount.discount, agreedAmount: discount.agreed, net: amounts.net,
      listGross: listAmounts.gross,
      discountGross: projectMoneyText(projectMoneyUnits(listAmounts.gross, digits) - projectMoneyUnits(amounts.gross, digits), digits),
    },
    rows: terms.payments.map((item, index) => ({ id: item.id, name: item.name, percentage: item.percentage, gross: grossRows[index], note: item.note })),
  });
}
