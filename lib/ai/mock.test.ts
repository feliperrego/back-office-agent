import { isStepCount, jsonSchema, streamText, tool } from "ai";
import type { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOCK_SCENARIO_TIMING,
  buildErrorStreamParts,
  buildStreamParts,
  buildToolCallParts,
  createMockModel,
  createScenarioMockModel,
  stepStreamParts,
  toWordChunks,
  type MockStreamPart,
} from "./mock";
import { MOCK_SCENARIOS } from "./mock-scenarios";
import {
  DEFAULT_MOCK_TEXT,
  ERROR_CHUNKS,
  MOCK_ERROR_MESSAGE,
  SLOW_CHUNKS,
  mockStep,
  resetMockScenarios,
  type MockPrompt,
  type MockScenarios,
} from "./mock-steps";

// The mock model (template spec §5.2). Its scenario tests pass their own scenarios, never the
// project's (lib/ai/mock-scenarios.ts), so they hold whatever cues and answers a project writes.

describe("toWordChunks", () => {
  it("splits into one word plus its trailing whitespace per chunk", () => {
    expect(toWordChunks("Hello  big world")).toEqual(["Hello  ", "big ", "world"]);
  });

  it("returns no chunks for empty or whitespace-only text", () => {
    expect(toWordChunks("")).toEqual([]);
    expect(toWordChunks("   ")).toEqual([]);
  });
});

/** A stream's finish part, narrowed so its reason and usage can be read. */
function finishOf(parts: MockStreamPart[]) {
  const finish = parts.at(-1);
  if (finish?.type !== "finish") throw new Error("The stream does not end with finish.");
  return finish;
}

describe("buildStreamParts", () => {
  it("wraps text deltas between text-start/text-end and ends with finish", () => {
    const parts = buildStreamParts(["a ", "b"]);
    expect(parts.map((p) => p.type)).toEqual([
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "finish",
    ]);
  });

  it("finishes with stop, one output token per chunk and no input tokens", () => {
    const finish = finishOf(buildStreamParts(["a ", "b ", "c"]));
    expect(finish.finishReason.unified).toBe("stop");
    expect(finish.usage.outputTokens.total).toBe(3);
    expect(finish.usage.inputTokens.total).toBe(0);
  });
});

describe("buildToolCallParts", () => {
  it("is one tool call, its input as JSON text, then a tool-calls finish", () => {
    const parts = buildToolCallParts("call-1", "someTool", { id: "x", n: 2 });
    expect(parts.map((p) => p.type)).toEqual(["tool-call", "finish"]);
    expect(parts[0]).toEqual({
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "someTool",
      input: '{"id":"x","n":2}',
    });
    expect(finishOf(parts).finishReason.unified).toBe("tool-calls");
  });
});

describe("stepStreamParts", () => {
  it("streams a text step word by word", () => {
    expect(stepStreamParts({ kind: "text", text: "One two" })).toEqual(
      buildStreamParts(["One ", "two"]),
    );
  });

  it("streams a tool-call step as its tool call", () => {
    const step = { kind: "tool-call", toolCallId: "c", toolName: "t", input: { a: 1 } } as const;
    expect(stepStreamParts(step)).toEqual(buildToolCallParts("c", "t", { a: 1 }));
  });

  it("streams the slow lines and the failure of the shell's two scenarios", () => {
    expect(stepStreamParts({ kind: "slow" })).toEqual(buildStreamParts(SLOW_CHUNKS));
    expect(stepStreamParts({ kind: "error" })).toEqual(buildErrorStreamParts(ERROR_CHUNKS));
  });
});

describe("createMockModel", () => {
  it("streams the default ~120-word paragraph", async () => {
    const model = createMockModel({ initialDelayInMs: 0, chunkDelayInMs: 0 });
    const result = streamText({ model, prompt: "hi", maxOutputTokens: 100 });
    expect(await result.text).toBe(DEFAULT_MOCK_TEXT);
    expect(toWordChunks(DEFAULT_MOCK_TEXT).length).toBeGreaterThanOrEqual(100);
  });

  it("streams custom chunks in order", async () => {
    const model = createMockModel({
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
      chunks: ["one ", "two ", "three"],
    });
    const parts: string[] = [];
    const result = streamText({ model, prompt: "hi", maxOutputTokens: 100 });
    for await (const part of result.textStream) parts.push(part);
    expect(parts.join("")).toBe("one two three");
  });

  it("waits initialDelayInMs before the first text", async () => {
    const model = createMockModel({
      initialDelayInMs: 80,
      chunkDelayInMs: 0,
      chunks: ["x"],
    });
    const started = performance.now();
    const result = streamText({ model, prompt: "hi", maxOutputTokens: 100 });
    for await (const part of result.textStream) {
      expect(part).toBe("x");
      break;
    }
    expect(performance.now() - started).toBeGreaterThanOrEqual(75);
  });

  it("serves a fresh stream on every call and records call options", async () => {
    const model = createMockModel({ initialDelayInMs: 0, chunkDelayInMs: 0, chunks: ["ok"] });
    const controller = new AbortController();
    const first = streamText({
      model,
      prompt: "a",
      maxOutputTokens: 123,
      abortSignal: controller.signal,
    });
    const second = streamText({ model, prompt: "b", maxOutputTokens: 100 });
    expect(await first.text).toBe("ok");
    expect(await second.text).toBe("ok");
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[0].maxOutputTokens).toBe(123);
    expect(model.doStreamCalls[0].abortSignal).toBe(controller.signal);
  });
});

// Scenario tests. The set of [[error]] texts already seen is module state, so every test starts
// from a clean one.
const FAST = { initialDelayInMs: 0, chunkDelayInMs: 0 };

/** This file's scenarios: "use the tool" calls fixtureTool, anything else gets a fixed text. */
const FIXTURE: MockScenarios = {
  firstStep: ({ message, toolCallId }) =>
    message.includes("use the tool")
      ? { kind: "tool-call", toolCallId, toolName: "fixtureTool", input: { q: message } }
      : { kind: "text", text: "The fixture answers." },
  afterTool: ({ toolName, value }) =>
    toolName === "fixtureTool"
      ? { kind: "text", text: `The tool said ${JSON.stringify(value)}.` }
      : undefined,
};

/** Streams one user message through streamText and collects text and error parts. */
async function streamOnce(model: MockLanguageModelV4, text: string) {
  const result = streamText({
    model,
    messages: [{ role: "user", content: text }],
    maxOutputTokens: 100,
  });
  const deltas: string[] = [];
  const errors: unknown[] = [];
  for await (const part of result.stream) {
    if (part.type === "text-delta") deltas.push(part.text);
    if (part.type === "error") errors.push(part.error);
  }
  return { text: deltas.join(""), deltas, errors };
}

/** Every part one doStream call streams, read straight from the model. */
async function doStreamParts(model: MockLanguageModelV4, prompt: MockPrompt) {
  const reader = (await model.doStream({ prompt })).stream.getReader();
  const parts: MockStreamPart[] = [];
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    parts.push(read.value);
  }
  return parts;
}

describe("mock scenarios", () => {
  beforeEach(() => {
    resetMockScenarios();
    // streamText logs model stream errors with console.error by default.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("scenario data", () => {
    it("waits 600 ms before the first chunk and 30 ms between chunks (template spec §5.2)", () => {
      expect(MOCK_SCENARIO_TIMING).toEqual({ initialDelayInMs: 600, chunkDelayInMs: 30 });
    });

    it("[[slow]] has 300 short lines, each ending in a newline", () => {
      expect(SLOW_CHUNKS).toHaveLength(300);
      for (const chunk of SLOW_CHUNKS) expect(chunk).toMatch(/^[^\n]+\n$/);
    });

    it("[[error]] streams 3 words, then an error part and nothing else", () => {
      expect(ERROR_CHUNKS).toHaveLength(3);
      const parts = buildErrorStreamParts(ERROR_CHUNKS);
      expect(parts.map((p) => p.type)).toEqual([
        "text-start",
        "text-delta",
        "text-delta",
        "text-delta",
        "error",
      ]);
    });
  });

  describe("createScenarioMockModel", () => {
    it("streams the scenarios' answer to a message the shell does not claim", async () => {
      const run = await streamOnce(createScenarioMockModel(FAST, FIXTURE), "Tell me something");
      expect(run.text).toBe("The fixture answers.");
      expect(run.errors).toEqual([]);
    });

    it("streams the slow lines for [[slow]]", async () => {
      const run = await streamOnce(createScenarioMockModel(FAST, FIXTURE), "[[slow]]");
      expect(run.deltas).toEqual(SLOW_CHUNKS);
      expect(run.text.split("\n")).toHaveLength(301);
    });

    it("fails after 3 words for [[error]], then answers as the scenarios do on retry", async () => {
      const model = createScenarioMockModel(FAST, FIXTURE);

      const first = await streamOnce(model, "[[error]] retry me");
      expect(first.deltas).toEqual(ERROR_CHUNKS);
      expect(first.errors).toHaveLength(1);
      expect((first.errors[0] as Error).message).toBe(MOCK_ERROR_MESSAGE);

      const retry = await streamOnce(model, "[[error]] retry me");
      expect(retry.text).toBe("The fixture answers.");
      expect(retry.errors).toEqual([]);
      expect(model.doStreamCalls).toHaveLength(2);
    });

    it("calls a tool, and answers from its result in the next step", async () => {
      const model = createScenarioMockModel(FAST, FIXTURE);
      const execute = vi.fn<(input: { q: string }) => Promise<{ found: number }>>(async () => ({
        found: 3,
      }));
      const result = streamText({
        model,
        messages: [{ role: "user", content: "please use the tool" }],
        tools: {
          fixtureTool: tool({
            inputSchema: jsonSchema<{ q: string }>({
              type: "object",
              properties: { q: { type: "string" } },
              required: ["q"],
            }),
            execute,
          }),
        },
        stopWhen: isStepCount(2),
        maxOutputTokens: 100,
      });

      expect(await result.text).toBe('The tool said {"found":3}.');
      expect(model.doStreamCalls).toHaveLength(2);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0][0]).toEqual({ q: "please use the tool" });
      const [call, answer] = await result.steps;
      expect(call.toolCalls.map(({ toolCallId, toolName }) => [toolCallId, toolName])).toEqual([
        ["mock-call-1", "fixtureTool"],
      ]);
      expect(call.finishReason).toBe("tool-calls");
      expect(answer.finishReason).toBe("stop");
    });

    it("without scenarios, takes each step from the project's MOCK_SCENARIOS", async () => {
      const prompt: MockPrompt = [{ role: "user", content: [{ type: "text", text: "Hello" }] }];
      const parts = await doStreamParts(createScenarioMockModel(FAST), prompt);
      expect(parts).toEqual(stepStreamParts(mockStep(prompt, MOCK_SCENARIOS)));
    });
  });

  describe("createMockModel", () => {
    it("without options picks scenarios with the real 600 ms first-chunk delay", async () => {
      const model = createMockModel();
      const started = performance.now();
      const result = streamText({
        model,
        messages: [{ role: "user", content: "[[error]] real timing" }],
        maxOutputTokens: 100,
      });
      let firstTextAfterMs: number | undefined;
      const types: string[] = [];
      for await (const part of result.stream) {
        if (part.type === "text-delta" && firstTextAfterMs === undefined) {
          firstTextAfterMs = performance.now() - started;
        }
        types.push(part.type);
      }
      expect(firstTextAfterMs).toBeGreaterThanOrEqual(595);
      expect(types).toContain("error");
    });

    it("with options streams fixed chunks and ignores triggers", async () => {
      const fixed = createMockModel({ ...FAST, chunks: ["fixed"] });
      const run = await streamOnce(fixed, "[[error]] fixed");
      expect(run.text).toBe("fixed");
      expect(run.errors).toEqual([]);

      // The fixed model did not consume the prompt: the scenario model still fails on it.
      const scenario = await streamOnce(createScenarioMockModel(FAST, FIXTURE), "[[error]] fixed");
      expect(scenario.errors).toHaveLength(1);
    });
  });
});
