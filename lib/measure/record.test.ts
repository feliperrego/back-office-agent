import { describe, expect, it } from "vitest";
import { assertSafeToWrite, measurementDay, measurementPath } from "./record";

describe("measurementDay", () => {
  it("is the UTC day of the ISO timestamp", () => {
    expect(measurementDay("2026-10-02T23:59:59.999Z")).toBe("2026-10-02");
    expect(measurementDay("2026-10-02T00:00:00Z")).toBe("2026-10-02");
  });

  it("rejects a value that is not a UTC ISO timestamp", () => {
    expect(() => measurementDay("02/10/2026")).toThrow(RangeError);
    expect(() => measurementDay("2026-10-02")).toThrow(RangeError);
    // Slicing an offset timestamp would give the local day, not the UTC one.
    expect(() => measurementDay("2026-10-02T21:00:00-03:00")).toThrow(RangeError);
  });
});

describe("measurementPath", () => {
  it("names a good run's file after the metric and the UTC day", () => {
    expect(measurementPath("ttft", { date: "2026-10-02T00:00:00.000Z", aborted: false })).toBe(
      "measurements/ttft-2026-10-02.json",
    );
    expect(
      measurementPath("citation-rate", { date: "2026-10-02T14:03:59.123Z", aborted: false }),
    ).toBe("measurements/citation-rate-2026-10-02.json");
  });

  it("names an aborted run's file with its start time, so aborted runs never collide", () => {
    expect(measurementPath("ttft", { date: "2026-10-02T00:00:00.000Z", aborted: true })).toBe(
      "measurements/ttft-2026-10-02-000000.aborted.json",
    );
    expect(measurementPath("ttft", { date: "2026-10-02T14:03:59.123Z", aborted: true })).toBe(
      "measurements/ttft-2026-10-02-140359.aborted.json",
    );
  });

  it("gives each run of a several-run metric its own file (template spec §7.5)", () => {
    const run = { date: "2026-10-02T14:03:59.123Z", aborted: false };
    expect(measurementPath("citations-run-1", run)).toBe(
      "measurements/citations-run-1-2026-10-02.json",
    );
    expect(measurementPath("citations-run-2", run)).toBe(
      "measurements/citations-run-2-2026-10-02.json",
    );
    expect(measurementPath("citations", run)).toBe("measurements/citations-2026-10-02.json");
  });

  it("rejects a metric that is not lower-case kebab-case", () => {
    const run = { date: "2026-10-02T00:00:00.000Z", aborted: false };
    for (const metric of ["", "TTFT", "ttft_ms", "../ttft", "ttft/2", "-ttft", "ttft-"]) {
      expect(() => measurementPath(metric, run), metric).toThrow(RangeError);
    }
  });
});

describe("assertSafeToWrite", () => {
  it("allows a good run when no file exists yet for that day", () => {
    expect(() =>
      assertSafeToWrite("measurements/ttft-2026-10-02.json", false, false),
    ).not.toThrow();
  });

  it("refuses a good run that would overwrite an existing good file", () => {
    expect(() => assertSafeToWrite("measurements/ttft-2026-10-02.json", false, true)).toThrow(
      /measurements\/ttft-2026-10-02\.json already exists[\s\S]*[Rr]ename or delete/,
    );
  });

  it("always allows an aborted run, even when its file already exists", () => {
    expect(() =>
      assertSafeToWrite("measurements/ttft-2026-10-02-000000.aborted.json", true, true),
    ).not.toThrow();
  });
});
