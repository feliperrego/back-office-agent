import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCaseSet } from "./cases";
import { type CaseRecord, type EvalRun, MEASUREMENTS_DIR, MOCK_RUN_PATH } from "./record";
import { pickRunFile, readShownRun } from "./runs";
import { summarizeResults } from "./summary";

// Which eval run the screens show (template spec §5.11): the newest finished real run, or the
// mock run while none exists; never an aborted or unsummarized one.

const RECORD: CaseRecord = {
  id: "c01",
  group: "lookup",
  askedAt: "2026-10-05T14:00:00.000Z",
  pass: true,
  tally: { passed: 1, total: 1 },
  checks: [],
  result: { toolCalls: [], usage: null },
  latencyMs: 40,
};

function run(overrides: Partial<EvalRun> = {}): EvalRun {
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
      n: 1,
    },
    results: [RECORD],
    summary: summarizeResults([RECORD]),
    ...overrides,
  };
}

describe("pickRunFile", () => {
  it("shows the mock run while no real run exists", () => {
    expect(pickRunFile([])).toBe(MOCK_RUN_PATH);
    expect(pickRunFile(["eval-mock.json", "cases.json", "cases.sha256"])).toBe(MOCK_RUN_PATH);
  });

  it("shows the newest finished real run, never an aborted one", () => {
    expect(
      pickRunFile([
        "eval-mock.json",
        "eval-2026-10-02.json",
        "eval-2026-10-03-101500.aborted.json",
        "eval-2026-09-30.json",
        "ttft-2026-10-04.json",
      ]),
    ).toBe(`${MEASUREMENTS_DIR}/eval-2026-10-02.json`);
  });

  it("ignores files that only look like a run", () => {
    expect(
      pickRunFile(["eval-2026-10-02.json.bak", "eval-latest.json", "xeval-2026-10-02.json"]),
    ).toBe(MOCK_RUN_PATH);
  });

  it("reads the metric's name, so another metric's runs are its own", () => {
    const files = ["eval-2026-10-02.json", "review-2026-10-01.json", "review-mock.json"];
    expect(pickRunFile(files, "review")).toBe(`${MEASUREMENTS_DIR}/review-2026-10-01.json`);
    expect(pickRunFile(["eval-2026-10-02.json"], "review")).toBe(
      `${MEASUREMENTS_DIR}/review-mock.json`,
    );
    // The name is matched as written, never as a pattern.
    expect(pickRunFile(["exval-2026-10-02.json"], "e.val")).toBe(
      `${MEASUREMENTS_DIR}/e.val-mock.json`,
    );
  });
});

describe("readShownRun", () => {
  let root: string;

  function write(file: string, value: EvalRun): void {
    writeFileSync(path.join(root, MEASUREMENTS_DIR, file), JSON.stringify(value));
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "runs-"));
    mkdirSync(path.join(root, MEASUREMENTS_DIR));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads the run pickRunFile picks, by its path in the repo", () => {
    write("eval-mock.json", run({ mock: true, model: "mock", commit: null }));
    expect(readShownRun({ root })).toMatchObject({ file: MOCK_RUN_PATH, run: { mock: true } });

    write("eval-2026-10-05.json", run());
    write("eval-2026-10-06-090000.aborted.json", run({ date: "2026-10-06T09:00:00.000Z" }));
    expect(readShownRun({ root })).toEqual({
      file: `${MEASUREMENTS_DIR}/eval-2026-10-05.json`,
      run: run(),
    });
  });

  it("refuses to show an aborted run or one without a summary", () => {
    write("eval-2026-10-05.json", run({ aborted: true, abortReason: "c01: stopped" }));
    expect(() => readShownRun({ root })).toThrow(
      `${MEASUREMENTS_DIR}/eval-2026-10-05.json is not a finished run`,
    );
    write("eval-2026-10-05.json", run({ summary: null }));
    expect(() => readShownRun({ root })).toThrow(/is not a finished run/);
  });

  it("reads the committed run: a finished run of every frozen case", () => {
    const { file, run: shown } = readShownRun();
    expect(file).toBe(pickRunFile(readdirSync(MEASUREMENTS_DIR)));
    expect(shown.mock).toBe(file === MOCK_RUN_PATH);
    expect(shown.aborted).toBe(false);
    expect(shown.summary).not.toBeNull();
    expect(shown.results.map(({ id }) => id)).toEqual(readCaseSet().cases.map(({ id }) => id));
  });
});
