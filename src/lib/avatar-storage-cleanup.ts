import { getAvatarOriginalPath, isAvatarObjectPath } from "@/lib/user-avatar";

type AvatarStorageRemover = {
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
};

export function getAvatarCleanupPaths(avatarPath: string | null | undefined): string[] {
  if (!isAvatarObjectPath(avatarPath)) return [];
  const originalPath = getAvatarOriginalPath(avatarPath);
  return originalPath ? [avatarPath, originalPath] : [avatarPath];
}

export async function removeAvatarObjects(remover: AvatarStorageRemover, avatarPath: string | null | undefined): Promise<boolean> {
  const paths = getAvatarCleanupPaths(avatarPath);
  if (paths.length === 0) return true;

  try {
    const { error } = await remover.remove(paths);
    if (!error) return true;
    console.error("Avatar Storage cleanup failed", { error, paths });
  } catch (error) {
    console.error("Avatar Storage cleanup failed", { error, paths });
  }
  return false;
}
