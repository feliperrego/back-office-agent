import { describe, expect, it, vi } from "vitest";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { buildInstructions } from "./instructions";

// vi.mock factories are hoisted above the imports, so shared state comes from vi.hoisted.
const cap = vi.hoisted(() => ({ tokens: undefined as number | undefined }));

// Real limits, except MAX_OUTPUT_TOKENS, which one test changes.
vi.mock("@/lib/ai/limits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/limits")>();
  return {
    ...actual,
    get MAX_OUTPUT_TOKENS() {
      return cap.tokens ?? actual.MAX_OUTPUT_TOKENS;
    },
  };
});

// This test's own copies of the rules it pins (X-01 design §4.2), so an edit fails here until
// the new text is reviewed.

/** The default renderer shows the answer as raw text, so the model must never use Markdown. */
const FORMAT =
  "Format: write plain text only. The interface shows your answer exactly as you type it and does not render Markdown. " +
  "Never use Markdown syntax: no # headings, no ** or __ for bold, no * or _ for italics, no - or * bullet markers, " +
  "no tables, no backticks or code fences, and no [text](url) links. Separate paragraphs with one blank line. " +
  'When a list helps, put each item on its own line, starting with its number and a period, like "1. ", followed by plain sentences.';

/** The user's message first, then the interface language, then English. */
const LANGUAGE =
  "Language: answer in the language of the user's latest message. " +
  "If that is unclear, answer in the interface language stated at the end of these instructions, or in English if none is stated.";

const INTERFACE_LINES: Record<Locale, string> = {
  en: "Interface language: English.",
  "pt-BR": "Interface language: Portuguese (Brazil).",
};

/** The instructions' paragraphs, split on the blank lines that separate them. */
function paragraphs(text: string): string[] {
  return text.split("\n\n");
}

describe("buildInstructions", () => {
  it("keeps the plain-text rule: no Markdown", () => {
    expect(paragraphs(buildInstructions({}))).toContain(FORMAT);
  });

  it("keeps the language rule: the user's message, then the interface language", () => {
    expect(paragraphs(buildInstructions({}))).toContain(LANGUAGE);
  });

  it("states a default length of 150 to 250 words", () => {
    expect(buildInstructions({})).toContain("by default, answer in about 150 to 250 words.");
  });

  // The ceiling follows MAX_OUTPUT_TOKENS, so these cases set the cap themselves and hold for any
  // value a project gives it.
  it.each([
    [1024, 700],
    [2048, 1400],
    [512, 350],
  ])("states a ceiling for a %i-token cap of about %i words", (tokens, words) => {
    cap.tokens = tokens;
    try {
      expect(buildInstructions({})).toContain(`up to about ${words} words,`);
    } finally {
      cap.tokens = undefined;
    }
  });

  it.each(LOCALES)("puts the %s interface-language line last, after a blank line", (locale) => {
    const withLine = buildInstructions({ locale });
    expect(withLine).toBe(`${buildInstructions({})}\n\n${INTERFACE_LINES[locale]}`);
    expect(paragraphs(withLine).at(-1)).toBe(INTERFACE_LINES[locale]);
  });

  it("puts the language rule before the interface line it points to", () => {
    const blocks = paragraphs(buildInstructions({ locale: "pt-BR" }));
    expect(blocks.indexOf(LANGUAGE)).toBeGreaterThanOrEqual(0);
    expect(blocks.indexOf(LANGUAGE)).toBeLessThan(blocks.length - 1);
  });

  it("adds no interface line without a locale", () => {
    const text = buildInstructions({});
    expect(text).not.toContain("Interface language:");
    expect(buildInstructions({ locale: undefined })).toBe(text);
  });

  // Values the type rejects but a forged body could carry.
  it.each(["fr", "pt-br", "PT-BR", "en-US", ""])(
    "adds nothing for the invalid locale %j",
    (locale) => {
      expect(buildInstructions({ locale: locale as Locale })).toBe(buildInstructions({}));
    },
  );
});
