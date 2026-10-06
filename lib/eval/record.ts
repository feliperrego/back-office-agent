import type { LanguageModel } from "ai";
import type { ToolView } from "@/lib/trace/tool-view";
import type { Check, TokenUsage } from "@/lib/trace/trace";
import type { BOOTSTRAP, Interval, Tally, WILSON } from "./stats";

/**
 * The eval run's file and the project's part in it (template spec §5.11). A real run writes
 * measurements/eval-YYYY-MM-DD.json, with every case's answer, score, tokens and latency, and the
 * summary the README lines come from; a mock run writes MOCK_RUN_PATH instead, which the screens
 * show until a real run exists. Shell-owned: the project supplies its case type, how a case runs
 * and how an answer scores, in lib/eval/project.ts (EvalProject below). Types and constants
 * only.
 */

/** The metric name of measurements/<metric>-YYYY-MM-DD.json (lib/measure/record.ts). */
export const EVAL_METRIC = "eval";

/** The folder of the frozen cases and of every run. */
export const MEASUREMENTS_DIR = "measurements";

/**
 * The mock run: `AI_MOCK=1 pnpm eval` rewrites it and CI's `pnpm eval --check` checks it. Never a
 * measurement.
 */
export const MOCK_RUN_PATH = `${MEASUREMENTS_DIR}/${EVAL_METRIC}-mock.json`;

export type { Tally } from "./stats";

/** What every case of the frozen set holds; a project's case adds its question and its gold. */
export type EvalCase = {
  /** Unique in the set; it names the case on every screen and in the run's file. */
  id: string;
  /** The case's group, for the per-group tallies. */
  group: string;
};

/** What the trace shows of one answer, besides its latency, which the runner measures. */
export type TracedResult = {
  /** The answer's tool calls, in order, as the chat shows them. */
  toolCalls: ToolView[];
  /** The tokens of every model call of the answer; null when none was reported. */
  usage: TokenUsage | null;
};

/** One case's run: what the project records of the answer, or why the whole run must stop. */
export type CaseOutcome<Result extends TracedResult> = { result: Result } | { abortReason: string };

/** How a project's script scored one answer, with no LLM judge. */
export type Score = {
  pass: boolean;
  /**
   * The case's scored units: 1 or 0 of 1 for a case that passes or fails as a whole. Whole units,
   * 0 <= passed <= total and total >= 1, or the run stops right after the case (lib/eval/run.ts).
   */
  tally: Tally;
  /** Each condition the answer was scored by. */
  checks: Check[];
  /** What the scorer calls the answer (an outcome, say), recorded once and never recomputed. */
  label?: string;
};

/** One case, run once, as the run's file holds it. */
export type CaseRecord<Result extends TracedResult = TracedResult> = {
  id: string;
  group: string;
  /** When the case was sent, ISO 8601 in UTC. */
  askedAt: string;
} & Score & {
    /** What the project recorded of the answer (lib/eval/project.ts). */
    result: Result;
    /** From sending the case to the end of its answer, in whole milliseconds. */
    latencyMs: number;
  };

/**
 * The headline's 95% interval and the method that gave it: the seeded percentile bootstrap over
 * cases, or, when its resamples never vary (every case scored the same, or a single case), the
 * Wilson score interval of the rate over the cases (lib/eval/stats.ts).
 */
export type RunInterval =
  | ({ method: "bootstrap" } & typeof BOOTSTRAP & Interval)
  | ({ method: "wilson"; level: typeof WILSON.level; cases: number } & Interval);

/** Cases passed out of cases run, in one group. */
export type GroupTally = { group: string; cases: number; passed: number };

/** The run's numbers: the headline and its supporting data, never a second headline. */
export type EvalSummary = {
  /** How many cases ran. */
  cases: number;
  /** How many cases passed. */
  passed: number;
  /** The scored units of every case, summed. */
  tally: Tally;
  /** tally.passed / tally.total: the headline. */
  rate: number;
  /** The headline's interval over cases, with its method. */
  interval: RunInterval;
  /** Each group, in the order its first case comes in the set. */
  groups: GroupTally[];
  /** The ids of the cases that failed, in the set's order. */
  failed: string[];
  /** Token totals over the run, and the median per case; counts not reported are left out. */
  tokens: {
    input: number;
    output: number;
    total: number;
    medianPerCase: number | null;
  };
  latency: { medianMs: number; maxMs: number };
};

export type EvalRun<Result extends TracedResult = TracedResult, Extra = unknown> = {
  /** The run's start, ISO 8601 in UTC; it names a real run's file. */
  date: string;
  aborted: boolean;
  /** Why the run stopped early, or null. */
  abortReason: string | null;
  /** True for a run of the mock model: never a measurement. */
  mock: boolean;
  /** The model id (lib/ai/model.ts MODEL_LABEL), "mock" in mock mode. */
  model: string;
  /**
   * The commit a real run ran at, and whether the working tree had changes. Null for a mock run,
   * so re-recording the mock run never changes it for a new commit alone.
   */
  commit: { sha: string; dirty: boolean } | null;
  /** The frozen set the run asked, checked by its SHA-256 before any case ran. */
  caseSet: { path: string; sha256: string; frozenOn: string; n: number };
  results: CaseRecord<Result>[];
  /** Null for an aborted run, which prints no README lines. */
  summary: EvalSummary | null;
  /** The project's own data about the run (lib/eval/project.ts), when it records any. */
  extra?: Extra;
};

/** The numbers README line 1 and the Evals page show, as whole percents. */
export type HeadlineNumbers = {
  rate: number;
  low: number;
  high: number;
  /** The interval's confidence level, 95. */
  level: number;
  /** Scored units passed, out of total. */
  passed: number;
  total: number;
  /** How many cases ran. */
  cases: number;
};

/**
 * What lib/eval/project.ts (project-owned) exports as EVAL_PROJECT: everything the shell's eval
 * cannot know about a project's cases.
 */
export type EvalProject<Case extends EvalCase, Result extends TracedResult, Extra = never> = {
  /**
   * Runs one case once against the model and records its answer, or says why the run must stop
   * (a failed or cut answer). A case that cannot be run at all (a bug in the set) throws.
   */
  runCase(evalCase: Case, options: { model: LanguageModel }): Promise<CaseOutcome<Result>>;
  /**
   * Scores one recorded answer by script. Pure, so a test can re-score a committed run. A throw
   * stops the run right after the case, as an answer that failed does.
   */
  score(evalCase: Case, result: Result): Score;
  /** README line 1's sentence after the product name: "92% of 24 frozen cases passed". */
  headline(numbers: HeadlineNumbers): string;
  /** Keys of a result that differ between two mock runs of the same answers (a time, an id). */
  volatileKeys: readonly string[];
  /** The project's own data about the run, from its results so far. */
  extra?(results: readonly CaseRecord<Result>[]): Extra;
};
