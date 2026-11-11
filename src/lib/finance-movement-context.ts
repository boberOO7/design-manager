import type { FinanceMovementContext } from "@/data/queries/finance-movement-context";
import type { FinanceCategory } from "./finance-planning";
import { financeMovementCategoryLabel } from "./finance-planning";
import type { FinanceProjectCash } from "@/data/queries/finance-project-cash";
import type { Database } from "@/types/database.types";

export type MovementPresentationOptions = {
  categories: FinanceCategory[];
  projectCash?: Pick<FinanceProjectCash, "events" | "projects"> | null;
  translate: (key: string) => string;
  locale: string;
};

export function financeMovementPresentation(
  movement: Pick<Database["public"]["Views"]["finance_current_movements"]["Row"], "id" | "description" | "category_id" | "category" | "kind">,
  sources: FinanceMovementContext[],
  { categories, projectCash, translate, locale }: MovementPresentationOptions,
) {
  const category = financeMovementCategoryLabel(movement.category_id, movement.category, categories, key => translate(`planning.defaults.${key}`));
  const title = movement.description || (["account_opening", "balance_adjustment", "transfer"].includes(movement.kind ?? "") ? translate(`movements.kinds.${movement.kind}`) : category);
  const sourceLabels = financeMovementContextLabels(sources, categories, title, translate,
    date => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)));
  const projects = projectCash?.events.filter(event => event.movement_id === movement.id).flatMap(event => {
    const name = projectCash.projects.find(project => project.id === event.project_id)?.name;
    return name && name !== title && !sources.some(source => source.project?.project?.name === name) ? [name] : [];
  }) ?? [];
  return { title, category, context: [...new Set([...sourceLabels, ...projects])].join("; ") };
}

export function financeMovementContextLabels(
  sources: FinanceMovementContext[],
  categories: FinanceCategory[],
  title: string,
  translate: (key: string) => string,
  formatMonth: (date: string) => string,
) {
  return [...new Set(sources.map(source => {
    const obligation = source.payroll?.obligation;
    const category = categories.find(item => item.id === source.category_id);
    let description = source.description.trim();
    if (obligation) description = description.replace(/ · \d{4}-\d{2}$/, "");
    if (obligation?.kind === "payroll") {
      description = description.replace(/^Base salary(?= ·|$)/, translate("schedules.defaultSalaryName"));
      for (const component of ["deductions", "employer_cost"]) {
        description = description.replace(component === "deductions" ? / · deductions(?= ·|$)/ : / · employer cost(?= ·|$)/, ` · ${translate(`schedules.components.${component}`)}`);
      }
    }
    // A default recurring name is already represented by the localized category.
    if (category?.default_key && !category.custom_name && description === category.name) description = translate(`planning.defaults.${category.default_key}`);
    const parts = [
      source.project?.project?.name,
      source.project?.contractor?.name,
      source.project?.context_label,
      obligation?.employee_name,
      description,
      obligation?.period_start ? formatMonth(obligation.period_start) : null,
    ].flatMap(part => part?.trim() && part.trim() !== title ? [part.trim()] : []);
    return [...new Set(parts)].join(" · ");
  }).filter(Boolean))];
}
