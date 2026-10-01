import type { ReactNode } from "react";
import { Document, Page, View, Text, Svg, Path, StyleSheet } from "@react-pdf/renderer";
import { projectDiscountAmounts } from "@/lib/finance-project-plan";
import { parseProposalProjectName, proposalPriceBasis, studioWebsiteDisplay, type ProposalSnapshot, type ProposalConceptVariant } from "@/lib/finance-proposal";

const mm = (value: number) => value * 72 / 25.4;
const ink = "#242521", muted = "#5d605a", rule = "#c7cac2";
const styles = StyleSheet.create({
  page: { paddingTop: mm(44), paddingHorizontal: mm(18), paddingBottom: mm(32), fontFamily: "DesignUbuntu", fontSize: 10, lineHeight: 1.35, color: ink },
  header: { position: "absolute", top: mm(18), left: mm(18), right: mm(18), flexDirection: "row", justifyContent: "space-between" },
  metadata: { fontSize: 8.5, color: muted, textAlign: "right", lineHeight: 1.7 },
  kicker: { fontFamily: "DesignSpaceMono", fontSize: 8, color: muted, letterSpacing: 1 },
  title: { fontSize: 34, fontWeight: 500, lineHeight: 1.15 },
  context: { flexDirection: "row", gap: mm(7), marginTop: mm(8) },
  contextColumn: { flexBasis: 0, flexGrow: 1 },
  label: { fontSize: 8.5, color: muted, marginBottom: mm(2) },
  client: { fontSize: 11, fontWeight: 500, marginBottom: mm(1) },
  detail: { fontSize: 9, color: muted },
  section: { marginTop: mm(10) },
  railSection: { flexDirection: "row" },
  rail: { width: mm(42), paddingTop: mm(1), color: muted, fontSize: 9, gap: mm(1) },
  railNumber: { fontFamily: "DesignSpaceMono", fontSize: 8 },
  readingColumn: { flex: 1 },
  totalLabel: { fontSize: 9.5 },
  price: { flexDirection: "row", alignItems: "baseline", gap: mm(5), marginTop: mm(2) },
  total: { fontSize: 42, lineHeight: 1.1 },
  currency: { fontSize: 12 },
  basis: { fontSize: 9, color: muted, marginTop: mm(3) },
  facts: { marginTop: mm(6), gap: mm(2) },
  fact: { flexDirection: "row", justifyContent: "space-between", fontSize: 9, color: muted, gap: mm(4) },
  factValue: { flexShrink: 0 },
  horizontalFacts: { flexDirection: "row", justifyContent: "space-between", gap: mm(5) },
  stackedFact: { gap: mm(2), fontSize: 10, flexShrink: 1 },
  factLabel: { fontSize: 8, color: muted },
  scheduleTitle: { fontSize: 12, fontWeight: 500, marginBottom: mm(3) },
  columns: { flexDirection: "row", fontSize: 8, color: muted, paddingBottom: mm(3), borderBottomWidth: .6, borderBottomColor: ink },
  row: { flexDirection: "row", paddingTop: mm(3.5), paddingBottom: mm(3), alignItems: "flex-start" },
  stage: { width: "61%", paddingRight: mm(5) },
  name: { fontSize: 9.5 },
  rowNote: { fontSize: 8.5, color: muted, marginTop: mm(1) },
  percentage: { width: "11%", textAlign: "right", fontSize: 9, color: muted },
  amount: { width: "28%", textAlign: "right", fontWeight: 500, fontSize: 9.5 },
  stageNumber: { fontFamily: "DesignGeometry", width: mm(12), fontSize: 9, color: muted },
  numberedName: { flex: 1 },
  intro: { fontSize: 8.5, color: muted, marginTop: mm(4) },
  footer: { position: "absolute", bottom: mm(16), left: mm(18), right: mm(18), paddingTop: mm(4), borderTopWidth: .45, borderTopColor: rule, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: muted },
  contactLines: { gap: mm(1), flexShrink: 1, maxWidth: "48%" },
});
const layouts = StyleSheet.create({
  measuredPage: { backgroundColor: "#fbfaf7" },
  measuredTitleBlock: { marginLeft: mm(42), position: "relative" },
  measuredMarker: { position: "absolute", left: mm(-42), top: mm(5), bottom: 0, width: .8, backgroundColor: ink },
  measuredProjectRail: { position: "absolute", left: mm(-42), top: 0, width: mm(38), flexDirection: "column", gap: mm(2), color: muted, fontSize: 9 },
  measuredTitle: { fontFamily: "DesignSerif", fontWeight: 400, fontSize: 43, maxWidth: mm(85), marginTop: mm(3), lineHeight: 1.2 },
  measuredContext: { marginLeft: mm(42) },
  measuredPrice: { fontFamily: "DesignSerif", fontSize: 36 },
  measuredCost: { borderTopWidth: .45, borderTopColor: rule, paddingTop: mm(4) },
  quietPage: { paddingTop: mm(68), paddingHorizontal: mm(30) },
  quietHeader: { flexDirection: "column", alignItems: "center", gap: mm(7) },
  quietMetadata: { textAlign: "center" },
  quietTitle: { textAlign: "center" },
  quietContext: { flexDirection: "column", alignItems: "center", gap: mm(2) },
  quietContextColumn: { flexGrow: 0, flexBasis: "auto", textAlign: "center" },
  quietCost: { alignItems: "center", marginTop: mm(10) },
  quietPrice: { flexDirection: "column", alignItems: "center", gap: mm(2) },
  quietTotal: { fontSize: 58 },
  quietCurrency: { fontFamily: "DesignSpaceMono", letterSpacing: 2 },
  quietLabel: { fontFamily: "DesignSpaceMono", fontSize: 8, letterSpacing: 1.2, color: muted },
  quietSchedule: { borderTopWidth: .7, borderTopColor: ink, paddingTop: mm(4) },
  quietColumns: { borderBottomWidth: 0, paddingBottom: 0 },
  quietIntro: { textAlign: "center" },
  quietFooter: { left: mm(30), right: mm(30) },
  foldedTitleBlock: { minHeight: mm(50), padding: mm(7), position: "relative", justifyContent: "space-between" },
  foldedPlane: { position: "absolute", top: 0, left: 0, width: mm(174), height: mm(50) },
  foldedTitle: { fontFamily: "DesignGeometry", fontWeight: 400, fontSize: 34, maxWidth: mm(125) },
  foldedTotal: { fontFamily: "DesignGeometry", fontSize: 49 },
  foldedCost: { marginTop: mm(14) },
  foldedFacts: { paddingTop: mm(4), borderTopWidth: .45, borderTopColor: rule },
  foldedColumns: { borderBottomWidth: 0 },
  foldedSchedule: { marginTop: mm(6) },
  foldedRow: { paddingTop: mm(3), paddingBottom: mm(2) },
});

function Section({ variant, number, label, children }: { variant: ProposalConceptVariant; number: string; label: string; children: ReactNode }) {
  return <View wrap={number !== "02"} style={[styles.section, variant === "measured-space" ? styles.railSection : {}, variant === "folded-plane" && number === "03" ? layouts.foldedSchedule : {}]}>
    {variant === "measured-space" ? <View style={styles.rail}><Text style={styles.railNumber}>{number}</Text><Text>{label}</Text></View> : null}
    <View style={variant === "measured-space" ? styles.readingColumn : {}}>{children}</View>
  </View>;
}

export function DesignProposalDocument({ snapshot: s, logoPath, variant }: { snapshot: ProposalSnapshot; logoPath: string; variant: ProposalConceptVariant }) {
  const measured = variant === "measured-space", quiet = variant === "quiet-monument", folded = variant === "folded-plane";
  const moneyNumber = (amount: string) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: s.minorUnits, maximumFractionDigits: s.minorUnits }).format(Number(amount));
  const money = (amount: string) => `${moneyNumber(amount)} ${s.currency}`;
  const percent = (value: string) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 4 }).format(Number(value));
  const title = parseProposalProjectName(s.projectTitle).title;
  const basis = proposalPriceBasis(s);
  const discount = s.pricing && Number(s.pricing.discountAmount) > 0 ? s.pricing : null;
  const discountPercent = discount ? projectDiscountAmounts(discount.listAmount, discount.discountType, discount.discountValue, s.minorUnits).percentage : null;
  const details = s.studioContactDetails;
  const digitalContacts = details ? [studioWebsiteDisplay(details.website), details.email].filter(Boolean) : (s.studioContacts?.split(" · ").filter(Boolean).map(studioWebsiteDisplay) ?? []);
  const physicalContacts = details ? [details.phone, details.businessAddress].filter(Boolean) : [];
  const facts = [
    ...(discount ? [
      { label: `До знижки${s.vatRate !== null ? " (з ПДВ)" : ""}`, value: money(discount.listGross) },
      { label: `Знижка ${percent(discountPercent ?? "0")}%`, value: `−${money(discount.discountGross)}` },
    ] : []),
    ...(s.vatRate !== null ? [{ label: `ПДВ ${percent(s.vatRate)}% включено`, value: money(s.vatAmount) }] : []),
  ];
  return <Document title={`SPACE · ${variant} · № ${s.projectNumber} · ${title}`} author="SPACE" language="uk-UA">
    <Page size="A4" style={[styles.page, measured ? layouts.measuredPage : {}, quiet ? layouts.quietPage : {}]}>
      <View fixed style={[styles.header, quiet ? layouts.quietHeader : {}]}>
        <Svg width={mm(quiet ? 54 : 34)} height={mm(quiet ? 18.7 : 11.8)} viewBox="500 400 3950 1370"><Path d={logoPath} fill={ink}/></Svg>
        <View style={[styles.metadata, quiet ? layouts.quietMetadata : {}]}><Text>Комерційна пропозиція № {s.projectNumber}</Text><Text>Редакція {s.revision} · {s.date.split("-").reverse().join(".")}</Text><Text render={({ pageNumber }) => pageNumber > 1 ? "Графік оплат · продовження" : ""}/></View>
      </View>
      <View fixed style={{ position: "absolute", top: mm(quiet ? 62 : 38), left: mm(quiet ? 30 : measured ? 60 : 18), right: mm(quiet ? 30 : 18), flexDirection: "row", fontSize: 8, color: muted }}>
        <Text style={styles.stage} render={({ pageNumber }) => pageNumber > 1 ? "Етап / платіж · продовження" : ""}/>
        <Text style={styles.percentage} render={({ pageNumber }) => pageNumber > 1 ? "Частка" : ""}/>
        <Text style={styles.amount} render={({ pageNumber }) => pageNumber > 1 ? "Сума до сплати" : ""}/>
      </View>
      <View style={[measured ? layouts.measuredTitleBlock : {}, folded ? layouts.foldedTitleBlock : {}]}>
        {measured ? <View style={layouts.measuredMarker}/> : null}
        {folded ? <Svg style={layouts.foldedPlane} viewBox="0 0 174 50"><Path d="M0 0H145L174 50H0Z" fill="#e7eae2"/><Path d="M143 10L159 38H127ZM135 24L159 38" fill="none" stroke="#737d6b" strokeWidth={.28}/></Svg> : null}
        {!quiet ? <Text style={styles.kicker}>КОМЕРЦІЙНА ПРОПОЗИЦІЯ</Text> : null}
        <Text style={[styles.title, measured ? layouts.measuredTitle : {}, quiet ? layouts.quietTitle : {}, folded ? layouts.foldedTitle : {}]}>{title}</Text>
      </View>
      <View wrap={false} style={[styles.context, measured ? layouts.measuredContext : {}, quiet ? layouts.quietContext : {}]}>
        {measured ? <View style={layouts.measuredProjectRail}><Text style={styles.railNumber}>01</Text><Text>Проєкт</Text></View> : null}
        {s.clientName || s.contact ? <View style={[styles.contextColumn, quiet ? layouts.quietContextColumn : {}]}>
          {!quiet ? <Text style={styles.label}>Клієнт</Text> : null}
          {s.clientName ? <Text style={styles.client}>{s.clientName}</Text> : null}
          {s.contact ? <Text style={styles.detail}>{s.contact}</Text> : null}
        </View> : null}
        {s.address || s.area ? <View style={[styles.contextColumn, quiet ? layouts.quietContextColumn : {}]}>
          {!quiet ? <Text style={styles.label}>Об’єкт / адреса</Text> : null}
          {s.address ? <Text>{s.address}</Text> : null}
          {s.area && !s.clientRatePerM2 ? <Text style={styles.detail}>Площа об’єкта — {percent(s.area)} м²</Text> : null}
        </View> : null}
      </View>
      <Section variant={variant} number="02" label="Вартість">
        <View wrap={false} style={[measured ? layouts.measuredCost : {}, quiet ? layouts.quietCost : {}, folded ? layouts.foldedCost : {}]}>
          <Text style={[styles.totalLabel, quiet ? layouts.quietLabel : {}]}>{quiet ? "ВАРТІСТЬ ПРОЄКТУ" : "Вартість проєкту"}</Text>
          <View style={[styles.price, quiet ? layouts.quietPrice : {}]}><Text style={[styles.total, measured ? layouts.measuredPrice : {}, quiet ? layouts.quietTotal : {}, folded ? layouts.foldedTotal : {}]}>{moneyNumber(s.gross)}</Text><Text style={[styles.currency, quiet ? layouts.quietCurrency : {}]}>{s.currency}</Text></View>
          {basis ? <Text style={styles.basis}>{basis}</Text> : null}
        </View>
        {facts.length ? <View wrap={false} style={[styles.facts, !measured ? styles.horizontalFacts : {}, folded ? layouts.foldedFacts : {}]}>{facts.map((fact, index) => <View key={fact.label} style={measured ? styles.fact : [styles.stackedFact, { textAlign: index === 0 ? "left" : index === facts.length-1 ? "right" : "center" }]}>
          <Text style={!measured ? styles.factLabel : {}}>{fact.label}</Text><Text style={styles.factValue}>{fact.value}</Text>
        </View>)}</View> : null}
      </Section>
      {s.rows.length ? <Section variant={variant} number="03" label="Оплата">
        <View minPresenceAhead={75} style={quiet ? layouts.quietSchedule : {}}><Text style={styles.scheduleTitle}>Графік оплат</Text><View style={[styles.columns, quiet ? layouts.quietColumns : {}, folded ? layouts.foldedColumns : {}]}><Text style={styles.stage}>Етап / платіж</Text><Text style={styles.percentage}>Частка</Text><Text style={styles.amount}>Сума до сплати</Text></View></View>
        {s.rows.map((row, index) => <View key={row.id} wrap={false} style={[styles.row, folded ? layouts.foldedRow : {}]}>
          <View style={[styles.stage, folded ? { flexDirection: "row" } : {}]}>
            {folded ? <Text style={styles.stageNumber}>{String(index+1).padStart(2,"0")}</Text> : null}
            <View style={folded ? styles.numberedName : {}}><Text style={styles.name}>{row.name}</Text>{row.note ? <Text style={styles.rowNote}>{row.note}</Text> : null}</View>
          </View>
          <Text style={styles.percentage}>{percent(row.percentage)}%</Text><Text style={styles.amount}>{money(row.gross)}</Text>
        </View>)}
      </Section> : null}
      {s.intro ? <Text style={[styles.intro, measured ? { marginLeft: mm(42) } : {}, quiet ? layouts.quietIntro : {}]}>{s.intro}</Text> : null}
      <View fixed wrap={false} style={[styles.footer, quiet ? layouts.quietFooter : {}]}>
        <View style={styles.contactLines}>{digitalContacts.map(value => <Text key={value}>{value}</Text>)}</View>
        <View style={[styles.contactLines, { textAlign: "right" }]}>{physicalContacts.map(value => <Text key={value}>{value}</Text>)}</View>
      </View>
    </Page>
  </Document>;
}
