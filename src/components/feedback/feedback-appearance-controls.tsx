"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { feedbackBackgroundKeys, type FeedbackTemplate } from "@/lib/feedback-template";
import { getFeedbackAppearance } from "@/lib/feedback-appearance";

import { FeedbackColorPicker } from "./feedback-color-picker";

export function FeedbackAppearanceControls({ accent, background = "original", disabled, onChange }: {
  accent: string; background?: FeedbackTemplate["background"]; disabled: boolean;
  onChange: (patch: Pick<Partial<FeedbackTemplate>, "accent" | "background">) => void;
}) {
  const t = useTranslations("Feedback");
  const id = useId();
  const [hexDraft, setHexDraft] = useState({ accent, text: accent });
  const hex = hexDraft.accent === accent ? hexDraft.text : accent;
  if (hexDraft.accent !== accent) setHexDraft({ accent, text: accent });
  const validHex = /^#[0-9a-fA-F]{6}$/.test(hex);
  const selectAccent = (value: string) => { setHexDraft({ accent: value, text: value }); onChange({ accent: value }); };
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    <Popover.Root>
      <div className="flex items-center gap-2"><span className="text-xs text-[var(--ui-text-secondary)]">{t("editor.accent")}</span><Popover.Trigger asChild>
        <button type="button" aria-label={t("editor.accent")} aria-description={accent} data-color={accent} disabled={disabled} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ui-radius-control)] px-1.5 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-60 sm:min-h-9"><span className="size-7 rounded-lg" style={{ backgroundColor: accent }} /><ChevronDown size={13} className="text-[var(--ui-text-muted)]" aria-hidden /></button>
      </Popover.Trigger></div>
      <Popover.Portal><Popover.Content align="end" sideOffset={8} collisionPadding={12} aria-label={t("editor.accent")} className="z-[80] w-64 max-w-[calc(100vw-1.5rem)] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]">
        <h3 className="text-sm font-semibold">{t("editor.accent")}</h3>
        <FeedbackColorPicker value={accent} disabled={disabled} onChange={selectAccent} />
        <label htmlFor={id} className="mt-4 block text-xs font-medium text-[var(--ui-text-secondary)]">HEX</label>
        <Input id={id} aria-label={t("editor.accentHex")} aria-invalid={!validHex} aria-describedby={!validHex ? `${id}-error` : undefined} disabled={disabled} value={hex} maxLength={7} spellCheck={false} autoComplete="off" className="mt-1.5 h-9 font-mono text-xs" onChange={event => { const value = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`; const valid = /^#[0-9a-fA-F]{6}$/.test(value); setHexDraft({ accent: valid ? value.toLowerCase() : accent, text: value }); if (valid) onChange({ accent: value.toLowerCase() }); }} />
        {!validHex ? <p id={`${id}-error`} className="mt-2 text-xs text-[var(--ui-danger-text)]">{t("editor.invalidHex")}</p> : null}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    <Popover.Root>
      <div className="flex items-center gap-2"><span className="text-xs text-[var(--ui-text-secondary)]">{t("editor.background")}</span><Popover.Trigger asChild><button type="button" aria-label={t("editor.background")} aria-description={t(`editor.backgrounds.${background}`)} data-background-preset={background} disabled={disabled} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ui-radius-control)] px-1.5 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-60 sm:min-h-9"><span className="grid size-7 place-items-center rounded-lg" style={{ backgroundColor: getFeedbackAppearance(accent, background).bg, color: getFeedbackAppearance(accent, background).text }}><span className="text-[10px] font-medium">Aa</span></span><ChevronDown size={13} className="text-[var(--ui-text-muted)]" aria-hidden /></button></Popover.Trigger></div>
      <Popover.Portal><Popover.Content align="end" sideOffset={8} collisionPadding={12} aria-label={t("editor.background")} className="z-[80] w-72 max-w-[calc(100vw-1.5rem)] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]">
        <h3 className="text-sm font-semibold">{t("editor.background")}</h3><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{t("editor.backgroundHint")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={t("editor.backgroundPresets")}>{feedbackBackgroundKeys.map(value => {
          const palette = getFeedbackAppearance(accent, value);
          return <button key={value} type="button" disabled={disabled} aria-label={t(`editor.backgrounds.${value}`)} aria-pressed={background === value} onClick={() => onChange({ background: value })} className={cn("rounded-[var(--ui-radius-control)] border p-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", background === value ? "border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)]" : "border-[var(--ui-border)] hover:bg-[var(--ui-surface-subtle)]")}><span className="relative mb-2 block rounded-md px-3 py-3" style={{ backgroundColor: palette.bg, color: palette.text }}><span className="text-base font-medium">Aa</span><span className="mt-2 block h-1 w-9 rounded" style={{ backgroundColor: palette.ink }} />{background === value ? <Check size={13} className="absolute right-2 top-2" aria-hidden /> : null}</span><span className="text-xs font-medium">{t(`editor.backgrounds.${value}`)}</span></button>;
        })}</div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </div>;
}
