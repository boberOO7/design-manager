import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { studioWebsiteDisplay, type ProposalSnapshot } from "@/lib/finance-proposal";
import { phoneDisplay } from "@/lib/ukrainian-phone";

const styles = StyleSheet.create({
  content: { flexDirection: "row", justifyContent: "space-between", gap: 28, width: "100%" },
  column: { flexBasis: 0, flexGrow: 1, gap: 4, fontSize: 8.5, lineHeight: 1.4, color: "#57534e" },
  contact: { textAlign: "right" },
  brand: { fontSize: 11, fontWeight: 500, color: "#1c1917", marginBottom: 3 },
  label: { fontSize: 8, marginBottom: 2 },
  name: { fontSize: 10, fontWeight: 500, color: "#1c1917" },
});

export function ProposalFooter({ snapshot: s }: { snapshot: ProposalSnapshot }) {
  const details = s.studioContactDetails;
  const digitalContacts = details ? [studioWebsiteDisplay(details.website), details.email].filter(Boolean)
    : (s.studioContacts?.split(" · ").filter(Boolean).map(studioWebsiteDisplay) ?? []);
  const hasContact = details && (details.contactPerson || details.phone || details.businessAddress);
  return <View style={styles.content}>
    <View style={styles.column}>
      <Text style={styles.brand}>SPACE</Text>
      {digitalContacts.map(value => <Text key={value}>{value}</Text>)}
    </View>
    {hasContact ? <View style={[styles.column, styles.contact]}>
      <Text style={styles.label}>{details.contactPerson || details.phone ? "Контактна особа" : "Адреса студії"}</Text>
      {details.contactPerson ? <Text style={styles.name}>{details.contactPerson}</Text> : null}
      {details.phone ? <Text>{phoneDisplay(details.phone)}</Text> : null}
      {details.businessAddress ? <Text>{details.businessAddress}</Text> : null}
    </View> : null}
  </View>;
}
