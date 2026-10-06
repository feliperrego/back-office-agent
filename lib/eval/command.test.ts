import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CASES_PATH, CASES_SHA256_PATH } from "./cases";
import { checkRequested, evalCommand, type EvalCommandOptions } from "./command";
import {
  type CaseOutcome,
  type EvalCase,
  type EvalProject,
  type EvalRun,
  MEASUREMENTS_DIR,
  MOCK_RUN_PATH,
  type TracedResult,
} from "./record";

// `pnpm eval` (template spec §5.11): the rules every run keeps, checked before any case is asked
// or any request is spent: the frozen set's hash, --check in mock mode only and no other argument,
// a good run never overwritten, the commit read; and an aborted run in its own file, written as
// soon as a case cannot be used, so the answers paid for before it are kept.

type Case = EvalCase & { message: string };
type Result = TracedResult & { reply: string };

const SET = {
  about: "Two frozen cases.",
  frozenOn: "2026-10-01",
  cases: [
    { id: "c01", group: "lookup", message: "One?" },
    { id: "c02", group: "general", message: "Two?" },
  ] satisfies Case[],
};

const DAY = new Date("2026-10-05T14:00:00.000Z");
const GOOD_RUN = `${MEASUREMENTS_DIR}/eval-2026-10-05.json`;
const ABORTED_RUN = `${MEASUREMENTS_DIR}/eval-2026-10-05-140000.aborted.json`;

let root: string;
let lines: string[];

function writeSet(text = `${JSON.stringify(SET, null, 2)}\n`): void {
  writeFileSync(path.join(root, CASES_PATH), text);
  const hash = createHash("sha256").update(text).digest("hex");
  writeFileSync(path.join(root, CASES_SHA256_PATH), `${hash}  cases.json\n`);
}

function read(file: string): EvalRun<Result> {
  return JSON.parse(readFileSync(path.join(root, file), "utf8")) as EvalRun<Result>;
}

function answer(reply: string): CaseOutcome<Result> {
  return {
    result: { reply, toolCalls: [], usage: { inputTokens: 0, outputTokens: 2, totalTokens: 2 } },
  };
}

function project(overrides: Partial<EvalProject<Case, Result, number>> = {}) {
  return {
    runCase: vi.fn(async ({ message }: Case) => answer(`Echo ${message}`)),
    score: (evalCase: Case, result: Result) => {
      const pass = result.reply.includes(evalCase.message);
      return {
        pass,
        tally: { passed: pass ? 1 : 0, total: 1 },
        checks: [{ id: "echo", ok: pass }],
      };
    },
    headline: ({ rate, cases }: { rate: number; cases: number }) =>
      `${rate}% of ${cases} cases passed`,
    volatileKeys: [],
    ...overrides,
  } satisfies EvalProject<Case, Result, number>;
}

function options(
  overrides: Partial<EvalCommandOptions<Case, Result, number>> = {},
): EvalCommandOptions<Case, Result, number> {
  return {
    check: false,
    mock: true,
    modelLabel: "mock",
    model: vi.fn(() => "provider/model-a"),
    project: project(),
    root,
    commit: vi.fn(() => ({ sha: "0123456789abcdef0123456789abcdef01234567", dirty: false })),
    now: () => DAY,
    log: (line: string) => lines.push(line),
    ...overrides,
  };
}

const real = { mock: false, modelLabel: "provider/model-a" };

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "eval-"));
  mkdirSync(path.join(root, MEASUREMENTS_DIR));
  writeSet();
  lines = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("checkRequested", () => {
  it("reads --check, the only argument, and the -- a package manager may pass", () => {
    expect(checkRequested([])).toBe(false);
    expect(checkRequested(["--check"])).toBe(true);
    expect(checkRequested(["--", "--check"])).toBe(true);
  });

  it("refuses any other argument, so a typo never re-records", () => {
    expect(() => checkRequested(["--chek"])).toThrow(
      "Unknown argument: --chek. The only one is --check.",
    );
    expect(() => checkRequested(["--check", "now"])).toThrow(/Unknown argument: now/);
  });
});

describe("evalCommand: before any case is asked", () => {
  it("refuses --check in real mode, before reading or running anything", async () => {
    const run = options({ ...real, check: true });
    await expect(evalCommand(run)).rejects.toThrow(
      `--check compares a mock run with ${MOCK_RUN_PATH}: set AI_MOCK=1.`,
    );
    expect(run.model).not.toHaveBeenCalled();
    expect(run.project.runCase).not.toHaveBeenCalled();
  });

  it("needs the committed mock run for --check, and reads it first", async () => {
    const run = options({ check: true });
    await expect(evalCommand(run)).rejects.toThrow(/ENOENT/);
    expect(run.project.runCase).not.toHaveBeenCalled();
  });

  it.each([
    ["a mock", {}],
    ["a real", real],
  ])("checks the frozen set's hash before %s model is made or any case runs", async (_, mode) => {
    writeFileSync(path.join(root, CASES_PATH), `${JSON.stringify(SET)}\n`);
    const run = options(mode);
    await expect(evalCommand(run)).rejects.toThrow(`${CASES_PATH} is not the frozen set`);
    expect(run.model).not.toHaveBeenCalled();
    expect(run.project.runCase).not.toHaveBeenCalled();
  });

  it("never overwrites a good real run of the same day, and says so before any case runs", async () => {
    writeFileSync(path.join(root, GOOD_RUN), "{}");
    const run = options(real);
    await expect(evalCommand(run)).rejects.toThrow(`${GOOD_RUN} already exists`);
    expect(run.project.runCase).not.toHaveBeenCalled();
    expect(readFileSync(path.join(root, GOOD_RUN), "utf8")).toBe("{}");
  });

  it("reads a real run's commit once, before any case, so it records the commit the run started at", async () => {
    const events: string[] = [];
    const run = options({
      ...real,
      commit: vi.fn(() => {
        events.push("commit");
        return { sha: "0123456789abcdef0123456789abcdef01234567", dirty: false };
      }),
      project: project({
        runCase: vi.fn(async ({ id, message }: Case) => {
          events.push(id);
          return answer(`Echo ${message}`);
        }),
      }),
    });
    await evalCommand(run);
    expect(events).toEqual(["commit", "c01", "c02"]);
  });

  it("fails before any case when git cannot give the commit, and writes nothing", async () => {
    const run = options({
      ...real,
      commit: vi.fn(() => {
        throw new Error("fatal: ambiguous argument 'HEAD'");
      }),
    });
    await expect(evalCommand(run)).rejects.toThrow("fatal: ambiguous argument 'HEAD'");
    expect(run.project.runCase).not.toHaveBeenCalled();
    expect(readdirSync(path.join(root, MEASUREMENTS_DIR)).sort()).toEqual([
      "cases.json",
      "cases.sha256",
    ]);
  });

  it("fails before any case outside a git checkout, with the default commit", async () => {
    const run = options({ ...real, commit: undefined });
    await expect(evalCommand(run)).rejects.toThrow(/git/);
    expect(run.project.runCase).not.toHaveBeenCalled();
  });
});

describe("evalCommand: the commit of a real run", () => {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

  beforeEach(() => {
    writeFileSync(path.join(root, "notes.txt"), "one\n");
    git("init", "--quiet");
    git("add", "--all");
    git(
      "-c",
      "user.name=Eval Test",
      "-c",
      "user.email=eval-test@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "--message",
      "init",
    );
  });

  it("is HEAD, and the eval's own files (an aborted run, an earlier run, the mock run) leave it clean", async () => {
    for (const file of [
      `${MEASUREMENTS_DIR}/eval-2026-10-05-090000.aborted.json`,
      `${MEASUREMENTS_DIR}/eval-2026-10-04.json`,
      MOCK_RUN_PATH,
    ]) {
      writeFileSync(path.join(root, file), "{}\n");
    }
    await evalCommand(options({ ...real, commit: undefined }));
    expect(read(GOOD_RUN).commit).toEqual({ sha: git("rev-parse", "HEAD"), dirty: false });
  });

  it.each([
    ["a changed tracked file", "notes.txt"],
    ["a new file", "draft.ts"],
    ["another metric's run", `${MEASUREMENTS_DIR}/ttft-2026-10-05.json`],
  ])("is dirty with %s", async (_, file) => {
    writeFileSync(path.join(root, file), "two\n");
    await evalCommand(options({ ...real, commit: undefined }));
    expect(read(GOOD_RUN).commit).toEqual({ sha: git("rev-parse", "HEAD"), dirty: true });
  });
});

describe("evalCommand: a real run", () => {
  it("writes its own file, with its model, commit and set, and prints the README lines", async () => {
    const run = options(real);
    await evalCommand(run);

    const written = read(GOOD_RUN);
    expect(written).toMatchObject({
      date: DAY.toISOString(),
      aborted: false,
      abortReason: null,
      mock: false,
      model: "provider/model-a",
      commit: { sha: "0123456789abcdef0123456789abcdef01234567", dirty: false },
      caseSet: {
        path: CASES_PATH,
        sha256: readFileSync(path.join(root, CASES_SHA256_PATH), "utf8").split(" ")[0],
        frozenOn: "2026-10-01",
        n: 2,
      },
      summary: { cases: 2, passed: 2 },
    });
    expect(written.results.map(({ id, pass }) => [id, pass])).toEqual([
      ["c01", true],
      ["c02", true],
    ]);
    expect(written).not.toHaveProperty("extra");
    expect(run.project.runCase).toHaveBeenCalledWith(SET.cases[0], { model: "provider/model-a" });
    expect(lines.join("\n")).toContain("README line 1:\n# ");
    expect(lines.join("\n")).toContain("100% of 2 cases passed");
    expect(lines.join("\n")).not.toContain("Never paste them");
  });

  it("stops at the first case it cannot score, writes the run as aborted in its own file, and fails", async () => {
    const run = options({
      ...real,
      project: project({
        runCase: vi.fn(async ({ id, message }: Case) =>
          id === "c02" ? { abortReason: "the answer failed: Gateway said no" } : answer(message),
        ),
      }),
    });

    await expect(evalCommand(run)).rejects.toThrow(
      `The run stopped: c02: the answer failed: Gateway said no. Wrote ${ABORTED_RUN}.`,
    );
    expect(read(ABORTED_RUN)).toMatchObject({
      aborted: true,
      abortReason: "c02: the answer failed: Gateway said no",
      summary: null,
      results: [{ id: "c01" }],
    });
    expect(existsSync(path.join(root, GOOD_RUN))).toBe(false);
  });

  it("records the project's extra data with the run", async () => {
    await evalCommand(
      options({ ...real, project: project({ extra: (results) => results.length }) }),
    );
    expect(read(GOOD_RUN).extra).toBe(2);
  });

  it("stops right after a case whose score has no unit, before the next is asked, and writes it as aborted", async () => {
    const run = options({
      ...real,
      project: project({
        score: (evalCase: Case) => ({
          pass: false,
          tally: { passed: 0, total: evalCase.id === "c01" ? 0 : 1 },
          checks: [],
        }),
      }),
    });

    await expect(evalCommand(run)).rejects.toThrow(
      "The run stopped: c01: the score's tally must be whole units, 0 <= passed <= total and " +
        `total >= 1; got {"passed":0,"total":0}. Wrote ${ABORTED_RUN}.`,
    );
    expect(run.project.runCase).toHaveBeenCalledTimes(1);
    expect(read(ABORTED_RUN)).toMatchObject({ aborted: true, summary: null, results: [] });
    expect(existsSync(path.join(root, GOOD_RUN))).toBe(false);
  });

  it("keeps every answer in the aborted file when the run's summary fails after the last case", async () => {
    const run = options({
      ...real,
      project: project({
        extra: () => {
          throw new Error("no index to hash");
        },
      }),
    });

    await expect(evalCommand(run)).rejects.toThrow(
      `The run stopped: summarizing the run failed: no index to hash. Wrote ${ABORTED_RUN}.`,
    );
    expect(read(ABORTED_RUN)).toMatchObject({
      aborted: true,
      abortReason: "summarizing the run failed: no index to hash",
      summary: null,
      results: [{ id: "c01" }, { id: "c02" }],
    });
    expect(read(ABORTED_RUN)).not.toHaveProperty("extra");
    expect(existsSync(path.join(root, GOOD_RUN))).toBe(false);
  });
});

describe("evalCommand: the mock run", () => {
  it("rewrites the mock run, with no commit, and says its README lines only show the format", async () => {
    const run = options();
    await evalCommand(run);
    expect(read(MOCK_RUN_PATH)).toMatchObject({ mock: true, model: "mock", commit: null });
    expect(run.commit).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("Never paste them into the README.");
    expect(readdirSync(path.join(root, MEASUREMENTS_DIR)).sort()).toEqual([
      "cases.json",
      "cases.sha256",
      "eval-mock.json",
    ]);
  });

  it("writes nothing when it stops early, and fails", async () => {
    const run = options({
      project: project({ runCase: vi.fn(async () => ({ abortReason: "the answer was aborted" })) }),
    });
    await expect(evalCommand(run)).rejects.toThrow("The run stopped: c01: the answer was aborted.");
    expect(existsSync(path.join(root, MOCK_RUN_PATH))).toBe(false);
  });
});

describe("evalCommand --check", () => {
  it("passes when a fresh mock run gives the committed answers and scores, and writes nothing", async () => {
    await evalCommand(options());
    const committed = readFileSync(path.join(root, MOCK_RUN_PATH), "utf8");
    lines = [];

    await evalCommand(options({ check: true, now: () => new Date("2026-10-06T09:00:00.000Z") }));

    expect(readFileSync(path.join(root, MOCK_RUN_PATH), "utf8")).toBe(committed);
    expect(lines.join("\n")).toContain(
      `Checked: every case's answer and score equal ${MOCK_RUN_PATH}'s. Nothing written.`,
    );
  });

  it("fails with one line for each difference, and writes nothing", async () => {
    await evalCommand(options());
    const committed = readFileSync(path.join(root, MOCK_RUN_PATH), "utf8");
    const changed = project({
      runCase: vi.fn(async ({ id, message }: Case) =>
        answer(id === "c02" ? "Other." : `Echo ${message}`),
      ),
    });

    await expect(evalCommand(options({ check: true, project: changed }))).rejects.toThrow(
      `This mock run differs from ${MOCK_RUN_PATH}:\n` +
        "  c02: pass → FAIL\n  c02: the tally differs\n  c02: the checks differ\n" +
        "  c02: the result's reply differs\n" +
        `If the change is intended, rerun AI_MOCK=1 pnpm eval and commit ${MOCK_RUN_PATH}.`,
    );
    expect(readFileSync(path.join(root, MOCK_RUN_PATH), "utf8")).toBe(committed);
  });
});
