"use client";

import { useState } from "react";
import { getUserInitials } from "@/lib/user-avatar";
import { cn } from "@/lib/utils";

const sizeClassName = {
  board: "size-5 text-[9px]",
  header: "size-11 text-xs",
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
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedImageUrl = imageUrl?.trim();
  const initials = getUserInitials(name);
  const hasImage = Boolean(resolvedImageUrl) && !imageFailed;
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
          onError={() => setImageFailed(true)}
          src={resolvedImageUrl}
        />
      ) : initials}
    </span>
  );
}
