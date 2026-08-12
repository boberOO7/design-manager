import { describe, expect, it, vi } from "vitest";
import { getAvatarCleanupPaths, removeAvatarObjects } from "./avatar-storage-cleanup";

describe("avatar Storage cleanup", () => {
  it("deletes the prior cropped avatar and its paired original only after it is supplied", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    await expect(removeAvatarObjects({ remove }, "user-id/next.avatar.jpg")).resolves.toBe(true);
    expect(remove).toHaveBeenCalledWith(["user-id/next.avatar.jpg", "user-id/next.avatar.jpg.original"]);
  });

  it("keeps legacy avatars as a single-object cleanup target", () => {
    expect(getAvatarCleanupPaths("user-id/legacy.jpg")).toEqual(["user-id/legacy.jpg"]);
  });

  it("logs cleanup failures instead of silently losing them", async () => {
    const error = { message: "permission denied" };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(removeAvatarObjects({ remove: vi.fn().mockResolvedValue({ error }) }, "user-id/next.avatar.jpg")).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalledWith("Avatar Storage cleanup failed", expect.objectContaining({ error }));
    consoleError.mockRestore();
  });
});
