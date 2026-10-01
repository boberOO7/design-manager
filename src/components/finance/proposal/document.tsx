import { Document, Page, View, Text, Svg, Path, StyleSheet } from "@react-pdf/renderer";
import { projectDiscountAmounts } from "@/lib/finance-project-plan";
import { parseProposalProjectName, proposalPriceBasis, studioWebsiteDisplay, type ProposalSnapshot } from "@/lib/finance-proposal";

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
  name: { fontSize: 11, fontWeight: 500, lineHeight: 1.35 },
  note: { fontSize: 9.5, color: "#57534e", marginTop: 4, lineHeight: 1.4 },
  percentage: { width: "11%", textAlign: "right" },
  amount: { width: "28%", textAlign: "right", fontWeight: 500 },
  footer: { marginTop: "auto", borderTop: "0.5 solid #d6d3d1", paddingTop: mm(4), flexDirection: "row", gap: mm(8), fontSize: 8.5, color: "#57534e" },
  footerBrand: { width: mm(30), fontSize: 11, fontWeight: 500, color: "#1c1917" },
  contacts: { flexGrow: 1, flexBasis: 0, gap: mm(1), lineHeight: 1.4 },
});

export function ProposalDocument({ snapshot: s, logoPath }: { snapshot: ProposalSnapshot; logoPath: string }) {
  const money = (amount: string) => `${new Intl.NumberFormat("uk-UA", { minimumFractionDigits: s.minorUnits, maximumFractionDigits: s.minorUnits }).format(Number(amount))} ${s.currency}`;
  const percent = (value: string) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 4 }).format(Number(value));
  const details = s.studioContactDetails;
  const digitalContacts = details ? [studioWebsiteDisplay(details.website), details.email].filter(Boolean) : (s.studioContacts?.split(" · ").filter(Boolean).map(studioWebsiteDisplay) ?? []);
  const physicalContacts = details ? [details.phone, details.businessAddress].filter(Boolean) : [];
  const priceBasis = proposalPriceBasis(s);
  const discount = s.pricing && Number(s.pricing.discountAmount) > 0 ? s.pricing : null;
  const discountPercent = discount ? projectDiscountAmounts(discount.listAmount, discount.discountType, discount.discountValue, s.minorUnits).percentage : null;
  const title = parseProposalProjectName(s.projectTitle).title;
  return <Document title={`Комерційна пропозиція № ${s.projectNumber} · ${title}`} author="SPACE" language="uk-UA">
    <Page size="A4" style={styles.page}>
      <View fixed style={styles.header}>
        <Svg width={mm(32)} height={mm(11)} viewBox="500 400 3950 1370"><Path d={logoPath} fill="#1c1917"/></Svg>
        <View style={styles.metadata}><Text>Комерційна пропозиція № {s.projectNumber}</Text><Text>Редакція {s.revision} · {s.date.split("-").reverse().join(".")}</Text><Text render={({ pageNumber }) => pageNumber > 1 ? "Графік оплат · продовження" : ""}/></View>
      </View>
      <Text fixed style={{ position: "absolute", top: mm(32), left: mm(18), width: mm(106), fontSize: 9, color: "#57534e" }} render={({ pageNumber }) => pageNumber > 1 ? "Етап / платіж · продовження" : ""}/>
      <Text fixed style={{ position: "absolute", top: mm(32), left: mm(124), width: mm(19), fontSize: 9, textAlign: "right", color: "#57534e" }} render={({ pageNumber }) => pageNumber > 1 ? "Частка" : ""}/>
      <Text fixed style={{ position: "absolute", top: mm(32), right: mm(18), width: mm(48), fontSize: 9, textAlign: "right", color: "#57534e" }} render={({ pageNumber }) => pageNumber > 1 ? "Сума до сплати" : ""}/>
      <Text style={styles.title}>{title}</Text>
      <View wrap={false} style={styles.context}>
        {s.clientName || s.contact ? <View style={styles.contextColumn}>
          <Text style={styles.label}>Клієнт</Text>
          {s.clientName ? <Text style={styles.client}>{s.clientName}</Text> : null}
          {s.contact ? <Text style={styles.detail}>{s.contact}</Text> : null}
        </View> : null}
        {s.address || s.area ? <View style={styles.contextColumn}>
          <Text style={styles.label}>Об’єкт / адреса</Text>
          {s.address ? <Text>{s.address}</Text> : null}
          {s.area && !s.clientRatePerM2 ? <Text style={styles.detail}>Площа об’єкта — {percent(s.area)} м²</Text> : null}
        </View> : null}
      </View>
      <View wrap={false} style={styles.total}>
        {discount ? <View style={styles.priceBreakdown}>
          <View style={styles.priceContext}><Text style={styles.priceLabel}>Вартість до знижки{s.vatRate !== null ? " (з ПДВ)" : ""}</Text><Text style={styles.priceAmount}>{money(discount.listGross)}</Text></View>
          <View style={styles.priceContext}><Text style={styles.priceLabel}>Знижка {percent(discountPercent ?? "0")}%</Text><Text style={styles.priceAmount}>{money(discount.discountGross)}</Text></View>
        </View> : null}
        <Text style={styles.totalLabel}>Вартість проєкту</Text>
        <Text style={styles.totalValue}>{money(s.gross)}</Text>
        <View style={styles.calculationContext}>
          {priceBasis ? <Text>{priceBasis}</Text> : null}
          {s.vatRate !== null ? <Text>ПДВ {percent(s.vatRate)}% включено · {money(s.vatAmount)}</Text> : null}
        </View>
      </View>
      {s.rows.length ? <View minPresenceAhead={80}><Text style={styles.section}>Графік оплат</Text><View style={styles.columns}><Text style={styles.stage}>Етап / платіж</Text><Text style={styles.percentage}>Частка</Text><Text style={styles.amount}>Сума до сплати</Text></View></View> : null}
      {s.rows.map((row) => <View key={row.id} wrap={false} style={styles.row}>
        <View style={styles.stage}><Text style={styles.name}>{row.name}</Text>{row.note ? <Text style={styles.note}>{row.note}</Text> : null}</View>
        <Text style={styles.percentage}>{percent(row.percentage)}%</Text><Text style={styles.amount}>{money(row.gross)}</Text>
      </View>)}
      {s.intro ? <View wrap={false} style={styles.intro}><Text>{s.intro}</Text></View> : null}
      <View fixed wrap={false} style={styles.footer}>
        <Text style={styles.footerBrand}>SPACE</Text>
        {digitalContacts.length ? <View style={styles.contacts}>{digitalContacts.map(value => <Text key={value}>{value}</Text>)}</View> : null}
        {physicalContacts.length ? <View style={styles.contacts}>{physicalContacts.map(value => <Text key={value}>{value}</Text>)}</View> : null}
      </View>
    </Page>
  </Document>;
}
