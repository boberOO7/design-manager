import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import Loading from "@/app/(app)/projects/[projectId]/loading";

describe("project opening fallback", () => {
  for (const [locale, messages] of [["uk", uk], ["en", en]] as const) {
    it(`renders the full opening structure with real ${locale} messages`, () => {
      const html = renderToStaticMarkup(<NextIntlClientProvider
        locale={locale} timeZone="Europe/Kyiv"
        messages={{ Common: messages.Common, Workspace: messages.Workspace, Projects: messages.Projects }}
        onError={error => { throw error; }}
      ><Loading/></NextIntlClientProvider>);

      expect(html).toContain(`>${messages.Workspace.backToProjects}</span>`);
      expect(html).toContain('href="/projects"');
      expect(html).toContain('data-project-loading="context"');
      expect(html).toContain('data-project-loading="details"');
      expect(html).not.toContain("ProjectWorkspace.backToProjects");
    });
  }
});
