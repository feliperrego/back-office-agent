import { formatNumber, formatSeconds } from "@/lib/i18n/display";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import { type Localized, localized } from "@/lib/i18n/localized";
import type { ShellMessages } from "@/lib/i18n/shell-messages";
import { REPO_URL } from "@/lib/project";
import type { ToolView } from "@/lib/trace/tool-view";
import type { Check, TokenUsage } from "@/lib/trace/trace";
import type { EvalRun, HeadlineNumbers, TracedResult } from "./record";
import { headlineNumbers } from "./summary";

/**
 * What the Evals page and a case's page show (template spec §5.12), built from the shown run's
 * file on the server, at build time, and passed to the client views as data. Every number comes
 * from the run; a page never recomputes a score or a label (template spec §5.11). A mock run
 * shows its pass counts and no measured number: no rate, interval, method, latency or token
 * count, since its answers are fixed text. Shell-owned: the project supplies its words and links
 * (EvalsPage below). Pure and client-safe, so a client view may import its text helpers.
 */

/** What the screens say about the run: its date (ISO 8601), model, short commit, and mode. */
export type RunLabel = {
  date: string;
  model: string;
  /** Null for a mock run, which records no commit. */
  commit: string | null;
  /** The working tree had changes when the run ran. */
  dirty: boolean;
  /** A mock run: never a measurement. */
  mock: boolean;
};

export function runLabel(run: EvalRun): RunLabel {
  return {
    date: run.date,
    model: run.model,
    commit: run.commit?.sha.slice(0, 7) ?? null,
    dirty: run.commit?.dirty ?? false,
    mock: run.mock,
  };
}

/** A supporting number of a real run, as supportingText writes it. */
export type SupportingValue =
  | { kind: "count"; n: number | null }
  | { kind: "seconds"; ms: number }
  | { kind: "share"; n: number; total: number };

export type SupportingRow = { label: Localized; value: SupportingValue };

/**
 * The project's part of its Evals pages: its words, each from its dictionary in every language
 * (lib/i18n/localized.ts), and its links. A server page passes it, so it may hold functions.
 */
export type EvalsPage<Result extends TracedResult, Extra = unknown> = {
  /** A real run's headline, README line 1's sentence: {rate}, {cases}, {passed} and {total}. */
  headline: Localized;
  /** How each case is asked and scored, under the headline. */
  about: Localized;
  groupLabel(group: string): Localized;
  checkLabel(id: string): Localized;
  /** The Evals page, which a case's page links back to. */
  evalsHref: string;
  /** A case's own page, which its row links to. */
  caseHref(id: string): string;
  /** The project's own numbers about a real run, after the shell's; a mock run shows none. */
  supporting?(run: EvalRun<Result, Extra>): SupportingRow[];
  /** A chat case's question and its recorded answer, shown above the trace. */
  exchange?(result: Result): { question: string; answer: string };
};

type Shown<Result extends TracedResult, Extra> = { file: string; run: EvalRun<Result, Extra> };

export type EvalsViewData = {
  run: RunLabel;
  /** How many cases ran, and passed: the pass counts every run shows. */
  cases: number;
  passed: number;
  /** A real run's measured numbers; null for a mock run, which shows none. */
  measured: {
    headline: HeadlineNumbers;
    /** The project's headline sentence, with the placeholders of EvalsPage.headline. */
    sentence: Localized;
    /** The interval's method, named next to the interval when it is not the bootstrap. */
    interval: { method: "bootstrap"; resamples: number; seed: number } | { method: "wilson" };
    supporting: SupportingRow[];
  } | null;
  about: Localized;
  groups: { id: string; label: Localized; cases: number; passed: number }[];
  /** One row per case, in the set's order. */
  rows: {
    id: string;
    href: string;
    group: Localized;
    pass: boolean;
    /** Null for a mock run. */
    measured: { latencyMs: number; totalTokens: number | null } | null;
  }[];
  details: {
    caseSet: { n: number; frozenOn: string; sha256: string };
    /** The run's file, repo-relative. */
    file: string;
    rawDataHref: string;
  };
};

/** The Evals page of the shown run. A run without a summary is never shown. */
export function evalsView<Result extends TracedResult, Extra>(
  { file, run }: Shown<Result, Extra>,
  page: EvalsPage<Result, Extra>,
): EvalsViewData {
  const { summary } = run;
  if (summary === null) throw new Error(`${file} has no summary: the screens show finished runs.`);
  const real = !run.mock;
  return {
    run: runLabel(run),
    cases: summary.cases,
    passed: summary.passed,
    measured: real
      ? {
          headline: headlineNumbers(summary),
          sentence: page.headline,
          interval:
            summary.interval.method === "bootstrap"
              ? {
                  method: "bootstrap",
                  resamples: summary.interval.resamples,
                  seed: summary.interval.seed,
                }
              : { method: "wilson" },
          supporting: [
            {
              label: localized((t) => t.evals.medianLatency),
              value: { kind: "seconds", ms: summary.latency.medianMs },
            },
            {
              label: localized((t) => t.evals.slowest),
              value: { kind: "seconds", ms: summary.latency.maxMs },
            },
            {
              label: localized((t) => t.evals.medianTokens),
              value: { kind: "count", n: summary.tokens.medianPerCase },
            },
            {
              label: localized((t) => t.evals.allTokens),
              value: { kind: "count", n: summary.tokens.total },
            },
            ...(page.supporting?.(run) ?? []),
          ],
        }
      : null,
    about: page.about,
    groups: summary.groups.map(({ group, cases, passed }) => ({
      id: group,
      label: page.groupLabel(group),
      cases,
      passed,
    })),
    rows: run.results.map(({ id, group, pass, latencyMs, result }) => ({
      id,
      href: page.caseHref(id),
      group: page.groupLabel(group),
      pass,
      measured: real ? { latencyMs, totalTokens: result.usage?.totalTokens ?? null } : null,
    })),
    details: {
      caseSet: {
        n: run.caseSet.n,
        frozenOn: run.caseSet.frozenOn,
        sha256: run.caseSet.sha256,
      },
      file,
      rawDataHref: `${REPO_URL}/blob/main/${file}`,
    },
  };
}

export type CaseViewData = {
  run: RunLabel;
  id: string;
  group: Localized;
  pass: boolean;
  checks: Check[];
  /** Each check's label, by its id. */
  checkLabels: Record<string, Localized>;
  toolCalls: ToolView[];
  exchange: { question: string; answer: string } | null;
  /** The answer's tokens and latency; null for a mock run, which measures neither. */
  measured: { usage: TokenUsage | null; latencyMs: number } | null;
  evalsHref: string;
};

/** One case's page: its verdict and checks, its tool calls and, for a real run, its usage. */
export function caseView<Result extends TracedResult, Extra>(
  { run }: Shown<Result, Extra>,
  id: string,
  page: EvalsPage<Result, Extra>,
): CaseViewData | null {
  const record = run.results.find((result) => result.id === id);
  if (record === undefined) return null;
  return {
    run: runLabel(run),
    id,
    group: page.groupLabel(record.group),
    pass: record.pass,
    checks: record.checks,
    checkLabels: Object.fromEntries(record.checks.map(({ id }) => [id, page.checkLabel(id)])),
    toolCalls: record.result.toolCalls,
    exchange: page.exchange?.(record.result) ?? null,
    measured: run.mock ? null : { usage: record.result.usage, latencyMs: record.latencyMs },
    evalsHref: page.evalsHref,
  };
}

/** What the headline section says; a null line is not shown. */
export type HeadlineText = {
  headline: string;
  interval: string | null;
  passed: string | null;
  /** The interval's method, for Run details. */
  method: string | null;
};

/**
 * A real run's rate, interval, passed count and method, or a mock run's one statement that it
 * measures nothing, with its pass count and no rate, so no crop of the page reads as a
 * measurement. A Wilson interval is labelled next to its numbers, since the page's reader
 * expects the bootstrap. Pure.
 */
export function evalsHeadline(view: EvalsViewData, t: ShellMessages, locale: Locale): HeadlineText {
  const { cases, passed, measured } = view;
  if (measured === null) {
    return {
      headline: format(t.evals.mockHeadline, { passed, cases }),
      interval: null,
      passed: null,
      method: null,
    };
  }
  const { rate, level, low, high, total } = measured.headline;
  const { interval } = measured;
  return {
    headline: format(measured.sentence[locale], {
      rate,
      cases,
      passed: measured.headline.passed,
      total,
    }),
    interval: format(interval.method === "wilson" ? t.evals.intervalWilson : t.evals.interval, {
      level,
      low,
      high,
    }),
    passed: format(t.evals.passed, { passed, cases }),
    method:
      interval.method === "wilson"
        ? t.evals.methodWilson
        : format(t.evals.methodValue, { resamples: interval.resamples, seed: interval.seed }),
  };
}

/** A supporting number in the interface language. Pure. */
export function supportingText(value: SupportingValue, t: ShellMessages, locale: Locale): string {
  switch (value.kind) {
    case "count":
      return value.n === null ? t.trace.notReported : formatNumber(value.n, locale);
    case "seconds":
      return format(t.trace.seconds, { n: formatSeconds(value.ms, locale) });
    case "share":
      return format(t.evals.ofTotal, {
        n: formatNumber(value.n, locale),
        total: formatNumber(value.total, locale),
      });
  }
}
