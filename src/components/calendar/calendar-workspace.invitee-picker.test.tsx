import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CalendarPerson } from "@/types/calendar";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@radix-ui/react-popover", () => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/user-avatar", () => ({
  UserAvatar: ({ name }: { name: string }) => <span data-avatar>{name.slice(0, 1)}</span>,
}));

import { InviteePicker } from "./calendar-workspace";

describe("InviteePicker DOM contract", () => {
  const people: CalendarPerson[] = [
    { id: "biba", full_name: "Biba Maslou", job_title: "Designer", avatar_url: null, projectIds: [] },
    { id: "other", full_name: "Other Person", job_title: "Architect", avatar_url: null, projectIds: [] },
  ];

  it("renders one bounded pill button per selected invitee and a presentation-only wrapper", () => {
    const markup = renderToStaticMarkup(<InviteePicker people={people} selectedIds={["biba"]} onChange={() => undefined} />);

    const chip = markup.match(/<button[^>]*data-invitee-chip="true"[^>]*>.*?<\/button>/)?.[0];

    expect(markup).toContain('<div class="flex flex-wrap gap-2" data-invitee-chips="true">');
    expect(chip).toContain('inline-flex min-h-8 max-w-full');
    expect(chip).toContain("Biba Maslou");
    expect(chip).toContain("<svg");
    expect(chip?.slice(chip.indexOf(">") + 1)).not.toContain("<button");
  });

  it("assigns the visible focus treatment to the search shell, not the raw input", () => {
    const markup = renderToStaticMarkup(<InviteePicker people={people} selectedIds={[]} onChange={() => undefined} />);

    expect(markup).toContain('data-invitee-search="true"');
    expect(markup).toContain('focus-within:ring-2');
    expect(markup).toMatch(/<input[^>]*focus-visible:outline-none[^>]*focus-visible:ring-0[^>]*>/);
  });

  it("keeps the popover ownership on the visible trigger button", () => {
    const markup = renderToStaticMarkup(<InviteePicker people={people} selectedIds={[]} onChange={() => undefined} />);

    const trigger = markup.match(/<button[^>]*data-invitee-trigger="true"[^>]*>/)?.[0];

    expect(trigger).toContain("inline-flex");
    expect(trigger).not.toContain("w-full");
  });
});
