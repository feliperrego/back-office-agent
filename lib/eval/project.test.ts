import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStreamParts, buildToolCallParts, createScenarioMockModel } from "@/lib/ai/mock";
import { itemIdOf } from "@/lib/ai/mock-scenarios";
import { DEFAULT_MOCK_TEXT, resetMockScenarios } from "@/lib/ai/mock-steps";
import { format } from "@/lib/i18n/format";
import { LOCALES } from "@/lib/i18n/locale";
import { SAMPLE_ITEMS, SAMPLE_TOOL_NAME, TOOLS } from "@/lib/tools";
import { readCaseSet } from "./cases";
import { CHECK_IDS, EVAL_PROJECT, EVALS_PAGE, type SampleCase, type SampleResult } from "./project";
import { readShownRun } from "./runs";
import { caseView, evalsView } from "./view";

// The template's eval sample (template spec §5.11): three frozen cases, one through the sample
// tool, so the trace shows a tool call. Project-owned, like the file it tests: a project that
// replaces its cases and its scorer replaces these tests.

const FAST = { initialDelayInMs: 0, chunkDelayInMs: 0 };
const { cases } = readCaseSet<SampleCase>();

function lookupCase(): SampleCase {
  return cases.find(({ expected }) => expected.tools.length > 0)!;
}

function result(overrides: Partial<SampleResult> = {}): SampleResult {
  return {
    message: "Is item ITM-0108 available to borrow?",
    reply: "Item ITM-0108 (Walnut bookshelf) is On Loan.",
    toolCalls: [
      {
        id: "call-1",
        name: SAMPLE_TOOL_NAME,
        input: { itemId: "ITM-0108" },
        output: { found: true, item: SAMPLE_ITEMS[1] },
        state: "done",
      },
    ],
    usage: { inputTokens: 0, outputTokens: 9, totalTokens: 9 },
    finishReason: "stop",
    ...overrides,
  };
}

beforeEach(() => {
  resetMockScenarios();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the sample cases", () => {
  it("are three, numbered c01 to c03, one of them through the sample tool", () => {
    expect(cases.map(({ id }) => id)).toEqual(["c01", "c02", "c03"]);
    expect(cases.filter(({ expected }) => expected.tools.length > 0)).toHaveLength(1);
    for (const { expected } of cases) {
      for (const name of expected.tools) expect(Object.keys(TOOLS)).toContain(name);
      expect(expected.replyMentions.length).toBeGreaterThan(0);
    }
  });

  it("ask about an item the tool knows, expecting its status, or name no item at all", () => {
    const { message, expected } = lookupCase();
    const item = SAMPLE_ITEMS.find(({ id }) => id === itemIdOf(message));
    expect(item).toBeDefined();
    expect(expected).toEqual({ tools: [SAMPLE_TOOL_NAME], replyMentions: [item!.status] });
    // The mock calls the tool for a message that names an item id, and only then.
    for (const other of cases.filter((each) => each !== lookupCase())) {
      expect(itemIdOf(other.message), other.id).toBeNull();
    }
  });

  it("never hold their expected phrase in the question, so the reply must bring it", () => {
    for (const { id, message, expected } of cases) {
      for (const phrase of expected.replyMentions) {
        expect(message.toLowerCase(), id).not.toContain(phrase.toLowerCase());
      }
    }
  });
});

describe("score", () => {
  it("passes an answer that calls the expected tools and mentions every expected phrase, in any case", () => {
    expect(EVAL_PROJECT.score(lookupCase(), result())).toEqual({
      pass: true,
      tally: { passed: 1, total: 1 },
      checks: [
        { id: "tool-calls", ok: true },
        { id: "reply-mentions", ok: true },
      ],
    });
  });

  it("fails a check with its data: the tools called, the phrases missing", () => {
    const score = EVAL_PROJECT.score(
      lookupCase(),
      result({
        reply: "I can't tell.",
        toolCalls: [{ ...result().toolCalls[0], name: "otherTool" }],
      }),
    );
    expect(score).toEqual({
      pass: false,
      tally: { passed: 0, total: 1 },
      checks: [
        { id: "tool-calls", ok: false, detail: ["otherTool"] },
        { id: "reply-mentions", ok: false, detail: ["on loan"] },
      ],
    });
  });

  it("fails an answer that calls no tool where one was expected, and one that calls a tool unasked", () => {
    const [noTool] = EVAL_PROJECT.score(lookupCase(), result({ toolCalls: [] })).checks;
    expect(noTool).toEqual({ id: "tool-calls", ok: false });
    const general = cases.find(({ expected }) => expected.tools.length === 0)!;
    const [unasked] = EVAL_PROJECT.score(general, result()).checks;
    expect(unasked).toEqual({ id: "tool-calls", ok: false, detail: [SAMPLE_TOOL_NAME] });
  });

  it("names only the checks the screens label", () => {
    for (const evalCase of cases) {
      const { checks } = EVAL_PROJECT.score(evalCase, result());
      expect(checks.map(({ id }) => id)).toEqual([...CHECK_IDS]);
    }
  });
});

describe("runCase with the mock model", () => {
  it("records the lookup case's tool call, the answer from its result, and its tokens", async () => {
    const outcome = await EVAL_PROJECT.runCase(lookupCase(), {
      model: createScenarioMockModel(FAST),
    });
    expect(outcome).toEqual({
      result: {
        message: lookupCase().message,
        reply: "Item ITM-0108 (Walnut bookshelf) is on loan.",
        toolCalls: [
          {
            id: "mock-call-1",
            name: SAMPLE_TOOL_NAME,
            input: { itemId: "ITM-0108" },
            output: { found: true, item: SAMPLE_ITEMS[1] },
            state: "done",
          },
        ],
        // One output token per chunk: one for the call, seven words for the answer.
        usage: { inputTokens: 0, outputTokens: 8, totalTokens: 8 },
        finishReason: "stop",
      },
    });
  });

  it("records a general case's answer with no tool call", async () => {
    const general = cases.find(({ expected }) => expected.tools.length === 0)!;
    const outcome = await EVAL_PROJECT.runCase(general, { model: createScenarioMockModel(FAST) });
    if ("abortReason" in outcome) throw new Error(outcome.abortReason);
    expect(outcome.result).toMatchObject({ reply: DEFAULT_MOCK_TEXT, toolCalls: [] });
  });

  // A model that says what it will look up before the call: each step's text is its own part, and
  // the recorded reply reads them as the chat shows them (template spec §5.10).
  it("records the text of each step a blank line apart, as the chat shows it", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        calls += 1;
        const chunks =
          calls === 1
            ? [
                ...buildStreamParts(["I'll look that up."]).slice(0, -1),
                ...buildToolCallParts("call-1", SAMPLE_TOOL_NAME, { itemId: "ITM-0108" }),
              ]
            : buildStreamParts(["It is on loan."]);
        return { stream: simulateReadableStream({ chunks }) };
      },
    });
    const outcome = await EVAL_PROJECT.runCase(lookupCase(), { model });
    if ("abortReason" in outcome) throw new Error(outcome.abortReason);
    expect(outcome.result.reply).toBe("I'll look that up.\n\nIt is on loan.");
    expect(outcome.result.toolCalls.map(({ name }) => name)).toEqual([SAMPLE_TOOL_NAME]);
  });

  it("says why the run must stop when the answer fails", async () => {
    const failing = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("Gateway said no");
      },
    });
    expect(await EVAL_PROJECT.runCase(lookupCase(), { model: failing })).toEqual({
      abortReason: "the answer failed: Gateway said no",
    });
  });
});

describe("headline", () => {
  it("says what share of the frozen sample cases passed", () => {
    expect(
      EVAL_PROJECT.headline({
        rate: 67,
        low: 0,
        high: 100,
        level: 95,
        passed: 2,
        total: 3,
        cases: 3,
      }),
    ).toBe("67% of 3 frozen sample cases passed");
  });
});

// The sample's Evals pages (template spec §5.12): its words come from the project's dictionary,
// in both languages. The shown run is read by property, never by case id, so these tests hold
// when a real run replaces the mock one.
describe("the Evals pages", () => {
  const shown = readShownRun<SampleResult>();
  const NUMBERS = { rate: 67, low: 0, high: 100, level: 95, passed: 2, total: 3, cases: 3 };

  it.each(LOCALES)("label every group of the set and every check in %s", (locale) => {
    for (const { group } of cases) expect(EVALS_PAGE.groupLabel(group)[locale]).not.toBe("");
    for (const id of CHECK_IDS) expect(EVALS_PAGE.checkLabel(id)[locale]).not.toBe("");
    expect(() => evalsView(shown, EVALS_PAGE)).not.toThrow();
  });

  it("say README line 1's sentence in English, from the same words", () => {
    expect(format(EVALS_PAGE.headline.en, NUMBERS)).toBe(EVAL_PROJECT.headline(NUMBERS));
  });

  it("link each case to its own page, which shows its question and its recorded reply", () => {
    const { rows } = evalsView(shown, EVALS_PAGE);
    expect(rows.map(({ href }) => href)).toEqual(shown.run.results.map(({ id }) => `/evals/${id}`));
    for (const { id, result } of shown.run.results) {
      expect(caseView(shown, id, EVALS_PAGE)?.exchange).toEqual({
        question: result.message,
        answer: result.reply,
      });
    }
  });
});
