import type { FinanceMovementContext } from "@/data/queries/finance-movement-context";
import type { FinanceCategory } from "./finance-planning";

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
