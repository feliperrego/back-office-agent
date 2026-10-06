import {
  type LanguageModel,
  simulateReadableStream,
  streamText,
  tool,
  toUIMessageStream,
  type UIMessageChunk,
  isStepCount,
  jsonSchema,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import {
  buildErrorStreamParts,
  buildStreamParts,
  buildToolCallParts,
  type MockStreamPart,
} from "@/lib/ai/mock";
import { toolViewsOf } from "@/lib/trace/tool-view";
import type { CaseOutcome, EvalCase, Score, TracedResult } from "./record";
import { collectUIMessage, runEval } from "./run";

// The eval's runner (template spec §5.11): every frozen case once, in order, scored by the
// project's script, stopping at the first case that cannot be scored; and the helper that turns a
// chat pipeline's stream into the finished answer, as the chat holds it.

type Case = EvalCase & { message: string };
type Result = TracedResult & { reply: string };

const CASES: Case[] = [
  { id: "c01", group: "lookup", message: "One?" },
  { id: "c02", group: "general", message: "Two?" },
  { id: "c03", group: "general", message: "Three?" },
];

const MODEL = "provider/model-a";

function answered(reply: string): CaseOutcome<Result> {
  return { result: { reply, toolCalls: [], usage: null } };
}

function score(evalCase: Case, result: Result): Score {
  const pass = result.reply.includes(evalCase.message);
  return {
    pass,
    tally: { passed: pass ? 1 : 0, total: 1 },
    checks: [{ id: "echo", ok: pass }],
  };
}

/** A clock that moves 7 ms for every reading, from a start time. */
function fakeClock() {
  let ms = 0;
  return {
    now: () => (ms += 7),
    date: () => new Date(Date.UTC(2026, 9, 5, 14, 0, 0, ms)),
  };
}

describe("runEval", () => {
  it("runs every case once, in order, and records its answer, score, time and latency", async () => {
    const runCase = vi.fn(async (evalCase: Case) => answered(`Echo: ${evalCase.message}`));
    const seen: string[] = [];

    const { results, abortReason } = await runEval({
      cases: CASES,
      model: MODEL,
      runCase,
      score,
      onResult: (record) => seen.push(record.id),
      ...fakeClock(),
    });

    expect(abortReason).toBeNull();
    expect(runCase.mock.calls).toEqual(CASES.map((evalCase) => [evalCase, { model: MODEL }]));
    expect(seen).toEqual(["c01", "c02", "c03"]);
    expect(results[0]).toEqual({
      id: "c01",
      group: "lookup",
      askedAt: "2026-10-05T14:00:00.000Z",
      pass: true,
      tally: { passed: 1, total: 1 },
      checks: [{ id: "echo", ok: true }],
      result: { reply: "Echo: One?", toolCalls: [], usage: null },
      latencyMs: 7,
    });
    expect(results.map(({ group }) => group)).toEqual(["lookup", "general", "general"]);
  });

  it("records the label the scorer gives, once", async () => {
    const { results } = await runEval({
      cases: CASES.slice(0, 1),
      model: MODEL,
      runCase: async () => answered("One?"),
      score: (evalCase, result) => ({
        ...score(evalCase, result),
        label: "answered",
      }),
    });
    expect(results[0]).toMatchObject({ pass: true, label: "answered" });
  });

  it("stops at the first case that cannot be scored, and says which and why", async () => {
    const runCase = vi.fn(async (evalCase: Case) =>
      evalCase.id === "c02" ? { abortReason: "the answer failed: Gateway said no" } : answered(""),
    );

    const stopped = await runEval({
      cases: CASES,
      model: MODEL,
      runCase,
      score,
    });

    expect(stopped.results.map(({ id }) => id)).toEqual(["c01"]);
    expect(stopped.abortReason).toBe("c02: the answer failed: Gateway said no");
    expect(runCase).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["no unit", { passed: 0, total: 0 }],
    ["more passed than total", { passed: 2, total: 1 }],
    ["a negative count", { passed: -1, total: 1 }],
    ["a fraction of a unit", { passed: 0.5, total: 1 }],
    ["a fractional total", { passed: 1, total: 1.5 }],
    ["a count that is not a number", { passed: Number.NaN, total: 1 }],
  ])(
    "stops right after a case whose tally has %s, before the next case is asked",
    async (_, tally) => {
      const runCase = vi.fn(async (evalCase: Case) => answered(evalCase.message));
      const stopped = await runEval({
        cases: CASES,
        model: MODEL,
        runCase,
        score: (evalCase, result) =>
          evalCase.id === "c02" ? { ...score(evalCase, result), tally } : score(evalCase, result),
      });

      expect(stopped.results.map(({ id }) => id)).toEqual(["c01"]);
      expect(stopped.abortReason).toBe(
        "c02: the score's tally must be whole units, 0 <= passed <= total and total >= 1; " +
          `got ${JSON.stringify(tally)}`,
      );
      expect(runCase).toHaveBeenCalledTimes(2);
    },
  );

  it("stops right after a case its scorer cannot score, and says which and why", async () => {
    const runCase = vi.fn(async (evalCase: Case) => answered(evalCase.message));
    const stopped = await runEval({
      cases: CASES,
      model: MODEL,
      runCase,
      score: (evalCase, result) => {
        if (evalCase.id === "c02") throw new Error("no citation to read");
        return score(evalCase, result);
      },
    });

    expect(stopped.results.map(({ id }) => id)).toEqual(["c01"]);
    expect(stopped.abortReason).toBe("c02: the score failed: no citation to read");
    expect(runCase).toHaveBeenCalledTimes(2);
  });

  it("lets a case that cannot be run at all throw, since that is a bug in the set", async () => {
    const runCase = vi.fn(async () => {
      throw new Error("c01 names no customer");
    });
    await expect(runEval({ cases: CASES, model: MODEL, runCase, score })).rejects.toThrow(
      "c01 names no customer",
    );
    expect(runCase).toHaveBeenCalledTimes(1);
  });
});

/** The UI message stream of one answer of `model`, as a chat route sends it. */
function answerStream(model: LanguageModel): ReadableStream<UIMessageChunk> {
  const tools = {
    lookUp: tool({
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      }),
      execute: async ({ id }) => ({ id, found: true }),
    }),
  };
  const result = streamText({
    model,
    messages: [{ role: "user", content: "Hello?" }],
    tools,
    stopWhen: isStepCount(3),
    onError: () => {},
  });
  return toUIMessageStream({
    stream: result.stream,
    tools,
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
}

/** A model whose calls stream these steps, one per call. */
function stepsModel(...steps: MockStreamPart[][]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: steps[call++] }),
    }),
  });
}

function chunkStream(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return simulateReadableStream({
    chunks,
    initialDelayInMs: null,
    chunkDelayInMs: null,
  });
}

describe("collectUIMessage", () => {
  it("gives the finished answer, as the chat holds it, and why it finished", async () => {
    const outcome = await collectUIMessage(
      answerStream(stepsModel(buildStreamParts(["Hello ", "there."]))),
    );
    expect(outcome).toMatchObject({
      finishReason: "stop",
      message: {
        role: "assistant",
        parts: expect.arrayContaining([{ type: "text", text: "Hello there.", state: "done" }]),
      },
    });
  });

  it("keeps the answer's tool calls, which the trace reads", async () => {
    const outcome = await collectUIMessage(
      answerStream(
        stepsModel(
          buildToolCallParts("call-1", "lookUp", { id: "A1" }),
          buildStreamParts(["Done."]),
        ),
      ),
    );
    if (!("message" in outcome)) throw new Error(outcome.abortReason);
    expect(toolViewsOf(outcome.message)).toEqual([
      {
        id: "call-1",
        name: "lookUp",
        input: { id: "A1" },
        output: { id: "A1", found: true },
        state: "done",
      },
    ]);
  });

  it("stops on a failed answer, with the stream's error text", async () => {
    const outcome = await collectUIMessage(
      answerStream(stepsModel(buildErrorStreamParts(["Hi "]))),
    );
    expect(outcome).toEqual({
      abortReason: "the answer failed: Mock model failure ([[error]] scenario)",
    });
  });

  it("stops on an aborted answer, and on one whose stream never finished", async () => {
    expect(await collectUIMessage(chunkStream([{ type: "start" }, { type: "abort" }]))).toEqual({
      abortReason: "the answer was aborted",
    });
    expect(
      await collectUIMessage(
        chunkStream([
          { type: "start" },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Hi" },
        ]),
      ),
    ).toEqual({ abortReason: "the answer has no finish chunk" });
  });
});
