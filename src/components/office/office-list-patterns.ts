export const officeListDesktopGridClassName = "xl:grid-cols-[minmax(14rem,1.4fr)_minmax(10rem,0.75fr)_minmax(11rem,0.85fr)_7.5rem_13.5rem]";

export const officeWorkflowStyles = {
  info: "border-[var(--ui-info-border)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)] hover:opacity-85",
  success: "border-[var(--ui-success-border)] bg-[var(--ui-success-surface)] text-[var(--ui-success-text)] hover:opacity-85",
  warning: "border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)] hover:opacity-85",
  violet: "border-[var(--ui-violet-border)] bg-[var(--ui-violet-surface)] text-[var(--ui-violet-text)] hover:opacity-85",
} as const;

export type OfficeWorkflowTone = keyof typeof officeWorkflowStyles;
