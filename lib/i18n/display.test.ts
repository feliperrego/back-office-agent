import { describe, expect, it } from "vitest";
import { formatDateTime, formatDay, formatNumber, formatSeconds } from "./display";

// How the screens write numbers and days in each interface language (template spec §5.9).
describe("display formats", () => {
  it("write counts with the locale's separators", () => {
    expect(formatNumber(12345, "en")).toBe("12,345");
    expect(formatNumber(12345, "pt-BR")).toBe("12.345");
    expect(formatNumber(0, "en")).toBe("0");
  });

  it("round to the given decimals, and keep them", () => {
    expect(formatNumber(0.36788, "en", 3)).toBe("0.368");
    expect(formatNumber(0.36788, "pt-BR", 3)).toBe("0,368");
    expect(formatNumber(2, "en", 1)).toBe("2.0");
    expect(formatNumber(2.6, "en")).toBe("3");
  });

  it("write milliseconds as seconds with one decimal", () => {
    expect(formatSeconds(2841, "en")).toBe("2.8");
    expect(formatSeconds(2841, "pt-BR")).toBe("2,8");
    expect(formatSeconds(42, "en")).toBe("0.0");
    expect(formatSeconds(12_345, "en")).toBe("12.3");
  });

  // A run's day and a case set's frozen day (template spec §5.12): the UTC day, whatever the
  // visitor's zone, so the page says the day the file names.
  it("write an instant's UTC day", () => {
    expect(formatDay("2026-10-05T23:04:55.281Z", "en")).toBe("Oct 5, 2026");
    expect(formatDay("2026-10-05T23:04:55.281Z", "pt-BR")).toBe("5 de out. de 2026");
    expect(formatDay("2026-10-01T00:00:00.000Z", "en")).toBe("Oct 1, 2026");
  });

  // When a recorded case was asked (template spec §5.9): the UTC day and time with the zone
  // named, so two visitors in different zones read the same instant the same way.
  it("write an instant's UTC day and time, naming the zone", () => {
    expect(formatDateTime("2026-10-05T23:04:55.281Z", "en")).toBe("Oct 5, 2026, 11:04:55 PM UTC");
    expect(formatDateTime("2026-10-05T23:04:55.281Z", "pt-BR")).toBe(
      "5 de out. de 2026, 23:04:55 UTC",
    );
    expect(formatDateTime("2026-10-01T00:00:00.000Z", "en")).toBe("Oct 1, 2026, 12:00:00 AM UTC");
  });
});
