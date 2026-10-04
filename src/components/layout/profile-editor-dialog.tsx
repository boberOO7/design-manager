"use client";

import { LoaderCircle, X } from "lucide-react";
import { useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { DatePicker } from "@/components/ui/date-picker";
import { CityCombobox } from "@/components/projects/city-combobox";
import { Select, SelectItem } from "@/components/ui/select";
import { GoogleCalendarIntegration } from "@/components/layout/google-calendar-integration";
import { getCountryOptions, isCountryCode } from "@/lib/countries";
import { createClient } from "@/lib/supabase/client";
import type { ProfileAvatarEditorProps } from "@/components/layout/profile-avatar-editor";

export function ProfileEditorDialog({ birthDate, city, cityGeoNamesId, countryCode: initialCountryCodeProp, joinedAt, notificationPopupsEnabled, notificationSoundEnabled, systemRole, isOpen, googleCalendarResult, onClose, onExited, returnFocusRef }: ProfileAvatarEditorProps & { isOpen: boolean; googleCalendarResult: string | null; onClose: () => void; onExited: () => void; returnFocusRef: RefObject<HTMLButtonElement | null> }) {
  const t = useTranslations("Account");
  const locale = useLocale();
  const router = useRouter();
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const initialCountryCode = initialCountryCodeProp ?? "UA";
  const initialBirthDate = birthDate ?? "";
  const initialJoinedAt = joinedAt ?? "";
  const initialCity = city ?? "";
  const initialCityGeoNamesId = cityGeoNamesId ?? undefined;
  const [currentCountryCode, setCurrentCountryCode] = useState(initialCountryCode);
  const [currentCity, setCurrentCity] = useState(initialCity);
  const [currentCityGeoNamesId, setCurrentCityGeoNamesId] = useState<number | undefined>(initialCityGeoNamesId);
  const [currentBirthDate, setCurrentBirthDate] = useState(initialBirthDate);
  const [currentJoinedAt, setCurrentJoinedAt] = useState(initialJoinedAt);
  const [currentNotificationPopupsEnabled, setCurrentNotificationPopupsEnabled] = useState(notificationPopupsEnabled);
  const [currentNotificationSoundEnabled, setCurrentNotificationSoundEnabled] = useState(notificationSoundEnabled);
  const countryOptions = getCountryOptions(locale);
  const isProfilePending = isSavingProfile;
  const canEditStartDate = systemRole === "admin";
  const isProfileDirty = currentBirthDate !== initialBirthDate || currentCountryCode !== initialCountryCode || currentCity !== initialCity || currentCityGeoNamesId !== initialCityGeoNamesId || currentNotificationPopupsEnabled !== notificationPopupsEnabled || currentNotificationSoundEnabled !== notificationSoundEnabled || (canEditStartDate && currentJoinedAt !== initialJoinedAt);

  function resetProfileFields() {
    setCurrentBirthDate(initialBirthDate);
    setCurrentJoinedAt(initialJoinedAt);
    setCurrentCountryCode(initialCountryCode);
    setCurrentCity(initialCity);
    setCurrentCityGeoNamesId(initialCityGeoNamesId);
    setCurrentNotificationPopupsEnabled(notificationPopupsEnabled);
    setCurrentNotificationSoundEnabled(notificationSoundEnabled);
    setProfileError(null);
  }

  function closeDialog() {
    if (isProfilePending) return;
    resetProfileFields();
    onClose();
  }

  async function saveProfile() {
    const normalizedCity = currentCity.trim();
    if (normalizedCity && !isCountryCode(currentCountryCode)) {
      setProfileError(t("locationCountryRequired"));
      return;
    }

    setProfileError(null);
    setIsSavingProfile(true);
    const profileInput = {
      ...(currentBirthDate ? { p_birth_date: currentBirthDate } : {}),
      ...(normalizedCity ? { p_city: normalizedCity } : {}),
      ...(normalizedCity && currentCityGeoNamesId !== null ? { p_city_geonames_id: currentCityGeoNamesId } : {}),
      ...(currentCountryCode ? { p_country_code: currentCountryCode } : {}),
      p_joined_at: canEditStartDate ? currentJoinedAt || undefined : undefined,
      p_notification_popups_enabled: currentNotificationPopupsEnabled,
      p_notification_sound_enabled: currentNotificationSoundEnabled,
    };
    const { error: updateError } = await createClient().rpc("update_my_profile_details", profileInput);

    if (updateError) {
      setProfileError(t("profileSaveFailed"));
      setIsSavingProfile(false);
      return;
    }

    setIsSavingProfile(false);
    onClose();
    router.refresh();
  }

  return <Drawer className="w-full max-w-full duration-200 motion-reduce:duration-[1ms] sm:w-[28rem]" returnFocusRef={returnFocusRef} description={t("profileEditorDescription")} isOpen={isOpen} onClose={closeDialog} onExited={onExited} title={t("profileEditor")}>
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ui-border)] px-5 py-3">
      <p className="text-lg font-semibold text-[var(--ui-text)]">{t("profileEditor")}</p>
      <Button aria-label={t("closeProfilePhoto")} className="size-11 shrink-0 px-0" disabled={isProfilePending} onClick={closeDialog} type="button" variant="ghost"><X className="size-5" aria-hidden="true" /></Button>
    </header>
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
      <section aria-labelledby="profile-details-heading">
        <h3 id="profile-details-heading" className="text-sm font-semibold text-[var(--ui-text)]">{t("profileDetails")}</h3>
        <fieldset disabled={isProfilePending} className="mt-4 space-y-4">
          <div><label className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("birthday")}</label><DatePicker aria-label={t("birthday")} className="mt-2 w-full" disabled={isProfilePending} locale={locale} onValueChange={(value) => { setCurrentBirthDate(value); setProfileError(null); }} value={currentBirthDate} /></div>
          <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">{t("country")}
            <Select className="mt-2" disabled={isProfilePending} onValueChange={(value) => { setCurrentCountryCode(value); setCurrentCity(""); setCurrentCityGeoNamesId(undefined); setProfileError(null); }} placeholder={t("selectCountry")} value={currentCountryCode}>
              <SelectItem value="">{t("notConfigured")}</SelectItem>
              {countryOptions.map((country) => <SelectItem key={country.code} value={country.code}>{country.label}</SelectItem>)}
            </Select>
          </label>
          <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">{t("city")}
            {isCountryCode(currentCountryCode) ? <CityCombobox className="mt-2" countryCode={currentCountryCode} name="profile-city" onGeoNamesIdChange={setCurrentCityGeoNamesId} onValueChange={(value) => { setCurrentCity(value); setProfileError(null); }} value={currentCity} /> : <p className="mt-2 flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-dashed border-[var(--ui-border-strong)] px-3 text-sm font-normal text-[var(--ui-text-muted)]">{t("selectCountryFirst")}</p>}
          </label>
          {canEditStartDate ? <div><label className="text-sm font-medium text-[var(--ui-text-secondary)]">{t("startDate")}</label><DatePicker aria-label={t("startDate")} className="mt-2 w-full" disabled={isProfilePending} locale={locale} onValueChange={(value) => { setCurrentJoinedAt(value); setProfileError(null); }} value={currentJoinedAt} /></div> : null}
        </fieldset>
      </section>
      <section aria-labelledby="notification-settings-heading" className="border-t border-[var(--ui-border-subtle)] pt-5">
        <h3 id="notification-settings-heading" className="text-sm font-semibold text-[var(--ui-text)]">{t("notificationSettings")}</h3>
        <p className="mt-1 text-sm leading-5 text-[var(--ui-text-muted)]">{t("notificationSettingsDescription")}</p>
        <div className="mt-3 space-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-control)] text-sm text-[var(--ui-text)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)]"><input checked={currentNotificationPopupsEnabled} className="size-5 shrink-0 accent-[var(--ui-action-primary)]" disabled={isProfilePending} onChange={(event) => setCurrentNotificationPopupsEnabled(event.target.checked)} type="checkbox" />{t("notificationPopups")}</label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-control)] text-sm text-[var(--ui-text)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)]"><input checked={currentNotificationSoundEnabled} className="size-5 shrink-0 accent-[var(--ui-action-primary)]" disabled={isProfilePending} onChange={(event) => setCurrentNotificationSoundEnabled(event.target.checked)} type="checkbox" />{t("notificationSound")}</label>
        </div>
      </section>
      <section aria-labelledby="profile-integrations-heading" className="border-t border-[var(--ui-border-subtle)] pt-5">
        <h3 id="profile-integrations-heading" className="mb-4 text-sm font-semibold text-[var(--ui-text)]">{t("integrations")}</h3>
        <GoogleCalendarIntegration active={isOpen} oauthResult={googleCalendarResult} />
      </section>
      {profileError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{profileError}</p> : null}
    </div>
    <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--ui-border)] bg-[var(--ui-surface)] px-5 py-3"><Button disabled={isProfilePending} onClick={closeDialog} type="button" variant="ghost">{t("cancel")}</Button><Button aria-busy={isSavingProfile} disabled={isProfilePending || !isProfileDirty} onClick={() => void saveProfile()} type="button">{isSavingProfile ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t("saving")}</> : t("save")}</Button></footer>
  </Drawer>;
}
