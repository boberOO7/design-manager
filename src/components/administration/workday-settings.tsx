"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { createClient } from "@/lib/supabase/client";

export function WorkdaySettings({ studioId, initialMinutes }: { studioId: string; initialMinutes: number }) {
  const t = useTranslations("Administration");
  const [hours, setHours] = useState(String(initialMinutes / 60));
  const [saved, setSaved] = useState(initialMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const minutes = Number(hours) * 60;
  const valid = hours.trim() !== "" && Number.isSafeInteger(minutes) && minutes > 0 && minutes <= 2147483647;
  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(false);
    try {
      const result = await createClient().rpc("set_standard_workday_minutes", { p_studio_id: studioId, p_minutes: minutes });
      if (result.error) throw result.error;
      setSaved(minutes);
    } catch { setError(true); }
    finally { setSaving(false); }
  }
  return <section aria-labelledby="workday-settings-heading" className="space-y-3">
    <h2 id="workday-settings-heading" className="flex items-center gap-2 text-base font-semibold"><Clock3 aria-hidden className="size-4 text-[var(--ui-text-secondary)]" />{t("standardWorkday")}</h2>
    <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm text-[var(--ui-text-secondary)]">{t("workdayHours")}<Input type="number" min="0" step="any" className="w-24" value={hours} disabled={saving} onChange={event => setHours(event.target.value)} /></label>
      <Button type="button" size="sm" disabled={!valid || minutes === saved || saving} onClick={() => void save()}>{saving ? t("vacationSaving") : t("vacationSave")}</Button>
    </div>
    {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("workdaySaveFailed")}</p> : null}
  </section>;
}
