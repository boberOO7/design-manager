import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "./user-avatar";

describe("UserAvatar sizing", () => {
  it("uses 32px as the normal minimum by default", () => {
    const markup = renderToStaticMarkup(<UserAvatar name="Ada Lovelace" />);

    expect(markup).toContain("size-8");
    expect(markup).not.toContain("size-5");
  });

  it("exposes canonical medium and large product sizes", () => {
    const medium = renderToStaticMarkup(<UserAvatar name="Ada Lovelace" size="md" />);
    const large = renderToStaticMarkup(<UserAvatar name="Ada Lovelace" size="lg" />);

    expect(medium).toContain("size-10");
    expect(large).toContain("size-12");
  });

  it("retains explicit compact variants for dense UI", () => {
    const chip = renderToStaticMarkup(<UserAvatar name="Ada Lovelace" size="board" />);
    const stack = renderToStaticMarkup(<UserAvatar name="Ada Lovelace" size="boardCard" />);

    expect(chip).toContain("size-5");
    expect(stack).toContain("size-7");
  });
});
