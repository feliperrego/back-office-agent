import { describe, expect, it } from "vitest";
import { LOCALES } from "./locale";
import { localized } from "./localized";
import { messages } from "./messages";

// A dictionary text in every interface language (template spec §5.9, §5.12): what a server page
// or layout passes a shell component, which shows it in the locale the client resolves.
describe("localized", () => {
  it("picks the same entry of every locale's dictionary", () => {
    expect(localized((t) => t.footer.source)).toEqual({
      en: messages.en.footer.source,
      "pt-BR": messages["pt-BR"].footer.source,
    });
    expect(Object.keys(localized((t) => t.header.newChat))).toEqual([...LOCALES]);
  });

  // A label a project forgot fails the build that reads it, not a visitor's screen.
  it("refuses an entry missing or empty in any locale", () => {
    const groups: Record<string, Record<string, string>> = {
      en: { lookup: "Lookup" },
      "pt-BR": { lookup: "" },
    };
    expect(() => localized((t) => groups[t === messages.en ? "en" : "pt-BR"].lookup)).toThrow(
      /pt-BR/,
    );
    expect(() => localized(() => undefined)).toThrow(/en/);
  });
});
