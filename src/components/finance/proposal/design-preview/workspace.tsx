"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SegmentedControl } from "@/components/ui/segmented-control";
import ProposalPreview from "../preview";
import { proposalDesignVariants, type ProposalDesignVariant } from "./sample";

export default function ProposalDesignWorkspace({ previews }: { previews: Record<ProposalDesignVariant, string> }) {
  const [variant, setVariant] = useState<ProposalDesignVariant>("measured-space");
  const [urls, setUrls] = useState<Record<ProposalDesignVariant, string> | null>(null);
  const t = useTranslations("Finance.proposal");
  useEffect(() => {
    const urls = { "measured-space": "", "quiet-monument": "", "folded-plane": "" };
    for (const { value } of proposalDesignVariants) {
      const bytes = Uint8Array.from(atob(previews[value]), character => character.charCodeAt(0));
      urls[value] = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    }
    setUrls(urls);
    return () => { Object.values(urls).forEach(url => URL.revokeObjectURL(url)); };
  }, [previews]);
  return <main className="flex h-dvh flex-col gap-4 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-lg font-medium">SPACE · Commercial Proposal</h1><p className="text-sm text-[var(--ui-text-secondary)]">Design preview · same sample, discount + VAT, three payments</p></div>
      <SegmentedControl ariaLabel="Proposal design variant" items={proposalDesignVariants} value={variant} onValueChange={setVariant}/>
    </header>
    <div className="relative min-h-0 flex-1 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)]" aria-label="Proposal designs">
      {!urls ? <p role="status" className="p-4 text-sm">{t("loading")}</p> : proposalDesignVariants.map(({ value }) => <section key={value} data-proposal-design={value} aria-hidden={variant !== value} inert={variant !== value} className={`absolute inset-0 ${variant === value ? "visible" : "invisible"}`}>
        {/* Keep every PDF mounted so changing the design never regenerates or reloads it. */}
        <ProposalPreview url={urls[value]}/>
      </section>)}
    </div>
  </main>;
}
