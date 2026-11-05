export const contractorCategoryColorKeys = [
  "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "bronze",
] as const;

export type ContractorCategoryColorKey = (typeof contractorCategoryColorKeys)[number];

const categoryBadgeClasses: Record<ContractorCategoryColorKey, string> = {
  red: "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]",
  orange: "bg-[var(--ui-urgent-surface)] text-[var(--ui-urgent-text)]",
  yellow: "bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]",
  green: "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]",
  teal: "bg-[var(--ui-category-teal-surface)] text-[var(--ui-category-teal-text)]",
  blue: "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]",
  pink: "bg-[var(--ui-category-pink-surface)] text-[var(--ui-category-pink-text)]",
  purple: "bg-[var(--ui-category-purple-surface)] text-[var(--ui-category-purple-text)]",
  bronze: "bg-[var(--ui-category-bronze-surface)] text-[var(--ui-category-bronze-text)]",
};

export function isContractorCategoryColorKey(value: string): value is ContractorCategoryColorKey {
  return contractorCategoryColorKeys.some((key) => key === value);
}

export function getContractorCategoryBadgeClassName(colorKey: string): string {
  return isContractorCategoryColorKey(colorKey)
    ? categoryBadgeClasses[colorKey]
    : "bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]";
}

export function getContractorCategoryColorLabel(colorKey: ContractorCategoryColorKey, locale: string): string {
  const labels = locale.startsWith("uk")
    ? { red: "Червоний", orange: "Помаранчевий", yellow: "Жовтий", green: "Зелений", teal: "Бірюзовий", blue: "Синій", purple: "Фіолетовий", pink: "Рожевий", bronze: "Бронзовий" }
    : { red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", teal: "Cyan-teal", blue: "Blue", purple: "Purple", pink: "Pink", bronze: "Brown-bronze" };
  return labels[colorKey];
}
