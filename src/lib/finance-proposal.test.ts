import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createProposalSnapshot, parseProjectNumber, proposalPresentation, proposalPriceBasis, proposalSnapshotSchema, studioContactDetailsSchema } from "./finance-proposal";
import { projectClientPaymentSchedule, projectPaymentDefaultKey, projectVatAmounts } from "./finance-project-plan";
import { renderProposalPdf } from "./finance-proposal-pdf";
import { mkdirSync, writeFileSync } from "node:fs";

function source(percentages = [30,50,20], basis: "net" | "gross" | null = "net") {
  const vatRate = basis === null ? null : "23";
  const price = projectVatAmounts("4000",vatRate,basis,2);
  const amounts = projectClientPaymentSchedule(price.gross, percentages.map(String), vatRate, basis, 2).grossAmounts;
  const names = ["Створення функціонального планування", "Створення 3D-візуалізації", "Розробка робочої документації та специфікації"];
  return { schemaVersion: 1, projectId: randomUUID(), projectNumber: "336", revision: 1, date: "2026-09-30", projectTitle: "336 Стоматологічна клініка", clientName: "Олена Коваль", contact: "olena@example.test · +380 44 123 45 67", address: "Київ, вул. Архітектора Городецького, 12, приміщення 4", intro: "Площа об’єкта попередня та може бути уточнена після обмірів.", studioContactDetails: {website:"https://space.example",email:"hello@space.example",phone:"+380 44 000 00 00",businessAddress:"Київ, вул. Городецького, 12"}, studioContacts: "space.example · hello@space.example · +380 44 000 00 00", area: "100", clientRatePerM2: basis === "net" ? "49.2" : "40", currency: "EUR", minorUnits: 2, gross: price.gross, vatRate, vatAmount: price.vat, rows: percentages.map((percentage,i)=>({ id: randomUUID(), name: percentages.length===3 ? names[i] : `Етап ${i+1} · ${names[i%3]}`, percentage: String(percentage), gross: amounts[i], note: "Оплата перед початком відповідного етапу." })) };
}
describe("Commercial Proposal V1",()=>{
  it.each([["336 Стоматологічна клініка","336"],["336_Стоматологічна клініка","336"],[" 336 — Клініка ","336"],["00336 Clinic","00336"],["336","336"],["Clinic 336",null],["336A Clinic",null],["",null]])("extracts the leading project number from %s",(name,number)=>expect(parseProjectNumber(name)).toBe(number));
  it.each([[50,50],[30,50,20],[25,25,25,25]])("preserves the canonical Finance schedule %j",(...percentages)=>{
    const data=source(percentages); const snapshot=createProposalSnapshot(data,proposalPresentation(proposalSnapshotSchema.parse(data)));
    expect(snapshot.rows).toEqual(data.rows); expect(snapshot.rows).toHaveLength(percentages.length);
  });
  it.each(["net","gross",null] as const)("uses one Gross payable client price for %s pricing",(basis)=>{
    const data=source([30,50,20],basis); const snapshot=createProposalSnapshot({...data,revenueTaxRate:"6",afterTax:"3760",netAmount:"4000"},data);
    expect(snapshot.gross).toBe(basis==="net"?"4920.00":"4000.00");
    expect(snapshot.rows.reduce((sum,row)=>sum+Math.round(Number(row.gross)*100),0)).toBe(Math.round(Number(snapshot.gross)*100));
    expect(snapshot).not.toHaveProperty("revenueTaxRate"); expect(snapshot).not.toHaveProperty("afterTax"); expect(snapshot).not.toHaveProperty("netAmount");
  });
  it("copies snapshots independently of later client/address/Finance edits",()=>{
    const data=source();const snapshot=createProposalSnapshot(data,data);const before=JSON.stringify(snapshot);
    data.projectTitle="999 Changed";data.clientName="Changed";data.address="Changed";data.clientRatePerM2="1";data.intro="Changed";data.studioContacts="Changed";data.studioContactDetails.email="changed@example.test";data.gross="1";data.vatRate=null;data.rows[0].name="Changed";data.rows.pop();
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("accepts saved proposals without the new presentation context",()=>{
    const {clientRatePerM2,studioContacts,studioContactDetails,...legacy}=source();
    expect(proposalSnapshotSchema.parse(legacy)).not.toHaveProperty("clientRatePerM2");
    expect(createProposalSnapshot(source(),{...source(),studioContacts:"space.example · hello@space.example"}).studioContacts).toBe("space.example · hello@space.example");
  });
  it("marks a rounded area tariff when its product differs from the authoritative total",()=>{
    expect(proposalPriceBasis({...source(),area:"91.7",clientRatePerM2:"40",gross:"3668.00",currency:"USD"})).toBe("91,7 м² × 40 USD/м²");
    expect(proposalPriceBasis({...source(),area:"101",clientRatePerM2:"123.0050",gross:"12423.50"})).toBe("101 м² × ≈ 123,005 EUR/м²");
    expect(proposalPriceBasis({...source(),clientRatePerM2:null})).toBeNull();
  });
  it("validates structured reusable studio contacts",()=>{
    const contacts={website:" https://space.example ",email:" hello@space.example ",phone:" +380 44 000 00 00 ",businessAddress:" Kyiv "};
    expect(studioContactDetailsSchema.parse(contacts)).toEqual({website:"https://space.example",email:"hello@space.example",phone:"+380 44 000 00 00",businessAddress:"Kyiv"});
    expect(studioContactDetailsSchema.safeParse({...contacts,website:"javascript:alert(1)"}).success).toBe(false);
    expect(studioContactDetailsSchema.safeParse({...contacts,email:"not an email"}).success).toBe(false);
    expect(studioContactDetailsSchema.safeParse({website:"",email:"",phone:"",businessAddress:""}).success).toBe(true);
  });
  it("uses requested schedule defaults",()=>{
    expect(projectPaymentDefaultKey([100],0)).toBe("projectPayment");expect([0,1].map(i=>projectPaymentDefaultKey([50,50],i))).toEqual(["advance","finalPayment"]);
    expect([0,1,2].map(i=>projectPaymentDefaultKey([30,50,20],i))).toEqual(["planningStage","visualizationStage","documentationStage"]);
    expect(projectPaymentDefaultKey([25,25,25,25],2)).toBe("paymentNumber");
  });
  it("renders embedded Ukrainian text in representative A4 PDFs",async()=>{
    mkdirSync('/tmp/studioflow-proposals',{recursive:true});
    for(const percentages of [[50,50],[30,50,20],[25,25,25,25],Array(10).fill(10)]){
      const data=source(percentages);
      if(percentages.length===4){data.projectTitle="336 Стоматологічна клініка з навчальним центром та адміністративними приміщеннями";data.rows[0].name="Створення функціонального планування клініки та погодження сценаріїв роботи навчального центру";}
      const snapshot=proposalSnapshotSchema.parse(data);const pdf=await renderProposalPdf(snapshot);
      expect(pdf.subarray(0,5).toString()).toBe("%PDF-");expect(pdf.length).toBeGreaterThan(10000);
      writeFileSync(`/tmp/studioflow-proposals/proposal-${percentages.length}.pdf`,pdf);
    }
    const longContacts=proposalSnapshotSchema.parse({...source([25,25,25,25]),studioContactDetails:{website:`https://space.example/${"s".repeat(240)}`,email:"hello@space.example",phone:"+380 44 000 00 00",businessAddress:"Адреса студії: вул. Архітектора Городецького, Київ. ".repeat(10).slice(0,500)}});
    writeFileSync('/tmp/studioflow-proposals/proposal-long-contacts.pdf',await renderProposalPdf(longContacts));
  },30000);
});
