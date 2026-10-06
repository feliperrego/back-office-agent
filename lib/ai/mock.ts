import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { MOCK_SCENARIOS } from "./mock-scenarios";
import {
  DEFAULT_MOCK_TEXT,
  ERROR_CHUNKS,
  MOCK_ERROR_MESSAGE,
  SLOW_CHUNKS,
  mockStep,
  type MockScenarios,
  type MockStep,
} from "./mock-steps";

/**
 * The mock model (template spec §5.2). Shell-owned: how one step of the mock streams, and the
 * models that getModel() and tests use. What each step does comes from the step machine in
 * lib/ai/mock-steps.ts, with the project's cues and answers of lib/ai/mock-scenarios.ts.
 */

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;

/** One part of a V4 model stream (text-start, text-delta, text-end, tool-call, finish, error, ...). */
export type MockStreamPart =
  MockStreamResult["stream"] extends ReadableStream<infer T> ? T : never;

export type MockModelOptions = {
  initialDelayInMs?: number;
  chunkDelayInMs?: number;
  chunks?: string[];
};

export type MockTiming = { initialDelayInMs: number; chunkDelayInMs: number };

/** Timing of every scenario, as literals: the template mock's defaults (template spec §5.2). */
export const MOCK_SCENARIO_TIMING: MockTiming = { initialDelayInMs: 600, chunkDelayInMs: 30 };

/** Splits text into one word plus its trailing whitespace per chunk. */
export function toWordChunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/** The finish of one step: one output token per chunk, and no input tokens. */
function finishPart(reason: "stop" | "tool-calls", outputTokens: number): MockStreamPart {
  return {
    type: "finish",
    finishReason: { unified: reason, raw: undefined },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
    },
  };
}

export function buildStreamParts(chunks: readonly string[]): MockStreamPart[] {
  const id = "text-1";
  return [
    { type: "text-start", id },
    ...chunks.map((delta): MockStreamPart => ({ type: "text-delta", id, delta })),
    { type: "text-end", id },
    finishPart("stop", chunks.length),
  ];
}

/**
 * One tool call and the finish of its step. streamText runs the tool, when the call names one it
 * was given, and calls the model again with the result (template spec §5.2).
 */
export function buildToolCallParts(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
): MockStreamPart[] {
  return [
    { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
    finishPart("tool-calls", 1),
  ];
}

/**
 * Text deltas followed by a V4 `error` stream part. streamText turns that part
 * into a UI `error` chunk (errorText from the route's onError). A stream that
 * throws instead (controller.error) would abort the HTTP body with no `error`
 * chunk, so the mock uses the stream part.
 */
export function buildErrorStreamParts(chunks: readonly string[]): MockStreamPart[] {
  const id = "text-1";
  return [
    { type: "text-start", id },
    ...chunks.map((delta): MockStreamPart => ({ type: "text-delta", id, delta })),
    { type: "error", error: new Error(MOCK_ERROR_MESSAGE) },
  ];
}

/** The stream of one mock step: words, a tool call, the slow lines or the failure. */
export function stepStreamParts(step: MockStep): MockStreamPart[] {
  switch (step.kind) {
    case "slow":
      return buildStreamParts(SLOW_CHUNKS);
    case "error":
      return buildErrorStreamParts(ERROR_CHUNKS);
    case "tool-call":
      return buildToolCallParts(step.toolCallId, step.toolName, step.input);
    case "text":
      return buildStreamParts(toWordChunks(step.text));
  }
}

/**
 * The mock that getModel() returns in mock mode: every doStream call takes its next step from the
 * prompt (template spec §5.2). Tests may pass a faster timing, and scenarios of their own instead
 * of the project's MOCK_SCENARIOS.
 */
export function createScenarioMockModel(
  timing: MockTiming = MOCK_SCENARIO_TIMING,
  scenarios: MockScenarios = MOCK_SCENARIOS,
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => ({
      stream: simulateReadableStream({
        chunks: stepStreamParts(mockStep(prompt, scenarios)),
        initialDelayInMs: timing.initialDelayInMs,
        chunkDelayInMs: timing.chunkDelayInMs,
      }),
    }),
  });
}

/**
 * A deterministic model for CI, local runs without a key, and tests. Without options (how
 * lib/ai/model.ts calls it) it takes a step per request from the prompt, so getModel() never
 * takes arguments (template spec §5.2). With options, every call streams the same fixed chunks.
 */
export function createMockModel(options?: MockModelOptions): MockLanguageModelV4 {
  if (options === undefined) return createScenarioMockModel();

  const {
    initialDelayInMs = 600,
    chunkDelayInMs = 30,
    chunks = toWordChunks(DEFAULT_MOCK_TEXT),
  } = options;

  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: buildStreamParts(chunks),
        initialDelayInMs,
        chunkDelayInMs,
      }),
    }),
  });
}
