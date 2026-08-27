import { describe, expect, it } from "vitest";
import { normalizeTaskCollaborators } from "./task-collaborators";

describe("task collaborator hydration", () => {
  it("retains persisted collaborator profiles from a task relation as one canonical list", () => {
    const collaborators = normalizeTaskCollaborators([
      {
        user_id: "collaborator-1",
        profile: { id: "profile-id-is-not-the-junction-key", full_name: "Ira Kovalenko", job_title: "Architect", avatar_url: "https://example.com/ira.png" },
      },
      {
        user_id: "collaborator-2",
        profile: { id: "collaborator-2", full_name: "Nadia Marchenko", job_title: "Designer", avatar_url: null },
      },
      {
        user_id: "collaborator-1",
        profile: { id: "collaborator-1", full_name: "Ira Kovalenko", job_title: "Architect", avatar_url: "https://example.com/ira.png" },
      },
    ]);

    expect(collaborators).toEqual([
      { id: "collaborator-1", full_name: "Ira Kovalenko", job_title: "Architect", avatar_url: "https://example.com/ira.png" },
      { id: "collaborator-2", full_name: "Nadia Marchenko", job_title: "Designer", avatar_url: null },
    ]);
  });
});
