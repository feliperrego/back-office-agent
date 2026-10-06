import type { CaseRecord, EvalSummary, GroupTally, HeadlineNumbers, RunInterval } from "./record";
import {
  BOOTSTRAP,
  bootstrapInterval,
  median,
  type Tally,
  WILSON,
  wholePercent,
  wilsonInterval,
} from "./stats";

/**
 * The run's summary (template spec §5.11): the headline, the share of scored units that passed
 * with its 95% interval over cases, and its supporting data, never a second headline. The README
 * lines (lib/eval/readme.ts) and the Evals page read it, so no number is typed by hand.
 * Shell-owned. Pure.
 */

function sum(values: readonly (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function groupTallies(results: readonly CaseRecord[]): GroupTally[] {
  const groups = new Map<string, GroupTally>();
  for (const { group, pass } of results) {
    const tally = groups.get(group) ?? { group, cases: 0, passed: 0 };
    tally.cases += 1;
    if (pass) tally.passed += 1;
    groups.set(group, tally);
  }
  return [...groups.values()];
}

/**
 * The seeded bootstrap over cases, the method of the earlier projects' numbers, so they compare;
 * or, when its resamples never vary, the Wilson score interval of the rate over the cases. Its
 * trials are the cases, not the units, since a case's units cluster as they do in the bootstrap.
 */
function caseInterval(tallies: readonly Tally[], rate: number): RunInterval {
  const bootstrap = bootstrapInterval(tallies, BOOTSTRAP);
  if (bootstrap.low !== bootstrap.high) return { method: "bootstrap", ...BOOTSTRAP, ...bootstrap };
  return {
    method: "wilson",
    level: WILSON.level,
    cases: tallies.length,
    ...wilsonInterval(rate, tallies.length),
  };
}

export function summarizeResults(results: readonly CaseRecord[]): EvalSummary {
  if (results.length === 0) throw new RangeError("A run needs at least one case.");
  const tallies = results.map(({ tally }) => tally);
  const tally = {
    passed: sum(tallies.map(({ passed }) => passed)),
    total: sum(tallies.map(({ total }) => total)),
  };
  const rate = tally.passed / tally.total;
  const usages = results.map(({ result }) => result.usage);
  const totals = usages.flatMap((usage) => (usage?.totalTokens == null ? [] : [usage.totalTokens]));
  const latencies = results.map(({ latencyMs }) => latencyMs);

  return {
    cases: results.length,
    passed: results.filter(({ pass }) => pass).length,
    tally,
    rate,
    // Over whole cases: a case's units are not independent (lib/eval/stats.ts).
    interval: caseInterval(tallies, rate),
    groups: groupTallies(results),
    failed: results.filter(({ pass }) => !pass).map(({ id }) => id),
    tokens: {
      input: sum(usages.map((usage) => usage?.inputTokens ?? null)),
      output: sum(usages.map((usage) => usage?.outputTokens ?? null)),
      total: sum(usages.map((usage) => usage?.totalTokens ?? null)),
      medianPerCase: totals.length === 0 ? null : median(totals),
    },
    latency: { medianMs: median(latencies), maxMs: Math.max(...latencies) },
  };
}

/** The headline's numbers as whole percents: README line 1 and the Evals page show the same. */
export function headlineNumbers({ rate, interval, tally, cases }: EvalSummary): HeadlineNumbers {
  return {
    rate: wholePercent(rate),
    low: wholePercent(interval.low),
    high: wholePercent(interval.high),
    level: wholePercent(interval.level),
    passed: tally.passed,
    total: tally.total,
    cases,
  };
}
