import { Document, Page, View, Text, Svg, Path, StyleSheet } from "@react-pdf/renderer";
import { phoneDisplay } from "@/lib/ukrainian-phone";
import { projectDiscountAmounts } from "@/lib/finance-project-plan";
import { parseProposalProjectName, proposalAreaBreakdown, proposalPriceBasis, type ProposalSnapshot } from "@/lib/finance-proposal";
import { ProposalFooter } from "./footer";
import { ProposalPricingComponents } from "./pricing-components";

const mm = (value: number) => value * 72 / 25.4;
const styles = StyleSheet.create({
  page: { paddingTop: mm(38), paddingHorizontal: mm(18), paddingBottom: mm(22), fontFamily: "ProposalUbuntu", fontSize: 10.5, lineHeight: 1.4, color: "#1c1917", backgroundColor: "#ffffff" },
  header: { position: "absolute", top: mm(18), left: mm(18), right: mm(18), flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  metadata: { textAlign: "right", fontSize: 9, color: "#57534e", lineHeight: 1.5 },
  title: { fontSize: 26, fontWeight: 500, lineHeight: 1.15, marginBottom: mm(6) },
  context: { flexDirection: "row", gap: mm(7) },
  contextColumn: { width: "50%", flexShrink: 1 },
  label: { fontSize: 9, color: "#57534e", marginBottom: 4 },
  client: { fontSize: 12, fontWeight: 500, marginBottom: 3 },
  detail: { color: "#57534e", marginBottom: 3 },
  intro: { marginTop: mm(5), maxWidth: mm(150), fontSize: 9.5, color: "#57534e", lineHeight: 1.5 },
  total: { marginTop: mm(8), marginBottom: mm(8) },
  priceBreakdown: { flexDirection: "row", gap: mm(10), marginBottom: mm(5) },
  priceContext: { maxWidth: "50%", flexShrink: 1 },
  priceLabel: { fontSize: 9, color: "#57534e", marginBottom: 3 },
  priceAmount: { fontSize: 12, color: "#57534e" },
  totalLabel: { fontSize: 10.5 },
  totalValue: { fontSize: 34, fontWeight: 500, lineHeight: 1.15, marginTop: 3 },
  calculationContext: { marginTop: mm(3), gap: mm(1), fontSize: 9, color: "#57534e" },
  section: { fontSize: 13, fontWeight: 500, marginBottom: mm(3) },
  columns: { flexDirection: "row", fontSize: 9, color: "#57534e", paddingBottom: mm(3), borderBottom: "1 solid #1c1917" },
  row: { flexDirection: "row", paddingVertical: mm(3.5), borderBottom: "0.5 solid #d6d3d1" },
  stage: { width: "61%", paddingRight: mm(5) },
  stageWithoutPercentages: { width: "72%" },
  name: { fontSize: 11, fontWeight: 500, lineHeight: 1.35 },
  note: { fontSize: 9.5, color: "#57534e", marginTop: 4, lineHeight: 1.4 },
  percentage: { width: "11%", textAlign: "right" },
  amount: { width: "28%", textAlign: "right", fontWeight: 500 },
  footer: { marginTop: "auto", borderTop: "0.5 solid #d6d3d1", paddingTop: mm(5) },
});

export function ProposalDocument({ snapshot: s, logoPath }: { snapshot: ProposalSnapshot; logoPath: string }) {
  const money = (amount: string) => `${new Intl.NumberFormat("uk-UA", { minimumFractionDigits: s.minorUnits, maximumFractionDigits: s.minorUnits }).format(Number(amount))} ${s.currency}`;
  const percent = (value: string) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 4 }).format(Number(value));
  const showPercentages = s.showPercentages !== false;
  const stageStyle = showPercentages ? styles.stage : [styles.stage, styles.stageWithoutPercentages];
  const priceBasis = proposalPriceBasis(s);
  const areaBreakdown = proposalAreaBreakdown(s);
  const hasComponents = Boolean(s.areaComponents?.length && s.componentRatePerM2 && s.clientRatePerM2);
  const discount = s.pricing && Number(s.pricing.discountAmount) > 0 ? s.pricing : null;
  const discountPercent = discount ? projectDiscountAmounts(discount.listAmount, discount.discountType, discount.discountValue, s.minorUnits).percentage : null;
  const title = parseProposalProjectName(s.projectTitle).title;
  return <Document title={`Комерційна пропозиція № ${s.projectNumber} · ${title}`} author="SPACE" language="uk-UA">
    <Page size="A4" style={styles.page}>
      <View fixed style={styles.header}>
        <Svg width={mm(32)} height={mm(11)} viewBox="500 400 3950 1370"><Path d={logoPath} fill="#1c1917"/></Svg>
        <View style={styles.metadata}><Text>Комерційна пропозиція № {s.projectNumber}</Text><Text>Редакція {s.revision} · {s.date.split("-").reverse().join(".")}</Text><Text render={({ pageNumber }) => pageNumber > 1 ? hasComponents ? "Пропозиція · продовження" : "Графік оплат · продовження" : ""}/></View>
      </View>
      <Text fixed style={{ position: "absolute", top: mm(32), left: mm(18), width: mm(showPercentages ? 106 : 125), fontSize: 9, color: "#57534e" }} render={({ pageNumber }) => pageNumber > 1 && !hasComponents ? "Етап / платіж · продовження" : ""}/>
      {showPercentages ? <Text fixed style={{ position: "absolute", top: mm(32), left: mm(124), width: mm(19), fontSize: 9, textAlign: "right", color: "#57534e" }} render={({ pageNumber }) => pageNumber > 1 && !hasComponents ? "Частка" : ""}/> : null}
      <Text fixed style={{ position: "absolute", top: mm(32), right: mm(18), width: mm(48), fontSize: 9, textAlign: "right", color: "#57534e" }} render={({ pageNumber }) => pageNumber > 1 && !hasComponents ? "Сума до сплати" : ""}/>
      <Text style={styles.title}>{title}</Text>
      {s.schemaVersion === 2 ? <Text style={{ fontSize: 12, marginBottom: mm(5), color: "#57534e" }}>{s.order.name}</Text> : null}
      <View wrap={false} style={styles.context}>
        {s.clientName || s.contact ? <View style={styles.contextColumn}>
          <Text style={styles.label}>Клієнт</Text>
          {s.clientName ? <Text style={styles.client}>{s.clientName}</Text> : null}
          {s.contact ? <Text style={styles.detail}>{phoneDisplay(s.contact)}</Text> : null}
        </View> : null}
        {s.address || s.area ? <View style={styles.contextColumn}>
          <Text style={styles.label}>Об’єкт / адреса</Text>
          {s.address ? <Text>{s.address}</Text> : null}
          {s.area && !s.clientRatePerM2 ? <Text style={styles.detail}>Площа об’єкта — {percent(s.area)} м²</Text> : null}
        </View> : null}
      </View>
      {hasComponents ? <View style={{ marginTop: mm(8) }}><ProposalPricingComponents snapshot={s}/></View> : null}
      <View wrap={false} style={[styles.total, hasComponents ? { marginTop: 0 } : {}]}>
        {discount ? <View style={styles.priceBreakdown}>
          <View style={styles.priceContext}><Text style={styles.priceLabel}>Вартість до знижки{s.vatRate !== null ? " (з ПДВ)" : ""}</Text><Text style={styles.priceAmount}>{money(discount.listGross)}</Text></View>
          <View style={styles.priceContext}><Text style={styles.priceLabel}>Знижка {percent(discountPercent ?? "0")}%</Text><Text style={styles.priceAmount}>{money(discount.discountGross)}</Text></View>
        </View> : null}
        <Text style={styles.totalLabel}>{areaBreakdown || hasComponents ? "Підсумкова вартість" : s.schemaVersion === 2 ? "Вартість замовлення" : "Вартість проєкту"}</Text>
        <Text style={styles.totalValue}>{money(s.gross)}</Text>
        <View style={styles.calculationContext}>
          {!hasComponents ? areaBreakdown ? areaBreakdown.map(line => <Text key={line}>{line}</Text>) : priceBasis ? <Text>{priceBasis}</Text> : null : null}
          {s.vatRate !== null ? <Text>ПДВ {percent(s.vatRate)}% включено · {money(s.vatAmount)}</Text> : null}
        </View>
      </View>
      {s.rows.length ? <View minPresenceAhead={80}><Text style={styles.section}>Графік оплат</Text><View style={styles.columns}><Text style={stageStyle}>Етап / платіж</Text>{showPercentages ? <Text style={styles.percentage}>Частка</Text> : null}<Text style={styles.amount}>Сума до сплати</Text></View></View> : null}
      {s.rows.map((row) => <View key={row.id} wrap={false} style={styles.row}>
        <View style={stageStyle}><Text style={styles.name}>{row.name}</Text>{row.note ? <Text style={styles.note}>{row.note}</Text> : null}</View>
        {showPercentages ? <Text style={styles.percentage}>{percent(row.percentage)}%</Text> : null}<Text style={styles.amount}>{money(row.gross)}</Text>
      </View>)}
      {s.intro ? <View wrap={false} style={styles.intro}><Text>{s.intro}</Text></View> : null}
      <View fixed wrap={false} style={styles.footer}>
        <ProposalFooter snapshot={s}/>
      </View>
    </Page>
  </Document>;
}
