import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";

function messageEntries(value: unknown, path = "", entries = new Map<string, string>()) {
  if (typeof value === "string") entries.set(path,value);
  else if (value && typeof value === "object") for (const [key,child] of Object.entries(value)) {
    messageEntries(child,path ? `${path}.${key}` : key,entries);
  }
  return entries;
}

function argumentsOf(message: string) {
  return [...new Set([...message.matchAll(/\{\s*([a-zA-Z_][\w]*)\s*[,}]/g)].map(match => match[1]))].sort();
}

describe("message catalogs", () => {
  it("keeps every nested message key and interpolation argument aligned between locales", () => {
    const english = messageEntries(en), ukrainian = messageEntries(uk);
    expect([...english.keys()].sort()).toEqual([...ukrainian.keys()].sort());
    for (const [key,message] of english) expect(argumentsOf(ukrainian.get(key) ?? ""),key).toEqual(argumentsOf(message));
  });

  for (const [locale,messages] of [["en",en],["uk",uk]] as const) {
    it(`resolves task and finance controls without missing-message fallbacks in ${locale}`, () => {
      const translate = createTranslator({ locale,messages,onError: error => { throw error; } });
      for (const key of ["Common.close","Finance.forecast.scenarios.chooseCurrency","Finance.forecast.scenarios.cashIncomplete","Finance.labor.allocationTotalUnknown","Finance.saved","Tasks.correctionCreated","Tasks.correctionHistoryClosed","Tasks.correctionClientReview"] as const) {
        expect(translate.has(key),key).toBe(true);
        expect(translate(key)).not.toBe(key);
      }
      expect(translate("Tasks.correctionsHistory",{ count: 3 })).toContain("3");
      expect(translate("Common.close")).toBe(locale === "uk" ? "Закрити" : "Close");
    });
  }
});
