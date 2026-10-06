import type { Locale } from "./locale";

/**
 * How the screens write numbers and days in the interface language (template spec §5.9). Data
 * keeps its own form; only what a screen shows is formatted here. Pure and client-safe.
 */

const DAY: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
};

/**
 * An ISO 8601 instant's UTC day, such as "Oct 5, 2026" or "5 de out. de 2026": the day a run's
 * file names, whatever the visitor's zone (template spec §5.12).
 */
export function formatDay(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, DAY).format(new Date(iso));
}

/**
 * An ISO 8601 instant as its UTC day and time, with the zone named, such as
 * "Oct 5, 2026, 11:04:55 PM UTC": when a recorded case was asked, the same for every visitor.
 */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    ...DAY,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** A number with the locale's separators, rounded to `digits` decimals. */
export function formatNumber(value: number, locale: Locale, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Milliseconds as seconds with one decimal. */
export function formatSeconds(ms: number, locale: Locale): string {
  return formatNumber(ms / 1000, locale, 1);
}
