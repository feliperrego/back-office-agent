import { describe, expect, it } from "vitest";
import { formatStoreDate, parseStoreDate } from "./dates";

describe("store dates", () => {
  it("reads a date as a customer writes it, at UTC midnight", () => {
    expect(parseStoreDate("September 22, 2026").toISOString()).toBe("2026-09-22T00:00:00.000Z");
    expect(parseStoreDate("August 3, 2026").toISOString()).toBe("2026-08-03T00:00:00.000Z");
  });

  it("writes it back the same way", () => {
    expect(formatStoreDate(new Date(Date.UTC(2026, 9, 2)))).toBe("October 2, 2026");
    expect(formatStoreDate(parseStoreDate("December 31, 2026"))).toBe("December 31, 2026");
  });

  it("rejects other formats and days a month does not have", () => {
    for (const text of ["2026-09-22", "Sept 22, 2026", "September 22 2026", "September 05, 2026"]) {
      expect(() => parseStoreDate(text), text).toThrow(RangeError);
    }
    expect(() => parseStoreDate("September 31, 2026")).toThrow(RangeError);
    expect(() => parseStoreDate("February 29, 2026")).toThrow(RangeError);
  });
});
