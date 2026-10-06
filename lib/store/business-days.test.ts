import { describe, expect, it } from "vitest";
import {
  BUSINESS_DAYS_FROM,
  BUSINESS_DAYS_TO,
  US_FEDERAL_HOLIDAYS,
  businessDaysAfter,
  isBusinessDay,
} from "./business-days";
import { formatStoreDate, parseStoreDate } from "./dates";

const DAY_MS = 86_400_000;

/** The `n`th given weekday (0 Sunday) of a month of 2026, or the last one when `n` is -1. */
function weekdayOf(month: number, weekday: number, n: number): string {
  const days: Date[] = [];
  for (let day = new Date(Date.UTC(2026, month, 1)); day.getUTCMonth() === month;) {
    if (day.getUTCDay() === weekday) days.push(day);
    day = new Date(day.getTime() + DAY_MS);
  }
  return formatStoreDate(n === -1 ? days[days.length - 1] : days[n - 1]);
}

/** A fixed-date holiday, moved to the Friday before or the Monday after a weekend. */
function observed(month: number, day: number): string {
  const date = new Date(Date.UTC(2026, month, day));
  const shift = { 0: 1, 6: -1 }[date.getUTCDay()] ?? 0;
  return formatStoreDate(new Date(date.getTime() + shift * DAY_MS));
}

describe("US_FEDERAL_HOLIDAYS (shipping-options.md: business days skip them)", () => {
  it("lists the eleven holidays of 2026 by the federal rules, as observed", () => {
    expect(US_FEDERAL_HOLIDAYS).toEqual({
      "New Year's Day": observed(0, 1),
      "Martin Luther King Jr. Day": weekdayOf(0, 1, 3),
      "Washington's Birthday": weekdayOf(1, 1, 3),
      "Memorial Day": weekdayOf(4, 1, -1),
      "Juneteenth National Independence Day": observed(5, 19),
      "Independence Day": observed(6, 4),
      "Labor Day": weekdayOf(8, 1, 1),
      "Columbus Day": weekdayOf(9, 1, 2),
      "Veterans Day": observed(10, 11),
      "Thanksgiving Day": weekdayOf(10, 4, 4),
      "Christmas Day": observed(11, 25),
    });
  });

  it("keeps the days P1's store relied on: Labor Day and Columbus Day", () => {
    expect(US_FEDERAL_HOLIDAYS["Labor Day"]).toBe("September 7, 2026");
    expect(US_FEDERAL_HOLIDAYS["Columbus Day"]).toBe("October 12, 2026");
  });

  it("moves July 4, a Saturday in 2026, to Friday, July 3", () => {
    expect(US_FEDERAL_HOLIDAYS["Independence Day"]).toBe("July 3, 2026");
  });

  it("covers exactly the year 2026", () => {
    expect([BUSINESS_DAYS_FROM, BUSINESS_DAYS_TO]).toEqual([
      "January 1, 2026",
      "December 31, 2026",
    ]);
  });
});

describe("isBusinessDay", () => {
  it("is Monday to Friday except a holiday", () => {
    expect(isBusinessDay("October 1, 2026")).toBe(true); // Thursday
    expect(isBusinessDay("October 3, 2026")).toBe(false); // Saturday
    expect(isBusinessDay("October 4, 2026")).toBe(false); // Sunday
    expect(isBusinessDay("October 12, 2026")).toBe(false); // Columbus Day
    expect(isBusinessDay("July 3, 2026")).toBe(false); // Independence Day, observed
  });

  it("refuses a day outside the year the holiday list covers", () => {
    expect(() => isBusinessDay("December 31, 2025")).toThrow(RangeError);
    expect(() => isBusinessDay("January 1, 2027")).toThrow(RangeError);
  });
});

describe("businessDaysAfter", () => {
  it("counts from the day after `from` up to and including `to`", () => {
    expect(businessDaysAfter("October 1, 2026", "October 2, 2026")).toBe(1);
    expect(businessDaysAfter("September 28, 2026", "October 2, 2026")).toBe(4);
  });

  it("skips weekends and holidays", () => {
    expect(businessDaysAfter("October 2, 2026", "October 5, 2026")).toBe(1); // over a weekend
    expect(businessDaysAfter("October 9, 2026", "October 13, 2026")).toBe(1); // Columbus Day
    expect(businessDaysAfter("September 4, 2026", "September 8, 2026")).toBe(1); // Labor Day
    expect(businessDaysAfter("November 25, 2026", "November 30, 2026")).toBe(2); // Thanksgiving
  });

  it("gives 0 when `to` is not after `from`", () => {
    expect(businessDaysAfter("October 1, 2026", "October 1, 2026")).toBe(0);
    expect(businessDaysAfter("October 2, 2026", "October 1, 2026")).toBe(0);
    expect(businessDaysAfter("October 2, 2026", "October 4, 2026")).toBe(0);
  });

  it("counts the late threshold: AO-10547, due October 7, is late from October 13", () => {
    // late-or-missing-packages.md: "more than 2 business days past its estimated delivery date".
    expect(businessDaysAfter("October 7, 2026", "October 12, 2026")).toBe(2);
    expect(businessDaysAfter("October 7, 2026", "October 13, 2026")).toBe(3);
  });

  it("refuses a date outside the covered year, and text that is not a store date", () => {
    expect(() => businessDaysAfter("December 30, 2025", "January 2, 2026")).toThrow(RangeError);
    expect(() => businessDaysAfter("December 30, 2026", "January 4, 2027")).toThrow(RangeError);
    expect(() => businessDaysAfter("2026-10-01", "October 2, 2026")).toThrow(RangeError);
  });

  it("agrees with a day-by-day count over the whole year", () => {
    let count = 0;
    const [from, to] = [BUSINESS_DAYS_FROM, BUSINESS_DAYS_TO].map((d) =>
      parseStoreDate(d).getTime(),
    );
    for (let day = from + DAY_MS; day <= to; day += DAY_MS) {
      if (isBusinessDay(formatStoreDate(new Date(day)))) count++;
    }
    expect(businessDaysAfter(BUSINESS_DAYS_FROM, BUSINESS_DAYS_TO)).toBe(count);
    // 2026 has 261 weekdays; January 1 is not counted, and the other ten holidays fall on one.
    expect(count).toBe(261 - 1 - 10);
  });
});
