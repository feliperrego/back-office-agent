import { isDeepStrictEqual } from "node:util";
import type { CaseRecord, EvalRun } from "./record";

/**
 * The mock eval's check in CI (template spec §5.11): the mock model's answers are known, so a fresh
 * mock run must give the committed mock run's answer and score for every case. Only the run's
 * date and commit, each case's times and the project's volatile keys (EVAL_PROJECT.volatileKeys)
 * may differ. A difference means the pipeline or the scorer changed: it proves the scorer, not the
 * model. Shell-owned. Server-only (node:util); pure.
 */

/** The run as its file holds it: JSON drops undefined fields. */
function asWritten<Run>(run: Run): Run {
  return JSON.parse(JSON.stringify(run)) as Run;
}

function verdict(pass: boolean): string {
  return pass ? "pass" : "FAIL";
}

function caseChanges(
  before: CaseRecord,
  after: CaseRecord,
  volatileKeys: readonly string[],
): string[] {
  const { id } = before;
  const changes: string[] = [];
  if (before.pass !== after.pass) {
    changes.push(`${id}: ${verdict(before.pass)} → ${verdict(after.pass)}`);
  }
  if (before.label !== after.label) {
    changes.push(`${id}: label ${before.label ?? "none"} → ${after.label ?? "none"}`);
  }
  if (!isDeepStrictEqual(before.tally, after.tally)) changes.push(`${id}: the tally differs`);
  if (!isDeepStrictEqual(before.checks, after.checks)) changes.push(`${id}: the checks differ`);

  const was = before.result as Record<string, unknown>;
  const is = after.result as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(was), ...Object.keys(is)])];
  for (const key of keys.filter((each) => !volatileKeys.includes(each))) {
    if (!isDeepStrictEqual(was[key], is[key])) changes.push(`${id}: the result's ${key} differs`);
  }
  return changes;
}

/** How a fresh mock run differs from the committed one, one line per difference; [] if none. */
export function mockRunChanges(
  committedRun: EvalRun,
  freshRun: EvalRun,
  volatileKeys: readonly string[],
): string[] {
  const committed = asWritten(committedRun);
  const fresh = asWritten(freshRun);
  const changes: string[] = [];
  if (!committed.mock) changes.push("the committed run is not a mock run");
  if (!fresh.mock) changes.push("this run is not a mock run");
  if (committed.caseSet.sha256 !== fresh.caseSet.sha256) {
    changes.push("the frozen cases' SHA-256 differs");
  }
  if (!isDeepStrictEqual(committed.extra, fresh.extra)) {
    changes.push("the project's extra data differs");
  }

  const committedIds = committed.results.map(({ id }) => id);
  const freshIds = fresh.results.map(({ id }) => id);
  if (!isDeepStrictEqual(committedIds, freshIds)) {
    changes.push(`the cases differ: ${committedIds.join(", ")} → ${freshIds.join(", ")}`);
    return changes;
  }
  return [
    ...changes,
    ...committed.results.flatMap((result, i) =>
      caseChanges(result, fresh.results[i], volatileKeys),
    ),
  ];
}
