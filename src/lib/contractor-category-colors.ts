export const contractorCategoryColorKeys = [
  "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "bronze",
] as const;

export type ContractorCategoryColorKey = (typeof contractorCategoryColorKeys)[number];

const categoryBadgeClasses: Record<ContractorCategoryColorKey, string> = {
  red: "border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]",
  orange: "border border-[var(--ui-urgent-border)] bg-[var(--ui-urgent-surface)] text-[var(--ui-urgent-text)]",
  yellow: "border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]",
  green: "border border-[var(--ui-success-border)] bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]",
  teal: "border border-[var(--ui-category-teal-border)] bg-[var(--ui-category-teal-surface)] text-[var(--ui-category-teal-text)]",
  blue: "border border-[var(--ui-info-border)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]",
  pink: "border border-[var(--ui-category-pink-border)] bg-[var(--ui-category-pink-surface)] text-[var(--ui-category-pink-text)]",
  purple: "border border-[var(--ui-category-purple-border)] bg-[var(--ui-category-purple-surface)] text-[var(--ui-category-purple-text)]",
  bronze: "border border-[var(--ui-category-bronze-border)] bg-[var(--ui-category-bronze-surface)] text-[var(--ui-category-bronze-text)]",
};

export function isContractorCategoryColorKey(value: string): value is ContractorCategoryColorKey {
  return contractorCategoryColorKeys.some((key) => key === value);
}

export function getContractorCategoryBadgeClassName(colorKey: string): string {
  return isContractorCategoryColorKey(colorKey)
    ? categoryBadgeClasses[colorKey]
    : "border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]";
}

export function getContractorCategoryColorLabel(colorKey: ContractorCategoryColorKey, locale: string): string {
  const labels = locale.startsWith("uk")
    ? { red: "Червоний", orange: "Помаранчевий", yellow: "Жовтий", green: "Зелений", teal: "Бірюзовий", blue: "Синій", purple: "Фіолетовий", pink: "Рожевий", bronze: "Бронзовий" }
    : { red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", teal: "Cyan-teal", blue: "Blue", purple: "Purple", pink: "Pink", bronze: "Brown-bronze" };
  return labels[colorKey];
}
