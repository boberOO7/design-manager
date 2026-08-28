"use client";

import { CakeSlice, CalendarDays, Camera, LoaderCircle, LockKeyhole, MapPin, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { AvatarCropStep } from "@/components/layout/avatar-crop-step";
import { CityCombobox } from "@/components/projects/city-combobox";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getCountryOptions, isCountryCode } from "@/lib/countries";
import { formatDateOnly } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { removeAvatarObjects } from "@/lib/avatar-storage-cleanup";
import { AVATAR_BUCKET, getAvatarFileValidationError, getAvatarOriginalPath } from "@/lib/user-avatar";
import type { SystemRole } from "@/types";

type ProfileAvatarEditorProps = {
  avatarUrl?: string;
  birthDate?: string | null;
  city?: string | null;
  cityGeoNamesId?: number | null;
  countryCode?: string | null;
  fullName: string;
  joinedAt: string | null;
  systemRole: SystemRole;
  userId: string;
};

function getFileExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp") return extension;
  return file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
}

export function ProfileAvatarEditor({ avatarUrl, birthDate, city, cityGeoNamesId, countryCode: initialCountryCodeProp, fullName, joinedAt, systemRole, userId }: ProfileAvatarEditorProps) {
  const t = useTranslations("Account");
  const locale = useLocale();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
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
  const displayedAvatarUrl = previewUrl ?? currentAvatarUrl;
  const countryOptions = getCountryOptions(locale);
  const isProfilePending = isPending || isSavingProfile;
  const canEditStartDate = systemRole === "admin";
  const isProfileDirty = currentBirthDate !== initialBirthDate || currentCountryCode !== initialCountryCode || currentCity !== initialCity || currentCityGeoNamesId !== initialCityGeoNamesId || (canEditStartDate && currentJoinedAt !== initialJoinedAt);

  function resetProfileFields() {
    setCurrentBirthDate(initialBirthDate);
    setCurrentJoinedAt(initialJoinedAt);
    setCurrentCountryCode(initialCountryCode);
    setCurrentCity(initialCity);
    setCurrentCityGeoNamesId(initialCityGeoNamesId);
    setProfileError(null);
  }

  function closeDialog() {
    if (isProfilePending) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCropFile(null);
    setError(null);
    resetProfileFields();
    setIsOpen(false);
  }

  async function persistAvatar(path: string | null) {
    const { error: updateError } = await createClient().rpc("update_my_avatar", { p_avatar_path: path });
    if (updateError) throw updateError;
  }

  async function uploadPhoto(file: File, originalFile: File): Promise<boolean> {
    const validationError = getAvatarFileValidationError(file);
    const originalValidationError = getAvatarFileValidationError(originalFile);
    const errorKey = validationError ?? originalValidationError;
    if (errorKey) {
      setError(t(errorKey));
      return false;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const localPreview = URL.createObjectURL(file);
    const oldAvatarPath = currentAvatarUrl;
    const newAvatarPath = `${userId}/${crypto.randomUUID()}.avatar.${getFileExtension(file)}`;
    const newOriginalPath = getAvatarOriginalPath(newAvatarPath);
    if (!newOriginalPath) return false;
    setPreviewUrl(localPreview);
    setError(null);
    setIsPending(true);

    const supabase = createClient();
    const { error: originalUploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(newOriginalPath, originalFile, {
      cacheControl: "31536000",
      contentType: originalFile.type,
      upsert: false,
    });
    if (originalUploadError) {
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      setError(t("uploadFailed"));
      setIsPending(false);
      return false;
    }

    const { error: avatarUploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(newAvatarPath, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
    if (avatarUploadError) {
      await removeAvatarObjects(supabase.storage.from(AVATAR_BUCKET), newOriginalPath);
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      setError(t("uploadFailed"));
      setIsPending(false);
      return false;
    }

    try {
      await persistAvatar(newAvatarPath);
    } catch {
      await removeAvatarObjects(supabase.storage.from(AVATAR_BUCKET), newAvatarPath);
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      setError(t("saveFailed"));
      setIsPending(false);
      return false;
    }

    await removeAvatarObjects(supabase.storage.from(AVATAR_BUCKET), oldAvatarPath);
    URL.revokeObjectURL(localPreview);
    setPreviewUrl(null);
    setCurrentAvatarUrl(newAvatarPath);
    setIsPending(false);
    router.refresh();
    return true;
  }

  async function removePhoto() {
    if (!currentAvatarUrl) return;
    const oldAvatarPath = currentAvatarUrl;
    setError(null);
    setIsPending(true);
    try {
      await persistAvatar(null);
    } catch {
      setError(t("removeFailed"));
      setIsPending(false);
      return;
    }
    await removeAvatarObjects(createClient().storage.from(AVATAR_BUCKET), oldAvatarPath);
    setCurrentAvatarUrl(undefined);
    setIsPending(false);
    router.refresh();
  }

  async function saveProfile() {
    const normalizedCity = currentCity.trim();
    if (normalizedCity && !isCountryCode(currentCountryCode)) {
      setProfileError(t("locationCountryRequired"));
      return;
    }

    setProfileError(null);
    setIsSavingProfile(true);
    const { error: updateError } = await createClient().rpc("update_my_profile_details", {
      p_birth_date: currentBirthDate || null,
      p_city: normalizedCity || null,
      p_city_geonames_id: normalizedCity ? currentCityGeoNamesId ?? null : null,
      p_country_code: currentCountryCode || null,
      p_joined_at: canEditStartDate ? currentJoinedAt || null : null,
    });

    if (updateError) {
      setProfileError(t("profileSaveFailed"));
      setIsSavingProfile(false);
      return;
    }

    setIsSavingProfile(false);
    setIsOpen(false);
    router.refresh();
  }

  return <>
    <button type="button" onClick={() => setIsOpen(true)} className="group relative inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" aria-label={t("editProfilePhoto")}>
      <UserAvatar imageUrl={currentAvatarUrl} name={fullName} size="header" decorative />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-4" aria-hidden="true" /></span>
    </button>
    <Dialog closeDisabled={isProfilePending || Boolean(cropFile)} closeLabel={t("closeProfilePhoto")} description={cropFile ? t("cropAvatarDescription") : t("profileEditorDescription")} isOpen={isOpen} onRequestClose={closeDialog} title={cropFile ? t("cropAvatar") : t("profileEditor")}>
      {cropFile ? <AvatarCropStep file={cropFile} onCancel={() => setCropFile(null)} onFailure={() => setError(t("uploadFailed"))} onConfirm={async (croppedFile, originalFile) => {
        if (await uploadPhoto(croppedFile, originalFile)) setCropFile(null);
      }} /> : <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <section aria-labelledby="profile-photo-heading">
          <div className="flex items-center gap-4">
            <UserAvatar imageUrl={displayedAvatarUrl} name={fullName} size="profile" />
            <div className="min-w-0"><h3 id="profile-photo-heading" className="font-medium text-[var(--ui-text)]">{t("profilePhoto")}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("photoRequirements")}</p></div>
          </div>
          <input ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isProfilePending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; const validationError = getAvatarFileValidationError(file); if (validationError) { setError(t(validationError)); return; } setError(null); setCropFile(file); }} type="file" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={isProfilePending} onClick={() => fileInputRef.current?.click()} type="button"><Upload className="size-4" aria-hidden="true" />{isPending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t("uploadingPhoto")}</> : currentAvatarUrl ? t("changePhoto") : t("uploadPhoto")}</Button>
            {currentAvatarUrl ? <Button disabled={isProfilePending} onClick={() => void removePhoto()} type="button" variant="outline"><Trash2 className="size-4" aria-hidden="true" />{t("removePhoto")}</Button> : null}
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
        </section>
        <section aria-labelledby="profile-dates-heading" className="border-t border-[var(--ui-border-subtle)] pt-5">
          <h3 id="profile-dates-heading" className="sr-only">{t("profileDates")}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
            <div>
              <div className="flex items-start gap-3"><CakeSlice aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)]" /><label className="font-medium text-[var(--ui-text)]">{t("birthday")}</label></div>
              <DatePicker aria-label={t("birthday")} className="mt-4 w-full" disabled={isProfilePending} locale={locale} onValueChange={(value) => { setCurrentBirthDate(value); setProfileError(null); }} value={currentBirthDate} />
            </div>
            <div>
              <div className="flex items-start gap-3"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)]" /><p className="font-medium text-[var(--ui-text)]">{t("startDate")}</p></div>
              {canEditStartDate ? <DatePicker aria-label={t("startDate")} className="mt-4 w-full" disabled={isProfilePending} locale={locale} onValueChange={(value) => { setCurrentJoinedAt(value); setProfileError(null); }} value={currentJoinedAt} /> : <div aria-describedby="start-date-read-only-hint" className="mt-4 flex h-11 items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] px-3 text-sm text-[var(--ui-text-secondary)]"><LockKeyhole aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-muted)]" /><span>{currentJoinedAt ? formatDateOnly(currentJoinedAt, locale) : "—"}</span></div>}
              {!canEditStartDate ? <p id="start-date-read-only-hint" className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("startDateManagedByAdmin")}</p> : null}
            </div>
          </div>
        </section>
        <section aria-labelledby="profile-location-heading" className="border-t border-[var(--ui-border-subtle)] pt-5">
          <div className="flex items-start gap-3">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)]" />
            <h3 id="profile-location-heading" className="font-medium text-[var(--ui-text)]">{t("location")}</h3>
          </div>
          <div aria-label={t("location")} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
            <label className="grid grid-rows-[auto_2.75rem] gap-2 text-sm font-medium text-[var(--ui-text)]">
              {t("country")}
              <Select disabled={isProfilePending} onValueChange={(value) => { setCurrentCountryCode(value); setCurrentCity(""); setCurrentCityGeoNamesId(undefined); setProfileError(null); }} placeholder={t("selectCountry")} value={currentCountryCode}>
                <SelectItem value="">{t("notConfigured")}</SelectItem>
                {countryOptions.map((country) => <SelectItem key={country.code} value={country.code}>{country.label}</SelectItem>)}
              </Select>
            </label>
            <label className="grid grid-rows-[auto_2.75rem] gap-2 text-sm font-medium text-[var(--ui-text)]">
              {t("city")}
              {isCountryCode(currentCountryCode) ? <CityCombobox className="mt-0" countryCode={currentCountryCode} name="profile-city" onGeoNamesIdChange={setCurrentCityGeoNamesId} onValueChange={(value) => { setCurrentCity(value); setProfileError(null); }} value={currentCity} /> : <p className="flex h-11 items-center rounded-[var(--ui-radius-control)] border border-dashed border-[var(--ui-border-strong)] px-3 text-sm font-normal text-[var(--ui-text-muted)]">{t("selectCountryFirst")}</p>}
            </label>
          </div>
        </section>
        {profileError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{profileError}</p> : null}
        </div>
        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 sm:flex-row sm:justify-end sm:px-6"><Button disabled={isProfilePending} onClick={closeDialog} type="button" variant="outline">{t("cancel")}</Button><Button aria-busy={isSavingProfile} disabled={isProfilePending || !isProfileDirty} onClick={() => void saveProfile()} type="button">{isSavingProfile ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t("saving")}</> : t("save")}</Button></footer>
      </div>}
    </Dialog>
  </>;
}
