import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/react-popover", () => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { PeoplePicker } from "./people-picker";

const props = {
  people: [{ id: "biba", name: "Biba Maslou", avatarUrl: null }, { id: "other", name: "Other Person", avatarUrl: null }],
  onChange: () => undefined,
  label: "Participants", placeholder: "Select participants", searchPlaceholder: "Search people", emptyMessage: "No people",
  removeLabel: (name: string) => `Remove ${name}`,
};

describe("PeoplePicker accessibility", () => {
  it("keeps chip removal buttons separate from the labelled picker trigger", () => {
    const markup = renderToStaticMarkup(<PeoplePicker {...props} selectedIds={["biba"]} />);
    const chip = markup.match(/<button[^>]*data-people-chip="true"[^>]*>.*?<\/button>/)?.[0];
    expect(markup).toMatch(/<button[^>]*aria-label="Participants"[^>]*data-people-trigger="true"[^>]*><\/button>/);
    expect(chip).toContain('aria-label="Remove Biba Maslou"');
    expect(chip?.slice(chip.indexOf(">") + 1)).not.toContain("<button");
    expect(markup).not.toContain('aria-label="Remove Other Person"');
    expect(markup).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
  });

  it("provides a labelled search input with focus owned by its shell", () => {
    const markup = renderToStaticMarkup(<PeoplePicker {...props} selectedIds={[]} />);
    expect(markup).toContain('aria-label="Search people"');
    expect(markup).toContain("focus-within:border-[var(--ui-focus)]");
    expect(markup).not.toContain("focus-within:ring-");
    expect(markup).toMatch(/<input[^>]*focus-visible:outline-none[^>]*focus-visible:ring-0[^>]*>/);
  });

  it("disables the trigger and selected chip removals when the caller disables selection", () => {
    const markup = renderToStaticMarkup(<PeoplePicker {...props} selectedIds={["biba"]} disabled />);
    const buttons = markup.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true);
  });

  it("summarizes extra selections while keeping every person available in the dropdown", () => {
    const people = [...props.people, { id: "third", name: "Third Person" }, { id: "fourth", name: "Fourth Person" }];
    const markup = renderToStaticMarkup(<PeoplePicker {...props} people={people} selectedIds={people.map((person) => person.id)} />);
    expect(markup.match(/data-people-chip="true"/g)).toHaveLength(2);
    expect(markup).toMatch(/data-people-overflow="true">\+2<\/span>/);
    expect(markup).not.toContain('aria-label="Remove Third Person"');
    expect(markup.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(4);
    expect(markup).toContain("Third Person");
    expect(markup).toContain("Fourth Person");
  });
});
