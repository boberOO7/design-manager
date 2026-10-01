import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { selectMessages } from "@/i18n/message-scopes";
import { proposalSnapshotSchema } from "@/lib/finance-proposal";
import { renderProposalPdf } from "@/lib/finance-proposal-pdf";
import { proposalDesignSample, proposalDesignVariants } from "@/components/finance/proposal/design-preview/sample";
import ProposalDesignWorkspace from "@/components/finance/proposal/design-preview/workspace";

export const dynamic = "force-dynamic";

export default async function ProposalDesignPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const snapshot = proposalSnapshotSchema.parse(proposalDesignSample);
  const urls = [];
  for (const { value } of proposalDesignVariants) {
    const pdf = await renderProposalPdf({ ...snapshot, designVariant: value });
    urls.push(pdf.toString("base64"));
  }
  const messages = await getMessages();
  return <NextIntlClientProvider messages={selectMessages(messages, "finance")}>
    <ProposalDesignWorkspace previews={{ "measured-space": urls[0], "quiet-monument": urls[1], "folded-plane": urls[2] }}/>
  </NextIntlClientProvider>;
}
