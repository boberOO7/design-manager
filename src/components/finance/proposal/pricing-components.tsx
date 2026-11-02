import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { projectAreaComponentsValue } from "@/lib/finance-project-plan";
import type { ProposalSnapshot } from "@/lib/finance-proposal";

const styles = StyleSheet.create({
  block: { marginBottom: 14 },
  heading: { fontSize: 9, color: "#57534e", marginBottom: 6 },
  item: { marginBottom: 8 },
  name: { fontSize: 10, fontWeight: 500, marginBottom: 3 },
  calculation: { flexDirection: "row", gap: 12, justifyContent: "space-between", fontSize: 8.5, lineHeight: 1.4, color: "#57534e" },
  formula: { flex: 1 },
  amount: { textAlign: "right", flexShrink: 0 },
  summary: { fontSize: 9, paddingTop: 6, borderTopWidth: .4, borderTopColor: "#d6d3d1" },
});

export function ProposalPricingComponents({ snapshot: s }: { snapshot: ProposalSnapshot }) {
  if (!s.areaComponents?.length || !s.componentRatePerM2 || !s.clientRatePerM2) return null;
  const values = projectAreaComponentsValue(s.areaComponents, s.componentRatePerM2, s.minorUnits);
  const number = (value: string) => new Intl.NumberFormat("uk-UA", { maximumSignificantDigits: 15 }).format(Number(value));
  const money = (value: string) => `${new Intl.NumberFormat("uk-UA", { minimumFractionDigits: s.minorUnits, maximumFractionDigits: s.minorUnits }).format(Number(value))} ${s.currency}`;
  const multiple = s.areaComponents.length > 1;
  const excludesVat = s.pricing?.priceBasis === "net" && s.vatRate !== null;
  return <View style={styles.block}>
    {multiple || excludesVat ? <Text minPresenceAhead={45} style={styles.heading}>{excludesVat ? "Розрахунок вартості без ПДВ" : "Розрахунок вартості"}</Text> : null}
    {s.areaComponents.map((component, index) => <View key={index} wrap={false} style={styles.item}>
      <Text style={styles.name}>{component.name}</Text>
      <View style={styles.calculation}>
        <Text style={styles.formula}>{number(component.actualArea)} м²{Number(component.coefficient) !== 1 ? ` × ${number(component.coefficient)}` : ""} × {number(s.componentRatePerM2 ?? "0")} {s.currency}/м²</Text>
        <Text style={styles.amount}>{money(values.items[index].amount)}</Text>
      </View>
    </View>)}
    {multiple ? <Text style={styles.summary}>Разом: {number(values.area)} розрахункові м² · {money(values.amount)}</Text> : null}
  </View>;
}
