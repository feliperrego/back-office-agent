import { describe, expect, it } from "vitest";
import type { Localized } from "@/lib/i18n/localized";
import { shellMessages } from "@/lib/i18n/shell-messages";
import { REPO_URL } from "@/lib/project";
import type { ToolView } from "@/lib/trace/tool-view";
import type { CaseRecord, EvalRun, TracedResult } from "./record";
import { headlineNumbers, summarizeResults } from "./summary";
import {
  caseView,
  type EvalsPage,
  evalsHeadline,
  evalsView,
  runLabel,
  supportingText,
} from "./view";

// What the Evals page and a case's page show (template spec §5.12), read from a run's file. The
// template only ever holds a mock run, so this test is the only place a real run's page is built
// (template spec §7.2). A mock run shows the pass counts and no measured number: no rate,
// interval, latency or token count. The runs and the project's words here are fixtures, never
// the sample's.

type Result = TracedResult & { message: string; reply: string };

const L = (en: string, pt: string): Localized => ({ en, "pt-BR": pt });

const PAGE: EvalsPage<Result> = {
  headline: L(
    "{rate}% of {cases} fixture cases passed",
    "{rate}% de {cases} casos de teste passaram",
  ),
  about: L("Asked once each, scored by script.", "Cada um perguntado uma vez."),
  groupLabel: (group) => L(`Group ${group}`, `Grupo ${group}`),
  checkLabel: (id) => L(`Check ${id}`, `Verificação ${id}`),
  evalsHref: "/evals",
  caseHref: (id) => `/evals/${id}`,
  exchange: ({ message, reply }) => ({ question: message, answer: reply }),
  supporting: () => [
    { label: L("Quotes kept", "Citações"), value: { kind: "share", n: 2, total: 3 } },
  ],
};

const CALL: ToolView = {
  id: "call-1",
  name: "lookUpThing",
  input: { id: "X1" },
  output: { found: true },
  state: "done",
};

function record(
  id: string,
  group: string,
  pass: boolean,
  fields: Partial<CaseRecord<Result>> = {},
) {
  const base: CaseRecord<Result> = {
    id,
    group,
    askedAt: "2026-10-05T14:00:00.000Z",
    pass,
    tally: { passed: pass ? 1 : 0, total: 1 },
    checks: [
      { id: "first", ok: true },
      pass ? { id: "second", ok: true } : { id: "second", ok: false, detail: ["missing phrase"] },
    ],
    result: {
      message: `Question ${id}?`,
      reply: `Answer ${id}.`,
      toolCalls: [],
      usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 },
    },
    latencyMs: 2400,
  };
  return { ...base, ...fields };
}

const RESULTS: CaseRecord<Result>[] = [
  record("c01", "alpha", true, {
    result: {
      message: "Question c01?",
      reply: "Answer c01.",
      toolCalls: [CALL],
      usage: { inputTokens: 2000, outputTokens: 100, totalTokens: 2100 },
    },
    latencyMs: 3100,
  }),
  record("c02", "alpha", false, { latencyMs: 1700 }),
  record("c03", "beta", true, {
    result: { message: "Question c03?", reply: "Answer c03.", toolCalls: [], usage: null },
    latencyMs: 900,
  }),
];

function run(mock: boolean): EvalRun<Result> {
  return {
    date: "2026-10-05T14:00:00.000Z",
    aborted: false,
    abortReason: null,
    mock,
    model: mock ? "mock" : "provider/model-a",
    commit: mock ? null : { sha: "0123456789abcdef0123456789abcdef01234567", dirty: true },
    caseSet: {
      path: "measurements/cases.json",
      sha256: "c".repeat(64),
      frozenOn: "2026-10-01",
      n: 3,
    },
    results: RESULTS,
    summary: summarizeResults(RESULTS),
  };
}

const MOCK = { file: "measurements/eval-mock.json", run: run(true) };
const REAL = { file: "measurements/eval-2026-10-05.json", run: run(false) };
const EN = shellMessages.en;
const PT = shellMessages["pt-BR"];

describe("runLabel", () => {
  it("gives the date, model and short commit the screens label a run with", () => {
    expect(runLabel(REAL.run)).toEqual({
      date: "2026-10-05T14:00:00.000Z",
      model: "provider/model-a",
      commit: "0123456",
      dirty: true,
      mock: false,
    });
  });

  it("gives a mock run no commit, since it records none", () => {
    expect(runLabel(MOCK.run)).toEqual({
      date: "2026-10-05T14:00:00.000Z",
      model: "mock",
      commit: null,
      dirty: false,
      mock: true,
    });
  });
});

describe("evalsView of a mock run", () => {
  const view = evalsView(MOCK, PAGE);

  it("holds the pass counts, by run and by group, with the project's labels", () => {
    expect(view).toMatchObject({ run: runLabel(MOCK.run), cases: 3, passed: 2 });
    expect(view.groups).toEqual([
      { id: "alpha", label: L("Group alpha", "Grupo alpha"), cases: 2, passed: 1 },
      { id: "beta", label: L("Group beta", "Grupo beta"), cases: 1, passed: 1 },
    ]);
  });

  it("measures nothing: no rate, interval, method, supporting number, latency or tokens", () => {
    expect(view.measured).toBeNull();
    expect(view.rows.map(({ measured }) => measured)).toEqual([null, null, null]);
    const shown = JSON.stringify(view);
    for (const value of ["3100", "2100", "1280", "latency", "Tokens"]) {
      expect(shown, value).not.toContain(value);
    }
  });

  it("has one row per case, in the set's order, linking to the case's page", () => {
    expect(view.rows).toEqual([
      {
        id: "c01",
        href: "/evals/c01",
        group: L("Group alpha", "Grupo alpha"),
        pass: true,
        measured: null,
      },
      {
        id: "c02",
        href: "/evals/c02",
        group: L("Group alpha", "Grupo alpha"),
        pass: false,
        measured: null,
      },
      {
        id: "c03",
        href: "/evals/c03",
        group: L("Group beta", "Grupo beta"),
        pass: true,
        measured: null,
      },
    ]);
  });

  it("gives the run's details: the case set, its hash and the raw data in the repo", () => {
    expect(view.about).toEqual(PAGE.about);
    expect(view.details).toEqual({
      caseSet: { n: 3, frozenOn: "2026-10-01", sha256: "c".repeat(64) },
      file: "measurements/eval-mock.json",
      rawDataHref: `${REPO_URL}/blob/main/measurements/eval-mock.json`,
    });
  });

  it("says it is a mock run with its pass count, and no rate", () => {
    expect(evalsHeadline(view, EN, "en")).toEqual({
      headline: "Mock run: 2 of 3 mock answers passed the grader. No measurement yet.",
      interval: null,
      passed: null,
      method: null,
    });
    expect(evalsHeadline(view, PT, "pt-BR").headline).toBe(
      "Rodada simulada: 2 de 3 respostas simuladas passaram no avaliador. Ainda sem medição.",
    );
    expect(evalsHeadline(view, EN, "en").headline).not.toContain("%");
  });
});

describe("evalsView of a real run", () => {
  const view = evalsView(REAL, PAGE);
  const { summary } = REAL.run;

  it("takes the headline's numbers and method from the run's summary, never from elsewhere", () => {
    expect(summary!.interval.method).toBe("bootstrap");
    expect(view.measured).toMatchObject({
      headline: headlineNumbers(summary!),
      sentence: PAGE.headline,
      interval: { method: "bootstrap", resamples: 1000, seed: 20260928 },
    });
  });

  it("gives the headline sentence, its interval, the passed line and the method", () => {
    const { rate, level, low, high } = headlineNumbers(summary!);
    expect(evalsHeadline(view, EN, "en")).toEqual({
      headline: `${rate}% of 3 fixture cases passed`,
      interval: `${level}% CI ${low}–${high}%`,
      passed: "2 of 3 cases passed",
      method: "Percentile bootstrap over cases: 1000 resamples, seed 20260928",
    });
    expect(evalsHeadline(view, PT, "pt-BR")).toEqual({
      headline: `${rate}% de 3 casos de teste passaram`,
      interval: `IC de ${level}%: ${low}–${high}%`,
      passed: "2 de 3 casos passaram",
      method: "Bootstrap de percentis sobre os casos: 1000 reamostragens, semente 20260928",
    });
  });

  it("gives the shell's supporting numbers, then the project's", () => {
    const rows = view.measured!.supporting;
    expect(rows.map(({ label }) => label.en)).toEqual([
      "Median latency",
      "Slowest case",
      "Median tokens per case",
      "Tokens over the run",
      "Quotes kept",
    ]);
    expect(rows.map(({ value }) => value)).toEqual([
      { kind: "seconds", ms: summary!.latency.medianMs },
      { kind: "seconds", ms: 3100 },
      { kind: "count", n: summary!.tokens.medianPerCase },
      { kind: "count", n: 3380 },
      { kind: "share", n: 2, total: 3 },
    ]);
  });

  it("gives each row its latency and its tokens, null where none was reported", () => {
    expect(view.rows.map(({ measured }) => measured)).toEqual([
      { latencyMs: 3100, totalTokens: 2100 },
      { latencyMs: 1700, totalTokens: 1280 },
      { latencyMs: 900, totalTokens: null },
    ]);
  });

  it("refuses a run with no summary, which no screen shows", () => {
    expect(() => evalsView({ ...REAL, run: { ...REAL.run, summary: null } }, PAGE)).toThrow(
      /no summary/,
    );
  });
});

describe("evalsView of a real run where every case passed", () => {
  // The bootstrap of 3 of 3 has no spread, so the run's interval is Wilson's, 3 / (3 + z²) to 1.
  const allPassed = RESULTS.map((each) => ({
    ...each,
    pass: true,
    tally: { passed: 1, total: 1 },
  }));
  const view = evalsView(
    { ...REAL, run: { ...REAL.run, results: allPassed, summary: summarizeResults(allPassed) } },
    PAGE,
  );

  it("names the Wilson score interval next to its numbers and in the run's details", () => {
    expect(view.measured).toMatchObject({
      headline: { rate: 100, low: 44, high: 100 },
      interval: { method: "wilson" },
    });
    expect(evalsHeadline(view, EN, "en")).toMatchObject({
      interval: "95% CI 44–100% (Wilson score)",
      method:
        "Wilson score interval over cases: every case scored the same, so the bootstrap's " +
        "resamples did not vary",
    });
    expect(evalsHeadline(view, PT, "pt-BR")).toMatchObject({
      interval: "IC de 95%: 44–100% (escore de Wilson)",
      method:
        "Intervalo de escore de Wilson sobre os casos: todos os casos tiveram o mesmo " +
        "resultado, então as reamostragens do bootstrap não variaram",
    });
  });
});

describe("supportingText", () => {
  it("writes each kind of number in the interface language", () => {
    expect(supportingText({ kind: "seconds", ms: 2400 }, EN, "en")).toBe("2.4 s");
    expect(supportingText({ kind: "seconds", ms: 2400 }, PT, "pt-BR")).toBe("2,4 s");
    expect(supportingText({ kind: "count", n: 12345 }, EN, "en")).toBe("12,345");
    expect(supportingText({ kind: "count", n: 12345 }, PT, "pt-BR")).toBe("12.345");
    expect(supportingText({ kind: "count", n: null }, EN, "en")).toBe("not reported");
    expect(supportingText({ kind: "share", n: 2, total: 3 }, EN, "en")).toBe("2 of 3");
    expect(supportingText({ kind: "share", n: 2, total: 3 }, PT, "pt-BR")).toBe("2 de 3");
  });
});

describe("caseView", () => {
  it("gives a mock case's trace with no tokens or latency, which it never measured", () => {
    const view = caseView(MOCK, "c01", PAGE);
    expect(view).toEqual({
      run: runLabel(MOCK.run),
      id: "c01",
      group: L("Group alpha", "Grupo alpha"),
      pass: true,
      checks: RESULTS[0].checks,
      checkLabels: {
        first: L("Check first", "Verificação first"),
        second: L("Check second", "Verificação second"),
      },
      toolCalls: [CALL],
      exchange: { question: "Question c01?", answer: "Answer c01." },
      measured: null,
      evalsHref: "/evals",
    });
  });

  it("gives a real case its tokens and latency, and a failed check its data", () => {
    expect(caseView(REAL, "c01", PAGE)?.measured).toEqual({
      usage: { inputTokens: 2000, outputTokens: 100, totalTokens: 2100 },
      latencyMs: 3100,
    });
    expect(caseView(REAL, "c02", PAGE)?.checks[1]).toEqual({
      id: "second",
      ok: false,
      detail: ["missing phrase"],
    });
  });

  it("gives no page for an id the run does not hold", () => {
    expect(caseView(MOCK, "c99", PAGE)).toBeNull();
  });

  it("shows no exchange for a project that names none", () => {
    expect(caseView(MOCK, "c01", { ...PAGE, exchange: undefined })?.exchange).toBeNull();
  });
});
