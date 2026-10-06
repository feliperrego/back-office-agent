import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/project";
import { readmeLines } from "./readme";
import type { CaseRecord, EvalRun, HeadlineNumbers } from "./record";
import { headlineNumbers, summarizeResults } from "./summary";

// The README lines a run prints (template spec §5.11, §8): line 1 and the first line of "How it's
// measured", from the run's file, so no number is typed by hand.

const headline = ({ rate, cases }: HeadlineNumbers) => `${rate}% of ${cases} frozen cases passed`;

function record(id: string, group: string, pass: boolean): CaseRecord {
  return {
    id,
    group,
    askedAt: "2026-10-05T14:00:00.000Z",
    pass,
    tally: { passed: pass ? 1 : 0, total: 1 },
    checks: [],
    result: {
      toolCalls: [],
      usage: { inputTokens: 2000, outputTokens: 100, totalTokens: 2100 },
    },
    latencyMs: 3000,
  };
}

/** 4 lookup and 2 general cases: c02 fails. */
function records(): CaseRecord[] {
  return [
    record("c01", "lookup", true),
    record("c02", "lookup", false),
    record("c03", "lookup", true),
    record("c04", "lookup", true),
    record("c05", "general", true),
    record("c06", "general", true),
  ];
}

function run(overrides: Partial<EvalRun> = {}, list: CaseRecord[] = records()): EvalRun {
  return {
    date: "2026-10-05T14:00:00.000Z",
    aborted: false,
    abortReason: null,
    mock: false,
    model: "provider/model-a",
    commit: { sha: "0123456789abcdef0123456789abcdef01234567", dirty: false },
    caseSet: {
      path: "measurements/cases.json",
      sha256: "c".repeat(64),
      frozenOn: "2026-10-01",
      n: list.length,
    },
    results: list,
    summary: summarizeResults(list),
    ...overrides,
  };
}

describe("readmeLines", () => {
  it("prints README line 1: the product, the project's sentence and the 95% CI", () => {
    const { title } = readmeLines(run(), "measurements/eval-2026-10-05.json", headline);
    const { low, high } = headlineNumbers(run().summary!);
    expect(title).toBe(`# ${PRODUCT_NAME} — 83% of 6 frozen cases passed (95% CI ${low}–${high}%)`);
  });

  it("prints How it's measured: the set, the model, the day, the commit, each group and the failures", () => {
    const { howMeasured } = readmeLines(run(), "measurements/eval-2026-10-05.json", headline);
    expect(howMeasured).toBe(
      "n=6 frozen cases (4 lookup, 2 general), each run once against provider/model-a and " +
        "scored by script, with no LLM judge, on 2026-10-05 at commit 0123456; passed: lookup " +
        "3 of 4, general 2 of 2 (failed: c02); median 3.0 s and 2,100 tokens per case · " +
        "[raw data](measurements/eval-2026-10-05.json)",
    );
  });

  it("names a dirty working tree, and a run with no failures and no tokens reported", () => {
    const list = records().map((each) => ({
      ...each,
      pass: true,
      tally: { passed: 1, total: 1 },
      result: { ...each.result, usage: null },
    }));
    const lines = readmeLines(
      run({ commit: { sha: "abcdef0123", dirty: true } }, list),
      "x.json",
      headline,
    );
    expect(lines.howMeasured).toContain("at commit abcdef0 with local changes;");
    expect(lines.howMeasured).toContain("general 2 of 2; median 3.0 s per case ·");
  });

  it("names the Wilson score interval on line 1 when every case scored the same", () => {
    // The bootstrap of 6 of 6 has no spread, so the run's interval is Wilson's: 6 / (6 + z²).
    const list = records().map((each) => ({ ...each, pass: true, tally: { passed: 1, total: 1 } }));
    const { title } = readmeLines(run({}, list), "x.json", headline);
    expect(title).toBe(
      `# ${PRODUCT_NAME} — 100% of 6 frozen cases passed (95% CI 61–100%, Wilson score)`,
    );
  });

  it("says that a mock run records no commit", () => {
    const { howMeasured } = readmeLines(
      run({ mock: true, model: "mock", commit: null }),
      "x.json",
      headline,
    );
    expect(howMeasured).toContain(
      "against mock and scored by script, with no LLM judge, on 2026-10-05, a mock run, which " +
        "records no commit; passed:",
    );
  });

  it("refuses an aborted run, which has no summary", () => {
    expect(() =>
      readmeLines(
        run({ aborted: true, abortReason: "c03: stopped", summary: null }),
        "x",
        headline,
      ),
    ).toThrow(/aborted/);
  });
});
