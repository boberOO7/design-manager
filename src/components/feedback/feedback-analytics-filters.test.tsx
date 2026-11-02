import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import uk from "../../../messages/uk.json";
import { Button } from "@/components/ui/button";
import { FeedbackAnalyticsFilters } from "./feedback-analytics-filters";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("next-intl", async importOriginal => ({
  ...await importOriginal<typeof import("next-intl")>(),
  useLocale: () => "uk",
  useTranslations: () => createTranslator({ locale: "uk", messages: uk, namespace: "Feedback" }),
}));
vi.mock("react", async importOriginal => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useState: vi.fn(original.useState) };
});

const props = {
  initialFilters: { from: "", to: "", project: "" },
  invalidFilters: false,
  period: "12" as const,
  projects: [{ id: "project-one", name: "Перший проєкт" }, { id: "project-two", name: "Другий проєкт" }],
};

beforeEach(() => { navigation.replace.mockClear(); });

it.each([
  ["", uk.Feedback.allProjects],
  ["project-two", "Другий проєкт"],
])("displays the selected label and registers project values for %s", (value, label) => {
  const html = renderToStaticMarkup(<FeedbackAnalyticsFilters {...props} initialFilters={{ ...props.initialFilters, project: value }} />);
  expect(html).toMatch(new RegExp(`data-select-label="true"[^>]*>${label}</span>`));
  expect(html).toContain('name="project"');
  for (const project of props.projects) {
    expect(html).toContain(`<option value="${project.id}"${value === project.id ? ' selected=""' : ""}>${project.name}</option>`);
  }
});

it("hides reset for empty filters and shows it for each applied filter or invalid query", () => {
  expect(renderToStaticMarkup(<FeedbackAnalyticsFilters {...props} />)).not.toContain(uk.Feedback.resetFilters);
  for (const initialFilters of [{ from: "2026-11-01", to: "", project: "" }, { from: "", to: "2026-11-02", project: "" }, { from: "", to: "", project: "project-one" }]) {
    expect(renderToStaticMarkup(<FeedbackAnalyticsFilters {...props} initialFilters={initialFilters} />)).toContain(uk.Feedback.resetFilters);
  }
  expect(renderToStaticMarkup(<FeedbackAnalyticsFilters {...props} invalidFilters />)).toContain(uk.Feedback.resetFilters);
});

type ControlProps = { children?: ReactNode; name?: string; value?: string; onValueChange?: (value: string) => void; onClick?: () => void };
function findControl(node: ReactNode, matches: (element: ReactElement<ControlProps>) => boolean): ControlProps | undefined {
  if (!isValidElement<ControlProps>(node)) return undefined;
  if (matches(node)) return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const found = findControl(child, matches);
    if (found) return found;
  }
}

it.each([false, true])("clears draft fields and only navigates when filters were applied: %s", applied => {
  const initialFilters = applied ? { from: "2026-11-01", to: "2026-11-02", project: "project-one" } : props.initialFilters;
  const draft = { from: "2026-10-01", to: "2026-10-31", project: "project-two" };
  const setFilters = vi.fn();
  function render(current = draft) {
    vi.mocked(useState).mockReturnValueOnce([current, setFilters]);
    return FeedbackAnalyticsFilters({ ...props, initialFilters });
  }
  const reset = findControl(render(), element => element.type === Button && Boolean(element.props.onClick));
  expect(reset?.onClick).toBeTypeOf("function");
  reset?.onClick?.();
  expect(setFilters).toHaveBeenCalledWith(props.initialFilters);
  if (applied) expect(navigation.replace).toHaveBeenCalledWith("/statistics?period=12&section=feedback", { scroll: false });
  else {
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(findControl(render(props.initialFilters), element => element.type === Button && Boolean(element.props.onClick))).toBeUndefined();
  }
});
