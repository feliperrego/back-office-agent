import { formatDay } from "@/lib/i18n/display";
import type { Locale } from "@/lib/i18n/locale";
import { parseStoreDate } from "./dates";

/**
 * How the screens write the store's values in the interface language (template spec §5.9; P2's
 * spec §4.6): the store keeps US dollars and dates written "September 22, 2026" (lib/store/dates.ts),
 * and a screen shows them as the visitor's language writes them. Pure and client-safe.
 */

/** US dollars, such as "$149.00" or "US$ 149,00". */
export function formatUsd(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(amount);
}

/** A store date, such as "Sep 22, 2026" or "22 de set. de 2026"; throws on any other text. */
export function formatStoreDay(storeDate: string, locale: Locale): string {
  return formatDay(parseStoreDate(storeDate).toISOString(), locale);
}
