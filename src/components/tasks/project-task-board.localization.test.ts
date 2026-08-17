import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

describe("project task board localization", () => {
  it("provides both temporary column-tint controls in every supported locale", () => {
    expect(en.Tasks.boardHeadersOnly).toBe("Headers only");
    expect(en.Tasks.boardTintColumns).toBe("Tint columns");
    expect(uk.Tasks.boardHeadersOnly).toBe("Тільки заголовки");
    expect(uk.Tasks.boardTintColumns).toBe("Забарвити стовпці");
  });
});
