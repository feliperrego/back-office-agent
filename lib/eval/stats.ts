/**
 * The statistics of the eval's headline (template spec §5.11): a seeded percentile bootstrap that
 * resamples whole cases, its generator and quantile, the Wilson score interval for a bootstrap
 * with no spread, the median and the whole percent. Each case is a tally of passed units out of
 * its total: one unit for a case that passes or fails as a whole, several for a case scored unit
 * by unit (fields of a document, bugs in a change), whose units cluster by case. Shell-owned.
 * Pure.
 */

/** The seeded bootstrap of the headline's interval. */
export const BOOTSTRAP = {
  resamples: 1000,
  seed: 20260928,
  level: 0.95,
} as const;

export type Interval = { low: number; high: number };

/** One case's scored units: how many passed, out of how many. */
export type Tally = { passed: number; total: number };

/**
 * A tally the headline can count: whole units, 0 <= passed <= total, and at least one unit. The
 * runner checks each case's tally as soon as it is scored (lib/eval/run.ts), so a bad one stops
 * the run after that case, not after every case is paid for.
 */
export function isScorableTally({ passed, total }: Tally): boolean {
  return (
    Number.isInteger(passed) &&
    Number.isInteger(total) &&
    passed >= 0 &&
    passed <= total &&
    total >= 1
  );
}

/** Median of the values; the mean of the two middle values when their count is even. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median() needs at least one value.");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** mulberry32, a small seeded generator of numbers in [0, 1), so the interval can be re-run. */
export function createRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The p-quantile of sorted values, interpolated between order statistics (numpy's default). */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new RangeError("quantile() needs at least one value.");
  if (!(p >= 0 && p <= 1)) throw new RangeError(`Not a probability: ${p}`);
  const h = (sorted.length - 1) * p;
  const below = Math.floor(h);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below] + (h - below) * (sorted[above] - sorted[below]);
}

/**
 * Percentile bootstrap of passed / total, resampling whole cases with replacement, because a
 * case's units are not independent of each other. A tally the headline cannot count is refused.
 */
export function bootstrapInterval(
  tallies: readonly Tally[],
  { resamples, seed, level }: { resamples: number; seed: number; level: number },
): Interval {
  if (tallies.length === 0) throw new RangeError("The bootstrap needs at least one case.");
  if (!tallies.every(isScorableTally)) {
    throw new RangeError(
      "Every case in the bootstrap needs whole units, 0 <= passed <= total and total >= 1.",
    );
  }
  const random = createRandom(seed);
  const rates: number[] = [];
  for (let i = 0; i < resamples; i++) {
    let passed = 0;
    let total = 0;
    for (let j = 0; j < tallies.length; j++) {
      const tally = tallies[Math.floor(random() * tallies.length)];
      passed += tally.passed;
      total += tally.total;
    }
    rates.push(passed / total);
  }
  rates.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return { low: quantile(rates, tail), high: quantile(rates, 1 - tail) };
}

/** The Wilson score interval's level, and the standard normal quantile it takes, z for 95%. */
export const WILSON = { level: 0.95, z: 1.959963984540054 } as const;

/**
 * The Wilson score interval at 95% of a share observed over n trials. Where every case scored
 * the same, the bootstrap's resamples never vary and its interval is a point, which claims a
 * certainty n cases cannot give; this interval never is one: n of n gives n / (n + z²) to 1, and
 * 0 of n gives 0 to z² / (n + z²). Its bounds at a share of 0 or 1 are exact.
 */
export function wilsonInterval(share: number, n: number): Interval {
  if (!(share >= 0 && share <= 1)) throw new RangeError(`Not a share: ${share}`);
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Not a count of trials: ${n}`);
  const zz = (WILSON.z * WILSON.z) / n;
  const center = (share + zz / 2) / (1 + zz);
  const half = (WILSON.z / (1 + zz)) * Math.sqrt((share * (1 - share)) / n + zz / (4 * n));
  return {
    low: share === 0 ? 0 : center - half,
    high: share === 1 ? 1 : center + half,
  };
}

/**
 * A share as a whole percent. A share below 1 never shows 100, and a share above 0 never shows
 * 0, so a rounded headline never claims that every unit, or none, passed.
 */
export function wholePercent(share: number): number {
  const percent = Math.round(share * 100);
  if (percent === 100 && share < 1) return 99;
  if (percent === 0 && share > 0) return 1;
  return percent;
}
