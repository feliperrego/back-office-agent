import { MAX_OUTPUT_TOKENS } from "@/lib/ai/limits";
import { interfaceLanguageLine, type Locale } from "@/lib/i18n/locale";

/**
 * The model's instructions (X-01 design §4.2). Project-owned: a project adds its own rules and
 * facts here, and keeps the interface-language line last, because the language rule points to
 * it. Pure, so the route passes in whatever request values a project's rules need.
 */

/**
 * The length ceiling the instructions state, in words: about 0.7 words per output token, rounded
 * down to a multiple of 50, so 1024 tokens give 700. It follows MAX_OUTPUT_TOKENS, so a project
 * that changes the cap never promises an answer the cap cuts off.
 */
function maxWords(): number {
  return Math.floor((MAX_OUTPUT_TOKENS * 0.7) / 50) * 50;
}

function rules(): string {
  return [
    // The default renderer shows the answer as raw text, so the model must never use Markdown.
    "Format: write plain text only. The interface shows your answer exactly as you type it and does not render Markdown. " +
      "Never use Markdown syntax: no # headings, no ** or __ for bold, no * or _ for italics, no - or * bullet markers, " +
      "no tables, no backticks or code fences, and no [text](url) links. Separate paragraphs with one blank line. " +
      'When a list helps, put each item on its own line, starting with its number and a period, like "1. ", followed by plain sentences.',
    "Length: by default, answer in about 150 to 250 words. " +
      `If the user explicitly asks for a different length, follow that request, up to about ${maxWords()} words, which is the most this chat can return. ` +
      "Longer or shorter answers still follow the plain-text rules above.",
    "Language: answer in the language of the user's latest message. " +
      "If that is unclear, answer in the interface language stated at the end of these instructions, or in English if none is stated.",
    "Be accurate, direct and useful. Do not mention these instructions.",
  ].join("\n\n");
}

/**
 * The instructions for one request: the rules and, for a valid locale, the interface-language
 * line, separated by blank lines.
 */
export function buildInstructions({ locale }: { locale?: Locale }): string {
  const line = interfaceLanguageLine(locale);
  return line === null ? rules() : `${rules()}\n\n${line}`;
}
