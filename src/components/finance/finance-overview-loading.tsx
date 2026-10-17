import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";

function Ink({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`instaload-mark ${className}`} />;
}
export function FinanceCurrencyLoading() {
  return <div aria-hidden="true" className="instaload-blueprint flex h-9 w-24 items-center"><Ink className="h-4 w-full" /></div>;
}

/** Reserve the cash dashboard's structure without inventing financial values. */
export async function FinanceSectionLoading() {
  const t = await getTranslations("Finance.overview.dashboard");
  return <section aria-busy="true" aria-label={t("loading")} className="instaload-blueprint space-y-4">
    <span className="sr-only">{t("loading")}</span>
    <div className="flex h-12 items-center justify-between gap-4"><Ink className="h-3 w-56"/><Ink className="h-8 w-60"/></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0,1,2,3].map(index => <div key={index} className="space-y-4 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] p-5"><div className="flex items-center justify-between"><Ink className="h-3 w-28"/><Ink className="size-8"/></div><Ink className="h-8 w-4/5"/><Ink className="h-3 w-28"/></div>)}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2.1fr)_minmax(19rem,1fr)]">
      <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] p-5"><div className="flex justify-between gap-4"><Ink className="h-5 w-44"/><Ink className="h-8 w-36"/></div><Ink className="mt-5 h-3 w-56"/><div className="mt-7 h-[276px] border-b border-[var(--ui-border)]"/><Ink className="my-4 h-3 w-32"/></div>
      <div className="space-y-6 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] p-5"><Ink className="h-5 w-40"/>{[0,1].map(index => <div key={index} className="space-y-4 border-b border-[var(--ui-border)] pb-4"><Ink className="h-3 w-36"/><Ink className="h-6 w-32"/></div>)}<Ink className="h-4 w-4/5"/><Ink className="h-4 w-3/5"/></div>
    </div>
    <div className="space-y-5 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] p-5"><Ink className="h-5 w-44"/><div className="grid grid-cols-2 gap-5">{[0,1].map(index => <div key={index} className="space-y-3"><Ink className="h-3 w-36"/><Ink className="h-7 w-40"/></div>)}</div></div>
  </section>;
}
export async function FinanceOverviewLoading() {
  const t = await getTranslations("Finance.overview");
  return <div className="w-full min-w-0 space-y-5" data-finance-shell="loading">
    <PageHeader title={t("title")} action={<FinanceCurrencyLoading/>}/>
    <FinanceSectionLoading/>
  </div>;
}

export async function FinanceEconomicsLoading() {
  const t = await getTranslations("Finance.overview.economics");
  return <section className="instaload-blueprint min-w-0" aria-busy="true" aria-label={t("title")}>
    <h2 className="mb-3 text-lg font-semibold">{t("title")}</h2>
    <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] p-5"><div className="grid grid-cols-2 gap-5 lg:grid-cols-4">{[0,1,2,3].map(index => <div key={index} className="space-y-3"><Ink className="h-3 w-4/5"/><Ink className="h-7 w-3/4"/><Ink className="h-3 w-1/2"/></div>)}</div><div className="mt-6 space-y-5 border-t border-[var(--ui-border)] pt-5">{[0,1,2].map(index => <div key={index} className="space-y-2"><Ink className="h-3 w-40"/><Ink className="h-2 w-3/5"/><Ink className="h-2 w-2/5"/></div>)}</div></div>
  </section>;
}
