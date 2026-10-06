import { LOCALES, type Locale } from "./locale";
import { messages, type Messages } from "./messages";

/**
 * A dictionary text in every interface language (template spec §5.9, §5.12). A server page or
 * layout cannot know the locale, which the client resolves, nor pass a client component a
 * function such as `(t) => t.nav.home`; so it passes the text of every locale, and the component
 * shows `text[locale]`. Shell-owned. Pure and client-safe.
 */
export type Localized = Record<Locale, string>;

/**
 * The entry `pick` reads, in every locale's dictionary. A missing or empty entry throws, so a
 * label a project forgot fails the build that reads it instead of showing a blank.
 */
export function localized(pick: (t: Messages) => string | undefined): Localized {
  const entries = LOCALES.map((locale): [Locale, string] => {
    const text = pick(messages[locale]);
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error(`No ${locale} text in the dictionary for ${pick.toString()}.`);
    }
    return [locale, text];
  });
  return Object.fromEntries(entries) as Localized;
}
