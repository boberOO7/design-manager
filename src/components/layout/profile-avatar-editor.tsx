"use client";

import { Camera, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_BUCKET, getAvatarFileValidationError, isAvatarObjectPath } from "@/lib/user-avatar";

type ProfileAvatarEditorProps = {
  avatarUrl?: string;
  fullName: string;
  userId: string;
};

function getFileExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp") return extension;
  return file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
}

export function ProfileAvatarEditor({ avatarUrl, fullName, userId }: ProfileAvatarEditorProps) {
  const t = useTranslations("Account");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const displayedAvatarUrl = previewUrl ?? currentAvatarUrl;

  function closeDialog() {
    if (isPending) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setError(null);
    setIsOpen(false);
  }

  async function persistAvatar(path: string | null) {
    const { error: updateError } = await createClient().rpc("update_my_avatar", { p_avatar_path: path });
    if (updateError) throw updateError;
  }

  async function uploadPhoto(file: File) {
    const validationError = getAvatarFileValidationError(file);
    if (validationError) {
      setError(t(validationError));
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const localPreview = URL.createObjectURL(file);
    const oldAvatarPath = currentAvatarUrl;
    const newAvatarPath = `${userId}/${crypto.randomUUID()}.${getFileExtension(file)}`;
    setPreviewUrl(localPreview);
    setError(null);
    setIsPending(true);

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(newAvatarPath, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      setError(t("uploadFailed"));
      setIsPending(false);
      return;
    }

    try {
      await persistAvatar(newAvatarPath);
    } catch {
      await supabase.storage.from(AVATAR_BUCKET).remove([newAvatarPath]);
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      setError(t("saveFailed"));
      setIsPending(false);
      return;
    }

    if (isAvatarObjectPath(oldAvatarPath)) {
      void supabase.storage.from(AVATAR_BUCKET).remove([oldAvatarPath]);
    }
    URL.revokeObjectURL(localPreview);
    setPreviewUrl(null);
    setCurrentAvatarUrl(newAvatarPath);
    setIsPending(false);
    router.refresh();
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
    if (isAvatarObjectPath(oldAvatarPath)) {
      void createClient().storage.from(AVATAR_BUCKET).remove([oldAvatarPath]);
    }
    setCurrentAvatarUrl(undefined);
    setIsPending(false);
    router.refresh();
  }

  return <>
    <button type="button" onClick={() => setIsOpen(true)} className="group relative inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" aria-label={t("editProfilePhoto")}>
      <UserAvatar imageUrl={currentAvatarUrl} name={fullName} size="header" decorative />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-4" aria-hidden="true" /></span>
    </button>
    <Dialog closeDisabled={isPending} closeLabel={t("closeProfilePhoto")} description={t("profilePhotoDescription")} isOpen={isOpen} onRequestClose={closeDialog} title={t("profilePhoto")}>
      <div className="space-y-5 overflow-y-auto p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <UserAvatar imageUrl={displayedAvatarUrl} name={fullName} size="profile" />
          <div className="min-w-0"><p className="font-medium text-[var(--ui-text)]">{fullName}</p><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("photoRequirements")}</p></div>
        </div>
        <input ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isPending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadPhoto(file); }} type="file" />
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending} onClick={() => fileInputRef.current?.click()} type="button"><Upload className="size-4" aria-hidden="true" />{isPending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t("uploadingPhoto")}</> : currentAvatarUrl ? t("changePhoto") : t("uploadPhoto")}</Button>
          {currentAvatarUrl ? <Button disabled={isPending} onClick={() => void removePhoto()} type="button" variant="outline"><Trash2 className="size-4" aria-hidden="true" />{t("removePhoto")}</Button> : null}
        </div>
        {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
      </div>
    </Dialog>
  </>;
}
