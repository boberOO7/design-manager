import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createProposalSnapshot, parseProjectNumber, parseProposalProjectName, proposalFilename, proposalPresentation, proposalPriceBasis, proposalAreaBreakdown, proposalSnapshotSchema, studioContactDetailsSchema, studioContactDetailsInputSchema, studioWebsiteDisplay, proposalDesignVariants, resolveProposalDesignVariant } from "./finance-proposal";
import { projectAreaValue, projectClientPaymentSchedule, projectDiscountAmounts, projectPaymentDefaultKey, projectVatAmounts } from "./finance-project-plan";
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
  it("preserves legacy filenames and freezes independent order/source identity in V2", () => {
    const legacy = proposalSnapshotSchema.parse(source());
    expect(proposalFilename(legacy)).toBe("SPACE-336-r1.pdf");
    const order = { id: randomUUID(), name: "Фасад", status: "draft" };
    const draft = { ...legacy, schemaVersion: 2, order, sourceRevision: 4 };
    const snapshot = createProposalSnapshot(draft, proposalPresentation(legacy));
    expect(snapshot.schemaVersion).toBe(2);
    expect(proposalFilename(snapshot)).toBe(`SPACE-336-${order.id}-r1.pdf`);
    expect(snapshot).toMatchObject({ order: { name: "Фасад", status: "draft" }, sourceRevision: 4 });
    order.name = "Changed scope";
    expect(snapshot).toMatchObject({ order: { name: "Фасад" } });
    expect(snapshot.gross).toBe(legacy.gross);
    expect(snapshot.rows).toEqual(legacy.rows);
    expect(proposalSnapshotSchema.safeParse({ ...draft, sourceRevision: 0 }).success).toBe(false);
    expect(proposalSnapshotSchema.safeParse({ ...draft, order: { ...order, status: "discarded" } }).success).toBe(false);
    expect(proposalSnapshotSchema.safeParse({ ...draft, order: undefined }).success).toBe(false);
  });
  it("preserves each chosen design in its own snapshot and maps legacy documents to the original layout", () => {
    const data = source();
    const legacy = createProposalSnapshot(data, data);
    expect(legacy).not.toHaveProperty("designVariant");
    expect(resolveProposalDesignVariant(legacy)).toBe("classic");
    for (const { value } of proposalDesignVariants) {
      const presentation = { ...proposalPresentation(legacy), designVariant: value };
      const snapshot = createProposalSnapshot(data, presentation);
      presentation.designVariant = "measured-space";
      expect(snapshot.designVariant).toBe(value);
      expect(proposalPresentation(snapshot).designVariant).toBe(value);
      expect(snapshot.gross).toBe(legacy.gross);
      expect(snapshot.rows).toEqual(legacy.rows);
    }
    expect(proposalSnapshotSchema.safeParse({ ...data, designVariant: "unknown" }).success).toBe(false);
    expect(proposalSnapshotSchema.safeParse({ ...data, designVariant: null }).success).toBe(false);
  });
  it("freezes percentage visibility as presentation without changing the financial schedule", () => {
    const data = source();
    const legacy = createProposalSnapshot(data, data);
    expect(legacy).not.toHaveProperty("showPercentages");
    const snapshot = createProposalSnapshot(data, { ...proposalPresentation(legacy), showPercentages: false });
    expect(snapshot.showPercentages).toBe(false);
    expect(proposalPresentation(snapshot).showPercentages).toBe(false);
    expect(snapshot.rows).toEqual(legacy.rows);
    expect(snapshot.gross).toBe(legacy.gross);
    expect(proposalSnapshotSchema.safeParse({ ...data, showPercentages: "false" }).success).toBe(false);
  });
  it("renders schedule percentages only when enabled, including continuation pages", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    mkdirSync('tmp/studioflow-proposals', { recursive: true });
    for (const designVariant of ["classic", ...proposalDesignVariants.map(variant => variant.value)] as const) {
      for (const showPercentages of [undefined, false]) {
        const data = source(Array(10).fill(10));
        const snapshot = proposalSnapshotSchema.parse({ ...data, designVariant, showPercentages,
          studioContactDetails: { ...data.studioContactDetails, contactPerson: "Ігор Ляховський" },
        });
        const pdf = await renderProposalPdf(snapshot);
        const task = pdfjs.getDocument({ data: new Uint8Array(pdf) });
        const document = await task.promise;
        expect(document.numPages).toBeGreaterThan(1);
        for (let number = 1; number <= document.numPages; number++) {
          const page = await document.getPage(number);
          const text = (await page.getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
          expect(text.includes("Частка")).toBe(showPercentages !== false);
          expect(text.includes("10 %")).toBe(showPercentages !== false);
          expect(text).toContain("Ігор Ляховський");
          expect(text).toContain("hello@space.example");
        }
        writeFileSync(`tmp/studioflow-proposals/${designVariant}-percentages-${showPercentages !== false}.pdf`, pdf);
        await task.destroy();
      }
    }
  }, 30000);
  it.each([["336 Стоматологічна клініка","336"],["336_Стоматологічна клініка","336"],[" 336 — Клініка ","336"],["00336 Clinic","00336"],["336","336"],["Clinic 336",null],["336A Clinic",null],["",null]])("extracts the leading project number from %s",(name,number)=>expect(parseProjectNumber(name)).toBe(number));
  it.each(["250 Rivne Dental", "250_Rivne Dental", " 250 — Rivne Dental "])("preserves every title character when parsing %s", name => {
    expect(parseProposalProjectName(name)).toEqual({number:"250",title:"Rivne Dental"});
  });
  it("preserves titles without a separated leading project number", () => {
    expect(parseProposalProjectName("Rivne Dental")).toEqual({number:null,title:"Rivne Dental"});
    expect(parseProposalProjectName("250Rivne Dental")).toEqual({number:null,title:"250Rivne Dental"});
    expect(parseProposalProjectName("250")).toEqual({number:"250",title:"250"});
  });
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
  it("snapshots discount inputs, original price and discounted VAT/schedule independently", () => {
    const data = source(), discounted = projectDiscountAmounts("4000","percentage","10",2);
    const price = projectVatAmounts(discounted.agreed,"23","net",2);
    const amounts = projectClientPaymentSchedule(price.gross,["30","50","20"],"23","net",2).grossAmounts;
    const pricing = {listAmount:"4000",priceBasis:"net",discountType:"percentage",discountValue:"10",discountAmount:discounted.discount,agreedAmount:discounted.agreed,net:price.net,listGross:"4920.00",discountGross:"492.00"};
    const current = {...data,pricing,gross:price.gross,vatAmount:price.vat,rows:data.rows.map((row,i)=>({...row,gross:amounts[i]}))};
    const snapshot = createProposalSnapshot(current,current), before = JSON.stringify(snapshot);
    expect(snapshot.pricing).toEqual(pricing); expect(snapshot.gross).toBe("4428.00"); expect(snapshot.vatAmount).toBe("828.00");
    expect(proposalPriceBasis(snapshot)).toBe("100 м² × 49,2 EUR/м²");
    pricing.discountValue="20";pricing.discountAmount="800";current.gross="3936";current.rows[0].gross="1";
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
  it("explains only the frozen coefficient calculation and keeps legacy/manual/unit pricing compact", () => {
    const data = { ...source([100], null), area: "120", clientRatePerM2: "40", gross: "4800.00", currency: "USD", areaCalculation: { actualArea: "800", coefficient: "0.15" } };
    const snapshot = createProposalSnapshot(data, { ...data, areaCalculation: { actualArea: "1000", coefficient: "0.12" } });
    expect(proposalAreaBreakdown(snapshot)).toEqual([
      "Фактична площа: 800 м²", "Коефіцієнт трудомісткості: 0,15",
      "Розрахункова площа: 120 м²", "Базовий тариф: 40 USD/м²",
    ]);
    data.areaCalculation.coefficient = "0.3";
    expect(snapshot.areaCalculation?.coefficient).toBe("0.15");
    expect(snapshot.gross).toBe("4800.00");
    expect(proposalAreaBreakdown({ ...snapshot, areaCalculation: null })).toBeNull();
    expect(proposalAreaBreakdown({ ...snapshot, clientRatePerM2: null })).toBeNull();
    expect(proposalAreaBreakdown({ ...snapshot, area: "800", areaCalculation: { actualArea: "800", coefficient: "1.00" } })).toBeNull();
    expect(proposalAreaBreakdown({ ...snapshot, area: "121" })).toBeNull();
  });
  it("freezes component names, inputs and shared tariff independently of later edits", () => {
    const data = source([50, 50], null);
    const components = [{ name: "Фасад", actualArea: "200", coefficient: "0.35" }, { name: "Прилегла територія", actualArea: "30", coefficient: "0.10" }];
    const snapshot = createProposalSnapshot({ ...data, area: "73", gross: "2920", areaComponents: components, componentRatePerM2: "40" }, data);
    components[1].actualArea = "900";
    expect(snapshot.areaComponents?.[1]).toEqual({ name: "Прилегла територія", actualArea: "30", coefficient: "0.10" });
    expect(snapshot.componentRatePerM2).toBe("40");
  });
  it("renders single and multiple components above the authoritative total in every PDF layout", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    mkdirSync('tmp/studioflow-proposals', { recursive: true });
    const components = [{ name: "Фасад", actualArea: "200", coefficient: "0.35" }, { name: "Прилегла територія", actualArea: "30", coefficient: "0.10" }];
    for (const designVariant of ["classic", ...proposalDesignVariants.map(variant => variant.value)] as const) {
      for (const count of [1, 2]) {
        const data = source([50, 50], null), total = count === 1 ? "2800.00" : "2920.00";
        const snapshot = proposalSnapshotSchema.parse({ ...data, projectTitle: "336 Фасад", designVariant, currency: "USD", gross: total,
          area: count === 1 ? "70" : "73", clientRatePerM2: "40", componentRatePerM2: "40", areaComponents: components.slice(0, count),
          rows: data.rows.map((row, index) => ({ ...row, name: index === 0 ? "Аванс" : "Фінальний платіж", note: "", gross: count === 1 ? "1400.00" : "1460.00" })),
        });
        const buffer = await renderProposalPdf(snapshot);
        const task = pdfjs.getDocument({ data: new Uint8Array(buffer) }), pdf = await task.promise;
        expect(pdf.numPages).toBe(1);
        const text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/");
        expect(text).toContain("200 м² × 0,35 × 40 USD/м²");
        expect(text).toContain("2 800,00 USD");
        if (count === 2) {
          expect(text).toContain("Прилегла територія"); expect(text).toContain("30 м² × 0,1 × 40 USD/м²");
          expect(text).toContain("120,00 USD"); expect(text).toContain("Разом: 73 розрахункові м² · 2 920,00 USD");
          expect(text.indexOf("Прилегла територія")).toBeLessThan(text.lastIndexOf("2 920,00"));
        } else expect(text).not.toContain("Розрахунок вартості");
        writeFileSync(`tmp/studioflow-proposals/${designVariant}-components-${count}.pdf`, buffer);
        await task.destroy();
      }
    }
  }, 30000);
  it("paginates a longer component calculation without dropping positions or the total", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    for (const designVariant of ["classic", ...proposalDesignVariants.map(variant => variant.value)] as const) {
      const data = source([100], null);
      const snapshot = proposalSnapshotSchema.parse({ ...data, designVariant, gross: "560.00", area: "14", componentRatePerM2: "40", clientRatePerM2: "40",
        areaComponents: Array.from({ length: 14 }, (_, index) => ({ name: `Складова ${index + 1}`, actualArea: "1", coefficient: "1" })),
        rows: [{ ...data.rows[0], gross: "560.00" }],
      });
      const task = pdfjs.getDocument({ data: new Uint8Array(await renderProposalPdf(snapshot)) }), pdf = await task.promise;
      expect(pdf.numPages).toBeGreaterThan(1);
      let text = "";
      for (let page = 1; page <= pdf.numPages; page++) text += (await (await pdf.getPage(page)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ");
      text = text.replace(/\s+/g, " ");
      for (let index = 1; index <= 14; index++) expect(text).toContain(`Складова ${index}`);
      expect(text).toContain("14 розрахункові м²");
      expect(text).toContain("560,00 EUR");
      await task.destroy();
    }
  }, 30000);
  it("distinguishes the base component calculation from discounted gross payable amounts", async () => {
    const data = source([50, 50], "net");
    const snapshot = proposalSnapshotSchema.parse({ ...data, area: "73", gross: "3153.60", vatRate: "20", vatAmount: "525.60", clientRatePerM2: "48", componentRatePerM2: "40",
      areaComponents: [{ name: "Фасад", actualArea: "200", coefficient: "0.35" }, { name: "Територія", actualArea: "30", coefficient: "0.10" }],
      pricing: { listAmount: "2920", priceBasis: "net", discountType: "percentage", discountValue: "10", discountAmount: "292", agreedAmount: "2628", net: "2628", listGross: "3504", discountGross: "350.40" },
      rows: data.rows.map(row => ({ ...row, gross: "1576.80" })),
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(await renderProposalPdf(snapshot)) }), pdf = await task.promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
    expect(text).toContain("Розрахунок вартості без ПДВ");
    for (const amount of ["2 920,00", "3 504,00", "350,40", "3 153,60", "525,60", "1 576,80"]) expect(text).toContain(amount);
    await task.destroy();
  });
  it("renders coefficient and compact calculations in the same PDFs used by preview and download", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    mkdirSync('tmp/studioflow-proposals', { recursive: true });
    for (const designVariant of ["classic", ...proposalDesignVariants.map(variant => variant.value)] as const) {
      for (const coefficient of ["0.15", "1.00", null]) {
        const area = coefficient === "1.00" ? "800" : "120", gross = projectAreaValue(area, "40", 2);
        const snapshot = proposalSnapshotSchema.parse({ ...source([100], null), designVariant, area, gross, currency: "USD",
          clientRatePerM2: "40", areaCalculation: coefficient ? { actualArea: "800", coefficient } : undefined,
          rows: [{ ...source([100], null).rows[0], gross }],
        });
        const pdf = await renderProposalPdf(snapshot);
        const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false });
        const document = await task.promise;
        expect(document.numPages).toBe(1);
        const page = await document.getPage(1);
        const text = (await page.getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/");
        if (coefficient === "0.15") {
          for (const line of proposalAreaBreakdown(snapshot) ?? []) expect(text).toContain(line);
          expect(text).toContain("4 800,00");
        } else {
          expect(text).not.toContain("Коефіцієнт трудомісткості");
          expect(text).toContain(`${area} м² × 40 USD/м²`);
        }
        writeFileSync(`tmp/studioflow-proposals/${designVariant}-coefficient-${coefficient}.pdf`, pdf);
        await task.destroy();
      }
    }
  }, 30000);
  it("validates structured reusable studio contacts",()=>{
    const contacts={website:" https://space.example ",email:" hello@space.example ",phone:" +380 44 000 00 00 ",businessAddress:" Kyiv "};
    expect(studioContactDetailsSchema.parse(contacts)).toEqual({website:"https://space.example",email:"hello@space.example",phone:"+380 44 000 00 00",businessAddress:"Kyiv"});
    expect(studioContactDetailsSchema.safeParse({...contacts,website:"javascript:alert(1)"}).success).toBe(false);
    expect(studioContactDetailsSchema.safeParse({...contacts,email:"not an email"}).success).toBe(false);
    expect(studioContactDetailsSchema.safeParse({website:"",email:"",phone:"",businessAddress:""}).success).toBe(true);
  });
  it.each(["space-design.pro", "www.space-design.pro", "https://space-design.pro", "https://www.space-design.pro"])("accepts website input %s while retaining URL storage", website => {
    const contacts = studioContactDetailsInputSchema.parse({website,email:"",phone:"",businessAddress:""});
    expect(contacts.website).toBe(website.startsWith("https://") ? website : `https://${website}`);
    expect(studioContactDetailsSchema.safeParse(contacts).success).toBe(true);
    expect(studioWebsiteDisplay(website)).toBe("space-design.pro");
    expect(studioWebsiteDisplay(contacts.website)).toBe("space-design.pro");
  });
  it.each(["javascript:alert(1)", "ftp://space-design.pro", "not a website"])("rejects unsafe or invalid website input %s", website => {
    expect(studioContactDetailsInputSchema.safeParse({website,email:"",phone:"",businessAddress:""}).success).toBe(false);
  });
  it("preserves website paths and empty contacts without changing the snapshot URL contract", () => {
    expect(studioWebsiteDisplay("https://www.space-design.pro/studio")).toBe("space-design.pro/studio");
    expect(studioWebsiteDisplay("https://www.space-design.pro/")).toBe("space-design.pro");
    expect(studioContactDetailsInputSchema.parse({website:"",email:"",phone:"",businessAddress:""}).website).toBe("");
    expect(studioContactDetailsSchema.safeParse({website:"space-design.pro",email:"",phone:"",businessAddress:""}).success).toBe(false);
  });
  it("uses requested schedule defaults",()=>{
    expect(projectPaymentDefaultKey([100],0)).toBe("projectPayment");expect([0,1].map(i=>projectPaymentDefaultKey([50,50],i))).toEqual(["advance","finalPayment"]);
    expect([0,1,2].map(i=>projectPaymentDefaultKey([30,50,20],i))).toEqual(["planningStage","visualizationStage","documentationStage"]);
    expect(projectPaymentDefaultKey([25,25,25,25],2)).toBe("paymentNumber");
  });
  it("renders embedded Ukrainian text in representative A4 PDFs",async()=>{
    mkdirSync('tmp/studioflow-proposals',{recursive:true});
    for(const percentages of [[50,50],[30,50,20],[25,25,25,25],Array(10).fill(10)]){
      const data=source(percentages);
      if(percentages.length===4){data.projectTitle="336 Стоматологічна клініка з навчальним центром та адміністративними приміщеннями";data.rows[0].name="Створення функціонального планування клініки та погодження сценаріїв роботи навчального центру";}
      const discounted=projectDiscountAmounts("4000","percentage","10",2), price=projectVatAmounts(discounted.agreed,"23","net",2);
      const rowAmounts=projectClientPaymentSchedule(price.gross,percentages.map(String),"23","net",2).grossAmounts;
      const snapshot=proposalSnapshotSchema.parse({...data,gross:price.gross,vatAmount:price.vat,pricing:{listAmount:"4000",priceBasis:"net",discountType:"percentage",discountValue:"10",discountAmount:discounted.discount,agreedAmount:discounted.agreed,net:price.net,listGross:"4920.00",discountGross:"492.00"},rows:data.rows.map((row,i)=>({...row,gross:rowAmounts[i]}))});const pdf=await renderProposalPdf(snapshot);
      expect(pdf.subarray(0,5).toString()).toBe("%PDF-");expect(pdf.length).toBeGreaterThan(10000);
      writeFileSync(`tmp/studioflow-proposals/proposal-${percentages.length}.pdf`,pdf);
    }
    const longContacts=proposalSnapshotSchema.parse({...source([25,25,25,25]),studioContactDetails:{website:`https://space.example/${"s".repeat(240)}`,email:"hello@space.example",phone:"+380 44 000 00 00",businessAddress:"Адреса студії: вул. Архітектора Городецького, Київ. ".repeat(10).slice(0,500)}});
    writeFileSync('tmp/studioflow-proposals/proposal-long-contacts.pdf',await renderProposalPdf(longContacts));
  },30000);
  it("renders promoted variants with optional pricing states and overflowing real content", async () => {
    mkdirSync('tmp/studioflow-proposals',{recursive:true});
    for (const { value } of proposalDesignVariants) {
      for (const vat of [false, true]) for (const discount of [false, true]) {
        const data = source([30,50,20],vat ? "net" : null);
        const amounts = projectDiscountAmounts("4000",discount ? "percentage" : "none",discount ? "10" : "0",2);
        const price = projectVatAmounts(amounts.agreed,data.vatRate,vat ? "net" : null,2);
        const list = projectVatAmounts("4000",data.vatRate,vat ? "net" : null,2);
        const rowAmounts = projectClientPaymentSchedule(price.gross,["30","50","20"],data.vatRate,vat ? "net" : null,2).grossAmounts;
        const snapshot = proposalSnapshotSchema.parse({...data,designVariant:value,gross:price.gross,vatAmount:price.vat,intro:discount ? data.intro : "",
          pricing:discount ? {listAmount:"4000",priceBasis:vat ? "net" : null,discountType:"percentage",discountValue:"10",discountAmount:amounts.discount,agreedAmount:amounts.agreed,net:price.net,listGross:list.gross,discountGross:(Number(list.gross)-Number(price.gross)).toFixed(2)} : undefined,
          rows:data.rows.map((row,i)=>({...row,gross:rowAmounts[i]}))});
        const pdf = await renderProposalPdf(snapshot);
        expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
        writeFileSync(`tmp/studioflow-proposals/${value}-vat-${vat}-discount-${discount}.pdf`,pdf);
      }
      const data = source(Array(10).fill(10));
      data.projectTitle = "336 Стоматологічна клініка з навчальним центром та адміністративними приміщеннями";
      data.rows[0].name = "Створення функціонального планування клініки та погодження сценаріїв роботи навчального центру";
      const pdf = await renderProposalPdf(proposalSnapshotSchema.parse({...data,designVariant:value}));
      expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
      writeFileSync(`tmp/studioflow-proposals/${value}-overflow.pdf`,pdf);
    }
  },30000);
});
