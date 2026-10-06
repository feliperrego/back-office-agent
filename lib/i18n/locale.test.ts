import { describe, expect, it } from "vitest";
import { PROJECT_SLUG } from "@/lib/project";
import {
  DEFAULT_LOCALE,
  interfaceLanguageLine,
  isLocale,
  LOCALE_STORAGE_KEY,
  LOCALES,
  parseLocaleParam,
  requestLocale,
  resolveLocale,
  type Locale,
} from "./locale";

// A `lang` value: en, pt and pt-br in any case; anything else is ignored.
const ACCEPTED: [string, Locale][] = [
  ["en", "en"],
  ["EN", "en"],
  ["En", "en"],
  ["pt", "pt-BR"],
  ["PT", "pt-BR"],
  ["pt-br", "pt-BR"],
  ["pt-BR", "pt-BR"],
  ["PT-BR", "pt-BR"],
  ["Pt-Br", "pt-BR"],
];

const REJECTED = ["pt-PT", "PT-pt", "en-US", "en-GB", "pt_BR", "ptbr", "english", "fr", "", " pt"];

describe("LOCALES and DEFAULT_LOCALE", () => {
  it("are English and pt-BR, English by default", () => {
    expect(LOCALES).toEqual(["en", "pt-BR"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });
});

describe("LOCALE_STORAGE_KEY", () => {
  // One key per project, so two demos on one origin never share a choice (X-01 design §4.2).
  it("is namespaced by the project slug", () => {
    expect(LOCALE_STORAGE_KEY).toBe(`${PROJECT_SLUG}:locale`);
  });
});

describe("isLocale", () => {
  it.each(LOCALES)("accepts %j", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  // Exact match only, as the chat route reads the body's locale.
  it.each([["pt"], ["pt-br"], ["PT-BR"], ["EN"], ["en-US"], [""], [null], [undefined], [1], [{}]])(
    "rejects %j",
    (value) => {
      expect(isLocale(value)).toBe(false);
    },
  );
});

describe("parseLocaleParam", () => {
  it.each(ACCEPTED)("reads %j as %j", (value, locale) => {
    expect(parseLocaleParam(value)).toBe(locale);
  });

  it.each(REJECTED)("rejects %j", (value) => {
    expect(parseLocaleParam(value)).toBeNull();
  });

  it("returns null for a missing value", () => {
    expect(parseLocaleParam(null)).toBeNull();
  });
});

describe("resolveLocale", () => {
  it("reads lang with or without the leading ?", () => {
    expect(resolveLocale({ search: "?lang=pt-BR", stored: null })).toBe("pt-BR");
    expect(resolveLocale({ search: "lang=pt-BR", stored: null })).toBe("pt-BR");
  });

  it("finds lang among other parameters", () => {
    expect(resolveLocale({ search: "?utm_source=newsletter&lang=pt", stored: null })).toBe("pt-BR");
  });

  it("prefers a valid lang over the stored value", () => {
    expect(resolveLocale({ search: "?lang=en", stored: "pt-BR" })).toBe("en");
    expect(resolveLocale({ search: "?lang=pt-BR", stored: "en" })).toBe("pt-BR");
  });

  it("uses the first lang when it repeats", () => {
    expect(resolveLocale({ search: "?lang=pt-BR&lang=en", stored: null })).toBe("pt-BR");
    expect(resolveLocale({ search: "?lang=en&lang=pt-BR", stored: null })).toBe("en");
    // An invalid first lang is ignored as a whole; the second one is never read.
    expect(resolveLocale({ search: "?lang=fr&lang=en", stored: "pt-BR" })).toBe("pt-BR");
  });

  it.each(ACCEPTED)("accepts lang=%s as %s, over the other stored locale", (value, locale) => {
    const other: Locale = locale === "en" ? "pt-BR" : "en";
    const search = `?lang=${encodeURIComponent(value)}`;
    expect(resolveLocale({ search, stored: other })).toBe(locale);
  });

  it.each(REJECTED)("ignores lang=%j: the stored value, then en", (value) => {
    const search = `?lang=${encodeURIComponent(value)}`;
    expect(resolveLocale({ search, stored: "pt-BR" })).toBe("pt-BR");
    expect(resolveLocale({ search, stored: null })).toBe("en");
  });

  it("uses a valid stored value when there is no lang", () => {
    expect(resolveLocale({ search: "", stored: "pt-BR" })).toBe("pt-BR");
    expect(resolveLocale({ search: "?q=1", stored: "pt-BR" })).toBe("pt-BR");
    expect(resolveLocale({ search: "", stored: "en" })).toBe("en");
  });

  it("reads the stored value with the lang rule", () => {
    expect(resolveLocale({ search: "", stored: "pt" })).toBe("pt-BR");
    expect(resolveLocale({ search: "", stored: "PT-BR" })).toBe("pt-BR");
    expect(resolveLocale({ search: "", stored: "pt-PT" })).toBe("en");
  });

  it("falls back to en", () => {
    expect(resolveLocale({ search: "", stored: null })).toBe("en");
    expect(resolveLocale({ search: "?", stored: "" })).toBe("en");
    expect(resolveLocale({ search: "?lang", stored: "fr" })).toBe("en");
  });
});

describe("requestLocale", () => {
  it.each(LOCALES)("reads locale %j from the body", (locale) => {
    expect(requestLocale({ messages: [], locale })).toBe(locale);
  });

  // Anything else is ignored and never causes a 400, so an older client keeps working.
  it.each([
    ["no locale", { messages: [] }],
    ['locale "fr"', { locale: "fr" }],
    ["locale 42", { locale: 42 }],
    ['locale "pt-br"', { locale: "pt-br" }],
    ['locale "pt"', { locale: "pt" }],
    ["a null body", null],
    ["a string body", "pt-BR"],
    ["an array body", ["pt-BR"]],
  ])("ignores %s", (_, body) => {
    expect(requestLocale(body)).toBeUndefined();
  });
});

describe("interfaceLanguageLine", () => {
  it.each([
    ["en", "Interface language: English."],
    ["pt-BR", "Interface language: Portuguese (Brazil)."],
  ] as const)("names the %s interface in English", (locale, line) => {
    expect(interfaceLanguageLine(locale)).toBe(line);
  });

  it("adds nothing without a locale", () => {
    expect(interfaceLanguageLine(undefined)).toBeNull();
  });

  // Checked again at runtime, so a value that bypassed the type adds nothing.
  it("adds nothing for a value that is not a locale", () => {
    expect(interfaceLanguageLine("pt" as Locale)).toBeNull();
  });
});
