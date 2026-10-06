import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CASES_PATH, frozenCaseSetHash, readCaseSet } from "./cases";
import { EVAL_PROJECT } from "./project";
import { type EvalRun, MOCK_RUN_PATH } from "./record";
import { summarizeResults } from "./summary";

// The committed mock run (template spec §5.11): the screens show it until a real run exists, so it
// must match the frozen cases and the project's scorer of this commit. A scorer change ships with
// a new run: a stale file fails here, or in CI's `pnpm eval --check` when the answers changed;
// rerun `AI_MOCK=1 pnpm eval` and commit it. It holds in any project: it reads the project's
// cases and scorer, never a case by its id.

type ProjectCase = Parameters<typeof EVAL_PROJECT.score>[0];
type ProjectResult = Parameters<typeof EVAL_PROJECT.score>[1];

const run = JSON.parse(readFileSync(MOCK_RUN_PATH, "utf8")) as EvalRun<ProjectResult>;
const set = readCaseSet<ProjectCase>();

/** A value as the run's file would hold it: JSON drops undefined fields. */
function asWritten<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

describe(MOCK_RUN_PATH, () => {
  it("is a finished mock run of the frozen cases, which records no commit", () => {
    expect(run).toMatchObject({
      mock: true,
      model: "mock",
      aborted: false,
      abortReason: null,
      commit: null,
      caseSet: { path: CASES_PATH, sha256: frozenCaseSetHash(), frozenOn: set.frozenOn },
    });
    expect(run.caseSet.n).toBe(set.cases.length);
    expect(run.results.map(({ id, group }) => [id, group])).toEqual(
      set.cases.map(({ id, group }) => [id, group]),
    );
    expect(run.date.slice(0, 10) >= set.frozenOn).toBe(true);
  });

  it("holds each case's score as the project's scorer scores its recorded answer now", () => {
    for (const [i, record] of run.results.entries()) {
      const { pass, tally, checks, label } = record;
      expect(asWritten({ pass, tally, checks, label }), record.id).toEqual(
        asWritten(EVAL_PROJECT.score(set.cases[i], record.result)),
      );
    }
  });

  it("holds the summary of those scores, and the project's extra data", () => {
    expect(run.summary).toEqual(summarizeResults(run.results));
    expect(run.extra).toEqual(asWritten(EVAL_PROJECT.extra?.(run.results)));
  });
});
