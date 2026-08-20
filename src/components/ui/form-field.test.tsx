import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormField } from "./form-field";

describe("FormField", () => {
  it("can render a non-label group for composite interactive controls", () => {
    const markup = renderToStaticMarkup(<FormField as="div" label="Invitees"><button type="button">Add invitees</button></FormField>);

    expect(markup).toMatch(/^<div[^>]*><span>Invitees<\/span><button/);
    expect(markup).not.toContain("<label");
  });
});
