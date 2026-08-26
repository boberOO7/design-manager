"use client";

import { useState } from "react";
import { getAvatarImageUrl, getUserInitials } from "@/lib/user-avatar";
import { cn } from "@/lib/utils";

const sizeClassName = {
  board: "size-5 text-[9px]",
  boardCard: "size-7 text-[11px]",
  directoryPortrait: "size-32 text-4xl",
  header: "size-11 text-xs",
  projectList: "size-8 text-xs",
  profile: "size-16 text-base",
} as const;

type UserAvatarProps = {
  className?: string;
  decorative?: boolean;
  imageUrl?: string | null;
  name?: string | null;
  size?: keyof typeof sizeClassName;
};

export function UserAvatar({
  className,
  decorative = false,
  imageUrl,
  name,
  size = "board",
}: UserAvatarProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const resolvedImageUrl = getAvatarImageUrl(imageUrl);
  const initials = getUserInitials(name);
  const hasImage = Boolean(resolvedImageUrl) && failedImageUrl !== resolvedImageUrl;
  const accessibleName = name?.trim();

  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative || !accessibleName ? undefined : accessibleName}
      role={decorative || !accessibleName ? undefined : "img"}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] font-semibold text-[var(--ui-text-secondary)]",
        sizeClassName[size],
        className,
      )}
    >
      {hasImage ? (
        // Profile image hosts are user-managed and are not restricted to a configured Next Image remote pattern.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="size-full object-cover"
          onError={() => {
            if (resolvedImageUrl) setFailedImageUrl(resolvedImageUrl);
          }}
          src={resolvedImageUrl}
        />
      ) : initials}
    </span>
  );
}
