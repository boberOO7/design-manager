import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

describe("sign-out confirmation labels", () => {
  it("has a close label in both Account locales", () => {
    expect(en.Account.close).toBe("Close");
    expect(uk.Account.close).toBe("Закрити");
  });
});
