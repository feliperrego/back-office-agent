import { describe, expect, it } from "vitest";
import { mockRunChanges } from "./check";
import type { CaseRecord, EvalRun, TracedResult } from "./record";
import { summarizeResults } from "./summary";

// The mock eval in CI (template spec §5.11): the mock's answers are known, so a fresh mock run must
// give the committed mock run's answers and scores. Only the date, the times and the project's
// volatile keys may differ.

type Result = TracedResult & {
  reply: string;
  requestId?: string;
  note?: string;
};

function record(id: string, overrides: Partial<CaseRecord<Result>> = {}): CaseRecord<Result> {
  return {
    id,
    group: "lookup",
    askedAt: "2026-10-01T15:00:00.000Z",
    pass: true,
    tally: { passed: 1, total: 1 },
    checks: [{ id: "reply-mentions", ok: true }],
    label: "answered",
    result: {
      reply: `Reply ${id}.`,
      requestId: `req-${id}-1`,
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 8, totalTokens: 8 },
    },
    latencyMs: 30,
    ...overrides,
  };
}

function withResult(each: CaseRecord<Result>, result: Partial<Result>): CaseRecord<Result> {
  return { ...each, result: { ...each.result, ...result } };
}

function run(
  results: CaseRecord<Result>[],
  overrides: Partial<EvalRun<Result, { index: string }>> = {},
): EvalRun<Result, { index: string }> {
  return {
    date: "2026-10-01T15:00:00.000Z",
    aborted: false,
    abortReason: null,
    mock: true,
    model: "mock",
    commit: null,
    caseSet: {
      path: "measurements/cases.json",
      sha256: "c24b",
      frozenOn: "2026-10-01",
      n: 2,
    },
    results,
    summary: summarizeResults(results),
    extra: { index: "abcd" },
    ...overrides,
  };
}

const VOLATILE = ["requestId"];
const committed = run([record("c01"), record("c02")]);

describe("mockRunChanges", () => {
  it("finds no change when only the date, the commit, the times and the volatile keys differ", () => {
    const fresh = run(
      [
        withResult(record("c01", { askedAt: "2026-10-02T09:00:00.000Z", latencyMs: 12 }), {
          requestId: "req-c01-2",
        }),
        record("c02", { askedAt: "2026-10-02T09:00:01.000Z", latencyMs: 41 }),
      ],
      {
        date: "2026-10-02T09:00:00.000Z",
        commit: { sha: "1234567", dirty: true },
      },
    );
    expect(mockRunChanges(committed, fresh, VOLATILE)).toEqual([]);
  });

  it("ignores a field the fresh run holds as undefined, as the written JSON drops it", () => {
    const fresh = run([withResult(record("c01"), { note: undefined }), record("c02")]);
    expect(mockRunChanges(committed, fresh, VOLATILE)).toEqual([]);
  });

  it("names a case whose verdict flipped, either way", () => {
    const failed = run([record("c01", { pass: false }), record("c02")]);
    expect(mockRunChanges(committed, failed, VOLATILE)).toEqual(["c01: pass → FAIL"]);
    expect(mockRunChanges(failed, committed, VOLATILE)).toEqual(["c01: FAIL → pass"]);
  });

  it("names a case whose label, tally or checks changed", () => {
    const fresh = run([
      record("c01", { label: "refused" }),
      record("c02", {
        label: undefined,
        tally: { passed: 0, total: 1 },
        checks: [{ id: "reply-mentions", ok: false, detail: ["on loan"] }],
      }),
    ]);
    expect(mockRunChanges(committed, fresh, VOLATILE)).toEqual([
      "c01: label answered → refused",
      "c02: label answered → none",
      "c02: the tally differs",
      "c02: the checks differ",
    ]);
  });

  it("names each part of the answer that changed, a volatile key aside", () => {
    const fresh = run([
      withResult(record("c01"), {
        reply: "Another reply.",
        requestId: "req-other",
      }),
      withResult(record("c02"), {
        toolCalls: [
          {
            id: "call-1",
            name: "lookUpItem",
            input: {},
            output: {},
            state: "done",
          },
        ],
        usage: { inputTokens: 0, outputTokens: 9, totalTokens: 9 },
        note: "new",
      }),
    ]);
    expect(mockRunChanges(committed, fresh, VOLATILE)).toEqual([
      "c01: the result's reply differs",
      "c02: the result's toolCalls differs",
      "c02: the result's usage differs",
      "c02: the result's note differs",
    ]);
  });

  it("reports a different case list instead of comparing cases", () => {
    const fresh = run([record("c01"), record("c03")]);
    expect(mockRunChanges(committed, fresh, VOLATILE)).toEqual([
      "the cases differ: c01, c02 → c01, c03",
    ]);
  });

  it("reports a different case set, a different extra and a run that is not a mock run", () => {
    const fresh = run([record("c01"), record("c02")], {
      mock: false,
      caseSet: { ...committed.caseSet, sha256: "ffff" },
      extra: { index: "eeee" },
    });
    expect(mockRunChanges(committed, fresh, VOLATILE)).toEqual([
      "this run is not a mock run",
      "the frozen cases' SHA-256 differs",
      "the project's extra data differs",
    ]);
    expect(mockRunChanges({ ...committed, mock: false }, committed, VOLATILE)).toEqual([
      "the committed run is not a mock run",
    ]);
  });
});
