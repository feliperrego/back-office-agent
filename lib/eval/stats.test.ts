// The statistics of the eval's headline (template spec §5.11): the seeded bootstrap over cases,
// its generator and quantile, the median and the whole percent. These tests came with the
// statistics from an earlier project, which resampled answers by their citations; here each case
// is a tally of passed units out of its total.
import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP,
  bootstrapInterval,
  createRandom,
  isScorableTally,
  median,
  quantile,
  WILSON,
  wholePercent,
  wilsonInterval,
} from "./stats";

describe("median", () => {
  it("takes the middle value of an odd count and the mean of the two middle ones otherwise", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("does not reorder its input, and rejects an empty list", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
    expect(() => median([])).toThrow(RangeError);
  });
});

describe("createRandom", () => {
  it("is mulberry32: seed 1 gives the reference implementation's first values", () => {
    const random = createRandom(1);
    expect([random(), random(), random()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
  });

  it("repeats a sequence for a seed, stays in [0, 1), and differs between seeds", () => {
    const a = createRandom(BOOTSTRAP.seed);
    const b = createRandom(BOOTSTRAP.seed);
    const values = Array.from({ length: 10_000 }, () => a());
    expect(Array.from({ length: 10_000 }, () => b())).toEqual(values);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(createRandom(BOOTSTRAP.seed + 1)()).not.toBe(values[0]);
  });
});

describe("quantile", () => {
  it("interpolates linearly between order statistics, as numpy's default percentile does", () => {
    const sorted = [1, 2, 3, 4];
    expect(quantile(sorted, 0)).toBe(1);
    expect(quantile(sorted, 0.25)).toBe(1.75);
    expect(quantile(sorted, 0.5)).toBe(2.5);
    expect(quantile(sorted, 1)).toBe(4);
  });

  it("rejects an empty list and a probability outside [0, 1]", () => {
    expect(() => quantile([], 0.5)).toThrow(RangeError);
    expect(() => quantile([1], 1.01)).toThrow(RangeError);
    expect(() => quantile([1], -0.01)).toThrow(RangeError);
  });
});

describe("bootstrapInterval", () => {
  const options = { resamples: 1000, seed: BOOTSTRAP.seed, level: 0.95 };

  it("resamples whole cases, not units: 10 of 10 and 0 of 10 give 0 to 1", () => {
    // Over units, 10 of 20 would give about 0.28 to 0.72. Resampling the two cases gives only
    // the rates 0, 0.5 and 1, each tail holding about a quarter of the resamples.
    const interval = bootstrapInterval(
      [
        { passed: 10, total: 10 },
        { passed: 0, total: 10 },
      ],
      options,
    );
    expect(interval).toEqual({ low: 0, high: 1 });
  });

  it("gives a point interval when every case has the same rate", () => {
    expect(
      bootstrapInterval(
        [
          { passed: 3, total: 3 },
          { passed: 2, total: 2 },
        ],
        options,
      ),
    ).toEqual({ low: 1, high: 1 });
    expect(bootstrapInterval([{ passed: 0, total: 4 }], options)).toEqual({
      low: 0,
      high: 0,
    });
  });

  it("is close to the normal approximation of the ratio's error on a larger sample", () => {
    // 40 cases of 1 to 5 units, about 70% passed, with the rate varying by case.
    const tallies = Array.from({ length: 40 }, (_, i) => {
      const total = 1 + (i % 5);
      return {
        passed: Math.min(total, Math.round(total * 0.7 + ((i * 7) % 3) - 1)),
        total,
      };
    });
    const passed = tallies.reduce((sum, tally) => sum + tally.passed, 0);
    const total = tallies.reduce((sum, tally) => sum + tally.total, 0);
    const rate = passed / total;
    // The linearised standard error of a ratio estimator over clusters.
    const n = tallies.length;
    const squares = tallies.reduce(
      (sum, tally) => sum + (tally.passed - rate * tally.total) ** 2,
      0,
    );
    const se = Math.sqrt((n / (n - 1)) * squares) / total;

    const { low, high } = bootstrapInterval(tallies, options);

    expect(low).toBeLessThan(rate);
    expect(high).toBeGreaterThan(rate);
    expect(Math.abs(low - (rate - 1.96 * se))).toBeLessThan(0.02);
    expect(Math.abs(high - (rate + 1.96 * se))).toBeLessThan(0.02);
  });

  it("is reproducible: the same seed gives the same interval, and another seed another one", () => {
    const tallies = [
      { passed: 3, total: 4 },
      { passed: 2, total: 2 },
      { passed: 1, total: 3 },
      { passed: 5, total: 5 },
      { passed: 2, total: 3 },
    ];
    const interval = bootstrapInterval(tallies, options);
    expect(bootstrapInterval(tallies, options)).toEqual(interval);
    expect(bootstrapInterval(tallies, { ...options, seed: options.seed + 1 })).not.toEqual(
      interval,
    );
  });

  it("rejects no cases, and a case with no unit to score", () => {
    expect(() => bootstrapInterval([], options)).toThrow(RangeError);
    expect(() => bootstrapInterval([{ passed: 0, total: 0 }], options)).toThrow(RangeError);
  });

  it("rejects a tally that is not whole units with 0 <= passed <= total", () => {
    for (const tally of [
      { passed: 2, total: 1 },
      { passed: -1, total: 1 },
      { passed: 0.5, total: 1 },
    ]) {
      expect(() => bootstrapInterval([tally], options), JSON.stringify(tally)).toThrow(RangeError);
    }
  });
});

describe("isScorableTally", () => {
  it("accepts whole units with 0 <= passed <= total and at least one unit", () => {
    expect(isScorableTally({ passed: 0, total: 1 })).toBe(true);
    expect(isScorableTally({ passed: 3, total: 3 })).toBe(true);
    expect(isScorableTally({ passed: 2, total: 5 })).toBe(true);
  });

  it("refuses no unit, more passed than total, a negative, a fraction and a non-number", () => {
    for (const tally of [
      { passed: 0, total: 0 },
      { passed: 2, total: 1 },
      { passed: -1, total: 1 },
      { passed: 0.5, total: 1 },
      { passed: 1, total: 1.5 },
      { passed: Number.NaN, total: 1 },
      { passed: 1, total: Number.POSITIVE_INFINITY },
    ]) {
      expect(isScorableTally(tally), JSON.stringify(tally)).toBe(false);
    }
  });
});

describe("wilsonInterval", () => {
  it("is the Wilson score interval at 95%: 5 of 10 gives 0.2366 to 0.7634", () => {
    // The reference values of the score interval, z = 1.96 (Wilson 1927; Newcombe 1998, method 3).
    expect(WILSON.level).toBe(0.95);
    const { low, high } = wilsonInterval(0.5, 10);
    expect(low).toBeCloseTo(0.2366, 4);
    expect(high).toBeCloseTo(0.7634, 4);
  });

  it("never collapses to a point where the bootstrap does: every case passed, or none", () => {
    // n of n gives n / (n + z²) to 1, and 0 of n gives 0 to z² / (n + z²).
    const all24 = wilsonInterval(1, 24);
    expect(all24.low).toBeCloseTo(0.862, 3);
    expect(all24.high).toBe(1);
    const one = wilsonInterval(1, 1);
    expect(one.low).toBeCloseTo(0.2065, 4);
    expect(one.high).toBe(1);
    const none10 = wilsonInterval(0, 10);
    expect(none10.low).toBe(0);
    expect(none10.high).toBeCloseTo(0.2775, 4);
    expect(wilsonInterval(0, 24).low).toBe(0);
  });

  it("rejects a share outside [0, 1], and a count of cases that is not a whole number above 0", () => {
    expect(() => wilsonInterval(1.01, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(-0.01, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(Number.NaN, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(0.5, 0)).toThrow(RangeError);
    expect(() => wilsonInterval(0.5, 2.5)).toThrow(RangeError);
  });
});

describe("wholePercent", () => {
  it("rounds a share to a whole percent", () => {
    expect(wholePercent(0.964)).toBe(96);
    expect(wholePercent(0.965)).toBe(97);
    expect(wholePercent(1)).toBe(100);
    expect(wholePercent(0)).toBe(0);
  });

  it("never rounds a share below 1 up to 100, or a share above 0 down to 0", () => {
    expect(wholePercent(0.996)).toBe(99);
    expect(wholePercent(0.004)).toBe(1);
  });
});
