import type { ProposalSnapshot } from "@/lib/finance-proposal";

export { proposalDesignVariants, type ProposalConceptVariant as ProposalDesignVariant } from "@/lib/finance-proposal";

// Same representative content as the approved A4 concepts; never loaded from Finance.
export const proposalDesignSample = {
  schemaVersion: 1, projectId: "00000000-0000-4000-8000-000000000123",
  projectNumber: "123", revision: 2, date: "2026-10-01",
  projectTitle: "123_Дім у Львові", clientName: "Лілія Коваль",
  contact: "+38 (067) 123-45-67", address: "Львів, вул. Гіпсова, 12",
  intro: "Площа попередня та може бути уточнена після обмірів.",
  area: "264", clientRatePerM2: "49.2", currency: "USD", minorUnits: 2,
  gross: "11689.92", vatRate: "23", vatAmount: "2185.92",
  pricing: {
    listAmount: "12988.80", priceBasis: "gross", discountType: "percentage",
    discountValue: "10", discountAmount: "1298.88", agreedAmount: "11689.92",
    net: "9504.00", listGross: "12988.80", discountGross: "1298.88",
  },
  rows: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Аванс", percentage: "40", gross: "4675.97", note: "" },
    { id: "00000000-0000-4000-8000-000000000002", name: "Після затвердження концепції", percentage: "35", gross: "4091.47", note: "" },
    { id: "00000000-0000-4000-8000-000000000003", name: "Фінальний платіж", percentage: "25", gross: "2922.48", note: "" },
  ],
  studioContactDetails: {
    website: "https://space-design.pro", email: "info@space-design.pro",
    phone: "+38 (067) 123-45-67", businessAddress: "вул. Гіпсова, Львів, Україна",
  },
} satisfies ProposalSnapshot;
