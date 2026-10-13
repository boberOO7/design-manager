import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectListToolbar } from "./project-list";
import { projectListDesktopGridClassName } from "./project-list-layout";

export function ProjectListBlueprint() {
  const t = useTranslations("Common");
  return <div role="status" aria-label={t("loading")} className="@container instaload-blueprint">
    <span className="sr-only">{t("loading")}</span>
    <div aria-hidden="true" className="@min-[70rem]:overflow-hidden @min-[70rem]:rounded-[var(--ui-radius-panel)] @min-[70rem]:border @min-[70rem]:border-[var(--ui-border)] @min-[70rem]:bg-[var(--ui-surface)]">
      <div className="mb-3 flex h-8 gap-5 px-1 @min-[70rem]:mb-0 @min-[70rem]:h-[41px] @min-[70rem]:border-b @min-[70rem]:border-[var(--ui-border)] @min-[70rem]:bg-[var(--ui-surface-muted)] @min-[70rem]:px-4"><span className="instaload-mark my-auto h-2 w-24" /><span className="instaload-mark my-auto h-2 w-20" /><span className="instaload-mark my-auto h-2 w-16" /></div>
      <div className="hidden divide-y divide-[var(--ui-border)] @min-[70rem]:block">{Array.from({ length: 6 }, (_, i) => <div key={i} className={`grid min-h-24 ${projectListDesktopGridClassName} items-center gap-x-4 px-4 py-3 @min-[80rem]:gap-x-7`}>
        <div className="space-y-2"><span className="instaload-mark h-4 w-3/4" /><span className="instaload-mark h-3 w-1/2" /></div>
        <div className="flex -space-x-1.5">{[0, 1, 2].map(n => <span key={n} className="instaload-mark size-8 rounded-full" />)}</div>
        <div className="space-y-3"><span className="instaload-mark h-2 w-full" /><div className="flex gap-2">{[0, 1, 2].map(n => <span key={n} className="instaload-mark h-6 w-16" />)}</div></div>
        <span className="instaload-mark h-3 w-20 justify-self-center" /><span className="instaload-mark h-5 w-16 justify-self-center" />
      </div>)}</div>
    </div>
    <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 @min-[70rem]:hidden">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex min-h-[18.75rem] flex-col rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
      <span className="instaload-mark h-4 w-3/4" /><span className="instaload-mark mt-2 h-3 w-1/2" />
      <div className="mt-3 flex min-h-10 items-start"><span className="instaload-mark h-5 w-20" /></div>
      <div className="mt-4 flex min-h-8 -space-x-1.5">{[0, 1, 2].map(n => <span key={n} className="instaload-mark size-8 rounded-full" />)}</div>
      <div className="mt-auto min-h-16 space-y-3 pt-4"><span className="instaload-mark h-2 w-full" /><div className="flex gap-2">{[0, 1, 2].map(n => <span key={n} className="instaload-mark h-6 w-16" />)}</div></div>
      <div className="mt-3 border-t border-[var(--ui-border-subtle)] pt-3"><span className="instaload-mark h-5 w-36" /></div>
    </div>)}</div>
  </div>;
}

export function ProjectsBlueprint() {
  const t = useTranslations("Projects");
  return <div className="space-y-6"><PageHeader title={t("title")} description={t("description")} /><ProjectListToolbar /><ProjectListBlueprint /></div>;
}
