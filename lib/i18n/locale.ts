import { PROJECT_SLUG } from "@/lib/project";

/**
 * The interface language (X-01 design §2, §4.2). Pure and client-safe, so client components,
 * chat routes and scripts can all import it.
 */

/** The interface languages, English first. */
export const LOCALES = ["en", "pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Holds a choice made with the language switch; a `?lang=` value alone is never stored. One key
 * per project, so two demos served from one origin never share a choice.
 */
export const LOCALE_STORAGE_KEY = `${PROJECT_SLUG}:locale`;

/** Exact match only, for the `locale` field of a request body. */
export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/** Reads a `lang` value: en, pt and pt-br in any case; anything else is null. */
export function parseLocaleParam(value: string | null): Locale | null {
  switch (value?.toLowerCase()) {
    case "en":
      return "en";
    case "pt":
    case "pt-br":
      return "pt-BR";
    default:
      return null;
  }
}

/**
 * The locale to show on load: a valid `lang` parameter, then a valid stored value, then
 * English. `search` is location.search, with or without its leading "?"; only the first `lang`
 * parameter is read. The stored value is read with the same rule as the parameter.
 */
export function resolveLocale({
  search,
  stored,
}: {
  search: string;
  stored: string | null;
}): Locale {
  return (
    parseLocaleParam(new URLSearchParams(search).get("lang")) ??
    parseLocaleParam(stored) ??
    DEFAULT_LOCALE
  );
}

/**
 * The interface language a client may send in a request body: exactly "en" or "pt-BR". Any
 * other value, or none, is ignored and never causes a 400, so an older client keeps working.
 */
export function requestLocale(body: unknown): Locale | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { locale } = body as { locale?: unknown };
  return isLocale(locale) ? locale : undefined;
}

/** Tells the model which language the visitor reads the interface in. */
const INTERFACE_LANGUAGE: Record<Locale, string> = {
  en: "Interface language: English.",
  "pt-BR": "Interface language: Portuguese (Brazil).",
};

/**
 * The last line of a chat's instructions, which the "answer in the language of the user's
 * message; when unclear, the interface language" rule falls back to (X-01 design §4.2). Null
 * without a locale.
 */
export function interfaceLanguageLine(locale: Locale | undefined): string | null {
  // Checked again at runtime, so a value that bypassed the type adds nothing.
  return isLocale(locale) ? INTERFACE_LANGUAGE[locale] : null;
}
