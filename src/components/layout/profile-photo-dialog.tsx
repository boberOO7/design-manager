"use client";

import { LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AvatarCropStep } from "@/components/layout/avatar-crop-step";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createClient } from "@/lib/supabase/client";
import { removeAvatarObjects } from "@/lib/avatar-storage-cleanup";
import { AVATAR_BUCKET, getAvatarFileValidationError, getAvatarOriginalPath } from "@/lib/user-avatar";

function getFileExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp") return extension;
  return file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
}

export function ProfilePhotoDialog({ avatarUrl: currentAvatarUrl, fullName, userId, isOpen, onClose, onAvatarChanged, returnFocusRef }: {
  avatarUrl?: string;
  fullName: string;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onAvatarChanged: (url: string | undefined) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("Account");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const displayedAvatarUrl = previewUrl ?? currentAvatarUrl;

  function closeDialog() {
    if (isPending) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCropFile(null);
    setError(null);
    onClose();
  }

  async function persistAvatar(path: string | null) {
    const { error: updateError } = await createClient().rpc("update_my_avatar", path === null ? {} : { p_avatar_path: path });
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
    onAvatarChanged(newAvatarPath);
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
    onAvatarChanged(undefined);
    setIsPending(false);
    router.refresh();
  }

  return <Dialog className="h-auto max-h-[calc(100dvh-1rem)] max-w-md" returnFocusRef={returnFocusRef} closeDisabled={isPending || Boolean(cropFile)} closeLabel={t("close")} description={cropFile ? t("cropAvatarDescription") : t("profilePhotoDescription")} isOpen={isOpen} onRequestClose={closeDialog} title={cropFile ? t("cropAvatar") : t("profilePhoto")}>
    {cropFile ? <AvatarCropStep file={cropFile} onCancel={() => setCropFile(null)} onFailure={() => setError(t("uploadFailed"))} onConfirm={async (croppedFile, originalFile) => {
      if (await uploadPhoto(croppedFile, originalFile)) setCropFile(null);
    }} /> : <div className="overflow-y-auto p-4 sm:p-6">
        <section aria-labelledby="profile-photo-heading">
          <div className="flex items-center gap-4">
            <UserAvatar imageUrl={displayedAvatarUrl} name={fullName} size="profile" />
            <div className="min-w-0"><h3 id="profile-photo-heading" className="font-medium text-[var(--ui-text)]">{t("profilePhoto")}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("photoRequirements")}</p></div>
          </div>
          <input ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isPending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; const validationError = getAvatarFileValidationError(file); if (validationError) { setError(t(validationError)); return; } setError(null); setCropFile(file); }} type="file" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={isPending} onClick={() => fileInputRef.current?.click()} type="button"><Upload className="size-4" aria-hidden="true" />{isPending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t("uploadingPhoto")}</> : currentAvatarUrl ? t("changePhoto") : t("uploadPhoto")}</Button>
            {currentAvatarUrl ? <Button disabled={isPending} onClick={() => void removePhoto()} type="button" variant="outline"><Trash2 className="size-4" aria-hidden="true" />{t("removePhoto")}</Button> : null}
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
        </section>
    </div>}
  </Dialog>;
}
