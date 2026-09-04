"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, LayoutDashboard, MessageSquareText, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/office", key: "overview", icon: LayoutDashboard },
  { href: "/office/submissions", key: "submissions", icon: MessageSquareText },
  { href: "/office/assignments", key: "assignments", icon: ClipboardCheck },
] as const;

export function OfficeShell({ children, isAdmin }: { children: React.ReactNode; isAdmin: boolean }) {
  const t = useTranslations("Office");
  const pathname = usePathname();
  const [chooserOpen, setChooserOpen] = useState(false);
  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="text-2xl font-bold tracking-tight text-[var(--ui-text)] sm:text-3xl">{t("title")}</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--ui-text-secondary)]">{t("description")}</p></div>
      {isAdmin ? <Button type="button" size="lg" onClick={() => setChooserOpen(true)}><Plus className="mr-2 size-4" aria-hidden="true" />{t("create")}</Button> : <Button asChild size="lg"><Link href="/office/submissions?create=submission"><Plus className="mr-2 size-4" aria-hidden="true" />{t("create")}</Link></Button>}
    </header>
    <nav aria-label={t("tabs.label")} className="flex gap-1 overflow-x-auto border-b border-[var(--ui-border)]">
      {tabs.map(({ href, key, icon: Icon }) => {
        const active = href === "/office" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", active ? "border-[var(--ui-action-primary)] text-[var(--ui-text)]" : "border-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]")}><Icon className="size-4" aria-hidden="true" />{t(`tabs.${key}`)}</Link>;
      })}
    </nav>
    {children}
    <Dialog isOpen={chooserOpen} onRequestClose={() => setChooserOpen(false)} closeLabel={t("close")} title={t("chooser.title")} description={t("chooser.description")} className="max-w-lg">
      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
        <CreateChoice initialFocus href="/office/submissions?create=submission" icon={MessageSquareText} title={t("chooser.submission")} description={t("chooser.submissionDescription")} onClick={() => setChooserOpen(false)} />
        <CreateChoice href="/office/assignments?create=assignment" icon={ClipboardCheck} title={t("chooser.assignment")} description={t("chooser.assignmentDescription")} onClick={() => setChooserOpen(false)} />
      </div>
    </Dialog>
  </div>;
}

function CreateChoice({ initialFocus = false, href, icon: Icon, title, description, onClick }: { initialFocus?: boolean; href: string; icon: typeof ClipboardCheck; title: string; description: string; onClick: () => void }) {
  return <Link data-dialog-initial-focus={initialFocus || undefined} href={href} onClick={onClick} className="group rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] p-4 transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="flex size-10 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-action-primary)]/10 text-[var(--ui-action-primary)]"><Icon className="size-5" aria-hidden="true" /></span><strong className="mt-4 block text-sm text-[var(--ui-text)]">{title}</strong><span className="mt-1 block text-xs leading-5 text-[var(--ui-text-muted)]">{description}</span></Link>;
}
