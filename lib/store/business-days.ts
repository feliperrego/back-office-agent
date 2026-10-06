import { parseStoreDate } from "./dates";

/**
 * Business days as the help center counts them: Monday to Friday except US federal holidays
 * (shipping-options.md). The agent's facts (late from, day N of a window) are computed here, never
 * by the model (spec §4.1). Moved from P1's tests/customers.test.ts, where the list held only the
 * two holidays of P1's months, into lib with the whole year (P2-25). Pure and client-safe.
 */

/** The year the holiday list covers; the functions below refuse any other day. */
export const BUSINESS_DAYS_FROM = "January 1, 2026";
export const BUSINESS_DAYS_TO = "December 31, 2026";

/**
 * The US federal holidays of 2026, on the day they are observed: a holiday on a Saturday moves to
 * the Friday before, one on a Sunday to the Monday after (business-days.test.ts checks each rule).
 */
export const US_FEDERAL_HOLIDAYS: Readonly<Record<string, string>> = {
  "New Year's Day": "January 1, 2026",
  "Martin Luther King Jr. Day": "January 19, 2026",
  "Washington's Birthday": "February 16, 2026",
  "Memorial Day": "May 25, 2026",
  "Juneteenth National Independence Day": "June 19, 2026",
  "Independence Day": "July 3, 2026",
  "Labor Day": "September 7, 2026",
  "Columbus Day": "October 12, 2026",
  "Veterans Day": "November 11, 2026",
  "Thanksgiving Day": "November 26, 2026",
  "Christmas Day": "December 25, 2026",
};

const DAY_MS = 86_400_000;
const FIRST = parseStoreDate(BUSINESS_DAYS_FROM).getTime();
const LAST = parseStoreDate(BUSINESS_DAYS_TO).getTime();
const HOLIDAYS = new Set(
  Object.values(US_FEDERAL_HOLIDAYS).map((day) => parseStoreDate(day).getTime()),
);

/** A store date's UTC midnight; throws a RangeError outside the covered year. */
function covered(date: string): number {
  const time = parseStoreDate(date).getTime();
  if (time < FIRST || time > LAST) {
    throw new RangeError(`${date} is outside ${BUSINESS_DAYS_FROM}–${BUSINESS_DAYS_TO}`);
  }
  return time;
}

function isBusinessTime(time: number): boolean {
  const weekday = new Date(time).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !HOLIDAYS.has(time);
}

/** Whether a store date is a business day. */
export function isBusinessDay(date: string): boolean {
  return isBusinessTime(covered(date));
}

/** The business days after `from`, up to and including `to`; 0 when `to` is not after `from`. */
export function businessDaysAfter(from: string, to: string): number {
  const last = covered(to);
  let count = 0;
  for (let day = covered(from) + DAY_MS; day <= last; day += DAY_MS) {
    if (isBusinessTime(day)) count++;
  }
  return count;
}
