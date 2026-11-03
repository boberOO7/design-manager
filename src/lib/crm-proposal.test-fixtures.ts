import type { Database } from "@/types/database.types";
import type { ProposalCommercialTerms } from "./proposal-commercial-terms";

export const proposalLead: Database["public"]["Tables"]["crm_leads"]["Row"] = {
  id: "00000000-0000-4000-8000-000000000001", studio_id: "00000000-0000-4000-8000-000000000002",
  client_name: "Олена", company: "Клініка", phone: "+380501234567", email: null,
  city: "Київ", site_address: "вул. Миру, 1", country: "UA", country_code: "UA",
  approximate_area: 100, budget_amount: 99999, budget_currency: "EUR", budget_note: null,
  expected_project_type: null, expected_project_type_custom: null, first_contact_date: "2026-11-01", next_contact_at: null,
  internal_notes: "Private note", request_description: "Private request", source: null, status: "new", invalid_reason: null,
  project_id: null, responsible_admin_id: null, city_geonames_id: null, last_contacted_at: null,
  created_at: "2026-11-01T12:00:00+00:00", updated_at: "2026-11-01T12:00:00+00:00",
};
export const leadQuoteTerms: ProposalCommercialTerms = {
  number: "336", pricingMethod: "fixed", amount: "4000", area: "", rate: "", currency: "EUR",
  discountType: "percentage", discountValue: "10", vatRate: "20", priceBasis: "net",
  payments: [30, 50, 20].map((percentage, index) => ({ id: `00000000-0000-4000-8000-00000000001${index}`,
    name: `Етап ${index + 1}`, percentage: String(percentage), note: "Перед початком" })),
};
export const quoteContacts = { website: "https://studio.example", email: "studio@example.test", phone: "", businessAddress: "", contactPerson: "" };

