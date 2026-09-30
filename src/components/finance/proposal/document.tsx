import { Document, Page, View, Text, Svg, Path, StyleSheet } from "@react-pdf/renderer";
import { proposalPriceBasis, type ProposalSnapshot } from "@/lib/finance-proposal";

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
  basis: { fontSize: 10, color: "#57534e", marginTop: 5 },
  total: { backgroundColor: "#f5f5f4", padding: mm(4.5), marginTop: mm(6), marginBottom: mm(6) },
  totalValue: { fontSize: 30, fontWeight: 500, lineHeight: 1.25, marginTop: 3 },
  vat: { fontSize: 9, color: "#57534e", marginTop: 4 },
  section: { fontSize: 13, fontWeight: 500, marginBottom: mm(3) },
  columns: { flexDirection: "row", fontSize: 9, color: "#57534e", paddingBottom: mm(3), borderBottom: "1 solid #1c1917" },
  row: { flexDirection: "row", paddingVertical: mm(3.5), borderBottom: "0.5 solid #d6d3d1" },
  stage: { width: "61%", paddingRight: mm(5) },
  name: { fontSize: 11, fontWeight: 500, lineHeight: 1.35 },
  note: { fontSize: 9.5, color: "#57534e", marginTop: 4, lineHeight: 1.4 },
  percentage: { width: "11%", textAlign: "right" },
  amount: { width: "28%", textAlign: "right", fontWeight: 500 },
  footer: { marginTop: "auto", borderTop: "0.5 solid #d6d3d1", paddingTop: mm(3), fontSize: 8.5, color: "#57534e" },
  contacts: { fontSize: 8, lineHeight: 1.5 },
});

export function ProposalDocument({ snapshot: s, logoPath }: { snapshot: ProposalSnapshot; logoPath: string }) {
  const money = (amount: string) => `${new Intl.NumberFormat("uk-UA", { minimumFractionDigits: s.minorUnits, maximumFractionDigits: s.minorUnits }).format(Number(amount))} ${s.currency}`;
  const percent = (value: string) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 4 }).format(Number(value));
  const studioContacts = s.studioContactDetails ? [s.studioContactDetails.website, s.studioContactDetails.email, s.studioContactDetails.phone].filter(Boolean).join(" · ") : s.studioContacts;
  const priceBasis = proposalPriceBasis(s);
  const title = s.projectTitle.replace(/^\d+[\s_–—-]+/u, "");
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
        <Text>Вартість проєкту</Text>
        <Text style={styles.totalValue}>{money(s.gross)}</Text>
        {priceBasis ? <Text style={styles.basis}>{priceBasis}</Text> : null}
        {s.vatRate !== null ? <Text style={styles.vat}>У т.ч. ПДВ {percent(s.vatRate)}% — {money(s.vatAmount)}</Text> : null}
      </View>
      {s.rows.length ? <View minPresenceAhead={80}><Text style={styles.section}>Графік оплат</Text><View style={styles.columns}><Text style={styles.stage}>Етап / платіж</Text><Text style={styles.percentage}>Частка</Text><Text style={styles.amount}>Сума до сплати</Text></View></View> : null}
      {s.rows.map((row) => <View key={row.id} wrap={false} style={styles.row}>
        <View style={styles.stage}><Text style={styles.name}>{row.name}</Text>{row.note ? <Text style={styles.note}>{row.note}</Text> : null}</View>
        <Text style={styles.percentage}>{percent(row.percentage)}%</Text><Text style={styles.amount}>{money(row.gross)}</Text>
      </View>)}
      {s.intro ? <View wrap={false} style={styles.intro}><Text>{s.intro}</Text></View> : null}
      <View fixed wrap={false} style={styles.footer}><Text style={styles.contacts}>{studioContacts ? `SPACE · ${studioContacts}` : `SPACE · Проєкт № ${s.projectNumber}`}</Text>{s.studioContactDetails?.businessAddress ? <Text style={styles.contacts}>{s.studioContactDetails.businessAddress}</Text> : null}</View>
    </Page>
  </Document>;
}
