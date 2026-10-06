import { describe, expect, it } from "vitest";
import { formatStoreDay, formatUsd } from "./display";

// How the screens write the store's dollars and dates in the interface language (template spec
// §5.9; P2's spec §4.6): the store keeps US dollars and "September 22, 2026"; a screen shows them
// as each language writes them.

describe("formatUsd", () => {
  it("writes US dollars as each language does", () => {
    expect(formatUsd(149, "en")).toBe("$149.00");
    expect(formatUsd(149, "pt-BR")).toBe("US$ 149,00");
    expect(formatUsd(1234.5, "en")).toBe("$1,234.50");
    expect(formatUsd(1234.5, "pt-BR")).toBe("US$ 1.234,50");
  });
});

describe("formatStoreDay", () => {
  it("writes a store date as each language does, whatever the visitor's zone", () => {
    expect(formatStoreDay("September 22, 2026", "en")).toBe("Sep 22, 2026");
    expect(formatStoreDay("September 22, 2026", "pt-BR")).toBe("22 de set. de 2026");
    expect(formatStoreDay("October 1, 2026", "pt-BR")).toBe("1 de out. de 2026");
  });

  it("refuses text that is not a store date", () => {
    expect(() => formatStoreDay("2026-09-22", "en")).toThrow(RangeError);
  });
});
