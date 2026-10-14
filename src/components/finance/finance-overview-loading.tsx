import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";

function Ink({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`instaload-mark ${className}`} />;
}

export function FinanceCurrencyLoading() {
  return <div aria-hidden="true" className="instaload-blueprint flex h-9 w-24 items-center"><Ink className="h-4 w-full" /></div>;
}

/** Reserve section structure without presenting invented financial values. */
export async function FinanceSectionLoading({ cash = false, analyticsAvailable = false }: { cash?: boolean; analyticsAvailable?: boolean }) {
  const t = await getTranslations("Finance.overview.analytics");
  return <section aria-busy="true" aria-label={t(cash ? "cashOutlook" : "headline")} className={`instaload-blueprint ${cash ? "space-y-5 border-t border-[var(--ui-border-subtle)] pt-6" : "space-y-8"}`}>
    <span className="sr-only">{t("loading")}</span>
    <div className={`flex items-center justify-between gap-4 ${cash ? "h-12" : "h-11"}`}><Ink className="h-4 w-2/5" /><Ink className="h-4 w-24" /></div>
    <div className={cash ? "grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-4" : "grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"}>
      {Array.from({ length: cash ? 4 : 3 }, (_, index) => <div key={index} className={!cash && index === 0 ? "col-span-2 sm:col-span-1" : ""}>
        <div className="flex h-5 items-center"><Ink className="h-3 w-28" /></div>
        <div className={`${cash ? "mt-1 h-7" : index === 0 ? "mt-2 h-9 sm:h-10" : "mt-2 h-8"} flex items-center`}><Ink className="h-5 w-3/5" /></div>
        {cash ? <div className="mt-1 flex h-4 items-center"><Ink className="h-2 w-4/5" /></div> : null}
      </div>)}
    </div>
    {cash ? <>
      <div className="flex h-4 items-center"><Ink className="h-2 w-3/4" /></div>
      <div className="h-11 border-y border-[var(--ui-border-subtle)]" />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]"><div className="h-72 border border-[var(--ui-border-subtle)]" /><div className="space-y-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex h-10 items-center justify-between gap-4"><Ink className="h-3 w-3/5" /><Ink className="h-3 w-16" /></div>)}</div></div>
    </> : analyticsAvailable ? <>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,2.2fr)_minmax(15rem,1fr)]"><div className="h-96 border border-[var(--ui-border-subtle)]" /><div className="space-y-5">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16"><Ink className="h-3 w-3/5" /><Ink className="mt-3 h-1.5 w-full" /></div>)}</div></div>
      <div className="space-y-4 border-t border-[var(--ui-border-subtle)] pt-6"><Ink className="h-5 w-1/3" /><Ink className="h-4 w-1/2" /><div className="h-11" /></div>
    </> : <div className="flex min-h-11 items-center"><Ink className="h-3 w-3/4" /></div>}
  </section>;
}

export async function FinanceOverviewLoading() {
  const t = await getTranslations("Finance.overview");
  return <div className="w-full min-w-0 space-y-8" data-finance-shell="loading">
    <PageHeader title={t("title")} className="flex-wrap" action={<div aria-hidden="true" className="instaload-blueprint flex max-w-full flex-wrap items-center gap-3"><div className="flex flex-wrap gap-1">{(["month", "3", "year"] as const).map(period => <span key={period} className="relative inline-flex min-h-11 items-center px-3 text-sm"><span className="invisible">{t(`periods.${period}`)}</span><Ink className="absolute inset-x-3 h-3" /></span>)}</div><FinanceCurrencyLoading /></div>} />
    <FinanceSectionLoading />
    <FinanceSectionLoading cash />
  </div>;
}
