import { redirect } from "next/navigation";
import { getFinanceData, getFinanceMovements,getFinanceExpectedItem,getFinanceExpectedReturnHref } from "@/data/queries/finance";
import { z } from "zod";
import { FinanceMovementsWorkspace } from "@/components/finance/movements-workspace";
import { getFinanceSourceMovement } from "@/data/queries/finance-source-movement";
import { getKyivDateOnly } from "@/lib/validation/project";
import { getFinanceProjectCash } from "@/data/queries/finance-project-cash";
import { getLocale, getTranslations } from "next-intl/server";
import { parseMovementFilters, movementFiltersHref, MOVEMENT_PAGE_SIZE } from "@/lib/finance-movement-filters";

export default async function FinanceMovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params=await searchParams;
  const requested = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requested) && requested>0 ? Math.min(requested,100_000) : 1;
  const filters = parseMovementFilters(params);
  const [foundation, projectCash, locale, t] = await Promise.all([getFinanceData(), getFinanceProjectCash(), getLocale(), getTranslations("Finance")]);
  if (!foundation) redirect("/dashboard");
  const ledger = await getFinanceMovements(page, filters, { categories: foundation.categories, projectCash, locale, translate: key => t(key) });
  if (!ledger) redirect("/dashboard");
  const lastPage = Math.max(1, Math.ceil(ledger.total / MOVEMENT_PAGE_SIZE));
  if (page > lastPage) redirect(movementFiltersHref(filters, lastPage));
  const expected=params.expected&&z.uuid().safeParse(params.expected).success ? await getFinanceExpectedItem(params.expected) : null;
  if(params.expected&&(!expected||expected.commitment==="cancelled"||!expected.remaining_amount)) redirect("/finance/expected");
  const movementId = params.movement && z.uuid().safeParse(params.movement).success ? params.movement : null;
  const sourceMovement = movementId ? await getFinanceSourceMovement(movementId) : null;
  const returnHref=expected?.id?await getFinanceExpectedReturnHref(expected.id):"/finance/expected";
  return <FinanceMovementsWorkspace {...foundation} {...ledger} projectCash={projectCash} expected={expected} defaultAccountId={expected?.defaultAccountId} returnHref={returnHref} filters={filters} page={page} today={getKyivDateOnly()} sourceMovement={sourceMovement} movementLinkUnavailable={Boolean(params.movement && !sourceMovement)} />;
}
